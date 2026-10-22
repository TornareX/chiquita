import type { SwingStick } from '../input/swingStick';
import { HALF_LENGTH, SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';
import { createMenu, type MenuItem } from '../ui/menu';

/**
 * Journal des frappes (`?journal=1`, serveur de développement) : chaque geste au stick droit d'un humain, ce que la
 * simulation en a fait (coup, toucher, timing) ou pourquoi il est parti dans le vide. Pour trouver ce qui frustre
 * en jouant, plutôt que le deviner. Une ligne JSON par geste dans `journal/AAAA-MM-JJ.jsonl` (`vite.config.ts`).
 * Bouton Y (sans effet en jeu) : « raté ». Le match se met en pause et un panneau demande ce qui a frustré dans le
 * dernier geste de ce joueur : une raison toute prête, et une précision au clavier si on veut.
 */
export interface SwingJournal {
  /** Après chaque pas de la simulation : les gestes finis et leurs résultats. */
  step(duel: Duel, swings: readonly (SwingStick | null)[]): void;
  /** Bouton « raté » du joueur `index` à ce pas (maintenu ou non) : un appui ouvre le panneau sur son dernier geste. */
  flag(duel: Duel, index: number, held: boolean): void;
  /** Panneau « raté » ouvert : le match est en pause. */
  readonly isOpen: boolean;
}

/** Raisons toutes prêtes du panneau « raté ». */
const REASONS: readonly [id: string, label: string][] = [
  ['vide', 'Coup parti dans le vide'],
  ['mauvaisCoup', "Ce n'est pas le coup que je voulais"],
  ['voleeBloquee', 'Volée bloquée au lieu de coupée'],
  ['direction', 'Direction ou profondeur pas voulue'],
  ['placement', "Mon joueur n'est pas allé à la balle"],
  ['faute', 'Faute que je ne comprends pas'],
];

const OUTCOME_TEXT: Record<string, string> = { camp: 'pas encore dans ton camp', hauteur: 'trop haute ou trop basse', portee: 'hors de portée', passee: 'déjà passée', regle: 'pas jouable', contreVitre: 'contre-vitre ratée' };

/** Noms des coups et des touchers, pour le rappel du panneau. */
const SHOT_TEXT: Record<string, string> = {
  normal: 'coup normal',
  slice: 'coupé',
  lob: 'lob',
  overhead: 'coup haut',
  bandeja: 'bandeja',
  vibora: 'víbora',
  remate: 'smash',
  bajada: 'bajada',
  feinte: 'feinte de smash',
  cut: 'volée coupée',
  punch: 'volée de définition',
  low: 'volée basse',
  chiquita: 'chiquita',
  block: 'bloqué',
};

/** Le dernier geste en clair, pour rappeler au joueur ce qu'il marque. */
function describe(entry: Record<string, unknown> | null): string {
  if (!entry) return 'Aucun geste encore.';
  const gesture = entry.prepare ? `Geste préparé (${entry.fin === 'arc' ? 'en arc' : entry.fin === 'letGo' ? 'lâché' : 'tout droit'})` : 'Coup sec';
  if (entry.resultat === 'frappe') {
    const name = (key: unknown): string | null => (typeof key === 'string' ? (SHOT_TEXT[key] ?? key) : null);
    const touch = name(entry.toucher);
    const volley = entry.volee && !String(touch).startsWith('volée') ? 'de volée' : null;
    const shot = [touch?.startsWith('volée') ? touch : name(entry.variante ?? entry.coup), touch?.startsWith('volée') ? null : touch, volley, entry.parfait ? 'frappe parfaite' : null]
      .filter(Boolean)
      .join(', ');
    return `${gesture} → ${shot}.`;
  }
  if (entry.resultat === 'vide') return `${gesture} → dans le vide : balle ${OUTCOME_TEXT[String(entry.raison)] ?? 'pas jouable'}.`;
  if (entry.resultat === 'aucun') return `${gesture} → pas de balle à jouer.`;
  return `${gesture} → résultat pas encore connu.`;
}

/** Geste fini, en attente de son résultat. */
interface Pending {
  entry: Record<string, unknown>;
  tick: number;
}

interface Watch {
  /** La balle et la contre-vitre au pas précédent : avant la frappe qui part au relâcher (la balle est alors renvoyée). */
  before: Record<string, unknown> | null;
  /** Pas du dernier geste fini, et sa ligne (avec son résultat une fois connu), pour le bouton « raté ». */
  lastGestureTick: number | null;
  lastEntry: Record<string, unknown> | null;
  flagHeld: boolean;
  count: number;
  phase: string;
  armTick: number;
  pending: Pending | null;
  lastHitTick: number;
  lastWhiffTick: number;
}

/** Le joueur, la balle et la contre-vitre à ce pas, pour la ligne du geste qui finira au pas suivant. */
function snapshot(duel: Duel, index: number): Record<string, unknown> {
  const player = duel.players[index]!;
  const ball = duel.ball;
  const chance = duel.counterWall(index);
  return {
    joueurFilet: round(Math.abs(player.pos.z)),
    balle: ball
      ? {
          hauteur: round(ball.pos.y),
          distance: round(Math.hypot(ball.pos.x - player.pos.x, ball.pos.z - player.pos.z)),
          vitesse: round(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z), 1),
          rebonds: duel.bounces,
          sonCamp: ball.pos.z * player.side > 0,
          // Vers la vitre du fond du joueur, déjà passée par une vitre, et place jusqu'à elle (m) : pour la contre-vitre.
          versSaVitre: ball.vel.z * player.side > 0,
          vitre: duel.touchedGlass,
          placeVitre: round(HALF_LENGTH - Math.abs(ball.pos.z)),
        }
      : null,
    etatContreVitre: {
      proposee: duel.counterWallReady(index),
      chance: chance && { timing: round(chance.timing, 3), distance: round(chance.distance), jouable: chance.playable },
    },
  };
}

/** Sans résultat au bout de tant (s) après le geste : il n'a rien donné (pas de balle à jouer). */
const OUTCOME_WAIT = 3;
const round = (x: number, digits = 2): number => Math.round(x * 10 ** digits) / 10 ** digits;

export function createSwingJournal(): SwingJournal | null {
  if (!import.meta.env.DEV || new URLSearchParams(location.search).get('journal') !== '1') return null;
  const session = new Date().toISOString();
  let queue: Record<string, unknown>[] = [{ type: 'session', session, url: location.search }];
  const flush = (): void => {
    if (queue.length === 0) return;
    const body = queue.map((line) => JSON.stringify(line)).join('\n') + '\n';
    queue = [];
    void fetch('/__journal', { method: 'POST', body, keepalive: true }).catch(() => undefined);
  };
  setInterval(flush, 5000);
  addEventListener('pagehide', flush);
  console.info('Journal des frappes actif : journal/*.jsonl');

  const watches: Watch[] = [];
  let lastResult: unknown = null;
  const watchOf = (duel: Duel, index: number, swing: SwingStick | null | undefined): Watch => {
    const player = duel.players[index]!;
    return (watches[index] ??= {
      before: null,
      lastGestureTick: null,
      lastEntry: null,
      flagHeld: false,
      count: swing?.count ?? 0,
      phase: 'idle',
      armTick: duel.tick,
      pending: null,
      lastHitTick: player.lastHitTick,
      lastWhiffTick: player.lastWhiffTick,
    });
  };

  // Confirmation du bouton « raté », en haut de l'écran.
  const notice = document.createElement('div');
  notice.textContent = 'Raté noté';
  notice.style.cssText =
    'position:fixed;top:12%;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;pointer-events:none;' +
    'background:var(--plate,#1b1631);color:var(--ball,#e6ff2e);font:700 18px var(--ui-font,system-ui);opacity:0;transition:opacity .4s;z-index:50';
  document.body.append(notice);
  let noticeTimer = 0;
  const confirm = (text: string): void => {
    notice.textContent = text;
    notice.style.opacity = '1';
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => (notice.style.opacity = '0'), 1200);
  };

  const close = (watch: Watch, outcome: Record<string, unknown>): void => {
    if (!watch.pending) return;
    const line = { ...watch.pending.entry, ...outcome };
    queue.push(line);
    if (watch.lastEntry === watch.pending.entry) watch.lastEntry = line;
    watch.pending = null;
  };

  // Panneau « raté » : match en pause, une raison, une précision au clavier si on veut.
  const panel = createMenu({ id: 'journal-rate', overlay: 'dim', onRootBack: () => answer(null) });
  let asking: { tick: number; joueur: number; geste: number | null; resume: string } | null = null;
  let note = '';
  const answer = (reason: string | null): void => {
    if (!asking) return;
    queue.push({ type: 'rate', session, ...asking, raison: reason, note: note.trim() || null });
    asking = null;
    panel.hide();
    confirm(reason ? 'Raté noté' : 'Raté noté, sans raison');
    flush();
  };
  const ask = (duel: Duel, index: number, watch: Watch): void => {
    const resume = describe(watch.lastEntry);
    asking = { tick: duel.tick, joueur: index, geste: watch.lastGestureTick, resume };
    note = '';
    panel.show({
      id: 'journal-rate',
      title: "Qu'est-ce qui t'a frustré ?",
      hint: `Dernier geste : ${resume} B : reprendre sans raison.`,
      // Les raisons d'abord : à la manette, Y puis A suffit. Au clavier, la précision tapée part avec la raison choisie,
      // ou seule avec Entrée.
      items: (): MenuItem[] => [
        ...REASONS.map(([id, label]): MenuItem => ({ kind: 'action', id, label, run: () => answer(id) })),
        {
          kind: 'text',
          id: 'note',
          label: 'Autre chose ? Écris-le, puis Entrée',
          value: note,
          set: (value) => (note = value),
          maxLength: 160,
          charset: ' abcdefghijklmnopqrstuvwxyzéèàç',
          placeholder: 'ex. je voulais une volée coupée',
          submit: () => answer('autre'),
        },
      ],
    });
  };

  return {
    step(duel, swings) {
      duel.players.forEach((player, index) => {
        const swing = swings[index];
        const watch = watchOf(duel, index, swing);
        // Les IA (et le partenaire) : leurs frappes, pour savoir qui a joué la balle.
        if (!swing) {
          if (player.lastHitTick !== watch.lastHitTick && player.lastHit) {
            const shot = player.lastHit;
            queue.push({ type: 'coup', session, tick: duel.tick, joueur: index, coup: shot.overhead ?? shot.kind, toucher: shot.style, volee: shot.volley });
          }
          watch.lastHitTick = player.lastHitTick;
          return;
        }
        // Début de préparation : de l'armement au relâcher.
        if (watch.phase === 'idle' && (swing.phase === 'armed' || swing.phase === 'wallArmed')) watch.armTick = duel.tick;
        watch.phase = swing.phase;
        if (swing.count !== watch.count && swing.last) {
          watch.count = swing.count;
          watch.lastGestureTick = duel.tick;
          close(watch, { resultat: 'aucun' });
          const trail = swing.trail;
          // Trace du stick, sans les pas où il n'a pas bougé, au plus 30 points : assez pour revoir la forme du geste.
          const moved = trail.filter((p, i) => i === 0 || i === trail.length - 1 || p.right !== trail[i - 1]!.right || p.up !== trail[i - 1]!.up);
          const stride = Math.max(1, Math.ceil(moved.length / 30));
          const entry: Record<string, unknown> = {
            type: 'geste',
            session,
            tick: duel.tick,
            joueur: index,
            prepare: swing.last.prepared,
            fin: swing.last.end,
            contreVitre: swing.last.wall ?? false,
            dureeGeste: swing.last.prepared ? round((duel.tick - watch.armTick) * SIM_DT, 3) : 0,
            trace: moved.filter((_, i) => i % stride === 0 || i === moved.length - 1).map((p) => [round(p.right), round(p.up)]),
            phase: duel.phase,
            // Au pas d'avant le relâcher : la frappe partie au relâcher a déjà renvoyé la balle.
            ...watch.before,
          };
          watch.pending = { tick: duel.tick, entry };
          watch.lastEntry = entry;
        }

        // Résultat du geste en attente : une frappe, un coup dans le vide, ou rien. Après le geste fini à ce pas : la
        // frappe partie au relâcher, balle déjà à portée, est la sienne.
        if (player.lastHitTick !== watch.lastHitTick && player.lastHit) {
          const shot = player.lastHit;
          close(watch, {
            resultat: 'frappe',
            coup: shot.kind,
            variante: shot.overhead,
            toucher: shot.style,
            volee: shot.volley,
            parfait: shot.perfect,
            timing: round(shot.timing, 3),
            prepContact: shot.prepared === undefined ? null : round(shot.prepared, 3),
            hauteur: round(shot.contact.y),
            filet: round(Math.abs(shot.contact.z)),
            vitesse: round(shot.speed, 1),
            pression: round(shot.pressure),
            erreur: round(shot.error),
            cote: shot.wing,
            contreVitreJouee: shot.counterWall ?? false,
          });
        }
        if (player.lastWhiffTick !== watch.lastWhiffTick) {
          const timing = player.lastWhiffTiming;
          close(watch, { resultat: 'vide', raison: player.lastWhiffReason, timing: timing === null ? null : round(timing, 3), tard: player.lastWhiffLate });
        }
        watch.lastHitTick = player.lastHitTick;
        watch.lastWhiffTick = player.lastWhiffTick;
        if (watch.pending && (duel.tick - watch.pending.tick) * SIM_DT > OUTCOME_WAIT) close(watch, { resultat: 'aucun' });
        watch.before = snapshot(duel, index);
      });
      if (duel.result && duel.result !== lastResult) queue.push({ type: 'point', session, tick: duel.tick, ...duel.result });
      lastResult = duel.result;
    },
    flag(duel, index, held) {
      const watch = watchOf(duel, index, null);
      const pressed = held && !watch.flagHeld;
      watch.flagHeld = held;
      // Le geste visé est le dernier fini, qu'il ait déjà son résultat ou pas encore.
      if (pressed && !asking) ask(duel, index, watch);
    },
    get isOpen() {
      return asking !== null;
    },
  };
}
