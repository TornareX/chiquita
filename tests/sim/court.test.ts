import { describe, expect, it } from 'vitest';
import { DOOR_FAR, DOOR_HEIGHT, DOOR_NEAR, HALF_LENGTH, HALF_WIDTH } from '../../src/sim/constants';
import {
  buildPanels,
  netHeightAt,
  PANELS,
  WALLS,
  wallSurfaceAt,
  type Panel,
  type WallId,
  type WallSurface,
} from '../../src/sim/court';
import { dot, vec3 } from '../../src/sim/vec3';

const WALL_IDS = Object.keys(WALLS) as WallId[];
const BACK_WALLS: WallId[] = ['backNear', 'backFar'];
const SIDE_WALLS: WallId[] = ['sidePosX', 'sideNegX'];

/** Surface des deux portes d'un mur latéral (m²). */
const DOORS = 2 * (DOOR_FAR - DOOR_NEAR) * DOOR_HEIGHT;
const VARIANT_1 = buildPanels(1);
const VARIANT_2 = buildPanels(2);

function area(wall: WallId, surface: WallSurface, panels: readonly Panel[] = PANELS): number {
  return panels.filter((p) => p.wall === wall && p.surface === surface).reduce(
    (sum, p) => sum + (p.max - p.min) * (p.yMax - p.yMin),
    0,
  );
}

describe('murs', () => {
  it('délimitent un terrain de 20 m × 10 m', () => {
    expect(WALLS.backFar.offset - WALLS.backNear.offset).toBe(20);
    expect(WALLS.sidePosX.offset - WALLS.sideNegX.offset).toBe(10);
  });

  it('ont une normale unitaire dirigée vers le centre du terrain', () => {
    for (const id of WALL_IDS) {
      const wall = WALLS[id];
      const onWall = wall.axis === 'x' ? vec3(0, 0, wall.offset) : vec3(wall.offset, 0, 0);
      expect(dot(wall.normal, wall.normal)).toBe(1);
      expect(dot(wall.normal, onWall)).toBeLessThan(0);
    }
  });
});

describe('murs du fond', () => {
  it.each(BACK_WALLS)('%s : 3 m de vitre puis 1 m de grillage', (wall) => {
    for (const x of [-HALF_WIDTH, -2, 0, 3.3, HALF_WIDTH]) {
      expect(wallSurfaceAt(wall, x, 0)).toBe('glass');
      expect(wallSurfaceAt(wall, x, 2.99)).toBe('glass');
      expect(wallSurfaceAt(wall, x, 3)).toBe('mesh');
      expect(wallSurfaceAt(wall, x, 3.99)).toBe('mesh');
      expect(wallSurfaceAt(wall, x, 4)).toBeNull();
    }
  });

  it.each(BACK_WALLS)('%s : 30 m² de vitre et 10 m² de grillage', (wall) => {
    expect(area(wall, 'glass')).toBe(30);
    expect(area(wall, 'mesh')).toBe(10);
  });
});

describe('murs latéraux (variante 1, avec marche)', () => {
  // d : distance au mur du fond ; testé aux deux extrémités de chaque mur.
  const cases: [d: number, y: number, expected: WallSurface | null][] = [
    // Premier panneau : vitre de 3 m, grillage jusqu'à 4 m.
    [1, 0.5, 'glass'],
    [1, 2.5, 'glass'],
    [1, 3.5, 'mesh'],
    [1, 4.2, null],
    // Deuxième panneau : vitre de 2 m, grillage jusqu'à 3 m.
    [3, 1.5, 'glass'],
    [3, 2.5, 'mesh'],
    [3, 3.5, null],
    // Reste du mur : grillage jusqu'à 3 m.
    [5, 0.5, 'mesh'],
    [9.9, 2.5, 'mesh'],
    [7, 3.5, null],
  ];

  for (const wall of SIDE_WALLS) {
    for (const end of [-1, 1]) {
      it.each(cases)(`${wall}, extrémité z ${end > 0 ? '+' : '-'} : à %s m du fond, hauteur %s m → %s`, (d, y, expected) => {
        expect(wallSurfaceAt(wall, end * (HALF_LENGTH - d), y, VARIANT_1)).toBe(expected);
      });
    }
  }

  it.each(SIDE_WALLS)('%s : 20 m² de vitre et 44 m² de grillage, moins les deux portes', (wall) => {
    expect(area(wall, 'glass', VARIANT_1)).toBe(20);
    expect(area(wall, 'mesh', VARIANT_1)).toBeCloseTo(44 - DOORS, 9);
  });
});

describe('murs latéraux (variante 2, sans marche)', () => {
  it.each(SIDE_WALLS)('%s : vitre de 3 m sur les 4 premiers mètres, grillage de 4 m sur les 2 premiers', (wall) => {
    for (const end of [-1, 1]) {
      const at = (d: number, y: number) => wallSurfaceAt(wall, end * (HALF_LENGTH - d), y, VARIANT_2);
      expect(at(1, 2.5)).toBe('glass');
      expect(at(1, 3.5)).toBe('mesh');
      expect(at(3, 1.5)).toBe('glass');
      expect(at(3, 2.5)).toBe('glass');
      expect(at(3, 3.5)).toBeNull();
      expect(at(5, 2.5)).toBe('mesh');
      expect(at(5, 3.5)).toBeNull();
    }
  });

  it.each(SIDE_WALLS)('%s : 24 m² de vitre et 40 m² de grillage, moins les deux portes', (wall) => {
    expect(area(wall, 'glass', VARIANT_2)).toBe(24);
    expect(area(wall, 'mesh', VARIANT_2)).toBeCloseTo(40 - DOORS, 9);
  });

  it.each(SIDE_WALLS)('%s : une porte de chaque côté du filet, sous le grillage', (wall) => {
    for (const end of [-1, 1]) {
      const z = end * (DOOR_NEAR + DOOR_FAR) / 2;
      expect(wallSurfaceAt(wall, z, 0.5)).toBeNull();
      expect(wallSurfaceAt(wall, z, DOOR_HEIGHT - 0.01)).toBeNull();
      expect(wallSurfaceAt(wall, z, DOOR_HEIGHT + 0.5)).toBe('mesh');
      expect(wallSurfaceAt(wall, end * (DOOR_FAR + 0.2), 0.5)).toBe('mesh');
    }
  });

  it('est la variante utilisée par le jeu, comme le modèle 3D', () => {
    expect(PANELS).toEqual(VARIANT_2);
  });
});

describe('panneaux', () => {
  it.each([1, 2] as const)('variante %s : ne se chevauchent pas', (variant) => {
    const panels = buildPanels(variant);
    for (const a of panels) {
      for (const b of panels) {
        if (a === b || a.wall !== b.wall) continue;
        const overlap = a.min < b.max && b.min < a.max && a.yMin < b.yMax && b.yMin < a.yMax;
        expect(overlap).toBe(false);
      }
    }
  });

  it('ne laissent aucune matière sous le sol', () => {
    for (const wall of WALL_IDS) expect(wallSurfaceAt(wall, 0, -0.1)).toBeNull();
  });
});

describe('filet', () => {
  it('mesure 0,88 m au centre et 0,92 m aux poteaux', () => {
    expect(netHeightAt(0)).toBe(0.88);
    expect(netHeightAt(HALF_WIDTH)).toBeCloseTo(0.92, 12);
    expect(netHeightAt(-HALF_WIDTH)).toBeCloseTo(0.92, 12);
  });

  it('est symétrique et monte vers les poteaux', () => {
    expect(netHeightAt(-2)).toBe(netHeightAt(2));
    expect(netHeightAt(1)).toBeLessThan(netHeightAt(4));
  });
});
