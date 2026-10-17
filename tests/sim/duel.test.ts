import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT, type BotOptions } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { HALF_LENGTH } from '../../src/sim/constants';
import { Duel, type AssistLevel, type DuelShot, type PointResult } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { aimTarget, lateDrift } from '../../src/sim/shots';
import { vec3, type Vec3 } from '../../src/sim/vec3';
import { createBall } from '../../src/sim/ball';

/**
 * Fait jouer deux joueurs automatiques pendant `seconds` secondes simulées, via les mêmes commandes
 * qu'une manette. Retourne les échanges terminés, plus celui en cours à la fin.
 */
function play(
  seconds: number,
  seed: number,
  /** Réglages des deux joueurs automatiques, ou les mêmes pour les deux. */
  options: BotOptions | readonly [BotOptions, BotOptions] = DEFAULT_BOT,
  assist: AssistLevel = 'full',
): { results: PointResult[]; ongoing: number; manualShots: number; shots: DuelShot[]; whiffs: number } {
  const duel = new Duel();
  for (const player of duel.players) player.assist = assist;
  let manualShots = 0;
  let whiffs = 0;
  const shots: DuelShot[] = [];
  const [a, b] = Array.isArray(options) ? options : [options, options];
  const bots = [new Bot(0, seed, a as BotOptions), new Bot(1, seed + 1, b as BotOptions)] as const;
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
    // Balle lâchée : le service part au sommet du rebond.
    while (duel.phase !== 'rally') duel.step();
    duel.step();
    duel.step([NEUTRAL_ARCADE, { stick: heldAtPress, shot: 'normal' }]);
    // Bouton maintenu : la frappe ne part qu'au relâcher.
    for (let i = 1; i < 0.3 / SIM_DT; i++) duel.step([NEUTRAL_ARCADE, { stick: stick(i), shot: 'normal' }]);
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
    // Au-dessus de la tête, la balle n'est frappable qu'en dessous de 3 m : un appui tôt peut tomber juste.
    const low = rallyShots(shots).filter((shot) => shot.kind !== 'overhead');
    expect(low.every((shot) => !shot.perfect && shot.timing < 0)).toBe(true);
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
    const { shots, whiffs } = play(60, 7, { ...DEFAULT_BOT, release: { offset: 0.06, spread: 0 } });
    const rally = rallyShots(shots);
    expect(rally.length).toBeGreaterThan(10);
    expect(rally.every((shot) => !shot.perfect && shot.timing > 0)).toBe(true);
    expect(whiffs).toBe(0);
  });

  it('plus le relâcher est tardif, plus la balle part large et long', () => {
    const p = ARCADE;
    const aimed = aimTarget('normal', -1, { forward: 0, right: 0.5 }, false, p);
    const at = (timing: number): Vec3 => lateDrift(aimed, -1, timing, p);
    expect(at(-0.3)).toEqual(aimed);
    expect(at(p.rally.perfectAfter)).toEqual(aimed);
    const a = at(0.07);
    const b = at(p.rally.lateWindow);
    expect(Math.abs(b.x)).toBeGreaterThan(Math.abs(a.x));
    expect(Math.abs(a.x)).toBeGreaterThan(Math.abs(aimed.x));
    expect(b.z).toBeGreaterThan(a.z);
    // En fin de fenêtre, un coup au neutre finit au-delà de la vitre du fond : faute.
    expect(b.z).toBeGreaterThan(HALF_LENGTH);
  });

  it('maintenir trop longtemps : coup raté, point perdu, pas de seconde chance', () => {
    // Le joueur 1 garde le bouton trop longtemps : il rate ses retours et ses services.
    const late = { ...DEFAULT_BOT, release: { offset: 0.4, spread: 0 } };
    const { shots, whiffs, results } = play(30, 7, [DEFAULT_BOT, late]);
    expect(rallyShots(shots)).toHaveLength(0);
    expect(whiffs).toBeGreaterThan(0);
    expect(results.every((r) => r.winner === 0)).toBe(true);
    expect(results.map((r) => r.reason)).toContain('double-fault');
    expect(results.map((r) => r.reason)).toContain('second-bounce');
  });

  it('un joueur imprécis mélange frappes parfaites et coups normaux', () => {
    const { shots } = play(120, 21, { ...DEFAULT_BOT, release: { offset: 0, spread: 0.1 } });
    const rally = rallyShots(shots);
    const perfect = rally.filter((s) => s.perfect).length;
    expect(perfect).toBeGreaterThan(0);
    expect(perfect).toBeLessThan(rally.length);
  });
});

describe('frappe au relâcher et assistance aimant', () => {
  /** Échange en cours : le joueur 0 vient de frapper `ball`, le joueur 1 attend en `pos`. */
  function rally(pos: Vec3, ballPos: Vec3, ballVel: Vec3, assist: AssistLevel = 'magnet'): Duel {
    const duel = new Duel();
    duel.phase = 'rally';
    duel.lastHitter = 0;
    duel.hits = 2;
    duel.players[0].lastHitTick = duel.tick;
    duel.players[1].pos = duel.players[1].prevPos = pos;
    duel.players[1].assist = assist;
    duel.ball = createBall(ballPos, ballVel);
    return duel;
  }
  const hold = (stick = { forward: 0, right: 0 }): [ArcadeCommands, ArcadeCommands] => [NEUTRAL_ARCADE, { stick, shot: 'normal' }];
  const release: [ArcadeCommands, ArcadeCommands] = [NEUTRAL_ARCADE, NEUTRAL_ARCADE];

  it('la frappe part au relâcher : volée prise quand le joueur veut', () => {
    const duel = rally(vec3(0, 0, 2.5), vec3(0.6, 1.2, -3), vec3(0, 0.5, 12));
    while (duel.ball!.pos.z < 1.9) duel.step(hold());
    duel.step(release);
    expect(duel.shot).not.toBeNull();
    expect(duel.shot!.volley).toBe(true);
    expect(duel.shot!.contact.z).toBeLessThan(2);
  });

  it('relâcher trop tôt : coup dans le vide, puis on peut réarmer', () => {
    const duel = rally(vec3(0, 0, 2.5), vec3(0.6, 1.2, -6), vec3(0, 0.5, 8));
    duel.step(hold());
    duel.step(release);
    for (let i = 0; i < 0.2 / SIM_DT; i++) duel.step(release);
    expect(duel.players[1].engagement).toBeNull();
    expect(duel.players[1].lastWhiffTick).toBeGreaterThan(0);
    expect(duel.shot).toBeNull();
    for (let i = 0; i < ARCADE.rally.recoverTime / SIM_DT; i++) duel.step(release);
    duel.step(hold());
    expect(duel.players[1].engagement).not.toBeNull();
  });

  it('maintenu, sans relâcher : pas de frappe, la balle passe', () => {
    const duel = rally(vec3(0, 0, 2.5), vec3(0.6, 1.2, -3), vec3(0, 0.5, 12));
    for (let i = 0; i < 0.8 / SIM_DT && duel.phase === 'rally'; i++) duel.step(hold());
    expect(duel.players[1].lastHitTick).toBe(-Infinity);
  });

  // Balle profonde du côté opposé au joueur : le point d'impact est loin de lui.
  const far = (assist: AssistLevel): Duel => rally(vec3(-3, 0, 8.5), vec3(2, 1.2, -8), vec3(0.5, 3, 15), assist);

  it('aimant : loin du point d’impact, sans stick, le joueur ne bouge pas', () => {
    const duel = far('magnet');
    for (let i = 0; i < 0.3 / SIM_DT; i++) duel.step(hold());
    expect(duel.players[1].engagement?.plan).toBeTruthy();
    expect(duel.players[1].pos.x).toBeCloseTo(-3, 6);
    // Course assistée complète : il serait déjà parti.
    const full = far('full');
    for (let i = 0; i < 0.3 / SIM_DT; i++) full.step(hold());
    expect(full.players[1].pos.x).toBeGreaterThan(-2);
  });

  it('aimant : aller au-devant de la balle la fait prendre plus tôt', () => {
    const plannedTick = (forward: number): number => {
      const duel = far('magnet');
      // Il court vers la balle (à sa droite), en avançant vers le filet ou en reculant.
      for (let i = 0; i < 0.35 / SIM_DT; i++) duel.step(hold({ forward, right: 1 }));
      return duel.players[1].engagement!.plan!.tick;
    };
    expect(plannedTick(1)).toBeLessThan(plannedTick(-1));
  });
});
