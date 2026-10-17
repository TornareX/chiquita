/**
 * Poses du personnage cartoon (GAME_DESIGN.md §9, étape E) : fonctions pures, sans Three.js, calculées
 * à partir de l'état de la simulation. Le rendu ne fait que les appliquer (`character.ts`) ; rien ici
 * ne remonte vers la simulation.
 *
 * Repère du joueur : +Z devant (vers le filet), +Y en haut, sa droite vers -X (droitier).
 * Les directions des bras et de la raquette sont données dans le repère du buste, après sa torsion.
 */

export type V3 = readonly [number, number, number];

/** Famille du geste : coup droit, revers, au-dessus de la tête, service à la cuillère. */
export type SwingFamily = 'fore' | 'back' | 'overhead' | 'serve';

export interface Pose {
  /** Abaissement du bassin (m) : flexion des genoux. */
  crouch: number;
  /** Rebond du bassin (m), positif vers le haut. */
  bob: number;
  /** Rotation du corps entier par rapport à la direction du filet (rad, + vers la gauche du joueur). */
  bodyYaw: number;
  /** Torsion du buste sur le bassin (rad) : négative = épaule droite en arrière (coup droit armé). */
  twist: number;
  /** Inclinaison du buste vers l'avant (rad). */
  lean: number;
  /** Direction épaule → coude, bras droit (raquette) et bras gauche. */
  armR: V3;
  armL: V3;
  /** Flexion du coude droit (rad). */
  elbowR: number;
  /** Direction de la raquette (de la main vers le tamis), et vers quoi regarde son tamis. */
  racket: V3;
  face: V3;
  /** Jambes : balancier vers l'avant (rad, autour de X), écart sur le côté (autour de Z), flexion du genou. */
  legR: LegPose;
  legL: LegPose;
}

export interface LegPose {
  swing: number;
  spread: number;
  knee: number;
}

interface Key {
  twist: number;
  lean: number;
  crouch: number;
  armR: V3;
  armL: V3;
  elbowR: number;
  racket: V3;
  face: V3;
}

const FORWARD: V3 = [0, 0, 1];

function key(k: Omit<Key, 'face' | 'elbowR'> & { face?: V3; elbowR?: number }): Key {
  return { face: FORWARD, elbowR: 0.15, ...k };
}

/** Entre deux points : en attente dans l'échange, raquette devant soi, genoux fléchis. */
const READY = key({ twist: 0, lean: 0.14, crouch: 0.07, armR: [-0.3, -0.7, 0.6], armL: [0.3, -0.6, 0.7], elbowR: 0.5, racket: [0.25, 0.85, 0.4] });
/** Hors de l'échange (pause entre les points, service adverse pas encore lâché). */
const REST = key({ twist: 0, lean: 0.03, crouch: 0, armR: [-0.2, -0.95, 0.15], armL: [0.2, -0.97, 0.05], elbowR: 0.2, racket: [-0.1, -0.5, 0.85], face: [-1, 0, 0] });

/** Pour chaque famille : armé (préparation pleine), image d'impact, fin du geste. */
const SWINGS: Record<SwingFamily, { prep: Key; impact: Key; follow: Key }> = {
  fore: {
    prep: key({ twist: -0.95, lean: 0.18, crouch: 0.12, armR: [-0.75, -0.35, -0.2], armL: [0.45, 0, 0.9], racket: [-0.2, 0.55, -0.8], face: [-1, 0, 0] }),
    impact: key({ twist: -0.15, lean: 0.16, crouch: 0.1, armR: [-0.85, -0.3, 0.4], armL: [0.6, -0.5, 0.5], elbowR: 0.05, racket: [-0.75, 0.1, 0.65] }),
    follow: key({ twist: 0.75, lean: 0.12, crouch: 0.06, armR: [0.1, 0.15, 1], armL: [0.2, -0.6, 0.5], elbowR: 0.6, racket: [0.7, 0.65, -0.2], face: [0, 0, -1] }),
  },
  back: {
    prep: key({ twist: 1.0, lean: 0.18, crouch: 0.12, armR: [0.55, -0.45, 0.2], armL: [0.2, -0.4, 0.5], elbowR: 0.4, racket: [0.5, 0.55, -0.65], face: [1, 0, 0] }),
    impact: key({ twist: 0.15, lean: 0.16, crouch: 0.1, armR: [0.5, -0.35, 0.8], armL: [0.6, -0.6, -0.3], elbowR: 0.05, racket: [0.8, 0.1, 0.6] }),
    follow: key({ twist: -0.6, lean: 0.1, crouch: 0.06, armR: [-0.4, 0.35, 0.85], armL: [0.7, -0.5, -0.3], elbowR: 0.3, racket: [-0.6, 0.75, 0.2], face: [0, 0, -1] }),
  },
  overhead: {
    prep: key({ twist: -0.7, lean: -0.12, crouch: 0.04, armR: [-0.5, 0.8, -0.3], armL: [0.35, 0.9, 0.3], elbowR: 0.9, racket: [0.1, -0.3, -0.95], face: [-1, 0, 0] }),
    impact: key({ twist: -0.05, lean: 0.08, crouch: 0.02, armR: [-0.2, 0.97, 0.15], armL: [0.5, -0.2, 0.6], elbowR: 0.05, racket: [-0.05, 0.85, 0.5], face: [0, 0.3, 1] }),
    follow: key({ twist: 0.5, lean: 0.32, crouch: 0.1, armR: [0.35, -0.45, 0.8], armL: [0.4, -0.8, 0.2], elbowR: 0.3, racket: [0.5, -0.7, 0.5] }),
  },
  serve: {
    prep: key({ twist: -0.8, lean: 0.25, crouch: 0.11, armR: [-0.45, -0.75, -0.45], armL: [0.3, -0.3, 0.9], racket: [-0.2, -0.6, -0.75], face: [-1, 0, 0] }),
    impact: key({ twist: -0.2, lean: 0.25, crouch: 0.1, armR: [-0.6, -0.7, 0.4], armL: [0.5, -0.5, 0.4], elbowR: 0.05, racket: [-0.7, -0.3, 0.6] }),
    follow: key({ twist: 0.6, lean: 0.15, crouch: 0.08, armR: [0.05, 0.25, 1], armL: [0.3, -0.7, 0.3], elbowR: 0.5, racket: [0.6, 0.75, 0], face: [0, 0, -1] }),
  },
};

/** Après l'impact : durée de la fin du geste, puis du retour en attente (s). */
export const FOLLOW_TIME = 0.28;
export const RECOVER_TIME = 0.3;
/** Préparation : la raquette est à moitié armée en ~0,12 s, entièrement à 0,6 s (comme le bonus de vitesse, §13). */
const PREP_FULL = 0.6;
/** Longueur d'une foulée complète (deux pas, m) à pleine course, et vitesse de course de référence (m/s). */
export const STRIDE = 1.7;
const RUN_SPEED = 5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function normalize(v: V3): V3 {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 1e-9 ? [v[0] / n, v[1] / n, v[2] / n] : [0, -1, 0];
}

function mixDir(a: V3, b: V3, t: number): V3 {
  return normalize([mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]);
}

function mixKey(a: Key, b: Key, t: number): Key {
  return {
    twist: mix(a.twist, b.twist, t),
    lean: mix(a.lean, b.lean, t),
    crouch: mix(a.crouch, b.crouch, t),
    armR: mixDir(a.armR, b.armR, t),
    armL: mixDir(a.armL, b.armL, t),
    elbowR: mix(a.elbowR, b.elbowR, t),
    racket: mixDir(a.racket, b.racket, t),
    face: mixDir(a.face, b.face, t),
  };
}

/** Part de l'armé atteinte après `seconds` de préparation : vite au début, pleine à 0,6 s. */
export function prepAmount(seconds: number): number {
  if (seconds <= 0) return 0;
  return clamp(Math.sin((Math.min(seconds, PREP_FULL) / PREP_FULL) * (Math.PI / 2)), 0, 1);
}

/**
 * Côté du coup pour un droitier, d'après la position latérale de la balle dans le repère du joueur
 * (`localX`, + à sa gauche). Hystérésis : on garde le côté choisi tant que la balle reste près de l'axe.
 */
export function swingSide(localX: number, previous: 'fore' | 'back'): 'fore' | 'back' {
  if (localX < -0.15) return 'fore';
  if (localX > 0.25) return 'back';
  return previous;
}

export interface PoseInput {
  /** Dans l'échange (ou au service) : position d'attente ; sinon, au repos. */
  inPlay: boolean;
  /** Coup préparé : sa famille et le temps depuis le début de la préparation (s). */
  prep: { family: SwingFamily; seconds: number } | null;
  /** Dernière frappe (ou coup dans le vide) : sa famille et le temps écoulé depuis (s). */
  strike: { family: SwingFamily; seconds: number } | null;
  /** Vitesse au sol (m/s), et direction du déplacement dans le repère du filet (+Z vers le filet). */
  speed: number;
  heading: number;
  /** Rotation du corps déjà appliquée (rad), pour exprimer la course dans le repère du corps. */
  bodyYaw: number;
  /** Phase de la foulée (rad), avancée selon la distance parcourue. */
  stride: number;
  /** Temps (s), pour la respiration et les petits rebonds d'attente. */
  time: number;
}

/**
 * Orientation souhaitée du corps par rapport au filet : face au filet au pas chassé ou en frappant ; tourné
 * dans le sens de la course quand il court vite (en reculant, de trois quarts seulement).
 */
export function bodyYawTarget(speed: number, heading: number, striking: boolean): number {
  if (striking) return 0;
  const w = clamp((speed - 1.8) / 2.7, 0, 1);
  if (w === 0) return 0;
  const backward = Math.abs(heading) > 2.0;
  const target = backward ? (heading > 0 ? heading - Math.PI : heading + Math.PI) * 0.5 : clamp(heading * 0.85, -1.4, 1.4);
  return target * w;
}

/** Pose complète du joueur pour cette image. */
export function computePose(input: PoseInput): Pose {
  const base = input.inPlay ? READY : REST;
  let upper = base;
  if (input.prep) {
    const keys = SWINGS[input.prep.family];
    upper = mixKey(base, keys.prep, smooth(prepAmount(input.prep.seconds)));
  }
  const s = input.strike;
  if (s && s.seconds >= 0 && s.seconds < FOLLOW_TIME + RECOVER_TIME) {
    const keys = SWINGS[s.family];
    upper =
      s.seconds < FOLLOW_TIME
        ? mixKey(keys.impact, keys.follow, smooth(s.seconds / FOLLOW_TIME))
        : mixKey(keys.follow, upper, smooth((s.seconds - FOLLOW_TIME) / RECOVER_TIME));
  }

  // Course : amplitude selon la vitesse, foulée dans la direction du déplacement vue du corps.
  const run = clamp(input.speed / RUN_SPEED, 0, 1);
  const moving = input.speed > 0.15;
  const local = input.heading - input.bodyYaw;
  const fwd = moving ? Math.cos(local) : 0;
  const side = moving ? Math.sin(local) : 0;
  const swing = Math.sin(input.stride);
  const amp = 0.25 + 0.5 * run;
  const leg = (sign: 1 | -1): LegPose => {
    const phase = swing * sign * (moving ? amp : 0);
    // Genou plié surtout quand la jambe revient vers l'avant ; jambes écartées en pas chassé.
    const lift = moving ? Math.max(0, Math.cos(input.stride) * sign) * (0.3 + 0.9 * run) : 0;
    return { swing: -phase * fwd, spread: phase * side * 0.4, knee: lift };
  };

  // Petits rebonds en attente (split-step), respiration au repos, rebond de la foulée en courant.
  const idleBob = input.inPlay ? Math.abs(Math.sin(input.time * 7)) * 0.012 : Math.sin(input.time * 2) * 0.004;
  const runBob = Math.abs(Math.cos(input.stride)) * 0.05 * run;
  return {
    crouch: upper.crouch + run * 0.05,
    bob: moving ? runBob : idleBob,
    bodyYaw: input.bodyYaw,
    twist: upper.twist,
    lean: upper.lean + run * 0.16 * Math.max(0, fwd),
    armR: upper.armR,
    armL: moving && !input.prep && !s ? mixDir(upper.armL, [0.3, -0.75, -Math.sin(input.stride) * 0.6], run) : upper.armL,
    elbowR: upper.elbowR,
    racket: upper.racket,
    face: upper.face,
    legR: leg(1),
    legL: leg(-1),
  };
}
