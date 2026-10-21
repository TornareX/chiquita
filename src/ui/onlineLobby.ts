import type { AiLevel } from '../sim/bot';
import type { DuelFormat } from '../sim/duel';
import type { RoomView } from '../net/protocol';
import { CONTROLLER_LABELS, DEVICES, playerName, type Device } from './duelSettings';

const NAME_KEY = 'padel.enligne.nom';
const LEVELS: { value: AiLevel; label: string }[] = [
  { value: 'facile', label: 'IA facile' },
  { value: 'normal', label: 'IA normale' },
  { value: 'fort', label: 'IA forte' },
];

const STYLE = `
#online-lobby { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); z-index: 20; }
#online-lobby[hidden] { display: none; }
#online-lobby .panel { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; padding: 18px 20px; border-radius: 12px; background: rgba(12, 18, 26, 0.96); color: #f2f5f7; font: 14px/1.4 system-ui, sans-serif; }
#online-lobby h1 { margin: 0 0 4px; font-size: 20px; }
#online-lobby h2 { margin: 16px 0 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9fb0bf; }
#online-lobby .hint { margin: 4px 0 8px; color: #9fb0bf; font-size: 12px; }
#online-lobby .row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
#online-lobby input, #online-lobby select { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #3a4a58; border-radius: 6px; background: #1c2833; color: inherit; font: inherit; }
#online-lobby input.code { text-transform: uppercase; letter-spacing: 0.3em; font-weight: 700; }
#online-lobby button { padding: 6px 12px; border: 1px solid #3a4a58; border-radius: 6px; background: #1c2833; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
#online-lobby button:hover { background: #26384a; }
#online-lobby button.primary { background: #ffd23f; border-color: #ffd23f; color: #10161d; font-weight: 700; }
#online-lobby button:disabled { opacity: 0.5; cursor: default; }
#online-lobby .room-code { font-size: 34px; font-weight: 800; letter-spacing: 0.25em; text-align: center; margin: 4px 0; }
#online-lobby .seats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; border-radius: 10px; background: #1d4f7a; }
#online-lobby .seats.simple { grid-template-columns: 1fr; }
#online-lobby .seat { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 2px solid #4da3ff; border-radius: 8px; background: rgba(12, 18, 26, 0.88); }
#online-lobby .seat.red { border-color: #ff5a4e; }
#online-lobby .seat .who { font-weight: 600; }
#online-lobby .seat.mine .who::after { content: ' (toi)'; color: #ffd23f; }
#online-lobby .error { min-height: 1.4em; color: #ff8a80; margin-top: 8px; }
`;

export interface LobbyActions {
  /** Périphérique choisi pour jouer sa place (retenu par fenêtre). */
  device(device: Device): void;
  create(name: string): void;
  join(name: string, code: string): void;
  seat(seat: number | null): void;
  setup(format: DuelFormat, level: AiLevel): void;
  start(): void;
}

/**
 * Salon du jeu en ligne (`?enligne`) : son nom, créer une salle ou en rejoindre une avec son code, puis les places
 * (libres = IA), et pour l'hôte, simple ou double, le niveau de l'IA et « Lancer ». Chacun choisit avec quoi il joue
 * (manette ou clavier) : deux fenêtres sur un même PC peuvent prendre deux manettes. À la souris pour l'instant.
 */
export function createOnlineLobby(
  initialDevice: Device,
  actions: LobbyActions,
): {
  show(room: RoomView | null): void;
  error(message: string): void;
  status(message: string): void;
  hide(): void;
} {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'online-lobby';
  const panel = document.createElement('div');
  panel.className = 'panel';
  root.append(panel);
  document.body.append(root);

  let name = '';
  try {
    name = localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    // Stockage indisponible : on redemandera le nom.
  }
  const saveName = (value: string): string => {
    name = value.trim().slice(0, 20) || 'Joueur';
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Sans stockage, le nom ne sera pas retenu.
    }
    return name;
  };
  const errorLine = document.createElement('div');
  errorLine.className = 'error';
  let device = initialDevice;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  /** « Je joue avec » : manettes 1 à 4, clavier bleu ou rouge. */
  const deviceRow = (): HTMLElement => {
    const select = el('select');
    select.id = 'online-device';
    for (const d of DEVICES) select.append(el('option', { value: d, textContent: CONTROLLER_LABELS[d] }));
    select.value = device;
    select.onchange = () => {
      device = select.value as Device;
      actions.device(device);
    };
    return el('div', { className: 'row' }, select);
  };

  const renderHome = (): void => {
    const nameInput = el('input', { value: name, placeholder: 'Ton nom', maxLength: 20 });
    nameInput.id = 'online-name';
    const codeInput = el('input', { placeholder: 'CODE', maxLength: 4, className: 'code' });
    codeInput.id = 'online-code';
    const create = el('button', { className: 'primary', textContent: 'Créer une salle' });
    create.id = 'online-create';
    const join = el('button', { textContent: 'Rejoindre' });
    join.id = 'online-join';
    create.onclick = () => actions.create(saveName(nameInput.value));
    join.onclick = () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length === 4) actions.join(saveName(nameInput.value), code);
      else errorLine.textContent = 'Le code a 4 lettres.';
    };
    codeInput.onkeydown = (event) => {
      if (event.key === 'Enter') join.click();
    };
    panel.replaceChildren(
      el('h1', { textContent: 'Jouer en ligne' }),
      el('p', { className: 'hint', textContent: 'Crée une salle et donne son code à tes amis, ou tape le code d’une salle.' }),
      el('h2', { textContent: 'Ton nom' }),
      el('div', { className: 'row' }, nameInput),
      el('h2', { textContent: 'Je joue avec' }),
      deviceRow(),
      el('h2', { textContent: 'Nouvelle salle' }),
      el('div', { className: 'row' }, create),
      el('h2', { textContent: 'Rejoindre une salle' }),
      el('div', { className: 'row' }, codeInput, join),
      errorLine,
    );
  };

  const renderRoom = (room: RoomView): void => {
    const host = room.host === room.you;
    const doubles = room.format === 'double';
    const seats = el('div', { className: `seats${doubles ? '' : ' simple'}` });
    // Bleus en bas (côté de la caméra), comme dans le menu des réglages : Rouge 2, Rouge 1 / filet / Bleu 2, Bleu 1.
    const order = doubles ? [3, 1, 2, 0] : [1, 0];
    for (const i of order) {
      const holder = room.seats[i] ?? null;
      const member = room.members.find((m) => m.id === holder);
      const mine = holder === room.you;
      const levelLabel = LEVELS.find((l) => l.value === room.level)?.label ?? 'IA';
      const card = el(
        'div',
        { className: `seat ${i % 2 === 0 ? 'blue' : 'red'}${mine ? ' mine' : ''}` },
        el('div', { textContent: playerName(i, doubles) }),
        el('div', { className: 'who', textContent: member ? member.name : levelLabel }),
      );
      card.dataset.seat = String(i);
      if (!room.playing && (holder === null || mine)) {
        const button = el('button', { textContent: mine ? 'Laisser à l’IA' : 'Prendre cette place' });
        button.onclick = () => actions.seat(mine ? null : i);
        card.append(button);
      }
      seats.append(card);
    }
    const children: (Node | string)[] = [
      el('h1', { textContent: 'Salle' }),
      el('div', { className: 'room-code', textContent: room.code }),
      el('p', { className: 'hint', textContent: 'Donne ce code à tes amis. Les places libres sont jouées par l’IA.' }),
      el('h2', { textContent: 'Places' }),
      seats,
      el('h2', { textContent: 'Je joue avec' }),
      deviceRow(),
    ];
    if (host && !room.playing) {
      const format = el('select');
      format.id = 'online-format';
      format.append(el('option', { value: 'simple', textContent: 'Simple (1 contre 1)' }), el('option', { value: 'double', textContent: 'Double (2 contre 2)' }));
      format.value = room.format;
      const level = el('select');
      level.id = 'online-level';
      for (const l of LEVELS) level.append(el('option', { value: l.value, textContent: l.label }));
      level.value = room.level;
      const changed = (): void => actions.setup(format.value as DuelFormat, level.value as AiLevel);
      format.onchange = changed;
      level.onchange = changed;
      const start = el('button', { className: 'primary', textContent: 'Lancer le match' });
      start.id = 'online-start';
      start.onclick = () => actions.start();
      children.push(el('h2', { textContent: 'Match' }), el('div', { className: 'row' }, format, level), el('div', { className: 'row' }, start));
    } else if (!room.playing) {
      const hostName = room.members.find((m) => m.id === room.host)?.name ?? 'l’hôte';
      children.push(el('p', { className: 'hint', textContent: `En attente de ${hostName}, qui lance le match.` }));
    }
    children.push(errorLine);
    panel.replaceChildren(...children);
  };

  renderHome();
  return {
    show(room): void {
      root.hidden = false;
      errorLine.textContent = '';
      if (room) renderRoom(room);
      else renderHome();
    },
    error(message): void {
      errorLine.textContent = message;
    },
    status(message): void {
      errorLine.textContent = message;
    },
    hide(): void {
      root.hidden = true;
    },
  };
}
