import { createAnnouncer } from '../audio/announcer';
import { shotPower, SqueakDetector, stepCrowdReactions, VOICES } from '../audio/recipes';
import { CrowdMood } from '../render/arena';
import { createSounds } from '../audio/sounds';
import { applySwing, connectedGamepads, IDLE_PAD, readGamepad, swingEnabled, toCommands, type PadState } from '../input/gamepad';
import { highFloorFromUrl, SwingStick } from '../input/swingStick';
import { createSwingJournal } from './swingJournal';
import { createKeyboardPads } from '../input/keyboardArcade';
import { TOUCH_SCREEN } from '../input/virtualStick';
import { resolvePadFamily } from '../input/padStyle';
import { createDuelView } from '../render/duelScene';
import { AI_LEVELS, Bot } from '../sim/bot';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { ASSIST_LEVELS, Duel } from '../sim/duel';
import { FixedStepLoop } from '../sim/loop';
import type { MatchRules } from '../sim/score';
import { loadKeyboardLayout, type InputSource } from '../ui/buttonIcons';
import { createDuelHud } from '../ui/duelHud';
import { createMatchReport } from '../ui/matchReport';
import { createPerfMeter } from '../ui/perfMeter';
import { createInputDisplay } from '../ui/inputDisplay';
import { createPadTest } from '../ui/padTest';
import { createPauseMenu } from '../ui/pauseMenu';
import {
  CONTROLLER_SHORT,
  isHuman,
  keyboardOf,
  loadSettings,
  padOf,
  saveSettings,
  type Device,
  type DuelSettings,
} from '../ui/duelSettings';
import { loadFeel } from '../ui/feelStorage';
import { applyFeel } from '../sim/feel';
import { hitstopMs, juiceFlags } from '../render/juice';
import { createReplayBadge, REPLAY_DELAY, ReplayRecorder, replayWorthy, type Replay } from './replay';
import { quantizeCommands } from '../net/codec';
import { NetMatch } from '../net/duelNet';
import { describeFakeNet, EventGate, fakeNetFromUrl, TICKS_PER_FRAME } from '../net/fakeNet';
import type { Connection } from '../net/connection';
import { OnlineClient } from '../net/onlineClient';
import { createMatchDuel, type MatchConfig } from '../net/protocol';
import type { RollbackHooks } from '../net/rollback';
import { createNetHud } from '../ui/netHud';
import { NEUTRAL_ARCADE } from '../sim/commands';
import type { Vec3 } from '../sim/vec3';

/** Match en ligne lancé depuis le salon (`src/modes/online.ts`). */
export interface OnlineStart {
  config: MatchConfig;
  /** Début du match en temps du serveur (ms), et places tenues par ce navigateur. */
  startAt: number;
  seats: number[];
  connection: Connection;
  /** Manette ou clavier qui joue la place de ce navigateur. */
  device: Device;
  /** Reprise après une coupure (page rechargée) : l'état du match envoyé par le serveur. */
  state?: Duel;
  /** Délai d'entrée et rollback au plus (pas). */
  inputDelay: number;
  maxRollback: number;
}

/** Bouton Start (Menu) de la disposition standard : ouvre et ferme les réglages. */
const START_BUTTON = 9;

/** Les sons ne jouent que si `audible()` ; le déblocage du son par le navigateur passe toujours. */
function muteable<T extends object>(sounds: T, audible: () => boolean): T {
  return new Proxy(sounds, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (key === 'unlock' || typeof value !== 'function') return value;
      return (...args: unknown[]) => (audible() ? (value as (...a: unknown[]) => unknown).apply(target, args) : undefined);
    },
  });
}

/**
 * Mode principal (GAME_DESIGN.md §12) : match en 1 contre 1 ou en 2 contre 2, une manette par joueur, au
 * clavier ou contre l'IA. Tout se règle dans le menu (Échap ou Start) : simple ou double, qui joue chaque place
 * (quelle manette, quel clavier ou quelle IA),
 * assistance, pression, son, règles du match. Les réglages sont mémorisés dans le navigateur. Raccourcis d'URL,
 * pour les tests :
 * - `?double=1` : 2 contre 2 (manettes 1 à 4 pour Bleu 1, Rouge 1, Bleu 2, Rouge 2) ;
 * - `?ai=facile|normal|fort` : l'IA joue Rouge (ou les joueurs donnés par `?bot=1|2|both|none`, ou `?bot=2,3,4`) ;
 * - `?sets=2`, `?games=4`, `?gold=1` (punto de oro), `?free=1` (échange libre sans score) ;
 * - `?pression=0` (sans), `0.5`, `1.5` ; `?far=own` ; `?assist=full|partial|off|magnet` ou `?assist=full,off`.
 * - `?gaucher=1,3` : places jouées par un gaucher (à partir de 1), les autres droitières.
 * - `?figer=4` : la simulation s'arrête net à 4 s de jeu, le rendu continue (banc d'essai du rendu, captures).
 * - `?reseau=120` : faux réseau (`src/net`), ping aller-retour en ms, avec `&gigue=20`, `&perte=5` (%), `&delai=2`
 *   (délai d'entrée, en images) et `&fenetre=150` (rollback au plus, ms). Les humains jouent sur la machine locale,
 *   les IA sur une autre, reliées par une fausse liaison ; chaque machine prédit et corrige (rollback). Pas de
 *   ralenti ni de micro-pause dans ce mode.
 *
 * `online` : match en ligne (`src/modes/online.ts`) ; la partie part de la configuration du serveur, identique chez
 * tous, et les réglages du menu ne la changent plus (seuls le son et l'affichage restent à soi).
 */
export function startDuel(canvas: HTMLCanvasElement, online: OnlineStart | null = null): void {
  const params = new URLSearchParams(location.search);
  const settings = loadSettings(params);
  const rulesOf = (s: DuelSettings): MatchRules | null =>
    s.match.free ? null : { setsToWin: s.match.setsToWin, gamesPerSet: s.match.gamesPerSet, goldenPoint: s.match.goldenPoint, fast: s.match.fast };
  const duel = online ? (online.state ?? createMatchDuel(online.config)) : new Duel(rulesOf(settings), settings.match.doubles ? 'double' : 'simple');
  const juice = juiceFlags();
  if (!online) {
    duel.highFloor = highFloorFromUrl();
    // Sensations réglées dans le labo, si on a choisi de les garder en match.
    const feel = loadFeel();
    if (feel.inMatch) applyFeel(duel.profile, feel.feel);
  }
  // Faux réseau : réglages lus dans l'URL, ou `null`.
  const fakeNet = online ? null : fakeNetFromUrl(params);
  /** Match en réseau (faux ou vrai) : rollbacks, sons datés, animations lissées, ni ralenti ni micro-pause. */
  const networked = fakeNet !== null || online !== null;
  /** En ligne : la manette ou le clavier choisi dans le salon joue sa place à soi. */
  const onlineController = online?.device ?? 'manette1';
  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const report = createMatchReport();
  const keyboard = createKeyboardPads(canvas);
  const audio = createSounds();
  const sounds = muteable(audio, () => settings.sound);
  const announcer = createAnnouncer();
  /** Ambiance de la salle : la même humeur que la foule dessinée, pour le fond sonore. */
  const mood = new CrowdMood();
  const squeaks = new SqueakDetector();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  // Une manette ne s'annonce qu'à son premier bouton : le son se débloque aussi à ce moment.
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  let bots: (Bot | null)[] = [];
  const sources: string[] = ['Clavier', 'Clavier', 'Clavier', 'Clavier'];
  /** Applique les réglages à la partie en cours ; `restart` relance une partie avec les nouvelles règles (et le format). */
  const apply = (s: DuelSettings, restart: boolean): void => {
    // En ligne, la partie est celle du serveur : aucun réglage local ne la touche.
    if (online) return;
    if (restart) {
      duel.rules = rulesOf(s);
      duel.format = s.match.doubles ? 'double' : 'simple';
      duel.restart();
    }
    // En double, une IA dont le partenaire est humain se cale sur lui (les deux au filet ou les deux au fond).
    bots = duel.players.map((_, i) => {
      const c = s.players[i]!;
      if (isHuman(c)) return null;
      const partner = duel.partnerOf(i);
      const followPartner = partner !== null && isHuman(s.players[partner]!);
      return new Bot(i, i + 1, { ...AI_LEVELS[c], followPartner });
    });
    duel.players.forEach((player, i) => {
      // Une IA ne sait pas se placer seule sans course assistée : en placement manuel, elle garde l'aimant.
      const human = isHuman(s.players[i]!);
      player.assist = !human && s.assists[i] === 'off' ? 'magnet' : s.assists[i]!;
      // Les IA gardent le stick libre : le réglage ne change que le ressenti des humains.
      player.prepMove = human ? s.prepMove : 'libre';
      player.hand = s.hands[i]!;
    });
    duel.profile.rally.pressure.scale = s.pressure;
  };
  apply(settings, false);
  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );
  const menu = createPauseMenu(settings, {
    online: online !== null,
    onChange: (s, restart) => {
      if (online) return;
      apply(s, restart);
      // Une place passée d'humain à IA (ou l'inverse) peut changer le camp de la caméra.
      updateViewpoint();
      // Nouvelle partie : l'historique du ralenti ne la rejoue plus.
      if (restart) recorder?.clear();
      // Faux réseau : les deux machines repartent de la partie réglée (et des nouvelles places humaines et IA).
      if (fakeNet) netRestart = true;
    },
    onTestPad: () => padTest.open(),
    // En ligne : on quitte la salle exprès, l'IA garde la place (pas de reprise au retour).
    onQuit: () => {
      void (online?.connection.leave() ?? Promise.resolve()).then(() => (location.href = '/'));
    },
    blocked: () => overlayOpen(),
  });
  /**
   * Frappe au geste du stick droit, une par manette puis une par côté du clavier (touches, et souris pour le bleu) ;
   * et celle tenue par chaque joueur.
   */
  const swings = swingEnabled() ? Array.from({ length: 6 }, () => new SwingStick()) : null;
  const playerSwings: (SwingStick | null)[] = [null, null, null, null];
  const inputs = createInputDisplay(swings && playerSwings);
  const journal = createSwingJournal();
  /** Fenêtre par-dessus la partie, qui la met en pause comme le menu : test de manette, panneau « raté » du journal. */
  const overlayOpen = (): boolean => padTest.isOpen || (journal?.isOpen ?? false);
  let keyboardLayout: ReadonlyMap<string, string> | null = null;
  void loadKeyboardLayout().then((layout) => (keyboardLayout = layout));
  /** État lu au dernier pas pour chaque humain, et ce qu'il tient en main (`null` : IA). */
  const states: (PadState | null)[] = [null, null, null, null];
  const buttons: (InputSource | null)[] = [null, null, null, null];

  /**
   * Caméra dans le dos des joueurs de cet écran : en ligne, de sa place ; hors ligne, de l'équipe des humains s'ils
   * sont tous dans la même (un humain rouge seul contre l'IA joue de son côté) ; sinon (bleu et rouge sur le même
   * écran, ou que des IA), derrière les bleus comme toujours. `focus` : le premier de ces joueurs.
   */
  const viewpoint: { side: -1 | 1; focus: number } = { side: -1, focus: 0 };
  const updateViewpoint = (): void => {
    const humans = online ? online.seats : duel.players.map((_, i) => i).filter((i) => isHuman(settings.players[i]!));
    const sides = new Set(humans.map((i) => duel.players[i]?.side ?? -1));
    viewpoint.side = sides.size === 1 && sides.has(1) ? 1 : -1;
    viewpoint.focus = humans.find((i) => duel.players[i]?.side === viewpoint.side) ?? 0;
    view.setViewpoint(viewpoint.side, viewpoint.focus);
  };
  updateViewpoint();

  /** Bouton d'assistance maintenu au pas précédent : un appui fait passer au niveau suivant. */
  const assistHeld = [false, false, false, false];

  /** Commandes de chaque joueur : la manette ou le clavier choisis pour sa place, ou son IA. */
  const read = (index: number, pads: readonly Gamepad[]): ArcadeCommands => {
    const bot = bots[index];
    const controller = online ? onlineController : settings.players[index]!;
    sources[index] = CONTROLLER_SHORT[controller];
    if (bot && !isHuman(controller)) {
      states[index] = buttons[index] = playerSwings[index] = null;
      return bot.commands(duel);
    }
    const padIndex = padOf(controller);
    const pad = padIndex === null ? undefined : pads[padIndex];
    // Téléphone sans manette : la place de la manette 1 se joue aux sticks tactiles (côté bleu du clavier).
    const touchFallback = padIndex === 0 && !pad && TOUCH_SCREEN;
    const keys = touchFallback ? 0 : keyboardOf(controller);
    if (touchFallback) sources[index] = 'Tactile';
    else if (padIndex !== null && !pad) sources[index] += ' (absente)';
    const slot = touchFallback ? 4 : (padIndex ?? (keys === null ? null : 4 + keys));
    const swing = slot === null ? null : (swings?.[slot] ?? null);
    playerSwings[index] = swing;
    // Contre-vitre proposée : le geste du stick droit s'inverse (vers l'avant pour préparer).
    if (swing) swing.wallReady = duel.counterWallReady(index);
    const raw: PadState = pad ? readGamepad(pad) : keys === null ? IDLE_PAD : keyboard.read(keys, SIM_DT);
    const state = applySwing(raw, swing ?? undefined, SIM_DT);
    states[index] = state;
    buttons[index] = pad
      ? { kind: 'pad', family: resolvePadFamily(settings.padStyle, pad) }
      : { kind: 'keyboard', player: keys ?? ((index % 2) as 0 | 1), layout: keyboardLayout };
    if (!online && state.assistButton && !assistHeld[index]) {
      const player = duel.players[index]!;
      player.assist = ASSIST_LEVELS[(ASSIST_LEVELS.indexOf(player.assist) + 1) % ASSIST_LEVELS.length]!;
      settings.assists[index] = player.assist;
      // Faux réseau : l'autre machine doit le savoir aussi ; le match en ligne repart de cet état.
      netRestart = true;
    }
    assistHeld[index] = state.assistButton;
    // Bouton Y, sans effet en jeu : « raté » pour le journal des frappes.
    if (pad) journal?.flag(duel, index, state.face === 'lob');
    if (pad) journal?.wallButton(duel, index, state.wallButton ?? false);
    // Joueur du camp où est la caméra (dans son dos) : haut de l'écran = vers le filet.
    return toCommands(state, duel.players[index]!.side === viewpoint.side, settings.farOwnView);
  };
  /** Commandes de tous les joueurs pour ce pas, arrondies comme elles le seraient en ligne (`src/net/codec.ts`). */
  const sample = (): ArcadeCommands[] => {
    const pads = connectedGamepads();
    return duel.players.map((_, i) => quantizeCommands(read(i, pads)));
  };

  /** Micro-pause sur une frappe forte (`hitstopMs`) : fin de la pause, en temps réel (ms). */
  let hitstopUntil = 0;
  // Banc d'essai du rendu : même graine, même pas de simulation, donc la même image à comparer d'une version à l'autre.
  const freezeSeconds = Number(params.get('figer'));
  const freezeTick = freezeSeconds > 0 ? Math.round(freezeSeconds / SIM_DT) : null;
  const frozen = (): boolean => freezeTick !== null && duel.tick >= freezeTick;
  // Ralenti du coup gagnant entre les points (étape V7) ; jamais sur le banc d'essai figé ni en réseau.
  const recorder = juice.replay !== 'off' && freezeTick === null && !networked ? new ReplayRecorder() : null;
  const badge = recorder ? createReplayBadge() : null;
  /** Point qui attend son ralenti (pas de la fin du point), et ralenti en cours. */
  let replayPending: number | null = null;
  let replay: Replay | null = null;
  let replayAlpha = 0;
  const replayDue = (): boolean => replayPending !== null && duel.tick - replayPending >= REPLAY_DELAY / SIM_DT;
  /** Bouton tenu à l'image précédente : un nouvel appui (manette, clavier, souris) passe le ralenti. */
  let skipHeld = true;
  let skipPressed = false;
  for (const type of ['keydown', 'pointerdown'] as const) {
    window.addEventListener(type, (event) => {
      if (!(event instanceof KeyboardEvent && event.repeat)) skipPressed = true;
    });
  }
  /** Événements déjà joués (faux réseau) : un rollback refait des pas, leurs sons et effets ne repartent pas. */
  const gate = networked ? new EventGate() : null;
  /**
   * Sons et effets d'un pas qui vient d'être calculé. `replayed` : pas refait par un rollback ; seuls ses événements
   * encore jamais vus comptent, ce qui suit le temps (crissements, affichage des entrées) attend le présent.
   */
  const afterSimStep = (replayed: boolean): void => {
    const unmute = gate?.muteSeen(duel);
    view.afterStep(replayed);
    if (!replayed) inputs.step(duel, states);
    if (!replayed) journal?.step(duel, playerSwings);
    for (const contact of duel.contacts) sounds.contact(contact);
    if (!replayed) {
      duel.players.forEach((player, i) => {
        const squeak = squeaks.update(i, player.vel, SIM_DT);
        if (squeak > 0) sounds.squeak(player.pos, squeak);
      });
    }
    for (const reaction of stepCrowdReactions(duel)) {
      sounds.crowd(reaction);
      mood.react(reaction);
      // Grand point : le gagnant crie « ¡Vamos! » (celui des deux partenaires qui a frappé le dernier).
      if (duel.result && reaction.kind !== 'ooh' && reaction.intensity >= 0.6 && settings.sound) {
        const winners = duel.teamPlayers(duel.result.winner);
        const shouter = winners.reduce((a, b) => (duel.players[b]!.lastHitTick > duel.players[a]!.lastHitTick ? b : a));
        setTimeout(() => announcer.shout('¡Vamos!', VOICES[shouter % VOICES.length]!), 150);
      }
    }
    if (duel.shot) {
      const { shot } = duel;
      // Le contact sonne plein quand le relâcher est bien placé, creux quand il est très en avance ou en retard.
      const quality = shot.perfect ? 1 : Math.max(0.25, 0.85 - (Math.abs(shot.timing) / 0.12) * 0.6);
      sounds.shot({ ...shot, quality });
      sounds.grunt(shot.contact, shotPower(shot), VOICES[shot.player % VOICES.length]!);
      // Pas de micro-pause en ligne : la simulation ne peut pas s'arrêter pour un seul joueur.
      const hitstop = networked ? 0 : hitstopMs(shot, juice.hitstop);
      if (hitstop > 0) hitstopUntil = performance.now() + hitstop;
      if (shot.perfect) view.shake(0.5);
      // Le remate secoue la caméra, même sans frappe parfaite (GAME_DESIGN.md §6). [à calibrer]
      if (shot.overhead === 'remate') view.shake(shot.perfect ? 1 : 0.6);
    }
    unmute?.();
  };

  /** Faux réseau : le match à deux machines. */
  let net: NetMatch | null = null;
  let netRestart = false;
  /** Ce que montre l'encart du réseau, compté par image. */
  let netFrame = { replayed: 0, corrections: 0, playerCorrections: 0, stalls: 0, longest: 0 };
  /** Balle et joueurs juste avant un rollback, pour lisser à l'écran le saut que la correction leur fait faire. */
  let ballBefore: Vec3 | null = null;
  let playersBefore: Vec3[] = [];
  if (networked) view.setOnline(true);
  /** Sons et effets de chaque pas calculé (rejoué ou non), et lissage des corrections : faux réseau et en ligne. */
  const rollbackHooks: RollbackHooks<Duel> = {
    onStep: (_, __, replayed) => afterSimStep(replayed),
    beforeRollback: (state) => {
      ballBefore = state.ball ? { ...state.ball.pos } : null;
      playersBefore = state.players.map((p) => ({ ...p.pos }));
    },
    afterRollback: (state) => {
      state.players.forEach((p, i) => {
        const before = playersBefore[i];
        if (!before) return;
        const offset = { x: before.x - p.pos.x, y: 0, z: before.z - p.pos.z };
        const jump = Math.hypot(offset.x, offset.z);
        // Au-delà de 3 m, c'est un nouveau point (replacement) : pas de fondu.
        if (jump > 0.005 && jump < 3) {
          view.correctPlayer(i, offset);
          netFrame.playerCorrections++;
        }
      });
      const after = state.ball?.pos;
      if (!ballBefore || !after) return;
      const offset = { x: ballBefore.x - after.x, y: ballBefore.y - after.y, z: ballBefore.z - after.z };
      const jump = Math.hypot(offset.x, offset.y, offset.z);
      // Au-delà de quelques mètres, ce n'est plus la même balle (le point a tourné autrement) : pas de fondu.
      if (jump > 0.005 && jump < 4) {
        view.correctBall(offset);
        netFrame.corrections++;
      }
    },
  };
  /** (Re)part de l'état de la partie : au début, et quand un réglage la change (menu, assistance). */
  const startNet = (): void => {
    if (!fakeNet) return;
    const localA = duel.players.map((_, i) => i).filter((i) => isHuman(settings.players[i]!));
    const { conditions, inputDelay, maxRollback } = fakeNet;
    // Les IA jouent sans délai sur leur machine (voir `inputDelayB`).
    net = new NetMatch(duel, { localA, conditions, inputDelay, inputDelayB: 0, maxRollback }, rollbackHooks);
  };
  /** En ligne : ce navigateur, calé sur l'horloge du serveur, et l'encart qui le décrit. */
  const onlineClient = online
    ? new OnlineClient(duel, { seats: online.seats, startAt: online.startAt, inputDelay: online.inputDelay, maxRollback: online.maxRollback, hooks: rollbackHooks })
    : null;
  if (online && onlineClient) {
    online.connection.attach(onlineClient);
    online.config.seats.forEach((seat, i) => {
      if (!online.seats.includes(i)) sources[i] = seat.kind === 'human' ? seat.name : CONTROLLER_SHORT[seat.level];
    });
  }
  const netHud = fakeNet
    ? createNetHud(() => describeFakeNet(fakeNet))
    : online && onlineClient
      ? createNetHud(
          () => `en ligne · ping ${onlineClient.stats.ping} ms · en avance de ${onlineClient.stats.ahead} pas · délai ${online.inputDelay / TICKS_PER_FRAME} im.`,
          () => {
            const s = onlineClient.stats;
            const sync = s.desyncs ? `DÉSYNCHRONISÉ (${s.desyncs}, dès le pas ${s.firstDesync})` : 'identiques au serveur';
            const resyncs = s.resyncs ? ` · reparti de l'état du serveur : ${s.resyncs}` : '';
            return `empreintes : ${s.checked} ${sync} · commandes remplacées par le serveur : ${s.overridden}${resyncs}`;
          },
          // Pour les joueurs, le ping seulement ; tout le détail avec `?debug`.
          params.has('debug') ? undefined : () => `En ligne · ping ${onlineClient.stats.ping} ms`,
        )
      : null;
  const maxRollback = fakeNet?.maxRollback ?? online?.maxRollback ?? 0;
  /** Les IA jouent sur l'autre machine, avec ce qu'elles voient de la partie là-bas. */
  const readRemote = (state: Duel, index: number): ArcadeCommands => {
    sources[index] = CONTROLLER_SHORT[settings.players[index]!];
    states[index] = buttons[index] = playerSwings[index] = null;
    return bots[index]?.commands(state) ?? NEUTRAL_ARCADE;
  };
  startNet();

  const loop = new FixedStepLoop(SIM_DT, () => {
    if (frozen()) return;
    if (online && onlineClient) {
      const pads = connectedGamepads();
      const session = onlineClient.session;
      const { replayed, rollbacks, stalls } = session.stats;
      // Menu ouvert : le match continue chez les autres ; sa place ne bouge plus.
      const paused = menu.isOpen || overlayOpen();
      onlineClient.step((_, index) => (paused ? NEUTRAL_ARCADE : read(index, pads)), performance.now());
      online.connection.flush();
      // Reparti de l'état du serveur pendant ce pas : nouveau moteur, nouveaux compteurs.
      const stats = onlineClient.session === session ? onlineClient.session.stats : { replayed, rollbacks, stalls, lastReplayed: 0 };
      netFrame.replayed += stats.replayed - replayed;
      netFrame.stalls += stats.stalls - stalls;
      if (stats.rollbacks > rollbacks) netFrame.longest = Math.max(netFrame.longest, stats.lastReplayed);
      gate?.forget(duel.tick - 4 * maxRollback);
      return;
    }
    if (net) {
      const pads = connectedGamepads();
      const { replayed, rollbacks } = net.a.session.stats;
      if (!net.step((_, index) => read(index, pads), readRemote)) netFrame.stalls++;
      const stats = net.a.session.stats;
      netFrame.replayed += stats.replayed - replayed;
      if (stats.rollbacks > rollbacks) netFrame.longest = Math.max(netFrame.longest, stats.lastReplayed);
      gate?.forget(duel.tick - 4 * maxRollback);
      if (netRestart) {
        netRestart = false;
        startNet();
      }
      return;
    }
    // Ralenti dû (le public a eu le temps de réagir) : la partie s'arrête là, il démarre à l'image suivante.
    if (replay || replayDue()) return;
    const commands = sample();
    recorder?.record(duel, commands);
    duel.step(commands);
    afterSimStep(false);
    if (recorder && duel.result && replayWorthy(duel, juice.replay === 'all' ? 'all' : 'big')) replayPending = duel.tick;
  });

  const debug = import.meta.env.DEV || params.has('debug');
  if (debug) window.__duel = { duel, Bot, net: () => net, online: () => onlineClient };

  const perf = debug ? createPerfMeter(params.has('perf')) : null;
  let last = performance.now();
  let alpha = 0;
  let startHeld = false;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    // Start sur n'importe quelle manette : ouvre ou ferme les réglages.
    const start = connectedGamepads().some((pad) => pad.buttons[START_BUTTON]?.pressed ?? false);
    if (start && !startHeld && !overlayOpen()) menu.toggle();
    startHeld = start;
    // Ralenti du coup gagnant : la partie en cours attend ; un appui le passe.
    const anyButton = connectedGamepads().some((pad) => pad.buttons.some((b) => b.pressed));
    if (recorder && replayDue() && !replay) {
      replay = recorder.replay(duel);
      replayPending = null;
      if (replay) {
        view.setSource(replay.duel, false);
        badge?.show(true);
        skipHeld = anyButton;
        skipPressed = false;
      }
    }
    if (replay && !menu.isOpen && !overlayOpen()) {
      replayAlpha = replay.advance(frameTime, () => view.afterStep());
      if (replay.done || skipPressed || (anyButton && !skipHeld)) {
        replay = null;
        view.setSource(duel, true);
        badge?.show(false);
      }
    }
    skipHeld = anyButton;
    skipPressed = false;
    const replaying = replay !== null;
    // Menu ouvert : partie en pause. Micro-pause : simulation figée, le temps réel écoulé n'est pas rattrapé.
    if (!replaying && (online || (!menu.isOpen && !overlayOpen())) && now >= hitstopUntil) alpha = loop.advance(frameTime);
    const renderStart = performance.now();
    if (replay) view.render(replayAlpha, frameTime * replay.speed, menu.isOpen || overlayOpen());
    else view.render(frozen() ? 0 : alpha, frameTime, now < hitstopUntil || frozen());
    perf?.frame(frameTime, performance.now() - renderStart, view.info());
    if (netHud) {
      netHud.frame(netFrame);
      netFrame = { replayed: 0, corrections: 0, playerCorrections: 0, stalls: 0, longest: 0 };
    }
    mood.update(frameTime);
    // Hors du proxy muet : couper le son doit aussi couper le fond sonore.
    audio.ambience(settings.sound && !menu.isOpen ? mood.stir : -1);
    hud.update(duel, sources, buttons, settings.inputDisplay === 'full');
    // Humains de cet écran, reconnus d'un match à l'autre par leur manette ou leur clavier (moyennes du carnet).
    const humans = online ? online.seats : duel.players.map((_, i) => i).filter((i) => isHuman(settings.players[i]!));
    report.update(duel, humans.map((index) => ({ index, controller: online ? onlineController : settings.players[index]! })));
    inputs.render(duel, states, buttons, menu.isOpen || overlayOpen() ? 'off' : settings.inputDisplay);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
