import * as THREE from 'three';
import { BALL_RADIUS } from '../sim/constants';
import { lerp } from '../sim/vec3';
import type { World } from '../sim/world';

export interface BallView {
  readonly object: THREE.Group;
  update(world: World, alpha: number): void;
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
    update(world: World, alpha: number): void {
      const { ball, prevBallPos } = world;
      object.visible = ball !== null;
      if (!ball) return;
      const pos = prevBallPos ? lerp(prevBallPos, ball.pos, alpha) : ball.pos;
      sphere.position.set(pos.x, pos.y, pos.z);
      shadow.position.set(pos.x, 0.008, pos.z);
    },
  };
}
