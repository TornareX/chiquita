import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ShaderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { TOUCH_SCREEN } from '../input/virtualStick';
import { softwareRendering, type RenderLook } from './look';

/**
 * Post-traitement du rendu soigné (`research/rendu/POLISH_VISUEL.md`, étape V6), avec pmndrs/postprocessing (ses
 * `EffectPass` fusionnent les effets en une passe) et N8AO :
 * - occlusion ambiante : un léger sombre aux contacts (pieds, coins vitre/sol, sous le filet), en demi-résolution ;
 * - bloom à seuil haut : seuls les projecteurs, la bande LED et les éclats brillent vraiment ;
 * - courbe de tons (Neutral, déplacée ici depuis le moteur), léger étalonnage (contraste, saturation), vignette ;
 * - anticrénelage SMAA en fin (le MSAA du moteur ne marche pas avec l'occlusion).
 * Coupé en `?rendu=simple`, en rendu logiciel, par `?postfx=0`, et de lui-même si le jeu rame (qualité automatique).
 */

/** Occlusion : rayon (m), atténuation, force. Discrète : elle ne doit jamais salir la balle ni son ombre. [à calibrer] */
const AO_RADIUS = 0.6;
const AO_FALLOFF = 0.4;
const AO_INTENSITY = 2.2;
/** Bloom : seuil de luminance (linéaire), adoucissement, force, rayon. [à calibrer] */
const BLOOM_THRESHOLD = 4;
const BLOOM_SMOOTHING = 0.25;
const BLOOM_INTENSITY = 0.7;
const BLOOM_RADIUS = 0.6;
/** Étalonnage et vignette. [à calibrer] */
const CONTRAST = 0.03;
const SATURATION = 0;
const VIGNETTE_OFFSET = 0.3;
const VIGNETTE_DARKNESS = 0.35;

/**
 * Vitres : le compositeur mélange les transparents en lumière linéaire, et non plus dans l'espace de l'écran ; à
 * opacité égale, une vitre y paraît bien plus claire (laiteuse). On compense. [à calibrer]
 */
const GLASS_OPACITY = 0.4;

/**
 * Nettoyage avant le bloom : un seul pixel infini ou « pas un nombre » (NaN) dans l'image, venu d'un matériau sous un
 * angle rare, et le flou du bloom l'étale sur tout l'écran pendant une image (flash blanc, reproduit en partie IA
 * contre IA). Les valeurs sont plafonnées et ramenées à 0 au moins : sous Direct3D, `min` et `max` écartent les NaN
 * (isnan, lui, peut disparaître à la compilation).
 */
const SANITIZE_MAX = 64;

function sanitizePass(): ShaderPass {
  const material = new THREE.ShaderMaterial({
    uniforms: { inputBuffer: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D inputBuffer;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(inputBuffer, vUv);
        if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = vec4(max(min(c.rgb, vec3(${SANITIZE_MAX.toFixed(1)})), vec3(0.0)), c.a);
      }`,
    depthWrite: false,
    depthTest: false,
  });
  return new ShaderPass(material, 'inputBuffer');
}

/** Courbe de tons du moteur → la même dans le compositeur. */
const TONE_MODES: Partial<Record<THREE.ToneMapping, ToneMappingMode>> = {
  [THREE.NeutralToneMapping]: ToneMappingMode.NEUTRAL,
  [THREE.AgXToneMapping]: ToneMappingMode.AGX,
  [THREE.ACESFilmicToneMapping]: ToneMappingMode.ACES_FILMIC,
};

/** Vitres du terrain (modèle `vitre`, ou panneaux des formes simples) : opacité compensée, une seule fois. */
export function linearGlass(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.Material;
    const glass = material.name === 'vitre' || (material instanceof THREE.MeshBasicMaterial && material.transparent && !material.map && material.color.getHex() === 0x9fd4ee);
    if (!glass || material.userData.linearGlass) return;
    material.userData.linearGlass = true;
    material.opacity *= GLASS_OPACITY;
  });
}

/** Voulu d'après l'adresse ; à savoir avant de créer le moteur (son MSAA doit alors être coupé). */
export function postfxWanted(look: RenderLook): boolean {
  const postfx = new URLSearchParams(location.search).get('postfx');
  // Téléphone : trop cher (occlusion, bloom), sauf `?postfx=1`.
  return look === 'soigne' && postfx !== '0' && (!TOUCH_SCREEN || postfx === '1');
}

export interface Postfx {
  /** Dessine l'image ; après une coupure (`disabled`), le moteur dessine seul, avec sa courbe de tons d'origine. */
  render(frameTime: number): void;
  setSize(width: number, height: number): void;
  readonly disabled: boolean;
}

/**
 * Qualité automatique : sous `FALLBACK_FPS` en moyenne pendant `FALLBACK_SECONDS` (après `WARMUP` s, le temps que
 * les shaders compilent), le post-traitement se coupe pour la partie. [à calibrer]
 */
const FALLBACK_FPS = 45;
const FALLBACK_SECONDS = 3;
const WARMUP = 2;

/** Le compositeur, ou `null` en rendu logiciel (trop cher : chaque passe redessine tout l'écran). */
export function createPostfx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Postfx | null {
  if (softwareRendering(renderer)) return null;
  const tone = TONE_MODES[renderer.toneMapping] ?? ToneMappingMode.NEUTRAL;
  // Les matériaux rendent en lumière linéaire dans un tampon flottant ; la courbe de tons vient à la fin (l'exposition
  // du moteur reste lue par l'effet).
  const engineToneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());
  const ao = new N8AOPostPass(scene, camera, size.x, size.y);
  ao.setQualityMode('Performance');
  Object.assign(ao.configuration, {
    aoRadius: AO_RADIUS,
    distanceFalloff: AO_FALLOFF,
    intensity: AO_INTENSITY,
    halfRes: true,
    gammaCorrection: false,
  });
  composer.addPass(ao);
  composer.addPass(sanitizePass());

  composer.addPass(
    new EffectPass(
      camera,
      new BloomEffect({
        luminanceThreshold: BLOOM_THRESHOLD,
        luminanceSmoothing: BLOOM_SMOOTHING,
        intensity: BLOOM_INTENSITY,
        radius: BLOOM_RADIUS,
        mipmapBlur: true,
      }),
      new ToneMappingEffect({ mode: tone }),
      new BrightnessContrastEffect({ contrast: CONTRAST }),
      new HueSaturationEffect({ saturation: SATURATION }),
      new VignetteEffect({ offset: VIGNETTE_OFFSET, darkness: VIGNETTE_DARKNESS }),
    ),
  );
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })));

  let disabled = false;
  let age = 0;
  let slowTime = 0;
  let averageFrame = 1 / 60;
  return {
    get disabled() {
      return disabled;
    },
    render(frameTime) {
      // Onglet caché ou image figée (chargement, onglet qui revient) : rien à juger.
      if (!disabled && frameTime < 0.25 && !document.hidden) {
        age += frameTime;
        averageFrame += (frameTime - averageFrame) * 0.1;
        slowTime = age > WARMUP && averageFrame > 1 / FALLBACK_FPS ? slowTime + frameTime : 0;
        if (slowTime > FALLBACK_SECONDS) {
          disabled = true;
          renderer.toneMapping = engineToneMapping;
          console.info(`Post-traitement coupé : ${(1 / averageFrame).toFixed(0)} i/s en moyenne.`);
        }
      }
      if (disabled) renderer.render(scene, camera);
      else composer.render(frameTime);
    },
    setSize(width, height) {
      composer.setSize(width, height, false);
    },
  };
}
