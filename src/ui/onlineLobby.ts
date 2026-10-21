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

  /*
   * Deux écrans en colonnes, comme « Jouer » (`layout: 'columns'`, navigation spatiale). En ligne : son nom et avec
   * quoi on joue en haut, puis deux moitiés, créer une salle à gauche, rejoindre avec un code à droite. Salle : le
   * code en grand en haut à droite, Bleu à gauche et Rouge à droite, le match dessous, « Lancer » en bas à droite.
   */
  const homeScreen: MenuScreen = {
    id: 'en-ligne',
    title: 'Jouer en ligne',
    hint: 'Crée une salle et donne son code à tes amis, ou tape le code d’une salle.',
    layout: 'columns',
    back: () => actions.home(),
    items: () => {
      const items: MenuItem[] = [];
      // Serveur injoignable : « Réessayer » d'abord, il prend le focus.
      if (unreachable) items.push({ kind: 'action', id: 'reessayer', label: 'Réessayer', primary: true, group: 'actions', run: () => actions.retry() });
      items.push(
        { kind: 'text', id: 'nom', label: 'Ton nom', value: name, maxLength: 20, charset: NAME_CHARS, placeholder: 'Joueur', group: 'joueur', set: (v) => (name = v) },
        { ...deviceItem(), group: 'joueur' },
        {
          kind: 'action',
          id: 'creer',
          label: 'Créer une salle',
          hint: 'Tu reçois un code de 4 lettres à donner à tes amis.',
          primary: !unreachable,
          group: 'creer',
          run: () => actions.create(saveName()),
        },
        {
          kind: 'text',
          id: 'code',
          label: 'Code d’une salle',
          value: code,
          maxLength: 4,
          charset: CODE_CHARS,
          placeholder: '____',
          group: 'rejoindre',
          set: (v) => (code = v.toUpperCase()),
          submit: join,
        },
        { kind: 'action', id: 'rejoindre', label: 'Rejoindre', group: 'rejoindre', run: join },
        { kind: 'action', id: 'retour', label: 'Retour à l’accueil', group: 'actions', run: () => actions.home() },
      );
      return items;
    },
  };

  const roomScreen: MenuScreen = {
    id: 'salle',
    title: 'Salle',
    hint: 'Donne ce code à tes amis : ils le tapent dans « Jouer en ligne ». Les places libres sont jouées par l’IA.',
    layout: 'columns',
    back: () => actions.leave(),
    items: () => {
      if (!room) return [];
      const host = room.host === room.you;
      const doubles = room.format === 'double';
      const levelLabel = LEVELS.find((l) => l.value === room!.level)?.label ?? 'IA';
      const seats = doubles ? [0, 2, 1, 3] : [0, 1];
      const items: MenuItem[] = [
        { kind: 'info', id: 'code-salle', text: room.code, tags: ['room-code'], group: 'code' },
        { kind: 'heading', id: 'bleu', text: 'Bleu', tags: ['blue'], group: 'bleu' },
        { kind: 'heading', id: 'rouge', text: 'Rouge', tags: ['red'], group: 'rouge' },
      ];
      // Qui tient la place, en grand ; la place et ce que fait A, dessous.
      for (const i of seats) {
        const holder = room.seats[i] ?? null;
        const member = room.members.find((m) => m.id === holder);
        const mine = holder === room.you;
        const free = holder === null;
        const where = playerName(i, doubles, true);
        const todo = room.playing ? undefined : mine ? 'Laisser à l’IA' : free ? 'Prendre cette place' : undefined;
        items.push({
          kind: 'action',
          id: `place-${i}`,
          label: member ? `${member.name}${mine ? ' (toi)' : ''}` : levelLabel,
          tags: [i % 2 === 0 ? 'blue' : 'red', 'seat', mine ? 'is-mine' : free ? 'is-free' : 'is-taken'],
          hint: todo ? `${where} · ${todo}` : where,
          disabled: room.playing || !(free || mine),
          group: i % 2 === 0 ? 'bleu' : 'rouge',
          run: () => actions.seat(mine ? null : i),
        });
      }
      // Sans place, on regarde le match. Salle pleine : on le dit à qui n'a rien pu prendre.
      const taken = room.seats.slice(0, seats.length);
      const watchers = room.members.filter((m) => !taken.includes(m.id));
      if (watchers.some((m) => m.id === room!.you)) {
        const full = taken.every((holder) => holder !== null);
        items.push({
          kind: 'info',
          id: 'sans-place',
          text: full
            ? 'Salle pleine : toutes les places sont prises, tu regarderas le match.'
            : 'Tu n’as pas de place : prends une place libre, sinon tu regarderas le match.',
          tags: ['notice'],
          group: 'notice',
        });
      } else if (watchers.length > 0) {
        const names = watchers.map((m) => m.name).join(', ');
        items.push({ kind: 'info', id: 'sans-place', text: `Sans place, ${watchers.length > 1 ? 'regardent' : 'regarde'} le match : ${names}.`, tags: ['notice'], group: 'notice' });
      }
      items.push({ kind: 'heading', id: 'match', text: 'Match', group: 'match' }, { ...deviceItem(), group: 'match' });
      if (host && !room.playing) {
        const format = room.format;
        const level = room.level;
        items.push(
          {
            kind: 'choice',
            id: 'format',
            label: 'Format',
            value: format,
            options: [
              { value: 'simple', label: 'Simple (1 contre 1)' },
              { value: 'double', label: 'Double (2 contre 2)' },
            ],
            group: 'match',
            set: (f: DuelFormat) => actions.setup(f, level),
          },
          {
            kind: 'choice',
            id: 'niveau',
            label: 'Niveau de l’IA',
            value: level,
            options: LEVELS,
            group: 'match',
            set: (l: AiLevel) => actions.setup(format, l),
          },
          { kind: 'action', id: 'lancer', label: 'Lancer le match', primary: true, group: 'actions', run: () => actions.start() },
        );
      } else if (!room.playing) {
        const hostName = room.members.find((m) => m.id === room!.host)?.name ?? 'l’hôte';
        items.push({ kind: 'info', id: 'attente', text: `En attente de ${hostName}, qui lance le match.`, tags: ['waiting'], group: 'actions' });
      }
      items.push({ kind: 'action', id: 'quitter-salle', label: 'Quitter la salle', group: 'actions', run: () => actions.leave() });
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
      menu.message(message, 'status');
    },
    unreachable(message): void {
      // Coupé depuis une salle : on dit d'abord que la liaison est perdue.
      const lost = room !== null;
      room = null;
      unreachable = true;
      menu.show(homeScreen);
      menu.message(lost ? `Connexion perdue. ${message}` : message);
    },
    hide(): void {
      menu.hide();
    },
  };
}
