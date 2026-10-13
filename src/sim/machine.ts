import { Prng } from './prng';
import { cross, normalize, scale, vec3, type Vec3 } from './vec3';

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
}

export interface Exercise {
  id: string;
  name: string;
  /** Temps entre deux balles (s). */
  interval: number;
  launch: LaunchParams;
  variation: LaunchVariation;
}

export interface Launch {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
}

const UP = vec3(0, 1, 0);
const DEG = Math.PI / 180;

/** Convertit des paramètres de lancement en état initial de la balle. */
export function toLaunch(params: LaunchParams): Launch {
  const az = params.azimuth * DEG;
  const el = params.elevation * DEG;
  const dir = vec3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  // Axe du lift : horizontal, perpendiculaire à la direction de la balle.
  const liftAxis = normalize(cross(UP, dir));
  return {
    pos: params.pos,
    vel: scale(dir, params.speed),
    spin: vec3(
      liftAxis.x * params.topspin,
      params.sidespin,
      liftAxis.z * params.topspin,
    ),
  };
}

/** Tire les paramètres d'une balle : valeurs de l'exercice plus une variation bornée. */
export function sampleParams(exercise: Exercise, rng: Prng): LaunchParams {
  const { launch, variation } = exercise;
  // Un tirage par paramètre, toujours dans le même ordre, même si l'amplitude est nulle.
  const vary = (amplitude: number | undefined): number => rng.range(-1, 1) * (amplitude ?? 0);
  return {
    pos: vec3(launch.pos.x + vary(variation.x), launch.pos.y, launch.pos.z),
    speed: launch.speed + vary(variation.speed),
    azimuth: launch.azimuth + vary(variation.azimuth),
    elevation: launch.elevation + vary(variation.elevation),
    topspin: launch.topspin + vary(variation.topspin),
    sidespin: launch.sidespin + vary(variation.sidespin),
  };
}

/** Délai avant la première balle d'un exercice (s). */
export const FIRST_BALL_DELAY = 1.5;

/** Machine à balles : lance les balles d'un exercice à cadence fixe, de façon déterministe. */
export class Machine {
  private readonly rng: Prng;
  nextLaunchTime: number;
  lastLaunchTime = -Infinity;
  /** Nombre de balles lancées. */
  count = 0;

  constructor(
    readonly exercise: Exercise,
    seed: number,
    startTime: number,
  ) {
    this.rng = new Prng(seed);
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
    this.nextLaunchTime += this.exercise.interval;
    this.count++;
    return toLaunch(sampleParams(this.exercise, this.rng));
  }
}
