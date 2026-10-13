import * as THREE from 'three';
import type { World } from '../sim/world';

export interface MachineView {
  readonly object: THREE.Group;
  update(world: World): void;
}

/** Machine à balles en formes simples : un caisson et un canon, la bouche à la position de lancement. */
export function createMachineView(): MachineView {
  const object = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xe0802a }),
  );
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x22262b }),
  );
  barrel.rotation.x = Math.PI / 2;
  object.add(body, barrel);

  return {
    object,
    update(world: World): void {
      const machine = world.machine;
      object.visible = machine !== null;
      if (!machine) return;
      const { x, y, z } = machine.position;
      // Le caisson est derrière la bouche du canon, posé au sol.
      body.scale.y = y;
      body.position.set(x, y / 2, z + 0.5);
      barrel.position.set(x, y, z + 0.2);
    },
  };
}
