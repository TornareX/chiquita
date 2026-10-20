import { createServer } from 'node:http';
import { WebSocketServer, type RawData } from 'ws';
import { Lobby } from '../src/net/lobby';
import type { ClientMessage } from '../src/net/protocol';

/**
 * Serveur de jeu en ligne (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 1) : salles privées à code, commandes relayées,
 * match recalculé ici. Toute la logique est dans `src/net/lobby.ts` et `src/net/matchServer.ts` ; ce fichier ne fait
 * que brancher les WebSockets. Lancer : `npm run serveur` (port 2567, ou `PORT=…`).
 */

const PORT = Number(process.env.PORT ?? 2567);
/** Fréquence de la boucle du serveur (ms) : il retient les pas dus et les envoie. */
const LOOP_MS = 4;

const lobby = new Lobby(() => performance.now());

const http = createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(`Padel Smash, serveur de jeu en ligne : ${lobby.roomCount} salle(s) ouverte(s).\n`);
});

const sockets = new WebSocketServer({ server: http });
sockets.on('connection', (socket) => {
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
    try {
      lobby.message(id, JSON.parse(data.toString()) as ClientMessage);
    } catch {
      // Message illisible : ignoré.
    }
  });
  socket.on('close', () => lobby.disconnect(id));
});

setInterval(() => lobby.tick(), LOOP_MS);

http.listen(PORT, () => {
  console.log(`Serveur Padel Smash en ligne : ws://localhost:${PORT}`);
});
