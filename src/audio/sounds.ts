import type { Contact } from '../sim/collisions';
import type { Shot } from '../sim/racket';
import type { BallResult } from '../sim/rules';

export interface Sounds {
  /** À appeler sur un geste de l'utilisateur : les navigateurs bloquent le son avant. */
  unlock(): void;
  contact(contact: Contact): void;
  shot(shot: Shot): void;
  result(result: BallResult): void;
}

/** Sons synthétisés (Web Audio), sans fichier : un timbre distinct par surface. */
export function createSounds(): Sounds {
  let ctx: AudioContext | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  const envelope = (audio: AudioContext, gain: number, duration: number): GainNode => {
    const node = audio.createGain();
    const now = audio.currentTime;
    node.gain.setValueAtTime(gain, now);
    node.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    node.connect(audio.destination);
    return node;
  };

  /** Note brève dont la fréquence glisse de `from` à `to`. */
  const tone = (from: number, to: number, duration: number, gain: number, type: OscillatorType = 'sine'): void => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    osc.connect(envelope(ctx, gain, duration));
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  /** Souffle bref filtré autour de `frequency`. */
  const noise = (frequency: number, q: number, duration: number, gain: number, type: BiquadFilterType = 'bandpass'): void => {
    if (!ctx || !noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter).connect(envelope(ctx, gain, duration));
    source.start();
    source.stop(ctx.currentTime + duration);
  };

  return {
    unlock(): void {
      if (!ctx) {
        ctx = new AudioContext();
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      void ctx.resume();
    },

    contact(contact: Contact): void {
      const volume = Math.min(1, Math.max(0.12, contact.speed / 14));
      switch (contact.surface) {
        case 'ground':
          // Sourd et mat.
          tone(140, 60, 0.1, 0.5 * volume);
          noise(500, 0.7, 0.05, 0.25 * volume, 'lowpass');
          break;
        case 'glass':
          // Claquement sec et clair.
          tone(1150, 820, 0.06, 0.32 * volume, 'triangle');
          noise(2600, 1.5, 0.04, 0.3 * volume);
          break;
        case 'mesh':
          // Cliquetis métallique plus long.
          noise(3600, 3, 0.22, 0.4 * volume);
          tone(620, 410, 0.16, 0.12 * volume, 'square');
          break;
        case 'net':
        case 'tape':
          noise(700, 0.8, 0.14, 0.3 * volume, 'lowpass');
          break;
        case 'out':
          break;
      }
    },

    shot(shot: Shot): void {
      const volume = Math.min(1, 0.35 + shot.speed / 30);
      // Plus le contact est centré, plus le son est plein et aigu ; au bord, il est creux.
      tone(190 + 230 * shot.quality, 120 + 90 * shot.quality, 0.09, 0.55 * volume);
      noise(900 + 1600 * shot.quality, 1, 0.05, 0.35 * volume);
      if (shot.perfect) tone(1480, 1320, 0.14, 0.14, 'triangle');
    },

    result(result: BallResult): void {
      if (result.kind === 'valid') {
        tone(660, 660, 0.12, 0.12, 'triangle');
        setTimeout(() => tone(990, 990, 0.2, 0.12, 'triangle'), 90);
      } else if (result.kind === 'fault') {
        tone(170, 120, 0.25, 0.16, 'sawtooth');
      }
    },
  };
}
