import * as THREE from 'three';
import { BALL_RADIUS, HALF_LENGTH, PLAYER_HEIGHT, SIM_DT } from '../sim/constants';
import type { CallKind, Duel, DuelPlayer } from '../sim/duel';
import { predictBall } from '../sim/predict';
import { ballColor, type BallColor } from '../sim/pressure';
import { lerp, type Vec3 } from '../sim/vec3';
import { createCourt } from './court';
import { CHARACTERS, createCharacter, type CharacterRig } from './character';
import { loadModel, modelsEnabled } from './models';
import { bodyYawTarget, computePose, lowFamily, plansHighShot, STRIDE, swingSide, type SwingFamily } from './pose';

export interface DuelView {
  render(alpha: number, frameTime: number): void;
  /** Léger tremblement de caméra ; `strength` de 0 à 1. */
  shake(strength: number): void;
  /** Zone à viser, dessinée au sol (tutoriel), ou `null` pour l'effacer. */
  setTarget(zone: { x0: number; x1: number; z0: number; z1: number } | null): void;
}

/** Anneau de timing : couleur de la balle à venir (`pressure.ts`). */
const BALL_COLORS: Record<BallColor, number> = { verte: 0x46d160, jaune: 0xffd23f, rouge: 0xff4436 };

/** Couleurs d'équipe vives, lisibles de loin (GAME_DESIGN.md §9). */
export const TEAM_COLORS = [0x2f8cff, 0xff4f5e] as const;
/** En double, le partenaire (joueurs 2 et 3) porte une teinte plus claire de la couleur de son équipe. */
export const PARTNER_COLORS = [0x8fc3ff, 0xff9ea8] as const;
/** Durée d'affichage d'une annonce entre partenaires (s), et son texte. */
const CALL_TIME = 1;
const CALL_TEXT: Record<CallKind, string> = { mia: '¡Mía!', tuya: '¡Tuya!' };

/**
 * Caméra de retransmission télé, derrière le joueur du camp Z négatif (GAME_DESIGN.md §8) : téléobjectif
 * placé haut et loin, qui aplatit la perspective (le joueur du fond reste grand) et cadre tout le
 * terrain, vitres du fond comprises. Valeurs relevées sur des images du Premier Padel (Milan 2026) :
 * ligne de fond proche sur ~76 % de la largeur d'une image 16:9, ligne de fond lointaine sur ~40 %.
 */
const CAMERA_HEIGHT = 8.7;
const CAMERA_BACK = HALF_LENGTH + 20;
const CAMERA_LOOK_Z = -0.4;
/** Champ vertical (°) pour un écran 16:9 ; plus étroit, l'écran élargit le champ pour garder toute la largeur. */
const CAMERA_FOV = 20;
const CAMERA_ASPECT = 16 / 9;
/**
 * Comme dans Virtua Tennis ou Top Spin, la balle garde une taille lisible de loin : à sa vraie taille
 * (6,5 cm) tant qu'elle paraît assez grosse, sinon agrandie pour couvrir au moins cette part de la
 * hauteur de l'écran. Près du joueur proche, elle reste à l'échelle de la raquette. [à calibrer]
 */
const BALL_MIN_SCREEN = 0.009;
/** Au-delà de cette vitesse (m/s), une traînée suit la balle, longue de sa course pendant `TRAIL_TIME` (s). */
const TRAIL_SPEED = 12;
const TRAIL_TIME = 0.04;
/** Rayon (m) du disque de l'ombre de balle, sans l'anneau blanc ; plus large que la balle pour se lire de loin. [à calibrer] */
const SHADOW_RADIUS = 0.1;
/** Part du déplacement latéral du joueur suivie par la caméra, et lissage (1/s) : à peine, comme à la télé. */
const CAMERA_FOLLOW = 0.15;
const CAMERA_SMOOTHING = 4;
/** Lissage (1/s) de la rotation du corps quand il se tourne pour courir. */
const BODY_TURN = 10;

/**
 * Côté caméra, tout ce qui dépasse la hauteur des vitres près du fond (grillage, montants) est
 * coupé à l'affichage : vu de derrière, il barrerait la moitié du terrain du joueur proche.
 * Les vitres restent, la balle qui rebondit dessus aussi. [à calibrer]
 */
const NEAR_CLIP_Z = -(HALF_LENGTH - 2.1);
const NEAR_CLIP_Y = 3.02;
const NEAR_CLIP_PLANES = [
  // Avec `clipIntersection`, seul ce qui est du côté coupé des deux plans disparaît : z < -7,9 et y > 3.
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -NEAR_CLIP_Z),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), NEAR_CLIP_Y),
];

function clipNearWall(court: THREE.Object3D): void {
  court.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.clippingPlanes = NEAR_CLIP_PLANES;
      material.clipIntersection = true;
    }
  });
}

interface PlayerView {
  object: THREE.Group;
  /** Personnage cartoon et son état d'animation, propre au rendu. */
  rig: CharacterRig;
  anim: { yaw: number; stride: number; side: 'fore' | 'back'; high: boolean; volley: boolean; last: { x: number; z: number } | null };
  /**
   * Anneau au sol, visible tant que le coup est préparé : il se resserre jusqu'au moment d'impact,
   * où il atteint la taille du joueur. C'est le repère pour relâcher (GAME_DESIGN.md §4).
   */
  timingRing: THREE.Mesh;
  timingMaterial: THREE.MeshBasicMaterial;
  /** Point où la course assistée emmène le joueur. */
  standMarker: THREE.Mesh;
  color: number;
  /** Bulle d'annonce au-dessus de la tête (« ¡Mía! »), et l'annonce qu'elle affiche. */
  bubble: THREE.Sprite;
  bubbleKind: CallKind | null;
}

/** Bulle d'annonce : texte blanc sur fond sombre, dessinée dans une texture, toujours face à la caméra. */
function createBubble(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

function drawBubble(sprite: THREE.Sprite, text: string, color: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,16,24,0.82)';
    g.beginPath();
    g.roundRect(8, 8, 240, 64, 22);
    g.fill();
    g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.lineWidth = 6;
    g.stroke();
    g.beginPath();
    g.moveTo(112, 72);
    g.lineTo(128, 92);
    g.lineTo(144, 72);
    g.fillStyle = 'rgba(10,16,24,0.82)';
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 41);
  }
  const material = sprite.material;
  material.map?.dispose();
  material.map = new THREE.CanvasTexture(canvas);
  material.needsUpdate = true;
}

/** L'anneau commence à se resserrer ce temps avant l'impact (s). */
const RING_LEAD = 0.6;

function createPlayerView(color: number, index: number, height: number): PlayerView {
  const object = new THREE.Group();
  const rig = createCharacter(CHARACTERS[index % CHARACTERS.length]!, color, height);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;

  const timingMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const timingRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), timingMaterial);
  timingRing.rotation.x = -Math.PI / 2;
  timingRing.position.y = 0.012;

  object.add(rig.object, shadow, timingRing);

  const standMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  standMarker.rotation.x = -Math.PI / 2;
  const bubble = createBubble();
  const anim: PlayerView['anim'] = { yaw: 0, stride: 0, side: 'fore', high: false, volley: false, last: null };
  return { object, rig, anim, timingRing, timingMaterial, standMarker, color, bubble, bubbleKind: null };
}

/** Agrandissement à appliquer à un objet de diamètre `size` à cette position pour le voir à `BALL_MIN_SCREEN`. */
function minScreenScale(camera: THREE.PerspectiveCamera, x: number, y: number, z: number, size: number): number {
  const distance = camera.position.distanceTo(new THREE.Vector3(x, y, z));
  const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(1, (BALL_MIN_SCREEN * visibleHeight) / size);
}

/** Balle, ombre bien marquée, trait de hauteur et traînée : les repères de profondeur et de vitesse vus de loin. */
function createBallView(): {
  object: THREE.Group;
  update(pos: Vec3 | null, vel: Vec3 | null, camera: THREE.PerspectiveCamera): void;
  setModel(model: THREE.Object3D): void;
} {
  const object = new THREE.Group();
  const sphere = new THREE.Group();
  const simple = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xe4ff3a, emissive: 0x3a4a00 }),
  );
  sphere.add(simple);
  // Ombre façon Rocket League : disque sombre cerclé de blanc, à l'aplomb exact de la balle. Dessinée
  // par-dessus tout, pour rester visible quand la balle passe au-dessus du joueur (son corps la cacherait).
  const shadow = new THREE.Group();
  const shadowLook = { transparent: true, depthWrite: false, depthTest: false };
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_RADIUS, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.55, ...shadowLook }),
  );
  const shadowRing = new THREE.Mesh(
    new THREE.RingGeometry(SHADOW_RADIUS, SHADOW_RADIUS * 1.35, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.9, ...shadowLook }),
  );
  shadowDisc.renderOrder = shadowRing.renderOrder = 10;
  shadow.add(shadowDisc, shadowRing);
  shadow.rotation.x = -Math.PI / 2;
  const heightLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  // Traînée : cône allongé derrière la balle, de son diamètre à rien.
  const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xf4ffb0, transparent: true, opacity: 0.4, depthWrite: false });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(BALL_RADIUS, 1, 12, 1, true), trailMaterial);
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  object.add(sphere, shadow, heightLine, trail);
  return {
    object,
    setModel(model: THREE.Object3D): void {
      sphere.remove(simple);
      sphere.add(model);
    },
    update(pos: Vec3 | null, vel: Vec3 | null, camera: THREE.PerspectiveCamera): void {
      object.visible = pos !== null;
      if (!pos) return;
      sphere.position.set(pos.x, pos.y, pos.z);
      const scale = minScreenScale(camera, pos.x, pos.y, pos.z, 2 * BALL_RADIUS);
      sphere.scale.setScalar(scale);
      // Taille constante quelle que soit la hauteur : c'est sa position qui compte, pas son flou.
      const s = minScreenScale(camera, pos.x, 0, pos.z, 2 * SHADOW_RADIUS);
      shadow.scale.set(s, s, s);
      shadow.position.set(pos.x, 0.009, pos.z);
      const height = Math.max(0.001, pos.y);
      heightLine.scale.set(1, height, 1);
      heightLine.position.set(pos.x, height / 2, pos.z);

      const speed = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0;
      trail.visible = vel !== null && speed > TRAIL_SPEED;
      if (!vel || !trail.visible) return;
      // La pointe du cône (+Y) part vers l'arrière de la trajectoire.
      direction.set(-vel.x, -vel.y, -vel.z).divideScalar(speed);
      trail.quaternion.setFromUnitVectors(up, direction);
      const length = speed * TRAIL_TIME;
      trail.scale.set(scale, length, scale);
      trail.position.set(pos.x, pos.y, pos.z).addScaledVector(direction, length / 2);
      trailMaterial.opacity = 0.4 * Math.min(1, (speed - TRAIL_SPEED) / 8);
    },
  };
}

export function createDuelView(canvas: HTMLCanvasElement, duel: Duel): DuelView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4450, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, -4);
  scene.add(sun);

  const court = createCourt();
  scene.add(court.object);
  clipNearWall(court.object);
  const ball = createBallView();
  scene.add(ball.object);
  /** Un joueur dessiné par joueur simulé : créés au besoin (le format peut passer du simple au double). */
  const players: PlayerView[] = [];
  const syncPlayers = (): void => {
    while (players.length < duel.players.length) {
      const i = players.length;
      const view = createPlayerView(i < 2 ? TEAM_COLORS[i]! : PARTNER_COLORS[i - 2]!, i, duel.players[i]!.height);
      scene.add(view.object, view.standMarker, view.bubble);
      players.push(view);
    }
    players.forEach((view, i) => {
      const active = i < duel.players.length;
      view.object.visible = active;
      if (!active) view.standMarker.visible = view.bubble.visible = false;
    });
  };
  syncPlayers();
  // Point de rebond prévu : repère orange au sol.
  const bounceMaterial = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.85, depthWrite: false });
  const bounceMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), bounceMaterial);
  bounceMarker.rotation.x = -Math.PI / 2;
  scene.add(bounceMarker);
  // Zone cible du tutoriel : rectangle translucide au sol.
  const targetZone = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  targetZone.rotation.x = -Math.PI / 2;
  targetZone.visible = false;
  scene.add(targetZone);

  canvas.dataset.models = 'pending';
  if (modelsEnabled()) {
    void Promise.all([loadModel('court'), loadModel('ball')]).then(([courtModel, ballModel]) => {
      if (courtModel) {
        court.setModel(courtModel, false);
        clipNearWall(court.object);
      }
      if (ballModel) ball.setModel(ballModel);
      canvas.dataset.models = courtModel && ballModel ? 'loaded' : 'partial';
    });
  } else {
    canvas.dataset.models = 'off';
  }

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  /**
   * `?camera=proche` : de trois quarts face, côté coup droit, près du joueur 1 ; `?camera=dos` : derrière lui.
   * Pour juger les poses du personnage.
   */
  const closeCamera = new URLSearchParams(location.search).get('camera');
  let cameraX = 0;
  let shake = 0;
  let shakeTime = 0;

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const fovFactor = Math.max(1, CAMERA_ASPECT / camera.aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * fovFactor));
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  /**
   * Pose du personnage, lue dans l'état de la simulation sans le modifier : préparation (de l'appui au
   * relâcher), frappe (l'image d'impact tombe sur le pas du contact, `lastHitTick`), course et attente.
   */
  const animate = (view: PlayerView, player: DuelPlayer, pos: Vec3, alpha: number, frameTime: number): void => {
    const f = player.side < 0 ? 1 : -1;
    const scale = player.height / PLAYER_HEIGHT;
    const now = duel.tick + alpha;
    const localX = (p: Vec3): number => (p.x - pos.x) * f;

    // Coup préparé : l'armé grandit avec le temps de préparation ; le côté suit la balle attendue.
    const engagement = player.engagement;
    const isServer = duel.players[duel.server] === player;
    const toss = duel.phase === 'toss' && isServer ? duel.toss : null;
    let prep: { family: SwingFamily; seconds: number } | null = null;
    if (toss && toss.releaseTick === null) {
      prep = { family: 'serve', seconds: (now - duel.phaseTick) * SIM_DT };
    } else if (engagement && engagement.releaseTick === null) {
      const target = engagement.plan?.contact ?? duel.ball?.pos ?? null;
      if (target) view.anim.side = swingSide(localX(target), view.anim.side);
      view.anim.high = plansHighShot(duel, player, engagement);
      view.anim.volley = engagement.plan?.volley ?? false;
      const family = view.anim.high ? 'overhead' : lowFamily(view.anim.side, view.anim.volley);
      prep = { family, seconds: (now - engagement.pressTick) * SIM_DT };
    }

    // Dernière frappe, ou coup dans le vide.
    const whiffed = player.lastWhiffTick > player.lastHitTick;
    const strikeTick = whiffed ? player.lastWhiffTick : player.lastHitTick;
    let strike: { family: SwingFamily; seconds: number } | null = null;
    if (Number.isFinite(strikeTick)) {
      const hit = whiffed ? null : player.lastHit;
      const kind = whiffed ? player.lastWhiffKind : hit?.kind;
      if (hit && !hit.serve && kind !== 'overhead') view.anim.side = swingSide(localX(hit.contact), view.anim.side);
      // Le coup joué dit la famille ; un coup dans le vide garde celle de sa préparation (au stick, la commande
      // est toujours celle d'un coup haut : c'est la hauteur de la balle qui décide).
      const high = hit ? kind === 'overhead' : view.anim.high;
      const volley = hit ? hit.volley : view.anim.volley;
      const family: SwingFamily = hit?.serve ? 'serve' : high ? 'overhead' : lowFamily(view.anim.side, volley);
      strike = { family, seconds: (now - strikeTick) * SIM_DT };
    }

    // Course : vitesse et direction dans le repère du filet ; la foulée avance avec la distance parcourue.
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const heading = Math.atan2(player.vel.x * f, player.vel.z * f);
    const last = view.anim.last;
    if (last) view.anim.stride += (Math.hypot(pos.x - last.x, pos.z - last.z) / (STRIDE * scale)) * Math.PI * 2;
    view.anim.last = { x: pos.x, z: pos.z };
    const striking = prep !== null || (strike !== null && strike.seconds < 0.5);
    const yawTarget = bodyYawTarget(speed, heading, striking);
    view.anim.yaw += (yawTarget - view.anim.yaw) * (1 - Math.exp(-BODY_TURN * frameTime));

    view.rig.apply(
      computePose({
        inPlay: duel.phase !== 'dead' && duel.phase !== 'over',
        prep,
        strike,
        speed,
        heading,
        bodyYaw: view.anim.yaw,
        stride: view.anim.stride,
        time: now * SIM_DT,
      }),
    );
  };

  const updatePlayer = (view: PlayerView, player: DuelPlayer, index: number, alpha: number, frameTime: number): void => {
    const pos = lerp(player.prevPos, player.pos, alpha);
    view.object.position.set(pos.x, 0, pos.z);
    // Annonce entre partenaires, au-dessus de la tête pendant un court instant.
    const call = player.call && (duel.tick - player.call.tick) * SIM_DT < CALL_TIME ? player.call.kind : null;
    view.bubble.visible = call !== null;
    if (call) {
      if (view.bubbleKind !== call) {
        drawBubble(view.bubble, CALL_TEXT[call], view.color);
        view.bubbleKind = call;
      }
      // Taille lisible de loin comme la balle : le joueur du fond garde une bulle de même taille à l'écran.
      const scale = Math.max(0.9, minScreenScale(camera, pos.x, 2.4, pos.z, 1) * 0.045);
      view.bubble.scale.set(scale * 2.67, scale, 1);
      view.bubble.position.set(pos.x, 2.15 + scale * 0.5, pos.z);
    }
    // Face au filet ; le repère du joueur a +Z vers le filet et sa droite vers -X.
    view.object.rotation.y = player.side < 0 ? 0 : Math.PI;
    animate(view, player, pos, alpha, frameTime);

    // Coup préparé, bouton maintenu : en échange, ou balle lâchée au service.
    const engagement = player.engagement;
    const toss = duel.phase === 'toss' && duel.players[duel.server] === player ? duel.toss : null;
    const plan = engagement && !engagement.manual ? engagement.plan : null;
    const preparing = toss ? toss.releaseTick === null : engagement !== null && engagement.releaseTick === null;
    // Moment d'impact : sommet du rebond au service, point prévu par la course assistée en échange ; coup
    // haut : la balle à hauteur des yeux, ou plus haut, plus tôt, stick vers l'avant (remate).
    const overheadTick = plan && engagement?.kind === 'overhead' ? duel.overheadReleaseTick(index) : null;
    const impactTick = toss ? toss.idealTick : (overheadTick ?? plan?.tick ?? null);
    view.timingRing.visible = preparing;
    if (preparing) {
      const r = duel.profile.rally;
      // Temps restant avant l'impact ; sans point prévu (placement manuel), l'anneau reste à mi-chemin.
      const remaining = impactTick !== null ? (impactTick - duel.tick - alpha) * SIM_DT : RING_LEAD / 2;
      view.timingRing.scale.setScalar(1 + Math.min(1, Math.max(0, remaining / RING_LEAD)) * 1.2);
      // Couleur de la balle à venir (verte, jaune, rouge) ; sous pression, la sous-fenêtre parfaite rétrécit.
      const pressure = toss || r.pressure.scale === 0 ? null : duel.plannedPressure(index);
      const shrink = 1 - r.pressure.windowShrink * r.pressure.scale * (pressure ?? 0);
      const inPerfect = impactTick !== null && remaining <= r.perfectBefore * shrink && remaining >= -r.perfectAfter * shrink;
      view.timingMaterial.opacity = inPerfect ? 1 : 0.6;
      view.timingMaterial.color.set(inPerfect ? 0xffffff : pressure === null ? view.color : BALL_COLORS[ballColor(pressure)]);
    }
    // En placement manuel, pas de point d'arrivée : le joueur se place lui-même.
    const stand = plan?.stand;
    view.standMarker.visible = stand !== undefined;
    if (stand) view.standMarker.position.set(stand.x, 0.011, stand.z);
  };

  return {
    shake(strength: number): void {
      shake = Math.max(shake, strength);
    },

    setTarget(zone): void {
      targetZone.visible = zone !== null;
      if (!zone) return;
      targetZone.scale.set(zone.x1 - zone.x0, zone.z1 - zone.z0, 1);
      targetZone.position.set((zone.x0 + zone.x1) / 2, 0.009, (zone.z0 + zone.z1) / 2);
    },

    render(alpha: number, frameTime: number): void {
      syncPlayers();
      const near = duel.players[0];
      // Caméra partagée : elle suit à peine l'équipe proche (en double, le milieu de la paire bleue).
      const nearTeam = duel.players.filter((p) => p.side < 0);
      const nearX = nearTeam.reduce((sum, p) => sum + lerp(p.prevPos, p.pos, alpha).x, 0) / nearTeam.length;
      cameraX += (nearX * CAMERA_FOLLOW - cameraX) * (1 - Math.exp(-CAMERA_SMOOTHING * frameTime));
      shake *= Math.exp(-10 * frameTime);
      shakeTime += frameTime;
      const jitter = shake * 0.06 * Math.sin(shakeTime * 70);
      camera.position.set(cameraX + jitter, CAMERA_HEIGHT + jitter * 0.5, -CAMERA_BACK);
      camera.lookAt(cameraX * 0.6, 0, CAMERA_LOOK_Z);
      if (closeCamera === 'proche' || closeCamera === 'dos') {
        const p = lerp(near.prevPos, near.pos, alpha);
        if (closeCamera === 'dos') camera.position.set(p.x + 0.6, 1.7, p.z - 4.2);
        else camera.position.set(p.x - 3.4, 1.5, p.z + 2.6);
        camera.lookAt(p.x, 1.0, p.z);
        if (camera.fov !== 40) {
          camera.fov = 40;
          camera.updateProjectionMatrix();
        }
      }

      duel.players.forEach((player, i) => updatePlayer(players[i]!, player, i, alpha, frameTime));

      const { ball: simBall, prevBallPos } = duel;
      let pos: Vec3 | null = null;
      if (simBall && prevBallPos) pos = lerp(prevBallPos, simBall.pos, alpha);
      else if (duel.phase === 'serve') pos = duel.servePosition();
      ball.update(pos, simBall && prevBallPos ? simBall.vel : null, camera);

      bounceMarker.visible = false;
      if (simBall && duel.phase === 'rally') {
        const { bounce } = predictBall(simBall, duel.profile, 3, 64);
        if (bounce) {
          bounceMarker.position.set(bounce.x, 0.01, bounce.z);
          bounceMarker.visible = true;
          // Coup haut en préparation : on frappe la balle avant son rebond, le repère s'efface devant l'ombre.
          bounceMaterial.opacity = near.engagement?.kind === 'overhead' ? 0.25 : 0.85;
        }
      }
      renderer.render(scene, camera);
    },
  };
}
