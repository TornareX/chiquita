import { FEEL_PRESETS, sanitizeFeel, type FeelTuning } from '../sim/feel';

const STORAGE_KEY = 'padel-smash.sensations';

/** Réglages de sensation choisis dans le labo, et s'ils valent aussi pour les matchs. */
export interface StoredFeel {
  feel: FeelTuning;
  inMatch: boolean;
}

/** Réglages mémorisés, ou ceux du profil arcade. Le stockage du navigateur peut être indisponible. */
export function loadFeel(): StoredFeel {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredFeel> | null;
    return { feel: sanitizeFeel(raw?.feel, FEEL_PRESETS.arcade.feel), inMatch: raw?.inMatch === true };
  } catch {
    return { feel: { ...FEEL_PRESETS.arcade.feel }, inMatch: false };
  }
}

export function saveFeel(stored: StoredFeel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Stockage indisponible : les réglages valent pour cette session seulement.
  }
}
