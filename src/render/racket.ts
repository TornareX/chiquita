import * as THREE from 'three';
import { swingProgress } from '../sim/racket';
import type { World } from '../sim/world';

export interface RacketView {
  /** À attacher à la caméra : la raquette est dessinée dans le repère de la vue. */
  readonly object: THREE.Group;
  update(world: World): void;
  /** Remplace la raquette en formes simples par le modèle 3D (même origine : le bout du manche). */
  setModel(model: THREE.Object3D): void;
}

interface Pose {
  /** Position de la poignée dans le repère caméra (x vers la droite, y vers le haut, -z devant). */
  pos: [number, number, number];
  /** Rotation (rad) autour de x, y, z. */
  rot: [number, number, number];
}

// Poses du coup droit ; le revers est leur miroir.
const READY: Pose = { pos: [0.46, -0.56, -0.85], rot: [-0.5, 0.25, -0.25] };
const BACK: Pose = { pos: [0.85, -0.42, -0.6], rot: [-0.2, -1.3, -0.9] };
const FRONT: Pose = { pos: [-0.1, -0.44, -1.0], rot: [-0.7, 1.1, 0.5] };

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

function blend(a: Pose, b: Pose, t: number): Pose {
  const mix = (x: number, y: number): number => x + (y - x) * t;
  return {
    pos: [mix(a.pos[0], b.pos[0]), mix(a.pos[1], b.pos[1]), mix(a.pos[2], b.pos[2])],
    rot: [mix(a.rot[0], b.rot[0]), mix(a.rot[1], b.rot[1]), mix(a.rot[2], b.rot[2])],
  };
}

/**
 * Raquette en formes simples, visible en bas de l'écran. C'est une représentation : le contact
 * avec la balle est calculé par la simulation (sim/racket.ts), dont on suit ici les phases.
 */
export function createRacketView(): RacketView {
  const object = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
  const face = new THREE.MeshLambertMaterial({ color: 0xd8452f });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.2), frame);
  handle.position.y = 0.1;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.036, 32), face);
  head.rotation.x = Math.PI / 2;
  head.scale.set(0.9, 1, 1.05);
  head.position.y = 0.34;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), frame);
  rim.scale.set(0.9, 1.05, 1.6);
  rim.position.y = 0.34;
  const simple = new THREE.Group();
  simple.add(handle, head, rim);
  object.add(simple);

  return {
    object,
    setModel(model: THREE.Object3D): void {
      object.remove(simple);
      object.add(model);
    },
    update(world: World): void {
      const { racket, profile } = world;
      const t = profile.racket;
      let pose: Pose;
      switch (racket.phase) {
        case 'idle':
          pose = READY;
          break;
        case 'preparing':
          // Armé rapide, puis recul plus ample à mesure que la préparation se complète.
          pose = blend(READY, BACK, smooth(clamp01(racket.phaseTime / 0.12)) * (0.6 + 0.4 * racket.charge));
          break;
        case 'swinging':
          pose = blend(blend(READY, BACK, 0.6 + 0.4 * racket.charge), FRONT, swingProgress(racket, t));
          break;
        case 'recovering':
          pose = blend(FRONT, READY, smooth(clamp01(racket.phaseTime / t.recoverTime)));
          break;
      }
      const side = racket.side;
      object.position.set(pose.pos[0] * side, pose.pos[1], pose.pos[2]);
      object.rotation.set(pose.rot[0], pose.rot[1] * side, pose.rot[2] * side);
    },
  };
}
