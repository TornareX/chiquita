import { describe, expect, it } from 'vitest';
import { NEUTRAL_COMMANDS, type PlayerCommands } from '../../src/sim/commands';
import { HALF_LENGTH, HALF_WIDTH, SIM_DT } from '../../src/sim/constants';
import { createPlayer, NO_LAUNCH, stepPlayer, type LaunchTiming, type Player } from '../../src/sim/player';
import { REALISTIC } from '../../src/sim/profile';
import { vec3 } from '../../src/sim/vec3';

const T = REALISTIC.player;
const FORWARD: PlayerCommands = { ...NEUTRAL_COMMANDS, move: { forward: 1, right: 0 } };
const RIGHT: PlayerCommands = { ...NEUTRAL_COMMANDS, move: { forward: 0, right: 1 } };
const JUMP: PlayerCommands = { ...NEUTRAL_COMMANDS, jump: true };

/** Joue des commandes pendant `seconds` secondes à partir de `startTime`. Retourne l'instant final. */
function run(
  player: Player,
  commands: PlayerCommands,
  seconds: number,
  startTime = 0,
  timing: LaunchTiming = NO_LAUNCH,
): number {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    stepPlayer(player, commands, SIM_DT, REALISTIC, timing, startTime + i * SIM_DT);
  }
  return startTime + steps * SIM_DT;
}

const speedOf = (player: Player): number => Math.hypot(player.vel.x, player.vel.z);

describe('déplacement', () => {
  it("démarre avec de l'inertie, puis atteint sa vitesse de course", () => {
    const player = createPlayer();
    run(player, FORWARD, SIM_DT);
    expect(speedOf(player)).toBeCloseTo(T.acceleration * SIM_DT, 9);
    run(player, FORWARD, 0.1);
    expect(speedOf(player)).toBeLessThan(T.maxSpeed * 0.6);
    run(player, FORWARD, 1);
    expect(speedOf(player)).toBeCloseTo(T.maxSpeed, 9);
  });

  it("freine progressivement jusqu'à l'arrêt complet", () => {
    const player = createPlayer();
    run(player, FORWARD, 1);
    run(player, NEUTRAL_COMMANDS, 0.05);
    expect(speedOf(player)).toBeGreaterThan(0);
    expect(speedOf(player)).toBeLessThan(T.maxSpeed);
    run(player, NEUTRAL_COMMANDS, 0.5);
    expect(speedOf(player)).toBe(0);
  });

  it('avance vers le filet et se décale à droite (−X) quand il regarde le filet', () => {
    const forward = createPlayer();
    run(forward, FORWARD, 0.5);
    expect(forward.pos.z).toBeGreaterThan(-7);
    expect(forward.pos.x).toBeCloseTo(0, 9);

    const right = createPlayer();
    run(right, RIGHT, 0.5);
    expect(right.pos.x).toBeLessThan(0);
    expect(right.pos.z).toBeCloseTo(-7, 9);
  });

  it('se déplace par rapport au regard', () => {
    const player = createPlayer();
    // Quart de tour à droite : « avancer » va maintenant vers −X.
    stepPlayer(player, { ...NEUTRAL_COMMANDS, look: { yaw: Math.PI / 2, pitch: 0 } }, SIM_DT, REALISTIC, NO_LAUNCH, 0);
    run(player, FORWARD, 0.5);
    expect(player.pos.x).toBeLessThan(-0.5);
    expect(player.pos.z).toBeCloseTo(-7, 6);
  });

  it("n'est pas plus rapide en diagonale", () => {
    const player = createPlayer();
    run(player, { ...NEUTRAL_COMMANDS, move: { forward: 1, right: 1 } }, 1);
    expect(speedOf(player)).toBeCloseTo(T.maxSpeed, 9);
  });

  it('ralentit pendant la préparation du coup', () => {
    const player = createPlayer();
    run(player, { ...FORWARD, prepare: true }, 1);
    expect(speedOf(player)).toBeCloseTo(T.maxSpeed * T.prepareSpeedFactor, 9);
  });

  it('borne le regard vertical', () => {
    const player = createPlayer();
    run(player, { ...NEUTRAL_COMMANDS, look: { yaw: 0, pitch: 0.1 } }, 1);
    expect(player.pitch).toBeLessThan(Math.PI / 2);
    run(player, { ...NEUTRAL_COMMANDS, look: { yaw: 0, pitch: -0.1 } }, 2);
    expect(player.pitch).toBeGreaterThan(-Math.PI / 2);
  });
});

describe('limites du terrain', () => {
  it('ne traverse pas le filet', () => {
    const player = createPlayer();
    run(player, FORWARD, 5);
    expect(player.pos.z).toBe(-T.radius);
    expect(player.vel.z).toBe(0);
  });

  it('ne traverse pas les murs', () => {
    const side = createPlayer();
    run(side, RIGHT, 5);
    expect(side.pos.x).toBe(-(HALF_WIDTH - T.radius));

    const back = createPlayer();
    run(back, { ...NEUTRAL_COMMANDS, move: { forward: -1, right: 0 } }, 5);
    expect(back.pos.z).toBe(-HALF_LENGTH + T.radius);
  });
});

describe('split-step', () => {
  // Durée du saut : 2·v/g.
  const hopDuration = (2 * T.hopSpeed) / REALISTIC.gravity;

  it('est un petit saut qui retombe au sol', () => {
    const player = createPlayer();
    stepPlayer(player, JUMP, SIM_DT, REALISTIC, NO_LAUNCH, 0);
    expect(player.airborne).toBe(true);
    let apex = 0;
    for (let i = 1; i < 240; i++) {
      stepPlayer(player, NEUTRAL_COMMANDS, SIM_DT, REALISTIC, NO_LAUNCH, i * SIM_DT);
      apex = Math.max(apex, player.pos.y);
    }
    expect(apex).toBeGreaterThan(0.05);
    expect(apex).toBeLessThan(0.25);
    expect(player.pos).toEqual(vec3(0, 0, -7));
    expect(player.airborne).toBe(false);
  });

  /** Distance parcourue en 0,4 s après un split-step déclenché `jumpLead` secondes avant le lancement. */
  function firstStepDistance(jumpLead: number | null): { distance: number; splitSteps: number } {
    const launchTime = 2;
    const timing: LaunchTiming = { lastLaunchTime: -Infinity, nextLaunchTime: launchTime };
    const afterLaunch: LaunchTiming = { lastLaunchTime: launchTime, nextLaunchTime: launchTime + 5 };
    const player = createPlayer();
    const timingAt = (time: number): LaunchTiming => (time >= launchTime ? afterLaunch : timing);

    let time = 0;
    const steps = Math.round((launchTime + 0.3 + 0.4) / SIM_DT);
    const jumpStep = jumpLead === null ? -1 : Math.round((launchTime - jumpLead) / SIM_DT);
    const moveStart = Math.round((launchTime + 0.3) / SIM_DT);
    let startZ = 0;
    for (let i = 0; i < steps; i++) {
      time = i * SIM_DT;
      if (i === moveStart) startZ = player.pos.z;
      const commands = i === jumpStep ? JUMP : i >= moveStart ? FORWARD : NEUTRAL_COMMANDS;
      stepPlayer(player, commands, SIM_DT, REALISTIC, timingAt(time), time);
    }
    return { distance: player.pos.z - startZ, splitSteps: player.splitSteps };
  }

  it('bien synchronisé, il accélère le premier pas', () => {
    const without = firstStepDistance(null);
    // Réception environ 0,25 s après le lancement : dans la fenêtre.
    const good = firstStepDistance(hopDuration - 0.25);
    expect(good.splitSteps).toBe(1);
    expect(without.splitSteps).toBe(0);
    expect(good.distance).toBeGreaterThan(without.distance * 1.15);
  });

  it('mal synchronisé, il est sans effet', () => {
    const without = firstStepDistance(null);
    // Réception une seconde avant le lancement : trop tôt.
    const early = firstStepDistance(hopDuration + 1);
    expect(early.splitSteps).toBe(0);
    expect(early.distance).toBeCloseTo(without.distance, 9);
  });
});
