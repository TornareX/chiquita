import { Duel } from '../sim/duel';
import { Match } from '../sim/score';

/**
 * État complet d'une partie mis en texte, pour l'envoyer du serveur à un navigateur (reprise après une coupure,
 * remise d'aplomb d'un joueur qui a divergé), et relu à l'identique : même empreinte (`hash.ts`), même suite du match.
 * Le JSON seul ne suffit pas : il perd les classes (`Duel`, `Match`), les objets partagés (un `prevPos` qui est le même
 * objet que `pos`), `-0`, `±Infinity`, `NaN` et les champs `undefined`. Ici :
 * - un objet de classe porte son nom (`$c`), pris dans `CLASSES` (pas `constructor.name`, que la minification change) ;
 * - un objet vu une deuxième fois devient un renvoi (`$r`) vers le premier (`$i`) ;
 * - les nombres spéciaux et `undefined` sont écrits à part (`$n`, `$u`).
 */

const CLASSES: Record<string, object> = { Duel: Duel.prototype, Match: Match.prototype };
const NAME_OF = new Map<object, string>(Object.entries(CLASSES).map(([name, proto]) => [proto, name]));

type Encoded = null | boolean | number | string | Encoded[] | { [key: string]: Encoded };

function encodeNumber(value: number): Encoded {
  if (Object.is(value, -0)) return { $n: '-0' };
  if (Number.isFinite(value)) return value;
  return { $n: String(value) };
}

export function serializeState(state: unknown): string {
  const ids = new Map<object, number>();
  const encode = (value: unknown): Encoded => {
    if (value === undefined) return { $u: 1 };
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') return encodeNumber(value);
    if (typeof value !== 'object') throw new Error(`état : type non transmissible (${typeof value})`);
    const known = ids.get(value);
    if (known !== undefined) return { $r: known };
    const id = ids.size;
    ids.set(value, id);
    if (Array.isArray(value)) return { $i: id, $a: value.map(encode) };
    if (value instanceof Map || value instanceof Set) throw new Error('état : Map et Set non transmissibles');
    const proto = Object.getPrototypeOf(value) as object;
    const out: { [key: string]: Encoded } = { $i: id };
    if (proto !== Object.prototype) {
      const name = NAME_OF.get(proto);
      if (!name) throw new Error('état : classe inconnue (à ajouter dans CLASSES)');
      out.$c = name;
    }
    const fields: { [key: string]: Encoded } = {};
    for (const key of Object.keys(value)) {
      const field = (value as Record<string, unknown>)[key];
      if (typeof field === 'function') continue;
      fields[key] = encode(field);
    }
    out.$f = fields;
    return out;
  };
  return JSON.stringify(encode(state));
}

export function deserializeState<T>(text: string): T {
  const objects = new Map<number, unknown>();
  const decode = (value: Encoded): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) throw new Error('état : tableau sans identifiant');
    if ('$u' in value) return undefined;
    if ('$n' in value) return value.$n === '-0' ? -0 : Number(value.$n);
    if ('$r' in value) return objects.get(value.$r as number);
    const id = value.$i as number;
    if ('$a' in value) {
      const array: unknown[] = [];
      objects.set(id, array);
      for (const item of value.$a as Encoded[]) array.push(decode(item));
      return array;
    }
    const proto = value.$c === undefined ? Object.prototype : CLASSES[value.$c as string];
    if (!proto) throw new Error(`état : classe inconnue ${String(value.$c)}`);
    const object = Object.create(proto) as Record<string, unknown>;
    objects.set(id, object);
    const fields = value.$f as { [key: string]: Encoded };
    for (const key of Object.keys(fields)) object[key] = decode(fields[key]!);
    return object;
  };
  return decode(JSON.parse(text) as Encoded) as T;
}
