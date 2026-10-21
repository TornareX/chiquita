import { Connection, serverUrl } from '../net/connection';
import { TICKS_PER_FRAME } from '../net/fakeNet';
import { SIM_DT } from '../sim/constants';
import { DEVICES, loadPreferences, type Device } from '../ui/settingsStore';
import { createOnlineLobby, savedName } from '../ui/onlineLobby';
import { startDuel } from './duel';

/** Délai d'entrée par défaut (images) et rollback au plus (ms) en ligne. [à juger à la manette] */
const DEFAULT_DELAY_FRAMES = 1;
const DEFAULT_WINDOW_MS = 250;
/** Périphérique choisi dans cette fenêtre (`sessionStorage` : une fenêtre à côté peut en prendre un autre). */
const DEVICE_KEY = 'padel.enligne.peripherique';

/**
 * Avec quoi ce navigateur joue sa place : `&manette=2` (1 à 4) ou `&clavier=1` (bleu) / `2` (rouge) dans l'adresse,
 * sinon le dernier choix fait dans cette fenêtre, sinon « je joue avec » des préférences.
 */
function initialDevice(params: URLSearchParams, fallback: Device): Device {
  const pad = Number(params.get('manette'));
  if (pad >= 1 && pad <= 4) return `manette${pad}` as Device;
  const keys = Number(params.get('clavier'));
  if (keys === 1 || keys === 2) return `clavier${keys}` as Device;
  try {
    const saved = sessionStorage.getItem(DEVICE_KEY);
    if (saved && (DEVICES as readonly string[]).includes(saved)) return saved as Device;
  } catch {
    // Stockage indisponible : le réglage par défaut.
  }
  return fallback;
}

/**
 * Jeu en ligne (`?enligne`, `research/en-ligne/PLAN_EN_LIGNE.md`, phase 1) : le salon (créer une salle, la rejoindre
 * avec son code, prendre une place), puis le match, joué contre le serveur de jeu (`npm run serveur`). Options d'URL :
 * `&serveur=hote:port` (par défaut cette machine, port 2567), `&delai=1` (images), `&fenetre=250` (ms), `&manette=2` ou
 * `&clavier=1` (avec quoi on joue, aussi au choix dans le salon ; utile pour deux fenêtres sur un même PC).
 *
 * La liaison s'ouvre dès le chargement : une fenêtre rechargée pendant son match (ou revenue après une coupure) reprend
 * sa place directement, le serveur la lui a gardée.
 */
export function startOnline(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const preferences = loadPreferences();
  const prefs = { assist: preferences.assist, prepMove: preferences.prepMove, hand: preferences.hand };
  const delayFrames = Math.max(0, Math.min(10, Math.round(Number(params.get('delai') ?? DEFAULT_DELAY_FRAMES)) || 0));
  const windowMs = Math.max(50, Math.min(1000, Number(params.get('fenetre') ?? DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));
  let device = initialDevice(params, preferences.device);
  const url = serverUrl(params);
  const banner = createBanner();

  let started = false;
  let connection: Connection | null = null;
  /** Ouvre la liaison (sauf si elle l'est déjà). */
  const connect = (): Connection => {
    if (connection) return connection;
    const c = new Connection(url, savedName() || 'Joueur', prefs, {
      room: (room) => {
        if (!started) lobby.show(room);
      },
      start: ({ config, startAt, seats, state }) => {
        if (started) return;
        started = true;
        lobby.hide();
        startDuel(canvas, {
          config,
          startAt,
          seats,
          connection: c,
          device,
          inputDelay: delayFrames * TICKS_PER_FRAME,
          maxRollback: Math.round(windowMs / 1000 / SIM_DT),
          ...(state ? { state } : {}),
        });
      },
      error: (message) => lobby.error(message),
      closed: () => {
        connection = null;
        lobby.unreachable(`Serveur introuvable (${url}). Est-il lancé (npm run serveur) ?`);
      },
      reconnecting: () => banner.show('Connexion perdue, reconnexion…'),
      reconnected: () => banner.hide(),
    });
    connection = c;
    return c;
  };
  /** Exécute `then` dès que la liaison est ouverte. */
  const whenOpen = (then: (c: Connection) => void): void => {
    const c = connect();
    if (c.open) return then(c);
    lobby.status('Connexion au serveur…');
    const wait = window.setInterval(() => {
      if (connection !== c) return window.clearInterval(wait);
      if (!c.open) return;
      window.clearInterval(wait);
      then(c);
    }, 20);
  };

  const lobby = createOnlineLobby(device, {
    device: (chosen) => {
      device = chosen;
      try {
        sessionStorage.setItem(DEVICE_KEY, chosen);
      } catch {
        // Sans stockage, le choix vaut jusqu'au rechargement.
      }
    },
    create: (name) =>
      whenOpen((c) => {
        c.hello(name);
        c.send({ t: 'create' });
      }),
    join: (name, code) =>
      whenOpen((c) => {
        c.hello(name);
        c.send({ t: 'join', code });
      }),
    seat: (seat) => connection?.send({ t: 'seat', seat }),
    setup: (format, level) => connection?.send({ t: 'setup', format, level }),
    start: () => connection?.send({ t: 'start' }),
    leave: () => {
      void connection?.leave();
      lobby.show(null);
    },
    retry: () => whenOpen(() => lobby.show(null)),
    home: () => {
      void (connection?.leave() ?? Promise.resolve()).then(() => (location.href = '/'));
    },
  });
  lobby.show(null);
  // Tout de suite : si cette fenêtre jouait un match (rechargée, coupée), le serveur lui rend sa place.
  connect();
}

/** Bandeau au milieu de l'écran (liaison perdue pendant le match) ; apparence dans `menu.css` (`#online-banner`). */
function createBanner(): { show(text: string): void; hide(): void } {
  const banner = document.createElement('div');
  banner.id = 'online-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  document.body.append(banner);
  return {
    show(text): void {
      banner.textContent = text;
      banner.hidden = false;
    },
    hide(): void {
      banner.hidden = true;
    },
  };
}
