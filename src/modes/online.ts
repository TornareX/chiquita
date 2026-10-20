import { Connection, serverUrl } from '../net/connection';
import { TICKS_PER_FRAME } from '../net/fakeNet';
import { SIM_DT } from '../sim/constants';
import { loadSettings } from '../ui/duelSettings';
import { createOnlineLobby } from '../ui/onlineLobby';
import { startDuel } from './duel';

/** Délai d'entrée par défaut (images) et rollback au plus (ms) en ligne. [à juger à la manette] */
const DEFAULT_DELAY_FRAMES = 1;
const DEFAULT_WINDOW_MS = 250;

/**
 * Jeu en ligne (`?enligne`, `research/en-ligne/PLAN_EN_LIGNE.md`, phase 1) : le salon (créer une salle, la rejoindre
 * avec son code, prendre une place), puis le match, joué contre le serveur de jeu (`npm run serveur`). Options d'URL :
 * `&serveur=hote:port` (par défaut cette machine, port 2567), `&delai=1` (images), `&fenetre=250` (ms).
 */
export function startOnline(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const settings = loadSettings(params);
  const prefs = { assist: settings.assists[0], prepMove: settings.prepMove, hand: settings.hands[0] };
  const delayFrames = Math.max(0, Math.min(10, Math.round(Number(params.get('delai') ?? DEFAULT_DELAY_FRAMES)) || 0));
  const windowMs = Math.max(50, Math.min(1000, Number(params.get('fenetre') ?? DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));

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

  const lobby = createOnlineLobby({
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
