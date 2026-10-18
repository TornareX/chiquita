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

/** Taille de la carte d'ombre (texels) : ~1,3 cm par texel sur le cône du projecteur. */
const SHADOW_MAP_SIZE = 2048;
/** Flou du bord des ombres (texels) : les projecteurs d'une salle donnent des ombres un peu douces. [à calibrer] */
const SHADOW_RADIUS = 3;

/**
 * Ombres portées (étape V2) : une seule lumière les porte (chaque lumière qui porte une ombre redessine la scène),
 * le projecteur au-dessus du terrain, à la verticale comme dans une vraie salle. Son cône ne couvre que le terrain
 * (20 × 10 m), ce qui garde la carte d'ombre nette. Rien en `?rendu=simple`, ni en rendu logiciel (trop cher).
 * Retourne `true` si les ombres sont actives.
 */
export function enableShadows(renderer: THREE.WebGLRenderer, light: THREE.SpotLight | THREE.DirectionalLight, look: RenderLook): boolean {
  if (look === 'simple' || softwareRendering(renderer) || new URLSearchParams(location.search).get('ombres') === '0') return false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  light.castShadow = true;
  const shadow = light.shadow;
  shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  shadow.radius = SHADOW_RADIUS;
  shadow.bias = -0.0004;
  shadow.normalBias = 0.02;
  if (light instanceof THREE.SpotLight) {
    // Du projecteur (20 m) au sol : rien de plus haut que la structure (4 m) ne porte d'ombre.
    shadow.camera.near = 12;
    shadow.camera.far = 22;
  } else {
    const camera = shadow.camera as THREE.OrthographicCamera;
    camera.left = camera.bottom = -13;
    camera.right = camera.top = 13;
    camera.near = 1;
    camera.far = 40;
  }
  return true;
}

/**
 * Qui porte et qui reçoit une ombre, une fois pour toutes à la création (ou au chargement d'un modèle) :
 * seuls les volumes opaques portent (pas les vitres, le grillage ni la toile du filet, ni les contours des
 * personnages, dessinés de l'intérieur) ; `receive` pour le terrain.
 */
export function setShadows(object: THREE.Object3D, receive: boolean): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material: THREE.Material = Array.isArray(node.material) ? node.material[0] : node.material;
    const opaque = !material.transparent && material.side !== THREE.BackSide;
    node.castShadow = opaque && !(material instanceof THREE.MeshBasicMaterial);
    node.receiveShadow = receive && opaque;
  });
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
