import { createServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type RawData } from 'ws';
import { Lobby } from '../src/net/lobby';
import type { ClientMessage } from '../src/net/protocol';
import { gameVersion } from '../src/net/version';

/**
 * Serveur de jeu en ligne (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 1) : salles privées à code, commandes relayées,
 * match recalculé ici. Toute la logique est dans `src/net/lobby.ts` et `src/net/matchServer.ts` ; ce fichier ne fait
 * que brancher les WebSockets. Lancer : `npm run serveur` (port 2567, ou `PORT=…`).
 *
 * Sur Internet (`render.yaml`, `research/en-ligne/HEBERGEMENT_GRATUIT.md`) : `ORIGINES` liste les pages autorisées à
 * se connecter (ex. `https://tornarex.github.io`) ; sans elle, tout le monde (en local).
 */

const PORT = Number(process.env.PORT ?? 2567);
/**
 * Fréquence de la boucle du serveur (ms) : il retient les pas dus et les envoie. 16 ms : quatre fois moins de messages
 * qu'à 4 ms (bande passante d'un hébergement gratuit), et un peu plus de temps aux commandes pour arriver.
 * [à juger à la manette : `BOUCLE_MS=4` pour comparer]
 */
const LOOP_MS = Number(process.env.BOUCLE_MS ?? 16);
/** Pages autorisées à ouvrir un WebSocket (`Origin`), séparées par des virgules ; vide : toutes. */
const ORIGINS = (process.env.ORIGINES ?? '').split(',').map((o) => o.trim()).filter(Boolean);
/** Au plus ce nombre de connexions en tout, et par adresse IP : un serveur public ne doit pas se laisser remplir. */
const MAX_CONNECTIONS = 200;
const MAX_PER_ADDRESS = 8;
/** Plus gros message accepté (octets) : les nôtres font quelques centaines d'octets. */
const MAX_PAYLOAD = 64 * 1024;
/** Le retard de la boucle est retenu sur cette durée (ms), pour voir les à-coups d'un CPU partagé. */
const LATENESS_WINDOW = 60_000;

const version = gameVersion();
const lobby = new Lobby(() => performance.now(), Math.random, version);
const started = Date.now();

/** Retard maximal de la boucle sur la dernière minute (ms) : un CPU gratuit à 0,1 cœur peut geler le serveur. */
const lateness: { at: number; ms: number }[] = [];
function worstLateness(): number {
  return lateness.reduce((worst, l) => Math.max(worst, l.ms), 0);
}

const http = createServer((_, response) => {
  // Lu par le jeu pour réveiller le serveur (`wakeServer`) : JSON, ouvert à toutes les pages.
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  response.end(
    JSON.stringify({
      jeu: 'Padel Smash',
      version,
      salles: lobby.roomCount,
      connexions: sockets.clients.size,
      retardBoucleMaxMs: Math.round(worstLateness()),
      allumeDepuisS: Math.round((Date.now() - started) / 1000),
    }),
  );
});

/** Adresse du joueur : celle que donne l'hébergeur (`x-forwarded-for`), sinon celle de la connexion. */
function addressOf(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || request.socket.remoteAddress || '?';
}

const perAddress = new Map<string, number>();
const sockets = new WebSocketServer({
  server: http,
  maxPayload: MAX_PAYLOAD,
  verifyClient: ({ origin, req }, done) => {
    if (ORIGINS.length > 0 && !ORIGINS.includes(origin)) return done(false, 403, 'Origine refusée');
    if (sockets.clients.size >= MAX_CONNECTIONS) return done(false, 503, 'Serveur plein');
    if ((perAddress.get(addressOf(req)) ?? 0) >= MAX_PER_ADDRESS) return done(false, 429, 'Trop de connexions');
    done(true);
  },
});
sockets.on('connection', (socket, request) => {
  const address = addressOf(request);
  perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
  // Pas d'attente de Nagle : les commandes partent tout de suite.
  (socket as unknown as { _socket?: { setNoDelay?(on: boolean): void } })._socket?.setNoDelay?.(true);
  const id = lobby.connect((message) => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(message instanceof Uint8Array ? message : JSON.stringify(message));
  });
  socket.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      lobby.binary(id, new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
      return;
    }
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      // Message illisible : ignoré.
      return;
    }
    try {
      lobby.message(id, message);
    } catch (error) {
      // Une erreur du serveur ne doit pas passer inaperçue (ni le faire tomber).
      console.error(`Erreur sur le message « ${message.t} » :`, error);
    }
  });
  socket.on('close', () => {
    lobby.disconnect(id);
    const left = (perAddress.get(address) ?? 1) - 1;
    if (left > 0) perAddress.set(address, left);
    else perAddress.delete(address);
  });
});

let expected = performance.now() + LOOP_MS;
setInterval(() => {
  const now = performance.now();
  lateness.push({ at: now, ms: Math.max(0, now - expected) });
  while (lateness[0]!.at < now - LATENESS_WINDOW) lateness.shift();
  expected = now + LOOP_MS;
  lobby.tick();
}, LOOP_MS);

http.listen(PORT, () => {
  console.log(`Serveur Padel Smash en ligne : ws://localhost:${PORT} (version ${version}, boucle ${LOOP_MS} ms)`);
  if (ORIGINS.length > 0) console.log(`Pages autorisées : ${ORIGINS.join(', ')}`);
});
