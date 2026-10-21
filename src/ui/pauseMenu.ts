import { createMenu, type MenuItem, type MenuScreen } from './menu';
import { settingsScreen } from './screens/settingsScreen';
import { loadPreferences, saveSettings, type DuelSettings } from './settingsStore';

export interface PauseMenu {
  readonly isOpen: boolean;
  toggle(): void;
}

export interface PauseOptions {
  /** En ligne : pas de « Recommencer », et quitter, c'est quitter la salle (l'IA prend la place). */
  online: boolean;
  /** Réglages modifiés ; `restart` : relancer la partie (« Recommencer »). */
  onChange(settings: DuelSettings, restart: boolean): void;
  /** Ouvre l'écran « Teste ta manette » (la pause se ferme). */
  onTestPad(): void;
  /** Quitter vers l'accueil. */
  onQuit(): void;
  /** Un autre écran tient la main (« Teste ta manette ») : Échap ne rouvre pas la pause. */
  blocked(): boolean;
}

/**
 * Pause d'un match (Échap, Start, ou le bouton en haut à droite) : reprendre, les réglages qui valent tout de suite
 * (son, affichage…), recommencer (en local), quitter vers l'accueil. Les places et les règles se choisissent avant de
 * lancer, dans « Jouer ».
 */
export function createPauseMenu(settings: DuelSettings, options: PauseOptions): PauseMenu {
  const menu = createMenu({ id: 'pause-menu', overlay: 'dim', onRootBack: () => close() });
  const button = document.createElement('button');
  button.id = 'pause-button';
  button.type = 'button';
  button.textContent = 'Pause (Échap)';
  document.body.append(button);

  const close = (): void => {
    menu.hide();
    button.hidden = false;
  };
  const open = (): void => {
    menu.show(root);
    button.hidden = true;
  };

  /** Les préférences que porte la partie (l'adresse a pu en changer), modifiées dans « Réglages ». */
  const prefs = (): ReturnType<typeof loadPreferences> => {
    const { sound, inputDisplay, padStyle, prepMove, farOwnView } = settings;
    return { ...loadPreferences(), sound, inputDisplay, padStyle, prepMove, farOwnView };
  };

  const root: MenuScreen = {
    id: 'pause',
    title: 'Pause',
    hint: options.online ? 'Le match continue pour les autres : ta place ne bouge plus.' : undefined,
    items: () => {
      const items: MenuItem[] = [
        { kind: 'action', id: 'reprendre', label: 'Reprendre', primary: true, run: close },
        {
          kind: 'action',
          id: 'reglages',
          label: 'Réglages',
          run: () =>
            menu.push(
              settingsScreen(menu, prefs(), {
                inMatch: true,
                onChange: (p) => {
                  settings.sound = p.sound;
                  settings.inputDisplay = p.inputDisplay;
                  settings.padStyle = p.padStyle;
                  settings.prepMove = p.prepMove;
                  settings.farOwnView = p.farOwnView;
                  saveSettings(settings);
                  options.onChange(settings, false);
                },
                onTestPad: () => {
                  close();
                  options.onTestPad();
                },
              }),
            ),
        },
      ];
      if (!options.online) {
        items.push({
          kind: 'action',
          id: 'recommencer',
          label: 'Recommencer',
          run: () => {
            options.onChange(settings, true);
            close();
          },
        });
      }
      items.push({
        kind: 'action',
        id: 'quitter',
        label: options.online ? 'Quitter la salle' : 'Quitter vers l’accueil',
        hint: options.online ? 'L’IA prend ta place.' : undefined,
        run: options.onQuit,
      });
      return items;
    },
  };

  button.addEventListener('click', () => open());
  window.addEventListener('keydown', (event) => {
    // Pause ouverte : le menu gère Échap lui-même (revenir, puis reprendre).
    if (event.code !== 'Escape' || menu.isOpen || options.blocked()) return;
    event.preventDefault();
    open();
  });
  return {
    get isOpen(): boolean {
      return menu.isOpen;
    },
    toggle(): void {
      if (menu.isOpen) close();
      else open();
    },
  };
}
