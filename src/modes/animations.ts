import * as THREE from 'three';
import { CHARACTERS, createCharacter, SWEET_SPOT, type CharacterRig } from '../render/character';
import { createCourt } from '../render/court';
import { PARTNER_COLORS, TEAM_COLORS } from '../render/duelScene';
import { bodyYawTarget, computePose, FOLLOW_TIME, RECOVER_TIME, strikeReach, STRIDE, SWING_FAMILIES, SWING_IN, type SwingFamily } from '../render/pose';
import { createPadTest } from '../ui/padTest';
import { createPauseMenu } from '../ui/pauseMenu';
import { loadSettings, saveSettings } from '../ui/settingsStore';

/**
 * Visionneur d'animations (`?mode=animations`) : un personnage seul, qui joue en boucle le geste choisi, sans
 * simulation. Pour juger et régler les poses de `src/render/pose.ts` sans avoir à jouer.
 * Paramètres d'URL (pour garder un lien) : `&coup=voleeFore`, `&vue=cote`, `&vitesse=0.25`, `&prep=0.3`, `&perso=2`,
 * `&contact=basse` (balle à frapper ailleurs que là où la pose met le tamis : l'IK du bras la rejoint).
 */

/** Noms affichés ; une famille ajoutée dans `pose.ts` sans nom ici apparaît sous son nom de code. */
const FAMILY_NAMES: Partial<Record<SwingFamily, string>> = {
  fore: 'Coup droit',
  back: 'Revers',
  voleeFore: 'Volée coup droit',
  voleeBack: 'Volée revers',
  bandeja: 'Bandeja / víbora',
  overhead: 'Smash',
  serve: 'Service',
};

type Motion = 'attente' | 'repos' | 'course' | 'chasse' | 'recul';
const MOTIONS: Record<Motion, { name: string; speed: number; heading: number }> = {
  attente: { name: 'Attente (échange)', speed: 0, heading: 0 },
  repos: { name: 'Repos (entre les points)', speed: 0, heading: 0 },
  course: { name: 'Course vers le filet', speed: 5, heading: 0 },
  chasse: { name: 'Pas chassés', speed: 1.5, heading: Math.PI / 2 },
  recul: { name: 'Course de côté', speed: 5, heading: Math.PI / 2 },
};

/** Angles de vue autour du joueur (rad, 0 = de face, depuis le filet ; π/2 = côté coup droit). */
const VIEWS = { face: 0, troisQuarts: -Math.PI / 4, cote: -Math.PI / 2, dos: Math.PI } as const;
type View = keyof typeof VIEWS;
const VIEW_NAMES: Record<View, string> = { face: 'Face', troisQuarts: '3/4 face', cote: 'Côté', dos: 'Dos' };

/**
 * Balle à frapper, par rapport au centre du tamis à l'image d'impact (repère du joueur, m) : `pose` la met où la pose
 * l'attend ; les autres montrent l'IK du bras (et des jambes) qui va la chercher. `aucune` : la pose seule.
 */
const CONTACTS = {
  aucune: null,
  pose: [0, 0, 0],
  basse: [0, -0.4, 0.1],
  haute: [0, 0.3, 0],
  loin: [-0.35, 0, 0.1],
  tresLoin: [-0.7, -0.1, 0.2],
  devant: [0, 0, 0.35],
} as const;
type Contact = keyof typeof CONTACTS;
const CONTACT_NAMES: Record<Contact, string> = { aucune: 'Aucune (pose seule)', pose: 'Là où est la pose', basse: 'Plus basse', haute: 'Plus haute', loin: 'Plus loin du corps', tresLoin: 'Très loin (volée en extension)', devant: 'Plus devant' };

/** Boucle d'un coup : préparation, frappe (fin du geste puis retour), puis un temps en attente avant de recommencer (s). */
const HOLD = 0.5;

const STILL = { inPlay: true, prep: null, strike: null, speed: 0, heading: 0, bodyYaw: 0, stride: 0, time: 0 };

export function startAnimations(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4450, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, -4);
  scene.add(sun);
  scene.add(createCourt().object);

  // Le joueur dans son camp, face au filet (+Z), comme le joueur proche du match ; assez loin de la vitre pour la vue de dos.
  const spot = new THREE.Vector3(0, 0, -4);
  const holder = new THREE.Group();
  holder.position.copy(spot);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  holder.add(shadow);
  scene.add(holder);
  let rig: CharacterRig | null = null;
  const setCharacter = (index: number): void => {
    if (rig) holder.remove(rig.object);
    const color = index < 2 ? TEAM_COLORS[index]! : PARTNER_COLORS[index - 2]!;
    rig = createCharacter(CHARACTERS[index]!, color);
    holder.add(rig.object);
  };

  // Champ assez haut pour le smash : saut et bras tendu, la raquette monte vers 3 m.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const resize = (): void => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // État du visionneur.
  const familyParam = params.get('coup');
  const motionParam = params.get('mouvement') as Motion | null;
  const state = {
    clip: (familyParam && (SWING_FAMILIES as string[]).includes(familyParam)
      ? { kind: 'swing', family: familyParam as SwingFamily }
      : { kind: 'motion', motion: motionParam && motionParam in MOTIONS ? motionParam : 'attente' }) as
      | { kind: 'swing'; family: SwingFamily }
      | { kind: 'motion'; motion: Motion },
    angle: VIEWS[(params.get('vue') as View) ?? 'troisQuarts'] ?? VIEWS.troisQuarts,
    speed: Number(params.get('vitesse') ?? 1) || 1,
    prep: Number(params.get('prep') ?? 0.6) || 0.6,
    time: 0,
    playing: true,
    character: Math.min(3, Math.max(0, Number(params.get('perso') ?? 0) || 0)),
    stride: 0,
    yaw: 0,
    contact: (params.get('contact') as Contact | null) ?? 'pose',
  };
  if (!(state.contact in CONTACTS)) state.contact = 'pose';

  // Balle à frapper (IK) : visible pendant le geste, au point que le tamis doit rejoindre.
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe6ff3a }));
  ballMesh.visible = false;
  scene.add(ballMesh);
  const contactPoint = new THREE.Vector3();
  setCharacter(state.character);

  const clipLength = (): number =>
    state.clip.kind === 'swing' ? state.prep + SWING_IN + FOLLOW_TIME + RECOVER_TIME + HOLD : 2;
  /** Phase affichée à l'instant `t` d'un coup. */
  const phaseAt = (t: number): string => {
    if (t < state.prep) return 'Préparation';
    const s = t - state.prep;
    if (s < SWING_IN + 0.02) return 'Impact';
    if (s < SWING_IN + FOLLOW_TIME) return 'Fin du geste';
    if (s < SWING_IN + FOLLOW_TIME + RECOVER_TIME) return 'Retour en attente';
    return 'Attente';
  };

  // --- Interface -------------------------------------------------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'anim-panel';
  panel.style.cssText =
    'position:fixed;top:12px;left:12px;width:240px;max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;' +
    'padding:12px 14px;border-radius:10px;background:rgba(10,16,22,0.85);color:#f2f5f7;font:13px/1.4 system-ui,sans-serif';
  const heading = (text: string): HTMLElement => {
    const h = document.createElement('div');
    h.textContent = text;
    h.style.cssText = 'margin:10px 0 5px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9fb0bf';
    return h;
  };
  const buttons: { el: HTMLButtonElement; active: () => boolean }[] = [];
  const button = (label: string, onClick: () => void, active: () => boolean, testId?: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    if (testId) b.dataset.anim = testId;
    b.style.cssText =
      'display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:6px;border:1px solid #3a4a5a;' +
      'background:#1d2a36;color:#f2f5f7;font:inherit;cursor:pointer';
    b.addEventListener('click', () => {
      onClick();
      refresh();
    });
    buttons.push({ el: b, active });
    return b;
  };
  const refresh = (): void => {
    for (const { el, active } of buttons) {
      el.style.background = active() ? '#2f8cff' : '#1d2a36';
      el.style.borderColor = active() ? '#2f8cff' : '#3a4a5a';
    }
    play.textContent = state.playing ? '⏸ Pause' : '▶ Lecture';
  };

  const title = document.createElement('div');
  title.textContent = 'Animations';
  title.style.cssText = 'font-size:15px;font-weight:700';
  panel.append(title, heading('Coups'));
  for (const family of SWING_FAMILIES) {
    const b = button(
      FAMILY_NAMES[family] ?? family,
      () => {
        state.clip = { kind: 'swing', family };
        state.time = 0;
      },
      () => state.clip.kind === 'swing' && state.clip.family === family,
      family,
    );
    b.style.display = 'block';
    panel.append(b);
  }
  panel.append(heading('Déplacements'));
  for (const motion of Object.keys(MOTIONS) as Motion[]) {
    const b = button(
      MOTIONS[motion].name,
      () => {
        state.clip = { kind: 'motion', motion };
        state.time = 0;
      },
      () => state.clip.kind === 'motion' && state.clip.motion === motion,
      motion,
    );
    b.style.display = 'block';
    panel.append(b);
  }
  panel.append(heading('Vue (ou glisser à la souris)'));
  for (const view of Object.keys(VIEWS) as View[]) {
    panel.append(button(VIEW_NAMES[view], () => (state.angle = VIEWS[view]), () => Math.abs(state.angle - VIEWS[view]) < 1e-6));
  }
  panel.append(heading('Vitesse'));
  for (const speed of [1, 0.5, 0.25, 0.1]) {
    panel.append(button(`×${speed}`, () => (state.speed = speed), () => state.speed === speed));
  }
  panel.append(heading('Temps de préparation'));
  for (const prep of [0.15, 0.3, 0.6]) {
    panel.append(
      button(
        `${prep} s`,
        () => {
          state.prep = prep;
          state.time = 0;
        },
        () => state.prep === prep,
      ),
    );
  }
  panel.append(heading('Balle à frapper (IK du bras)'));
  for (const contact of Object.keys(CONTACTS) as Contact[]) {
    const b = button(CONTACT_NAMES[contact], () => (state.contact = contact), () => state.contact === contact, `contact-${contact}`);
    b.style.display = 'block';
    panel.append(b);
  }
  panel.append(heading('Personnage'));
  CHARACTERS.forEach((look, i) =>
    panel.append(
      button(
        look.name,
        () => {
          state.character = i;
          setCharacter(i);
        },
        () => state.character === i,
      ),
    ),
  );
  panel.append(heading('Lecture'));
  const play = button('', () => (state.playing = !state.playing), () => false, 'play');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1000';
  slider.style.cssText = 'width:100%;margin-top:6px';
  slider.addEventListener('input', () => {
    state.playing = false;
    state.time = (Number(slider.value) / 1000) * clipLength();
    refresh();
  });
  const back = link('Retour à l’accueil', '/');
  panel.append(play, slider, back);
  document.body.append(panel);

  const settings = loadSettings(new URLSearchParams());
  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );
  // Pause (Échap, ou le bouton en haut à droite), la même qu'en match : « Recommencer » reprend le geste au début.
  const pause = createPauseMenu(settings, {
    online: false,
    onChange: (_, restart) => {
      if (restart) state.time = 0;
    },
    onTestPad: () => padTest.open(),
    onQuit: () => (location.search = ''),
    blocked: () => padTest.isOpen,
  });
  const paused = (): boolean => pause.isOpen || padTest.isOpen;

  // Nom de la phase en cours, en grand, en bas de l'écran.
  const phaseLabel = document.createElement('div');
  phaseLabel.id = 'anim-phase';
  phaseLabel.style.cssText =
    'position:fixed;left:50%;bottom:6%;transform:translateX(-50%);padding:8px 18px;border-radius:10px;' +
    'background:rgba(10,16,22,0.8);color:#fff;font:600 20px system-ui,sans-serif;pointer-events:none';
  document.body.append(phaseLabel);
  refresh();

  // Rotation à la souris.
  let drag: number | null = null;
  canvas.addEventListener('pointerdown', (e) => (drag = e.clientX));
  window.addEventListener('pointerup', () => (drag = null));
  window.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    state.angle -= (e.clientX - drag) * 0.01;
    drag = e.clientX;
    refresh();
  });

  const poseAt = (t: number, dt: number) => {
    const clip = state.clip;
    if (clip.kind === 'swing') {
      const striking = t >= state.prep;
      return computePose({
        inPlay: true,
        prep: striking ? null : { family: clip.family, seconds: t },
        strike: striking ? { family: clip.family, seconds: t - state.prep, from: { family: clip.family, seconds: state.prep } } : null,
        speed: 0,
        heading: 0,
        bodyYaw: 0,
        stride: 0,
        time: t,
      });
    }
    const m = MOTIONS[clip.motion];
    state.stride += ((m.speed * dt) / STRIDE) * Math.PI * 2;
    state.yaw += (bodyYawTarget(m.speed, m.heading, false) - state.yaw) * (1 - Math.exp(-10 * dt));
    return computePose({
      inPlay: clip.motion !== 'repos',
      prep: null,
      strike: null,
      speed: m.speed,
      heading: m.heading,
      bodyYaw: state.yaw,
      stride: state.stride,
      time: t,
    });
  };

  /** Pour les tests et le débogage : aller à un instant précis du geste en cours. */
  window.__anim = {
    seek(t: number): void {
      state.playing = false;
      state.time = t;
      refresh();
    },
    get phase(): string {
      return phaseLabel.textContent ?? '';
    },
  };

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const playing = state.playing && !paused();
    if (playing) state.time = (state.time + dt * state.speed) % clipLength();
    const t = state.time;
    const pose = poseAt(t, playing ? dt * state.speed : 0);
    const offset = state.clip.kind === 'swing' ? CONTACTS[state.contact] : null;
    ballMesh.visible = offset !== null && t >= state.prep - 0.15 && t < state.prep + SWING_IN + 0.15;
    if (rig && offset && state.clip.kind === 'swing') {
      // Centre du tamis à l'image d'impact, pose seule, plus le décalage choisi.
      rig.apply(computePose({ ...STILL, strike: { family: state.clip.family, seconds: SWING_IN } }));
      holder.updateMatrixWorld(true);
      rig.racketMount.localToWorld(contactPoint.set(0, SWEET_SPOT, 0));
      // Côté revers, « plus loin du corps » est à sa gauche.
      const side = /back/i.test(state.clip.family) ? -1 : 1;
      contactPoint.add(new THREE.Vector3(offset[0] * side, offset[1], offset[2]));
      ballMesh.position.copy(contactPoint);
    }
    const weight = offset && t >= state.prep ? strikeReach(t - state.prep) : 0;
    rig?.apply(pose, weight > 0 ? { target: contactPoint, weight } : null);
    slider.value = String(Math.round((t / clipLength()) * 1000));
    phaseLabel.textContent =
      state.clip.kind === 'swing'
        ? `${FAMILY_NAMES[state.clip.family] ?? state.clip.family} · ${phaseAt(t)} · ${t.toFixed(2)} s`
        : MOTIONS[state.clip.motion].name;

    // Assez près pour rester dans le terrain en vue de côté (le grillage masquerait le joueur).
    const distance = 4.4;
    camera.position.set(spot.x + Math.sin(state.angle) * distance, 1.6, spot.z + Math.cos(state.angle) * distance);
    camera.lookAt(spot.x, 1.3, spot.z);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.style.cssText = 'display:block;margin-top:10px;color:#8fc3ff';
  return a;
}
