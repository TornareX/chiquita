import { createMenu, type MenuScreen } from '../ui/menu';
import { createPadTest, type PadTest } from '../ui/padTest';
import { playScreen } from '../ui/screens/playScreen';
import { settingsScreen } from '../ui/screens/settingsScreen';
import { initialSetup, loadPreferences, savePreferences, saveSetup, setupQuery, type MatchSetup } from '../ui/settingsStore';

/**
 * Accueil (`/` sans paramètre de jeu, ou `?mode=accueil`) : Jouer · En ligne · Réglages
 * (`research/MENUS_PLAN.md` §2). Écran simple, sans scène 3D. Chaque mode se lance en rechargeant la page avec son
 * adresse : l'adresse reste la seule source de vérité, et les raccourcis d'adresse sautent l'accueil.
 * `?serveur=hote:port` : le serveur du jeu en ligne, passé à « En ligne ».
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

  /** « Teste ta manette », créé à la première demande ; le menu se cache le temps du test. */
  let padTest: PadTest | null = null;
  const testPad = (): void => {
    padTest ??= createPadTest(
      () => prefs.padStyle,
      (style) => {
        prefs.padStyle = style;
        savePreferences(prefs);
      },
    );
    const test = padTest;
    menu.hide();
    test.open();
    const wait = (): void => {
      if (test.isOpen) requestAnimationFrame(wait);
      else menu.reopen();
    };
    requestAnimationFrame(wait);
  };
  const settings = settingsScreen(menu, prefs, { inMatch: false, onChange: savePreferences, onTestPad: testPad });

  const server = params.get('serveur');
  const home: MenuScreen = {
    id: 'accueil',
    title: 'Padel Smash',
    items: () => [
      { kind: 'action', id: 'jouer', label: 'Jouer', hint: 'Un match sur cet écran, contre l’IA ou entre amis.', primary: true, run: () => menu.push(play) },
      {
        kind: 'action',
        id: 'en-ligne',
        label: 'En ligne',
        hint: 'Une salle à code, avec des amis chacun chez soi.',
        run: () => go(`enligne${server ? `&serveur=${encodeURIComponent(server)}` : ''}`),
      },
      { kind: 'action', id: 'reglages', label: 'Réglages', hint: 'Son, affichage, manette, et tes préférences de joueur.', run: () => menu.push(settings) },
    ],
  };
  menu.show(home);
}
