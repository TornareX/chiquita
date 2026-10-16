import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT, type BotOptions } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type AssistLevel, type DuelShot, type PointResult } from '../../src/sim/duel';

/**
 * Fait jouer deux joueurs automatiques pendant `seconds` secondes simulées, via les mêmes commandes
 * qu'une manette. Retourne les échanges terminés, plus celui en cours à la fin.
 */
function play(
  seconds: number,
  seed: number,
  options: BotOptions = DEFAULT_BOT,
  assist: AssistLevel = 'full',
): { results: PointResult[]; ongoing: number; manualShots: number; shots: DuelShot[]; whiffs: number } {
  const duel = new Duel();
  for (const player of duel.players) player.assist = assist;
  let manualShots = 0;
  let whiffs = 0;
  const shots: DuelShot[] = [];
  const bots = [new Bot(0, seed, options), new Bot(1, seed + 1, options)] as const;
  const results: PointResult[] = [];
  while (duel.time < seconds) {
    duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    if (duel.result) results.push(duel.result);
    if (duel.shot?.manual) manualShots++;
    if (duel.shot) shots.push(duel.shot);
    for (const player of duel.players) if (player.lastWhiffTick === duel.tick - 1) whiffs++;
  }
  return { results, ongoing: duel.phase === 'rally' ? duel.hits : 0, manualShots, shots, whiffs };
}

describe('échange arcade 1 contre 1', () => {
  it('deux joueurs automatiques tiennent des échanges d’au moins 10 coups', () => {
    for (const seed of [7, 21, 99]) {
      const { results, ongoing } = play(600, seed);
      const lengths = [...results.map((r) => r.hits), ongoing].filter((n) => n > 0);
      const reasons = results.map((r) => r.reason);
      console.log(`seed ${seed} · longueurs : ${lengths.join(', ')} · fins : ${reasons.join(', ')}`);
      // La moitié des coups joués au moins le sont dans des échanges de 10 coups ou plus.
      const total = lengths.reduce((a, b) => a + b, 0);
      const inLong = lengths.filter((n) => n >= 10).reduce((a, b) => a + b, 0);
      expect(Math.max(...lengths)).toBeGreaterThanOrEqual(10);
      expect(inLong / total).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('est déterministe : mêmes commandes, même échange', () => {
    const summary = (): string[] => play(120, 3).results.map((r) => `${r.hits}:${r.reason}:${r.winner}`);
    const a = summary();
    const b = summary();
    expect(a).toEqual(b);
  });

  for (const [assist, manualPlacement] of [
    ['partial', false],
    ['partial', true],
    ['off', true],
  ] as const) {
    it(`assistance ${assist}${manualPlacement ? ', placement manuel' : ''} : l’échange tient 10 coups`, () => {
      const { results, ongoing, manualShots } = play(120, 7, { ...DEFAULT_BOT, manualPlacement }, assist);
      const longest = Math.max(ongoing, ...results.map((r) => r.hits));
      expect(longest).toBeGreaterThanOrEqual(10);
      // Le placement manuel n'arrive que si le joueur le choisit (le service compte comme non manuel).
      if (manualPlacement) expect(manualShots).toBeGreaterThan(0);
      else expect(manualShots).toBe(0);
    });
  }
});

describe('assistance partielle', () => {
  /** Sert, puis le receveur appuie sur A ; `stick(tick)` donne son stick à chaque pas. */
  function receive(stick: (ticksSincePress: number) => ArcadeCommands['stick'], heldAtPress = { forward: 0, right: 0 }) {
    const duel = new Duel();
    duel.players[1].assist = 'partial';
    const serve: ArcadeCommands = { stick: { forward: 0, right: 0 }, shot: 'normal' };
    for (let i = 0; i < 0.5 / SIM_DT; i++) duel.step();
    duel.step([serve, NEUTRAL_ARCADE]);
    duel.step();
    duel.step([NEUTRAL_ARCADE, { stick: heldAtPress, shot: 'normal' }]);
    for (let i = 1; i < 0.3 / SIM_DT; i++) duel.step([NEUTRAL_ARCADE, { stick: stick(i), shot: null }]);
    return duel.players[1].engagement;
  }

  it('bouger le stick tôt après l’appui reprend la main', () => {
    const engagement = receive((i) => (i > 20 ? { forward: 0, right: 1 } : { forward: 0, right: 0 }));
    expect(engagement?.manual).toBe(true);
  });

  it('garder la direction tenue pendant l’appui laisse la course assistée', () => {
    const held = { forward: 0.8, right: -0.5 };
    const engagement = receive(() => held, held);
    expect(engagement?.manual).toBe(false);
    expect(engagement?.plan).not.toBeNull();
  });
});

describe('fenêtre de timing : maintenir puis relâcher', () => {
  const rallyShots = (shots: DuelShot[]): DuelShot[] => shots.filter((shot) => !shot.serve);

  it('appui bref : coup normal, jamais raté', () => {
    const { shots, whiffs } = play(60, 7);
    expect(rallyShots(shots).length).toBeGreaterThan(20);
    expect(rallyShots(shots).every((shot) => !shot.perfect && shot.timing < 0)).toBe(true);
    expect(whiffs).toBe(0);
  });

  it('relâcher au moment de l’impact : frappe parfaite, plus rapide', () => {
    const tap = play(60, 7).shots.filter((s) => !s.serve && s.kind === 'normal');
    const { shots, results, ongoing } = play(60, 7, { ...DEFAULT_BOT, release: { offset: 0, spread: 0 } });
    const perfect = rallyShots(shots);
    expect(perfect.length).toBeGreaterThan(20);
    expect(perfect.every((shot) => shot.perfect)).toBe(true);
    const average = (list: DuelShot[]): number => list.reduce((a, s) => a + s.speed, 0) / list.length;
    expect(average(perfect.filter((s) => s.kind === 'normal'))).toBeGreaterThan(average(tap) * 1.08);
    // Plus rapides, les frappes parfaites restent jouables par la course assistée.
    expect(Math.max(ongoing, ...results.map((r) => r.hits))).toBeGreaterThanOrEqual(10);
  });

  it('relâcher un peu après l’impact : coup normal, dans la fenêtre de retard', () => {
    const { shots, whiffs } = play(60, 7, { ...DEFAULT_BOT, release: { offset: 0.09, spread: 0 } });
    const rally = rallyShots(shots);
    expect(rally.length).toBeGreaterThan(10);
    expect(rally.every((shot) => !shot.perfect && shot.timing > 0)).toBe(true);
    expect(whiffs).toBe(0);
  });

  it('maintenir trop longtemps : coup raté, point perdu, pas de seconde chance', () => {
    const { shots, whiffs, results } = play(30, 7, { ...DEFAULT_BOT, release: { offset: 0.4, spread: 0 } });
    expect(rallyShots(shots)).toHaveLength(0);
    expect(whiffs).toBeGreaterThan(0);
    expect(results.every((r) => r.hits === 1)).toBe(true);
  });

  it('un joueur imprécis mélange frappes parfaites et coups normaux', () => {
    const { shots } = play(120, 21, { ...DEFAULT_BOT, release: { offset: 0, spread: 0.1 } });
    const rally = rallyShots(shots);
    const perfect = rally.filter((s) => s.perfect).length;
    expect(perfect).toBeGreaterThan(0);
    expect(perfect).toBeLessThan(rally.length);
  });
});
