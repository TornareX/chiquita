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
  /** Temps de vol à la profondeur courte (lob court), interpolé jusqu'à `flightTime` à la profondeur neutre. */
  flightTimeShort?: number;
  /** Effet de la frappe parfaite, s'il diffère de `spin` (volée coupée : plus coupée). */
  spinPerfect?: number;
  /** `speed` est la vitesse de la balle au départ, et non sa vitesse horizontale (smash frappé vers le bas). */
  launchSpeed?: boolean;
  /** Effet latéral (víbora) : fraction de la vitesse convertie en rotation autour de la verticale, vers l'extérieur. */
  sideSpin?: number;
}

/** Échange arcade : course assistée et coups à boutons (GAME_DESIGN.md §4). */
export interface RallyTuning {
  /**
   * Fenêtre de timing (GAME_DESIGN.md §4 et §13) : le bouton maintenu prépare le coup, le relâcher
   * le déclenche aussitôt. Frappée entre `perfectBefore` avant et `perfectAfter` après le passage de
   * la balle au point idéal : frappe parfaite ; plus tôt, coup normal ; plus tard, coup en retard,
   * jusqu'à `lateWindow` où la balle a passé le joueur. Durées en s.
   */
  perfectBefore: number;
  perfectAfter: number;
  lateWindow: number;
  /** Pendant la fenêtre de retard, la portée est multipliée par ce facteur (la balle a dépassé le joueur). */
  lateReach: number;
  /** Après le relâcher, la raquette reste active ce temps (s) : sans balle à portée, coup dans le vide. */
  swingWindow: number;
  /**
   * Sur une balle lente, la raquette tendue d'avance attend plus longtemps : `swingWindowSlow` s à `swingSlowSpeed` m/s
   * et moins, `swingWindow` à `swingFastSpeed` et plus. Relâcher un peu tôt sur une chiquita ne fait plus passer à
   * travers la balle (le coup reste jugé en avance).
   */
  swingWindowSlow: number;
  swingSlowSpeed: number;
  swingFastSpeed: number;
  /**
   * Raquette partie en avance sur une balle qui arrive et passera à portée : si elle arrive au plus tant (s) après le
   * relâcher, la raquette l'attend, au sol comme de volée, préparée ou non. Relâché bien plus tôt : coup dans le vide. Le coup est alors jugé en avance (moins bon), mais il ne part plus dans le vide :
   * le journal des frappes (22/10) montrait des lobs et des volées ratés à 0,1-0,3 s d'avance.
   */
  earlyWait: number;
  /**
   * Pas d'ajustement : en placement manuel, stick gauche bloqué pendant la préparation, le joueur fait seul
   * les derniers pas vers le point d'impact s'il est à moins de tant (m). Comme le split-step suivi d'un pas des pros :
   * préparer tôt au filet ne fige plus le joueur à côté de la chiquita.
   */
  adjustStep: number;
  /** Frappe parfaite seulement si la balle passe à moins de cette distance du point idéal (m). */
  sweetSpot: number;
  /**
   * Frappe en retard (après la sous-fenêtre parfaite) : la cible s'écarte vers l'extérieur et vers le
   * fond, proportionnellement au retard, jusqu'à ces distances en fin de fenêtre (m). Un coup visé
   * profond et relâché tard finit dans la vitre adverse : c'est le risque de la fenêtre de timing.
   */
  lateDriftLateral: number;
  lateDriftDepth: number;
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
   * Plus basse hauteur de volée prévue par la course assistée (m) : une balle qui plonge aux pieds du
   * joueur au filet (chiquita) se joue après le rebond, sous le filet, et doit remonter. Prévue de volée
   * juste avant le rebond, le moindre retard la faisait rater.
   */
  volleyLow: number;
  /** Course assistée : coût d'une volée prise sous `lowVolley.height` (par mètre sous elle), pour la prendre plus haute. */
  volleyLowCost: number;
  /**
   * Balle qui va jusqu'à la vitre : la course assistée ne la prend avant que si le point d'impact
   * laisse au moins cette place devant la vitre (m) ; plus près, le joueur la laisse passer.
   */
  glassRoom: number;
  /** Assistance « aimant » : la course assistée ne prend la main qu'à cette distance du point d'impact (m). */
  magnetRadius: number;
  /** Aimant : préférence pour le point d'impact le plus proche du joueur (coût par mètre à courir). */
  magnetNear: number;
  /** Écart minimal entre la balle et la vitre du fond au point d'impact, après la vitre (m). */
  glassGap: number;
  /** Préférence de la course assistée pour jouer après la vitre (même unité que le coût : ~s × 4). */
  glassBonus: number;
  /**
   * Volée (coup normal ou coupé pris avant le rebond) : vitesse multipliée par `volleySpeed` (balle
   * proche du filet, frappée sèche) et plage latérale de visée par `volleyWidth` (angles du filet).
   */
  volleySpeed: number;
  volleyWidth: number;
  /**
   * Effet de la volée au coup normal (A) : coupé. Une balle liftée remonte la vitre jusqu'à ~2 m ; une
   * volée coupée en sort à ~0,5 m, à ramasser bas. Le coupé (X) garde le sien, plus fort.
   */
  volleySpin: number;
  /** Coup normal ou coupé joué après une vitre : vitesse multipliée par ce facteur (coup défensif). */
  glassSpeed: number;
  /**
   * Assistance partielle : toucher au stick plus de `aimWindow` secondes avant l'impact prévu coupe
   * la course assistée (placement manuel) ; dans cette fenêtre, le stick ne fait que viser.
   */
  aimWindow: number;
  /**
   * Placement manuel, stick gauche bloqué au dernier moment (`tard`) : le joueur ne s'immobilise (le stick vise)
   * qu'à moins de `prepLock` s de l'impact prévu ; avant, il se place au stick.
   */
  prepLock: number;
  /** Écart du stick par rapport à sa position à l'appui qui compte comme « toucher » (0..1). */
  manualThreshold: number;
  /** Récompense du placement manuel : plage latérale de visée multipliée par ce facteur. */
  manualAimBonus: number;
  /**
   * Coup au-dessus de la tête (bouton B) : hauteurs de balle où il se joue (m), et hauteur préférée par
   * la course assistée. Plus bas, B donne un coup défensif (coupé).
   */
  overheadLow: number;
  overheadHigh: number;
  overheadIdeal: number;
  /** La course assistée place la balle à cette distance sur le côté du joueur, au-dessus de la tête (m). */
  overheadLateral: number;
  /** Main forte : le revers est moins fort que le coup droit, et les coups au-dessus de la tête se jouent côté main. */
  hand: HandTuning;
  /** Stick à fond au-delà de ce seuil (0..1), vers l'avant : remate ; sur le côté : víbora ; sinon bandeja. */
  overheadStick: number;
  /** Le remate ne se joue qu'à moins de cette distance du filet, sur une balle au moins à `remateLow` (m) ; sinon, bandeja. */
  remateZone: number;
  remateLow: number;
  /**
   * Seuil `lob` des coups hauts : une balle plus lente que ça à l'horizontale (m/s) est flottante et se smashe
   * comme un lob ; plus rapide (défense à plat, ~14 m/s), elle se volleye.
   */
  floatSpeed: number;
  /** Remate parfait : profondeur visée, courte, pour que la balle rebondisse haut et sorte du terrain (m). */
  remateKillDepth: number;
  /**
   * Remate parfait claqué à moins de `remateNearZone` m du filet (balle flottante) : plus court encore, à
   * `remateKillNear` m, il rebondit assez haut pour sortir par le fond (por cuatro) ou le côté.
   */
  remateNearZone: number;
  remateKillNear: number;
  /**
   * Écart latéral de la cible d'un remate au stick à fond : parfait (l'angle qui le fait sortir par le
   * côté), puis non parfait (il reste plus près de l'axe et revient de la vitre) ; et de la víbora (m).
   */
  remateWidth: number;
  remateWidthLoose: number;
  viboraLateral: number;
  /** Bandeja sans direction : écart au centre de la cible, vers le coin, le long de la ligne (m). */
  bandejaLateral: number;
  /**
   * Bandeja et víbora au stick (« facile à jouer, dur à maîtriser ») : sans direction, le coup sûr ; stick vers l'avant
   * ou l'arrière seulement (au-delà de `overheadCentreStick`), au centre (víbora à `viboraCentre` m de l'axe).
   * Le stick vers l'avant frappe plus fort, vers l'arrière plus doux : vitesse × (1 ± `overheadPower`).
   * Frappe pas propre (hors de la bande des yeux, ou décentrée) sur une cible ambitieuse : la balle file au-delà, de
   * `overheadSlop` m sur le côté (víbora près de la ligne) et `overheadSlopDepth` m en longueur (au fond) au plus,
   * × la puissance : visée près des lignes et frappée fort, elle finit dans la vitre de volée.
   */
  overheadCentreStick: number;
  viboraCentre: number;
  overheadPower: number;
  overheadSlop: number;
  overheadSlopDepth: number;
  /**
   * Hauteur de frappe de la bandeja et de la víbora : idéale à hauteur des yeux du joueur (sa taille moins
   * `eyesBelowHead`), ± `overheadBand` (m), devant et sur le côté. La course assistée place le joueur
   * pour cette hauteur ; pour le remate (stick vers l'avant à l'appui, près du filet), plus haut, bras
   * tendu (`overheadIdeal`). Prise trop haute, la balle est moins coupée
   * (effet perdu, jusqu'à `overheadHighSpin` à `overheadHigh`) et part plus profond (`overheadHighDepth`, m) :
   * elle rebondit plus et ressort de la vitre, balle facile pour l'adversaire. Prise trop basse, elle part
   * plus à plat (vitesse verticale retirée, jusqu'à `overheadLowDip` m/s à `overheadLow`) : risque de filet.
   */
  eyesBelowHead: number;
  overheadBand: number;
  overheadHighSpin: number;
  overheadHighDepth: number;
  overheadLowDip: number;
  /** Sous la bande idéale, hauteur (m) sur laquelle l'écart va de 0 à « trop basse » au maximum. */
  overheadLowSpan: number;
  /**
   * Balle haute prise en retard : descendue sous `overheadLow`, le joueur frappe encore son coup haut
   * (trop bas, il part au filet) tant qu'elle est au-dessus de `overheadMissLow` (m) et dans
   * `overheadLateWindow` (s) après le moment idéal ; au-delà, coup dans le vide.
   */
  overheadMissLow: number;
  overheadLateWindow: number;
  /** Lob parfait : profondeur ajoutée (m). */
  lobPerfectDepth: number;
  /** Pression de la balle reçue et précision du contact (`src/sim/pressure.ts`). */
  pressure: PressureTuning;
  normal: ShotTypeTuning;
  slice: ShotTypeTuning;
  lob: ShotTypeTuning;
  bandeja: ShotTypeTuning;
  /**
   * Feinte de smash (stick droit préparé puis lâché, au-dessus de la tête) : armée comme un smash, mais
   * frappée lentement et coupée ; la balle meurt vers la vitre après son deuxième rebond.
   */
  feinte: ShotTypeTuning;
  vibora: ShotTypeTuning;
  remate: ShotTypeTuning;
  /** Bajada : attaque depuis le fond sur la balle haute qui ressort de la vitre, à plat, profonde. */
  bajada: ShotTypeTuning;
  /**
   * Volée coupée (geste préparé de volée) : la volée de pression des pros, ~70 km/h, profonde et coupée. Elle gagne
   * rarement le point d'elle-même : elle fait remettre une balle plus faible, jusqu'à la balle à conclure, ou le lob.
   * L'IA la choisit sur une balle flottante (verte, prise au-dessus de `cutLow`).
   */
  cut: ShotTypeTuning;
  cutLow: number;
  /**
   * Volée de définition : le même geste, frappé parfait sur une balle offerte (verte, prise au-dessus de `punch.low`) :
   * rapide, coupée et en angle, elle conclut. C'est la balle reçue qui ouvre ce coup, pas le geste.
   */
  punch: ShotTypeTuning;
  punchLow: number;
  /**
   * Volée basse : préparée, prise sous `lowVolleyHeight` (sous la bande du filet), de volée ou au pied près du filet. Il
   * faut remonter la balle : lente, plus haute sur le filet, profonde. Contre une bonne chiquita, on garde le filet sans
   * pouvoir attaquer.
   */
  lowVolley: ShotTypeTuning;
  lowVolleyHeight: number;
  /** Après le rebond, la balle prise sous `lowVolleyHeight` à moins de tant du filet (m) se joue aussi en volée basse. */
  lowVolleyNet: number;
  /** Chiquita (X stick vers soi, après rebond) : lente et basse, aux pieds du joueur au filet. */
  chiquita: ShotTypeTuning;
  /** Contre-vitre (contrapared) : la balle qui a passé le joueur se renvoie contre sa propre vitre du fond. */
  counterWall: CounterWallTuning;
  /**
   * Préparation (de l'appui à la frappe) : sous `blockPrep` s, le coup est bloqué (vitesse × `blockSpeed`,
   * plage latérale × `blockWidth`) ; la vitesse est pleine à `fullPrep` s. Pas une jauge : au-delà, rien de plus.
   */
  blockPrep: number;
  /**
   * De volée, la préparation qui suffit pour couper la volée (s) : au filet, la balle arrive vite et le geste est
   * court. À 0,3 s comme les autres coups, le journal des frappes (22/10) montrait des volées préparées 0,1-0,29 s
   * jugées bloquées.
   */
  volleyPrep: number;
  fullPrep: number;
  blockSpeed: number;
  blockWidth: number;
  serve: ServeTuning;
}

/**
 * Pression (balle verte, jaune, rouge) et erreur du coup. Rampes linéaires entre une valeur « facile »
 * (0) et une valeur « dure » (1). Tout est [à calibrer en jouant].
 */
export interface PressureTuning {
  /** 0 désactive la pression et l'erreur (comparaison en jeu : `?pression=0`), 1 = réglage normal. */
  scale: number;
  /** Temps de préparation (s) : confortable au-dessus de `prepEasy`, sans préparation sous `prepHard`. */
  prepEasy: number;
  prepHard: number;
  /** Hauteur d'impact (m) : confortable au-dessus de `comfortLow`, dans les pieds sous `lowHeight`. */
  comfortLow: number;
  lowHeight: number;
  /** Part de la gêne d'une balle basse qui reste au coupé (il la remet mieux). */
  sliceLow: number;
  /** Vitesse de la balle reçue (m/s). */
  slowSpeed: number;
  fastSpeed: number;
  /** Part de la vitesse de départ du coup adverse qui compte comme vitesse reçue (une volée forte reste dure après la vitre). */
  struckSpeed: number;
  /** Vitesse du joueur à l'impact (m/s). */
  runEasy: number;
  runHard: number;
  weights: { time: number; low: number; fast: number; running: number };
  /** Pression ajoutée par une balle sortie d'un coin. */
  doubleGlass: number;
  /** Erreur de timing : en avance, pleine à `earlySpan` s avant la sous-fenêtre parfaite ; en retard, à la fin de la fenêtre. */
  earlySpan: number;
  /** Poids de l'erreur de timing, de l'écart latéral au point idéal, et de la pression dans l'erreur du coup. */
  timingError: number;
  missError: number;
  pressureError: number;
  /** Frappe parfaite : la part de la pression est multipliée par ce facteur. */
  perfectRelief: number;
  /** Part de l'imprécision qui compte sur une balle verte ; elle compte entière sur une balle rouge. */
  calmImprecision: number;
  /** Sous pression maximale, la sous-fenêtre parfaite rétrécit de cette fraction (réflexes à la volée). */
  windowShrink: number;
  /** Erreur maximale : passage au-dessus du filet plus haut de tant (m), vitesse réduite de cette fraction, lob plus court de tant (m). */
  clearance: number;
  speedLoss: number;
  lobShort: number;
  /** Erreur maximale : coup normal ou coupé plus long de tant (m) ; avec du retard, il finit dans la vitre. */
  long: number;
  /**
   * Balle prise très bas, sous `netLow` (m), aux pieds (après une chiquita) : au-delà d'une erreur de 0,5,
   * le coup perd jusqu'à `netDip` m/s de vitesse verticale à l'erreur maximale, et finit parfois dans le filet.
   */
  netLow: number;
  netDip: number;
  /** Volée coupée : l'erreur est multipliée par 1 + `cutRush` × pression (balle pressée, coupé raté). */
  cutRush: number;
  /**
   * Volée coupée, basse ou bloquée : part de `clearance` gardée. Une volée ratée part longue ou large,
   * mais reste basse. Entière, l'erreur la faisait passer 0,3 m plus haut, et la vitesse fondait pour y arriver (15 →
   * 10 m/s, sommet 1,7 m) : la volée coupée ressemblait à un lob (journal des frappes, 22/10).
   */
  volleyClearance: number;
  /** Au-dessus de la tête, l'erreur est multipliée par ce facteur (balle haute = balle d'attaque). */
  overheadFactor: number;
  /**
   * Volée contre une balle lourde (smash, volée appuyée) : son poids va de 0 à `paceEasy` m/s à 1 à `paceHard`.
   * Le relâcher compte alors autant que le passage de la balle : raquette partie plus de `volleySweep` s trop tôt,
   * c'est une frappe en avance (on ne bloque pas un smash en tendant la raquette d'avance).
   * La sous-fenêtre parfaite rétrécit en plus de `paceShrink` (fraction) au poids maximal. Hors d'elle, le contrôle
   * se perd (`miscue`, de 0 à 1, × le poids) : pleinement à `miscueSpan` s hors de la fenêtre, ou à `miscueMiss` m
   * hors du point idéal. En avance, la balle part plus long de `miscueLong` m au plus (dans la vitre adverse de
   * volée) ; à l'heure ou en retard, elle perd `miscueDip` m/s de vitesse verticale au plus (filet). Juste à côté de
   * la fenêtre, elle passe encore, mais faible. Une balle douce ne change pas : facile à jouer, dure à maîtriser.
   */
  paceEasy: number;
  paceHard: number;
  volleySweep: number;
  paceShrink: number;
  /** Balle rouge (pression de `redFrom` à `redFull`) : même perte de contrôle hors de la sous-fenêtre parfaite, × son poids. */
  redFrom: number;
  redFull: number;
  miscueSpan: number;
  miscueMiss: number;
  miscueLong: number;
  miscueDip: number;
}

/**
 * Contre-vitre (`CHANTIERS_PLAN.md`, étape 4) : après son rebond, la balle a passé le joueur et file vers sa vitre du
 * fond. Coup normal, stick tiré vers sa vitre : il la frappe contre elle, elle repasse le filet. Distances en m,
 * durées en s. Tout est [à calibrer en jouant].
 */
export interface CounterWallTuning {
  /** Stick tiré vers sa vitre au-delà de ce seuil (0..1). */
  stick: number;
  /**
   * Point idéal : la balle à cette distance derrière le joueur ; la raquette l'y attend. Disponible dès qu'elle est à
   * `ahead` m devant lui (il court vers sa vitre plus vite qu'elle), jusqu'à `late` s après le point idéal.
   */
  ideal: number;
  ahead: number;
  late: number;
  /**
   * Contre-vitre demandée (relâcher, stick tiré vers sa vitre) : la raquette attend la balle au point idéal au plus
   * tant (s). Relâchée plus de `perfectBefore` avant le passage au point idéal, elle est en avance : l'erreur de
   * timing est pleine à `earlySpan` s d'avance.
   */
  wait: number;
  earlySpan: number;
  /**
   * Distance horizontale maximale entre le joueur et la balle ; écart latéral au point de frappe (sur le côté, à
   * `standLateral`) d'une frappe parfaite.
   */
  reach: number;
  sweetSpot: number;
  /** Hauteurs de balle jouables. */
  low: number;
  high: number;
  /** Plus près de la vitre que `glassRoom`, la balle n'a plus la place d'être frappée contre elle ; plus loin que `maxRoom`, elle n'y arrive pas. */
  glassRoom: number;
  maxRoom: number;
  /** Balle qui s'éloigne vers la vitre plus vite que ça (m/s). */
  minSpeed: number;
  /** Point de chute visé, en distance au filet chez l'adversaire : coup normal, frappe parfaite. */
  depth: number;
  depthPerfect: number;
  /** Écart latéral de la cible au stick à fond : coup normal, frappe parfaite. */
  width: number;
  widthPerfect: number;
  /** Temps de vol du contact au point de chute : lent et haut. */
  flightTime: number;
  /** Passage minimal au-dessus du filet. */
  clearance: number;
  /** Erreur maximale : vitesse horizontale réduite de cette fraction (la balle retombe chez soi ou dans le filet). */
  speedLoss: number;
}

/** Service à la cuillère, en diagonale. Distances en m ; profondeurs comptées depuis le filet. */
export interface ServeTuning {
  /** Écart au centre du serveur et du receveur, chacun de son côté de service. */
  standLateral: number;
  serverDepth: number;
  receiverDepth: number;
  /** Centre de la cible dans le carré, puis écart au stick à fond : coup normal, frappe parfaite. */
  centerLateral: number;
  aimWidth: number;
  aimWidthPerfect: number;
  depthShort: number;
  depthNeutral: number;
  depthLong: number;
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
  /** Balle coupée : restitution au sol réduite jusqu'à cette fraction (0 = sans effet). */
  slicedBounce: number;
}

/** Coup droit et revers (`CHANTIERS_PLAN.md`, étape 2). */
export interface HandTuning {
  /** Revers au sol ou de volée (hors lob, volée coupée et chiquita) : vitesse multipliée par ce facteur. */
  backhandSpeed: number;
  /** Revers : erreur ajoutée au coup (0..1), il part un peu plus long. */
  backhandError: number;
  /**
   * Au-dessus de la tête, la balle se joue côté main forte tant qu'elle passe à moins de cette distance du point
   * idéal de ce côté (m) ; plus loin, de l'autre côté : revers par-dessus la tête.
   */
  overheadForeMiss: number;
  /** Revers par-dessus la tête : jamais de remate ni de víbora ; vitesse multipliée, et visé plus court (m). */
  backOverheadSpeed: number;
  backOverheadShort: number;
  /** Course assistée et IA : coup droit plutôt que revers s'il ne coûte pas plus que ce surplus de course (m). */
  forehandBias: number;
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
    swingWindow: 0.15,
    swingWindowSlow: 0.32, // [à calibrer en jouant]
    swingSlowSpeed: 11,
    swingFastSpeed: 20,
    earlyWait: 0.5, // [à calibrer en jouant]
    adjustStep: 1.3, // [à calibrer en jouant]
    sweetSpot: 0.45,
    lateDriftLateral: 2.5,
    lateDriftDepth: 4.5,
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
    volleyLow: 0.6, // [à calibrer en jouant]
    volleyLowCost: 3,
    glassRoom: 1.8,
    magnetRadius: 1.5,
    magnetNear: 0.6,
    glassGap: 0.6,
    glassBonus: 0.3,
    volleySpeed: 1.3,
    volleyWidth: 1.3,
    volleySpin: -0.25,
    glassSpeed: 0.85,
    aimWindow: 0.3,
    prepLock: 0.3, // comme la fenêtre de visée [à calibrer en jouant]
    manualThreshold: 0.35,
    manualAimBonus: 1.25,
    overheadLow: 1.45, // vers les épaules : la bandeja se prend à hauteur des yeux
    overheadHigh: 3.0,
    overheadIdeal: 2.55,
    overheadLateral: 0.35,
    hand: {
      backhandSpeed: 0.9, // [à calibrer en jouant]
      backhandError: 0.08, // [à calibrer en jouant]
      overheadForeMiss: 0.75, // une balle jusqu'à ~40 cm côté revers se joue encore en coup droit [à calibrer]
      backOverheadSpeed: 0.75, // [à calibrer en jouant]
      backOverheadShort: 1.5, // [à calibrer en jouant]
      forehandBias: 1, // [à calibrer en jouant]
    },
    overheadStick: 0.5,
    remateZone: 5, // un lob tombé avant la ligne de service (6,95 m) passe à 2,55 m vers 4,9 m du filet : remate
    remateLow: 2.2,
    remateKillDepth: 3,
    remateNearZone: 1.8,
    remateKillNear: 2.2, // à 3 m, claquée près du filet, elle ne sortait jamais [à calibrer en jouant]
    floatSpeed: 8, // lob ~8 m/s, balle flottante au filet 3 à 5, défense à plat 14 à 15 [à calibrer en jouant]
    remateWidth: 3.2,
    remateWidthLoose: 1.1,
    viboraLateral: 4.3,
    bandejaLateral: 3,
    overheadCentreStick: 0.3,
    viboraCentre: 1.5,
    overheadPower: 0.25, // [à calibrer en jouant]
    overheadSlop: 2,
    overheadSlopDepth: 2.5,
    eyesBelowHead: 0.12, // 1,68 m pour un joueur de 1,80 m
    overheadBand: 0.12, // ±12 cm : la balle qui redescend y passe en ~1/20 s [à calibrer en jouant]
    overheadHighSpin: 1,
    overheadHighDepth: 0.8,
    overheadLowDip: 7, // prise au plancher (épaules) : filet ; un peu basse : passe plus près de la bande
    overheadMissLow: 0.6, // genoux : plus bas, coup dans le vide
    overheadLowSpan: 0.35, // filet sous ~1,33 m (1,80 m)
    overheadLateWindow: 0.4,
    pressure: {
      scale: 1,
      // Calé sur l'échange arcade (IA contre IA) : volées 0,6-1 s de préparation et 9-14 m/s, balles
      // après la vitre 1-2 s et 4-6 m/s. La course assistée arrête le joueur avant l'impact : la course
      // ne pèse pas tant que le joueur se place lui-même.
      prepEasy: 1.3,
      prepHard: 0.55,
      comfortLow: 0.8,
      lowHeight: 0.35,
      sliceLow: 0.4,
      slowSpeed: 6,
      fastSpeed: 16,
      struckSpeed: 0.7,
      runEasy: 2,
      runHard: 6,
      // La hauteur pèse le plus : une balle qui passe bas sur le filet oblige à remonter (le « 10 cm contre 1 m »).
      weights: { time: 0.35, low: 0.5, fast: 0.25, running: 0.15 },
      doubleGlass: 0.25,
      earlySpan: 0.12,
      timingError: 0.7,
      missError: 0.6,
      pressureError: 0.8,
      perfectRelief: 0.5,
      calmImprecision: 0.4,
      windowShrink: 0.5,
      // Sous pression, la balle passe plus haut sur le filet sans devenir un lob : elle reste à plat.
      clearance: 0.35,
      speedLoss: 0.1,
      lobShort: 2,
      long: 0.7,
      netLow: 0.35, // [à calibrer en jouant]
      netDip: 3,
      cutRush: 1, // 1,5 avant le journal des frappes (volées coupées ratées à 0,75 d’erreur en moyenne) ; à 0,6, les volées
      // coupées concluaient trop : 5,7 coups par point entre IA au lieu de 6 [à calibrer en jouant]
      volleyClearance: 0.3, // [à calibrer en jouant]
      overheadFactor: 0.5,
      // Bloquer un smash au filet : possible avec une frappe parfaite, une faute sinon (16 m/s et moins : rien ne change).
      paceEasy: 15, // [à calibrer en jouant]
      paceHard: 26,
      volleySweep: 0.02,
      paceShrink: 0.35, // fenêtre parfaite ~40 ms sur un smash, ~85 ms sur une volée douce
      redFrom: 0.6, // [à calibrer en jouant]
      redFull: 0.9,
      miscueSpan: 0.04,
      miscueMiss: 0.5,
      miscueLong: 5,
      miscueDip: 7,
    },
    lobPerfectDepth: 0.5,
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
    // Coups au-dessus de la tête : ordres de grandeur de research/padel-pro/NOTES.md §1 [à calibrer].
    // Bandeja : coupée, à vitesse contrôlée ; parfaite, elle est plus coupée et pas plus forte (frappée
    // trop fort, elle rebondit haut : c'est l'erreur type, pelotista.com).
    bandeja: {
      speed: 21, // ~75 km/h, 3/4 de puissance
      speedPerfect: 21,
      spinPerfect: -0.5,
      clearance: 0.6,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 6.5,
      depthNeutral: 8.2,
      depthLong: 8.9,
      spin: -0.3,
    },
    feinte: {
      speed: 9, // ~32 km/h : lente, elle surprend l'adversaire qui recule pour le smash [à calibrer en jouant]
      speedPerfect: 9,
      clearance: 0.5,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 4,
      depthNeutral: 5.5,
      depthLong: 6.5,
      spin: -0.6,
    },
    vibora: {
      speed: 26, // ~95 km/h
      speedPerfect: 29,
      clearance: 0.4,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 6,
      depthNeutral: 7,
      depthLong: 8.8,
      spin: -0.25,
      sideSpin: 0.2,
    },
    bajada: {
      speed: 24, // ~85 km/h : une attaque, mais depuis le fond
      speedPerfect: 27,
      clearance: 0.3,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 6.5,
      depthNeutral: 7.5,
      depthLong: 8.5,
      spin: -0.1,
    },
    cut: {
      // Volée de pression : ~70 km/h (75 parfaite). À 26-30 m/s (~100 km/h), elle gagnait un point sur deux sur une
      // simple balle de défense, et la volée bloquée aucun : rien entre les deux.
      speed: 19.5,
      speedPerfect: 21,
      clearance: 0.2,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 4,
      depthNeutral: 7.5,
      depthLong: 8.8,
      // Coupée : elle reste basse après la vitre du fond, sans s'écraser au rebond.
      spin: -0.3,
      spinPerfect: -0.4,
    },
    cutLow: 0.9,
    punch: {
      // L'ancienne volée coupée : rapide, en angle, elle s'écrase au rebond.
      speed: 26,
      speedPerfect: 30,
      clearance: 0.12,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 3.5,
      depthNeutral: 6.5,
      depthLong: 8.5,
      spin: -0.4,
      spinPerfect: -0.6,
    },
    punchLow: 1.05, // au-dessus de la bande du filet (0,88 m) : on frappe vers le bas [à calibrer en jouant]
    lowVolley: {
      // Remontée : ~45 km/h, elle passe plus haut sur le filet et va au fond, pour garder le filet.
      speed: 13,
      speedPerfect: 14.5,
      clearance: 0.4,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 4.5,
      depthNeutral: 7,
      depthLong: 8.5,
      spin: -0.3,
    },
    lowVolleyHeight: 0.75, // sous la bande du filet [à calibrer en jouant]
    lowVolleyNet: 3,
    chiquita: {
      // Rasante : à 7 m/s elle devait monter à 2,7 m pour passer ; à 11 m/s elle passe juste au-dessus du filet.
      speed: 11,
      speedPerfect: 12,
      clearance: 0.15,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 2.5,
      depthNeutral: 3.5,
      depthLong: 4.5,
      spin: -0.5,
    },
    counterWall: {
      stick: 0.5,
      ideal: 0.2,
      ahead: 1.2,
      late: 0.2,
      wait: 0.6,
      earlySpan: 0.35,
      reach: 1.8,
      sweetSpot: 0.6,
      low: 0.1, // la balle qui meurt basse contre la vitre : c'est elle qu'on sauve
      high: 2.4,
      glassRoom: 0.2,
      maxRoom: 3.5, // au-delà, la balle file dans le grillage au-dessus de la vitre ou retombe dans le filet
      minSpeed: 1,
      depth: 4.5,
      depthPerfect: 6,
      width: 1.8,
      widthPerfect: 2.8,
      flightTime: 2.2,
      clearance: 0.6,
      speedLoss: 0.35,
    },
    blockPrep: 0.3,
    volleyPrep: 0.12, // [à calibrer en jouant]
    fullPrep: 0.6,
    blockSpeed: 0.6,
    blockWidth: 0.5,
    remate: {
      // Vitesse au départ ; la traînée compensée, la balle part à ~125 km/h, ~131 en frappe parfaite
      // (smash semi-pro face à un adversaire : 121 km/h, research/padel-pro/NOTES.md §1).
      speed: 32,
      speedPerfect: 35,
      clearance: 0.15,
      flightTime: 0,
      flightTimePerfect: 0,
      depthShort: 7,
      // Non parfait : profond, il revient de la vitre (ou repasse le filet) sans sortir.
      depthNeutral: 8,
      depthLong: 8.5,
      // Presque à plat : avec du lift (0,25), l'effet Magnus plaque la balle, le smash ralentit et ne sort plus.
      spin: 0.05,
      launchSpeed: true,
    },
    serve: {
      standLateral: 1.6,
      serverDepth: 7.5,
      receiverDepth: 8.6,
      centerLateral: 2.4,
      aimWidth: 1.4,
      aimWidthPerfect: 2,
      depthShort: 3.8,
      depthNeutral: 5.3,
      depthLong: 6.4,
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
  slicedBounce: 0,
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
    maxSpeed: 6, // 7,5 au départ : le terrain paraissait petit et la défense trop facile (Xavier, 17/10) [à calibrer en jouant]
    acceleration: 38, // [à calibrer VT4 : accélération]
    deceleration: 45, // [à calibrer VT4]
  },
  rally: {
    ...REALISTIC.rally,
    // [à calibrer en jouant : VT4 confirme seulement qu'un maintien trop long rate le coup]
    perfectBefore: 0.07,
    perfectAfter: 0.05,
    reach: 1.25, // [à calibrer VT4 : portée]
    // Jeu par les vitres (calé IA contre IA : ~8 coups par point, 1/3 de coups gagnants, 2/3 de
    // fautes, comme chez les pros) [à calibrer en jouant] :
    lateDriftLateral: 1.5, // retard moins puni : la faute vient d'un coup visé profond et relâché tard
    lateDriftDepth: 2.6, // en fin de fenêtre, même un coup au neutre (7,5 m) sort
    volleySpeed: 1.45, // la volée conclut : c'est au filet que se gagnent les points
    // Après la vitre, plus de ralentissement imposé : la défense se joue à plat ; c'est la pression
    // (balle basse, peu de temps) qui la rend moins bonne. 0,8 la faisait bomber comme un lob (Xavier, 17/10).
    glassSpeed: 1,
    aimWindow: 0.3, // [à calibrer VT4 : quand le stick vise-t-il au lieu de déplacer ?]
    manualAimBonus: 1.25, // [à calibrer VT4]
    // Sans direction, le coup va chercher la vitre : au padel, la balle courte se fait punir. [à calibrer]
    // ~65 km/h (75 en frappe parfaite) : à 56 km/h, la balle devait monter pour arriver au fond. [à calibrer dans le labo]
    normal: { ...REALISTIC.rally.normal, speed: 18, speedPerfect: 21, depthNeutral: 7.5 },
    slice: { ...REALISTIC.rally.slice, speed: 11.5, speedPerfect: 13.5, depthNeutral: 6.5 }, // [à calibrer VT4]
    // Lob profond : 2,5 à 3 s de vol, le temps de monter au filet (padel-pro/NOTES.md §5) ; lob court plus bas et plus
    // rapide : une balle de smash. [à calibrer en jouant]
    // Profondeurs : au neutre, la balle retombe vers 7,6 m, prise de volée vers 6,3 m ; un lob plus
    // profond passe le joueur au filet, qui doit reculer. [à calibrer en jouant]
    lob: {
      ...REALISTIC.rally.lob,
      flightTime: 2.6,
      flightTimePerfect: 2.8,
      flightTimeShort: 1.6,
      depthShort: 5.5,
      depthNeutral: 7.6,
      depthLong: 8.8,
    },
    // Au-dessus de la tête, vitesses de coups arcade (normal ×0,775) sauf le remate, qui garde ses 120-130 km/h.
    // Bandeja courte (stick vers l'arrière) dans le carré de service : elle oblige le défenseur à avancer.
    bandeja: { ...REALISTIC.rally.bandeja, speed: 16, speedPerfect: 16, depthShort: 5.5 }, // [à calibrer en jouant]
    // Víbora : fort effet latéral, à peine coupée : elle file dans la vitre latérale et en ressort basse
    // (avec du lift, elle remontait la vitre jusqu'à 2,5 m). [à calibrer en jouant]
    // Courte (stick vers l'arrière), elle ressort de la vitre latérale vers le filet ; longue, elle va au coin.
    vibora: { ...REALISTIC.rally.vibora, speed: 20, speedPerfect: 23, spin: -0.15, sideSpin: 0.25, depthShort: 5 },
  },
  gravity: 8, // [à calibrer VT4 : temps de vol typiques] balle plus « flottante »
  magnusScale: 0.7, // [à calibrer VT4]
  // Rebonds plus francs.
  ground: { ...REALISTIC.ground, restitution: 0.8 }, // [à calibrer VT4]
  // Balle coupée : elle s'écrase et reste basse (volée coupée qui tue une balle flottante). [à calibrer en jouant]
  slicedBounce: 0.6,
  // Vitre moins vive que le sol : la balle revient de 2 à 4 m, le défenseur joue près de la vitre.
  glass: { ...REALISTIC.glass, restitution: 0.55 }, // [à calibrer en jouant]
};

export const PROFILES = { realistic: REALISTIC, arcade: ARCADE } as const;
export type ProfileName = keyof typeof PROFILES;
