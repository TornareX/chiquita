import * as THREE from 'three';
import type { PlayerCommands } from '../sim/commands';
import { SIM_HZ } from '../sim/constants';
import { lerp } from '../sim/vec3';
import type { ReplayFrame, World } from '../sim/world';
import type { Aids } from '../ui/aids';
import { createAidsView } from './aids';
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
  /** Lance la revue d'un point enregistré, en boucle et en caméra libre ; `null` pour en sortir. */
  setReplay(frames: readonly ReplayFrame[] | null): void;
  readonly replaying: boolean;
  /** Pendant la revue : déplace la caméra libre avec les commandes du joueur. */
  moveReplayCamera(commands: PlayerCommands, frameTime: number): void;
}

/** Recul maximal de la caméra à la frappe (m) et vitesse de retour (1/s). [à calibrer] */
const KICK_DISTANCE = 0.035;
const KICK_RECOVERY = 14;
/** Vitesse de la caméra libre (m/s). */
const FREE_CAMERA_SPEED = 6;
const MAX_PITCH = (85 * Math.PI) / 180;

export function createView(canvas: HTMLCanvasElement, world: World, aids: Aids): View {
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
  const machineView = createMachineView();
  const aidsView = createAidsView();
  scene.add(ballView.object, machineView.object, aidsView.object);

  // FOV vertical de 70° : environ 100° à l'horizontale en 16:9.
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  // `?cam=overview` : vue d'ensemble extérieure fixe, pour contrôler la géométrie.
  const overview = new URLSearchParams(location.search).get('cam') === 'overview';
  if (overview) {
    camera.position.set(8, 6.5, -14);
    camera.lookAt(0, 1, -2);
  }

  const racketView = createRacketView();
  if (!overview) camera.add(racketView.object);

  // Revue d'un point : silhouette du joueur, trace de la balle et caméra libre.
  const playerMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 1.75, 16),
    new THREE.MeshLambertMaterial({ color: 0x4fa3e0, transparent: true, opacity: 0.75 }),
  );
  const trail = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: 0xd9f23a, size: 0.04, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  trail.frustumCulled = false;
  playerMarker.visible = trail.visible = false;
  scene.add(playerMarker, trail);

  let replay: { frames: readonly ReplayFrame[]; time: number } | null = null;
  const freeCamera = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  let kick = 0;
  const updatePlayerCamera = (alpha: number): void => {
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

    get replaying(): boolean {
      return replay !== null;
    },

    setReplay(frames: readonly ReplayFrame[] | null): void {
      replay = frames && frames.length > 0 ? { frames, time: 0 } : null;
      playerMarker.visible = trail.visible = replay !== null;
      racketView.object.visible = replay === null;
      if (!replay) return;

      // Un point de trace tous les 4 pas.
      const points: number[] = [];
      for (let i = 0; i < replay.frames.length; i += 4) {
        const { ball } = replay.frames[i]!;
        points.push(ball.x, ball.y, ball.z);
      }
      trail.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

      // Départ : vue de trois quarts arrière, au-dessus du joueur, tournée vers le filet.
      const { player } = replay.frames[0]!;
      Object.assign(freeCamera, { x: player.x + 4, y: 3.5, z: player.z - 4, yaw: 0.6, pitch: -0.35 });
    },

    moveReplayCamera(commands: PlayerCommands, frameTime: number): void {
      freeCamera.yaw += commands.look.yaw;
      freeCamera.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, freeCamera.pitch + commands.look.pitch));
      const distance = FREE_CAMERA_SPEED * frameTime;
      const sin = Math.sin(freeCamera.yaw);
      const cos = Math.cos(freeCamera.yaw);
      const { forward, right } = commands.move;
      // Vol libre : « avancer » suit le regard, y compris en hauteur.
      freeCamera.x += (-sin * Math.cos(freeCamera.pitch) * forward - cos * right) * distance;
      freeCamera.y = Math.max(0.2, freeCamera.y + Math.sin(freeCamera.pitch) * forward * distance);
      freeCamera.z += (cos * Math.cos(freeCamera.pitch) * forward - sin * right) * distance;
    },

    render(alpha: number, frameTime: number): void {
      kick *= Math.exp(-KICK_RECOVERY * frameTime);

      if (replay) {
        const duration = replay.frames.length / SIM_HZ;
        replay.time = (replay.time + frameTime * aids.timeScale) % duration;
        const frame = replay.frames[Math.min(replay.frames.length - 1, Math.floor(replay.time * SIM_HZ))]!;
        ballView.update(frame.ball);
        playerMarker.position.set(frame.player.x, frame.player.y + 0.875, frame.player.z);
        if (!overview) {
          camera.position.set(freeCamera.x, freeCamera.y, freeCamera.z);
          camera.rotation.set(freeCamera.pitch, Math.PI - freeCamera.yaw, 0);
        }
      } else {
        if (!overview) updatePlayerCamera(alpha);
        const { ball, prevBallPos } = world;
        ballView.update(ball && prevBallPos ? lerp(prevBallPos, ball.pos, alpha) : (ball?.pos ?? null));
      }

      aidsView.update(world, aids, replay === null);
      machineView.update(world);
      racketView.update(world);
      renderer.render(scene, camera);
    },
  };
}
