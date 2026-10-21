import { connectedGamepads } from '../../input/gamepad';
import { resolvePadFamily } from '../../input/padStyle';
import { SITUATIONS } from '../../sim/situations';
import { plainButtons } from '../buttonIcons';
import type { Menu, MenuItem, MenuScreen } from '../menu';
import { loadPreferences } from '../settingsStore';

/**
 * Écran « Entraînement » : le tutoriel (une leçon par coup, avec sa propre liste et ses étoiles) et les situations de
 * match du labo, rejouées en boucle. Avec `?debug`, les outils de développement : machine à balles et animations.
 * `go` lance un mode par son adresse (sans le `?`).
 */
export function trainingScreen(menu: Menu, go: (query: string) => void, debug: boolean): MenuScreen {
  const situations: MenuScreen = {
    id: 'situations',
    title: 'Situations de match',
    hint: 'Une situation rejouée en boucle, identique, contre l’IA : de quoi travailler un coup précis.',
    // Les noms en liste, l'explication de la situation sélectionnée dans sa fiche, à côté.
    layout: 'detail',
    items: () => {
      // Les boutons des explications (`{slice}`…) écrits avec les symboles de la première manette (« bouton du haut »
      // sans manette reconnue), en tête de phrase avec sa majuscule.
      const family = resolvePadFamily(loadPreferences().padStyle, connectedGamepads()[0]);
      return [
        ...SITUATIONS.map(
          (s): MenuItem => ({
            kind: 'action',
            id: `situation-${s.id}`,
            label: s.name,
            hint: plainButtons(s.hint, family).replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
            run: () => go(`mode=labo&situation=${s.id}`),
          }),
        ),
        { kind: 'action', id: 'retour', label: 'Retour', run: () => menu.pop() },
      ];
    },
  };
  return {
    id: 'entrainement',
    title: 'Entraînement',
    items: () => {
      const items: MenuItem[] = [
        {
          kind: 'action',
          id: 'tutoriel',
          label: 'Tutoriel',
          hint: 'Une leçon par coup : quand le jouer, comment, et des essais jusqu’à le réussir.',
          primary: true,
          run: () => go('mode=tutoriel'),
        },
        { kind: 'action', id: 'situations', label: 'Situations de match', hint: 'Le labo : une situation rejouée en boucle.', run: () => menu.push(situations) },
      ];
      if (debug) {
        items.push(
          { kind: 'heading', id: 'outils', text: 'Outils (développement)' },
          { kind: 'action', id: 'machine', label: 'Machine à balles', hint: 'Ancienne vue à la première personne, clavier et souris.', run: () => go('mode=trainer') },
          { kind: 'action', id: 'animations', label: 'Animations', hint: 'Visionneur des animations du personnage.', run: () => go('mode=animations') },
        );
      }
      items.push({ kind: 'action', id: 'retour', label: 'Retour', run: () => menu.pop() });
      return items;
    },
  };
}
