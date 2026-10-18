import * as THREE from 'three';
import { OUTLINE } from './character';

/**
 * Personnages en rendu soigné (`research/rendu/POLISH_VISUEL.md`, étape V4), d'après l'ombrage illustré de Team
 * Fortress 2 (Valve, SIGGRAPH 2007) :
 * - ombres teintées : l'aplat d'ombre tire vers un bleu froid au lieu du gris, l'aplat du milieu (la limite
 *   ombre/lumière) gagne un peu de chaleur et de saturation ;
 * - liseré de lumière : un filet clair sur le bord de la silhouette, côté haut (les projecteurs), qui détache le
 *   joueur du fond sombre de la salle ;
 * - contour d'épaisseur constante à l'écran : la coque gonflée de `OUTLINE` s'élargit avec la distance, le joueur
 *   du fond garde le même trait que celui de devant.
 */

/** Teinte de l'aplat d'ombre (multiplie la lumière directe), puis de l'aplat du milieu. [à calibrer] */
const SHADOW_TINT = new THREE.Vector3(0.66, 0.8, 1.25);
const TERMINATOR_TINT = new THREE.Vector3(1.08, 0.98, 0.92);
/** Liseré : couleur, intensité, et largeur (part du bord, de 0 à 1). [à calibrer] */
const RIM_COLOR = new THREE.Color(0xd6e6ff);
const RIM_INTENSITY = 0.45;
const RIM_START = 0.62;
/** Trait du contour, en part de la hauteur de l'écran (~1,6 px à 720 lignes). [à calibrer] */
const OUTLINE_SCREEN = 1.6 / 720;

/** `?toon=0` garde les personnages de V3, pour comparer. */
export function toonLookEnabled(): boolean {
  return new URLSearchParams(location.search).get('toon') !== '0';
}

/** Épaisseur (m) du trait par mètre de distance à la caméra ; mise à jour à chaque image (le champ varie). */
const outlineScale = { value: 0 };
const dressed = new WeakSet<THREE.Material>();

/** Remplace le dégradé à trois aplats par sa version teintée. */
const TINTED_GRADIENT = /* glsl */ `
#ifdef USE_GRADIENTMAP
  uniform sampler2D gradientMap;
#endif
uniform vec3 shadowTint;
uniform vec3 terminatorTint;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  #ifdef USE_GRADIENTMAP
    float g = texture2D( gradientMap, coord ).r;
  #else
    float g = coord.x < 0.7 ? 0.7 : 1.0;
  #endif
  // Aplats 0,35 / 0,67 / 1 : l'ombre prend la teinte froide, le milieu la teinte chaude, la lumière reste blanche.
  vec3 tint = g < 0.5 ? shadowTint : ( g < 0.9 ? terminatorTint : vec3( 1.0 ) );
  return vec3( g ) * tint;
}
`;

function dressToon(material: THREE.MeshToonMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.shadowTint = { value: SHADOW_TINT };
    shader.uniforms.terminatorTint = { value: TERMINATOR_TINT };
    shader.uniforms.rimColor = { value: RIM_COLOR };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', TINTED_GRADIENT)
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <opaque_fragment>',
        `// Liseré : bord de la silhouette tourné vers le haut, en aplat net comme le reste.
        float rimEdge = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
        vec3 upView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        float rim = smoothstep( ${RIM_START.toFixed(2)}, ${(RIM_START + 0.06).toFixed(2)}, rimEdge ) * smoothstep( -0.1, 0.5, dot( normal, upView ) );
        outgoingLight += rimColor * rim * ${RIM_INTENSITY.toFixed(2)};
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'toon-soigne';
  material.needsUpdate = true;
}

function dressOutline(material: THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineScale = outlineScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineScale;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Coque déjà gonflée de OUTLINE : on n'ajoute que ce qui manque pour un trait constant à l'écran.
        float outlineDistance = -( modelViewMatrix * vec4( position, 1.0 ) ).z;
        transformed += normalize( normal ) * max( 0.0, outlineScale * outlineDistance - ${OUTLINE.toFixed(4)} );`,
      );
  };
  material.customProgramCacheKey = () => 'contour-constant';
  material.needsUpdate = true;
}

/** Habille un personnage : aplats teintés et liseré sur ses matériaux toon, trait constant sur son contour. */
export function dressCharacter(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.Material;
    if (dressed.has(material)) return;
    dressed.add(material);
    if (material instanceof THREE.MeshToonMaterial) dressToon(material);
    else if (material instanceof THREE.MeshBasicMaterial && material.name === 'contour') dressOutline(material);
  });
}

/** À appeler avant chaque image : le trait suit le champ de la caméra (dézoom hors du terrain, caméra proche). */
export function updateOutline(camera: THREE.PerspectiveCamera): void {
  outlineScale.value = OUTLINE_SCREEN * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}
