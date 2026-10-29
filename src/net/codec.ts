import type { ArcadeCommands, ShotKind, SwingEnd } from '../sim/commands';

/**
 * Commandes arrondies et encodées en binaire (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 0) : le stick tient sur
 * un octet signé par axe (-127..127), les boutons sur deux octets. Toutes les machines calculent ainsi avec
 * exactement les mêmes valeurs, et une commande voyage en 4 octets.
 */
export const COMMAND_BYTES = 4;

/** Pas du stick : un axe vaut un entier de -127 à 127, divisé par 127. */
const STICK_STEPS = 127;

const SHOTS: readonly (ShotKind | null)[] = [null, 'normal', 'slice', 'lob', 'overhead'];
const ENDS: readonly (SwingEnd | undefined)[] = [undefined, 'straight', 'arc', 'letGo'];
const CALLS: readonly (ArcadeCommands['call'] | undefined)[] = [undefined, 'mia', 'tuya'];

/** Axe du stick en entier de -127 à 127 (`| 0` : jamais de -0). */
function stickByte(value: number): number {
  const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return Math.round(v * STICK_STEPS) | 0;
}

/** Écrit `commands` sur 4 octets à partir de `offset` dans `out` (créé s'il manque). */
export function encodeCommands(commands: ArcadeCommands, out = new Uint8Array(COMMAND_BYTES), offset = 0): Uint8Array {
  out[offset] = stickByte(commands.stick.forward) & 0xff;
  out[offset + 1] = stickByte(commands.stick.right) & 0xff;
  const { swing } = commands;
  // Octet 2 : coup (3 bits), geste présent, préparé, fin du geste (2 bits).
  let buttons = Math.max(0, SHOTS.indexOf(commands.shot));
  if (swing) buttons |= 1 << 3;
  if (swing?.prepared) buttons |= 1 << 4;
  buttons |= Math.max(0, ENDS.indexOf(swing?.end)) << 5;
  out[offset + 2] = buttons;
  // Octet 3 : contre-vitre (absente, non, oui) et annonce au partenaire.
  const wall = swing?.wall === undefined ? 0 : swing.wall ? 2 : 1;
  out[offset + 3] = wall | (Math.max(0, CALLS.indexOf(commands.call)) << 2);
  return out;
}

/** Relit des commandes écrites par `encodeCommands`. */
export function decodeCommands(data: Uint8Array, offset = 0): ArcadeCommands {
  // -128 n'est jamais écrit : lu d'un client modifié, il vaut -127 (un stick ne dépasse pas 1).
  const signed = (byte: number): number => Math.max(-STICK_STEPS, (byte << 24) >> 24) / STICK_STEPS;
  const buttons = data[offset + 2]!;
  const extra = data[offset + 3]!;
  const commands: ArcadeCommands = {
    stick: { forward: signed(data[offset]!), right: signed(data[offset + 1]!) },
    shot: SHOTS[buttons & 0b111] ?? null,
  };
  if (buttons & (1 << 3)) {
    const swing: NonNullable<ArcadeCommands['swing']> = { prepared: (buttons & (1 << 4)) !== 0 };
    const end = ENDS[(buttons >> 5) & 0b11];
    if (end) swing.end = end;
    const wall = extra & 0b11;
    if (wall) swing.wall = wall === 2;
    commands.swing = swing;
  }
  const call = CALLS[(extra >> 2) & 0b11];
  if (call) commands.call = call;
  return commands;
}

/** Commandes telles que la simulation les verra une fois passées par le réseau : stick arrondi au 1/127. */
export function quantizeCommands(commands: ArcadeCommands): ArcadeCommands {
  return decodeCommands(encodeCommands(commands));
}

/** Mêmes commandes, au bit près une fois encodées. */
export function sameCommands(a: ArcadeCommands, b: ArcadeCommands): boolean {
  const x = encodeCommands(a);
  const y = encodeCommands(b);
  for (let i = 0; i < COMMAND_BYTES; i++) if (x[i] !== y[i]) return false;
  return true;
}
