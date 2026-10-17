import { describe, expect, it } from 'vitest';
import { contactRecipe, crowdReaction, panFor, shotRecipe, type Layer, type ShotSound, type SoundRecipe } from '../../src/audio/recipes';
import type { Contact, ContactSurface } from '../../src/sim/collisions';
import { vec3 } from '../../src/sim/vec3';

const contact = (surface: ContactSurface, speed = 10, x = 1.2, z = -6): Contact => ({ surface, pos: vec3(x, 0.5, z), speed });
const shot = (patch: Partial<ShotSound> = {}): ShotSound => ({
  speed: 18,
  quality: 0.7,
  perfect: false,
  contact: vec3(0.5, 1, -8),
  ...patch,
});

/** Énergie grossière d'une recette : somme des gains pondérés par la durée. */
const energy = (recipe: SoundRecipe): number => recipe.layers.reduce((sum, l) => sum + l.gain * l.duration, 0);
const length = (recipe: SoundRecipe): number =>
  Math.max(...recipe.layers.map((l) => (l.delay ?? 0) + (l.attack ?? 0) + l.duration));
const lowest = (recipe: SoundRecipe): number =>
  Math.min(...recipe.layers.filter((l): l is Extract<Layer, { type: 'tone' }> => l.type === 'tone').map((l) => l.from));

describe('sons des surfaces', () => {
  it('donne un timbre distinct à chaque surface', () => {
    const surfaces: ContactSurface[] = ['ground', 'glass', 'mesh', 'net', 'tape'];
    const recipes = surfaces.map((s) => JSON.stringify(contactRecipe(contact(s))?.layers));
    expect(new Set(recipes).size).toBe(surfaces.length);
  });

  it('la vitre résonne plus que le sol, le grillage frémit et dure, le filet est étouffé', () => {
    const ground = contactRecipe(contact('ground'))!;
    const glass = contactRecipe(contact('glass'))!;
    const mesh = contactRecipe(contact('mesh'))!;
    const net = contactRecipe(contact('net'))!;
    expect(length(glass)).toBeGreaterThan(2 * length(ground));
    expect(glass.reverb).toBeGreaterThan(ground.reverb);
    expect(lowest(glass)).toBeLessThan(150);
    expect(mesh.layers.some((l) => l.tremolo)).toBe(true);
    expect(length(mesh)).toBeGreaterThan(length(ground));
    const netNoise = net.layers.filter((l) => l.type === 'noise');
    expect(netNoise.some((l) => l.filter === 'lowpass' && l.frequency < 600)).toBe(true);
    expect(net.layers.every((l) => l.type === 'tone' || l.filter !== 'highpass')).toBe(true);
  });

  it('un impact plus fort sonne plus fort, une balle qui roule ne sonne pas', () => {
    expect(energy(contactRecipe(contact('glass', 14))!)).toBeGreaterThan(energy(contactRecipe(contact('glass', 4))!));
    expect(contactRecipe(contact('ground', 0.1))).toBeNull();
  });

  it('varie légèrement selon le point de contact, et toujours pareil au même point', () => {
    const a = contactRecipe(contact('glass', 10, 1.2));
    const b = contactRecipe(contact('glass', 10, 1.25));
    expect(a).toEqual(contactRecipe(contact('glass', 10, 1.2)));
    expect(a).not.toEqual(b);
    const fromA = a!.layers[2]!.type === 'tone' ? a!.layers[2]!.from : 0;
    const fromB = b!.layers[2]!.type === 'tone' ? b!.layers[2]!.from : 0;
    expect(Math.abs(fromA / fromB - 1)).toBeLessThan(0.12);
  });

  it('la balle qui passe le mur fait un souffle', () => {
    const exit = contactRecipe(contact('out', 12))!;
    expect(exit.layers.every((l) => l.type === 'noise' && l.frequencyTo !== undefined)).toBe(true);
  });

  it('place le son à gauche ou à droite selon la position', () => {
    expect(Math.sign(panFor(vec3(3, 0, 0)))).toBe(-Math.sign(panFor(vec3(-3, 0, 0))));
  });
});

describe('son de la raquette', () => {
  it('monte et se renforce avec la vitesse du coup', () => {
    const slow = shotRecipe(shot({ speed: 10 }));
    const fast = shotRecipe(shot({ speed: 28 }));
    const pop = (r: SoundRecipe): number => (r.layers[0]!.type === 'tone' ? r.layers[0]!.from : 0);
    expect(pop(fast)).toBeGreaterThan(pop(slow));
    expect(energy(fast)).toBeGreaterThan(energy(slow));
  });

  it('la frappe parfaite et le remate claquent davantage', () => {
    const base = energy(shotRecipe(shot()));
    expect(energy(shotRecipe(shot({ perfect: true, quality: 1 })))).toBeGreaterThan(base * 1.2);
    expect(energy(shotRecipe(shot({ overhead: 'remate', speed: 30 })))).toBeGreaterThan(
      energy(shotRecipe(shot({ overhead: 'bandeja', speed: 30 }))) * 1.5,
    );
  });
});

describe('réactions du public', () => {
  it('acclame un por tres, applaudit un long échange, se tait sur un point ordinaire', () => {
    expect(crowdReaction({ winner: 0, reason: 'por-tres', hits: 4 }, null)?.kind).toBe('cheer');
    expect(crowdReaction({ winner: 0, reason: 'second-bounce', hits: 3 }, shot({ overhead: 'remate' }))?.kind).toBe('cheer');
    expect(crowdReaction({ winner: 1, reason: 'own-ground', hits: 14 }, null)?.kind).toBe('applause');
    expect(crowdReaction({ winner: 1, reason: 'own-ground', hits: 3 }, null)).toBeNull();
    expect(crowdReaction({ winner: 0, reason: 'second-bounce', hits: 3 }, shot())).toBeNull();
  });
});
