import * as THREE from 'three';

/**
 * Matière du terrain en rendu soigné (`research/rendu/POLISH_VISUEL.md`, étape V3), d'après la surface officielle
 * de Premier Padel (Premier Supercourt X3 de Mondo) : fibres texturées, peu de sable visible, d'où l'aspect d'une
 * moquette veloutée d'un bleu vif et uniforme, un peu plus claire vue de biais (le fond du terrain à la télé).
 * - couleur : le bleu vif du circuit, le grain de la texture du modèle ne gardant que ses nuances de clarté ;
 * - velours : le « sheen » des matériaux physiques, fait pour les tissus, éclaircit les fibres en vue rasante.
 */

/** Bleu du tapis (albédo). [à calibrer] */
const CARPET_COLOR = 0x00349c;
/** Part du grain de la texture gardée (0 = uni, 1 = tel quel) : de près, les fibres ; de loin, un bleu uni. */
const GRAIN = 1.1;
/** Clarté moyenne (linéaire) de la texture du modèle (`ground_dif.jpg`, moyenne sRGB 49, 70, 103). */
const TEXTURE_LUMINANCE = 0.06;
/** Velours : reflet clair des fibres vues de biais. [à calibrer] */
const SHEEN = 0.7;
const SHEEN_COLOR = 0x1a66ff;
const SHEEN_ROUGHNESS = 0.55;
/** Reflet spéculaire (vernis) : presque rien sur un tissu, sinon un voile blanc grise le bleu en vue rasante. */
const SPECULAR = 0.15;
/**
 * Grains de silice : de près, de petits points clairs entre les fibres (photos de courts) ; ils naissent des grains
 * les plus clairs de la texture, donc s'effacent avec ses mipmaps au loin, sans scintiller.
 */
const SAND_SPECK = 0.45;
const SAND_COLOR = new THREE.Color(0xd8dde6);
/** Lignes : bandes de gazon blanc, nettes. */
const LINE_COLOR = 0xf7f8fb;

/** `?gazon=0` garde le sol de V2, pour comparer. */
export function turfEnabled(): boolean {
  return new URLSearchParams(location.search).get('gazon') !== '0';
}

/** Le tapis : remplace le matériau du sol (formes simples ou modèle), en gardant sa texture pour le grain. */
function carpet(from: THREE.Material): THREE.MeshPhysicalMaterial {
  const map = 'map' in from && from.map instanceof THREE.Texture ? from.map : null;
  const material = new THREE.MeshPhysicalMaterial({
    name: 'tapis',
    color: CARPET_COLOR,
    map,
    roughness: 0.95,
    metalness: 0,
    sheen: SHEEN,
    sheenColor: SHEEN_COLOR,
    sheenRoughness: SHEEN_ROUGHNESS,
    specularIntensity: SPECULAR,
  });
  if (map) {
    // La texture du modèle est d'un bleu marine terne : on n'en garde que la clarté relative (le grain), adoucie.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.sandColor = { value: SAND_COLOR };
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sandColor;').replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 carpetTexel = texture2D(map, vMapUv);
          float carpetGrain = dot(carpetTexel.rgb, vec3(0.2126, 0.7152, 0.0722)) / ${TEXTURE_LUMINANCE.toFixed(3)};
          diffuseColor.rgb *= mix(1.0, carpetGrain, ${GRAIN.toFixed(2)});
          diffuseColor.rgb = mix(diffuseColor.rgb, sandColor, smoothstep(1.2, 1.6, carpetGrain) * ${SAND_SPECK.toFixed(2)});
        #endif`,
      );
    };
    material.customProgramCacheKey = () => 'tapis';
  }
  return material;
}

const lineMaterial = new THREE.MeshStandardMaterial({ name: 'ligne', color: LINE_COLOR, roughness: 0.8 });

/**
 * Habille le terrain (formes simples ou modèle chargé) : le sol (`sol` du modèle, `gazon` des formes) devient le
 * tapis ; les lignes (`ligne`) passent en matière éclairée, qui reçoit les ombres sans en porter.
 */
export function dressCourt(court: THREE.Object3D): void {
  court.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.name === 'ligne') {
      node.material = lineMaterial;
      node.userData.flat = true;
      return;
    }
    const material = node.material as THREE.Material;
    if (material.name === 'sol' || (node.name === 'gazon' && material.name !== 'tapis')) node.material = carpet(material);
  });
}
