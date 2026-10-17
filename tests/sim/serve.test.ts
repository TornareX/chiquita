import { describe, expect, it } from 'vitest';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { DEFAULT_RULES, type ServeSide } from '../../src/sim/score';
import { inServiceBox, servePositions, serveTarget } from '../../src/sim/serve';
import { vec3 } from '../../src/sim/vec3';

const SIDES: ServeSide[] = ['right', 'left'];

describe('carré de service', () => {
  it('joueur 0 sert à droite : carré du receveur en x > 0, avant la ligne de service', () => {
    expect(inServiceBox(vec3(2, 0, 4), 1, 'right')).toBe(true);
    expect(inServiceBox(vec3(-2, 0, 4), 1, 'right')).toBe(false);
    expect(inServiceBox(vec3(2, 0, 7.5), 1, 'right')).toBe(false);
    expect(inServiceBox(vec3(-2, 0, 4), 1, 'left')).toBe(true);
    // Côté joueur 0 : carrés inversés.
    expect(inServiceBox(vec3(-2, 0, -4), -1, 'right')).toBe(true);
  });

  it('serveur et receveur se placent en diagonale', () => {
    for (const side of SIDES) {
      const { server, receiver } = servePositions(-1, side, ARCADE);
      expect(Math.sign(server.x)).toBe(-Math.sign(receiver.x));
      expect(server.z).toBeLessThan(0);
      expect(receiver.z).toBeGreaterThan(0);
    }
  });

  it('quelle que soit la visée au stick, la cible est dans le bon carré', () => {
    for (const server of [-1, 1] as const)
      for (const side of SIDES)
        for (const forward of [-1, 0, 1])
          for (const right of [-1, 0, 1])
            for (const perfect of [false, true]) {
              const target = serveTarget(server, side, { forward, right }, perfect, ARCADE);
              expect(inServiceBox(target, -server as -1 | 1, side)).toBe(true);
            }
  });
});

/** Le joueur 0 lâche la balle, garde le bouton `holdAfterIdeal` secondes après le sommet du rebond, puis relâche. */
function serveWith(duel: Duel, holdAfterIdeal: number | null): void {
  const press: ArcadeCommands = { stick: { forward: 0, right: 0 }, shot: 'normal' };
  while (duel.phase !== 'serve') duel.step();
  for (let i = 0; i < 0.5 / SIM_DT; i++) duel.step();
  duel.step([press, NEUTRAL_ARCADE]);
  expect(duel.toss).not.toBeNull();
  const ideal = duel.toss!.idealTick;
  while (duel.toss) {
    const held = holdAfterIdeal !== null && duel.tick < ideal + Math.round(holdAfterIdeal / SIM_DT);
    duel.step([held ? press : NEUTRAL_ARCADE, NEUTRAL_ARCADE]);
  }
}

describe('service', () => {
  it('appui bref : la balle rebondit, part au sommet et tombe dans le carré', () => {
    const duel = new Duel();
    serveWith(duel, null);
    expect(duel.shot?.serve).toBe(true);
    expect(duel.shot?.perfect).toBe(false);
    while (duel.phase === 'rally' && duel.bounces === 0) duel.step();
    expect(duel.lastServeCall).toBeNull();
    expect(duel.bounces).toBe(1);
  });

  it('relâcher au sommet du rebond : service parfait', () => {
    const duel = new Duel();
    serveWith(duel, 0);
    expect(duel.shot?.perfect).toBe(true);
  });

  it('relâcher en retard : le service part long, faute', () => {
    const duel = new Duel();
    serveWith(duel, 0.11);
    expect(duel.shot?.serve).toBe(true);
    while (duel.phase === 'rally') duel.step();
    expect(duel.lastServeCall).toEqual({ call: 'fault', reason: 'box', serveNumber: 1 });
    expect(duel.serveNumber).toBe(2);
  });

  it('maintenir trop longtemps deux fois : double faute, point au receveur', () => {
    const duel = new Duel(DEFAULT_RULES);
    serveWith(duel, 0.4);
    expect(duel.lastServeCall?.reason).toBe('late');
    expect(duel.match!.points).toEqual([0, 0]);
    serveWith(duel, 0.4);
    expect(duel.lastResult?.reason).toBe('double-fault');
    expect(duel.match!.points).toEqual([0, 1]);
  });
});

describe('match contre l’IA', () => {
  function match(seed: number): Duel {
    const duel = new Duel(DEFAULT_RULES);
    const bots = [new Bot(0, seed, AI_LEVELS.normal), new Bot(1, seed + 1, AI_LEVELS.normal)] as const;
    while (duel.phase !== 'over' && duel.time < 3600) duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    return duel;
  }

  it('un set complet se joue du début à la fin', () => {
    const duel = match(1);
    expect(duel.phase).toBe('over');
    const [set] = duel.match!.sets;
    expect(Math.max(...set!)).toBeGreaterThanOrEqual(6);
    expect(duel.match!.winner).not.toBeNull();
  }, 30000);

  it('est déterministe', () => {
    expect(match(2).match!.sets).toEqual(match(2).match!.sets);
  }, 60000);

  it('les niveaux se classent : le fort bat le facile', () => {
    const duel = new Duel(DEFAULT_RULES);
    const bots = [new Bot(0, 5, AI_LEVELS.facile), new Bot(1, 6, AI_LEVELS.fort)] as const;
    while (duel.phase !== 'over' && duel.time < 3600) duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    expect(duel.match!.winner).toBe(1);
  }, 30000);

  it('un appui après la fin du match relance une partie', () => {
    const duel = match(1);
    for (let i = 0; i < 1.5 / SIM_DT; i++) duel.step();
    duel.step([{ stick: { forward: 0, right: 0 }, shot: 'normal' }, NEUTRAL_ARCADE]);
    expect(duel.phase).toBe('serve');
    expect(duel.match!.sets).toEqual([]);
    expect(duel.match!.points).toEqual([0, 0]);
  }, 30000);
});
