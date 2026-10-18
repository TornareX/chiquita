import * as THREE from 'three';
import { predictBall } from '../sim/predict';
import { exactColor } from './look';
import type { World } from '../sim/world';
import type { Aids } from '../ui/aids';

export interface AidsView {
  readonly object: THREE.Group;
  /** `visible` à faux masque toutes les aides (pendant la revue d'un point, par exemple). */
  update(world: World, aids: Aids, visible: boolean): void;
}

const MAX_POINTS = 128;

/** Trajectoire prévue (pointillé) et marqueur du point de rebond. */
export function createAidsView(): AidsView {
  const object = new THREE.Group();

  const positions = new Float32Array(MAX_POINTS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const trajectory = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  // Les points bougent à chaque image : pas de test de visibilité sur une boîte englobante périmée.
  trajectory.frustumCulled = false;

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.19, 32),
    exactColor(new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.9, depthWrite: false })),
  );
  marker.rotation.x = -Math.PI / 2;
  object.add(trajectory, marker);

  return {
    object,
    update(world: World, aids: Aids, visible: boolean): void {
      const ball = world.ball;
      const wanted = visible && ball !== null && (aids.trajectory || aids.bounceMarker);
      trajectory.visible = false;
      marker.visible = false;
      if (!wanted || !ball) return;

      const prediction = predictBall(ball, world.profile);
      if (aids.trajectory) {
        const count = Math.min(prediction.points.length, MAX_POINTS);
        for (let i = 0; i < count; i++) {
          const point = prediction.points[i]!;
          positions.set([point.x, point.y, point.z], i * 3);
        }
        geometry.setDrawRange(0, count);
        geometry.attributes.position!.needsUpdate = true;
        trajectory.visible = count > 0;
      }
      if (aids.bounceMarker && prediction.bounce) {
        marker.position.set(prediction.bounce.x, 0.01, prediction.bounce.z);
        marker.visible = true;
      }
    },
  };
}
