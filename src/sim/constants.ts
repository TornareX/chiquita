/** Fréquence de la simulation (pas fixe). */
export const SIM_HZ = 240;
export const SIM_DT = 1 / SIM_HZ;

// Terrain (règles FIP), en mètres.
// Repère : Y vers le haut, origine au centre du filet au sol, Z dans la longueur,
// joueur côté Z négatif.
export const COURT_LENGTH = 20;
export const COURT_WIDTH = 10;
export const HALF_LENGTH = COURT_LENGTH / 2;
export const HALF_WIDTH = COURT_WIDTH / 2;

export const NET_HEIGHT_CENTER = 0.88;
export const NET_HEIGHT_POSTS = 0.92;

export const SERVICE_LINE_DISTANCE = 6.95;
export const LINE_WIDTH = 0.05;
/** La ligne centrale dépasse la ligne de service de 20 cm. */
export const CENTER_LINE_OVERSHOOT = 0.2;

// Murs du fond : vitre surmontée de grillage.
export const BACK_GLASS_HEIGHT = 3;
export const BACK_WALL_HEIGHT = 4;

// Murs latéraux, variante 1 (avec marche) : en partant du fond, un panneau vitré
// haut puis un panneau vitré bas, le reste en grillage.
export const SIDE_GLASS_PANEL_LENGTH = 2;
export const SIDE_GLASS_HEIGHT_HIGH = 3;
export const SIDE_GLASS_HEIGHT_LOW = 2;
/** Hauteur totale (vitre + grillage) le long du premier panneau, côté fond. */
export const SIDE_WALL_HEIGHT_END = 4;
/** Hauteur totale sur le reste du mur latéral. */
export const SIDE_WALL_HEIGHT = 3;
