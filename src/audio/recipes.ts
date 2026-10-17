import type { Contact } from '../sim/collisions';
import { HALF_LENGTH, HALF_WIDTH } from '../sim/constants';
import type { PointResult } from '../sim/duel';
import type { Vec3 } from '../sim/vec3';

/**
 * Recettes des sons : chaque événement du jeu devient une liste de couches (notes et souffles
 * filtrés) décrites en données, jouées ensuite par `sounds.ts`. Tout est déterministe : la
 * variation d'un son à l'autre vient d'un hachage de la position du contact, pas du hasard.
 */

/** Modulation d'amplitude rapide : le frémissement du grillage. */
export interface Tremolo {
  rate: number;
  /** 0 = aucune, 1 = le son s'éteint à chaque creux. */
  depth: number;
}

export interface ToneLayer {
  type: 'tone';
  wave: OscillatorType;
  /** Fréquence de départ et d'arrivée (Hz), glissement exponentiel. */
  from: number;
  to: number;
  gain: number;
  duration: number;
  /** Montée (s) ; 0 = attaque franche. */
  attack?: number;
  delay?: number;
  tremolo?: Tremolo;
}

export interface NoiseLayer {
  type: 'noise';
  filter: BiquadFilterType;
  frequency: number;
  /** Fréquence du filtre en fin de son (balayage), sinon fixe. */
  frequencyTo?: number;
  q: number;
  gain: number;
  duration: number;
  attack?: number;
  delay?: number;
  tremolo?: Tremolo;
}

export type Layer = ToneLayer | NoiseLayer;

export interface SoundRecipe {
  layers: Layer[];
  /** Position stéréo, -1 (gauche) à 1 (droite). */
  pan: number;
  /** Part envoyée dans la réverbération de la salle (0..1), et dans l'écho des vitres. */
  reverb: number;
}

/** Frappe telle que l'entend le son : sous-ensemble de `Shot` (entraîneur) et de `DuelShot`. */
export interface ShotSound {
  /** Vitesse de la balle au départ (m/s). */
  speed: number;
  /** Qualité du contact, 0 (bord du tamis, mauvais timing) à 1 (centre). */
  quality: number;
  perfect: boolean;
  contact: Vec3;
  soft?: boolean;
  overhead?: 'bandeja' | 'vibora' | 'remate' | null;
  kind?: 'normal' | 'slice' | 'lob' | 'overhead';
  volley?: boolean;
}

export type CrowdKind = 'ooh' | 'cheer' | 'applause';

export interface CrowdReaction {
  kind: CrowdKind;
  /** 0..1 : nombre de spectateurs qui réagissent et volume. */
  intensity: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Hachage entier (même famille que le bruit du grillage dans la simulation). */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Suite de valeurs dans [-1, 1) tirée d'une position (au millimètre) : deux contacts au même endroit
 * sonnent pareil, deux contacts voisins sonnent un peu différemment.
 */
export function variation(pos: Vec3, salt = 0): (index: number) => number {
  const seed = hash(Math.round(pos.x * 1000), Math.round(pos.y * 1000), Math.round(pos.z * 1000) + salt * 7919);
  return (index) => (hash(seed, index, salt) / 0x100000000) * 2 - 1;
}

/**
 * Stéréo vue de la caméra, placée derrière le joueur 0 et tournée vers +z : sa droite est le côté
 * des x négatifs.
 */
export function panFor(pos: Vec3): number {
  return clamp(-pos.x / HALF_WIDTH, -1, 1) * 0.6;
}

/** Les sons du camp d'en face arrivent un peu atténués : la caméra est derrière le camp proche. */
export function distanceGain(pos: Vec3): number {
  return 1 - 0.3 * clamp((pos.z + HALF_LENGTH) / (2 * HALF_LENGTH), 0, 1);
}

/** Son d'un rebond, ou `null` pour un contact inaudible (balle qui roule, sortie sans impact). */
export function contactRecipe(contact: Contact): SoundRecipe | null {
  if (contact.surface === 'out') return exitRecipe(contact.pos, contact.speed);
  if (contact.speed < 0.4) return null;
  const r = variation(contact.pos, 1);
  const v = clamp(contact.speed / 13, 0.1, 1) * distanceGain(contact.pos);
  const pan = panFor(contact.pos);
  /** Petit écart de hauteur (± `amount`, en fraction). */
  const detune = (index: number, amount: number): number => 1 + amount * r(index);

  switch (contact.surface) {
    case 'ground':
      // Rebond mat : coup sourd, très court, sans résonance.
      return {
        pan,
        reverb: 0.06,
        layers: [
          { type: 'tone', wave: 'sine', from: 155 * detune(0, 0.08), to: 62, duration: 0.085, gain: 0.6 * v },
          { type: 'tone', wave: 'triangle', from: 560 * detune(1, 0.1), to: 380, duration: 0.025, gain: 0.12 * v },
          { type: 'noise', filter: 'lowpass', frequency: 850 * detune(2, 0.15), q: 0.7, duration: 0.035, gain: 0.32 * v },
          // Grain du gazon synthétique : un souffle très bref dans les aigus.
          { type: 'noise', filter: 'bandpass', frequency: 3200, q: 1, duration: 0.015, gain: 0.06 * v * (1 + 0.5 * r(3)) },
        ],
      };

    case 'glass': {
      // Vitre : claquement sec et grave, puis la dalle résonne un peu (modes inharmoniques).
      const panel = detune(0, 0.05);
      return {
        pan,
        reverb: 0.32,
        layers: [
          { type: 'noise', filter: 'highpass', frequency: 2600, q: 0.7, duration: 0.012, gain: 0.45 * v },
          { type: 'noise', filter: 'bandpass', frequency: 1050 * detune(1, 0.1), q: 1.1, duration: 0.05, gain: 0.45 * v },
          { type: 'tone', wave: 'sine', from: 118 * panel, to: 68, duration: 0.24, gain: 0.85 * v },
          { type: 'tone', wave: 'sine', from: 196 * panel, to: 192 * panel, duration: 0.38, gain: 0.16 * v },
          { type: 'tone', wave: 'sine', from: 341 * panel * detune(2, 0.02), to: 336 * panel, duration: 0.3, gain: 0.1 * v },
          { type: 'tone', wave: 'sine', from: 547 * panel * detune(3, 0.02), to: 540 * panel, duration: 0.2, gain: 0.06 * v },
          { type: 'tone', wave: 'triangle', from: 880 * panel, to: 860 * panel, duration: 0.09, gain: 0.05 * v },
        ],
      };
    }

    case 'mesh': {
      // Grillage : impact métallique, puis les fils vibrent et cliquettent (trémolo rapide).
      const shimmer = 34 * detune(0, 0.25);
      return {
        pan,
        reverb: 0.18,
        layers: [
          { type: 'tone', wave: 'sine', from: 170, to: 105, duration: 0.06, gain: 0.22 * v },
          { type: 'noise', filter: 'bandpass', frequency: 2300 * detune(1, 0.1), q: 2, duration: 0.04, gain: 0.5 * v },
          {
            type: 'noise', filter: 'bandpass', frequency: 4300 * detune(2, 0.12), q: 3.5, duration: 0.42, gain: 0.5 * v,
            tremolo: { rate: shimmer, depth: 0.85 },
          },
          {
            type: 'tone', wave: 'square', from: 1730 * detune(3, 0.04), to: 1700, duration: 0.3, gain: 0.04 * v,
            tremolo: { rate: shimmer * 1.3, depth: 0.7 },
          },
          {
            type: 'tone', wave: 'sine', from: 2390 * detune(4, 0.04), to: 2370, duration: 0.36, gain: 0.08 * v,
            tremolo: { rate: shimmer * 0.8, depth: 0.8 },
          },
          {
            type: 'tone', wave: 'sine', from: 3110 * detune(5, 0.04), to: 3090, duration: 0.26, gain: 0.065 * v,
            tremolo: { rate: shimmer * 1.7, depth: 0.8 },
          },
          {
            type: 'tone', wave: 'sine', from: 4570 * detune(6, 0.04), to: 4550, duration: 0.22, gain: 0.05 * v,
            tremolo: { rate: shimmer * 1.1, depth: 0.9 },
          },
        ],
      };
    }

    case 'net':
    case 'tape': {
      // Filet : étouffé, attaque molle. La bande ajoute un petit claquement et le câble qui vibre.
      const layers: Layer[] = [
        { type: 'noise', filter: 'lowpass', frequency: 420 * detune(0, 0.15), q: 0.5, attack: 0.008, duration: 0.17, gain: 0.42 * v },
        { type: 'tone', wave: 'sine', from: 92 * detune(1, 0.08), to: 66, attack: 0.004, duration: 0.13, gain: 0.3 * v },
        { type: 'noise', filter: 'bandpass', frequency: 1300, q: 1, attack: 0.012, duration: 0.11, gain: 0.05 * v },
      ];
      if (contact.surface === 'tape') {
        layers.push(
          { type: 'tone', wave: 'triangle', from: 950 * detune(2, 0.08), to: 700, duration: 0.025, gain: 0.18 * v },
          { type: 'tone', wave: 'sine', from: 236 * detune(3, 0.05), to: 230, duration: 0.3, gain: 0.07 * v },
        );
      }
      return { pan, reverb: 0.05, layers };
    }
  }
}

/** La balle passe par-dessus un mur (ou par la porte) : souffle qui s'éloigne. */
export function exitRecipe(pos: Vec3, speed: number): SoundRecipe {
  const r = variation(pos, 2);
  const v = clamp(0.4 + speed / 25, 0.4, 1);
  return {
    pan: panFor(pos) * 1.4,
    reverb: 0.4,
    layers: [
      {
        type: 'noise', filter: 'bandpass', frequency: 700, frequencyTo: 2600 * (1 + 0.1 * r(0)), q: 1.4,
        attack: 0.12, duration: 0.45, gain: 0.22 * v,
      },
      {
        type: 'noise', filter: 'bandpass', frequency: 1800, frequencyTo: 5200, q: 3,
        attack: 0.1, duration: 0.35, gain: 0.08 * v,
      },
    ],
  };
}

/**
 * Frappe : « pop » de la raquette, dont la hauteur et le volume suivent la vitesse de la balle.
 * Calé sur deux vidéos de volées en salle : deux bosses d'égale force, une grave vers 180-260 Hz et la
 * principale vers 560-680 Hz, des partiels vers 880 et 1010 Hz 10 dB plus bas, presque rien au-dessus
 * de 1,3 kHz (-24 dB), une chute de 12 dB en 4 ms, puis l'écho des vitres vers 40 ms et la salle. Le bord du tamis sonne creux ; la frappe
 * parfaite et le remate claquent.
 */
export function shotRecipe(shot: ShotSound): SoundRecipe {
  const r = variation(shot.contact, 3 + Math.round(shot.speed * 10));
  const pace = clamp((shot.speed - 6) / 26, 0, 1); // 0 vers 6 m/s, 1 vers 32 m/s
  const quality = clamp(shot.quality, 0, 1);
  const remate = shot.overhead === 'remate';
  const soft = shot.soft || shot.kind === 'lob';
  const v = clamp(0.35 + 0.65 * pace, 0.3, 1) * (soft ? 0.7 : 1) * distanceGain(shot.contact);
  // Résonance du tamis : de ~575 Hz (balle lente, contact décentré) à ~700 Hz (balle rapide, centrée).
  const pitch = (1 + 0.035 * r(0)) * (0.9 + 0.12 * pace) * (0.94 + 0.06 * quality);
  const body = 650 * pitch;

  const layers: Layer[] = [
    // Corps du pop : résonance amortie du tamis, à peine glissante.
    { type: 'tone', wave: 'sine', from: body, to: body * 0.92, duration: 0.026 + 0.008 * quality, gain: 0.75 * v },
    { type: 'tone', wave: 'sine', from: body * 1.36, to: body * 1.3, duration: 0.02, gain: 0.28 * v * (0.5 + 0.5 * quality) },
    { type: 'tone', wave: 'sine', from: body * 1.56 * (1 + 0.02 * r(1)), to: body * 1.5, duration: 0.016, gain: 0.16 * v * quality },
    // Bosse grave, aussi forte que le corps : la balle et le cœur en mousse.
    { type: 'tone', wave: 'sine', from: 260 * pitch, to: 175, duration: 0.03, gain: 0.7 * v },
    // Souffle du contact, centré sur le médium, très bref.
    { type: 'noise', filter: 'bandpass', frequency: 420 * pitch, q: 0.7, duration: 0.014, gain: 1.6 * v },
    { type: 'noise', filter: 'bandpass', frequency: 900 * pitch, q: 0.7, duration: 0.012, gain: 1.7 * v },
    { type: 'noise', filter: 'bandpass', frequency: 1400 * pitch, q: 0.8, duration: 0.008, gain: 1.1 * v },
    { type: 'tone', wave: 'sine', from: body * 1.9, to: body * 1.8, duration: 0.02, gain: 0.1 * v * quality },
    { type: 'noise', filter: 'bandpass', frequency: 2400, q: 0.8, duration: 0.005, gain: 0.6 * v * (0.4 + 0.6 * pace) },
  ];
  // Contact décentré : vibration creuse du cadre.
  if (quality < 0.6) {
    layers.push({ type: 'tone', wave: 'triangle', from: 300 * pitch, to: 280 * pitch, duration: 0.07, gain: 0.12 * v * (1 - quality) });
  }
  if (shot.perfect) {
    // Frappe parfaite : plus fort et plus plein, avec un claquement net qui reste dans le médium-aigu.
    layers.push(
      { type: 'tone', wave: 'sine', from: body * 1.05, to: body * 0.95, duration: 0.04, gain: 0.35 },
      { type: 'tone', wave: 'sine', from: 200, to: 120, duration: 0.05, gain: 0.35 },
      { type: 'noise', filter: 'bandpass', frequency: 2600, q: 1.2, duration: 0.01, gain: 0.25 },
    );
  }
  if (remate) {
    // Remate : coup de canon, grave et fort.
    layers.push(
      { type: 'tone', wave: 'sine', from: 125, to: 48, duration: 0.17, gain: 0.5 },
      { type: 'noise', filter: 'lowpass', frequency: 1400, q: 0.8, duration: 0.05, gain: 0.45 },
      { type: 'noise', filter: 'bandpass', frequency: 3000, q: 1, duration: 0.012, gain: 0.25 },
    );
  }
  return {
    pan: panFor(shot.contact),
    // La salle se fait entendre derrière chaque frappe, un peu moins que sur les vidéos (trop d'écho).
    reverb: remate ? 0.6 : shot.perfect ? 0.55 : 0.5,
    layers,
  };
}

/**
 * Réaction du public à la fin d'un point : seulement sur les points spectaculaires.
 * `winnerShot` est le dernier coup du gagnant dans l'échange, s'il en a joué un.
 */
export function crowdReaction(
  result: PointResult,
  winnerShot: Pick<ShotSound, 'overhead' | 'perfect' | 'volley'> | null,
): CrowdReaction | null {
  if (result.reason === 'por-tres' || result.reason === 'por-cuatro') return { kind: 'cheer', intensity: 1 };
  const winner = result.reason === 'second-bounce' || result.reason === 'not-returned';
  if (winner && winnerShot?.overhead === 'remate') return { kind: 'cheer', intensity: winnerShot.perfect ? 0.85 : 0.65 };
  if (result.hits >= 12) return { kind: 'applause', intensity: clamp(0.45 + (result.hits - 12) * 0.04, 0.45, 0.9) };
  if (winner && winnerShot?.perfect && winnerShot.volley) return { kind: 'applause', intensity: 0.4 };
  return null;
}
