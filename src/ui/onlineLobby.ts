import type { AiLevel } from '../sim/bot';
import type { DuelFormat } from '../sim/duel';
import type { RoomView } from '../net/protocol';
import { CONTROLLER_LABELS, DEVICES, playerName, type Device } from './duelSettings';
import { createMenu, type MenuItem, type MenuScreen } from './menu';

const NAME_KEY = 'padel.enligne.nom';
const LEVELS: { value: AiLevel; label: string }[] = [
  { value: 'facile', label: 'IA facile' },
  { value: 'normal', label: 'IA normale' },
  { value: 'fort', label: 'IA forte' },
];
/** Lettres d'un nom, et d'un code de salle (sans I ni O, comme le serveur), proposées à la manette. */
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Nom retenu dans ce navigateur (ou une chaîne vide). */
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export interface LobbyActions {
  /** Périphérique choisi pour jouer sa place (retenu par fenêtre). */
  device(device: Device): void;
  create(name: string): void;
  join(name: string, code: string): void;
  seat(seat: number | null): void;
  setup(format: DuelFormat, level: AiLevel): void;
  start(): void;
  /** Quitter la salle (avant le match). */
  leave(): void;
  /** Serveur injoignable : réessayer de s'y connecter. */
  retry(): void;
  /** Retour à l'accueil du jeu. */
  home(): void;
}

/**
 * Salon du jeu en ligne (`?enligne`), sur le menu commun (manette, clavier, souris) : son nom, avec quoi on joue,
 * créer une salle ou en rejoindre une avec son code ; puis les places (libres = IA), et pour l'hôte, simple ou double,
 * le niveau de l'IA et « Lancer ». Deux fenêtres sur un même PC peuvent prendre deux manettes.
 */
export function createOnlineLobby(
  initialDevice: Device,
  actions: LobbyActions,
): {
  show(room: RoomView | null): void;
  error(message: string): void;
  status(message: string): void;
  /** Serveur injoignable : le message, et « Réessayer ». */
  unreachable(message: string): void;
  hide(): void;
} {
  const menu = createMenu({ id: 'online-lobby', overlay: 'opaque' });
  let name = savedName();
  let code = '';
  let device = initialDevice;
  let room: RoomView | null = null;
  let unreachable = false;

  const saveName = (): string => {
    name = name.trim().slice(0, 20) || 'Joueur';
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Sans stockage, le nom ne sera pas retenu.
    }
    return name;
  };
  const join = (): void => {
    const clean = code.trim().toUpperCase();
    if (clean.length === 4) actions.join(saveName(), clean);
    else menu.message('Le code a 4 lettres.');
  };

  /** « Je joue avec » : manettes 1 à 4, clavier bleu ou rouge. */
  const deviceItem = (): MenuItem => ({
    kind: 'choice',
    id: 'peripherique',
    label: 'Je joue avec',
    value: device,
    options: DEVICES.map((d) => ({ value: d, label: CONTROLLER_LABELS[d] })),
    set: (d: Device) => {
      device = d;
      actions.device(d);
    },
  });

  const homeScreen: MenuScreen = {
    id: 'en-ligne',
    title: 'Jouer en ligne',
    hint: 'Crée une salle et donne son code à tes amis, ou tape le code d’une salle.',
    back: () => actions.home(),
    items: () => {
      const items: MenuItem[] = [
        { kind: 'text', id: 'nom', label: 'Ton nom', value: name, maxLength: 20, charset: NAME_CHARS, placeholder: 'Ton nom', set: (v) => (name = v) },
        deviceItem(),
        { kind: 'action', id: 'creer', label: 'Créer une salle', primary: true, run: () => actions.create(saveName()) },
        {
          kind: 'text',
          id: 'code',
          label: 'Code d’une salle',
          value: code,
          maxLength: 4,
          charset: CODE_CHARS,
          placeholder: 'CODE',
          set: (v) => (code = v.toUpperCase()),
          submit: join,
        },
        { kind: 'action', id: 'rejoindre', label: 'Rejoindre', run: join },
      ];
      if (unreachable) items.push({ kind: 'action', id: 'reessayer', label: 'Réessayer', run: () => actions.retry() });
      items.push({ kind: 'action', id: 'retour', label: 'Retour à l’accueil', run: () => actions.home() });
      return items;
    },
  };

  const roomScreen: MenuScreen = {
    id: 'salle',
    title: 'Salle',
    back: () => actions.leave(),
    items: () => {
      if (!room) return [];
      const host = room.host === room.you;
      const doubles = room.format === 'double';
      const levelLabel = LEVELS.find((l) => l.value === room!.level)?.label ?? 'IA';
      const items: MenuItem[] = [
        { kind: 'info', id: 'code-salle', text: room.code, tags: ['room-code'] },
        { kind: 'info', id: 'aide', text: 'Donne ce code à tes amis. Les places libres sont jouées par l’IA.' },
        { kind: 'heading', id: 'places', text: 'Places' },
      ];
      // Bleus d'abord (côté de la caméra), comme dans « Jouer ».
      for (const i of doubles ? [0, 2, 1, 3] : [0, 1]) {
        const holder = room.seats[i] ?? null;
        const member = room.members.find((m) => m.id === holder);
        const mine = holder === room.you;
        const free = holder === null;
        const who = member ? `${member.name}${mine ? ' (toi)' : ''}` : levelLabel;
        items.push({
          kind: 'action',
          id: `place-${i}`,
          label: `${playerName(i, doubles)} : ${who}`,
          tags: [i % 2 === 0 ? 'blue' : 'red', ...(mine ? ['is-mine'] : [])],
          hint: room.playing ? undefined : mine ? 'Laisser à l’IA' : free ? 'Prendre cette place' : undefined,
          disabled: room.playing || !(free || mine),
          run: () => actions.seat(mine ? null : i),
        });
      }
      items.push(deviceItem());
      if (host && !room.playing) {
        const format = room.format;
        const level = room.level;
        items.push(
          { kind: 'heading', id: 'match', text: 'Match' },
          {
            kind: 'choice',
            id: 'format',
            label: 'Format',
            value: format,
            options: [
              { value: 'simple', label: 'Simple (1 contre 1)' },
              { value: 'double', label: 'Double (2 contre 2)' },
            ],
            set: (f: DuelFormat) => actions.setup(f, level),
          },
          {
            kind: 'choice',
            id: 'niveau',
            label: 'Niveau de l’IA',
            value: level,
            options: LEVELS,
            set: (l: AiLevel) => actions.setup(format, l),
          },
          { kind: 'action', id: 'lancer', label: 'Lancer le match', primary: true, run: () => actions.start() },
        );
      } else if (!room.playing) {
        const hostName = room.members.find((m) => m.id === room!.host)?.name ?? 'l’hôte';
        items.push({ kind: 'info', id: 'attente', text: `En attente de ${hostName}, qui lance le match.` });
      }
      items.push({ kind: 'action', id: 'quitter-salle', label: 'Quitter la salle', run: () => actions.leave() });
      return items;
    },
  };

  return {
    show(next): void {
      const wasRoom = room !== null;
      room = next;
      unreachable = false;
      const screen = next ? roomScreen : homeScreen;
      // Même écran (la salle a changé) : on relit ses entrées sans perdre le focus.
      if (menu.isOpen && menu.screen === screen && wasRoom === (next !== null)) menu.refresh();
      else menu.show(screen);
    },
    error(message): void {
      menu.message(message);
    },
    status(message): void {
      menu.message(message);
    },
    unreachable(message): void {
      room = null;
      unreachable = true;
      menu.show(homeScreen);
      menu.message(message);
    },
    hide(): void {
      menu.hide();
    },
  };
}
