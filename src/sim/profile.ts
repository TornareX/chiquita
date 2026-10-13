export interface SurfaceParams {
  /** Coefficient de restitution (vitesse normale conservée au rebond). */
  restitution: number;
  /** Coefficient de friction de Coulomb. */
  friction: number;
}

export interface PlayerTuning {
  /** Vitesse de course (m/s). */
  maxSpeed: number;
  /** Accélération au démarrage et freinage à l'arrêt (m/s²) : c'est l'inertie. */
  acceleration: number;
  deceleration: number;
  /** Fraction de la vitesse conservée pendant la préparation du coup. */
  prepareSpeedFactor: number;
  /** Rayon du joueur pour les collisions avec les murs et le filet (m). */
  radius: number;
  /** Hauteur des yeux (m). */
  eyeHeight: number;
  /** Vitesse verticale du petit saut de split-step (m/s). */
  hopSpeed: number;
  /** La réception doit tomber dans cette fenêtre autour du lancement de la machine (s). */
  splitStepWindowBefore: number;
  splitStepWindowAfter: number;
  /** Bonus d'un split-step réussi : durée (s) et multiplicateurs. */
  boostDuration: number;
  boostAccelFactor: number;
  boostSpeedFactor: number;
}

/** Réglages de la raquette. Longueurs en mètres, durées en secondes, angles en degrés. */
export interface RacketTuning {
  /** Durée de maintien pour une préparation complète. */
  prepareTime: number;
  /** Durée du swing : sans préparation (max) et avec préparation complète (min). */
  swingDurationMax: number;
  swingDurationMin: number;
  recoverTime: number;
  /** Rayon du tamis. */
  headRadius: number;
  /** Multiplicateur de la taille effective du tamis (aide d'entraînement, 1 = réel). */
  tolerance: number;
  /** Recul du tamis derrière le joueur : sans préparation et avec préparation complète. */
  backswingMin: number;
  backswingMax: number;
  /** Avancée maximale du tamis devant le joueur en fin de swing. */
  reachForward: number;
  /** Écart latéral du tamis : au début et à la fin du swing. */
  lateralStart: number;
  lateralEnd: number;
  /** Position d'attente du tamis. */
  readyForward: number;
  readyLateral: number;
  readyHeight: number;
  /** Le tamis suit la hauteur de la balle dans ces limites, à cette vitesse max (m/s). */
  heightMin: number;
  heightMax: number;
  heightRate: number;
  /** Rebond de la balle sur le tamis (coefficient apparent) et friction. */
  restitution: number;
  friction: number;
  /** Ouverture du tamis pour un coup à pleine vitesse (`referenceSpeed`, en m/s), regard horizontal. */
  baseLoft: number;
  /** Ouverture supplémentaire quand la vitesse du tamis tend vers zéro. */
  slowLoft: number;
  referenceSpeed: number;
  /** Part du regard vertical reprise dans l'angle de sortie, et sa contribution maximale. */
  pitchInfluence: number;
  maxPitchLoft: number;
  /** Geste vertical de souris pendant le swing → angle de brossage (degrés par radian de souris). */
  brushGain: number;
  maxBrush: number;
  /** Part de l'angle de brossage vers le haut qui ouvre aussi le tamis (lob). */
  loftPerBrush: number;
  /** Pendant le swing, part du mouvement de souris qui tourne encore la caméra ; le reste oriente le coup. */
  swingLookFactor: number;
  /** Multiplicateur de vitesse du coup de toucher. */
  softFactor: number;
  /** Point idéal du contact le long du swing (0 = début, 1 = fin). */
  idealContact: number;
  /** Déviation latérale par unité de retard ou d'avance sur le point idéal. */
  timingAngle: number;
  /** Contact au bord du tamis : perte de vitesse (fraction) et déviation maximale. */
  edgeSpeedLoss: number;
  edgeDeviation: number;
  /** Qualité de contact à partir de laquelle le coup est « parfait ». */
  perfectQuality: number;
}

/** Tous les coefficients de la physique, regroupés pour être modifiables à chaud. */
export interface PhysicsProfile {
  player: PlayerTuning;
  racket: RacketTuning;
  gravity: number;
  airDensity: number;
  dragCoefficient: number;
  /** Multiplicateur de l'effet Magnus (1 = modèle nominal, 0 = désactivé). */
  magnusScale: number;
  /** Fraction du spin perdue par seconde en vol. */
  spinDecay: number;
  /** Moment d'inertie de la balle : I = inertiaFactor · m · r² (sphère creuse épaisse). */
  inertiaFactor: number;
  /** Décélération d'une balle qui roule au sol (m/s²). */
  rollingDeceleration: number;
  /** Sous cette vitesse de rebond (m/s), la balle reste au sol. */
  restSpeed: number;
  ground: SurfaceParams;
  glass: SurfaceParams;
  mesh: SurfaceParams & {
    /** Inclinaison maximale de la normale (tangente de l'angle), source de l'irrégularité. */
    roughness: number;
  };
  net: SurfaceParams;
  /** Fraction de vitesse horizontale perdue quand la balle accroche pleinement la bande du filet. */
  tapeSpeedLoss: number;
}

export const REALISTIC: PhysicsProfile = {
  // Tout le ressenti du déplacement est [à calibrer] en jouant.
  player: {
    maxSpeed: 5,
    acceleration: 20,
    deceleration: 26,
    prepareSpeedFactor: 0.55,
    radius: 0.3,
    eyeHeight: 1.65,
    hopSpeed: 1.5,
    splitStepWindowBefore: 0.15,
    splitStepWindowAfter: 0.4,
    boostDuration: 0.5,
    boostAccelFactor: 2,
    boostSpeedFactor: 1.15,
  },
  // Idem : tout le ressenti de la frappe est [à calibrer] en jouant.
  racket: {
    prepareTime: 0.45,
    swingDurationMax: 0.19,
    swingDurationMin: 0.14,
    recoverTime: 0.25,
    headRadius: 0.13,
    tolerance: 1,
    backswingMin: 0.1,
    backswingMax: 0.45,
    reachForward: 0.95,
    lateralStart: 0.6,
    lateralEnd: 0.4,
    readyForward: 0.35,
    readyLateral: 0.3,
    readyHeight: 1,
    heightMin: 0.25,
    heightMax: 1.9,
    heightRate: 4,
    restitution: 0.35,
    friction: 0.35,
    baseLoft: 5,
    slowLoft: 10,
    referenceSpeed: 15,
    pitchInfluence: 0.35,
    maxPitchLoft: 12,
    brushGain: 115,
    maxBrush: 40,
    loftPerBrush: 0.35,
    swingLookFactor: 0.3,
    softFactor: 0.45,
    idealContact: 0.6,
    timingAngle: 25,
    edgeSpeedLoss: 0.4,
    edgeDeviation: 10,
    perfectQuality: 0.85,
  },
  gravity: 9.81,
  airDensity: 1.2,
  dragCoefficient: 0.55, // [à calibrer]
  magnusScale: 1, // [à calibrer]
  spinDecay: 0.05, // [à calibrer]
  inertiaFactor: 0.55,
  rollingDeceleration: 1.5, // [à calibrer]
  restSpeed: 0.2,
  // Restitution calée sur le test FIP (rebond de 1,35–1,45 m pour une chute de 2,54 m) :
  // 0,77 et non √(1,40/2,54) ≈ 0,74, car la traînée de l'air est simulée séparément.
  ground: { restitution: 0.77, friction: 0.6 },
  glass: { restitution: 0.65, friction: 0.2 }, // [à calibrer]
  mesh: { restitution: 0.3, friction: 0.8, roughness: 0.25 }, // [à calibrer]
  net: { restitution: 0.05, friction: 0.8 },
  tapeSpeedLoss: 0.5, // [à calibrer]
};
