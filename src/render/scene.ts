import * as THREE from 'three';
import { lerp } from '../sim/vec3';
import type { World } from '../sim/world';
import { createBallView } from './ball';
import { createCourt } from './court';
import { createMachineView } from './machine';
import { createRacketView } from './racket';

export interface View {
  /**
   * `alpha` : fraction de pas de simulation écoulée, pour interpoler entre deux états.
   * `frameTime` : durée réelle de l'image (s), pour les effets purement visuels.
   */
  render(alpha: number, frameTime: number): void;
  /** Léger recul de caméra à la frappe ; `strength` de 0 à 1. */
  kick(strength: number): void;
}

/** Recul maximal de la caméra à la frappe (m) et vitesse de retour (1/s). [à calibrer] */
const KICK_DISTANCE = 0.035;
const KICK_RECOVERY = 14;

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

  const racketView = createRacketView();
  if (!overview) {
    scene.add(camera);
    camera.add(racketView.object);
  }

  let kick = 0;
  const updateCamera = (alpha: number): void => {
    const { player, prevPlayerPos, profile } = world;
    const pos = lerp(prevPlayerPos, player.pos, alpha);
    // Le recul pousse la caméra vers l'arrière, le long du regard horizontal.
    const back = kick * KICK_DISTANCE;
    camera.position.set(
      pos.x + Math.sin(player.yaw) * back,
      pos.y + profile.player.eyeHeight,
      pos.z - Math.cos(player.yaw) * back,
    );
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
    kick(strength: number): void {
      kick = Math.max(kick, strength);
    },
    render(alpha: number, frameTime: number): void {
      kick *= Math.exp(-KICK_RECOVERY * frameTime);
      if (!overview) updateCamera(alpha);
      ballView.update(world, alpha);
      machineView.update(world);
      racketView.update(world);
      renderer.render(scene, camera);
    },
  };
}
