import * as THREE from 'three';
import { HALF_LENGTH, SIM_DT } from '../sim/constants';
import type { Duel, DuelPlayer } from '../sim/duel';
import { predictBall } from '../sim/predict';
import { lerp, type Vec3 } from '../sim/vec3';
import { createCourt } from './court';
import { loadModel, modelsEnabled } from './models';

export interface DuelView {
  render(alpha: number, frameTime: number): void;
  /** Léger tremblement de caméra ; `strength` de 0 à 1. */
  shake(strength: number): void;
}

/** Couleurs d'équipe vives, lisibles de loin (GAME_DESIGN.md §9). */
export const TEAM_COLORS = [0x2f8cff, 0xff4f5e] as const;

/** Balle surdimensionnée à l'écran pour rester lisible de loin. [à calibrer] */
const BALL_DISPLAY_RADIUS = 0.075;
/**
 * Caméra derrière le joueur du camp Z négatif, plus haute et plus reculée que dans Virtua Tennis
 * pour garder la vitre du fond dans le champ (GAME_DESIGN.md §8). [à calibrer]
 */
const CAMERA_HEIGHT = 8.2;
const CAMERA_BACK = HALF_LENGTH + 8.5;
const CAMERA_FOV = 46;
/** Part du déplacement latéral du joueur suivie par la caméra, et lissage (1/s). */
const CAMERA_FOLLOW = 0.35;
const CAMERA_SMOOTHING = 4;
/** Durée de l'animation de frappe (s). */
const SWING_TIME = 0.28;

/**
 * Côté caméra, tout ce qui dépasse la hauteur des vitres près du fond (grillage, montants) est
 * coupé à l'affichage : vu de derrière, il barrerait la moitié du terrain du joueur proche.
 * Les vitres restent, la balle qui rebondit dessus aussi. [à calibrer]
 */
const NEAR_CLIP_Z = -(HALF_LENGTH - 2.1);
const NEAR_CLIP_Y = 3.02;
const NEAR_CLIP_PLANES = [
  // Avec `clipIntersection`, seul ce qui est du côté coupé des deux plans disparaît : z < -7,9 et y > 3.
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -NEAR_CLIP_Z),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), NEAR_CLIP_Y),
];

function clipNearWall(court: THREE.Object3D): void {
  court.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.clippingPlanes = NEAR_CLIP_PLANES;
      material.clipIntersection = true;
    }
  });
}

interface PlayerView {
  object: THREE.Group;
  racket: THREE.Group;
  /**
   * Anneau au sol, visible tant que le coup est préparé : il se resserre jusqu'au moment d'impact,
   * où il atteint la taille du joueur. C'est le repère pour relâcher (GAME_DESIGN.md §4).
   */
  timingRing: THREE.Mesh;
  timingMaterial: THREE.MeshBasicMaterial;
  /** Point où la course assistée emmène le joueur. */
  standMarker: THREE.Mesh;
  color: number;
}

/** L'anneau commence à se resserrer ce temps avant l'impact (s). */
const RING_LEAD = 0.6;

function createPlayerView(color: number): PlayerView {
  const object = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 6, 16), material);
  body.position.y = 0.28 + 0.425 + 0.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshLambertMaterial({ color: 0xf1c9a5 }));
  head.position.y = 1.62;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;

  // Raquette : tamis et manche, tenue sur le côté droit du joueur.
  const racket = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20),
    new THREE.MeshLambertMaterial({ color: 0x20262c }),
  );
  frame.rotation.x = Math.PI / 2;
  frame.position.set(0, 0, 0.32);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  handle.position.set(0, 0, 0.1);
  racket.add(frame, handle);
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.0, 0);
  pivot.add(racket);

  const timingMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const timingRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), timingMaterial);
  timingRing.rotation.x = -Math.PI / 2;
  timingRing.position.y = 0.012;

  object.add(body, head, shadow, pivot, timingRing);

  const standMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  standMarker.rotation.x = -Math.PI / 2;
  return { object, racket: pivot, timingRing, timingMaterial, standMarker, color };
}

/** Balle, ombre bien marquée et trait de hauteur : les repères de profondeur vus de loin. */
function createBallView(): { object: THREE.Group; update(pos: Vec3 | null): void; setModel(model: THREE.Object3D): void } {
  const object = new THREE.Group();
  const sphere = new THREE.Group();
  const simple = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_DISPLAY_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xe4ff3a, emissive: 0x3a4a00 }),
  );
  sphere.add(simple);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_DISPLAY_RADIUS * 1.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  const heightLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  object.add(sphere, shadow, heightLine);
  return {
    object,
    setModel(model: THREE.Object3D): void {
      sphere.remove(simple);
      model.scale.multiplyScalar(BALL_DISPLAY_RADIUS / 0.0325);
      sphere.add(model);
    },
    update(pos: Vec3 | null): void {
      object.visible = pos !== null;
      if (!pos) return;
      sphere.position.set(pos.x, pos.y, pos.z);
      // L'ombre rétrécit un peu avec la hauteur, sans jamais disparaître.
      const s = 1 / (1 + pos.y * 0.12);
      shadow.scale.set(s, s, s);
      shadow.position.set(pos.x, 0.009, pos.z);
      const height = Math.max(0.001, pos.y);
      heightLine.scale.set(1, height, 1);
      heightLine.position.set(pos.x, height / 2, pos.z);
    },
  };
}

export function createDuelView(canvas: HTMLCanvasElement, duel: Duel): DuelView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4450, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, -4);
  scene.add(sun);

  const court = createCourt();
  scene.add(court.object);
  clipNearWall(court.object);
  const ball = createBallView();
  scene.add(ball.object);
  const players = TEAM_COLORS.map((color) => createPlayerView(color));
  for (const view of players) scene.add(view.object, view.standMarker);
  // Point de rebond prévu : repère orange au sol.
  const bounceMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.24, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  bounceMarker.rotation.x = -Math.PI / 2;
  scene.add(bounceMarker);

  canvas.dataset.models = 'pending';
  if (modelsEnabled()) {
    void Promise.all([loadModel('court'), loadModel('ball')]).then(([courtModel, ballModel]) => {
      if (courtModel) {
        court.setModel(courtModel, false);
        clipNearWall(court.object);
      }
      if (ballModel) ball.setModel(ballModel);
      canvas.dataset.models = courtModel && ballModel ? 'loaded' : 'partial';
    });
  } else {
    canvas.dataset.models = 'off';
  }

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  let cameraX = 0;
  let shake = 0;
  let shakeTime = 0;

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const updatePlayer = (view: PlayerView, player: DuelPlayer, alpha: number): void => {
    const pos = lerp(player.prevPos, player.pos, alpha);
    view.object.position.set(pos.x, 0, pos.z);
    // Face au filet.
    view.object.rotation.y = player.side < 0 ? 0 : Math.PI;

    // Frappe : la raquette balaie de l'arrière vers l'avant ; sinon, position d'attente.
    const sinceHit = (duel.tick - player.lastHitTick) * SIM_DT;
    const swing = sinceHit < SWING_TIME ? sinceHit / SWING_TIME : 1;
    const engaged = player.engagement !== null;
    // Repère local : le joueur regarde vers +Z, sa droite est vers -X.
    view.racket.position.x = -0.35;
    view.racket.rotation.y = swing < 1 ? -Math.PI * 0.85 + swing * Math.PI * 1.4 : engaged ? -Math.PI * 0.8 : -0.4;

    const engagement = player.engagement;
    view.timingRing.visible = engagement !== null && engagement.releaseTick === null;
    view.standMarker.visible = false;
    if (engagement) {
      const r = duel.profile.rally;
      const plan = engagement.manual ? null : engagement.plan;
      // Temps restant avant l'impact prévu ; sans point prévu, l'anneau reste à mi-chemin.
      const remaining = plan ? (plan.tick - duel.tick - alpha) * SIM_DT : RING_LEAD / 2;
      view.timingRing.scale.setScalar(1 + Math.min(1, Math.max(0, remaining / RING_LEAD)) * 1.2);
      const inPerfect = plan !== null && remaining <= r.perfectBefore && remaining >= -r.perfectAfter;
      view.timingMaterial.opacity = inPerfect ? 1 : 0.45;
      view.timingMaterial.color.set(inPerfect ? 0xffffff : view.color);
      // En placement manuel, pas de point d'arrivée : le joueur se place lui-même.
      const stand = plan?.stand;
      if (stand) {
        view.standMarker.position.set(stand.x, 0.011, stand.z);
        view.standMarker.visible = true;
      }
    }
  };

  return {
    shake(strength: number): void {
      shake = Math.max(shake, strength);
    },

    render(alpha: number, frameTime: number): void {
      const near = duel.players[0];
      const nearPos = lerp(near.prevPos, near.pos, alpha);
      cameraX += (nearPos.x * CAMERA_FOLLOW - cameraX) * (1 - Math.exp(-CAMERA_SMOOTHING * frameTime));
      shake *= Math.exp(-10 * frameTime);
      shakeTime += frameTime;
      const jitter = shake * 0.06 * Math.sin(shakeTime * 70);
      camera.position.set(cameraX + jitter, CAMERA_HEIGHT + jitter * 0.5, -CAMERA_BACK);
      camera.lookAt(cameraX * 0.6, 0, -0.5);

      players.forEach((view, i) => updatePlayer(view, duel.players[i]!, alpha));

      const { ball: simBall, prevBallPos } = duel;
      let pos: Vec3 | null = null;
      if (simBall && prevBallPos) pos = lerp(prevBallPos, simBall.pos, alpha);
      else if (duel.phase === 'serve') pos = duel.servePosition();
      ball.update(pos);

      bounceMarker.visible = false;
      if (simBall && duel.phase === 'rally') {
        const { bounce } = predictBall(simBall, duel.profile, 3, 64);
        if (bounce) {
          bounceMarker.position.set(bounce.x, 0.01, bounce.z);
          bounceMarker.visible = true;
        }
      }
      renderer.render(scene, camera);
    },
  };
}
