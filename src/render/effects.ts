import type { Contact } from '../sim/collisions';
import { HALF_LENGTH, HALF_WIDTH } from '../sim/constants';
import { WALLS } from '../sim/court';
import type { OverheadKind } from '../sim/commands';
import type { PointReason } from '../sim/duel';

/**
 * Effets de balle et de vitre (étape E3, GAME_DESIGN.md §6 « Juice ») : logique pure, sans Three.js, dessinée
 * par `effectsView.ts`. Tout part des événements d'un pas de la simulation (contacts, frappe, sortie, point),
 * lus sans rien modifier, et vieillit au temps réel du rendu. Aucune allocation après la création : effets et
 * particules vivent dans des réserves de taille fixe, réutilisées en tourniquet (le plus ancien cède sa place).
 */

/**
 * - `impact` : éclat (anneau et étoile) au point de frappe, face à la caméra ;
 * - `glass` : petite onde sur le plan de la vitre touchée ;
 * - `mesh` : grillage qui s'éclaire et vibre à l'endroit touché ;
 * - `exit` : éclat au sommet du mur, balle sortie après son rebond (por tres en vue).
 */
export type EffectKind = 'impact' | 'glass' | 'mesh' | 'exit';

export interface Effect {
  active: boolean;
  kind: EffectKind;
  /** Âge (s) ; négatif, l'effet attend son tour. */
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  /** Normale de la surface touchée (vitre, grillage), vers l'intérieur du terrain. */
  nx: number;
  ny: number;
  nz: number;
  /** Taille finale (m) : rayon de l'anneau, côté du carré de grillage. */
  size: number;
  color: number;
  /** Force, de 0 à 1 : éclat, amplitude de la vibration. */
  strength: number;
  /** Étoile au centre de l'éclat (frappe). */
  star: boolean;
}

export interface Particle {
  active: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Diamètre (m). */
  size: number;
  color: number;
  /** Pesanteur (m/s²) et freinage (1/s) : la poussière flotte, les étincelles tombent. */
  gravity: number;
  drag: number;
  /** Opacité de départ. */
  alpha: number;
}

/** Réserve de taille fixe : `acquire` rend le suivant du tourniquet, actif ou non (le plus ancien cède sa place). */
export class Pool<T extends { active: boolean }> {
  readonly items: readonly T[];
  private next = 0;

  constructor(capacity: number, make: () => T) {
    this.items = Array.from({ length: capacity }, make);
  }

  acquire(): T {
    // D'abord un emplacement libre à partir du tourniquet, sinon le tourniquet lui-même.
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const item = this.items[(this.next + k) % n]!;
      if (!item.active) {
        this.next = (this.next + k + 1) % n;
        return item;
      }
    }
    const item = this.items[this.next]!;
    this.next = (this.next + 1) % n;
    return item;
  }

  get activeCount(): number {
    let count = 0;
    for (const item of this.items) if (item.active) count++;
    return count;
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Couleurs des effets. */
export const EFFECT_COLORS = {
  perfect: 0xffc83a,
  normal: 0xffffff,
  glass: 0xcff3ff,
  mesh: 0xf2f7ff,
  exit: 0xfff1b8,
  /** Poussière du gazon (bleu clair du sol) et du sol autour du terrain. */
  turf: 0xa9c8ec,
  surround: 0x9aa1aa,
  /** Sable de silice soulevé par une glissade : blanc cassé, il se lit sur le tapis bleu. */
  sand: 0xe2dccb,
} as const;

/**
 * Allure de l'éclat de frappe : doré et plus gros si parfaite, plus marqué sur un smash, un peu plus grand si la balle
 * part vite. Discret (retour de Xavier : trop gros et agressif) : un petit anneau bref sur un coup normal, l'étoile et
 * les étincelles seulement sur une frappe parfaite ou un smash.
 */
export function impactLook(shot: { perfect: boolean; overhead: OverheadKind | null; speed: number }): {
  life: number;
  size: number;
  color: number;
  strength: number;
  sparks: number;
} {
  const smash = shot.overhead === 'remate';
  const fast = 0.85 + 0.3 * clamp01(shot.speed / 30);
  return {
    life: (shot.perfect ? 0.22 : 0.14) + (smash ? 0.05 : 0),
    size: (shot.perfect ? 0.26 : 0.14) * (smash ? 1.3 : 1) * fast,
    color: shot.perfect ? EFFECT_COLORS.perfect : EFFECT_COLORS.normal,
    strength: shot.perfect ? 0.7 : smash ? 0.55 : 0.3,
    sparks: (shot.perfect ? 5 : 0) + (smash ? 3 : 0),
  };
}

/** Force d'une onde de vitre selon la vitesse d'impact sur la normale (m/s) ; jamais nulle, la vitre se voit toujours. */
export function glassStrength(speed: number): number {
  return Math.max(0.2, clamp01((speed - 2) / 16));
}

/**
 * Onde de vitre : rayon final (m) et durée (s) pour une force donnée. Petite et brève, pour ne pas cacher le rebond
 * (retour de Xavier : à 25–85 cm, elle masquait la balle). [à calibrer]
 */
export function glassLook(strength: number): { size: number; life: number } {
  return { size: 0.07 + 0.13 * strength, life: 0.22 + 0.1 * strength };
}

/** Vitesse verticale (m/s) sous laquelle la balle ne soulève plus de poussière (elle roule). */
export const DUST_MIN_SPEED = 1;

/** Poussière au rebond : nombre de grains et force, proportionnés à la vitesse verticale (m/s). */
export function dustLook(speed: number): { count: number; strength: number } {
  if (speed < DUST_MIN_SPEED) return { count: 0, strength: 0 };
  const strength = clamp01((speed - DUST_MIN_SPEED) / 9);
  return { count: Math.round(5 + 11 * strength), strength };
}

/**
 * Gerbe de sable d'une glissade, en trois tailles selon `strength` (0..1) : quelques grains sur un petit freinage,
 * une vraie gerbe sur un arrêt ou un demi-tour en pleine course. [à calibrer à la manette]
 */
export function slideLook(strength: number): { count: number; speed: number; lift: number; size: number; alpha: number } {
  const s = clamp01(strength);
  return { count: Math.round(4 + 10 * s), speed: 1.2 + 1.8 * s, lift: 0.5 + 0.6 * s, size: 0.8 + 0.6 * s, alpha: 0.45 + 0.35 * s };
}

/** Changement de vitesse au sol (m/s) sur `SLIDE_WINDOW` s à partir duquel le pied soulève du sable, et pleine gerbe. */
export const SLIDE_MIN_CHANGE = 3.2;
const SLIDE_FULL_CHANGE = 7;
/** Fenêtre de mesure (s), vitesse minimale avant ou après (m/s), et pause entre deux gerbes d'un même joueur (s). */
const SLIDE_WINDOW = 0.18;
const SLIDE_MIN_SPEED = 3;
const SLIDE_GAP = 0.18;

/**
 * Repère les glissades d'après la vitesse au sol des joueurs, pas après pas : freinage sec ou changement de sens en
 * course (un simple départ ne soulève rien). Lit la vitesse sans rien changer à la simulation. Retourne la gerbe à
 * lancer, ou `null`.
 */
export class SlideDetector {
  private readonly history: { x: number; z: number }[][] = [];
  private readonly quiet: number[] = [];

  update(index: number, vel: { x: number; z: number }, dt: number): { dx: number; dz: number; strength: number } | null {
    const lag = Math.max(1, Math.round(SLIDE_WINDOW / dt));
    const past = (this.history[index] ??= []);
    past.push({ x: vel.x, z: vel.z });
    if (past.length > lag + 1) past.shift();
    const quiet = (this.quiet[index] ?? SLIDE_GAP) + dt;
    this.quiet[index] = quiet;
    if (quiet < SLIDE_GAP || past.length <= lag) return null;
    const old = past[0]!;
    const cx = vel.x - old.x;
    const cz = vel.z - old.z;
    const change = Math.hypot(cx, cz);
    const fast = Math.max(Math.hypot(old.x, old.z), Math.hypot(vel.x, vel.z));
    if (change < SLIDE_MIN_CHANGE || fast < SLIDE_MIN_SPEED) return null;
    // Freinage ou virage seulement : le changement va contre la vitesse d'avant.
    if (cx * old.x + cz * old.z >= 0) return null;
    this.quiet[index] = 0;
    // Le sable part à l'opposé du changement de vitesse : devant soi au freinage, vers l'extérieur du virage.
    return { dx: -cx / change, dz: -cz / change, strength: clamp01((change - SLIDE_MIN_CHANGE) / (SLIDE_FULL_CHANGE - SLIDE_MIN_CHANGE)) };
  }
}

/** Grillage : force de la vibration selon la vitesse d'impact (m/s). */
export function meshStrength(speed: number): number {
  return Math.max(0.25, clamp01(speed / 14));
}

/** Annonce à l'écran pour une raison de point, sinon `null`. */
export function bannerFor(reason: PointReason): string | null {
  if (reason === 'por-tres') return '¡POR TRES!';
  if (reason === 'por-cuatro') return '¡POR CUATRO!';
  return null;
}

/** Durées (s) de l'éclair d'écran et de l'annonce. */
export const FLASH_LIFE = 0.28;
export const BANNER_LIFE = 1.4;

/** Ce qu'un pas de simulation donne à voir : la partie de `Duel` lue par les effets. */
export interface StepEvents {
  readonly contacts: readonly Contact[];
  readonly shot: { perfect: boolean; overhead: OverheadKind | null; speed: number; contact: { x: number; y: number; z: number } } | null;
  readonly exit: unknown;
  readonly result: { reason: PointReason } | null;
}

/** Normale par défaut des effets sans surface (frappe, sortie) : dessinés face à la caméra. */
const FACING = { x: 0, y: 0, z: 1 } as const;

export class Effects {
  readonly effects: Pool<Effect>;
  readonly particles: Pool<Particle>;
  /** Éclair blanc plein écran (por tres) : âge (s), éteint au-delà de `FLASH_LIFE`. */
  flashAge = Infinity;
  /** Annonce à l'écran (« ¡POR TRES! ») et son âge (s). */
  banner: string | null = null;
  bannerAge = Infinity;
  /** Effets lancés depuis le début, par sorte (tests, mode debug). */
  readonly spawned: Record<EffectKind | 'dust' | 'slide' | 'banner', number> = { impact: 0, glass: 0, mesh: 0, exit: 0, dust: 0, slide: 0, banner: 0 };
  /** Ralenti des effets seuls (captures d'écran) ; 1 en jeu. */
  timeScale = 1;

  constructor(
    effectCapacity = 32,
    particleCapacity = 256,
    private readonly random: () => number = Math.random,
  ) {
    this.effects = new Pool(effectCapacity, () => ({
      active: false,
      kind: 'impact' as EffectKind,
      age: 0,
      life: 1,
      x: 0,
      y: 0,
      z: 0,
      nx: 0,
      ny: 0,
      nz: 1,
      size: 1,
      color: 0xffffff,
      strength: 1,
      star: false,
    }));
    this.particles = new Pool(particleCapacity, () => ({
      active: false,
      age: 0,
      life: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0.1,
      color: 0xffffff,
      gravity: 0,
      drag: 0,
      alpha: 1,
    }));
  }

  /** Lit les événements du dernier pas de simulation et lance les effets correspondants. */
  fromStep(events: StepEvents): void {
    if (events.shot) this.impact(events.shot.contact, events.shot);
    for (const contact of events.contacts) this.contact(contact, events.exit !== null);
    if (events.result) {
      const text = bannerFor(events.result.reason);
      if (text) this.announce(text);
    }
  }

  impact(at: { x: number; y: number; z: number }, shot: { perfect: boolean; overhead: OverheadKind | null; speed: number }): void {
    const look = impactLook(shot);
    const e = this.spawn('impact', at.x, at.y, at.z, look.life, look.size, look.color, look.strength);
    e.star = shot.perfect || shot.overhead === 'remate';
    for (let i = 0; i < look.sparks; i++) {
      // Étincelles projetées dans toutes les directions, plus vite sur une frappe forte.
      const theta = this.random() * Math.PI * 2;
      const up = this.random() * 2 - 1;
      const flat = Math.sqrt(1 - up * up);
      const speed = (1.5 + 2.5 * this.random()) * (0.6 + look.strength);
      this.particle(at.x, at.y, at.z, Math.cos(theta) * flat * speed, up * speed, Math.sin(theta) * flat * speed, {
        life: 0.18 + 0.14 * this.random(),
        size: 0.025 + 0.02 * look.strength,
        color: look.color,
        gravity: 6,
        drag: 4,
        alpha: 1,
      });
    }
  }

  /** `afterBounce` : la balle a déjà rebondi chez l'adversaire, une sortie par-dessus le mur est un por tres en vue. */
  contact(contact: Contact, afterBounce: boolean): void {
    const { pos, speed } = contact;
    switch (contact.surface) {
      case 'ground':
        return this.dust(pos.x, pos.z, speed);
      case 'glass': {
        const wall = contact.wall ? WALLS[contact.wall] : null;
        if (!wall) return;
        const strength = glassStrength(speed);
        const look = glassLook(strength);
        const [x, z] = onWall(wall.axis, wall.normal, pos.x, pos.z);
        this.spawn('glass', x, pos.y, z, look.life, look.size, EFFECT_COLORS.glass, strength, wall.normal);
        return;
      }
      case 'mesh': {
        const wall = contact.wall ? WALLS[contact.wall] : null;
        if (!wall) return;
        const [x, z] = onWall(wall.axis, wall.normal, pos.x, pos.z);
        const strength = meshStrength(speed);
        this.spawn('mesh', x, pos.y, z, 0.32 + 0.15 * strength, 0.9 + 0.5 * strength, EFFECT_COLORS.mesh, strength, wall.normal);
        // Quelques éclats qui sautent du grillage, vers le terrain.
        for (let i = 0; i < 5; i++) {
          const out = 1 + 2 * this.random();
          this.particle(x, pos.y, z, wall.normal.x * out + (this.random() - 0.5) * 2, (this.random() - 0.3) * 2, wall.normal.z * out + (this.random() - 0.5) * 2, {
            life: 0.25 + 0.1 * this.random(),
            size: 0.05,
            color: EFFECT_COLORS.mesh,
            gravity: 6,
            drag: 4,
            alpha: 0.9,
          });
        }
        return;
      }
      case 'out':
        if (!afterBounce) return;
        this.spawn('exit', pos.x, pos.y, pos.z, 0.5, 1.1, EFFECT_COLORS.exit, 1);
        for (let i = 0; i < 12; i++) {
          const theta = (i / 12) * Math.PI * 2;
          this.particle(pos.x, pos.y, pos.z, Math.cos(theta) * 3, 1 + Math.sin(theta) * 3, Math.sin(theta * 3) * 1.5, {
            life: 0.45,
            size: 0.08,
            color: EFFECT_COLORS.exit,
            gravity: 5,
            drag: 2.5,
            alpha: 1,
          });
        }
        return;
      default:
        // Filet et bande : rien pour l'instant.
        return;
    }
  }

  /** Petit nuage au rebond, couleur du sol, proportionné à la vitesse verticale. */
  dust(x: number, z: number, speed: number): void {
    const { count, strength } = dustLook(speed);
    if (count === 0) return;
    this.spawned.dust++;
    const inside = Math.abs(x) <= HALF_WIDTH && Math.abs(z) <= HALF_LENGTH;
    const color = inside ? EFFECT_COLORS.turf : EFFECT_COLORS.surround;
    for (let i = 0; i < count; i++) {
      const theta = this.random() * Math.PI * 2;
      const out = (0.4 + this.random()) * (0.5 + strength);
      this.particle(x, 0.03, z, Math.cos(theta) * out, (0.3 + 0.7 * this.random()) * (0.5 + strength), Math.sin(theta) * out, {
        life: 0.5 + 0.4 * this.random(),
        size: (0.13 + 0.1 * this.random()) * (0.7 + 0.6 * strength),
        color,
        gravity: 2.5,
        drag: 3.5,
        alpha: 0.6 + 0.35 * strength,
      });
    }
  }

  /**
   * Gerbe de sable sous les pieds d'un joueur qui freine, repart ou change de sens (étape V7) : projetée au ras du sol
   * dans la direction `(dx, dz)` (opposée au changement de vitesse), proportionnée à `strength` (0..1).
   */
  slide(x: number, z: number, dx: number, dz: number, strength: number): void {
    const look = slideLook(strength);
    this.spawned.slide++;
    const inside = Math.abs(x) <= HALF_WIDTH && Math.abs(z) <= HALF_LENGTH;
    const color = inside ? EFFECT_COLORS.sand : EFFECT_COLORS.surround;
    for (let i = 0; i < look.count; i++) {
      // Éventail de ±35° autour de la direction, un peu sur le côté du pied.
      const spread = (this.random() - 0.5) * 1.2;
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      const ux = dx * c - dz * s;
      const uz = dx * s + dz * c;
      const speed = look.speed * (0.5 + 0.7 * this.random());
      this.particle(x + (this.random() - 0.5) * 0.25, 0.03, z + (this.random() - 0.5) * 0.25, ux * speed, (0.4 + 0.8 * this.random()) * look.lift, uz * speed, {
        life: 0.35 + 0.35 * this.random(),
        size: (0.07 + 0.07 * this.random()) * look.size,
        color,
        gravity: 3,
        drag: 4.5,
        alpha: look.alpha,
      });
    }
  }

  announce(text: string): void {
    this.banner = text;
    this.bannerAge = 0;
    this.flashAge = 0;
    this.spawned.banner++;
  }

  /** Fait vieillir les effets de `dt` secondes de temps réel ; 0 pendant la micro-pause, et tout reste figé. */
  update(dt: number): void {
    dt *= this.timeScale;
    if (dt <= 0) return;
    for (const e of this.effects.items) {
      if (!e.active) continue;
      e.age += dt;
      if (e.age >= e.life) e.active = false;
    }
    for (const p of this.particles.items) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      const keep = Math.exp(-p.drag * dt);
      p.vx *= keep;
      p.vz *= keep;
      p.vy = p.vy * keep - p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.01, p.y + p.vy * dt);
      p.z += p.vz * dt;
    }
    this.flashAge += dt;
    this.bannerAge += dt;
    if (this.bannerAge >= BANNER_LIFE) this.banner = null;
  }

  private spawn(
    kind: EffectKind,
    x: number,
    y: number,
    z: number,
    life: number,
    size: number,
    color: number,
    strength: number,
    normal: { x: number; y: number; z: number } = FACING,
  ): Effect {
    const e = this.effects.acquire();
    e.active = true;
    e.kind = kind;
    e.age = 0;
    e.life = life;
    e.x = x;
    e.y = y;
    e.z = z;
    e.nx = normal.x;
    e.ny = normal.y;
    e.nz = normal.z;
    e.size = size;
    e.color = color;
    e.strength = strength;
    e.star = false;
    this.spawned[kind]++;
    return e;
  }

  private particle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    look: { life: number; size: number; color: number; gravity: number; drag: number; alpha: number },
  ): void {
    const p = this.particles.acquire();
    p.active = true;
    p.age = 0;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = look.life;
    p.size = look.size;
    p.color = look.color;
    p.gravity = look.gravity;
    p.drag = look.drag;
    p.alpha = look.alpha;
  }
}

/** Point du plan du mur (décalé d'un centimètre vers le terrain) en face du centre de la balle. */
function onWall(axis: 'x' | 'z', normal: { x: number; z: number }, x: number, z: number): [number, number] {
  const inset = 0.01;
  return axis === 'x' ? [x, -normal.z * (HALF_LENGTH - inset)] : [-normal.x * (HALF_WIDTH - inset), z];
}

/** Ouverture d'un anneau (0 → 1) : rapide au début, puis il ralentit. */
export function ringOpening(t: number): number {
  const u = clamp01(t);
  return 1 - (1 - u) * (1 - u) * (1 - u);
}

/** Éclat restant (1 → 0) d'un effet à la fraction `t` de sa vie. */
export function fade(t: number): number {
  const u = clamp01(t);
  return (1 - u) * (1 - u);
}

/** Décalage (m) du grillage qui vibre, le long de sa normale, à l'âge `age` (s). */
export function meshOffset(age: number, strength: number): number {
  return 0.035 * strength * Math.sin(age * 2 * Math.PI * 26) * Math.exp(-age * 9);
}
