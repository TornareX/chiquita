import { describe, expect, it } from 'vitest';
import { applySwing, toCommands, type PadState } from '../../src/input/gamepad';
import { SwingStick } from '../../src/input/swingStick';
import { quantizeCommands } from '../../src/net/codec';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { SITUATIONS } from '../../src/sim/situations';

/**
 * Contre-vitre jouée comme un humain (Xavier, 23/10) : il recule depuis le filet sous le lob, stick droit en avant dès
 * que le geste est proposé, ramené vers soi `strike` s après le rebond. Même chemin que la manette : `SwingStick`,
 * `applySwing`, `toCommands`, encodage réseau, `Duel.step`.
 */
function play(id: string, strike: number): DuelShot | null {
  const duel = new Duel(null);
  duel.players[0].assist = 'off';
  duel.players[0].prepMove = 'bloque';
  SITUATIONS.find((s) => s.id === id)!.start(duel);
  const swing = new SwingStick();
  let bounceTick: number | null = null;
  let offered = false;
  for (let i = 0; i < 6 / SIM_DT && !duel.result && duel.players[0].lastHitTick === -Infinity && duel.players[0].lastWhiffTick === -Infinity; i++) {
    if (bounceTick === null && duel.bounces === 1) bounceTick = duel.tick;
    swing.wallReady = duel.counterWallReady(0);
    offered ||= swing.wallReady;
    const down = bounceTick !== null && duel.tick - bounceTick >= Math.round(strike / SIM_DT);
    const raw: PadState = { stick: { up: -1, right: 0 }, shot: null, assistButton: false, aim: { right: 0, up: down ? -1 : offered ? 1 : 0 } };
    duel.step([quantizeCommands(toCommands(applySwing(raw, swing, SIM_DT), true, false)), NEUTRAL_ARCADE]);
  }
  return duel.shot?.player === 0 ? duel.shot : null;
}

describe('contre-vitre à la manette, en reculant depuis le filet', () => {
  it('lob qui passe : tirée quand la balle passe derrière lui, parfaite ; tirée trop tôt, la raquette attend, pas parfaite', () => {
    const onTime = play('lob-qui-passe', 0.45);
    expect(onTime?.counterWall).toBe(true);
    expect(onTime?.perfect).toBe(true);
    const early = play('lob-qui-passe', 0);
    expect(early?.counterWall).toBe(true);
    expect(early?.perfect).toBe(false);
  });

  it('balle qui meurt : tirée avant le second rebond, contre-vitre', () => {
    for (const strike of [0, 0.1, 0.2]) expect(play('balle-qui-meurt', strike)?.counterWall).toBe(true);
  });
});
