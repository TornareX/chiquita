import * as THREE from 'three';

/**
 * La salle en rendu soigné (`research/rendu/POLISH_VISUEL.md`, étape V5), d'après les retransmissions de Premier
 * Padel : une salle sombre aux reflets bleu-violet, un terrain sous des projecteurs qui brillent vraiment.
 * - halos : les quatre projecteurs des montants (modèle du terrain) rayonnent, faute de vrai bloom (V6) ;
 * - faisceaux : un cône de lumière à peine visible sous chaque projecteur, la brume légère d'une salle ;
 * - ambiance : fond et brouillard bleu nuit, tribunes un peu bleutées, sol de la salle sombre et mat (satiné, il
 *   renvoyait presque toute la lumière à la caméra, qui le voit en rasant).
 * Ce qui est plus haut que ~3 m au fond de la salle sort du cadre de la caméra télé : pas de rampes au plafond.
 */

/** Têtes des projecteurs du modèle (`court.glb`, matériau `projecteur_verre`), et le point qu'elles éclairent. */
const LAMPS: readonly { pos: [number, number, number]; aim: [number, number, number] }[] = [-1, 1].flatMap((sx) =>
  [-1, 1].map((sz) => ({ pos: [sx * 4.85, 4.8, sz * 4.95] as [number, number, number], aim: [-sx * 1.5, 0, sz * 6.5] as [number, number, number] })),
);
/** Halo : diamètre (m) et force. [à calibrer] */
const HALO_SIZE = 1.6;
const HALO_OPACITY = 0.85;
const HALO_COLOR = 0xfff1dc;
/** Faisceau : demi-angle d'ouverture et opacité au plus fort (près du projecteur). Très faible : la balle y passe. */
const BEAM_ANGLE = THREE.MathUtils.degToRad(24);
const BEAM_OPACITY = 0.09;
const BEAM_COLOR = 0xdfe9ff;
/** Ambiance de la salle. [à calibrer] */
export const HALL_BACKGROUND = 0x070a18;
const STANDS_COLOR = 0x1c2036;
const FLOOR_COLOR = 0x0c0e17;

/** `?salle=0` garde la salle de V4, pour comparer. */
export function hallEnabled(): boolean {
  return new URLSearchParams(location.search).get('salle') !== '0';
}

/** Tache ronde, claire au centre, nulle au bord. */
function haloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Cône ouvert, sommet en (0, 0, 0), qui descend le long de -Y sur `length` ; `vAlong` va de 0 (sommet) à 1. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(BEAM_COLOR) }, opacity: { value: BEAM_OPACITY } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vFacing;
      void main() {
        vAlong = clamp( -position.y, 0.0, 1.0 );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vec3 n = normalize( normalMatrix * normal );
        vFacing = abs( dot( n, normalize( -mv.xyz ) ) );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying float vAlong;
      varying float vFacing;
      void main() {
        // Plus dense près du projecteur, bords du cône fondus (on regarde à travers la brume, pas une surface).
        float a = opacity * pow( 1.0 - vAlong, 1.6 ) * smoothstep( 0.0, 0.7, vFacing );
        gl_FragColor = vec4( color * a, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

/**
 * Habille la salle : halos et faisceaux des projecteurs ajoutés à `scene`, ambiance appliquée à l'arène (`arena`,
 * ses meshes `sol-salle` et `tribunes`) et au fond. Rien n'est modifié sans arène.
 */
export function dressHall(scene: THREE.Scene, arena: THREE.Object3D): void {
  scene.background = new THREE.Color(HALL_BACKGROUND);
  if (scene.fog instanceof THREE.Fog) scene.fog.color.set(HALL_BACKGROUND);
  arena.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.name === 'tribunes') (node.material as THREE.MeshLambertMaterial).color.set(STANDS_COLOR);
    // Mat : la caméra télé le voit en rasant, et un sol satiné y renvoie presque toute la lumière (Fresnel).
    if (node.name === 'sol-salle') (node.material as THREE.MeshLambertMaterial).color.set(FLOOR_COLOR);
  });

  const halo = new THREE.SpriteMaterial({
    map: haloTexture(),
    color: HALO_COLOR,
    opacity: HALO_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const beam = beamMaterial();
  const up = new THREE.Vector3(0, -1, 0);
  for (const lamp of LAMPS) {
    const pos = new THREE.Vector3(...lamp.pos);
    const sprite = new THREE.Sprite(halo);
    sprite.scale.setScalar(HALO_SIZE);
    // Un peu en avant de la vitre du projecteur, vers le terrain.
    sprite.position.copy(pos).add(new THREE.Vector3(-Math.sign(pos.x) * 0.15, 0, 0));
    sprite.renderOrder = 5;
    scene.add(sprite);

    const aim = new THREE.Vector3(...lamp.aim);
    const length = pos.distanceTo(aim);
    const radius = length * Math.tan(BEAM_ANGLE);
    // Cône unitaire en hauteur, sommet en haut : agrandi à la longueur du faisceau, tourné vers le point visé.
    const geometry = new THREE.ConeGeometry(radius / length, 1, 32, 1, true).translate(0, -0.5, 0);
    const cone = new THREE.Mesh(geometry, beam);
    cone.position.copy(pos);
    cone.scale.set(length, length, length);
    cone.quaternion.setFromUnitVectors(up, aim.clone().sub(pos).normalize());
    cone.renderOrder = 4;
    cone.frustumCulled = false;
    scene.add(cone);
  }
}
