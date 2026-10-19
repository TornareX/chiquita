import { describe, expect, it } from 'vitest';
import { Effects, SlideDetector, slideLook } from '../../src/render/effects';
import { hitstopMs, juiceFlags } from '../../src/render/juice';
import { swingLook } from '../../src/render/swingTrail';
import { deepClone, ReplayRecorder, replayWorthy } from '../../src/modes/replay';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { SIM_DT } from '../../src/sim/constants';
import { Duel } from '../../src/sim/duel';

/** Vitesses au sol successives d'un joueur, un pas de simulation chacune. */
function run(detector: SlideDetector, velocities: { x: number; z: number }[]): ReturnType<SlideDetector['update']>[] {
  return velocities.map((v) => detector.update(0, v, SIM_DT));
}

/** De `from` à `to` (m/s, le long de x) à `rate` m/s², puis tenu. */
function ramp(from: number, to: number, rate: number, hold = 0.3): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let v = from;
  for (let t = 0; t < 1.5; t += SIM_DT) {
    out.push({ x: v, z: 0 });
    v = v < to ? Math.min(to, v + rate * SIM_DT) : Math.max(to, v - rate * SIM_DT);
  }
  for (let t = 0; t < hold; t += SIM_DT) out.push({ x: to, z: 0 });
  return out;
}

describe('V7 — gerbe de sable aux glissades', () => {
  it('un freinage sec en pleine course soulève du sable, devant le joueur', () => {
    const slides = run(new SlideDetector(), [...ramp(0, 5, 20), ...ramp(5, 0, 26)]).filter((s) => s !== null);
    expect(slides.length).toBeGreaterThan(0);
    expect(slides[0]!.dx).toBeGreaterThan(0.9);
  });

  it('un départ, une course régulière ou un petit pas ne soulèvent rien', () => {
    expect(run(new SlideDetector(), ramp(0, 5, 40)).every((s) => s === null)).toBe(true);
    expect(run(new SlideDetector(), ramp(2, 0, 26)).every((s) => s === null)).toBe(true);
  });

  it('un demi-tour en course fait une gerbe plus forte qu’un freinage', () => {
    const stop = run(new SlideDetector(), [...ramp(0, 5, 20), ...ramp(5, 0, 26)]).find((s) => s !== null)!;
    const turn = run(new SlideDetector(), [...ramp(0, 5, 20), ...ramp(5, -5, 26)]).find((s) => s !== null)!;
    expect(turn.strength).toBeGreaterThanOrEqual(stop.strength);
  });

  it('pause entre deux gerbes d’un même joueur, et gerbes en trois tailles', () => {
    const slides = run(new SlideDetector(), [...ramp(0, 5, 20), ...ramp(5, -5, 26), ...ramp(-5, 5, 26)]).filter((s) => s !== null);
    expect(slides.length).toBeLessThan(10);
    expect(slideLook(1).count).toBeGreaterThan(slideLook(0).count);
    const fx = new Effects();
    fx.slide(0, 0, 1, 0, 1);
    expect(fx.spawned.slide).toBe(1);
    expect(fx.particles.activeCount).toBe(slideLook(1).count);
  });
});

describe('V7 — arc de raquette et micro-pause', () => {
  it('arc plus vif sur un coup fort, doré sur une frappe parfaite, pâle dans le vide', () => {
    const normal = swingLook({ perfect: false, overhead: null, speed: 15 });
    const perfect = swingLook({ perfect: true, overhead: null, speed: 15 });
    const smash = swingLook({ perfect: false, overhead: 'remate', speed: 28 });
    const whiff = swingLook(null);
    expect(perfect.strength).toBeGreaterThan(normal.strength);
    expect(smash.strength).toBeGreaterThan(normal.strength);
    expect(smash.life).toBeGreaterThan(normal.life);
    expect(perfect.color).not.toBe(normal.color);
    expect(whiff.strength).toBeLessThan(normal.strength);
  });

  it('micro-pause : rien sur un coup ordinaire, plus longue sur un smash parfait, réglable et coupable', () => {
    expect(hitstopMs({ perfect: false, overhead: null })).toBe(0);
    expect(hitstopMs({ perfect: true, overhead: null })).toBe(40);
    expect(hitstopMs({ perfect: true, overhead: 'remate' })).toBeGreaterThan(hitstopMs({ perfect: false, overhead: 'remate' }));
    expect(hitstopMs({ perfect: true, overhead: 'remate' }, 0)).toBe(0);
    expect(juiceFlags('?hitstop=0').hitstop).toBe(0);
    expect(juiceFlags('?hitstop=1.5').hitstop).toBe(1.5);
  });

  it('chaque effet se coupe par l’URL, et `?juice=0` les coupe tous', () => {
    expect(juiceFlags('')).toEqual({ sand: true, swingArc: true, squash: true, replay: 'big', hitstop: 1 });
    expect(juiceFlags('?arc=0').swingArc).toBe(false);
    expect(juiceFlags('?ralenti=tous').replay).toBe('all');
    expect(juiceFlags('?juice=0')).toEqual({ sand: false, swingArc: false, squash: false, replay: 'off', hitstop: 0 });
  });
});

describe('V7 — ralenti du coup gagnant', () => {
  it('la copie garde les classes et les partages, sans toucher à l’original', () => {
    const duel = new Duel(null);
    duel.players[0]!.prevPos = duel.players[0]!.pos;
    const copy = deepClone(duel);
    expect(copy).toBeInstanceOf(Duel);
    expect(copy.players[0]!.prevPos).toBe(copy.players[0]!.pos);
    expect(copy.players[0]).not.toBe(duel.players[0]);
    copy.step();
    expect(duel.tick).toBe(0);
    // Méthode remplacée sur l'original (tests, outils) : la copie garde celle de sa classe.
    const step = duel.step.bind(duel);
    duel.step = (commands) => step(commands);
    const second = deepClone(duel);
    second.step();
    expect(second.tick).toBe(1);
    expect(duel.tick).toBe(0);
  });

  it('le ralenti rejoue exactement le point qui vient de finir', () => {
    const duel = new Duel(null);
    const bots = duel.players.map((_, i) => new Bot(i, 7 + i, AI_LEVELS.normal));
    const recorder = new ReplayRecorder();
    let checked = 0;
    for (let t = 0; t < 120 / SIM_DT && checked < 3; t++) {
      const commands = bots.map((bot) => bot.commands(duel));
      recorder.record(duel, commands);
      duel.step(commands);
      if (!duel.result || !replayWorthy(duel, 'all')) continue;
      const replay = recorder.replay(duel);
      expect(replay).not.toBeNull();
      const ball = { ...duel.ball!.pos };
      // Le ralenti part avant la fin du point et y passe : à ce pas, balle et joueurs sont au même endroit.
      expect(replay!.duel.tick).toBeLessThan(duel.tick);
      while (replay!.duel.tick < duel.tick) replay!.advance((SIM_DT / replay!.speed) * 1.0001, () => {});
      expect(replay!.duel.ball!.pos).toEqual(ball);
      expect(replay!.duel.lastResult).toEqual(duel.lastResult);
      expect(replay!.speed).toBeLessThan(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
