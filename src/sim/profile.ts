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
  /**
   * Zone de frappe, par rapport au joueur : la balle y est touchée si elle s'y trouve pendant le swing.
   * Le bras fait l'ajustement fin ; plus la balle est loin du point idéal, moins le contact est bon.
   * Profondeur le long du regard : du plus en arrière au plus en avant, et point idéal.
   */
  reachBack: number;
  reachFront: number;
  idealForward: number;
  /** Écart latéral, du côté de la raquette : limite côté corps (négatif = de l'autre côté), limite extérieure, idéal. */
  reachInside: number;
  reachLateral: number;
  idealLateral: number;
  /** Hauteur de la balle : limites, et plage confortable sans perte de qualité. */
  reachLow: number;
  reachHigh: number;
  comfortLow: number;
  comfortHigh: number;
  /** Partie du swing (avancement 0..1) pendant laquelle le tamis peut toucher la balle. */
  contactStart: number;
  contactEnd: number;
  /** Décalage du point de contact le long du swing quand la balle est en limite de zone, devant ou derrière. */
  timingSpread: number;
  /** Multiplicateur de la taille de la zone de frappe (aide d'entraînement, 1 = réel). */
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
  /** Part de la vitesse du tamis, et de celle de la balle entrante, rendue à la balle (coefficient apparent). */
  restitution: number;
  /** Hauteur de passage visée au-dessus du filet pour un coup normal (m). */
  netClearance: number;
  /** Hauteur de passage ajoutée par degré de regard vers le haut (m). */
  clearancePerPitch: number;
  /** Geste vertical de souris pendant le swing → angle de brossage (degrés par radian de souris). */
  brushGain: number;
  maxBrush: number;
  /** Hauteur de passage ajoutée par un brossage maximal vers le haut (lob), retirée vers le bas (m). */
  lobClearance: number;
  sliceClearance: number;
  /** Effet donné à la balle par le brossage : fraction de la vitesse de la balle convertie en rotation. */
  spinGain: number;
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

/** Réglages d'un coup arcade (bouton A, X ou Y). Vitesses en m/s, hauteurs en m. */
export interface ShotTypeTuning {
  /** Vitesse horizontale maximale : coup normal, puis frappe parfaite. */
  speed: number;
  speedPerfect: number;
  /** Passage minimal au-dessus du filet. */
  clearance: number;
  /** Temps de vol imposé (s), coup normal puis frappe parfaite ; 0 = déduit de la vitesse (coups tendus). */
  flightTime: number;
  flightTimePerfect: number;
  /** Profondeur visée, en distance au filet : stick vers soi, au neutre, stick vers l'avant. */
  depthShort: number;
  depthNeutral: number;
  depthLong: number;
  /** Effet : fraction de la vitesse convertie en rotation, positif = lift, négatif = slice. */
  spin: number;
}

/** Échange arcade : course assistée et coups à boutons (GAME_DESIGN.md §4). */
export interface RallyTuning {
  /**
   * Fenêtre de timing (GAME_DESIGN.md §4 et §13) : le bouton maintenu prépare le coup, le relâcher
   * le déclenche. Relâcher entre `perfectBefore` avant et `perfectAfter` après le moment d'impact
   * donne une frappe parfaite ; plus tôt, un coup normal joué à l'impact ; plus tard que
   * `lateWindow` après l'impact, le coup est raté (faute de retard). Durées en s.
   */
  perfectBefore: number;
  perfectAfter: number;
  lateWindow: number;
  /** Pendant la fenêtre de retard, la portée est multipliée par ce facteur (la balle a dépassé le joueur). */
  lateReach: number;
  /** Frappe parfaite : passage au-dessus du filet multiplié par ce facteur (balle plus tendue). */
  perfectClearance: number;
  /** Écart latéral de la cible au stick à fond : coup normal, puis frappe parfaite (m). */
  aimWidth: number;
  aimWidthPerfect: number;
  /** Distance horizontale maximale entre le joueur et la balle au moment de la frappe (m). */
  reach: number;
  /** Hauteurs de balle frappables (m). */
  hitLow: number;
  hitHigh: number;
  /** La course assistée place la balle à cette distance sur le côté du joueur (m). */
  standLateral: number;
  /** Marge de temps gardée pour arriver avant la balle (s). */
  arriveMargin: number;
  /** Après une frappe, le joueur ne peut pas réarmer pendant ce temps (s). */
  recoverTime: number;
  /** Une volée n'est proposée que si le joueur est à moins de cette distance du filet (m). */
  volleyZone: number;
  /**
   * Assistance partielle : toucher au stick plus de `aimWindow` secondes avant l'impact prévu coupe
   * la course assistée (placement manuel) ; dans cette fenêtre, le stick ne fait que viser.
   */
  aimWindow: number;
  /** Écart du stick par rapport à sa position à l'appui qui compte comme « toucher » (0..1). */
  manualThreshold: number;
  /** Récompense du placement manuel : plage latérale de visée multipliée par ce facteur. */
  manualAimBonus: number;
  normal: ShotTypeTuning;
  slice: ShotTypeTuning;
  lob: ShotTypeTuning;
}

/** Tous les coefficients de la physique, regroupés pour être modifiables à chaud. */
export interface PhysicsProfile {
  player: PlayerTuning;
  racket: RacketTuning;
  rally: RallyTuning;
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
    reachBack: -0.5,
    reachFront: 1.4,
    idealForward: 0.5,
    reachInside: -0.15,
    reachLateral: 1.2,
    idealLateral: 0.55,
    reachLow: 0.1,
    reachHigh: 2.1,
    comfortLow: 0.45,
    comfortHigh: 1.4,
    contactStart: 0.3,
    contactEnd: 0.9,
    timingSpread: 0.35,
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
    netClearance: 0.6,
    clearancePerPitch: 0.06,
    brushGain: 115,
    maxBrush: 40,
    lobClearance: 3.5,
    sliceClearance: 0.4,
    spinGain: 0.6,
    swingLookFactor: 0.3,
    softFactor: 0.45,
    idealContact: 0.6,
    timingAngle: 25,
    edgeSpeedLoss: 0.4,
    edgeDeviation: 10,
    perfectQuality: 0.85,
  },
  // Coups arcade à vitesse réelle : sert de référence, le jeu utilise ARCADE. [à calibrer]
  rally: {
    perfectBefore: 0.07,
    perfectAfter: 0.05,
    lateWindow: 0.12,
    lateReach: 1.6,
    perfectClearance: 0.6,
    aimWidth: 3,
    aimWidthPerfect: 3.8,
    reach: 1.1,
    hitLow: 0.15,
    hitHigh: 2.1,
    standLateral: 0.6,
    arriveMargin: 0.06,
    recoverTime: 0.3,
    volleyZone: 4.5,
    aimWindow: 0.3,
    manualThreshold: 0.35,
    manualAimBonus: 1.25,
    normal: {
      speed: 20,
      speedPerfect: 24,
      clearance: 0.45,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 3.5,
      depthNeutral: 6.5,
      depthLong: 8.8,
      spin: 0.25,
    },
    slice: {
      speed: 15.5,
      speedPerfect: 18,
      clearance: 0.3,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 2.5,
      depthNeutral: 5.5,
      depthLong: 8.3,
      spin: -0.3,
    },
    lob: {
      speed: 30,
      speedPerfect: 30,
      clearance: 2.5,
      flightTime: 1.75,
      flightTimePerfect: 1.6,
      depthShort: 6.5,
      depthNeutral: 8.2,
      depthLong: 9.2,
      spin: 0.12,
    },
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

/**
 * Profil du jeu (GAME_DESIGN.md §6) : on cherche le rythme de Virtua Tennis, pas la simulation.
 * Balle plus lente en l'air (gravité et vitesses de coup réduites : plus de temps pour lire),
 * joueurs plus rapides et plus réactifs. Toutes les valeurs ajoutées ici sont [à calibrer VT4].
 */
export const ARCADE: PhysicsProfile = {
  ...REALISTIC,
  player: {
    ...REALISTIC.player,
    maxSpeed: 7.5, // [à calibrer VT4 : vitesse de course]
    acceleration: 38, // [à calibrer VT4 : accélération]
    deceleration: 45, // [à calibrer VT4]
  },
  rally: {
    ...REALISTIC.rally,
    // [à calibrer en jouant : VT4 confirme seulement qu'un maintien trop long rate le coup]
    perfectBefore: 0.07,
    perfectAfter: 0.05,
    reach: 1.25, // [à calibrer VT4 : portée]
    aimWindow: 0.3, // [à calibrer VT4 : quand le stick vise-t-il au lieu de déplacer ?]
    manualAimBonus: 1.25, // [à calibrer VT4]
    normal: { ...REALISTIC.rally.normal, speed: 15.5, speedPerfect: 18.5 }, // [à calibrer VT4 : vitesses de balle]
    slice: { ...REALISTIC.rally.slice, speed: 11.5, speedPerfect: 13.5 }, // [à calibrer VT4]
    lob: { ...REALISTIC.rally.lob, flightTime: 2.05, flightTimePerfect: 1.9 }, // [à calibrer VT4 : temps de vol]
  },
  gravity: 8, // [à calibrer VT4 : temps de vol typiques] balle plus « flottante »
  magnusScale: 0.7, // [à calibrer VT4]
  // Rebonds plus francs.
  ground: { ...REALISTIC.ground, restitution: 0.8 }, // [à calibrer VT4]
  glass: { ...REALISTIC.glass, restitution: 0.7 }, // [à calibrer VT4]
};

export const PROFILES = { realistic: REALISTIC, arcade: ARCADE } as const;
export type ProfileName = keyof typeof PROFILES;
