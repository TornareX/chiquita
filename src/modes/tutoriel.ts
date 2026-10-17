import { createSounds } from '../audio/sounds';
import { buttonsEnabled, connectedGamepads, IDLE_PAD, mergePads, readGamepad, swingEnabled, toCommands, type PadState } from '../input/gamepad';
import { highFloorFromUrl, SwingStick } from '../input/swingStick';
import { createKeyboardPads } from '../input/keyboardArcade';
import { resolvePadFamily } from '../input/padStyle';
import { createDuelView } from '../render/duelScene';
import { Bot, DEFAULT_BOT } from '../sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind, type SwingEnd as GestureEnd } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { Duel } from '../sim/duel';
import { applyFeel } from '../sim/feel';
import { AttemptWatcher, LESSONS, type Lesson } from '../sim/lessons';
import { FixedStepLoop } from '../sim/loop';
import { loadKeyboardLayout, sourceKey, type InputSource } from '../ui/buttonIcons';
import { loadSettings, saveSettings } from '../ui/duelSettings';
import { loadFeel } from '../ui/feelStorage';
import { createInputDisplay } from '../ui/inputDisplay';
import { createPadTest } from '../ui/padTest';
import { createTutorialPanel, loadProgress, saveProgress } from '../ui/tutorialPanel';

/**
 * Étapes d'une leçon (TUTORIEL_PLAN.md §3) : la carte (quand, comment), une démo au ralenti jouée par
 * le démonstrateur avec ses boutons affichés, des essais guidés (ralenti léger, « appuie », « relâche »),
 * puis des essais seuls jusqu'à l'objectif. `list` : choix de la leçon ; `done` : leçon réussie.
 */
type Phase = 'list' | 'card' | 'demo' | 'guided' | 'solo' | 'done';

const SPEED: Partial<Record<Phase, number>> = { demo: 0.5, guided: 0.7, solo: 1 };
/** Réussites guidées avant de jouer seul ; échecs d'affilée avant de revoir la démo. */
const GUIDED_SUCCESSES = 2;
const FAILS_BEFORE_DEMO = 3;
/** Frappes parfaites pour la deuxième étoile. */
const PERFECTS_FOR_STAR = 3;
/** Temps de lecture du verdict, la balle continuant sa course, avant l'essai suivant (s de jeu). */
const VERDICT_TIME = 1.4;
/** « Relâche ! » s'affiche quand l'impact prévu est à moins de ce délai (s de jeu). */
const RELEASE_LEAD = 0.12;
/** Au stick droit, le geste prend un peu de temps (l'arc du lob surtout) : on prévient plus tôt (s). */
const SWING_LEAD = 0.18;
/** Démo au stick droit : chemin du stick à la fin du geste, chaque point tenu `DEMO_HOLD` pas. */
const DEMO_PATHS: Record<GestureEnd | 'flick', readonly [number, number][]> = {
  straight: [[0, -0.3], [0, 0.4], [0, 0.9]],
  arc: [[0.6, -0.8], [0.9, -0.3], [0.95, 0.2], [0.6, 0.75]],
  letGo: [[0, 0], [0, 0], [0, 0], [0, 0]],
  // Sans préparation : un coup sec vers l'avant depuis le centre.
  flick: [[0, 0.9], [0, 0.9], [0, 0]],
};
const DEMO_HOLD = 5;
/** Ce qu'il faut faire au moment de la frappe, au stick droit. */
const SWING_PROMPT: Record<GestureEnd | 'flick', string> = {
  straight: 'Tout droit !',
  arc: 'En arc, par un côté !',
  letGo: 'Lâche !',
  flick: 'Coup sec vers l’avant !',
};
const START_BUTTON = 9;

/**
 * Mode tutoriel (`?mode=tutoriel`) : une leçon par coup. Bleu est l'élève (manette 1 ou clavier) ;
 * Rouge envoie la balle de l'essai et ne joue pas ensuite. Progression (étoiles) mémorisée dans le navigateur.
 */
export function startTutorial(canvas: HTMLCanvasElement): void {
  const settings = loadSettings(new URLSearchParams(location.search));
  const duel = new Duel(null);
  duel.highFloor = highFloorFromUrl();
  const feel = loadFeel();
  if (feel.inMatch) applyFeel(duel.profile, feel.feel);
  duel.profile.rally.pressure.scale = settings.pressure;
  duel.players[0].assist = settings.assists[0];

  const view = createDuelView(canvas, duel);
  const keyboard = createKeyboardPads();
  const sounds = createSounds();
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sounds.unlock(), { once: true });
  window.addEventListener('gamepadconnected', () => sounds.unlock());
  /** Frappe au geste du stick droit, une par manette. */
  const swings = swingEnabled() ? ([new SwingStick(), new SwingStick()] as const) : null;
  const inputs = createInputDisplay(swings);
  let keyboardLayout: ReadonlyMap<string, string> | null = null;
  void loadKeyboardLayout().then((layout) => (keyboardLayout = layout));
  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );

  /** Leçons proposées : celles au stick droit, sauf avec `?boutons=1` (toutes). */
  const LIST: readonly Lesson[] = buttonsEnabled() ? LESSONS : LESSONS.filter((l) => l.stick);
  const progress = loadProgress();
  const params = new URLSearchParams(location.search);
  const first = LIST.findIndex((l) => l.id === params.get('lecon'));
  let selected = Math.max(0, first);
  let phase: Phase = 'list';
  let lesson: Lesson = LIST[selected]!;
  let attempt = 0;
  let successes = 0;
  let guidedSuccesses = 0;
  let failsInRow = 0;
  let perfects = 0;
  let watcher: AttemptWatcher | null = null;
  let demoBot: Bot | null = null;
  /** Pas où le verdict a été rendu : l'essai suivant part `VERDICT_TIME` plus tard. */
  let verdictTick: number | null = null;
  /** Phase où aller une fois le verdict lu (passage du guidé au seul, fin de leçon…). */
  let nextPhase: Phase | null = null;

  /** État du joueur au dernier pas, pour l'affichage ; manette ou clavier qu'il tient. */
  const states: [PadState | null, null] = [null, null];
  const buttons: [InputSource, null] = [{ kind: 'keyboard', player: 0 }, null];
  let lastSourceKey = '';

  /** `gesture` : fait avancer le geste du stick droit (une fois par pas de simulation, pas dans les menus). */
  const readPlayer = (gesture = true): PadState => {
    const pad = connectedGamepads()[0];
    buttons[0] = pad
      ? { kind: 'pad', family: resolvePadFamily(settings.padStyle, pad) }
      : { kind: 'keyboard', player: 0, layout: keyboardLayout };
    return mergePads(pad ? readGamepad(pad, gesture ? swings?.[0] : undefined, SIM_DT) : IDLE_PAD, keyboard.read(0));
  };

  const expected = (): ShotKind => lesson.demo(attempt).kind;
  /** Démo au stick droit : pas écoulés depuis que le démonstrateur a relâché, `null` tant qu'il prépare. */
  let demoSwingTick: number | null = null;
  const phaseName: Partial<Record<Phase, string>> = { demo: 'Démo', guided: 'Essai guidé', solo: 'À toi' };
  const updateStatus = (): void => {
    const name = phaseName[phase];
    if (!name) return panel.setStatus(null);
    const count = phase === 'solo' ? ` · ${successes}/${lesson.goal}` : phase === 'guided' ? ` · ${guidedSuccesses}/${GUIDED_SUCCESSES}` : '';
    panel.setStatus(`${lesson.title} · ${name}${count}`);
  };

  /** Lance l'essai en cours : la balle de Rouge part, le juge commence à regarder. */
  const startAttempt = (): void => {
    lesson.start(duel, attempt);
    watcher = new AttemptWatcher(duel);
    verdictTick = null;
    view.setTarget(lesson.target(attempt));
    demoSwingTick = null;
    demoBot =
      phase === 'demo'
        ? new Bot(0, 7, {
            ...DEFAULT_BOT,
            release: { offset: 0, spread: 0 },
            forced: lesson.demo(attempt),
          })
        : null;
    panel.setInstruction(
      phase === 'demo' ? `Regarde : ${lesson.instruction(attempt)} · {normal} pour passer la démo` : lesson.instruction(attempt),
      buttons[0],
    );
    panel.setPrompt(null, buttons[0]);
    updateStatus();
  };

  const enter = (next: Phase): void => {
    phase = next;
    nextPhase = null;
    watcher = demoBot = null;
    verdictTick = null;
    panel.setMessage(null, 'info', buttons[0]);
    panel.setPrompt(null, buttons[0]);
    if (next === 'list') {
      view.setTarget(null);
      panel.setInstruction(null, buttons[0]);
      panel.showList(LIST, progress, selected, buttons[0]);
    } else if (next === 'card') {
      panel.setInstruction(null, buttons[0]);
      panel.showCard(lesson, buttons[0]);
    } else if (next === 'done') {
      view.setTarget(null);
      panel.setInstruction(null, buttons[0]);
      const stars = perfects >= PERFECTS_FOR_STAR ? 2 : 1;
      progress[lesson.id] = Math.max(progress[lesson.id] ?? 0, stars);
      saveProgress(progress);
      panel.showDone(lesson, stars, perfects, selected < LIST.length - 1, buttons[0]);
    } else {
      panel.hideOverlay();
      startAttempt();
    }
    updateStatus();
  };

  const openLesson = (index: number): void => {
    selected = index;
    lesson = LIST[index]!;
    attempt = successes = guidedSuccesses = failsInRow = perfects = 0;
    enter('card');
  };

  const panel = createTutorialPanel({
    pick: openLesson,
    testPad: () => padTest.open(),
    confirm: () => confirm(),
    back: () => back(),
  });
  const confirm = (): void => {
    if (phase === 'list') openLesson(selected);
    else if (phase === 'card') enter('demo');
    else if (phase === 'demo') enter('guided');
    else if (phase === 'done') {
      if (selected < LIST.length - 1) openLesson(selected + 1);
      else enter('list');
    }
  };
  const back = (): void => {
    if (phase === 'list') location.search = '';
    else enter('list');
  };

  /** Verdict d'un essai : compte, message, et étape suivante. */
  const conclude = (success: boolean, message: string, perfect: boolean): void => {
    verdictTick = duel.tick;
    panel.setPrompt(null, buttons[0]);
    if (phase === 'demo') {
      panel.setMessage('À toi maintenant, avec de l’aide.', 'info', buttons[0]);
      nextPhase = 'guided';
      return;
    }
    panel.setMessage(message, success ? 'ok' : 'fail', buttons[0]);
    if (success) {
      failsInRow = 0;
      if (phase === 'guided') {
        guidedSuccesses++;
        if (guidedSuccesses >= GUIDED_SUCCESSES) nextPhase = 'solo';
      } else {
        successes++;
        if (perfect) perfects++;
        if (successes >= lesson.goal) nextPhase = 'done';
      }
    } else if (++failsInRow >= FAILS_BEFORE_DEMO) {
      failsInRow = 0;
      guidedSuccesses = 0;
      nextPhase = 'demo';
      panel.setMessage(`${message} On revoit la démo.`, 'fail', buttons[0]);
    }
    attempt++;
    updateStatus();
  };

  /** Indice du mode guidé : quand appuyer, quand relâcher. */
  const guide = (state: PadState): void => {
    if (phase !== 'guided' || verdictTick !== null) return panel.setPrompt(null, buttons[0]);
    const me = duel.players[0];
    const button = `{${expected()}}`;
    const plan = me.engagement?.plan;
    const stick = lesson.stick;
    if (stick) {
      const ball = duel.ball;
      const coming = duel.phase === 'rally' && duel.lastHitter === 1 && ball !== null;
      if (!stick.swing.prepared) {
        // Sans préparation : rien à faire avant ; on prévient juste avant que la balle n'arrive (au-dessus de la
        // tête : quand elle redescend à hauteur des yeux).
        let now = false;
        if (coming && stick.shot === 'bandeja') now = ball.vel.y < 0 && ball.pos.y <= me.height + 0.2;
        else if (coming && ball.vel.z < 0) now = (me.pos.z - ball.pos.z) / ball.vel.z <= SWING_LEAD + 0.05;
        panel.setPrompt(!coming ? null : now ? SWING_PROMPT.flick : 'Attends la balle…', buttons[0]);
        return;
      }
      if (me.engagement && plan) {
        // Coup haut : la balle en haut, bras tendu.
        const release = me.engagement.kind === 'overhead' ? (duel.overheadReleaseTick(0) ?? plan.tick) : plan.tick;
        const remaining = (release - duel.tick) * SIM_DT;
        panel.setPrompt(remaining <= SWING_LEAD ? SWING_PROMPT[stick.swing.end ?? 'straight'] : 'Garde le stick tiré…', buttons[0]);
      } else if (coming && !state.shot) panel.setPrompt('Tire le stick droit vers toi !', buttons[0]);
      else panel.setPrompt(null, buttons[0]);
      return;
    }
    if (me.engagement && plan) {
      // Coup haut (bandeja) : la balle qui redescend à hauteur des yeux.
      const release = expected() === 'overhead' ? (duel.overheadReleaseTick(0, false) ?? plan.tick) : plan.tick;
      const remaining = (release - duel.tick) * SIM_DT;
      panel.setPrompt(remaining <= RELEASE_LEAD ? 'Relâche !' : `Garde ${button} enfoncé…`, buttons[0]);
    } else if (duel.phase === 'rally' && duel.lastHitter === 1 && !state.shot) {
      panel.setPrompt(`Appuie sur ${button} !`, buttons[0]);
    } else panel.setPrompt(null, buttons[0]);
  };

  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    // Hors essai (carte, liste, fin de leçon) : plus rien ne bouge, même dans les pas restants de l'image.
    if (SPEED[phase] === undefined) return;
    // Pendant la démo, le stick droit du joueur ne joue pas : le guide montre le geste du démonstrateur.
    const state = readPlayer(!demoBot);
    let blue: ArcadeCommands = toCommands(state, true);
    if (demoBot && lesson.stick && swings) {
      const gesture = lesson.stick.swing;
      blue = { ...demoBot.commands(duel), swing: { ...gesture } };
      // Le guide dessine le geste équivalent : préparation tenue (ou rien sans préparation), puis la fin du geste.
      if (!blue.shot && demoSwingTick === null && duel.players[0].engagement) demoSwingTick = 0;
      const path = DEMO_PATHS[gesture.prepared ? (gesture.end ?? 'straight') : 'flick'];
      const step = demoSwingTick === null ? -1 : Math.floor(demoSwingTick++ / DEMO_HOLD);
      const hold: [number, number] = blue.shot && gesture.prepared ? [0, -1] : [0, 0];
      const [right, up] = step < 0 ? hold : (path[step] ?? (step < path.length + 12 ? path[path.length - 1]! : [0, 0]));
      swings[0].update(right, up, SIM_DT);
      states[0] = { stick: { up: 0, right: 0 }, shot: blue.shot, assistButton: false, swing: { right, up, shot: blue.shot } };
    } else if (demoBot) {
      blue = demoBot.commands(duel);
      // La démo montre les boutons du démonstrateur, comme s'il tenait la manette du joueur.
      states[0] = { stick: { up: blue.stick.forward, right: blue.stick.right }, shot: blue.shot, assistButton: false };
    } else states[0] = state;
    duel.step([blue, NEUTRAL_ARCADE]);
    inputs.step(duel, states);
    if (settings.sound) {
      for (const contact of duel.contacts) sounds.contact(contact);
      if (duel.shot) sounds.shot({ ...duel.shot, quality: duel.shot.perfect ? 1 : 0.7 });
    }
    if (duel.shot?.perfect && duel.shot.player === 0) {
      hitstopUntil = performance.now() + 40;
      view.shake(0.5);
    }
    if (watcher && verdictTick === null) {
      const outcome = watcher.step(duel, blue);
      if (outcome) {
        const verdict = lesson.judge(outcome, attempt, duel.profile);
        conclude(verdict.success, verdict.message, outcome.shot?.perfect ?? false);
      }
    }
    guide(state);
    if (verdictTick !== null && (duel.tick - verdictTick) * SIM_DT >= VERDICT_TIME) {
      if (nextPhase) enter(nextPhase);
      else {
        panel.setMessage(null, 'info', buttons[0]);
        startAttempt();
      }
    }
  });

  // Navigation dans les menus du tutoriel : stick haut/bas, bouton du coup normal pour valider,
  // Start ou Échap pour revenir. Un bouton tenu en entrant dans un écran ne compte pas.
  let previous: PadState = IDLE_PAD;
  let startHeld = false;
  const navigate = (): void => {
    const state = readPlayer(false);
    const pressed = (kind: ShotKind): boolean => (state.face ?? state.shot) === kind && (previous.face ?? previous.shot) !== kind;
    const start = connectedGamepads().some((p) => p.buttons[START_BUTTON]?.pressed ?? false);
    if (!padTest.isOpen) {
      if (start && !startHeld) back();
      else if (phase === 'list') {
        const step = (v: number): number => (v > 0.6 ? 1 : v < -0.6 ? -1 : 0);
        const move = step(state.stick.up);
        if (move !== 0 && move !== step(previous.stick.up)) {
          selected = (selected - move + LIST.length) % LIST.length;
          panel.showList(LIST, progress, selected, buttons[0]);
        } else if (pressed('normal')) confirm();
      } else if ((phase === 'card' || phase === 'done') && pressed('normal')) confirm();
      // Démo au ralenti : le bouton de validation la passe, direct aux essais guidés.
      else if (phase === 'demo' && pressed('normal')) confirm();
    }
    startHeld = start;
    previous = state;
    // Manette branchée ou changée : les écrans affichent ses symboles.
    const key = sourceKey(buttons[0]);
    if (key !== lastSourceKey) {
      lastSourceKey = key;
      if (phase === 'list') panel.showList(LIST, progress, selected, buttons[0]);
      else if (phase === 'card') panel.showCard(lesson, buttons[0]);
    }
  };
  window.addEventListener('keydown', (event) => {
    if (padTest.isOpen) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      back();
    } else if (event.code === 'Enter' && !event.repeat) confirm();
  });

  if (import.meta.env.DEV || params.has('debug')) {
    window.__duel = { duel, Bot };
    window.__tutorial = { get phase() { return phase; }, get successes() { return successes; }, get attempt() { return attempt; } };
  }

  // Lien direct vers une leçon : `?mode=tutoriel&lecon=bandeja`.
  if (first >= 0) openLesson(first);
  else enter('list');

  let last = performance.now();
  let alpha = 0;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    navigate();
    const speed = SPEED[phase];
    const paused = speed === undefined || padTest.isOpen;
    if (!paused && now >= hitstopUntil) alpha = loop.advance(frameTime * speed);
    view.render(alpha, frameTime);
    inputs.render(duel, states, buttons, settings.inputDisplay && !paused);
    updateStatus();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
