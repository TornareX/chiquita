import type { Duel } from './duel';
import { overheadTarget } from './shots';
import { vec3, type Vec3 } from './vec3';

/**
 * Les indices écrivent les boutons en jetons (`{normal}`, `{overhead}`, `{slice}`, `{lob}`) : l'interface
 * les affiche avec les symboles de la manette du joueur (`src/ui/buttonIcons.ts`).
 *
 * Situations de match du labo de sensations (`?mode=labo`) : Bleu (joueur 0, humain) face à Rouge
 * (joueur 1, IA). Chaque situation place les deux joueurs et fait jouer à Rouge un coup d'ouverture
 * typique ; le point se joue ensuite normalement, puis la même situation recommence, identique.
 */
export interface Situation {
  id: string;
  name: string;
  /** Ce qu'on y sent : à lire avant de jouer. */
  hint: string;
  start(duel: Duel): void;
  /**
   * Atelier : chaque départ est une balle différente, enchaînée sans décompte dès que la précédente est jouée, avec le
   * journal des frappes et le bouton Y « raté » (`src/modes/labo.ts`).
   */
  workshop?: boolean;
}

/** Tirage de l'atelier : pseudo-aléatoire, mais la même suite à chaque séance (graine fixe). */
function workshopDraw(seed: number): (min: number, max: number) => number {
  let state = seed >>> 0;
  return (min, max) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return min + (max - min) * (state / 4294967296);
  };
}
const draw = workshopDraw(2310);
/** Un côté au hasard : -1 ou 1. */
const side = (): number => (draw(0, 1) < 0.5 ? -1 : 1);

/**
 * Atelier contre-vitre (Xavier, 23/10) : beaucoup de balles vers sa vitre, enchaînées, pour la travailler et la
 * signaler. Trois cas, positions et vitesses variées : le lob qui le passe au filet (35 %), le passing qui le déborde
 * au filet et qu'il poursuit en reculant (40 %), la balle forte et basse qui meurt dans sa vitre (25 %).
 */
function workshopBall(duel: Duel): void {
  const roll = draw(0, 1);
  if (roll < 0.35) {
    const x = draw(-1, 1);
    duel.playSituation(1, [at(x, -draw(3, 4)), at(0.3, 3)], {
      kind: 'lob',
      contact: vec3(draw(-1, 1), 1, 3),
      target: vec3(x + draw(-1.5, 1.5), 0.03, -draw(7.2, 8.6)),
      flightTime: draw(1.5, 1.9),
    });
  } else if (roll < 0.75) {
    // Passing du fond, le long du joueur au filet : il se retourne et court derrière.
    const x = draw(-1, 1);
    const pass = side();
    duel.playSituation(1, [at(x, -draw(3, 4)), at(-pass * 1.5, 8.5)], {
      kind: 'normal',
      contact: vec3(-pass * draw(0.5, 2), 0.9, 8.5),
      target: vec3(x + pass * draw(1.6, 2.6), 0.03, -draw(7.6, 8.8)),
      error: draw(0, 0.4),
    });
  } else {
    const x = draw(-2, 2);
    duel.playSituation(1, [at(x, -draw(7.2, 8.2)), at(0.3, 3)], {
      kind: 'normal',
      contact: vec3(draw(-1, 1), 1, 3),
      target: vec3(x + draw(-1, 1), 0.03, -draw(8.4, 9)),
      error: draw(0.4, 0.8),
    });
  }
}

const at = (x: number, z: number): Vec3 => vec3(x, 0, z);

/** Rouge frappe `kind` de `contact` vers `target` (camp de Bleu : z négatif). */
function opening(
  bleu: Vec3,
  rouge: Vec3,
  shot: Parameters<Duel['playSituation']>[2],
): (duel: Duel) => void {
  return (duel) => duel.playSituation(1, [bleu, rouge], shot);
}

export const SITUATIONS: readonly Situation[] = [
  {
    id: 'echange-fond',
    name: 'Échange de fond',
    hint: 'Les deux au fond : coup croisé profond, à jouer après la vitre ou avant.',
    start: opening(at(0, -8.5), at(0, 8.5), { kind: 'normal', contact: vec3(-0.5, 0.9, 8.5), target: vec3(2.5, 0.03, -7.6) }),
  },
  {
    id: 'defense-volleyeur',
    name: 'Défendre contre un joueur au filet',
    hint: 'Rouge volleye profond dans ta vitre : lob, chiquita ou passing ?',
    start: opening(at(0, -8.5), at(0.5, 3.5), { kind: 'normal', contact: vec3(0.5, 1.3, 3.2), target: vec3(-2.5, 0.03, -8.3) }),
  },
  {
    id: 'attaque-filet',
    name: 'Au filet, face à un défenseur',
    hint: 'Rouge défend du fond : la volée, au bon timing, doit faire mal.',
    start: opening(at(0.3, -3.5), at(0, 8.8), { kind: 'normal', contact: vec3(0.6, 0.9, 8.6), target: vec3(1.5, 0.03, -6.5) }),
  },
  {
    id: 'balle-flottante',
    name: 'Balle flottante au filet',
    hint: 'Défense ratée de Rouge, balle haute et lente : {slice} de volée pour la couper et la tuer.',
    start: opening(at(0.4, -3.2), at(0, 8.8), { kind: 'normal', contact: vec3(0, 1, 8.6), target: vec3(1, 0.03, -5.5), error: 0.8 }),
  },
  {
    id: 'au-corps',
    name: 'Frappe au corps',
    hint: 'Rouge frappe fort sur toi au filet : appuie tôt, sinon tu ne fais que bloquer.',
    start: opening(at(0.2, -3), at(0, 5), { kind: 'normal', contact: vec3(0.3, 1, 5), target: vec3(0.2, 0.03, -6.5), perfect: true }),
  },
  {
    id: 'lob-sur-toi',
    name: 'Lob sur toi au filet',
    hint: 'Bandeja, víbora, ou recule et joue après la vitre.',
    start: opening(at(0, -3.5), at(0, 8.6), { kind: 'lob', contact: vec3(0.3, 0.9, 8.6), target: vec3(0.5, 0.03, -7.6) }),
  },
  {
    id: 'lob-court',
    name: 'Lob court : à smasher',
    hint: '{overhead}, stick vers l’avant, relâche au bon moment : le remate parfait sort par trois.',
    start: opening(at(0, -3.5), at(0, 8.6), { kind: 'lob', contact: vec3(0.3, 0.9, 8.6), target: vec3(0.5, 0.03, -5) }),
  },
  {
    id: 'lob-qui-passe',
    name: 'Lob qui passe : contre-vitre',
    hint: 'Rouge te lobe, tendu, au-dessus de toi au filet : cours vers ta vitre. Prépare la contre-vitre (à la manette : L1 ou R1 tenu, puis vers l’avant pour frapper) et frappe quand elle est entre toi et ta vitre : elle repasse le filet. Aux boutons : {normal}, stick gauche vers ta vitre.',
    // Lob tendu (1,7 s de vol, sommet ~3,4 m) : il passe juste hors de portée du smash de Bleu au filet et rebondit à 7,5 m.
    start: opening(at(0, -3.5), at(0.3, 3), { kind: 'lob', contact: vec3(0.3, 1, 3), target: vec3(0.6, 0.03, -7.5), flightTime: 1.7 }),
  },
  {
    id: 'balle-qui-meurt',
    name: 'Balle qui meurt dans ta vitre',
    hint: 'Rouge frappe fort et bas au fond : la balle va mourir dans ta vitre. Contre-vitre (à la manette : L1 ou R1 tenu, puis vers l’avant) avant son second rebond. Ou attends qu’elle ressorte, basse.',
    start: opening(at(0.6, -8), at(0.3, 3), { kind: 'normal', contact: vec3(0.3, 1, 3), target: vec3(0.6, 0.03, -8.8), error: 0.6 }),
  },
  {
    id: 'atelier-contre-vitre',
    name: 'Atelier contre-vitre (enchaîné)',
    hint: 'Des balles vers ta vitre, l’une après l’autre : lob qui te passe, passing qui te déborde, balle qui meurt. Quand elle est entre toi et ta vitre, contre-vitre (à la manette : L1 ou R1 tenu, puis vers l’avant) avant son second rebond. Y : signaler un coup raté.',
    workshop: true,
    start: workshopBall,
  },
  {
    id: 'smash-a-defendre',
    name: 'Défendre un smash',
    hint: 'Rouge remate près du filet : rattrape-le, au besoin en sortant par la porte.',
    start: (duel) =>
      duel.playSituation(1, [at(0, -8.5), at(0.3, 2.5)], {
        kind: 'overhead',
        overhead: 'remate',
        perfect: true,
        contact: vec3(0.3, 2.7, 2.3),
        target: overheadTarget('remate', 1, { forward: 1, right: 0.6 }, true, duel.profile),
      }),
  },
  {
    id: 'retour-service',
    name: 'Retour de service',
    hint: 'Rouge sert et monte au filet : premier coup du point.',
    start: (duel) => duel.playSituation(1, [at(-1.6, -8.6), at(1.6, 7.5)], 'serve'),
  },
];
