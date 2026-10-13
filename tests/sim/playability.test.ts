import { describe, expect, it } from 'vitest';
import type { Ball } from '../../src/sim/ball';
import { stepBall, type Contact } from '../../src/sim/collisions';
import { NEUTRAL_COMMANDS, type PlayerCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { findExercise } from '../../src/sim/exercises';
import type { Vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';

/**
 * Joueur automatique « raisonnable » : il lit la trajectoire, court se placer à côté du point où
 * il veut frapper, prépare, puis relâche au bon moment en regardant droit vers le filet.
 * Il ne triche pas : il passe par les mêmes commandes et les mêmes limites qu'un humain.
 * Il sert à vérifier que chaque exercice est jouable, pas à mesurer le ressenti.
 */
interface Plan {
  /** Où et quand (temps simulé) il compte frapper. */
  point: Vec3;
  time: number;
  /** Où il doit se tenir pour avoir la balle à la bonne distance, côté coup droit ou revers. */
  standX: number;
  standZ: number;
}

/** Délai entre le relâchement et le contact (s), et avance de la préparation. */
const SWING_LEAD = 0.09;
const PREPARE_LEAD = 0.45;

function plan(world: World): Plan | null {
  const { profile, player } = world;
  const ball: Ball = { ...world.ball! };
  const t = profile.racket;
  const contacts: Contact[] = [];
  let grounds = 0;
  let best: Plan | null = null;
  for (let i = 1; i < 6 / SIM_DT && grounds < 2; i++) {
    contacts.length = 0;
    stepBall(ball, SIM_DT, profile, contacts);
    for (const c of contacts) if (c.surface === 'ground') grounds++;
    if (grounds >= 2) break;
    const { x, y, z } = ball.pos;
    // Hauteur confortable, dans le camp du joueur.
    if (y < 0.4 || y > 1.25 || z > -1.2 || z < -9) continue;
    // Atteignable en courant, avec une marge pour s'arrêter et préparer.
    // Balle à gauche du terrain (+X) : revers, le joueur se tient à sa droite ; sinon coup droit.
    const targetX = x > 0 ? x - t.idealLateral : x + t.idealLateral;
    const targetZ = z - t.idealForward;
    const distance = Math.hypot(targetX - player.pos.x, targetZ - player.pos.z);
    const available = i * SIM_DT - 0.45;
    if (distance > profile.player.maxSpeed * 0.9 * available) continue;
    // Le plus tard possible : après la vitre quand il y en a une.
    best = { point: ball.pos, time: world.time + i * SIM_DT, standX: targetX, standZ: targetZ };
  }
  return best;
}

function commands(world: World, target: Plan | null): PlayerCommands {
  if (!target) return NEUTRAL_COMMANDS;
  const dx = target.standX - world.player.pos.x;
  const dz = target.standZ - world.player.pos.z;
  const axis = (delta: number): number => (Math.abs(delta) < 0.08 ? 0 : Math.sign(delta));
  const remaining = target.time - world.time;
  return {
    ...NEUTRAL_COMMANDS,
    // Regard vers +Z : « avancer » = +Z, « droite » = -X.
    move: { forward: axis(dz), right: -axis(dx) },
    prepare: remaining < PREPARE_LEAD && remaining > SWING_LEAD,
  };
}

function playExercise(id: string, balls: number, tolerance: number): { hits: number; valid: number; planned: number } {
  const world = new World();
  world.profile.racket.tolerance = tolerance;
  const exercise = findExercise(id);
  world.startExercise(exercise, 12345);
  let target: Plan | null = null;
  let count = 0;
  let planned = 0;
  while (world.machine!.count <= balls) {
    if (world.machine!.count > count) {
      // Nouvelle balle : le joueur lit sa trajectoire.
      count = world.machine!.count;
      if (count > balls) break;
      target = plan(world);
      if (target) planned++;
    }
    world.step(commands(world, target));
    if (world.shot) target = null;
  }
  return { hits: world.stats.hits, valid: world.stats.valid, planned };
}

describe('jouabilité : un joueur automatique raisonnable réussit chaque exercice', () => {
  const BALLS = 40;
  for (const id of ['back-glass', 'double-glass', 'lob', 'mesh', 'volley', 'mix']) {
    it(`${id} : il touche la plupart des balles et en renvoie une bonne part`, () => {
      const real = playExercise(id, BALLS, 1);
      const aided = playExercise(id, BALLS, 1.5);
      console.log(
        `${id} : tamis réel ${real.hits}/${BALLS} touchées, ${real.valid} valides (plan ${real.planned}) · ` +
          `zone 150 % ${aided.hits}/${BALLS} touchées, ${aided.valid} valides`,
      );
      expect(real.hits).toBeGreaterThanOrEqual(BALLS * 0.7);
      expect(real.valid).toBeGreaterThanOrEqual(BALLS * 0.5);
    });
  }
});
