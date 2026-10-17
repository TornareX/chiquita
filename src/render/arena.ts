import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CrowdReaction } from '../audio/recipes';
import { HALF_LENGTH, HALF_WIDTH, RUNOFF_BACK, RUNOFF_SIDE } from '../sim/constants';

/**
 * Arène et public (GAME_DESIGN.md §9, étape E6), d'après les images de grands tournois envoyées par Xavier : terrain
 * très éclairé au milieu d'une salle sombre, sol noir autour, panneaux LED bleus sur le devant des tribunes,
 * tribunes raides et pleines dans la pénombre. Rien dans la zone où le joueur peut sortir par la porte. Rendu seulement, piloté par les réactions du public
 * (`stepCrowdReactions`, les mêmes que le son).
 *
 * Coût : tribunes en un maillage, foule en deux maillages instanciés (corps, têtes) animés dans le shader, flashs
 * de téléphones en un nuage de points, panneaux en quelques plans : une dizaine d'appels de dessin en tout.
 */

/** `?arene=0` : terrain seul, sans tribunes ni public. */
export function arenaEnabled(): boolean {
  return new URLSearchParams(location.search).get('arene') !== '0';
}

/** Une tribune : origine au pied du premier rang, `along` le long du terrain, `out` en s'éloignant du terrain. */
export interface Stand {
  origin: readonly [number, number];
  along: readonly [number, number];
  out: readonly [number, number];
  length: number;
}

/** Rangs par tribune, profondeur et hauteur d'une marche, hauteur du muret de devant (m), place par spectateur. */
export const ROWS = 12;
export const ROW_DEPTH = 0.85;
export const ROW_RISE = 0.5;
export const FRONT_HEIGHT = 1.0;
export const SEAT_WIDTH = 0.55;
/** Part des places occupées. */
export const FILL = 0.88;

/** Écart entre la zone où le joueur peut sortir (`RUNOFF_SIDE`, `RUNOFF_BACK`) et le muret des tribunes (m). */
const STAND_GAP = 0.6;
const SIDE_X = HALF_WIDTH + RUNOFF_SIDE + STAND_GAP;
const FAR_Z = HALF_LENGTH + RUNOFF_BACK + STAND_GAP;

/**
 * Tribunes derrière le fond lointain et des deux côtés (celle derrière la caméra ne se voit pas), juste au-delà de la
 * zone praticable dehors : toute la place des sorties par la porte reste libre. Raides : avec le téléobjectif de la
 * caméra télé, seuls les premiers rangs entrent dans l'image.
 */
export const STANDS: readonly Stand[] = [
  { origin: [0, FAR_Z], along: [1, 0], out: [0, 1], length: 2 * SIDE_X },
  { origin: [SIDE_X, 0], along: [0, 1], out: [1, 0], length: 2 * FAR_Z },
  { origin: [-SIDE_X, 0], along: [0, -1], out: [-1, 0], length: 2 * FAR_Z },
];

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Rotation pour regarder le terrain (rad). */
  yaw: number;
  /** Position le long de la tribune, de 0 à 1 (la ola s'y propage), et un tirage propre au spectateur, de 0 à 1. */
  wave: number;
  seed: number;
}

/** Générateur à graine fixe : la même foule à chaque partie. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Places occupées de toutes les tribunes : déterministe, `FILL` des places. */
export function crowdSeats(stands: readonly Stand[] = STANDS, seed = 7): Seat[] {
  const random = lcg(seed);
  const seats: Seat[] = [];
  for (const stand of stands) {
    const perRow = Math.floor(stand.length / SEAT_WIDTH);
    const yaw = Math.atan2(-stand.out[0], -stand.out[1]);
    for (let row = 0; row < ROWS; row++) {
      for (let i = 0; i < perRow; i++) {
        if (random() > FILL) continue;
        const u = (i + 0.5) * SEAT_WIDTH - stand.length / 2 + (random() - 0.5) * 0.08;
        const v = (row + 0.5) * ROW_DEPTH;
        seats.push({
          x: stand.origin[0] + stand.along[0] * u + stand.out[0] * v,
          y: FRONT_HEIGHT + row * ROW_RISE,
          z: stand.origin[1] + stand.along[1] * u + stand.out[1] * v,
          yaw,
          wave: (u + stand.length / 2) / stand.length,
          seed: random(),
        });
      }
    }
  }
  return seats;
}

/**
 * Humeur du public, de 0 à 1 : `jump` (debout, sauts et ola, sur une clameur), `stir` (agitation, applaudissements
 * et souffle retenu), `flash` (flashs de téléphones). Monte d'un coup sur une réaction, retombe ensuite.
 */
export class CrowdMood {
  jump = 0;
  stir = 0;
  flash = 0;

  react(reaction: CrowdReaction): void {
    const i = reaction.intensity;
    if (reaction.kind === 'cheer') {
      this.jump = Math.max(this.jump, i);
      this.flash = Math.max(this.flash, i);
      this.stir = Math.max(this.stir, 1);
    } else if (reaction.kind === 'applause') {
      this.jump = Math.max(this.jump, 0.35 * i);
      this.stir = Math.max(this.stir, i);
      this.flash = Math.max(this.flash, 0.3 * i);
    } else {
      this.stir = Math.max(this.stir, 0.6 * i);
    }
  }

  /** `dt` : temps réel écoulé (s). La clameur tient ~2 s, l'agitation ~3 s, les flashs ~1,5 s. */
  update(dt: number): void {
    this.jump *= Math.exp(-dt / 1.1);
    this.stir *= Math.exp(-dt / 1.6);
    this.flash *= Math.exp(-dt / 0.8);
  }
}

/** Couleurs de maillots du public : variées, un peu ternes pour ne pas voler la vedette aux joueurs. */
const SHIRTS = [0x2a3f6e, 0x6e2a2a, 0xd8d8d8, 0x2b2b2b, 0x3d6e3a, 0xb38a2e, 0x5a3d78, 0x1f5f73, 0x8a4b2a, 0xe0e0e0, 0x6b7d99];
const SKINS = [0xf1c9a5, 0xe0ac7e, 0xb57a52, 0x8d5a3b, 0x5f3a24];

/** Texte des panneaux LED : des noms inventés, aucune vraie marque. */
const LED_TEXT = 'PADEL SMASH   ·   ¡VAMOS!   ·   COPA CANAPÉ   ·   ';
const LED_BLUE = '#1b34c9';

/** Texte du panneau, écrit une fois sur toute la largeur de la texture : elle se répète sans raccord visible. */
function ledTexture(text: string, background: string, color: string): THREE.CanvasTexture {
  const font = 'bold 40px system-ui, sans-serif';
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (measure) measure.font = font;
  canvas.width = Math.ceil(measure?.measureText(text).width ?? 1024);
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = background;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = color;
    g.font = font;
    g.textBaseline = 'middle';
    g.fillText(text, 0, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Marches d'une tribune et son muret, en une géométrie. */
function standGeometry(stand: Stand): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const yaw = Math.atan2(stand.out[0], stand.out[1]);
  const place = (geometry: THREE.BufferGeometry, v: number, y: number): void => {
    geometry.rotateY(yaw);
    geometry.translate(stand.origin[0] + stand.out[0] * v, y, stand.origin[1] + stand.out[1] * v);
    parts.push(geometry);
  };
  for (let row = 0; row < ROWS; row++) {
    const top = FRONT_HEIGHT + row * ROW_RISE;
    // Chaque marche descend jusqu'au sol : pas de trou sous les tribunes.
    place(new THREE.BoxGeometry(stand.length, top, ROW_DEPTH), (row + 0.5) * ROW_DEPTH, top / 2);
  }
  return mergeGeometries(parts)!;
}

/** Spectateur assis : buste et tête, en peu de triangles (on le voit de loin, par milliers). */
const bodyGeometry = (): THREE.BufferGeometry => new THREE.CapsuleGeometry(0.19, 0.3, 2, 6).translate(0, 0.4, 0);
const headGeometry = (): THREE.BufferGeometry => new THREE.SphereGeometry(0.12, 6, 4).translate(0, 0.86, 0);

/**
 * Animation de la foule dans le shader : balancement léger permanent, agitation, et sauts en ola sur une clameur.
 * `aCrowd` : position le long de la tribune et tirage propre au spectateur.
 */
function animateCrowd(material: THREE.Material, uniforms: { uTime: { value: number }; uJump: { value: number }; uStir: { value: number } }): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aCrowd;\nuniform float uTime;\nuniform float uJump;\nuniform float uStir;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = sin(uTime * 1.7 + aCrowd.y * 6.283) * 0.02 * (1.0 + 3.0 * uStir);
        float hop = max(0.0, sin(uTime * 9.0 - aCrowd.x * 14.0 + aCrowd.y * 2.0)) * 0.32 * uJump * step(0.25, aCrowd.y);
        float rise = 0.12 * clamp(uJump * 3.0, 0.0, 1.0) * step(0.25, aCrowd.y);
        transformed.y += sway + hop + rise;`,
      );
  };
}

export interface Arena {
  readonly object: THREE.Group;
  readonly mood: CrowdMood;
  react(reaction: CrowdReaction): void;
  /** Por tres ou por cuatro : les panneaux s'allument en grand. */
  porTres(): void;
  /** `dt` : temps réel écoulé (s), 0 pendant la micro-pause. */
  update(dt: number): void;
}

/** Durée d'affichage de « ¡POR TRES! » sur les panneaux (s). */
const POR_TRES_TIME = 3;

export function createArena(): Arena {
  const object = new THREE.Group();
  const mood = new CrowdMood();

  // Sol noir autour du terrain, comme dans les salles des grands tournois.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ color: 0x14161a }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  object.add(floor);

  // Tribunes : marches gris très sombre, dans la pénombre.
  const steps = new THREE.Mesh(mergeGeometries(STANDS.map(standGeometry))!, new THREE.MeshLambertMaterial({ color: 0x23262d }));
  object.add(steps);

  // Foule.
  const seats = crowdSeats();
  const uniforms = { uTime: { value: 0 }, uJump: { value: 0 }, uStir: { value: 0 } };
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  animateCrowd(bodyMaterial, uniforms);
  animateCrowd(headMaterial, uniforms);
  const bodies = new THREE.InstancedMesh(bodyGeometry(), bodyMaterial, seats.length);
  const heads = new THREE.InstancedMesh(headGeometry(), headMaterial, seats.length);
  const crowdAttr = new Float32Array(seats.length * 2);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const random = lcg(99);
  seats.forEach((seat, i) => {
    matrix.makeRotationY(seat.yaw).setPosition(seat.x, seat.y, seat.z);
    bodies.setMatrixAt(i, matrix);
    heads.setMatrixAt(i, matrix);
    // Dans la pénombre : couleurs assombries, un peu plus vers le fond des tribunes.
    const shade = 0.2 - 0.01 * Math.min(8, Math.floor(seat.y));
    bodies.setColorAt(i, color.setHex(SHIRTS[Math.floor(random() * SHIRTS.length)]!).multiplyScalar(shade));
    heads.setColorAt(i, color.setHex(SKINS[Math.floor(random() * SKINS.length)]!).multiplyScalar(shade));
    crowdAttr[i * 2] = seat.wave;
    crowdAttr[i * 2 + 1] = seat.seed;
  });
  const crowdAttribute = new THREE.InstancedBufferAttribute(crowdAttr, 2);
  bodies.geometry.setAttribute('aCrowd', crowdAttribute);
  heads.geometry.setAttribute('aCrowd', crowdAttribute);
  // La foule bouge dans le shader : boîtes englobantes désactivées pour le tri, elle reste toujours dessinée.
  bodies.frustumCulled = heads.frustumCulled = false;
  object.add(bodies, heads);

  // Flashs de téléphones : points blancs qui clignotent au hasard dans les tribunes, sur les grands points.
  const flashCount = 220;
  const flashPositions = new Float32Array(flashCount * 3);
  const flashSeeds = new Float32Array(flashCount);
  for (let i = 0; i < flashCount; i++) {
    const seat = seats[Math.floor(random() * seats.length)]!;
    flashPositions.set([seat.x, seat.y + 1.0, seat.z], i * 3);
    flashSeeds[i] = random();
  }
  const flashGeometry = new THREE.BufferGeometry();
  flashGeometry.setAttribute('position', new THREE.BufferAttribute(flashPositions, 3));
  flashGeometry.setAttribute('aSeed', new THREE.BufferAttribute(flashSeeds, 1));
  const flashUniforms = { uTime: { value: 0 }, uFlash: { value: 0 } };
  const flashes = new THREE.Points(
    flashGeometry,
    new THREE.ShaderMaterial({
      uniforms: flashUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        uniform float uFlash;
        varying float vOn;
        void main() {
          float slot = floor(uTime * 14.0 + aSeed * 37.0);
          float r = fract(sin(slot * 12.9898 + aSeed * 78.233) * 43758.5453);
          vOn = step(1.0 - 0.18 * uFlash, r);
          gl_PointSize = 7.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vOn;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = vOn * smoothstep(0.5, 0.0, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0), a);
        }`,
    }),
  );
  flashes.frustumCulled = false;
  object.add(flashes);

  // Panneaux LED sur le muret de chaque tribune, seulement : l'espace autour de la piste reste libre (au moins 4 m)
  // pour les sorties par la porte. Le texte défile ; sur un por tres, ils passent tous à « ¡POR TRES! ».
  const normalLed = ledTexture(LED_TEXT, LED_BLUE, '#ffffff');
  const porTresLed = ledTexture('¡POR TRES!   ', '#ffb000', '#1a1200');
  const ledMaterial = new THREE.MeshBasicMaterial({ map: normalLed, side: THREE.DoubleSide });
  const board = (width: number, height: number, x: number, y: number, z: number, facing: number): void => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geometry, ledMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.y = facing;
    // Répétition du texte proportionnelle à la largeur : lettres de même taille partout (texture de 64 px de haut).
    const image = ledMaterial.map!.image as HTMLCanvasElement;
    const repeat = (width / height) * (64 / image.width);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
    object.add(mesh);
  };
  for (const stand of STANDS) {
    const facing = Math.atan2(-stand.out[0], -stand.out[1]);
    board(stand.length, FRONT_HEIGHT * 0.8, stand.origin[0] - stand.out[0] * 0.01, FRONT_HEIGHT * 0.5, stand.origin[1] - stand.out[1] * 0.01, facing);
  }

  // Bandeau lumineux en haut du devant des tribunes, qui change de couleur (bleu, violet) avec l'ambiance.
  const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x3b4dff });
  for (const stand of STANDS) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stand.length, 0.06, 0.06), stripMaterial);
    strip.rotation.y = Math.atan2(stand.out[0], stand.out[1]);
    strip.position.set(stand.origin[0] - stand.out[0] * 0.02, FRONT_HEIGHT + 0.03, stand.origin[1] - stand.out[1] * 0.02);
    object.add(strip);
  }
  const calm = new THREE.Color(0x3b4dff);
  const hype = new THREE.Color(0xc23bff);

  let time = 0;
  let porTres = 0;
  return {
    object,
    mood,
    react(reaction): void {
      mood.react(reaction);
    },
    porTres(): void {
      porTres = POR_TRES_TIME;
      ledMaterial.map = porTresLed;
      ledMaterial.needsUpdate = true;
    },
    update(dt): void {
      time += dt;
      mood.update(dt);
      uniforms.uTime.value = time;
      uniforms.uJump.value = mood.jump;
      uniforms.uStir.value = mood.stir;
      flashUniforms.uTime.value = time;
      flashUniforms.uFlash.value = mood.flash;
      flashes.visible = mood.flash > 0.02;
      stripMaterial.color.copy(calm).lerp(hype, Math.min(1, mood.stir));
      if (porTres > 0) {
        porTres -= dt;
        // Clignote pendant le por tres.
        ledMaterial.color.setScalar(Math.sin(time * 18) > -0.3 ? 1 : 0.35);
        if (porTres <= 0) {
          ledMaterial.map = normalLed;
          ledMaterial.color.setScalar(1);
          ledMaterial.needsUpdate = true;
        }
      }
      // Défilement du texte.
      normalLed.offset.x = (time * 0.04) % 1;
      porTresLed.offset.x = (time * 0.15) % 1;
    },
  };
}
