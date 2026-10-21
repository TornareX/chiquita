import { Connection, serverUrl } from '../net/connection';
import { TICKS_PER_FRAME } from '../net/fakeNet';
import { SIM_DT } from '../sim/constants';
import { DEVICES, isHuman, loadSettings, type Device } from '../ui/duelSettings';
import { createOnlineLobby } from '../ui/onlineLobby';
import { startDuel } from './duel';

/** Délai d'entrée par défaut (images) et rollback au plus (ms) en ligne. [à juger à la manette] */
const DEFAULT_DELAY_FRAMES = 1;
const DEFAULT_WINDOW_MS = 250;
/** Périphérique choisi dans cette fenêtre (`sessionStorage` : une fenêtre à côté peut en prendre un autre). */
const DEVICE_KEY = 'padel.enligne.peripherique';

/**
 * Avec quoi ce navigateur joue sa place : `&manette=2` (1 à 4) ou `&clavier=1` (bleu) / `2` (rouge) dans l'adresse,
 * sinon le dernier choix fait dans cette fenêtre, sinon le premier périphérique humain des réglages.
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
 */
export function startOnline(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const settings = loadSettings(params);
  const prefs = { assist: settings.assists[0], prepMove: settings.prepMove, hand: settings.hands[0] };
  const delayFrames = Math.max(0, Math.min(10, Math.round(Number(params.get('delai') ?? DEFAULT_DELAY_FRAMES)) || 0));
  const windowMs = Math.max(50, Math.min(1000, Number(params.get('fenetre') ?? DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));
  let device = initialDevice(params, settings.players.find(isHuman) ?? 'manette1');

  let connection: Connection | null = null;
  let started = false;
  /** Se connecte (une fois), puis exécute `then` dès que la liaison est ouverte. */
  const connect = (name: string, then: (c: Connection) => void): void => {
    if (connection?.open) {
      connection.send({ t: 'hello', name, prefs });
      then(connection);
      return;
    }
    lobby.status('Connexion au serveur…');
    const url = serverUrl(params);
    const c = new Connection(url, name, prefs, {
      room: (room) => {
        if (!started) lobby.show(room);
      },
      start: ({ config, startAt, seats }) => {
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
        });
      },
      error: (message) => lobby.error(message),
      closed: () => {
        connection = null;
        if (started) {
          showLost();
          return;
        }
        lobby.show(null);
        lobby.error(`Impossible de joindre le serveur (${url}). Est-il lancé (npm run serveur) ?`);
      },
    });
    connection = c;
    // La liaison s'ouvre de façon asynchrone : on attend qu'elle le soit.
    const wait = window.setInterval(() => {
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
    create: (name) => connect(name, (c) => c.send({ t: 'create' })),
    join: (name, code) => connect(name, (c) => c.send({ t: 'join', code })),
    seat: (seat) => connection?.send({ t: 'seat', seat }),
    setup: (format, level) => connection?.send({ t: 'setup', format, level }),
    start: () => connection?.send({ t: 'start' }),
  });
  lobby.show(null);
}

/** Liaison perdue pendant le match : un bandeau, la partie s'arrête là (la reconnexion viendra plus tard). */
function showLost(): void {
  const banner = document.createElement('div');
  banner.id = 'online-lost';
  banner.textContent = 'Connexion au serveur perdue.';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '12px 20px',
    font: '600 18px system-ui, sans-serif',
    color: '#fff',
    background: 'rgba(10,16,24,0.85)',
    borderRadius: '8px',
    zIndex: '30',
  });
  document.body.append(banner);
}
