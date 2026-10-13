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

/** Tous les coefficients de la physique, regroupés pour être modifiables à chaud. */
export interface PhysicsProfile {
  player: PlayerTuning;
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
