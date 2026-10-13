import * as THREE from 'three';
import { BALL_RADIUS } from '../sim/constants';
import type { Vec3 } from '../sim/vec3';

export interface BallView {
  readonly object: THREE.Group;
  /** `null` : pas de balle à afficher. */
  update(pos: Vec3 | null): void;
}

/** Balle et son ombre au sol (repère de profondeur indispensable en première personne). */
export function createBallView(): BallView {
  const object = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xd9f23a }),
  );
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_RADIUS * 1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  object.add(sphere, shadow);

  return {
    object,
    update(pos: Vec3 | null): void {
      object.visible = pos !== null;
      if (!pos) return;
      sphere.position.set(pos.x, pos.y, pos.z);
      shadow.position.set(pos.x, 0.008, pos.z);
    },
  };
}
