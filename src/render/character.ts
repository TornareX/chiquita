import * as THREE from 'three';
import { PLAYER_HEIGHT } from '../sim/constants';
import type { Pose, V3 } from './pose';

/**
 * Personnages cartoon (GAME_DESIGN.md §9, étape E) : grosse tête façon Wii Sports, maillot à la couleur
 * de l'équipe, contour sombre pour se lire de loin avec la caméra télé. Quatre personnages inventés,
 * tous identiques côté jeu : seule l'apparence change.
 */
export interface CharacterLook {
  name: string;
  skin: number;
  hair: number;
  hairStyle: 'court' | 'queue' | 'chignon' | 'boucles';
  accessory: 'casquette' | 'bandeau' | 'visiere' | 'aucun';
  accessoryColor: number;
  shorts: number;
}

export const CHARACTERS: readonly CharacterLook[] = [
  { name: 'Lucho', skin: 0xe0ac7e, hair: 0x2b1a10, hairStyle: 'court', accessory: 'casquette', accessoryColor: 0xffffff, shorts: 0x1d2a44 },
  { name: 'Paloma', skin: 0xf3d0b0, hair: 0x7a3b16, hairStyle: 'queue', accessory: 'bandeau', accessoryColor: 0xffffff, shorts: 0x2a1d24 },
  { name: 'Inés', skin: 0x8d5a3b, hair: 0x15100c, hairStyle: 'chignon', accessory: 'visiere', accessoryColor: 0xffd23f, shorts: 0xf2f2f2 },
  { name: 'Nico', skin: 0xf1c9a5, hair: 0xd9a441, hairStyle: 'boucles', accessory: 'bandeau', accessoryColor: 0x20262c, shorts: 0xf2f2f2 },
];

/** Épaisseur du contour (m) : ~1,5 px au fond du terrain avec la caméra télé. [à calibrer] */
const OUTLINE = 0.018;
// Proportions (m) pour 1,80 m : jambes jusqu'au bassin, buste, grosse tête dont le haut est à la taille du joueur.
const THIGH = 0.4;
const SHIN = 0.4;
const FOOT_H = 0.06;
const HIP_Y = THIGH + SHIN + FOOT_H;
const TORSO = 0.46;
const SHOULDER_W = 0.2;
const UPPER_ARM = 0.26;
const FOREARM = 0.25;
const HEAD_R = 0.2;

let toonGradient: THREE.DataTexture | null = null;
/** Ombrage en trois aplats, comme un dessin animé. */
function gradient(): THREE.DataTexture {
  if (!toonGradient) {
    toonGradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x10141a, side: THREE.BackSide });

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient() });
}

/** Volume avec son contour : la même forme gonflée de `OUTLINE`, vue de l'intérieur. */
function blob(shape: (pad: number) => THREE.BufferGeometry, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(shape(0), material), new THREE.Mesh(shape(OUTLINE), outlineMaterial));
  return group;
}

const capsule = (radius: number, length: number) => (pad: number) =>
  new THREE.CapsuleGeometry(radius + pad, length, 4, 10).translate(0, -length / 2 - radius, 0);
const sphere = (radius: number) => (pad: number) => new THREE.SphereGeometry(radius + pad, 18, 12);

export interface CharacterRig {
  object: THREE.Group;
  /** À ajouter au corps : la raquette, tenue dans la main droite, manche le long de +Y local. */
  racketMount: THREE.Group;
  apply(pose: Pose): void;
}

/** Raquette aux dimensions réglementaires (45,5 cm, tamis 26 × 29 cm) ; la main tient le manche à 6 cm du bout. */
function createRacket(): THREE.Group {
  const racket = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.038, 28), toon(0x20262c));
  frame.rotation.x = Math.PI / 2;
  frame.scale.set(1, 1, 1.12);
  frame.position.y = 0.165 + 0.145 - 0.06;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.165, 0.03), toon(0xe8e8e8));
  handle.position.y = 0.0825 - 0.06;
  racket.add(frame, handle);
  return racket;
}

function headGear(look: CharacterLook, head: THREE.Group): void {
  const hair = toon(look.hair);
  // Cheveux : calotte sur l'arrière et le haut de la tête.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.04, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.rotation.x = -0.35;
  head.add(cap);
  if (look.hairStyle === 'queue') {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), hair);
    tail.position.set(0, -0.02, -HEAD_R - 0.04);
    tail.rotation.x = 0.5;
    head.add(tail);
  } else if (look.hairStyle === 'chignon') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), hair);
    bun.position.set(0, 0.12, -HEAD_R + 0.02);
    head.add(bun);
  } else if (look.hairStyle === 'boucles') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hair);
      curl.position.set(Math.cos(a) * 0.15, 0.13 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.15 - 0.03);
      head.add(curl);
    }
  }
  const gear = toon(look.accessoryColor);
  if (look.accessory === 'bandeau') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R * 1.02, 0.025, 6, 24), gear);
    band.rotation.x = Math.PI / 2 - 0.15;
    band.position.y = 0.06;
    head.add(band);
  } else if (look.accessory === 'casquette' || look.accessory === 'visiere') {
    if (look.accessory === 'casquette') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.07, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), gear);
      crown.rotation.x = -0.2;
      head.add(crown);
    } else {
      const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R * 1.02, 0.02, 6, 24), gear);
      band.rotation.x = Math.PI / 2 - 0.15;
      band.position.y = 0.07;
      head.add(band);
    }
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), gear);
    visor.position.set(0, 0.09, HEAD_R * 0.75);
    visor.rotation.x = 0.15;
    head.add(visor);
  }
  // Yeux : deux points noirs, visibles sur les joueurs d'en face.
  for (const x of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x10141a }));
    eye.position.set(x, 0.0, HEAD_R * 0.93);
    eye.scale.set(1, 1.4, 0.6);
    head.add(eye);
  }
}

interface Limb {
  root: THREE.Group;
  joint: THREE.Group;
  end: THREE.Group;
}

/** Membre en deux segments : `root` à l'articulation haute, `joint` au coude ou au genou, `end` au bout. */
function limb(upper: number, lower: number, radius: number, upperMat: THREE.Material, lowerMat: THREE.Material): Limb {
  const root = new THREE.Group();
  root.add(blob(capsule(radius, upper - 2 * radius), upperMat));
  const joint = new THREE.Group();
  joint.position.y = -upper;
  joint.add(blob(capsule(radius * 0.9, lower - 2 * radius * 0.9), lowerMat));
  const end = new THREE.Group();
  end.position.y = -lower;
  joint.add(end);
  root.add(joint);
  return { root, joint, end };
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmpDir = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

function pointLimb(limbRoot: THREE.Group, dir: V3): void {
  tmpDir.set(dir[0], dir[1], dir[2]).normalize();
  limbRoot.quaternion.setFromUnitVectors(DOWN, tmpDir);
}

/**
 * Crée un personnage. `jersey` : couleur de l'équipe (plus claire pour le partenaire en double).
 * `height` : taille du joueur simulé ; tout le corps est mis à l'échelle.
 */
export function createCharacter(look: CharacterLook, jersey: number, height = PLAYER_HEIGHT): CharacterRig {
  const object = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(height / PLAYER_HEIGHT);
  object.add(body);

  const skin = toon(look.skin);
  const shirt = toon(jersey);
  const shorts = toon(look.shorts);
  const shoe = toon(0xf4f4f4);

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);
  const pelvis = blob((pad) => new THREE.CylinderGeometry(0.17 + pad, 0.15 + pad, 0.2 + pad, 12).translate(0, -0.04, 0), shorts);
  hips.add(pelvis);

  const legs = ([-1, 1] as const).map((s) => {
    const leg = limb(THIGH, SHIN, 0.075, shorts, skin);
    leg.root.position.set(s * 0.09, -0.06, 0);
    const foot = blob((pad) => new THREE.BoxGeometry(0.1 + pad, FOOT_H + pad, 0.2 + pad).translate(0, -FOOT_H / 2, 0.04), shoe);
    leg.end.add(foot);
    hips.add(leg.root);
    return leg;
  });

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(blob((pad) => new THREE.CapsuleGeometry(0.17 + pad, TORSO - 0.24, 4, 12).translate(0, TORSO / 2, 0).scale(1.18, 1, 0.85), shirt));

  const head = new THREE.Group();
  head.position.y = TORSO + 0.08 + HEAD_R;
  head.add(blob(sphere(HEAD_R), skin));
  headGear(look, head);
  torso.add(head);

  const arms = ([-1, 1] as const).map((s) => {
    const arm = limb(UPPER_ARM, FOREARM, 0.055, shirt, skin);
    arm.root.position.set(s * SHOULDER_W, TORSO - 0.04, 0);
    arm.end.add(blob(sphere(0.06), skin));
    torso.add(arm.root);
    return arm;
  });
  // Bras droit du joueur : côté -X (il regarde vers +Z).
  const armR = arms[0]!;
  const armL = arms[1]!;
  const legR = legs[0]!;
  const legL = legs[1]!;

  const racketMount = new THREE.Group();
  racketMount.add(createRacket());
  armR.end.add(racketMount);

  const handInv = new THREE.Quaternion();
  return {
    object,
    racketMount,
    apply(pose: Pose): void {
      body.rotation.y = pose.bodyYaw;
      hips.position.y = HIP_Y - pose.crouch + pose.bob + pose.jump;
      // Les hanches tournent avec les épaules (jambes comprises : les pieds pivotent), le buste fait le reste.
      hips.rotation.y = pose.hipTwist;
      torso.rotation.set(pose.lean, pose.twist - pose.hipTwist, 0, 'YXZ');
      // La tête compense la moitié de la torsion : le joueur regarde la balle.
      head.rotation.y = -pose.twist * 0.5;

      // Genoux fléchis pour abaisser le bassin de `crouch`, pieds sous le corps, plus la foulée.
      const bend = 2 * Math.acos(Math.min(1, Math.max(-1, 1 - pose.crouch / (THIGH + SHIN))));
      for (const [leg, lp] of [[legR, pose.legR], [legL, pose.legL]] as const) {
        leg.root.rotation.set(-bend / 2 + lp.swing, 0, lp.spread);
        leg.joint.rotation.x = bend + lp.knee;
        leg.end.rotation.x = -(lp.swing + bend / 2 + lp.knee) * 0.6;
      }

      pointLimb(armR.root, pose.armR);
      armR.joint.rotation.x = -pose.elbowR;
      pointLimb(armL.root, pose.armL);
      armL.joint.rotation.x = -0.4;

      // Raquette : manche le long de `racket`, tamis tourné vers `face`, dans le repère du buste.
      ay.set(pose.racket[0], pose.racket[1], pose.racket[2]).normalize();
      az.set(pose.face[0], pose.face[1], pose.face[2]);
      az.addScaledVector(ay, -az.dot(ay));
      if (az.lengthSq() < 1e-6) az.set(0, 0, 1).addScaledVector(ay, -ay.z);
      az.normalize();
      ax.crossVectors(ay, az);
      tmpM.makeBasis(ax, ay, az);
      tmpQ.setFromRotationMatrix(tmpM);
      handInv.copy(armR.root.quaternion).multiply(armR.joint.quaternion).invert();
      racketMount.quaternion.copy(handInv).multiply(tmpQ);
    },
  };
}
