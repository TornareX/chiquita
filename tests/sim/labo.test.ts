import { describe, expect, it } from 'vitest';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel } from '../../src/sim/duel';
import { applyFeel, FEEL_LIMITS, FEEL_PRESETS, feelOf, sanitizeFeel } from '../../src/sim/feel';
import { ARCADE } from '../../src/sim/profile';
import { SITUATIONS } from '../../src/sim/situations';

describe('réglages de sensation', () => {
  it('le préréglage arcade est le profil du jeu', () => {
    const profile = structuredClone(ARCADE);
    applyFeel(profile, FEEL_PRESETS.arcade.feel);
    expect(profile).toEqual(ARCADE);
  });

  it('s’appliquent au profil et se relisent', () => {
    const profile = structuredClone(ARCADE);
    applyFeel(profile, FEEL_PRESETS.reel.feel);
    expect(profile.gravity).toBe(9.81);
    expect(profile.rally.normal.speed).toBeCloseTo(ARCADE.rally.normal.speed * FEEL_PRESETS.reel.feel.shotSpeed, 9);
    // Le lob et le remate ne suivent pas la vitesse des coups.
    expect(profile.rally.lob).toEqual(ARCADE.rally.lob);
    expect(profile.rally.remate).toEqual(ARCADE.rally.remate);
    const back = feelOf(profile);
    for (const key of Object.keys(back) as (keyof typeof back)[]) expect(back[key]).toBeCloseTo(FEEL_PRESETS.reel.feel[key], 9);
  });

  it('les valeurs mémorisées hors limites ou invalides sont ramenées', () => {
    const feel = sanitizeFeel({ gravity: 99, groundBounce: 'x', runSpeed: 5 }, FEEL_PRESETS.arcade.feel);
    expect(feel.gravity).toBe(FEEL_LIMITS.gravity.max);
    expect(feel.groundBounce).toBe(FEEL_PRESETS.arcade.feel.groundBounce);
    expect(feel.runSpeed).toBe(5);
  });
});

describe('situations de match du labo', () => {
  // L'atelier, lui, change de balle à chaque départ : testé plus bas.
  for (const situation of SITUATIONS.filter((s) => !s.workshop)) {
    it(`${situation.name} : le point se joue, puis repart à l’identique`, () => {
      const play = (): { first: string; result: string } => {
        const duel = new Duel(null);
        const bot = new Bot(1, 2, AI_LEVELS.normal);
        situation.start(duel);
        let first = '';
        for (let i = 0; i < 12 / SIM_DT && !duel.result; i++) {
          duel.step([NEUTRAL_ARCADE, bot.commands(duel)]);
          if (!first && duel.ball && duel.lastHitter === 1 && duel.phase === 'rally') {
            const ground = duel.contacts.find((c) => c.surface === 'ground');
            if (ground) first = `${ground.pos.x.toFixed(3)},${ground.pos.z.toFixed(3)}`;
          }
        }
        return { first, result: JSON.stringify(duel.result) };
      };
      const a = play();
      // Bleu ne joue pas : Rouge gagne le point, et sa balle d'ouverture tombe dans le camp de Bleu.
      expect(JSON.parse(a.result)?.winner).toBe(1);
      expect(Number(a.first.split(',')[1])).toBeLessThan(0);
      expect(play()).toEqual(a);
    });
  }
});

describe('atelier contre-vitre', () => {
  it('des balles variées vers la vitre de Bleu : lobs, passings et balles basses, toutes dans son camp', () => {
    const workshop = SITUATIONS.find((s) => s.workshop)!;
    const landings: { lob: boolean; x: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const duel = new Duel(null);
      workshop.start(duel);
      const lob = duel.shot?.kind === 'lob';
      // Premier rebond chez Bleu (z < 0), au fond.
      for (let t = 0; t < 4 / SIM_DT && duel.bounces === 0 && !duel.result; t++) duel.step();
      expect(duel.ball!.pos.z).toBeLessThan(-5.5);
      landings.push({ lob, x: duel.ball!.pos.x });
    }
    const lobs = landings.filter((l) => l.lob).length;
    expect(lobs).toBeGreaterThan(4);
    expect(lobs).toBeLessThan(25);
    // Des balles des deux côtés.
    expect(landings.some((l) => l.x < -1.5) && landings.some((l) => l.x > 1.5)).toBe(true);
  });
});
