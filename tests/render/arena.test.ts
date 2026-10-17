import { describe, expect, it } from 'vitest';
import { crowdSeats, CrowdMood, FILL, ROWS, SEAT_WIDTH, STANDS } from '../../src/render/arena';
import { HALF_LENGTH, HALF_WIDTH, RUNOFF_BACK, RUNOFF_SIDE } from '../../src/sim/constants';

describe('arène : tribunes et public', () => {
  const seats = crowdSeats();

  it('remplit les tribunes à ~88 %, toujours la même foule', () => {
    const places = STANDS.reduce((sum, s) => sum + Math.floor(s.length / SEAT_WIDTH) * ROWS, 0);
    expect(seats.length / places).toBeGreaterThan(FILL - 0.04);
    expect(seats.length / places).toBeLessThan(FILL + 0.04);
    expect(crowdSeats()).toEqual(seats);
    // Assez peu pour un seul maillage instancié par partie du corps.
    expect(seats.length).toBeLessThan(3000);
  });

  it('tribunes au-delà de la zone où le joueur peut sortir par la porte (8 m sur les côtés, 6 m au fond)', () => {
    for (const stand of STANDS) {
      if (stand.out[0] !== 0) expect(Math.abs(stand.origin[0]) - HALF_WIDTH).toBeGreaterThan(RUNOFF_SIDE);
      else expect(Math.abs(stand.origin[1]) - HALF_LENGTH).toBeGreaterThan(RUNOFF_BACK);
    }
  });

  it('personne sur le terrain ni contre les vitres : les tribunes sont dehors', () => {
    for (const seat of seats) expect(Math.abs(seat.x) > HALF_WIDTH + RUNOFF_SIDE || Math.abs(seat.z) > HALF_LENGTH + RUNOFF_BACK).toBe(true);
  });

  it('chaque spectateur regarde le terrain', () => {
    for (const seat of seats) {
      const look = { x: Math.sin(seat.yaw), z: Math.cos(seat.yaw) };
      expect(look.x * -seat.x + look.z * -seat.z).toBeGreaterThan(0);
    }
  });

  it('les rangs montent en s’éloignant du terrain', () => {
    const far = seats.filter((s) => s.z > HALF_LENGTH + RUNOFF_BACK && Math.abs(s.x) < HALF_WIDTH + RUNOFF_SIDE);
    const near = far.reduce((a, b) => (b.z < a.z ? b : a));
    const back = far.reduce((a, b) => (b.z > a.z ? b : a));
    expect(back.y).toBeGreaterThan(near.y + 4);
  });
});

describe('humeur du public', () => {
  it('se lève et flashe sur une clameur, puis retombe', () => {
    const mood = new CrowdMood();
    mood.react({ kind: 'cheer', intensity: 1 });
    expect(mood.jump).toBe(1);
    expect(mood.flash).toBe(1);
    mood.update(3);
    expect(mood.jump).toBeLessThan(0.1);
    expect(mood.flash).toBeLessThan(0.05);
  });

  it('applaudissements : agité, peu de sauts ; souffle retenu : agité, sans saut ni flash', () => {
    const applause = new CrowdMood();
    applause.react({ kind: 'applause', intensity: 0.8 });
    expect(applause.stir).toBeCloseTo(0.8, 6);
    expect(applause.jump).toBeLessThan(0.35);
    const ooh = new CrowdMood();
    ooh.react({ kind: 'ooh', intensity: 0.8 });
    expect(ooh.stir).toBeGreaterThan(0.4);
    expect(ooh.jump).toBe(0);
    expect(ooh.flash).toBe(0);
  });
});
