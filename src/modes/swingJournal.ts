import type { SwingStick } from '../input/swingStick';
import { SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';

/**
 * Journal des frappes (`?journal=1`, serveur de développement) : chaque geste au stick droit d'un humain, ce que la
 * simulation en a fait (coup, toucher, timing) ou pourquoi il est parti dans le vide. Pour trouver ce qui frustre
 * en jouant, plutôt que le deviner. Une ligne JSON par geste dans `journal/AAAA-MM-JJ.jsonl` (`vite.config.ts`).
 */
export interface SwingJournal {
  /** Après chaque pas de la simulation : les gestes finis et leurs résultats. */
  step(duel: Duel, swings: readonly (SwingStick | null)[]): void;
}

/** Geste fini, en attente de son résultat. */
interface Pending {
  entry: Record<string, unknown>;
  tick: number;
}

interface Watch {
  count: number;
  phase: string;
  armTick: number;
  pending: Pending | null;
  lastHitTick: number;
  lastWhiffTick: number;
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

  const close = (watch: Watch, outcome: Record<string, unknown>): void => {
    if (!watch.pending) return;
    queue.push({ ...watch.pending.entry, ...outcome });
    watch.pending = null;
  };

  return {
    step(duel, swings) {
      duel.players.forEach((player, index) => {
        const swing = swings[index];
        const watch = (watches[index] ??= {
          count: swing?.count ?? 0,
          phase: 'idle',
          armTick: duel.tick,
          pending: null,
          lastHitTick: player.lastHitTick,
          lastWhiffTick: player.lastWhiffTick,
        });
        if (!swing) return;
        // Résultat du geste en attente : une frappe, un coup dans le vide, ou rien.
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
          });
        }
        if (player.lastWhiffTick !== watch.lastWhiffTick) {
          const timing = player.lastWhiffTiming;
          close(watch, { resultat: 'vide', raison: player.lastWhiffReason, timing: timing === null ? null : round(timing, 3), tard: player.lastWhiffLate });
        }
        watch.lastHitTick = player.lastHitTick;
        watch.lastWhiffTick = player.lastWhiffTick;
        if (watch.pending && (duel.tick - watch.pending.tick) * SIM_DT > OUTCOME_WAIT) close(watch, { resultat: 'aucun' });

        // Début de préparation : de l'armement au relâcher.
        if (watch.phase === 'idle' && (swing.phase === 'armed' || swing.phase === 'wallArmed')) watch.armTick = duel.tick;
        watch.phase = swing.phase;
        if (swing.count === watch.count || !swing.last) return;
        watch.count = swing.count;
        close(watch, { resultat: 'aucun' });
        const ball = duel.ball;
        const trail = swing.trail;
        // Trace du stick, sans les pas où il n'a pas bougé, au plus 30 points : assez pour revoir la forme du geste.
        const moved = trail.filter((p, i) => i === 0 || i === trail.length - 1 || p.right !== trail[i - 1]!.right || p.up !== trail[i - 1]!.up);
        const stride = Math.max(1, Math.ceil(moved.length / 30));
        watch.pending = {
          tick: duel.tick,
          entry: {
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
            joueurFilet: round(Math.abs(player.pos.z)),
            balle: ball
              ? {
                  hauteur: round(ball.pos.y),
                  distance: round(Math.hypot(ball.pos.x - player.pos.x, ball.pos.z - player.pos.z)),
                  vitesse: round(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z), 1),
                  rebonds: duel.bounces,
                  sonCamp: ball.pos.z * player.side > 0,
                }
              : null,
          },
        };
      });
      if (duel.result && duel.result !== lastResult) queue.push({ type: 'point', session, tick: duel.tick, ...duel.result });
      lastResult = duel.result;
    },
  };
}
