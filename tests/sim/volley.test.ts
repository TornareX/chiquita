import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import { stepBall } from '../../src/sim/collisions';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, shotStyle } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { overheadTarget, solveShot } from '../../src/sim/shots';
import { vec3 } from '../../src/sim/vec3';

/** Volée coupée et volée basse (journal des frappes, 22/10) : courtes à préparer, basses même ratées. */
describe('volée coupée', () => {
  const still = { forward: 0, right: 0 };

  it('préparée 0,15 s : coupée, pas bloquée ; au sol, il faut toujours 0,3 s', () => {
    expect(shotStyle('slice', true, false, still, 0.15, ARCADE)).toBe('cut');
    expect(shotStyle('slice', true, false, still, 0.08, ARCADE)).toBe('block');
    expect(shotStyle('normal', false, false, still, 0.15, ARCADE)).toBe('block');
  });

  /** Sommet (m) et vitesse horizontale (m/s) d'un coup joué de `height` m à `net` m du filet, avec `error`. */
  function flight(kind: 'cut' | 'lowVolley', height: number, net: number, error: number): { apex: number; speed: number } {
    const p = ARCADE.rally.pressure;
    const contact = vec3(0, height, -net);
    const target = vec3(0, 0.03, ARCADE.rally[kind].depthNeutral + error * p.long);
    const solved = solveShot(kind, contact, target, false, ARCADE, 1 - p.speedLoss * error, error * p.clearance * p.volleyClearance);
    const ball = createBall(contact, solved.vel, solved.spin);
    let apex = ball.pos.y;
    for (let t = 0; t < 2 && !(t > 0.1 && ball.pos.y < 0.05); t += SIM_DT) {
      stepBall(ball, SIM_DT, ARCADE, []);
      apex = Math.max(apex, ball.pos.y);
    }
    return { apex, speed: Math.hypot(solved.vel.x, solved.vel.z) };
  }

  it('ratée, elle reste basse et tendue : pas un lob', () => {
    const clean = flight('cut', 1.08, 1.15, 0);
    const missed = flight('cut', 1.08, 1.15, 0.95);
    // Avant : 9,6 m/s et 1,69 m de sommet, une seconde de vol.
    expect(missed.apex).toBeLessThan(1.35);
    expect(missed.speed).toBeGreaterThan(clean.speed * 0.8);
  });

  it('volée basse ratée : remonte sans s’envoler', () => {
    expect(flight('lowVolley', 0.39, 3.44, 1).apex).toBeLessThan(1.55);
  });

  it('au filet, préparée juste avant la balle : volée coupée', () => {
    const duel = new Duel();
    duel.phase = 'rally';
    duel.lastHitter = 0;
    duel.hits = 2;
    duel.players[0].lastHitTick = duel.tick;
    const player = duel.players[1];
    player.pos = player.prevPos = vec3(0, 0, 2.5);
    player.assist = 'off';
    duel.ball = createBall(vec3(-0.6, 1.3, -3), vec3(0, 2, 10));
    // Geste au stick : rien, puis préparé 0,15 s avant que la balle arrive, et relâché à son passage.
    while (duel.ball!.pos.z < 2.5 - 0.15 * 10) duel.step();
    const swing = { prepared: true };
    while (duel.ball!.pos.z < 2.45) duel.step([NEUTRAL_ARCADE, { stick: { forward: 0, right: 0 }, shot: 'overhead', swing }]);
    for (let i = 0; i < 0.3 / SIM_DT && player.lastHitTick === -Infinity; i++) {
      duel.step([NEUTRAL_ARCADE, { stick: { forward: 0, right: 0 }, shot: null, swing: { prepared: true, end: 'straight' } }]);
    }
    expect(duel.shot?.player).toBe(1);
    expect(duel.shot?.volley).toBe(true);
    expect(duel.shot?.style).toBe('cut');
  });
});

describe('feinte de smash', () => {
  it('profonde et basse : rebondit au fond, arrive basse dans la vitre (pas un lob)', () => {
    // Le cas du journal : jouée de loin (6,5 m du filet), à 1,4 m de haut.
    const contact = vec3(0, 1.4, -6.5);
    const target = vec3(0, 0.03, ARCADE.rally.feinte.depthNeutral);
    const solved = solveShot('feinte', contact, target, false, ARCADE);
    const ball = createBall(contact, solved.vel, solved.spin);
    const contacts: { surface: string; pos: { y: number; z: number } }[] = [];
    let apex = ball.pos.y;
    let bounce: number | null = null;
    let glass: number | null = null;
    for (let t = 0; t < 3 && glass === null; t += SIM_DT) {
      contacts.length = 0;
      stepBall(ball, SIM_DT, ARCADE, contacts as never);
      apex = Math.max(apex, ball.pos.y);
      for (const c of contacts) {
        if (c.surface === 'ground' && bounce === null) bounce = c.pos.z;
        if (c.surface === 'glass') glass = c.pos.y;
      }
    }
    // Avant : sommet 2,4 m, rebond à 5,5 m, second rebond avant la vitre.
    expect(apex).toBeLessThan(2);
    expect(bounce).toBeGreaterThan(6.5);
    expect(glass).not.toBeNull();
    expect(glass!).toBeLessThan(0.6);
  });
});

describe('service et víbora (Xavier, 23/10)', () => {
  it('pas de service lobé : un service demandé en lob part comme un service normal', () => {
    const duel = new Duel();
    for (let i = 0; i < 0.7 / SIM_DT; i++) duel.step();
    const server = duel.server;
    const lob = { stick: { forward: 0, right: 0 }, shot: 'lob' as const };
    const commands = (shot: typeof lob | typeof NEUTRAL_ARCADE): typeof NEUTRAL_ARCADE[] => duel.players.map((_, i) => (i === server ? shot : NEUTRAL_ARCADE));
    duel.step(commands(lob));
    for (let i = 0; i < 3 / SIM_DT && duel.phase !== 'rally'; i++) duel.step(commands(duel.toss && duel.tick >= duel.toss.idealTick ? NEUTRAL_ARCADE : lob));
    expect(duel.shot?.serve).toBe(true);
    expect(duel.shot?.kind).toBe('normal');
  });

  it('víbora sans direction latérale : vers le centre, plus le long de la ligne', () => {
    for (const x of [-2, 0, 2]) {
      const target = overheadTarget('vibora', -1, { forward: 0, right: 0 }, false, ARCADE, x, 4);
      expect(Math.abs(target.x)).toBeLessThan(1);
    }
    // Visée vers un côté : contre la vitre latérale de ce côté.
    expect(Math.abs(overheadTarget('vibora', -1, { forward: 0, right: 1 }, false, ARCADE, 0, 4).x)).toBeGreaterThan(3.5);
  });
});
