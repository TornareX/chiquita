import { ARCADE, type PhysicsProfile } from './profile';
import type { ShotTuningKey } from './shots';

/**
 * Réglages de sensation, ceux qu'on ajuste en jouant dans le labo (`?mode=labo`) : quelques curseurs
 * lisibles qui pilotent le profil arcade, au lieu de ses dizaines de coefficients.
 */
export interface FeelTuning {
  /** Gravité (m/s²) : plus haut, la balle tombe plus vite (9,81 en vrai). */
  gravity: number;
  /** Rebond au sol (restitution) et adhérence du gazon sablé (friction). */
  groundBounce: number;
  groundGrip: number;
  /** Rebond sur les vitres (restitution). */
  glassBounce: number;
  /** Vitesse des coups (normal, coupé, volées, bandeja, víbora…), en multiple du profil arcade. Lob et remate à part. */
  shotSpeed: number;
  /** Balle coupée : jusqu'à quelle fraction l'effet rétro écrase le rebond. */
  sliceBounce: number;
  /** Vitesse de course des joueurs (m/s). */
  runSpeed: number;
}

/** Coups dont la vitesse suit `shotSpeed`. Le lob a un temps de vol imposé, le remate garde ses 120-130 km/h. */
const SCALED_SHOTS: readonly ShotTuningKey[] = ['normal', 'slice', 'cut', 'chiquita', 'bandeja', 'vibora'];

export const FEEL_LIMITS: Record<keyof FeelTuning, { min: number; max: number; step: number }> = {
  gravity: { min: 6, max: 11, step: 0.1 },
  groundBounce: { min: 0.5, max: 0.9, step: 0.01 },
  groundGrip: { min: 0.3, max: 0.9, step: 0.05 },
  glassBounce: { min: 0.4, max: 0.85, step: 0.01 },
  shotSpeed: { min: 0.8, max: 1.6, step: 0.05 },
  sliceBounce: { min: 0, max: 0.8, step: 0.05 },
  runSpeed: { min: 4.5, max: 8, step: 0.1 },
};

/** Réglages actuels d'un profil. */
export function feelOf(profile: PhysicsProfile): FeelTuning {
  return {
    gravity: profile.gravity,
    groundBounce: profile.ground.restitution,
    groundGrip: profile.ground.friction,
    glassBounce: profile.glass.restitution,
    shotSpeed: profile.rally.normal.speed / ARCADE.rally.normal.speed,
    sliceBounce: profile.slicedBounce,
    runSpeed: profile.player.maxSpeed,
  };
}

/** Applique des réglages de sensation à un profil (les vitesses de coups partent du profil arcade). */
export function applyFeel(profile: PhysicsProfile, feel: FeelTuning): void {
  profile.gravity = feel.gravity;
  profile.ground = { ...profile.ground, restitution: feel.groundBounce, friction: feel.groundGrip };
  profile.glass = { ...profile.glass, restitution: feel.glassBounce };
  for (const key of SCALED_SHOTS) {
    const base = ARCADE.rally[key];
    profile.rally[key] = { ...profile.rally[key], speed: base.speed * feel.shotSpeed, speedPerfect: base.speedPerfect * feel.shotSpeed };
  }
  profile.slicedBounce = feel.sliceBounce;
  profile.player = { ...profile.player, maxSpeed: feel.runSpeed };
}

/** Garde les valeurs dans leurs limites ; toute valeur absente ou invalide reprend celle de `fallback`. */
export function sanitizeFeel(raw: unknown, fallback: FeelTuning): FeelTuning {
  const feel = { ...fallback };
  if (!raw || typeof raw !== 'object') return feel;
  for (const key of Object.keys(FEEL_LIMITS) as (keyof FeelTuning)[]) {
    const value = (raw as Record<string, unknown>)[key];
    const { min, max } = FEEL_LIMITS[key];
    if (typeof value === 'number' && Number.isFinite(value)) feel[key] = Math.min(max, Math.max(min, value));
  }
  return feel;
}

/**
 * Points de départ du labo. « Réel » : gravité terrestre, sol de gazon sablé qui rebondit moins, vitres
 * vives, coups à vitesse réelle (coup de fond ~75 km/h), course humaine. [à calibrer en jouant]
 */
export const FEEL_PRESETS: Record<'arcade' | 'entre' | 'reel', { name: string; feel: FeelTuning }> = {
  arcade: { name: 'Arcade (actuel)', feel: feelOf(ARCADE) },
  entre: {
    name: 'Entre les deux',
    feel: { gravity: 9, groundBounce: 0.75, groundGrip: 0.65, glassBounce: 0.62, shotSpeed: 1.07, sliceBounce: 0.55, runSpeed: 5.8 },
  },
  reel: {
    name: 'Réel',
    feel: { gravity: 9.81, groundBounce: 0.7, groundGrip: 0.7, glassBounce: 0.7, shotSpeed: 1.15, sliceBounce: 0.5, runSpeed: 5.5 },
  },
};
