import { describe, expect, it } from 'vitest';
import { Lobby } from '../../src/net/lobby';
import { decodeFrame, type RoomView, type ServerMessage } from '../../src/net/protocol';

/** Un navigateur branché sur le salon : ce qu'il a reçu. */
function member(lobby: Lobby) {
  const received: (ServerMessage | Uint8Array)[] = [];
  const id = lobby.connect((message) => received.push(message));
  const last = <T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined =>
    received.filter((m): m is Extract<ServerMessage, { t: T }> => !(m instanceof Uint8Array) && m.t === t).at(-1);
  return { id, received, last, room: (): RoomView => last('room')!.room };
}

describe('salles privées', () => {
  it('créer, rejoindre avec le code, prendre une place, lancer ; un départ laisse sa place à l’IA', () => {
    let now = 0;
    const lobby = new Lobby(() => now, () => 0.5);
    const host = member(lobby);
    const guest = member(lobby);
    lobby.message(host.id, { t: 'hello', name: 'Xavier', prefs: { assist: 'full', prepMove: 'libre', hand: 'left' } });
    lobby.message(guest.id, { t: 'hello', name: 'Ami', prefs: { assist: 'magnet', prepMove: 'libre', hand: 'right' } });
    lobby.message(host.id, { t: 'create' });
    const code = host.room().code;
    expect(code).toMatch(/^[A-Z]{4}$/);

    // Mauvais code, puis le bon.
    lobby.message(guest.id, { t: 'join', code: 'ZZZZ' });
    expect(guest.last('error')?.message).toContain('Aucune salle');
    lobby.message(guest.id, { t: 'join', code: code.toLowerCase() });
    expect(host.room().seats).toEqual([host.id, guest.id, null, null]);

    // L'invité change de place ; il ne peut pas prendre celle de l'hôte ; seul l'hôte règle et lance.
    lobby.message(guest.id, { t: 'seat', seat: 2 });
    lobby.message(guest.id, { t: 'seat', seat: 0 });
    expect(host.room().seats).toEqual([host.id, null, null, null]);
    lobby.message(guest.id, { t: 'seat', seat: 3 });
    lobby.message(guest.id, { t: 'setup', format: 'simple', level: 'fort' });
    lobby.message(guest.id, { t: 'start' });
    expect(host.room().playing).toBe(false);
    lobby.message(host.id, { t: 'setup', format: 'double', level: 'fort' });
    lobby.message(host.id, { t: 'start' });

    const start = guest.last('start')!;
    expect(start.seats).toEqual([3]);
    expect(host.last('start')!.seats).toEqual([0]);
    expect(start.config.seats.map((s) => (s.kind === 'human' ? s.name : s.level))).toEqual(['Xavier', 'fort', 'fort', 'Ami']);
    expect(start.config.seats[0]).toMatchObject({ assist: 'full', hand: 'left' });

    // Le match tourne à 240 pas par seconde à partir de `startAt`, et chacun reçoit les commandes retenues.
    now = start.startAt + 1000;
    lobby.tick();
    const finals = guest.received.filter((m): m is Uint8Array => m instanceof Uint8Array).map((b) => decodeFrame(b)!);
    // Une seconde de jeu : 240 pas (241 selon l'arrondi de la dernière milliseconde).
    expect(finals.reduce((sum, f) => sum + f.count, 0)).toBeGreaterThanOrEqual(240);
    expect(guest.last('hash')?.tick).toBe(240);

    // Personne ne peut rejoindre un match commencé ; l'invité part, une IA joue sa place, la salle reste à l'hôte.
    const late = member(lobby);
    lobby.message(late.id, { t: 'join', code });
    expect(late.last('error')?.message).toContain('déjà commencé');
    lobby.disconnect(guest.id);
    expect(host.room().seats).toEqual([host.id, null, null, null]);
    now += 1000;
    lobby.tick();
    lobby.disconnect(host.id);
    expect(lobby.roomCount).toBe(0);
  });
});
