import * as THREE from 'three';
import { BALL_RADIUS, HALF_LENGTH, PLAYER_HEIGHT, SIM_DT } from '../sim/constants';
import type { CallKind, Duel, DuelPlayer } from '../sim/duel';
import { predictBall } from '../sim/predict';
import { ballColor, type BallColor } from '../sim/pressure';
import { lerp, type Vec3 } from '../sim/vec3';
import { outsideCourt } from '../sim/walkable';
import { createCourt } from './court';
import { createEffectsView, effectsEnabled } from './effectsView';
import { arenaEnabled, createArena } from './arena';
import { stepCrowdReactions } from '../audio/recipes';
import { CHARACTERS, createCharacter, type CharacterRig, type Reach } from './character';
import { applyLook, enableShadows, exactColor, renderLook, setShadows, softwareRendering } from './look';
import { loadModel, modelsEnabled } from './models';
import { dressCharacter, toonLookEnabled, updateOutline } from './toonLook';
import { dressCourt, turfEnabled } from './turf';
import { dressHall, hallEnabled } from './hall';
import { createPostfx, linearGlass, postfxWanted } from './postfx';
import type { RenderInfo } from '../ui/perfMeter';
import { bodyYawTarget, computePose, FOLLOW_TIME, lowFamily, overheadFamily, plansHighShot, STRIDE, strikeReach, SWING_IN, swingSide, waitReach, type PoseInput, type PrepState, type SwingFamily } from './pose';
import { SlideDetector } from './effects';
import { juiceFlags } from './juice';
import { createSwingTrail, swingLook, type SwingTrail } from './swingTrail';
import { PARTNER_COLORS, TEAM_COLORS } from './teamColors';
import { WALLS } from '../sim/court';

export interface DuelView {
  /** `frozen` : micro-pause en cours, les effets restent figés. */
  render(alpha: number, frameTime: number, frozen?: boolean): void;
  /**
   * À appeler après chaque pas de simulation : lance les effets de ses événements (contacts, frappe, point).
   * `replayed` : pas refait par un rollback (`src/net`) ; seuls ses événements comptent, pas ce qui suit le temps
   * (glissades).
   */
  afterStep(replayed?: boolean): void;
  /**
   * La balle vient d'être déplacée par une correction du réseau (rollback) : elle est dessinée décalée de `offset`
   * (ancienne position moins nouvelle), un décalage qui s'efface en `BALL_CORRECTION_FADE` s. La simulation n'y
   * est pour rien.
   */
  correctBall(offset: Vec3): void;
  /** Même chose pour le joueur `index`, déplacé par une correction : il glisse en `PLAYER_CORRECTION_FADE` s. */
  correctPlayer(index: number, offset: Vec3): void;
  /**
   * Jeu en ligne (`?reseau`) : les rollbacks réécrivent sans cesse le passé récent des joueurs distants. L'animation
   * ignore alors les allers-retours d'état trop brefs (une préparation qui disparaît puis revient) et suit une vitesse
   * lissée. Hors ligne, rien ne change.
   */
  setOnline(online: boolean): void;
  /**
   * Côté du terrain dans le dos duquel se place la caméra (-1 : camp bleu, par défaut ; 1 : camp rouge, la caméra fait
   * un demi-tour), et le joueur que suivent les caméras rapprochées (`?camera=proche|dos`) et les repères.
   */
  setViewpoint(side: -1 | 1, focus: number): void;
  /** Léger tremblement de caméra ; `strength` de 0 à 1. */
  shake(strength: number): void;
  /** Zone à viser, dessinée au sol (tutoriel), ou `null` pour l'effacer. */
  setTarget(zone: { x0: number; x1: number; z0: number; z1: number } | null): void;
  /** Appels de dessin et triangles de la dernière image (banc d'essai du rendu). */
  info(): RenderInfo;
  /**
   * Partie dessinée : la partie en cours, ou sa copie rejouée au ralenti (`replay.ts`). Changer de partie remet à zéro
   * ce qui suit la précédente (arcs de raquette, foulée) ; `crowd` : le public réagit aux points de cette partie.
   */
  setSource(source: Duel, crowd: boolean): void;
}

/** Durée du fondu qui efface le saut de la balle après une correction du réseau (s). [à juger en jouant] */
const BALL_CORRECTION_FADE = 0.08;
/** En ligne : fondu d'un joueur déplacé par une correction (s), et lissage de la vitesse qui oriente sa foulée (s). */
const PLAYER_CORRECTION_FADE = 0.1;
const ONLINE_VELOCITY_SMOOTHING = 0.06;
/**
 * En ligne : une préparation qui disparaît sans qu'aucune frappe ne parte garde sa pose ce temps (s). Un rollback
 * qui prédit un relâcher puis le corrige ne fait plus retomber les bras. [à juger en jouant]
 */
const ONLINE_PREP_HOLD = 0.12;

/** Lumières du rendu soigné (`look.ts`). [à calibrer en jouant] */
const SKY_COLOR = 0xfff9f2;
const GROUND_COLOR = 0x26375a;
const HEMI_INTENSITY = 1.6;
const SUN_COLOR = 0xfff6ec;
const SUN_INTENSITY = 1.1;
const SPOT_COLOR = 0xfff6ea;
const SPOT_INTENSITY = 3.0;

/** Avec les ombres portées : parts de lumière (facteurs) du projecteur, du soleil et de l'ambiance. [à calibrer] */
const SHADOW_LIGHT_SHIFT = { spot: 1.35, sun: 0.45, hemi: 0.85 };
/** Opacité du disque sous les pieds quand les ombres portées sont actives. [à calibrer] */
const CONTACT_SHADOW_OPACITY = 0.18;

/** Anneau de timing : couleur de la balle à venir (`pressure.ts`). */
const BALL_COLORS: Record<BallColor, number> = { verte: 0x46d160, jaune: 0xffd23f, rouge: 0xff4436 };

/** Couleurs d'équipe vives, lisibles de loin (GAME_DESIGN.md §9), communes avec l'interface (`teamColors.ts`). */
export { PARTNER_COLORS, TEAM_COLORS };
/** Durée d'affichage d'une annonce entre partenaires (s), et son texte. */
const CALL_TIME = 1;
const CALL_TEXT: Record<CallKind, string> = { mia: '¡Mía!', tuya: '¡Tuya!' };
/** Bulles « ¡Mía! / ¡Tuya! » masquées pour l'instant (trop grosses, elles gênaient : retour de Xavier) ; `?bulles=1` les remet. */
const SHOW_CALLS = new URLSearchParams(location.search).get('bulles') === '1';

/**
 * Caméra de retransmission télé, derrière le joueur du camp Z négatif (GAME_DESIGN.md §8), ou du camp opposé, tournée
 * d'un demi-tour, quand les joueurs de cet écran sont tous rouges (`setViewpoint`) : téléobjectif
 * placé haut et loin, qui aplatit la perspective (le joueur du fond reste grand) et cadre tout le
 * terrain, vitres du fond comprises. Valeurs relevées sur des images du Premier Padel (Milan 2026) :
 * ligne de fond proche sur ~76 % de la largeur d'une image 16:9, ligne de fond lointaine sur ~40 %.
 */
const CAMERA_HEIGHT = 8.7;
const CAMERA_BACK = HALF_LENGTH + 20;
const CAMERA_LOOK_Z = -0.4;
/** Champ vertical (°) pour un écran 16:9 ; plus étroit, l'écran élargit le champ pour garder toute la largeur. */
const CAMERA_FOV = 20;
const CAMERA_ASPECT = 16 / 9;
/**
 * Comme dans Virtua Tennis ou Top Spin, la balle garde une taille lisible de loin : à sa vraie taille
 * (6,5 cm) tant qu'elle paraît assez grosse, sinon agrandie pour couvrir au moins cette part de la
 * hauteur de l'écran. Près du joueur proche, elle reste à l'échelle de la raquette. [à calibrer]
 */
const BALL_MIN_SCREEN = 0.009;
/** Au-delà de cette vitesse (m/s), une traînée suit la balle, longue de sa course pendant `TRAIL_TIME` (s). */
const TRAIL_SPEED = 12;
const TRAIL_TIME = 0.04;
/** Rayon (m) du disque de l'ombre de balle, sans l'anneau blanc ; plus large que la balle pour se lire de loin. [à calibrer] */
const SHADOW_RADIUS = 0.1;
/** Part du déplacement latéral du joueur suivie par la caméra, et lissage (1/s) : à peine, comme à la télé. */
const CAMERA_FOLLOW = 0.15;
const CAMERA_SMOOTHING = 4;
/**
 * Dézoom automatique, seulement hors du terrain : quand la balle sort (por tres, por cuatro) ou qu'un
 * joueur sort par la porte (salida de pista), le champ s'élargit pour garder à l'écran ce qui est dehors ;
 * sur le terrain, la caméra ne bouge pas (un lob très haut peut quitter le cadre). Le champ va jusqu'à
 * `CAMERA_MAX_ZOOM` fois le champ normal. Marge : part de l'écran (depuis le centre) où l'on veut les garder. Lissage (1/s) : vite pour reculer,
 * lentement pour revenir.
 */
const CAMERA_MAX_ZOOM = 2.6;
const CAMERA_FRAME_MARGIN = 0.88;
const CAMERA_ZOOM_OUT = 6;
const CAMERA_ZOOM_IN = 1.5;
/** Lissage (1/s) de la rotation du corps quand il se tourne pour courir. */
const BODY_TURN = 10;
/** Vitesse à laquelle la foulée affichée suit la vitesse réelle (1/s). */
const GAIT_FOLLOW = 12;

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
  /** Disque sombre sous les pieds ; avec les ombres portées, il ne reste qu'un léger contact. */
  contactShadow: THREE.MeshBasicMaterial;
  /** Personnage cartoon et son état d'animation, propre au rendu. */
  rig: CharacterRig;
  anim: {
    yaw: number;
    speed: number;
    stride: number;
    side: 'fore' | 'back';
    high: boolean;
    highFamily: SwingFamily;
    volley: boolean;
    last: { x: number; z: number } | null;
    /** Demi-tour vers sa vitre du fond (contre-vitre), de 0 (face au filet) à 1. */
    turn: number;
    /** Geste de frappe en cours (arc de raquette). */
    swinging: boolean;
    /** Dernière préparation vue : le départ du geste vers l'avant à la frappe suivante. */
    lastPrep: PrepState | null;
  };
  /**
   * Anneau au sol, visible tant que le coup est préparé : il se resserre jusqu'au moment d'impact,
   * où il atteint la taille du joueur. C'est le repère pour relâcher (GAME_DESIGN.md §4).
   */
  timingRing: THREE.Mesh;
  timingMaterial: THREE.MeshBasicMaterial;
  /** Point où la course assistée emmène le joueur. */
  standMarker: THREE.Mesh;
  color: number;
  /** Bulle d'annonce au-dessus de la tête (« ¡Mía! »), et l'annonce qu'elle affiche. */
  bubble: THREE.Sprite;
  bubbleKind: CallKind | null;
  /** Arc de raquette (étape V7), et le pas de la frappe qu'il dessine. */
  trail: SwingTrail | null;
  trailTick: number;
}

/** Bulle d'annonce : texte blanc sur fond sombre, dessinée dans une texture, toujours face à la caméra. */
function createBubble(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

function drawBubble(sprite: THREE.Sprite, text: string, color: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,16,24,0.82)';
    g.beginPath();
    g.roundRect(8, 8, 240, 64, 22);
    g.fill();
    g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.lineWidth = 6;
    g.stroke();
    g.beginPath();
    g.moveTo(112, 72);
    g.lineTo(128, 92);
    g.lineTo(144, 72);
    g.fillStyle = 'rgba(10,16,24,0.82)';
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 41);
  }
  const material = sprite.material;
  material.map?.dispose();
  material.map = new THREE.CanvasTexture(canvas);
  material.needsUpdate = true;
}

/** L'anneau commence à se resserrer ce temps avant l'impact (s). */
const RING_LEAD = 0.6;
/** Vitesse du demi-tour vers la vitre (1/s), et durée de la contre-vitre jouée avant de se retourner (s). */
const WALL_TURN = 14;
const WALL_STRIKE = 0.45;

function createPlayerView(color: number, index: number, height: number): PlayerView {
  const object = new THREE.Group();
  const rig = createCharacter(CHARACTERS[index % CHARACTERS.length]!, color, height);
  const contactShadow = exactColor(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;

  const timingMaterial = exactColor(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  const timingRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), timingMaterial);
  timingRing.rotation.x = -Math.PI / 2;
  timingRing.position.y = 0.012;

  object.add(rig.object, shadow, timingRing);

  const standMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 24),
    exactColor(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false })),
  );
  standMarker.rotation.x = -Math.PI / 2;
  const bubble = createBubble();
  const anim: PlayerView['anim'] = { yaw: 0, speed: 0, stride: 0, side: 'fore', high: false, highFamily: 'bandeja', volley: false, last: null, turn: 0, swinging: false, lastPrep: null };
  return { object, contactShadow, rig, anim, timingRing, timingMaterial, standMarker, color, bubble, bubbleKind: null, trail: null, trailTick: -Infinity };
}

/** Agrandissement à appliquer à un objet de diamètre `size` à cette position pour le voir à `BALL_MIN_SCREEN`. */
function minScreenScale(camera: THREE.PerspectiveCamera, x: number, y: number, z: number, size: number): number {
  const distance = camera.position.distanceTo(new THREE.Vector3(x, y, z));
  const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(1, (BALL_MIN_SCREEN * visibleHeight) / size);
}

/**
 * Écrasement de la balle (étape V7) : aplatie le long de la normale du choc, élargie autour, pendant `SQUASH_TIME` s.
 * Un choc fort l'écrase jusqu'à `SQUASH_MAX`. [à calibrer à la manette]
 */
const SQUASH_TIME = 0.06;
const SQUASH_MAX = 0.38;

/** Balle, ombre bien marquée, trait de hauteur et traînée : les repères de profondeur et de vitesse vus de loin. */
function createBallView(): {
  object: THREE.Group;
  update(pos: Vec3 | null, vel: Vec3 | null, camera: THREE.PerspectiveCamera, dt: number): void;
  setModel(model: THREE.Object3D): void;
  /** Écrase la balle le long de `normal` ; `amount` de 0 à 1. */
  squash(normal: { x: number; y: number; z: number }, amount: number): void;
} {
  const object = new THREE.Group();
  const sphere = new THREE.Group();
  const simple = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xe4ff3a, emissive: 0x3a4a00 }),
  );
  sphere.add(simple);
  // Ombre façon Rocket League : disque sombre cerclé de blanc, à l'aplomb exact de la balle. Dessinée
  // par-dessus tout, pour rester visible quand la balle passe au-dessus du joueur (son corps la cacherait).
  const shadow = new THREE.Group();
  const shadowLook = { transparent: true, depthWrite: false, depthTest: false };
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_RADIUS, 32),
    exactColor(new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.55, ...shadowLook })),
  );
  const shadowRing = new THREE.Mesh(
    new THREE.RingGeometry(SHADOW_RADIUS, SHADOW_RADIUS * 1.35, 32),
    exactColor(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.9, ...shadowLook })),
  );
  shadowDisc.renderOrder = shadowRing.renderOrder = 10;
  shadow.add(shadowDisc, shadowRing);
  shadow.rotation.x = -Math.PI / 2;
  const heightLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
    exactColor(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })),
  );
  // Traînée : cône allongé derrière la balle, de son diamètre à rien.
  const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xf4ffb0, transparent: true, opacity: 0.4, depthWrite: false });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(BALL_RADIUS, 1, 12, 1, true), trailMaterial);
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  object.add(sphere, shadow, heightLine, trail);
  const squashAxis = new THREE.Vector3(0, 1, 0);
  let squashAmount = 0;
  let squashAge = Infinity;
  return {
    object,
    squash(normal, amount): void {
      const length = Math.hypot(normal.x, normal.y, normal.z);
      if (length < 1e-6 || amount <= 0) return;
      squashAxis.set(normal.x / length, normal.y / length, normal.z / length);
      squashAmount = Math.min(1, amount) * SQUASH_MAX;
      squashAge = 0;
    },
    setModel(model: THREE.Object3D): void {
      sphere.remove(simple);
      sphere.add(model);
    },
    update(pos: Vec3 | null, vel: Vec3 | null, camera: THREE.PerspectiveCamera, dt: number): void {
      object.visible = pos !== null;
      squashAge += dt;
      if (!pos) return;
      sphere.position.set(pos.x, pos.y, pos.z);
      const scale = minScreenScale(camera, pos.x, pos.y, pos.z, 2 * BALL_RADIUS);
      // Écrasement qui se relâche en revenant à la sphère ; volume à peu près gardé (élargie de la moitié).
      const squash = squashAge < SQUASH_TIME ? squashAmount * (1 - squashAge / SQUASH_TIME) : 0;
      if (squash > 0) {
        sphere.quaternion.setFromUnitVectors(up, squashAxis);
        sphere.scale.set(scale * (1 + squash / 2), scale * (1 - squash), scale * (1 + squash / 2));
      } else {
        sphere.quaternion.identity();
        sphere.scale.setScalar(scale);
      }
      // Taille constante quelle que soit la hauteur : c'est sa position qui compte, pas son flou.
      const s = minScreenScale(camera, pos.x, 0, pos.z, 2 * SHADOW_RADIUS);
      shadow.scale.set(s, s, s);
      shadow.position.set(pos.x, 0.009, pos.z);
      const height = Math.max(0.001, pos.y);
      heightLine.scale.set(1, height, 1);
      heightLine.position.set(pos.x, height / 2, pos.z);

      const speed = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0;
      trail.visible = vel !== null && speed > TRAIL_SPEED;
      if (!vel || !trail.visible) return;
      // La pointe du cône (+Y) part vers l'arrière de la trajectoire.
      direction.set(-vel.x, -vel.y, -vel.z).divideScalar(speed);
      trail.quaternion.setFromUnitVectors(up, direction);
      const length = speed * TRAIL_TIME;
      trail.scale.set(scale, length, scale);
      trail.position.set(pos.x, pos.y, pos.z).addScaledVector(direction, length / 2);
      trailMaterial.opacity = 0.4 * Math.min(1, (speed - TRAIL_SPEED) / 8);
    },
  };
}

export function createDuelView(canvas: HTMLCanvasElement, source: Duel): DuelView {
  /** Partie dessinée : celle en cours, ou sa copie rejouée au ralenti. */
  let duel = source;
  /** Le public réagit aux points (pas pendant un ralenti : il l'a déjà fait). */
  let crowd = true;
  const juice = juiceFlags();
  const slides = new SlideDetector();
  const look = renderLook();
  // Avec le post-traitement, l'anticrénelage est un SMAA en fin de chaîne : le MSAA du moteur gênerait l'occlusion.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !postfxWanted(look) });
  // Plusieurs passes par image : le compteur du banc d'essai est remis à zéro à chaque image, pas à chaque passe.
  renderer.info.autoReset = false;
  /** Post-traitement actif (`postfx.ts`) : rendu en lumière linéaire, bloom ; jamais en rendu logiciel. */
  const hdr = postfxWanted(look) && !softwareRendering(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  applyLook(renderer, scene, look);
  const soigne = look === 'soigne';
  // Salle sombre autour d'un terrain très éclairé (étape E6) ; sans l'arène, le fond d'avant.
  const arena = arenaEnabled() ? createArena() : null;
  scene.background = new THREE.Color(arena ? 0x07090d : 0x1b2733);
  // Le haut des tribunes se perd dans la pénombre ; le terrain (à moins de 42 m de la caméra) n'est pas touché.
  if (arena) scene.fog = new THREE.Fog(0x07090d, 46, 95);
  /** Lumière qui porte les ombres : le projecteur du terrain, ou le soleil sans l'arène. */
  let shadowLight: THREE.SpotLight | THREE.DirectionalLight | null = null;
  if (arena) {
    scene.add(arena.object);
    // Rendu soigné : halos et faisceaux des projecteurs, salle bleu nuit (`hall.ts`).
    if (soigne && hallEnabled()) dressHall(scene, arena.object, hdr);
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__arena = arena;
    // Le terrain sous les projecteurs : un cône de lumière au-dessus, qui laisse les tribunes dans la pénombre.
    // Rendu soigné : projecteurs d'un blanc légèrement chaud, pour que les ombres froides de l'ambiance ressortent.
    const spot = new THREE.SpotLight(soigne ? SPOT_COLOR : 0xdfe8ff, soigne ? SPOT_INTENSITY : 2.2, 0, Math.atan2(13, 20), 0.35, 0);
    spot.position.set(0, 20, 0);
    spot.target.position.set(0, 0, 0);
    scene.add(spot, spot.target);
    shadowLight = spot;
  }
  // Ciel et sol de l'ambiance : en rendu soigné, côté éclairé chaud et côté ombre froid (ombrage de Gooch, comme
  // Team Fortress 2), au lieu d'ombres grises.
  const hemisphere = soigne ? new THREE.HemisphereLight(SKY_COLOR, GROUND_COLOR, HEMI_INTENSITY) : new THREE.HemisphereLight(0xffffff, 0x3a4450, 2.2);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(soigne ? SUN_COLOR : 0xffffff, soigne ? SUN_INTENSITY : 1.2);
  sun.position.set(6, 12, -4);
  scene.add(sun);
  const shadows = enableShadows(renderer, shadowLight ?? sun, look);
  // Une ombre n'assombrit que la lumière qui la porte : le projecteur prend une part de celle du soleil et de
  // l'ambiance, sinon les ombres restent pâles.
  if (shadows && shadowLight) {
    shadowLight.intensity = SPOT_INTENSITY * SHADOW_LIGHT_SHIFT.spot;
    sun.intensity = SUN_INTENSITY * SHADOW_LIGHT_SHIFT.sun;
    hemisphere.intensity = HEMI_INTENSITY * SHADOW_LIGHT_SHIFT.hemi;
  }

  const court = createCourt();
  scene.add(court.object);
  // Rendu soigné : tapis bleu façon Premier Padel, lignes blanches (avant le découpage de la vitre proche, qui touche aux matériaux).
  const turf = soigne && turfEnabled();
  if (turf) dressCourt(court.object);
  if (hdr) linearGlass(court.object);
  clipNearWall(court.object);
  if (shadows) setShadows(court.object, true);
  const ball = createBallView();
  scene.add(ball.object);
  // Effets de balle et de vitre (étape E3), coupés par `?effets=0`.
  const effects = effectsEnabled() ? createEffectsView(scene, NEAR_CLIP_PLANES) : null;
  if (effects && (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) window.__effects = effects.effects;
  /** Dernière pose dessinée de chaque joueur, en mode debug (mesure des à-coups d'animation, `tests/e2e/reseau.spec.ts`). */
  const debugPoses: NonNullable<Window['__poses']> | null =
    import.meta.env.DEV || new URLSearchParams(location.search).has('debug') ? (window.__poses = []) : null;
  const drawingSize = new THREE.Vector2();
  const trailTip = new THREE.Vector3();
  const trailThroat = new THREE.Vector3();
  const trailPivot = new THREE.Vector3();
  /** Temps écoulé pour l'arc de raquette à cette image : 0 pendant la micro-pause (l'arc reste figé). */
  let trailDt = 0;
  /** Un joueur dessiné par joueur simulé : créés au besoin (le format peut passer du simple au double). */
  const players: PlayerView[] = [];
  const syncPlayers = (): void => {
    while (players.length < duel.players.length) {
      const i = players.length;
      const view = createPlayerView(i < 2 ? TEAM_COLORS[i]! : PARTNER_COLORS[i - 2]!, i, duel.players[i]!.height);
      // Rendu soigné : ombres teintées, liseré de lumière et trait constant à l'écran (`toonLook.ts`).
      if (soigne && toonLookEnabled()) dressCharacter(view.rig.object);
      // Ombre portée : le disque sous les pieds s'efface, il ne reste qu'un léger contact.
      if (shadows) {
        setShadows(view.rig.object, false);
        view.contactShadow.opacity = CONTACT_SHADOW_OPACITY;
      }
      if (juice.swingArc) {
        view.trail = createSwingTrail();
        scene.add(view.trail.object);
      }
      scene.add(view.object, view.standMarker, view.bubble);
      players.push(view);
    }
    players.forEach((view, i) => {
      const active = i < duel.players.length;
      view.object.visible = active;
      if (!active) view.standMarker.visible = view.bubble.visible = false;
      if (!active && view.trail) view.trail.object.visible = false;
    });
  };
  syncPlayers();
  // Point de rebond prévu : repère orange au sol.
  const bounceMaterial = exactColor(new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.85, depthWrite: false }));
  const bounceMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), bounceMaterial);
  bounceMarker.rotation.x = -Math.PI / 2;
  scene.add(bounceMarker);
  // Contre-vitre : repère sur la vitre du fond, là où la balle va la toucher. Discret tant que la balle n'est pas à
  // portée, plein quand le coup est jouable.
  const wallMaterial = exactColor(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const wallMarker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), wallMaterial);
  wallMarker.renderOrder = 12;
  wallMarker.visible = false;
  scene.add(wallMarker);
  // Zone cible du tutoriel : rectangle translucide au sol.
  const targetZone = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    exactColor(new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.28, depthWrite: false })),
  );
  targetZone.rotation.x = -Math.PI / 2;
  targetZone.visible = false;
  scene.add(targetZone);

  canvas.dataset.models = 'pending';
  if (modelsEnabled()) {
    void Promise.all([loadModel('court'), loadModel('ball')]).then(([courtModel, ballModel]) => {
      if (courtModel) {
        court.setModel(courtModel, false);
        if (turf) dressCourt(court.object);
        if (hdr) linearGlass(court.object);
        clipNearWall(court.object);
        if (shadows) setShadows(court.object, true);
      }
      if (ballModel) ball.setModel(ballModel);
      canvas.dataset.models = courtModel && ballModel ? 'loaded' : 'partial';
    });
  } else {
    canvas.dataset.models = 'off';
  }

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  const postfx = hdr ? createPostfx(renderer, scene, camera) : null;
  /**
   * `?camera=proche` : de trois quarts face, côté coup droit, près du joueur 1 ; `?camera=dos` : derrière lui.
   * Pour juger les poses du personnage.
   */
  const closeCamera = new URLSearchParams(location.search).get('camera');
  let cameraX = 0;
  let baseFov = CAMERA_FOV;
  let zoom = 1;
  const framePoint = new THREE.Vector3();
  let shake = 0;
  /** Camp dans le dos duquel est la caméra, et joueur suivi par les caméras rapprochées (`setViewpoint`). */
  let viewSide: -1 | 1 = -1;
  let focus = 0;
  /** Décalage de la balle laissé par une correction du réseau, et temps restant de son fondu (s). */
  let ballOffset: Vec3 = { x: 0, y: 0, z: 0 };
  let ballOffsetLeft = 0;
  /** En ligne : décalage de chaque joueur après une correction, vitesse lissée, dernière préparation montrée. */
  let online = false;
  const playerOffsets: { offset: Vec3; left: number }[] = [];
  const smoothVel: (Vec3 | null)[] = [];
  const heldPreps: ({ prep: PrepState; pressTick: number; left: number } | null)[] = [];
  let shakeTime = 0;

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    postfx?.setSize(width, height);
    camera.aspect = width / height;
    const fovFactor = Math.max(1, CAMERA_ASPECT / camera.aspect);
    baseFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * fovFactor));
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const reachTarget = new THREE.Vector3();
  /**
   * Pose du personnage, lue dans l'état de la simulation sans le modifier : préparation (de l'appui au
   * relâcher), frappe (l'image d'impact arrive `SWING_IN` après le pas du contact, `lastHitTick`), course et attente.
   * Autour de l'impact, l'IK du bras amène le tamis sur le point de contact de la simulation.
   */
  const animate = (view: PlayerView, player: DuelPlayer, pos: Vec3, alpha: number, frameTime: number): void => {
    // Tourné vers sa vitre (contre-vitre) : le repère du joueur fait demi-tour.
    const f = (player.side < 0 ? 1 : -1) * (view.anim.turn > 0.5 ? -1 : 1);
    // Gaucher : le personnage est dessiné en miroir (raquette dans la main gauche) ; ses poses sont celles d'un
    // droitier dans un repère retourné, où sa gauche passe à droite.
    const m = player.hand === 'left' ? -1 : 1;
    const scale = player.height / PLAYER_HEIGHT;
    const now = duel.tick + alpha;
    const localX = (p: Vec3): number => (p.x - pos.x) * f * m;

    // Coup préparé : l'armé grandit avec le temps de préparation ; le côté suit la balle attendue.
    const engagement = player.engagement;
    const isServer = duel.players[duel.server] === player;
    const toss = duel.phase === 'toss' && isServer ? duel.toss : null;
    let prep: PrepState | null = null;
    // Relâché, la balle pas encore là (volée qui attend) : la raquette part vers le point de contact prévu.
    let reach: Reach | null = null;
    if (toss && toss.releaseTick === null) {
      prep = { family: 'serve', seconds: (now - duel.phaseTick) * SIM_DT };
    } else if (engagement) {
      const target = (view.anim.turn > 0.5 ? null : engagement.plan?.contact) ?? duel.ball?.pos ?? null;
      if (target) view.anim.side = swingSide(localX(target), view.anim.side);
      // Tourné vers sa vitre : une contre-vitre, coup au sol.
      view.anim.high = view.anim.turn <= 0.5 && plansHighShot(duel, player, engagement);
      view.anim.volley = engagement.plan?.volley ?? false;
      // Coup haut : la variante ne se décide qu'au relâcher ; on prépare la bandeja/víbora (même armé que le smash),
      // sauf le smash annoncé aux boutons (stick de déplacement vers l'avant à l'appui).
      view.anim.highFamily = !engagement.swing && duel.rematePrepared(duel.players.indexOf(player)) ? 'overhead' : 'bandeja';
      const family = view.anim.high ? view.anim.highFamily : lowFamily(view.anim.side, view.anim.volley);
      const released = engagement.releaseTick;
      prep = { family, seconds: ((released ?? now) - engagement.pressTick) * SIM_DT };
      if (released !== null) {
        prep.released = (now - released) * SIM_DT;
        const contact = engagement.plan?.contact;
        if (contact && view.anim.turn <= 0.5) reach = { target: reachTarget.set(contact.x, contact.y, contact.z), weight: waitReach(prep.released) };
      }
    }
    if (prep) view.anim.lastPrep = prep;

    // Dernière frappe, ou coup dans le vide.
    const whiffed = player.lastWhiffTick > player.lastHitTick;
    const strikeTick = whiffed ? player.lastWhiffTick : player.lastHitTick;
    let strike: PoseInput['strike'] = null;
    if (Number.isFinite(strikeTick)) {
      const hit = whiffed ? null : player.lastHit;
      const kind = whiffed ? player.lastWhiffKind : hit?.kind;
      // Côté de frappe : celui que la simulation a retenu (coup droit ou revers).
      if (hit && !hit.serve && kind !== 'overhead') view.anim.side = hit.wing;
      // Le coup joué dit la famille ; un coup dans le vide garde celle de sa préparation (au stick, la commande
      // est toujours celle d'un coup haut : c'est la hauteur de la balle qui décide).
      const high = hit ? kind === 'overhead' : view.anim.high;
      const volley = hit ? hit.volley : view.anim.volley;
      const highFamily = hit ? overheadFamily(hit.overhead) : view.anim.highFamily;
      const family: SwingFamily = hit?.serve ? 'serve' : high ? highFamily : lowFamily(view.anim.side, volley);
      const struck = { family, seconds: (now - strikeTick) * SIM_DT, from: view.anim.lastPrep };
      strike = struck;
      // Frappe : le centre du tamis rejoint le point de contact de la simulation à l'image d'impact.
      if (hit && !prep) reach = { target: reachTarget.set(hit.contact.x, hit.contact.y, hit.contact.z), weight: strikeReach(struck.seconds) };
    }

    // En ligne : une préparation qui s'efface sans frappe derrière garde sa pose un court instant (voir `ONLINE_PREP_HOLD`).
    const index = players.indexOf(view);
    if (online) {
      const held = heldPreps[index];
      const struck = Number.isFinite(strikeTick) && held !== null && held !== undefined && strikeTick >= held.pressTick;
      if (prep && engagement) heldPreps[index] = { prep: { ...prep }, pressTick: engagement.pressTick, left: ONLINE_PREP_HOLD };
      else if (held && !struck && held.left > 0) {
        held.left -= frameTime;
        // La pose continue là où on la voyait : l'armé grandit encore, ou la raquette relâchée poursuit son geste.
        const shown = held.prep;
        const elapsed = ONLINE_PREP_HOLD - held.left;
        prep =
          shown.released === undefined
            ? { family: shown.family, seconds: (now - held.pressTick) * SIM_DT }
            : { ...shown, released: shown.released + elapsed };
      } else heldPreps[index] = null;
    }

    // Arc de raquette : un nouvel arc à chaque frappe (ou coup dans le vide), dessiné jusque dans l'accompagnement.
    if (view.trail && Number.isFinite(strikeTick) && strikeTick !== view.trailTick) {
      view.trailTick = strikeTick;
      view.trail.start(swingLook(whiffed ? null : player.lastHit));
    }
    view.anim.swinging = strike !== null && strike.seconds >= 0 && strike.seconds < SWING_IN + FOLLOW_TIME * 0.75;

    // Course : vitesse et direction dans le repère du filet ; la foulée avance avec la distance parcourue.
    // En ligne, la vitesse est lissée : une correction ne retourne pas la foulée d'une image à l'autre.
    let vel: Vec3 = player.vel;
    if (online) {
      const k = 1 - Math.exp(-frameTime / ONLINE_VELOCITY_SMOOTHING);
      const s = smoothVel[index] ?? player.vel;
      vel = { x: s.x + (player.vel.x - s.x) * k, y: 0, z: s.z + (player.vel.z - s.z) * k };
      smoothVel[index] = vel;
    }
    const speed = Math.hypot(vel.x, vel.z);
    const heading = Math.atan2(vel.x * f * m, vel.z * f);
    const last = view.anim.last;
    if (last) view.anim.stride += (Math.hypot(pos.x - last.x, pos.z - last.z) / (STRIDE * scale)) * Math.PI * 2;
    view.anim.last = { x: pos.x, z: pos.z };
    const striking = prep !== null || (strike !== null && strike.seconds < 0.5);
    const yawTarget = bodyYawTarget(speed, heading, striking);
    view.anim.yaw += (yawTarget - view.anim.yaw) * (1 - Math.exp(-BODY_TURN * frameTime));
    // Vitesse lissée pour la pose : un démarrage ou un arrêt brusque ne fait pas sauter les jambes.
    view.anim.speed += (speed - view.anim.speed) * (1 - Math.exp(-GAIT_FOLLOW * frameTime));

    const pose = computePose({
        inPlay: duel.phase !== 'dead' && duel.phase !== 'over',
        prep,
        strike,
        speed: view.anim.speed,
        heading,
        bodyYaw: view.anim.yaw,
        stride: view.anim.stride,
        time: now * SIM_DT,
      });
    view.rig.apply(pose, reach);
    if (debugPoses) debugPoses[index] = { pose, x: pos.x, z: pos.z, yaw: view.object.rotation.y, prep, strike };
  };

  const updatePlayer = (view: PlayerView, player: DuelPlayer, index: number, alpha: number, frameTime: number): void => {
    let pos = lerp(player.prevPos, player.pos, alpha);
    const correction = playerOffsets[index];
    if (correction && correction.left > 0) {
      correction.left = Math.max(0, correction.left - frameTime);
      const k = correction.left / PLAYER_CORRECTION_FADE;
      pos = { x: pos.x + correction.offset.x * k, y: pos.y, z: pos.z + correction.offset.z * k };
    }
    view.object.position.set(pos.x, 0, pos.z);
    // Annonce entre partenaires, au-dessus de la tête pendant un court instant.
    const call = SHOW_CALLS && player.call && (duel.tick - player.call.tick) * SIM_DT < CALL_TIME ? player.call.kind : null;
    view.bubble.visible = call !== null;
    if (call) {
      if (view.bubbleKind !== call) {
        drawBubble(view.bubble, CALL_TEXT[call], view.color);
        view.bubbleKind = call;
      }
      // Taille lisible de loin comme la balle : le joueur du fond garde une bulle de même taille à l'écran.
      const scale = Math.max(0.9, minScreenScale(camera, pos.x, 2.4, pos.z, 1) * 0.045);
      view.bubble.scale.set(scale * 2.67, scale, 1);
      view.bubble.position.set(pos.x, 2.15 + scale * 0.5, pos.z);
    }
    // Contre-vitre : il se tourne vers sa vitre quand il la prépare (stick tiré vers elle) et pendant qu'il la joue.
    const chance = duel.counterWall(index);
    const wallStrike = player.lastHit?.counterWall === true && (duel.tick - player.lastHitTick) * SIM_DT < WALL_STRIKE;
    const prepared = player.engagement;
    const aimsWall =
      prepared !== null &&
      (prepared.letPass === true ||
        prepared.counterWall !== undefined ||
        (chance !== null && !prepared.swing && player.stick.forward <= -duel.profile.rally.counterWall.stick));
    view.anim.turn += ((wallStrike || aimsWall ? 1 : 0) - view.anim.turn) * (1 - Math.exp(-WALL_TURN * frameTime));
    // Face au filet ; le repère du joueur a +Z vers le filet et sa droite vers -X.
    view.object.rotation.y = (player.side < 0 ? 0 : Math.PI) + view.anim.turn * Math.PI;
    view.rig.object.scale.x = player.hand === 'left' ? -1 : 1;
    animate(view, player, pos, alpha, frameTime);
    if (view.trail) {
      // Haut et gorge du tamis, et l'épaule (à peu près) : le centre de l'arc.
      view.object.updateMatrixWorld(true);
      view.rig.racketMount.localToWorld(trailTip.set(0, 0.38, 0));
      view.rig.racketMount.localToWorld(trailThroat.set(0, 0.17, 0));
      trailPivot.set(pos.x, 1.35 * (player.height / PLAYER_HEIGHT), pos.z);
      view.trail.update(trailDt, trailTip, trailThroat, trailPivot, view.anim.swinging);
    }

    // Coup préparé, bouton maintenu : en échange, ou balle lâchée au service.
    const engagement = player.engagement;
    const toss = duel.phase === 'toss' && duel.players[duel.server] === player ? duel.toss : null;
    const plan = engagement && !engagement.manual ? engagement.plan : null;
    const preparing = toss ? toss.releaseTick === null : engagement !== null && engagement.releaseTick === null;
    // Moment d'impact : sommet du rebond au service, point prévu par la course assistée en échange ; coup
    // haut : la balle à hauteur des yeux, ou plus haut, plus tôt, stick vers l'avant (remate).
    const overheadTick = plan && engagement?.kind === 'overhead' ? duel.overheadReleaseTick(index) : null;
    const impactTick = toss ? toss.idealTick : (overheadTick ?? plan?.tick ?? null);
    view.timingRing.visible = preparing;
    if (preparing) {
      const r = duel.profile.rally;
      // Temps restant avant l'impact ; sans point prévu (placement manuel), l'anneau reste à mi-chemin.
      const remaining = impactTick !== null ? (impactTick - duel.tick - alpha) * SIM_DT : RING_LEAD / 2;
      view.timingRing.scale.setScalar(1 + Math.min(1, Math.max(0, remaining / RING_LEAD)) * 1.2);
      // Couleur de la balle à venir (verte, jaune, rouge) ; sous pression, la sous-fenêtre parfaite rétrécit.
      const pressure = toss || r.pressure.scale === 0 ? null : duel.plannedPressure(index);
      const shrink = 1 - r.pressure.windowShrink * r.pressure.scale * (pressure ?? 0);
      const inPerfect = impactTick !== null && remaining <= r.perfectBefore * shrink && remaining >= -r.perfectAfter * shrink;
      view.timingMaterial.opacity = inPerfect ? 1 : 0.6;
      view.timingMaterial.color.set(inPerfect ? 0xffffff : pressure === null ? view.color : BALL_COLORS[ballColor(pressure)]);
    }
    // En placement manuel, pas de point d'arrivée : le joueur se place lui-même.
    const stand = plan?.stand;
    view.standMarker.visible = stand !== undefined;
    if (stand) view.standMarker.position.set(stand.x, 0.011, stand.z);
  };

  /** Élargit le champ juste assez pour garder à l'écran la balle et les joueurs sortis du terrain (voir `CAMERA_MAX_ZOOM`). */
  const frameAll = (alpha: number, frameTime: number): void => {
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let need = 1;
    const fit = (x: number, y: number, z: number): void => {
      framePoint.set(x, y, z).project(camera);
      if (framePoint.z > 1) return;
      need = Math.max(need, Math.abs(framePoint.x) / CAMERA_FRAME_MARGIN, Math.abs(framePoint.y) / CAMERA_FRAME_MARGIN);
    };
    for (const player of duel.players) {
      const p = lerp(player.prevPos, player.pos, alpha);
      if (!outsideCourt(p)) continue;
      fit(p.x, 0, p.z);
      fit(p.x, player.height, p.z);
    }
    const { ball: simBall, prevBallPos } = duel;
    if (simBall && prevBallPos && duel.phase === 'rally') {
      const b = lerp(prevBallPos, simBall.pos, alpha);
      if (duel.exit || outsideCourt(b)) fit(b.x, b.y, b.z);
    }
    const target = Math.min(CAMERA_MAX_ZOOM, need);
    const rate = target > zoom ? CAMERA_ZOOM_OUT : CAMERA_ZOOM_IN;
    zoom += (target - zoom) * (1 - Math.exp(-rate * frameTime));
    if (zoom < 1.001) zoom = 1;
    const half = THREE.MathUtils.degToRad(baseFov / 2);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) * zoom));
    camera.updateProjectionMatrix();
  };

  return {
    afterStep(replayed = false): void {
      effects?.effects.fromStep(duel);
      if (juice.squash) {
        // La balle s'écrase dans le sens de son départ à la frappe, contre la surface au rebond.
        const { shot, ball: simBall } = duel;
        if (shot && simBall) ball.squash(simBall.vel, shot.perfect || shot.overhead === 'remate' ? 0.9 : 0.55);
        for (const contact of duel.contacts) {
          const amount = Math.min(1, contact.speed / 14);
          if (contact.surface === 'ground') ball.squash({ x: 0, y: 1, z: 0 }, amount);
          else if (contact.surface === 'glass' && contact.wall) ball.squash(WALLS[contact.wall].normal, amount);
        }
      }
      if (effects && juice.sand && !replayed) {
        duel.players.forEach((player, i) => {
          const slide = slides.update(i, player.vel, SIM_DT);
          if (slide) effects.effects.slide(player.pos.x, player.pos.z, slide.dx, slide.dz, slide.strength);
        });
      }
      if (arena && crowd) {
        for (const reaction of stepCrowdReactions(duel)) arena.react(reaction);
        if (duel.result?.reason === 'por-tres' || duel.result?.reason === 'por-cuatro') arena.porTres();
      }
    },

    correctPlayer(index: number, offset: Vec3): void {
      const current = playerOffsets[index];
      const k = current ? current.left / PLAYER_CORRECTION_FADE : 0;
      const base = current?.offset ?? { x: 0, y: 0, z: 0 };
      playerOffsets[index] = { offset: { x: base.x * k + offset.x, y: 0, z: base.z * k + offset.z }, left: PLAYER_CORRECTION_FADE };
    },

    setOnline(on: boolean): void {
      online = on;
    },

    setViewpoint(side: -1 | 1, player: number): void {
      // Changement de camp : la caméra repart du centre au lieu de glisser d'un bout à l'autre.
      if (side !== viewSide) cameraX = 0;
      viewSide = side;
      focus = player;
      // Le décor fait le même demi-tour que la caméra : tribunes, bâches, projecteurs et terrain (symétrique, rien ne
      // bouge en jeu) se voient de la même façon des deux côtés. La vitre coupée est celle du côté de la caméra.
      const turn = side > 0 ? Math.PI : 0;
      if (arena) arena.object.rotation.y = turn;
      court.object.rotation.y = turn;
      sun.position.set(-6 * side, 12, 4 * side);
      NEAR_CLIP_PLANES[0]!.normal.set(0, 0, -side);
    },

    correctBall(offset: Vec3): void {
      // Le saut s'ajoute à ce qui reste du précédent : la balle repart toujours de là où on la voyait.
      const k = ballOffsetLeft / BALL_CORRECTION_FADE;
      ballOffset = { x: ballOffset.x * k + offset.x, y: ballOffset.y * k + offset.y, z: ballOffset.z * k + offset.z };
      ballOffsetLeft = BALL_CORRECTION_FADE;
    },

    shake(strength: number): void {
      shake = Math.max(shake, strength);
    },

    setTarget(zone): void {
      targetZone.visible = zone !== null;
      if (!zone) return;
      targetZone.scale.set(zone.x1 - zone.x0, zone.z1 - zone.z0, 1);
      targetZone.position.set((zone.x0 + zone.x1) / 2, 0.009, (zone.z0 + zone.z1) / 2);
    },

    info(): RenderInfo {
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },

    setSource(next: Duel, crowdReacts: boolean): void {
      crowd = crowdReacts;
      if (next === duel) return;
      duel = next;
      for (const view of players) view.anim.last = null;
    },

    render(alpha: number, frameTime: number, frozen = false): void {
      syncPlayers();
      trailDt = frozen ? 0 : frameTime;
      arena?.update(frozen ? 0 : frameTime);
      const near = duel.players[focus] ?? duel.players[0];
      // Caméra partagée : elle suit à peine l'équipe proche (en double, le milieu de la paire), celle de son camp.
      const nearTeam = duel.players.filter((p) => p.side === viewSide);
      const nearX = nearTeam.reduce((sum, p) => sum + lerp(p.prevPos, p.pos, alpha).x, 0) / nearTeam.length;
      cameraX += (nearX * CAMERA_FOLLOW - cameraX) * (1 - Math.exp(-CAMERA_SMOOTHING * frameTime));
      shake *= Math.exp(-10 * frameTime);
      shakeTime += frameTime;
      const jitter = shake * 0.06 * Math.sin(shakeTime * 70);
      // Côté rouge : tout le placement tourne d'un demi-tour autour du centre du terrain (Z opposé).
      camera.position.set(cameraX + jitter, CAMERA_HEIGHT + jitter * 0.5, viewSide * CAMERA_BACK);
      camera.lookAt(cameraX * 0.6, 0, -viewSide * CAMERA_LOOK_Z);
      if (!closeCamera) frameAll(alpha, frameTime);
      if (closeCamera === 'proche' || closeCamera === 'dos') {
        const p = lerp(near.prevPos, near.pos, alpha);
        const s = -viewSide;
        if (closeCamera === 'dos') camera.position.set(p.x + 0.6 * s, 1.7, p.z - 4.2 * s);
        else camera.position.set(p.x - 3.4 * s, 1.5, p.z + 2.6 * s);
        camera.lookAt(p.x, 1.0, p.z);
        if (camera.fov !== 40) {
          camera.fov = 40;
          camera.updateProjectionMatrix();
        }
      }

      duel.players.forEach((player, i) => updatePlayer(players[i]!, player, i, alpha, frameTime));

      const { ball: simBall, prevBallPos } = duel;
      let pos: Vec3 | null = null;
      if (simBall && prevBallPos) pos = lerp(prevBallPos, simBall.pos, alpha);
      else if (duel.phase === 'serve') pos = duel.servePosition();
      if (ballOffsetLeft > 0) {
        ballOffsetLeft = Math.max(0, ballOffsetLeft - frameTime);
        const k = ballOffsetLeft / BALL_CORRECTION_FADE;
        if (pos) pos = { x: pos.x + ballOffset.x * k, y: Math.max(0, pos.y + ballOffset.y * k), z: pos.z + ballOffset.z * k };
      }
      ball.update(pos, simBall && prevBallPos ? simBall.vel : null, camera, frozen ? 0 : frameTime);

      wallMarker.visible = false;
      for (const [i, player] of duel.players.entries()) {
        const chance = duel.counterWall(i);
        const t = duel.profile.rally.counterWall;
        if (!chance || chance.timing > t.late || chance.distance > t.reach + 1.5) continue;
        wallMarker.visible = true;
        wallMarker.position.set(chance.glass.x, Math.max(0.35, chance.glass.y), player.side * (HALF_LENGTH - 0.03));
        wallMaterial.color.set(chance.playable ? 0xffffff : players[i]!.color);
        wallMaterial.opacity = chance.playable ? 0.95 : 0.5;
        wallMarker.scale.setScalar(chance.playable ? 1.25 : 1);
        break;
      }

      bounceMarker.visible = false;
      if (simBall && duel.phase === 'rally') {
        const { bounce } = predictBall(simBall, duel.profile, 3, 64);
        if (bounce) {
          bounceMarker.position.set(bounce.x, 0.01, bounce.z);
          bounceMarker.visible = true;
          // Coup haut en préparation : on frappe la balle avant son rebond, le repère s'efface devant l'ombre.
          bounceMaterial.opacity = near.engagement?.kind === 'overhead' ? 0.25 : 0.85;
        }
      }
      effects?.update(frozen ? 0 : frameTime, camera, renderer.getDrawingBufferSize(drawingSize).y);
      updateOutline(camera);
      renderer.info.reset();
      if (postfx) postfx.render(frameTime);
      else renderer.render(scene, camera);
    },
  };
}
