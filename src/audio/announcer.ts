import type { Voice } from './recipes';

/**
 * Joueurs qui parlent (étape E7) : « ¡Vamos! » du gagnant d'un grand point. Synthèse vocale du navigateur (voix
 * espagnole si elle existe) : gratuite, mais d'une qualité qui dépend du système. `?voix=0` la coupe. L'annonce du
 * score par l'arbitre a été retirée à la demande de Xavier.
 */

export interface Announcer {
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
    shout(text, voice): void {
      // Le cri passe devant l'annonce en attente.
      say(text, voice.speech, 1.25, 1, true);
    },
  };
}
