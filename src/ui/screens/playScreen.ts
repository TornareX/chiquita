import { connectedGamepads } from '../../input/gamepad';
import { KEY_LAYOUTS, layoutKeys } from '../../input/keyboardArcade';
import { ASSIST_LEVELS } from '../../sim/duel';
import { HANDS } from '../../sim/shots';
import { ASSIST_LABELS, CONTROLLER_LABELS, HAND_LABELS, playerName } from '../duelSettings';
import type { Menu, MenuItem, MenuScreen } from '../menu';
import { assignController, CONTROLLERS, isHuman, padOf, type Controller, type MatchSetup, type Preferences } from '../settingsStore';

/** Bouton Start (Menu) : il n'allume pas de place. */
const START_BUTTON = 9;
/** Pression des balles proposée : sans, légère, normale, forte. */
const PRESSURES = [0, 0.5, 1, 1.5] as const;
const pressureLabel = (p: number): string => (p === 0 ? 'Aucune' : p < 1 ? 'Légère' : p === 1 ? 'Normale' : 'Forte');

/**
 * Écran « Jouer » (match local) : simple ou double, qui tient chaque place (manette, clavier ou IA) avec sa course et
 * sa main, et les règles du match. `launch` reçoit la configuration choisie (enregistrée, puis la page se recharge
 * avec son adresse). Appuyer sur un bouton d'une manette ou une touche d'un clavier allume la place qu'il joue.
 */
export function playScreen(menu: Menu, setup: MatchSetup, prefs: Preferences, launch: (setup: MatchSetup) => void): MenuScreen {
  const { match } = setup;
  const placeOrder = (): number[] => (match.doubles ? [0, 2, 1, 3] : [0, 1]);
  const changed = (): void => menu.refresh();

  /** Allume les places jouées par ce contrôleur. */
  const light = (controller: Controller): void => {
    placeOrder().forEach((i) => {
      if (setup.players[i] === controller) menu.flash(`place-${i}`);
    });
  };
  window.addEventListener('keydown', (event) => {
    if (menu.screen?.id !== 'jouer') return;
    KEY_LAYOUTS.forEach((layout, k) => {
      if (layoutKeys(layout).includes(event.code)) light(k === 0 ? 'clavier1' : 'clavier2');
    });
  });
  /** Boutons tenus à l'image précédente, par manette, et nombre de manettes (une manette se réveille à son premier bouton). */
  let held: boolean[] = [];

  const place = (i: number): MenuItem[] => {
    const controller = setup.players[i]!;
    const team = i % 2 === 0 ? 'blue' : 'red';
    const pads = connectedGamepads();
    const items: MenuItem[] = [
      {
        kind: 'choice',
        id: `place-${i}`,
        label: playerName(i, match.doubles, true),
        tags: [team],
        value: controller,
        options: CONTROLLERS.map((c) => {
          const pad = padOf(c);
          return { value: c, label: CONTROLLER_LABELS[c] + (pad !== null && !pads[pad] ? ' (pas branchée)' : '') };
        }),
        set: (c: Controller) => {
          const wasHuman = isHuman(setup.players[i]!);
          assignController(setup.players, i, c);
          // Une place qui devient humaine prend les préférences du joueur.
          if (isHuman(c) && !wasHuman) {
            setup.assists[i] = prefs.assist;
            setup.hands[i] = prefs.hand;
          }
          changed();
        },
      },
    ];
    if (isHuman(controller)) {
      items.push({
        kind: 'choice',
        id: `place-${i}-course`,
        label: 'Course',
        tags: [team, 'sub'],
        value: setup.assists[i],
        options: ASSIST_LEVELS.map((a) => ({ value: a, label: ASSIST_LABELS[a] })),
        set: (a) => (setup.assists[i] = a),
      });
    }
    items.push({
      kind: 'choice',
      id: `place-${i}-main`,
      label: 'Main',
      tags: [team, 'sub'],
      value: setup.hands[i],
      options: HANDS.map((h) => ({ value: h, label: HAND_LABELS[h] })),
      set: (h) => (setup.hands[i] = h),
    });
    return items;
  };

  return {
    id: 'jouer',
    title: 'Jouer',
    hint: 'Appuie sur un bouton d’une manette ou une touche d’un clavier : sa place s’allume.',
    items: () => {
      const pads = connectedGamepads();
      const items: MenuItem[] = [
        {
          kind: 'choice',
          id: 'format',
          label: 'Format',
          value: match.doubles,
          options: [
            { value: false, label: 'Simple (1 contre 1)' },
            { value: true, label: 'Double (2 contre 2)' },
          ],
          set: (doubles: boolean) => {
            match.doubles = doubles;
            changed();
          },
        },
        { kind: 'heading', id: 'places', text: 'Places' },
        ...placeOrder().flatMap(place),
        {
          kind: 'info',
          id: 'manettes',
          tags: ['pads'],
          text: pads.length
            ? pads.map((pad, n) => `Manette ${n + 1} : ${pad.id.replace(/\s*\(.*$/, '')}`).join(' · ')
            : 'Aucune manette détectée : appuie sur un de ses boutons pour la réveiller.',
        },
        { kind: 'heading', id: 'regles', text: 'Règles' },
        {
          kind: 'toggle',
          id: 'libre',
          label: 'Échange libre, sans score',
          value: match.free,
          set: (free) => {
            match.free = free;
            changed();
          },
        },
      ];
      if (!match.free) {
        const games = [...new Set([2, 4, 6, match.gamesPerSet])].sort((a, b) => a - b);
        items.push(
          {
            kind: 'choice',
            id: 'sets',
            label: 'Sets',
            value: match.setsToWin,
            options: [
              { value: 1, label: 'Un set' },
              { value: 2, label: 'Deux sets gagnants' },
            ],
            set: (n: number) => (match.setsToWin = n),
          },
          {
            kind: 'choice',
            id: 'jeux',
            label: 'Jeux par set',
            value: match.gamesPerSet,
            options: games.map((n) => ({ value: n, label: String(n) })),
            set: (n: number) => (match.gamesPerSet = n),
          },
          {
            kind: 'toggle',
            id: 'punto',
            label: 'Punto de oro (point décisif à 40-40)',
            value: match.goldenPoint,
            set: (on) => (match.goldenPoint = on),
          },
        );
      }
      const pressures = [...new Set([...PRESSURES, setup.pressure])].sort((a, b) => a - b);
      items.push(
        {
          kind: 'choice',
          id: 'pression',
          label: 'Pression des balles',
          hint: 'Vertes, jaunes, rouges : la balle difficile se joue plus vite.',
          value: setup.pressure,
          options: pressures.map((p) => ({ value: p, label: pressureLabel(p) })),
          set: (p: number) => (setup.pressure = p),
        },
        { kind: 'action', id: 'lancer', label: 'Lancer le match', primary: true, run: () => launch(setup) },
        { kind: 'action', id: 'retour', label: 'Retour', run: () => menu.pop() },
      );
      return items;
    },
    tick: () => {
      const pads = connectedGamepads();
      if (pads.length !== held.length) changed();
      const now = pads.map((pad) => pad.buttons.some((b, n) => n !== START_BUTTON && b.pressed));
      now.forEach((pressed, n) => {
        if (pressed && !held[n]) light(`manette${n + 1}` as Controller);
      });
      held = now;
    },
  };
}
