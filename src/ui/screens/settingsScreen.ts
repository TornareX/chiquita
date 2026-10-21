import { PAD_FAMILY_NAMES, PAD_STYLES } from '../../input/padStyle';
import { ASSIST_LEVELS, PREP_MOVES } from '../../sim/duel';
import { HANDS } from '../../sim/shots';
import { ASSIST_LABELS, CONTROLLER_LABELS, HAND_LABELS, INPUT_DISPLAY_LABELS, PREP_MOVE_LABELS } from '../duelSettings';
import type { Menu, MenuItem, MenuScreen } from '../menu';
import { DEVICES, INPUT_DISPLAY_MODES, type Preferences } from '../settingsStore';

export interface SettingsScreenOptions {
  /**
   * En match (pause) : seulement ce qui vaut tout de suite ; l'assistance, la main et « je joue avec » sont ceux des
   * places, choisis avant de lancer.
   */
  inMatch: boolean;
  /** Une préférence a changé (`prefs` modifié en place) : l'enregistrer, l'appliquer. */
  onChange(prefs: Preferences): void;
  /** Ouvre l'écran « Teste ta manette ». */
  onTestPad?(): void;
}

/** Écran « Réglages » : les préférences du joueur, pour toutes les parties (`research/MENUS_PLAN.md` §2). */
export function settingsScreen(menu: Menu, prefs: Preferences, options: SettingsScreenOptions): MenuScreen {
  const changed = (): void => options.onChange(prefs);
  return {
    id: 'reglages',
    title: 'Réglages',
    hint: options.inMatch ? undefined : 'À toi, pour toutes les parties : en local, en ligne et à l’entraînement.',
    items: () => {
      const items: MenuItem[] = [
        { kind: 'toggle', id: 'son', label: 'Son', value: prefs.sound, set: (on) => ((prefs.sound = on), changed()) },
        {
          kind: 'choice',
          id: 'entrees',
          label: 'Retour des entrées',
          value: prefs.inputDisplay,
          options: INPUT_DISPLAY_MODES.map((m) => ({ value: m, label: INPUT_DISPLAY_LABELS[m] })),
          set: (m) => ((prefs.inputDisplay = m), changed()),
        },
        {
          kind: 'choice',
          id: 'symboles',
          label: 'Symboles des boutons',
          value: prefs.padStyle,
          options: PAD_STYLES.map((p) => ({ value: p, label: p === 'auto' ? 'Détectés sur la manette' : `Manette ${PAD_FAMILY_NAMES[p]}` })),
          set: (p) => ((prefs.padStyle = p), changed()),
        },
      ];
      if (options.onTestPad) {
        items.push({
          kind: 'action',
          id: 'tester-manette',
          label: 'Tester ma manette',
          hint: 'Vérifier quel bouton est lequel sur ta manette, et le stick.',
          run: () => options.onTestPad?.(),
        });
      }
      items.push(
        { kind: 'heading', id: 'jeu', text: 'Jeu' },
        {
          kind: 'choice',
          id: 'preparation',
          label: 'Stick gauche pendant la préparation',
          value: prefs.prepMove,
          options: PREP_MOVES.map((m) => ({ value: m, label: PREP_MOVE_LABELS[m] })),
          set: (m) => ((prefs.prepMove = m), changed()),
        },
        {
          kind: 'toggle',
          id: 'directions',
          label: 'L’équipe d’en face voit les directions de son côté',
          hint: 'À deux sur un même écran.',
          value: prefs.farOwnView,
          set: (on) => ((prefs.farOwnView = on), changed()),
        },
      );
      if (!options.inMatch) {
        items.push(
          { kind: 'heading', id: 'mes-places', text: 'Mes places (pré-remplies dans « Jouer » et en ligne)' },
          {
            kind: 'choice',
            id: 'peripherique',
            label: 'Je joue avec',
            value: prefs.device,
            options: DEVICES.map((d) => ({ value: d, label: CONTROLLER_LABELS[d] })),
            set: (d) => ((prefs.device = d), changed()),
          },
          {
            kind: 'choice',
            id: 'course',
            label: 'Course',
            value: prefs.assist,
            options: ASSIST_LEVELS.map((a) => ({ value: a, label: ASSIST_LABELS[a] })),
            set: (a) => ((prefs.assist = a), changed()),
          },
          {
            kind: 'choice',
            id: 'main',
            label: 'Main',
            value: prefs.hand,
            options: HANDS.map((h) => ({ value: h, label: HAND_LABELS[h] })),
            set: (h) => ((prefs.hand = h), changed()),
          },
        );
      }
      items.push({ kind: 'action', id: 'retour', label: 'Retour', run: () => menu.pop() });
      return items;
    },
  };
}
