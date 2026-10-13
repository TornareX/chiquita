import * as THREE from 'three';
import { lerp } from '../sim/vec3';
import type { World } from '../sim/world';
import { createBallView } from './ball';
import { createCourt } from './court';
import { createMachineView } from './machine';

export interface View {
  /** `alpha` : fraction de pas de simulation écoulée, pour interpoler entre deux états. */
  render(alpha: number): void;
}

export function createView(canvas: HTMLCanvasElement, world: World): View {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4450, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, -4);
  scene.add(sun);
  scene.add(createCourt());
  const ballView = createBallView();
  scene.add(ballView.object);
  const machineView = createMachineView();
  scene.add(machineView.object);

  // FOV vertical de 70° : environ 100° à l'horizontale en 16:9.
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  // `?cam=overview` : vue d'ensemble extérieure fixe, pour contrôler la géométrie.
  const overview = new URLSearchParams(location.search).get('cam') === 'overview';
  if (overview) {
    camera.position.set(8, 6.5, -14);
    camera.lookAt(0, 1, -2);
  }

  const updateCamera = (alpha: number): void => {
    const { player, prevPlayerPos, profile } = world;
    const pos = lerp(prevPlayerPos, player.pos, alpha);
    camera.position.set(pos.x, pos.y + profile.player.eyeHeight, pos.z);
    // La caméra Three.js regarde vers -Z ; le yaw 0 du joueur regarde vers +Z.
    camera.rotation.set(player.pitch, Math.PI - player.yaw, 0);
  };

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    render(alpha: number): void {
      if (!overview) updateCamera(alpha);
      ballView.update(world, alpha);
      machineView.update(world);
      renderer.render(scene, camera);
    },
  };
}
