import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Rendu soigné (`research/rendu/POLISH_VISUEL.md`, étape V1) : courbe de tons, exposition et lumière douce
 * d'environnement. `?rendu=simple` garde le rendu d'avant, pour comparer et pour les machines faibles.
 */
export type RenderLook = 'simple' | 'soigne';

export function renderLook(): RenderLook {
  return new URLSearchParams(location.search).get('rendu') === 'simple' ? 'simple' : 'soigne';
}

/**
 * Neutral (Khronos PBR Neutral) garde les teintes : les couleurs d'équipe et la balle restent les mêmes, seuls les
 * très clairs sont adoucis. AgX et ACES, plus « cinéma », décalent les teintes ; `?tons=agx|aces` pour comparer.
 */
const TONE_MAPPINGS: Record<string, THREE.ToneMapping> = {
  neutral: THREE.NeutralToneMapping,
  agx: THREE.AgXToneMapping,
  aces: THREE.ACESFilmicToneMapping,
};
/** [à calibrer en jouant] */
const EXPOSURE = 0.95;
/** Part de la lumière d'environnement : reflets du métal et du verre, sans délaver la salle sombre. [à calibrer] */
const ENVIRONMENT_INTENSITY = 0.35;

export function applyLook(renderer: THREE.WebGLRenderer, scene: THREE.Scene, look: RenderLook): void {
  if (look === 'simple') return;
  renderer.toneMapping = TONE_MAPPINGS[new URLSearchParams(location.search).get('tons') ?? ''] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  // Pièce lumineuse virtuelle, préfloutée selon la rugosité : seuls les matériaux physiques (modèles du terrain,
  // de la balle et de la raquette) la voient ; personnages en aplats et formes simples n'en dépendent pas.
  // Gratuite sur une carte graphique, elle triple le temps d'une image en rendu logiciel : on s'en passe alors.
  if (softwareRendering(renderer)) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  room.dispose();
  pmrem.dispose();
}

/** Navigateur sans accélération graphique (pilote absent, liste noire, Chromium des tests sans écran). */
function softwareRendering(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/**
 * Repères de jeu (anneau de timing, rebond prévu, ombre de balle…) : leur couleur est une information, la courbe de
 * tons et l'exposition ne doivent pas la changer.
 */
export function exactColor<M extends THREE.Material>(material: M): M {
  material.toneMapped = false;
  return material;
}
