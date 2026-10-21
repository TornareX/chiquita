import { playReferenceMatch } from './crossMatch';

/** Version du protocole (messages entre le serveur et les navigateurs) : à changer quand ils changent. */
export const PROTOCOL_VERSION = 1;

let cached: string | null = null;

/**
 * Version du jeu en ligne : le protocole, plus l'empreinte d'un court match d'IA rejoué au démarrage (5 s, quelques
 * millisecondes). Elle change d'elle-même dès que la simulation change (un réglage, une règle, l'IA) : un navigateur
 * resté sur une ancienne version est refusé par le serveur au lieu de jouer un match qui diverge.
 */
export function gameVersion(): string {
  cached ??= `${PROTOCOL_VERSION}-${playReferenceMatch(5).final}`;
  return cached;
}
