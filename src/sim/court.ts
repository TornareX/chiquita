import {
  BACK_GLASS_HEIGHT,
  BACK_WALL_HEIGHT,
  HALF_LENGTH,
  HALF_WIDTH,
  NET_HEIGHT_CENTER,
  NET_HEIGHT_POSTS,
  SIDE_GLASS_HEIGHT_HIGH,
  SIDE_GLASS_HEIGHT_LOW,
  SIDE_GLASS_PANEL_LENGTH,
  SIDE_WALL_HEIGHT,
  SIDE_WALL_HEIGHT_END,
} from './constants';
import { vec3, type Vec3 } from './vec3';

export type WallSurface = 'glass' | 'mesh';
export type WallId = 'backNear' | 'backFar' | 'sidePosX' | 'sideNegX';

/** Mur vertical : un plan perpendiculaire à X ou à Z. */
export interface Wall {
  id: WallId;
  /** Axe horizontal le long du mur. */
  axis: 'x' | 'z';
  /** Position du plan sur l'axe perpendiculaire au mur. */
  offset: number;
  /** Normale unitaire, vers l'intérieur du terrain. */
  normal: Vec3;
}

/** Zone rectangulaire d'un mur, d'une seule matière. */
export interface Panel {
  wall: WallId;
  surface: WallSurface;
  /** Étendue le long de l'axe du mur. */
  min: number;
  max: number;
  yMin: number;
  yMax: number;
}

export const WALLS: Record<WallId, Wall> = {
  backNear: { id: 'backNear', axis: 'x', offset: -HALF_LENGTH, normal: vec3(0, 0, 1) },
  backFar: { id: 'backFar', axis: 'x', offset: HALF_LENGTH, normal: vec3(0, 0, -1) },
  sidePosX: { id: 'sidePosX', axis: 'z', offset: HALF_WIDTH, normal: vec3(-1, 0, 0) },
  sideNegX: { id: 'sideNegX', axis: 'z', offset: -HALF_WIDTH, normal: vec3(1, 0, 0) },
};

function backPanels(wall: WallId): Panel[] {
  const span = { min: -HALF_WIDTH, max: HALF_WIDTH };
  return [
    { wall, surface: 'glass', ...span, yMin: 0, yMax: BACK_GLASS_HEIGHT },
    { wall, surface: 'mesh', ...span, yMin: BACK_GLASS_HEIGHT, yMax: BACK_WALL_HEIGHT },
  ];
}

function sidePanels(wall: WallId): Panel[] {
  const panels: Panel[] = [];
  const p = SIDE_GLASS_PANEL_LENGTH;
  for (const end of [-1, 1]) {
    // Intervalle en z situé entre d0 et d1 mètres du mur du fond de cette extrémité.
    const span = (d0: number, d1: number) => {
      const a = end * (HALF_LENGTH - d0);
      const b = end * (HALF_LENGTH - d1);
      return { min: Math.min(a, b), max: Math.max(a, b) };
    };
    panels.push(
      { wall, surface: 'glass', ...span(0, p), yMin: 0, yMax: SIDE_GLASS_HEIGHT_HIGH },
      { wall, surface: 'mesh', ...span(0, p), yMin: SIDE_GLASS_HEIGHT_HIGH, yMax: SIDE_WALL_HEIGHT_END },
      { wall, surface: 'glass', ...span(p, 2 * p), yMin: 0, yMax: SIDE_GLASS_HEIGHT_LOW },
      { wall, surface: 'mesh', ...span(p, 2 * p), yMin: SIDE_GLASS_HEIGHT_LOW, yMax: SIDE_WALL_HEIGHT },
      { wall, surface: 'mesh', ...span(2 * p, HALF_LENGTH), yMin: 0, yMax: SIDE_WALL_HEIGHT },
    );
  }
  return panels;
}

/** Tous les panneaux du terrain. Source unique pour les collisions et le rendu en formes simples. */
export const PANELS: readonly Panel[] = [
  ...backPanels('backNear'),
  ...backPanels('backFar'),
  ...sidePanels('sidePosX'),
  ...sidePanels('sideNegX'),
];

/**
 * Matière d'un mur à la position `along` (le long de l'axe du mur) et à la hauteur `y`.
 * Retourne `null` hors de tout panneau : au-dessus du mur, la balle sort du terrain.
 */
export function wallSurfaceAt(wall: WallId, along: number, y: number): WallSurface | null {
  for (const panel of PANELS) {
    if (
      panel.wall === wall &&
      along >= panel.min &&
      along <= panel.max &&
      y >= panel.yMin &&
      y < panel.yMax
    ) {
      return panel.surface;
    }
  }
  return null;
}

/** Hauteur du filet en x : 0,88 m au centre, 0,92 m aux poteaux (profil linéaire). */
export function netHeightAt(x: number): number {
  const t = Math.min(Math.abs(x) / HALF_WIDTH, 1);
  return NET_HEIGHT_CENTER + (NET_HEIGHT_POSTS - NET_HEIGHT_CENTER) * t;
}
