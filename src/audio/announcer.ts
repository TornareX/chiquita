import type { PointOutcome, Match } from '../sim/score';
import type { Voice } from './recipes';

/**
 * Arbitre et joueurs qui parlent (étape E7) : annonce du score en espagnol, comme sur le circuit, et « ¡Vamos! » du
 * gagnant d'un grand point. Synthèse vocale du navigateur (voix espagnole si elle existe) : gratuite, mais d'une
 * qualité qui dépend du système. `?voix=0` la coupe.
 */

const SPANISH = ['nada', 'quince', 'treinta', 'cuarenta'] as const;

/**
 * Annonce de l'arbitre après un point, le score du serveur d'abord : « Quince nada », « Treinta iguales », « Iguales »,
 * « Ventaja », « Punto de oro », « Juego », « Juego y set », « Juego, set y partido ». En jeu décisif : « Tres dos ».
 */
export function scoreCall(match: Match, outcome: PointOutcome | null): string | null {
  if (outcome?.match) return 'Juego, set y partido';
  if (outcome?.set) return 'Juego y set';
  if (outcome?.game) return 'Juego';
  const server = match.server;
  const mine = match.points[server];
  const theirs = match.points[server === 0 ? 1 : 0];
  if (match.tiebreak) return `${number(mine)} ${number(theirs)}`;
  if (match.decidingPoint) return 'Punto de oro';
  if (mine >= 3 && theirs >= 3) return mine === theirs ? 'Iguales' : 'Ventaja';
  if (mine === theirs) return `${SPANISH[mine]!} iguales`.replace(/^./, (c) => c.toUpperCase());
  return `${SPANISH[mine]!} ${SPANISH[theirs]!}`.replace(/^./, (c) => c.toUpperCase());
}

const NUMBERS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
function number(n: number): string {
  return NUMBERS[n] ?? String(n);
}

export interface Announcer {
  /** Annonce de l'arbitre, voix posée. */
  score(text: string): void;
  /** Cri d'un joueur. */
  shout(text: string, voice: Voice): void;
}

/** `?voix=0` : pas de voix. */
export function voicesEnabled(): boolean {
  return new URLSearchParams(location.search).get('voix') !== '0';
}

export function createAnnouncer(): Announcer {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  const spanish = (): SpeechSynthesisVoice | null =>
    synth?.getVoices().find((v) => v.lang.toLowerCase().startsWith('es')) ?? null;
  const say = (text: string, pitch: number, rate: number, volume: number, interrupt: boolean): void => {
    if (!synth || !voicesEnabled()) return;
    if (interrupt) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    const voice = spanish();
    if (voice) utterance.voice = voice;
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = volume;
    synth.speak(utterance);
  };
  return {
    score(text): void {
      say(text, 0.95, 1.0, 0.8, false);
    },
    shout(text, voice): void {
      // Le cri passe devant l'annonce en attente.
      say(text, voice.speech, 1.25, 1, true);
    },
  };
}
