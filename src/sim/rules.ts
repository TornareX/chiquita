import type { Contact } from './collisions';

export type FaultReason =
  /** La balle a touché le filet et n'est pas passée. */
  | 'net'
  /** La balle est retombée dans le camp du joueur sans toucher le filet. */
  | 'own-ground'
  /** La balle a touché le grillage du joueur. */
  | 'own-mesh'
  /** La balle a touché une vitre ou le grillage adverse avant de rebondir au sol. */
  | 'opponent-wall'
  /** La balle est sortie du terrain. */
  | 'out'
  /** Le joueur a frappé la balle deux fois. */
  | 'double-hit';

export type MissReason =
  /** Deuxième rebond au sol avant la frappe. */
  | 'second-bounce'
  /** La balle n'a pas été frappée (ou n'était plus jouable). */
  | 'not-touched';

export type BallResult =
  | { kind: 'valid' }
  | { kind: 'fault'; reason: FaultReason }
  | { kind: 'missed'; reason: MissReason };

/** Suivi d'une balle, du lancement par la machine jusqu'au verdict. */
export interface Rally {
  /** Rebonds au sol dans le camp du joueur avant sa frappe. */
  bounces: number;
  /** Le joueur a frappé la balle. */
  hit: boolean;
  /** Le renvoi a touché le filet (hors bande). */
  touchedNet: boolean;
  result: BallResult | null;
}

export function createRally(): Rally {
  return { bounces: 0, hit: false, touchedNet: false, result: null };
}

/**
 * Met à jour le suivi avec les événements d'un pas de simulation : les contacts de la balle,
 * puis l'éventuelle frappe du joueur (qui a lieu après eux dans le pas).
 * Retourne le verdict au pas où il tombe, `null` sinon. Le joueur est côté Z négatif.
 */
export function judgeStep(rally: Rally, contacts: readonly Contact[], playerHit: boolean): BallResult | null {
  if (rally.result) return null;
  const decide = (result: BallResult): BallResult => (rally.result = result);

  for (const contact of contacts) {
    const ownSide = contact.pos.z < 0;

    if (!rally.hit) {
      // Balle de la machine : un seul rebond au sol autorisé avant la frappe.
      if (contact.surface === 'out') return decide({ kind: 'missed', reason: 'not-touched' });
      if (contact.surface === 'ground' && ownSide && ++rally.bounces >= 2) {
        return decide({ kind: 'missed', reason: 'second-bounce' });
      }
      continue;
    }

    // Renvoi du joueur.
    switch (contact.surface) {
      case 'ground':
        if (!ownSide) return decide({ kind: 'valid' });
        return decide({ kind: 'fault', reason: rally.touchedNet ? 'net' : 'own-ground' });
      case 'net':
        rally.touchedNet = true;
        break;
      case 'tape':
        // La bande ne change rien : seule compte la suite de la trajectoire.
        break;
      case 'glass':
        // Sa propre vitre est permise (contrapared), pas celle de l'adversaire.
        if (!ownSide) return decide({ kind: 'fault', reason: 'opponent-wall' });
        break;
      case 'mesh':
        return decide({ kind: 'fault', reason: ownSide ? 'own-mesh' : 'opponent-wall' });
      case 'out':
        return decide({ kind: 'fault', reason: 'out' });
    }
  }

  if (playerHit) {
    if (rally.hit) return decide({ kind: 'fault', reason: 'double-hit' });
    rally.hit = true;
  }
  return null;
}

/** Verdict d'une balle abandonnée sans verdict (remplacée par la suivante, par exemple). */
export function abandon(rally: Rally): BallResult | null {
  if (rally.result) return null;
  // Après une frappe, une balle qui n'a jamais rebondi dans le camp adverse n'est pas valide.
  rally.result = rally.hit
    ? { kind: 'fault', reason: rally.touchedNet ? 'net' : 'own-ground' }
    : { kind: 'missed', reason: 'not-touched' };
  return rally.result;
}

/** Statistiques de la session pour un exercice. */
export interface Stats {
  balls: number;
  valid: number;
  faults: number;
  missed: number;
  /** Nombre de frappes et somme de leurs qualités, pour la qualité moyenne. */
  hits: number;
  qualitySum: number;
}

export function createStats(): Stats {
  return { balls: 0, valid: 0, faults: 0, missed: 0, hits: 0, qualitySum: 0 };
}

export function recordResult(stats: Stats, result: BallResult): void {
  stats.balls++;
  if (result.kind === 'valid') stats.valid++;
  else if (result.kind === 'fault') stats.faults++;
  else stats.missed++;
}

/** Taux de réussite (0..1), ou `null` avant la première balle. */
export function successRate(stats: Stats): number | null {
  return stats.balls > 0 ? stats.valid / stats.balls : null;
}

/** Qualité moyenne de contact (0..1), ou `null` avant la première frappe. */
export function averageQuality(stats: Stats): number | null {
  return stats.hits > 0 ? stats.qualitySum / stats.hits : null;
}
