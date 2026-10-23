import { describe, expect, it } from 'vitest';
import { applySwing, readGamepad, toCommands, type PadState } from '../../src/input/gamepad';
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

/**
 * Contre-vitre au bouton (Xavier, 23/10) : RB / R1 tenu dès que le geste est proposé (il se tourne vers sa vitre), stick
 * droit vers l'avant `strike` s après le rebond. `release` : RB lâché à ce moment-là au lieu de frapper.
 */
function playButton(id: string, strike: number, release = false): { duel: Duel; shot: DuelShot | null; turned: boolean } {
  const duel = new Duel(null);
  duel.players[0].assist = 'off';
  duel.players[0].prepMove = 'bloque';
  SITUATIONS.find((s) => s.id === id)!.start(duel);
  const swing = new SwingStick();
  let bounceTick: number | null = null;
  let offered = false;
  let turned = false;
  for (let i = 0; i < 6 / SIM_DT && !duel.result && duel.players[0].lastHitTick === -Infinity && duel.players[0].lastWhiffTick === -Infinity; i++) {
    if (bounceTick === null && duel.bounces === 1) bounceTick = duel.tick;
    offered ||= duel.counterWallReady(0);
    const now = bounceTick !== null && duel.tick - bounceTick >= Math.round(strike / SIM_DT);
    const raw: PadState = {
      stick: { up: -1, right: 0 },
      shot: null,
      assistButton: false,
      aim: { right: 0, up: now && !release ? 1 : 0 },
      wallButton: offered && !(now && release),
    };
    duel.step([quantizeCommands(toCommands(applySwing(raw, swing, SIM_DT), true, false)), NEUTRAL_ARCADE]);
    turned ||= duel.players[0].engagement?.swing?.wall === true;
    if (now && release && i % 60 === 0 && duel.tick - bounceTick! > Math.round((strike + 1) / SIM_DT)) break;
  }
  return { duel, shot: duel.shot?.player === 0 ? duel.shot : null, turned };
}

describe('contre-vitre au bouton (RB / R1), impact au stick droit vers l’avant', () => {
  it('lob qui passe : RB tenu, puis stick en avant quand elle passe derrière lui : contre-vitre parfaite', () => {
    const { shot, turned } = playButton('lob-qui-passe', 0.45);
    expect(turned).toBe(true);
    expect(shot?.counterWall).toBe(true);
    expect(shot?.perfect).toBe(true);
  });

  it('balle qui meurt : RB tenu, stick en avant avant le second rebond : contre-vitre', () => {
    for (const strike of [0, 0.1, 0.2]) expect(playButton('balle-qui-meurt', strike).shot?.counterWall).toBe(true);
  });

  it('RB lâché sans frapper : annulée, ni frappe ni coup dans le vide', () => {
    const { duel, shot } = playButton('lob-qui-passe', 0.2, true);
    expect(shot).toBeNull();
    expect(duel.players[0].lastWhiffTick).toBe(-Infinity);
  });

  it('sans RB, pousser le stick vers l’avant reste un coup sec, même quand la contre-vitre est possible', () => {
    const swing = new SwingStick();
    swing.wallReady = true;
    const state = applySwing({ stick: { up: 0, right: 0 }, shot: null, assistButton: false, aim: { right: 0, up: 1 }, wallButton: false }, swing, SIM_DT);
    expect(state.gesture).toEqual({ prepared: false, end: 'straight' });
  });
});

describe('bouton de contre-vitre', () => {
  const pad = (pressed: number[]): Gamepad =>
    ({
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: 0 })),
    }) as unknown as Gamepad;

  it('L1 / LB (pris d’instinct par Xavier) comme R1 / RB préparent la contre-vitre', () => {
    expect(readGamepad(pad([4])).wallButton).toBe(true);
    expect(readGamepad(pad([5])).wallButton).toBe(true);
    expect(readGamepad(pad([])).wallButton).toBe(false);
  });
});
