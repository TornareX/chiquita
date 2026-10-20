import { findExercise } from './exercises';
import { Prng } from './prng';
import { cross, normalize, scale, vec3, type Vec3 } from './vec3';
import { dcos, dsin } from './dmath';

export interface LaunchParams {
  /** Position de départ de la balle. */
  pos: Vec3;
  /** Vitesse initiale (m/s). */
  speed: number;
  /** Azimut en degrés : 0 = droit vers le fond du camp du joueur (−Z), positif vers +X. */
  azimuth: number;
  /** Élévation en degrés au-dessus de l'horizontale. */
  elevation: number;
  /** Lift (positif) ou slice (négatif), en rad/s. */
  topspin: number;
  /** Effet latéral autour de l'axe vertical, en rad/s. */
  sidespin: number;
}

/** Amplitude maximale (±) de la variation aléatoire appliquée à chaque balle. */
export interface LaunchVariation {
  x?: number;
  speed?: number;
  azimuth?: number;
  elevation?: number;
  topspin?: number;
  sidespin?: number;
  /** Une balle sur deux en moyenne est lancée en miroir (coup droit / revers). */
  mirror?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  /** Temps entre deux balles (s). */
  interval: number;
  /** Position de départ du joueur. */
  player: { x: number; z: number };
  /** Lancement à la difficulté minimale. */
  launch: LaunchParams;
  /** Valeurs remplacées à la difficulté maximale ; entre les deux, on interpole. */
  launchHard?: Partial<Omit<LaunchParams, 'pos'>>;
  variation: LaunchVariation;
  /** Mix : chaque balle est tirée parmi ces exercices. */
  mix?: string[];
}

export interface Launch {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
}

const UP = vec3(0, 1, 0);
const DEG = Math.PI / 180;

export const DEFAULT_DIFFICULTY = 0.3;
export const MIN_INTERVAL = 2;
export const MAX_INTERVAL = 10;

/** Convertit des paramètres de lancement en état initial de la balle. */
export function toLaunch(params: LaunchParams): Launch {
  const az = params.azimuth * DEG;
  const el = params.elevation * DEG;
  const dir = vec3(dsin(az) * dcos(el), dsin(el), -dcos(az) * dcos(el));
  // Axe du lift : horizontal, perpendiculaire à la direction de la balle.
  const liftAxis = normalize(cross(UP, dir));
  return {
    pos: params.pos,
    vel: scale(dir, params.speed),
    spin: vec3(liftAxis.x * params.topspin, params.sidespin, liftAxis.z * params.topspin),
  };
}

/**
 * Tire les paramètres d'une balle. La difficulté (0..1) rapproche le lancement de `launchHard`
 * (balle plus rapide et plus tendue) et élargit la variation aléatoire.
 */
export function sampleParams(
  exercise: Exercise,
  rng: Prng,
  difficulty: number = DEFAULT_DIFFICULTY,
): LaunchParams {
  const { launch, launchHard = {}, variation } = exercise;
  const spread = 0.5 + difficulty;
  // Un tirage par paramètre, toujours dans le même ordre, même si l'amplitude est nulle.
  const value = (easy: number, hard: number | undefined, amplitude: number | undefined): number =>
    easy + ((hard ?? easy) - easy) * difficulty + rng.range(-1, 1) * (amplitude ?? 0) * spread;

  const x = launch.pos.x + rng.range(-1, 1) * (variation.x ?? 0) * spread;
  const speed = value(launch.speed, launchHard.speed, variation.speed);
  const azimuth = value(launch.azimuth, launchHard.azimuth, variation.azimuth);
  const elevation = value(launch.elevation, launchHard.elevation, variation.elevation);
  const topspin = value(launch.topspin, launchHard.topspin, variation.topspin);
  const sidespin = value(launch.sidespin, launchHard.sidespin, variation.sidespin);
  const side = rng.next() < 0.5 && variation.mirror ? -1 : 1;

  return {
    pos: vec3(x * side, launch.pos.y, launch.pos.z),
    speed,
    azimuth: azimuth * side,
    elevation,
    topspin,
    sidespin: sidespin * side,
  };
}

/** Délai avant la première balle d'un exercice (s). */
export const FIRST_BALL_DELAY = 1.5;

/** Machine à balles : lance les balles d'un exercice à cadence réglable, de façon déterministe. */
export class Machine {
  private readonly rng: Prng;
  nextLaunchTime: number;
  lastLaunchTime = -Infinity;
  /** Nombre de balles lancées (hors rejeux). */
  count = 0;
  /** Temps entre deux balles (s). */
  interval: number;
  /** Difficulté de 0 à 1. */
  difficulty = DEFAULT_DIFFICULTY;
  /** Paramètres de la dernière balle, pour la rejouer. */
  lastParams: LaunchParams | null = null;

  constructor(
    readonly exercise: Exercise,
    seed: number,
    startTime: number,
  ) {
    this.rng = new Prng(seed);
    this.interval = exercise.interval;
    this.nextLaunchTime = startTime + FIRST_BALL_DELAY;
  }

  /** Position d'où partent les balles (sans la variation). */
  get position(): Vec3 {
    return this.exercise.launch.pos;
  }

  /** À appeler à chaque pas : retourne la balle à lancer si c'est le moment. */
  update(time: number): Launch | null {
    if (time < this.nextLaunchTime) return null;
    this.lastLaunchTime = this.nextLaunchTime;
    this.nextLaunchTime += this.interval;
    this.count++;

    const { mix } = this.exercise;
    const source = mix ? findExercise(mix[Math.floor(this.rng.next() * mix.length)]!) : this.exercise;
    this.lastParams = sampleParams(source, this.rng, this.difficulty);
    return toLaunch(this.lastParams);
  }

  /** Relance tout de suite la dernière balle, à l'identique ; la suivante est décalée d'autant. */
  replay(time: number): Launch | null {
    if (!this.lastParams) return null;
    this.lastLaunchTime = time;
    this.nextLaunchTime = time + this.interval;
    return toLaunch(this.lastParams);
  }

  setInterval(seconds: number): void {
    this.interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, seconds));
  }

  setDifficulty(value: number): void {
    this.difficulty = Math.min(1, Math.max(0, value));
  }
}
