import { createMenu, type MenuScreen } from '../ui/menu';
import { playScreen } from '../ui/screens/playScreen';
import { initialSetup, loadPreferences, saveSetup, setupQuery, type MatchSetup } from '../ui/settingsStore';

/**
 * Accueil (`/` sans paramètre de jeu, ou `?mode=accueil`) : Jouer · En ligne · Entraînement · Réglages
 * (`research/MENUS_PLAN.md` §2). Écran simple, sans scène 3D. Chaque mode se lance en rechargeant la page avec son
 * adresse : l'adresse reste la seule source de vérité, et les raccourcis d'adresse sautent l'accueil.
 */
export function startHome(canvas: HTMLCanvasElement): void {
  canvas.style.display = 'none';
  const params = new URLSearchParams(location.search);
  /** `?debug` suit d'un écran à l'autre (outils de développement). */
  const debug = params.has('debug');
  const go = (query: string): void => {
    location.href = `/?${query}${debug ? '&debug' : ''}`;
  };

  const prefs = loadPreferences();
  const menu = createMenu({ id: 'accueil', overlay: 'opaque' });
  /** Lancer un match local : la configuration est retenue pour la prochaine fois, puis la page part sur son adresse. */
  const launch = (setup: MatchSetup): void => {
    saveSetup(setup);
    go(setupQuery(setup));
  };
  const play = playScreen(menu, initialSetup(prefs), prefs, launch);

  const home: MenuScreen = {
    id: 'accueil',
    title: 'Padel Smash',
    items: () => [
      { kind: 'action', id: 'jouer', label: 'Jouer', hint: 'Un match sur cet écran, contre l’IA ou entre amis.', primary: true, run: () => menu.push(play) },
      { kind: 'action', id: 'en-ligne', label: 'En ligne', hint: 'Une salle à code, avec des amis chacun chez soi.', run: () => go('enligne') },
    ],
  };
  menu.show(home);
}
