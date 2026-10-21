/**
 * Empreinte 32 bits d'un état de simulation (une partie `Duel`, ou tout objet de données) : deux machines qui
 * ont calculé le même match au bit près ont la même empreinte. Les nombres comptent par leurs 64 bits exacts
 * (0 et -0 diffèrent, comme deux flottants qui ne diffèrent qu'au dernier bit) ; les clés sont parcourues
 * triées, l'ordre de création des champs ne compte pas ; les fonctions sont ignorées. Seules les valeurs comptent,
 * pas le partage : un objet référencé deux fois est compté deux fois, par son contenu (le serveur réutilise la commande
 * précédente d'un joueur en retard, un navigateur garde une commande prédite juste ; le match est le même). Les
 * cycles sont marqués et ne bouclent pas.
 */

const view = new DataView(new ArrayBuffer(8));

/** FNV-1a 32 bits, mot par mot. */
class Hasher {
  h = 0x811c9dc5;

  word(value: number): void {
    for (let shift = 0; shift < 32; shift += 8) {
      this.h ^= (value >>> shift) & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
    }
  }

  number(value: number): void {
    view.setFloat64(0, value);
    this.word(view.getUint32(0));
    this.word(view.getUint32(4));
  }

  string(value: string): void {
    this.word(value.length);
    for (let i = 0; i < value.length; i++) this.word(value.charCodeAt(i));
  }
}

const Tag = {
  Undefined: 1,
  Null: 2,
  False: 3,
  True: 4,
  Number: 5,
  String: 6,
  Array: 7,
  Object: 8,
  Map: 9,
  Set: 10,
  Seen: 11,
  BigInt: 12,
} as const;

function walk(value: unknown, out: Hasher, seen: Map<object, number>): void {
  switch (typeof value) {
    case 'undefined':
      out.word(Tag.Undefined);
      return;
    case 'boolean':
      out.word(value ? Tag.True : Tag.False);
      return;
    case 'number':
      out.word(Tag.Number);
      out.number(value);
      return;
    case 'string':
      out.word(Tag.String);
      out.string(value);
      return;
    case 'bigint':
      out.word(Tag.BigInt);
      out.string(value.toString());
      return;
    case 'function':
    case 'symbol':
      return;
  }
  if (value === null) {
    out.word(Tag.Null);
    return;
  }
  const obj = value as object;
  // `seen` : les objets en cours de parcours (les ancêtres). Un cycle est marqué ; un objet simplement partagé est
  // parcouru à chaque fois, par son contenu.
  const depth = seen.get(obj);
  if (depth !== undefined) {
    out.word(Tag.Seen);
    out.word(depth);
    return;
  }
  seen.set(obj, seen.size);
  walkInside(obj, out, seen);
  seen.delete(obj);
}

function walkInside(obj: object, out: Hasher, seen: Map<object, number>): void {
  if (Array.isArray(obj)) {
    out.word(Tag.Array);
    out.word(obj.length);
    for (const item of obj) walk(item, out, seen);
  } else if (obj instanceof Map) {
    out.word(Tag.Map);
    out.word(obj.size);
    for (const [k, v] of obj) {
      walk(k, out, seen);
      walk(v, out, seen);
    }
  } else if (obj instanceof Set) {
    out.word(Tag.Set);
    out.word(obj.size);
    for (const v of obj) walk(v, out, seen);
  } else {
    out.word(Tag.Object);
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => typeof record[key] !== 'function')
      .sort();
    out.word(keys.length);
    for (const key of keys) {
      out.string(key);
      walk(record[key], out, seen);
    }
  }
}

/** Empreinte de `state`, entier non signé sur 32 bits. */
export function hashState(state: unknown): number {
  const out = new Hasher();
  walk(state, out, new Map());
  return out.h >>> 0;
}

/** Empreinte écrite en 8 chiffres hexadécimaux, pour l'affichage et les journaux. */
export function hashHex(state: unknown): string {
  return hashState(state).toString(16).padStart(8, '0');
}
