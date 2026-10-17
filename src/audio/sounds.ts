import type { Contact } from '../sim/collisions';
import type { BallResult } from '../sim/rules';
import { contactRecipe, shotRecipe, type CrowdReaction, type Layer, type ShotSound, type SoundRecipe } from './recipes';

export interface Sounds {
  /** À appeler sur un geste de l'utilisateur : les navigateurs bloquent le son avant. */
  unlock(): void;
  contact(contact: Contact): void;
  shot(shot: ShotSound): void;
  result(result: BallResult): void;
  /** Réaction du public : murmure qui monte (`ooh`), clameur (`cheer`) ou applaudissements. */
  crowd(reaction: CrowdReaction): void;
}

/** Générateur pseudo-aléatoire à graine fixe : les tampons de bruit sont les mêmes à chaque partie. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Réponse impulsionnelle d'une salle couverte : quelques premières réflexions, puis une queue de 1,4 s. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const random = lcg(17 + channel);
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (random() * 2 - 1) * Math.exp(-t * 4.2) * 0.5;
    }
    for (const [time, gain] of [[0.011, 0.7], [0.023, 0.5], [0.052, 0.3]] as const) {
      const at = Math.round((time + channel * 0.003) * ctx.sampleRate);
      data[at] = (data[at] ?? 0) + gain;
    }
  }
  return buffer;
}

/**
 * Applaudissements : environ 70 spectateurs qui tapent chacun 4 à 6 fois par seconde, avec des
 * claquements brefs d'intensité et de couleur variées. Stéréo : chaque spectateur a sa place.
 */
function applauseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 3;
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const random = lcg(4242);
  const clapLength = Math.round(ctx.sampleRate * 0.018);
  for (let person = 0; person < 70; person++) {
    const place = random();
    const rate = 4 + random() * 2;
    const loudness = 0.25 + random() * 0.75;
    const brightness = 0.3 + random() * 0.6; // part de bruit non lissé : claquement plus ou moins sec
    let time = random() / rate;
    while (time < seconds) {
      const start = Math.round(time * ctx.sampleRate);
      const gain = loudness * (0.6 + random() * 0.4);
      let smooth = 0;
      for (let i = 0; i < clapLength && start + i < length; i++) {
        const white = random() * 2 - 1;
        smooth += (white - smooth) * (1 - brightness);
        const sample = smooth * gain * Math.exp(-i / (clapLength / 4));
        left[start + i]! += sample * (1 - place);
        right[start + i]! += sample * place;
      }
      time += (1 / rate) * (0.85 + random() * 0.3);
    }
  }
  return buffer;
}

/**
 * Sons synthétisés (Web Audio), sans fichier : voir `recipes.ts` pour le timbre de chaque surface.
 * `createContext` permet de rendre les sons hors ligne (OfflineAudioContext) pour les écouter ou les mesurer.
 */
export function createSounds(createContext: () => BaseAudioContext = () => new AudioContext()): Sounds {
  let ctx: BaseAudioContext | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let applause: AudioBuffer | null = null;
  /** Entrée du mixage (compresseur), départ vers la réverbération et vers l'écho des vitres. */
  let dry: AudioNode | null = null;
  let wet: AudioNode | null = null;
  let echo: AudioNode | null = null;

  const setup = (audio: BaseAudioContext): void => {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    const random = lcg(1);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    applause = applauseBuffer(audio);

    const master = audio.createGain();
    master.gain.value = 2.2;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.15;
    compressor.connect(master).connect(audio.destination);
    const reverb = audio.createConvolver();
    reverb.buffer = roomImpulse(audio);
    reverb.connect(compressor);
    // Écho des vitres : deux retours nets à 38 et 45 ms, un peu assourdis, bien audibles sur les vidéos
    // de volées en salle (gardés plus discrets : l'original a trop d'écho).
    const echoIn = audio.createBiquadFilter();
    echoIn.type = 'lowpass';
    echoIn.frequency.value = 2500;
    for (const [time, gain] of [[0.038, 0.32], [0.045, 0.22]] as const) {
      const delay = audio.createDelay(0.1);
      delay.delayTime.value = time;
      const level = audio.createGain();
      level.gain.value = gain;
      echoIn.connect(delay).connect(level).connect(compressor);
      level.connect(reverb);
    }
    dry = compressor;
    wet = reverb;
    echo = echoIn;
  };

  /** Enveloppe d'une couche : montée `attack`, puis extinction exponentielle jusqu'à `end`. */
  const envelope = (audio: BaseAudioContext, start: number, attack: number, end: number, gain: number): GainNode => {
    const node = audio.createGain();
    node.gain.setValueAtTime(attack > 0 ? 0.0001 : gain, start);
    if (attack > 0) node.gain.exponentialRampToValueAtTime(gain, start + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, end);
    return node;
  };

  const playLayer = (audio: BaseAudioContext, layer: Layer, bus: AudioNode): void => {
    const start = audio.currentTime + (layer.delay ?? 0);
    const attack = layer.attack ?? 0;
    const end = start + attack + layer.duration;
    if (layer.gain <= 0.0002) return;
    let source: AudioScheduledSourceNode;
    let head: AudioNode;
    if (layer.type === 'tone') {
      const osc = audio.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.from, start);
      osc.frequency.exponentialRampToValueAtTime(layer.to, end);
      source = head = osc;
    } else {
      if (!noiseBuffer) return;
      const noise = audio.createBufferSource();
      noise.buffer = noiseBuffer;
      // Chaque couche lit le bruit à partir d'un point différent, dérivé de sa fréquence.
      const offset = (layer.frequency * 0.000137) % 0.5;
      const filter = audio.createBiquadFilter();
      filter.type = layer.filter;
      filter.Q.value = layer.q;
      filter.frequency.setValueAtTime(layer.frequency, start);
      if (layer.frequencyTo) filter.frequency.exponentialRampToValueAtTime(layer.frequencyTo, end);
      noise.connect(filter);
      noise.start(start, offset);
      source = noise;
      head = filter;
    }
    const amp = envelope(audio, start, attack, end, layer.gain);
    head.connect(amp);
    let tail: AudioNode = amp;
    let lfo: OscillatorNode | null = null;
    if (layer.tremolo) {
      const { rate, depth } = layer.tremolo;
      const trem = audio.createGain();
      trem.gain.value = 1 - depth / 2;
      lfo = audio.createOscillator();
      lfo.frequency.value = rate;
      const lfoDepth = audio.createGain();
      lfoDepth.gain.value = depth / 2;
      lfo.connect(lfoDepth).connect(trem.gain);
      lfo.start(start);
      lfo.stop(end);
      amp.connect(trem);
      tail = trem;
    }
    tail.connect(bus);
    if (layer.type === 'tone') source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      tail.disconnect();
      amp.disconnect();
    };
  };

  const play = (recipe: SoundRecipe | null): void => {
    if (!ctx || !dry || !wet || !recipe || ctx.state === 'closed') return;
    const audio = ctx;
    const bus = audio.createGain();
    const panner = audio.createStereoPanner();
    panner.pan.value = recipe.pan;
    bus.connect(panner).connect(dry);
    const send = audio.createGain();
    send.gain.value = recipe.reverb;
    panner.connect(send).connect(wet);
    if (echo) send.connect(echo);
    for (const layer of recipe.layers) playLayer(audio, layer, bus);
    const longest = Math.max(...recipe.layers.map((l) => (l.delay ?? 0) + (l.attack ?? 0) + l.duration));
    setTimeout(() => {
      bus.disconnect();
      panner.disconnect();
      send.disconnect();
    }, (longest + 0.2) * 1000);
  };

  /** Une note brève, pour les signaux de l'entraîneur. */
  const beep = (from: number, to: number, duration: number, gain: number, wave: OscillatorType): void =>
    play({ pan: 0, reverb: 0.05, layers: [{ type: 'tone', wave, from, to, duration, gain }] });

  /**
   * Voix du public : une douzaine de voix en dents de scie, désaccordées, passées dans deux formants
   * de voyelle (« oh » qui s'ouvre en « ah » pour la clameur). Le murmure reste sous les applaudissements.
   */
  const voices = (audio: BaseAudioContext, start: number, length: number, gain: number, cheer: boolean): void => {
    if (!dry || !wet) return;
    const random = lcg(cheer ? 99 : 7);
    const out = audio.createGain();
    out.gain.setValueAtTime(0.0001, start);
    out.gain.exponentialRampToValueAtTime(gain, start + (cheer ? 0.18 : 0.35));
    out.gain.setTargetAtTime(0.0001, start + length * 0.45, length * 0.22);
    const formants = cheer
      ? [[600, 760, 4], [1000, 1180, 5]]
      : [[380, 430, 5], [800, 850, 6]];
    for (const [from, to, q] of formants) {
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = q!;
      filter.frequency.setValueAtTime(from!, start);
      filter.frequency.linearRampToValueAtTime(to!, start + length * 0.5);
      filter.connect(out);
      for (let i = 0; i < 12; i++) {
        const osc = audio.createOscillator();
        osc.type = 'sawtooth';
        const base = 130 + random() * 230;
        osc.frequency.setValueAtTime(base * (cheer ? 0.9 : 0.95), start);
        osc.frequency.linearRampToValueAtTime(base * (cheer ? 1.12 : 1.05), start + length * 0.4);
        const vibrato = audio.createOscillator();
        vibrato.frequency.value = 4 + random() * 3;
        const vibratoDepth = audio.createGain();
        vibratoDepth.gain.value = base * 0.02;
        vibrato.connect(vibratoDepth).connect(osc.frequency);
        const level = audio.createGain();
        level.gain.value = 0.3 + random() * 0.7;
        osc.connect(level).connect(filter);
        osc.start(start + random() * 0.15);
        vibrato.start(start);
        osc.stop(start + length);
        vibrato.stop(start + length);
      }
    }
    const panner = audio.createStereoPanner();
    panner.pan.value = 0;
    out.connect(panner).connect(dry);
    const send = audio.createGain();
    send.gain.value = 0.7;
    panner.connect(send).connect(wet);
    setTimeout(() => {
      out.disconnect();
      panner.disconnect();
      send.disconnect();
    }, (length + 0.3) * 1000);
  };

  return {
    unlock(): void {
      if (!ctx) {
        ctx = createContext();
        setup(ctx);
      }
      if (ctx instanceof AudioContext) void ctx.resume();
    },

    contact(contact: Contact): void {
      play(contactRecipe(contact));
    },

    shot(shot: ShotSound): void {
      play(shotRecipe(shot));
    },

    result(result: BallResult): void {
      if (result.kind === 'valid') {
        beep(660, 660, 0.12, 0.12, 'triangle');
        setTimeout(() => beep(990, 990, 0.2, 0.12, 'triangle'), 90);
      } else if (result.kind === 'fault') {
        beep(170, 120, 0.25, 0.16, 'sawtooth');
      }
    },

    crowd(reaction: CrowdReaction): void {
      if (!ctx || !dry || !wet || !applause || ctx.state === 'closed') return;
      const audio = ctx;
      const start = audio.currentTime + 0.12;
      const { intensity } = reaction;
      if (reaction.kind === 'ooh') {
        voices(audio, audio.currentTime, 1.1, 0.03 * intensity, false);
        return;
      }
      if (reaction.kind === 'cheer') voices(audio, start, 1.8, 0.008 * intensity, true);
      // Applaudissements : montée rapide, tenue, puis extinction sur la fin du tampon.
      const length = reaction.kind === 'cheer' ? 2.8 : 1.6 + intensity;
      const claps = audio.createBufferSource();
      claps.buffer = applause;
      const highpass = audio.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 450;
      const color = audio.createBiquadFilter();
      color.type = 'peaking';
      color.frequency.value = 1900;
      color.gain.value = 5;
      const level = audio.createGain();
      const peak = 0.13 * intensity;
      level.gain.setValueAtTime(0.0001, start);
      level.gain.exponentialRampToValueAtTime(peak, start + 0.25);
      level.gain.setValueAtTime(peak, start + length * 0.4);
      level.gain.exponentialRampToValueAtTime(0.0001, start + length);
      claps.connect(highpass).connect(color).connect(level).connect(dry);
      const send = audio.createGain();
      send.gain.value = 0.5;
      level.connect(send).connect(wet);
      claps.start(start);
      claps.stop(start + length);
      claps.onended = () => {
        level.disconnect();
        send.disconnect();
      };
    },
  };
}
