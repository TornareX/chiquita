import type { ArcadeCommands, ShotKind } from './commands';
import { HALF_LENGTH, HALF_WIDTH, SIM_DT } from './constants';
import type { Duel, DuelShot, PointReason } from './duel';
import type { PhysicsProfile } from './profile';
import { vec3, type Vec3 } from './vec3';

/**
 * Leçons du mode tutoriel (`?mode=tutoriel`, TUTORIEL_PLAN.md) : chaque leçon place Bleu (joueur 0,
 * l'élève) et fait jouer à Rouge une balle d'ouverture, toujours la même pour un essai donné ; Rouge ne
 * joue pas ensuite. L'essai se termine au premier rebond de la balle de Bleu (ou à la fin du point),
 * et la leçon juge ce coup. Données pures : rien ici ne touche au DOM.
 *
 * Les textes écrivent les boutons en jetons (`{normal}`, `{overhead}`, `{slice}`, `{lob}`), affichés
 * avec les symboles de la manette du joueur.
 */

/** Ce qui s'est passé pendant un essai de Bleu. */
export interface AttemptOutcome {
  /** Un bouton de coup a été pressé pendant l'essai. */
  pressed: boolean;
  /** Bouton relâché pour la frappe (celui que le joueur a pressé, même si la situation change le coup). */
  button: ShotKind | null;
  shot: DuelShot | null;
  /** Au moins un relâcher dans le vide : trop tôt (balle pas encore à portée) ou trop tard (passée). */
  whiff: boolean;
  /** Le dernier relâcher dans le vide était en retard. */
  whiffLate: boolean;
  /** Premier rebond de la balle de Bleu, s'il y en a eu un. */
  landing: Vec3 | null;
  /** Ce rebond est dans le camp de Rouge. */
  inCourt: boolean;
  /** Le point s'est terminé avant ce rebond (filet, balle non renvoyée…). */
  reason: PointReason | null;
}

/** Durée maximale d'un essai (s) : au-delà, il est jugé tel quel. */
const ATTEMPT_TIMEOUT = 8;

/**
 * Suit un essai, pas à pas, après chaque `duel.step` : à créer juste après le départ de la situation.
 * `step` rend le résultat une fois l'essai terminé, `null` avant.
 */
export class AttemptWatcher {
  private readonly startTick: number;
  private hitTick: number;
  private whiffTick: number;
  private held: ShotKind | null = null;
  private released: ShotKind | null = null;
  private readonly outcome: AttemptOutcome = {
    pressed: false,
    button: null,
    shot: null,
    whiff: false,
    whiffLate: false,
    landing: null,
    inCourt: false,
    reason: null,
  };

  constructor(
    duel: Duel,
    private readonly index: 0 | 1 = 0,
  ) {
    const player = duel.players[index];
    this.startTick = duel.tick;
    this.hitTick = player.lastHitTick;
    this.whiffTick = player.lastWhiffTick;
  }

  step(duel: Duel, commands: ArcadeCommands): AttemptOutcome | null {
    const o = this.outcome;
    const player = duel.players[this.index];
    if (commands.shot) o.pressed = true;
    if (this.held && !commands.shot) this.released = this.held;
    this.held = commands.shot;
    if (player.lastWhiffTick !== this.whiffTick) {
      this.whiffTick = player.lastWhiffTick;
      o.whiff = true;
      o.whiffLate = player.lastWhiffLate;
    }
    if (player.lastHitTick !== this.hitTick && !o.shot) {
      this.hitTick = player.lastHitTick;
      o.shot = player.lastHit;
      o.button = this.released ?? commands.shot ?? player.lastHit?.kind ?? null;
    }
    if (o.shot) {
      const ground = duel.contacts.find((c) => c.surface === 'ground');
      if (ground) {
        o.landing = ground.pos;
        o.inCourt = inRedCourt(ground.pos);
        return o;
      }
    }
    if (duel.result) {
      o.reason = duel.result.reason;
      return o;
    }
    if ((duel.tick - this.startTick) * SIM_DT > ATTEMPT_TIMEOUT) return o;
    return null;
  }
}

/** Rebond dans le camp de Rouge (z positif), lignes comprises. */
export function inRedCourt(pos: Vec3): boolean {
  return pos.z > 0 && pos.z <= HALF_LENGTH && Math.abs(pos.x) <= HALF_WIDTH;
}

/** Zone de rebond visée dans le camp de Rouge, en coordonnées du terrain. */
export interface TargetZone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Nom de la zone vu par Bleu : « à droite », « court »… */
  label: string;
}

export function inZone(pos: Vec3, zone: TargetZone): boolean {
  return pos.x >= zone.x0 && pos.x <= zone.x1 && pos.z >= zone.z0 && pos.z <= zone.z1;
}

export interface Verdict {
  success: boolean;
  /** Une seule phrase : bravo, ou pourquoi ça n'a pas marché et quoi changer. */
  message: string;
}

export interface Lesson {
  id: string;
  title: string;
  /** Palier de GAME_DESIGN.md §10. */
  tier: 1 | 2 | 3 | 4;
  /** Boutons à utiliser, en jetons. */
  buttons: string;
  /** Quand jouer ce coup. */
  when: string;
  /** Comment bien le faire, en 2 ou 3 points. */
  how: readonly string[];
  /** Réussites à enchaîner, seul, pour valider la leçon. */
  goal: number;
  /** Place les joueurs et fait jouer à Rouge la balle de l'essai n° `attempt` (0, 1, 2…). */
  start(duel: Duel, attempt: number): void;
  /** Consigne de l'essai, en une ligne. */
  instruction(attempt: number): string;
  /** Zone à viser, dessinée au sol, s'il y en a une. */
  target(attempt: number): TargetZone | null;
  /** Ce que fait le démonstrateur : bouton et stick au moment de l'impact. */
  demo(attempt: number): { kind: ShotKind; stick: ArcadeCommands['stick'] };
  judge(outcome: AttemptOutcome, attempt: number, profile: PhysicsProfile): Verdict;
}

const at = (x: number, z: number): Vec3 => vec3(x, 0, z);
const BUTTON_NAMES: Record<ShotKind, string> = {
  normal: 'le coup normal',
  overhead: 'le coup haut (bandeja, víbora, smash)',
  slice: 'le coupé',
  lob: 'le lob',
};
const seconds = (t: number): string => t.toFixed(2).replace('.', ',');

/**
 * Échecs communs à toutes les leçons : pas de frappe, mauvais bouton, coup bloqué, balle dehors.
 * `null` si le coup est passé avec le bon bouton (la leçon juge alors le reste).
 */
export function commonFailure(o: AttemptOutcome, expected: ShotKind, profile: PhysicsProfile): string | null {
  const button = `{${expected}}`;
  if (!o.shot) {
    if (!o.pressed) return `Tu n’as pas frappé : appuie sur ${button} dès que Rouge frappe, garde-le enfoncé.`;
    if (o.whiff && o.whiffLate) return `Relâché trop tard : la balle était déjà passée. Relâche ${button} plus tôt, quand elle arrive à côté de toi.`;
    if (o.whiff) return `Relâché trop tôt, dans le vide : garde ${button} enfoncé jusqu’à ce que la balle arrive à côté de toi.`;
    return `Pas de frappe : relâche ${button} quand la balle arrive à côté de toi (l’anneau se referme).`;
  }
  if (o.button && o.button !== expected) {
    return `Tu as appuyé sur {${o.button}} (${BUTTON_NAMES[o.button]}). Ici, c’est ${button}.`;
  }
  if (o.shot.style === 'block') return `Coup bloqué : appuie sur ${button} plus tôt, dès que Rouge frappe, pour armer ton coup.`;
  if (!o.landing && o.reason === 'net') return 'Dans le filet : relâche un peu plus tôt, la balle montera mieux.';
  if (!o.inCourt) {
    if (o.shot.timing > profile.rally.perfectAfter) {
      return `Relâché en retard (+${seconds(o.shot.timing)} s) : la balle part large et long. Relâche un peu plus tôt.`;
    }
    return 'La balle sort : pousse le stick moins fort au moment de la frappe.';
  }
  return null;
}

/** Bravo, avec un mot sur la frappe parfaite. */
function praise(o: AttemptOutcome, text: string): Verdict {
  return { success: true, message: o.shot?.perfect ? `${text} Et parfait !` : text };
}

/** Rouge, au fond, renvoie une balle facile vers Bleu, au fond lui aussi ; un peu à gauche ou à droite selon l'essai. */
function baselineFeed(duel: Duel, attempt: number): void {
  const side = [1, -1, 0.3][attempt % 3]!;
  duel.playSituation(1, [at(0, -8.5), at(0, 8.5)], {
    kind: 'normal',
    contact: vec3(0, 0.9, 8.5),
    target: vec3(1.4 * side, 0.03, -6.6),
  });
}

/** Zones de la leçon de direction, vues par Bleu (sa droite est vers x négatif). */
const DIRECTION_ZONES: readonly TargetZone[] = [
  { x0: -HALF_WIDTH, x1: -1.2, z0: 0.5, z1: HALF_LENGTH, label: 'à droite' },
  { x0: 1.2, x1: HALF_WIDTH, z0: 0.5, z1: HALF_LENGTH, label: 'à gauche' },
  { x0: -HALF_WIDTH, x1: HALF_WIDTH, z0: 0.5, z1: 5, label: 'court, près du filet' },
  { x0: -HALF_WIDTH, x1: HALF_WIDTH, z0: 7, z1: HALF_LENGTH, label: 'profond, près de la vitre' },
];
const DIRECTION_STICKS: readonly ArcadeCommands['stick'][] = [
  { forward: 0, right: 1 },
  { forward: 0, right: -1 },
  { forward: -1, right: 0 },
  { forward: 1, right: 0 },
];
const DIRECTION_WORDS = ['à droite', 'à gauche', 'vers toi', 'vers l’avant'] as const;

export const LESSONS: readonly Lesson[] = [
  {
    id: 'coup-normal',
    title: 'Le coup normal',
    tier: 1,
    buttons: '{normal} maintenu, puis relâché',
    when: 'Le coup de base : une balle à bonne hauteur, du fond du terrain.',
    how: [
      'Appuie sur {normal} dès que Rouge frappe : ton joueur se prépare (plus tu appuies tôt, plus le coup est armé).',
      'Garde {normal} enfoncé et relâche quand la balle arrive à côté de toi : l’anneau au sol se referme à ce moment-là.',
      'Relâché pile au bon moment : frappe parfaite (arrêt sur image, balle plus rapide).',
    ],
    goal: 5,
    start: baselineFeed,
    instruction: () => 'Renvoie la balle dans le terrain avec {normal}.',
    target: () => null,
    demo: () => ({ kind: 'normal', stick: { forward: 0, right: 0 } }),
    judge(o, _attempt, profile) {
      const failure = commonFailure(o, 'normal', profile);
      return failure ? { success: false, message: failure } : praise(o, 'Bien joué : la balle est dans le terrain.');
    },
  },
  {
    id: 'diriger',
    title: 'Diriger la balle',
    tier: 1,
    buttons: '{normal} + stick au moment du relâcher',
    when: 'À chaque coup : la balle part là où pointe le stick quand tu relâches.',
    how: [
      'Le stick à gauche ou à droite choisit le côté ; vers l’avant, une balle profonde ; vers toi, une balle courte.',
      'Seul compte le stick au moment du relâcher : place-toi d’abord, puis oriente le stick juste avant de frapper.',
      'Stick au centre : coup sûr, au milieu.',
    ],
    goal: 4,
    start: baselineFeed,
    instruction: (attempt) =>
      `Vise la zone ${DIRECTION_ZONES[attempt % DIRECTION_ZONES.length]!.label} : stick ${DIRECTION_WORDS[attempt % DIRECTION_ZONES.length]} au relâcher de {normal}.`,
    target: (attempt) => DIRECTION_ZONES[attempt % DIRECTION_ZONES.length]!,
    demo: (attempt) => ({ kind: 'normal', stick: DIRECTION_STICKS[attempt % DIRECTION_STICKS.length]! }),
    judge(o, attempt, profile) {
      const failure = commonFailure(o, 'normal', profile);
      if (failure) return { success: false, message: failure };
      const i = attempt % DIRECTION_ZONES.length;
      const zone = DIRECTION_ZONES[i]!;
      if (inZone(o.landing!, zone)) return praise(o, `Dans la zone ${zone.label} !`);
      return {
        success: false,
        message: `Dans le terrain, mais pas ${zone.label} : au moment du relâcher, pousse le stick ${DIRECTION_WORDS[i]} à fond.`,
      };
    },
  },
  {
    id: 'bandeja',
    title: 'La bandeja',
    tier: 3,
    buttons: '{overhead}, stick au centre',
    when: 'Tu es au filet et Rouge te lobe, pas assez haut pour un smash : la bandeja te garde au filet.',
    how: [
      'Appuie sur {overhead} dès que Rouge lobe, recule un peu si besoin : laisse-la redescendre et frappe-la à hauteur de tes yeux, devant toi et sur le côté, le poids sur le pied arrière. (Le smash, lui, se frappe plus haut, bras tendu.)',
      'Stick au centre au moment de la frappe : bandeja, sûre et profonde, vers le coin. Sur le côté : víbora ; vers l’avant près du filet : remate.',
      'La hauteur fait tout : relâchée trop tôt, la balle est prise trop haut, perd son effet et rebondit (balle facile pour Rouge) ; trop tard, prise sous les yeux, elle part à plat dans le filet.',
      'Elle ne gagne pas le point : elle garde le filet. Reviens ensuite vers le filet.',
    ],
    goal: 3,
    start(duel, attempt) {
      const side = [0.6, -0.6, 0][attempt % 3]!;
      duel.playSituation(1, [at(0, -3.5), at(0, 8.6)], {
        kind: 'lob',
        contact: vec3(0.3, 0.9, 8.6),
        target: vec3(side, 0.03, -6.2),
      });
    },
    instruction: () => 'Lob sur toi : {overhead}, stick au centre, relâche quand la balle redescend à hauteur de tes yeux, sur le côté.',
    target: () => null,
    demo: () => ({ kind: 'overhead', stick: { forward: 0, right: 0 } }),
    judge(o, _attempt, profile) {
      if (o.shot && o.button === 'overhead' && !o.shot.overhead) {
        return { success: false, message: 'Balle trop basse quand tu as frappé : appuie sur {overhead} plus tôt, prends-la à hauteur de tes yeux, sur le côté.' };
      }
      // Hauteur de frappe : trop basse, filet ; trop haute, elle rebondit.
      const off = o.shot?.heightOff ?? 0;
      const height = o.shot ? `${o.shot.contact.y.toFixed(2).replace('.', ',')} m` : '';
      if (off < 0 && o.button === 'overhead' && !o.inCourt) {
        return {
          success: false,
          message: `Prise trop basse (${height}) : la balle part à plat, dans le filet. Relâche un peu plus tôt, quand elle passe à hauteur de tes yeux.`,
        };
      }
      const failure = commonFailure(o, 'overhead', profile);
      if (failure) return { success: false, message: failure };
      const kind = o.shot!.overhead;
      if (kind === 'vibora') return { success: false, message: 'C’est une víbora : stick sur le côté. Pour la bandeja, laisse le stick au centre.' };
      if (kind === 'remate') return { success: false, message: 'C’est un remate : stick vers l’avant. Pour la bandeja, laisse le stick au centre.' };
      if (kind === 'bajada') return { success: false, message: 'C’est une bajada (balle sortie de la vitre) : prends-la avant, de volée.' };
      if (off > 0.15) {
        return {
          success: false,
          message: `Prise trop haute (${height}) : la bandeja perd son effet et rebondit, balle facile pour Rouge. Laisse-la redescendre à hauteur de tes yeux avant de relâcher.`,
        };
      }
      if (off > 0) return { success: true, message: `Bandeja, mais prise un peu haute (${height}) : attends qu’elle descende à hauteur de tes yeux.` };
      if (off < 0) return { success: true, message: `Bandeja, mais prise un peu basse (${height}) : elle a frôlé le filet. Relâche un peu plus tôt.` };
      return praise(o, 'Bandeja ! Tu gardes le filet.');
    },
  },
];
