/**
 * Poses du personnage cartoon (GAME_DESIGN.md §9, étape E) : fonctions pures, sans Three.js, calculées
 * à partir de l'état de la simulation. Le rendu ne fait que les appliquer (`character.ts`) ; rien ici
 * ne remonte vers la simulation.
 *
 * Repère du joueur : +Z devant (vers le filet), +Y en haut, sa droite vers -X (droitier).
 * Les directions des bras et de la raquette sont données dans le repère du buste, après sa torsion.
 */

import type { Duel, DuelPlayer, Engagement } from '../sim/duel';
import type { OverheadKind } from '../sim/commands';
import { bandejaHeight } from '../sim/shots';

export type V3 = readonly [number, number, number];

/** Famille du geste : coup droit, revers, au-dessus de la tête, service à la cuillère. */
/** `overhead` : smash (remate), en sautant ; `bandeja` : bandeja et víbora, même geste, et aussi bajada et feinte. */
export type SwingFamily = 'fore' | 'back' | 'voleeFore' | 'voleeBack' | 'bandeja' | 'overhead' | 'serve';

export interface Pose {
  /** Abaissement du bassin (m) : flexion des genoux. */
  crouch: number;
  /** Rebond du bassin (m), positif vers le haut. */
  bob: number;
  /** Saut (m) : tout le corps quitte le sol (smash). Rendu seulement : le joueur simulé reste au sol. */
  jump: number;
  /** Rotation du corps entier par rapport à la direction du filet (rad, + vers la gauche du joueur). */
  bodyYaw: number;
  /** Rotation des épaules (rad) : négative = épaule droite en arrière (coup droit armé). */
  twist: number;
  /** Part de cette rotation prise par les hanches (rad) ; le buste fait le reste. */
  hipTwist: number;
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
  /** Pas en avant de la jambe gauche ou droite (rad de balancier) : la jambe opposée au coup, à la volée. */
  stepL: number;
  stepR: number;
  /** Saut (m), et coup de pied de la jambe droite vers l'avant, jambe tendue (rad) : le ciseau du smash. */
  jump: number;
  kick: number;
}

const FORWARD: V3 = [0, 0, 1];

type Optional = 'face' | 'elbowR' | 'stepL' | 'stepR' | 'jump' | 'kick';
function key(k: Omit<Key, Optional> & Partial<Pick<Key, Optional>>): Key {
  return { face: FORWARD, elbowR: 0.15, stepL: 0, stepR: 0, jump: 0, kick: 0, ...k };
}

/** Entre deux points : en attente dans l'échange, raquette devant soi, genoux fléchis. */
const READY = key({ twist: 0, lean: 0.14, crouch: 0.09, armR: [-0.3, -0.7, 0.6], armL: [0.3, -0.6, 0.7], elbowR: 0.5, racket: [0.25, 0.85, 0.4] });
/** Hors de l'échange (pause entre les points, service adverse pas encore lâché). */
const REST = key({ twist: 0, lean: 0.03, crouch: 0, armR: [-0.2, -0.95, 0.15], armL: [0.2, -0.97, 0.05], elbowR: 0.2, racket: [-0.1, -0.5, 0.85], face: [-1, 0, 0] });

/** Pour chaque famille : armé (préparation pleine), image d'impact, fin du geste. */
const SWINGS: Record<SwingFamily, { prep: Key; impact: Key; follow: Key }> = {
  // Coup droit et revers d'après la décomposition d'un entraîneur (images de Xavier) : jambes fléchies,
  // préparation courte tête de raquette en haut, épaules et hanches tournées, main libre qui vise (contrôle),
  // contact bas devant soi, fin du geste par-dessus l'épaule opposée.
  fore: {
    prep: key({ twist: -1.2, lean: 0.2, crouch: 0.14, armR: [-0.75, -0.1, -0.65], armL: [0.55, 0.1, 0.85], elbowR: 1.0, racket: [-0.15, 0.85, -0.5], face: [-1, 0, 0] }),
    impact: key({ twist: -0.15, lean: 0.35, crouch: 0.17, armR: [-0.6, -0.65, 0.45], armL: [0.75, -0.2, 0], elbowR: 0.2, racket: [-0.75, -0.15, 0.65] }),
    follow: key({ twist: 0.95, lean: 0.15, crouch: 0.12, armR: [0.4, 0.55, 0.75], armL: [0.5, -0.6, 0.4], elbowR: 1.3, racket: [0.35, 0.35, -0.85], face: [1, 0, 0] }),
  },
  back: {
    prep: key({ twist: 1.2, lean: 0.2, crouch: 0.14, armR: [0.65, -0.35, -0.25], armL: [0.45, -0.25, 0.3], elbowR: 0.6, racket: [0.25, 0.8, -0.55], face: [1, 0, 0] }),
    impact: key({ twist: 0.2, lean: 0.35, crouch: 0.17, armR: [0.55, -0.6, 0.55], armL: [0.55, -0.45, -0.7], elbowR: 0.05, racket: [0.8, -0.15, 0.55] }),
    follow: key({ twist: -0.6, lean: 0.15, crouch: 0.1, armR: [-0.6, 0.15, 0.75], armL: [0.6, -0.5, -0.6], elbowR: 0.3, racket: [-0.55, 0.75, 0.1], face: [-1, 0, 0] }),
  },
  // Volées d'après les images de Xavier : tête de raquette toujours au-dessus du poignet ; préparation courte
  // (la main, la hanche et les épaules s'ouvrent, tête de raquette en haut) ; à l'impact, devant soi, pas en avant
  // avec la jambe opposée ; geste court, la raquette accompagne vers l'avant et un peu vers le bas (coupé).
  voleeFore: {
    prep: key({ twist: -0.7, lean: 0.12, crouch: 0.12, armR: [-0.7, -0.05, -0.15], armL: [0.5, 0.1, 0.85], elbowR: 1.1, racket: [-0.2, 0.9, -0.3], face: [-1, 0, 0.3] }),
    impact: key({ twist: -0.25, lean: 0.2, crouch: 0.15, armR: [-0.45, -0.2, 0.85], armL: [0.8, -0.1, 0.3], elbowR: 0.35, racket: [-0.35, 0.75, 0.55], face: [0, 0.1, 1], stepL: 0.45 }),
    follow: key({ twist: 0, lean: 0.22, crouch: 0.14, armR: [-0.25, -0.35, 0.9], armL: [0.75, -0.3, 0.2], elbowR: 0.3, racket: [-0.2, 0.55, 0.8], face: [0, -0.3, 1], stepL: 0.5 }),
  },
  voleeBack: {
    prep: key({ twist: 0.8, lean: 0.12, crouch: 0.12, armR: [0.55, -0.25, 0.2], armL: [0.45, -0.1, 0.4], elbowR: 1.2, racket: [0.35, 0.85, -0.3], face: [1, 0, 0.2] }),
    impact: key({ twist: 0.25, lean: 0.2, crouch: 0.15, armR: [0.5, -0.2, 0.85], armL: [0.6, -0.3, -0.75], elbowR: 0.3, racket: [0.45, 0.7, 0.55], face: [0, 0.1, 1], stepR: 0.45 }),
    follow: key({ twist: 0.05, lean: 0.22, crouch: 0.14, armR: [0.3, -0.35, 0.9], armL: [0.6, -0.35, -0.7], elbowR: 0.3, racket: [0.3, 0.5, 0.8], face: [0, -0.3, 1], stepR: 0.5 }),
  },
  // Bandeja et víbora d'après les images de Xavier (víbora) : préparation de profil, raquette montée à deux mains
  // puis derrière la tête, coude haut, bras gauche tendu vers la balle, pied droit en arrière ; impact sur le côté,
  // devant, entre l'épaule et la tête ; le geste traverse le corps vers le bas et finit à gauche, à hauteur de hanche,
  // le corps tourné et la jambe droite qui passe devant.
  bandeja: {
    prep: key({ twist: -1.1, lean: -0.15, crouch: 0.1, armR: [-0.75, 0.55, -0.2], armL: [0.25, 0.95, 0.2], elbowR: 1.0, racket: [-0.2, 0.9, -0.4], face: [-1, 0, 0], stepL: 0.3 }),
    impact: key({ twist: -0.2, lean: 0.1, crouch: 0.08, armR: [-0.75, 0.35, 0.55], armL: [0.85, 0.2, 0.2], elbowR: 0.1, racket: [-0.75, 0.25, 0.6], face: [0, 0.1, 1], stepL: 0.3 }),
    follow: key({ twist: 1.0, lean: 0.3, crouch: 0.12, armR: [0.8, -0.5, 0.3], armL: [0.4, -0.6, -0.6], elbowR: 0.3, racket: [0.6, -0.3, -0.7], face: [1, 0, 0], stepR: 0.35 }),
  },
  // Smash (remate) d'après les images de Xavier : la raquette monte à deux mains, puis tombe derrière le dos, dos
  // cambré, genoux fléchis, bras gauche vers la balle ; impact en l'air, bras tendu au plus haut ; puis le corps se
  // plie vers l'avant, la raquette descend à gauche et la jambe droite part devant en ciseau.
  overhead: {
    prep: key({ twist: -1.0, lean: -0.3, crouch: 0.14, armR: [-0.55, 0.75, -0.35], armL: [0.2, 0.97, 0.15], elbowR: 1.6, racket: [0.15, -0.6, -0.75], face: [-1, 0, 0], stepL: 0.25 }),
    impact: key({ twist: -0.1, lean: -0.05, crouch: 0, armR: [-0.15, 0.98, 0.15], armL: [0.5, -0.3, 0.5], elbowR: 0, racket: [-0.05, 0.9, 0.4], face: [0, 0.2, 1], jump: 0.3 }),
    follow: key({ twist: 0.8, lean: 0.55, crouch: 0.05, armR: [0.45, -0.7, 0.5], armL: [0.3, -0.7, -0.5], elbowR: 0.2, racket: [0.45, -0.75, 0.35], face: [1, 0, 0], kick: 1.3 }),
  },
  serve: {
    prep: key({ twist: -0.8, lean: 0.25, crouch: 0.11, armR: [-0.45, -0.75, -0.45], armL: [0.3, -0.3, 0.9], racket: [-0.2, -0.6, -0.75], face: [-1, 0, 0] }),
    impact: key({ twist: -0.2, lean: 0.25, crouch: 0.1, armR: [-0.6, -0.7, 0.4], armL: [0.5, -0.5, 0.4], elbowR: 0.05, racket: [-0.7, -0.3, 0.6] }),
    follow: key({ twist: 0.6, lean: 0.15, crouch: 0.08, armR: [0.05, 0.25, 1], armL: [0.3, -0.7, 0.3], elbowR: 0.5, racket: [0.6, 0.75, 0], face: [0, 0, -1] }),
  },
};

/** Après l'impact : durée de la fin du geste, puis du retour en attente (s). */
/** Toutes les familles de geste, dans l'ordre du tableau (visionneur d'animations). */
export const SWING_FAMILIES = Object.keys(SWINGS) as SwingFamily[];

export const FOLLOW_TIME = 0.28;
export const RECOVER_TIME = 0.3;
/** Préparation : la raquette est à moitié armée en ~0,12 s, entièrement à 0,6 s (comme le bonus de vitesse, §13). */
const PREP_FULL = 0.6;
/** Part de la rotation des épaules prise par les hanches. */
const HIP_SHARE = 0.45;
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
    stepL: mix(a.stepL, b.stepL, t),
    stepR: mix(a.stepR, b.stepR, t),
    jump: mix(a.jump, b.jump, t),
    kick: mix(a.kick, b.kick, t),
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
    jump: upper.jump,
    bob: moving ? runBob : idleBob,
    bodyYaw: input.bodyYaw,
    twist: upper.twist,
    hipTwist: upper.twist * HIP_SHARE,
    lean: upper.lean + run * 0.16 * Math.max(0, fwd),
    armR: upper.armR,
    armL: moving && !input.prep && !s ? mixDir(upper.armL, [0.3, -0.75, -Math.sin(input.stride) * 0.6], run) : upper.armL,
    elbowR: upper.elbowR,
    racket: upper.racket,
    face: upper.face,
    legR: kickLeg(step(leg(1), upper.stepR, upper.stepL), upper.kick),
    legL: step(leg(-1), upper.stepL, upper.stepR),
  };
}

/** Jambe droite lancée vers l'avant, tendue (ciseau du smash). */
function kickLeg(leg: LegPose, kick: number): LegPose {
  return { swing: leg.swing - kick, spread: leg.spread, knee: leg.knee * (1 - Math.min(1, kick)) };
}

/** Pas en avant (`forward`) de cette jambe, ou en arrière quand c'est l'autre qui avance (`other`). */
function step(leg: LegPose, forward: number, other: number): LegPose {
  return { swing: leg.swing - forward + other * 0.5, spread: leg.spread, knee: leg.knee + forward * 0.6 };
}

/** Geste d'un coup au-dessus de la tête joué : le smash (remate) a le sien, les autres celui de la bandeja. */
export function overheadFamily(variant: OverheadKind | null): SwingFamily {
  // Seul le remate se joue en sautant ; la bajada (après la vitre) et la feinte prennent le geste de la bandeja.
  return variant === 'remate' ? 'overhead' : 'bandeja';
}

/** Coup au sol ou de volée, côté coup droit ou revers. */
export function lowFamily(side: 'fore' | 'back', volley: boolean): SwingFamily {
  if (!volley) return side;
  return side === 'fore' ? 'voleeFore' : 'voleeBack';
}

/**
 * La préparation en cours vise-t-elle un coup au-dessus de la tête ? Même règle que la simulation : la hauteur du
 * point d'impact prévu face au seuil des coups hauts (`Duel.swingFloor` au stick, au moins les yeux après un
 * rebond ; les épaules pour B aux boutons). Au stick, la commande est toujours celle d'un coup haut : seule la
 * hauteur décide. Sans point prévu, coup au sol.
 */
export function plansHighShot(duel: Duel, player: DuelPlayer, engagement: Engagement): boolean {
  const plan = engagement.plan;
  if (!plan) return false;
  const floor = duel.swingFloor(player.height);
  // `swingFloor` infini : seuil `lob`, pas de coup haut sur cette balle, aux boutons non plus.
  if (!engagement.swing) return engagement.kind === 'overhead' && floor !== Infinity && plan.contact.y >= duel.profile.rally.overheadLow;
  return plan.contact.y >= (plan.volley ? floor : Math.max(floor, bandejaHeight(duel.profile, player.height) - 0.02));
}
