import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, createCharacter, SWEET_SPOT, type CharacterRig } from '../../src/render/character';
import { computePose, strikeReach, SWING_FAMILIES, SWING_IN, type PoseInput } from '../../src/render/pose';

const still: PoseInput = { inPlay: true, prep: null, strike: null, speed: 0, heading: 0, bodyYaw: 0, stride: 0, time: 0 };

function sweetSpot(rig: CharacterRig): THREE.Vector3 {
  rig.object.updateWorldMatrix(true, true);
  return rig.racketMount.localToWorld(new THREE.Vector3(0, SWEET_SPOT, 0));
}

describe('IK du bras vers la balle', () => {
  it('amène le centre du tamis sur un point à portée, à chaque coup, droitier comme gaucher', () => {
    for (const mirror of [1, -1]) {
      for (const family of SWING_FAMILIES) {
        const rig = createCharacter(CHARACTERS[0]!, 0xff0000);
        rig.object.scale.x = mirror;
        const pose = computePose({ ...still, strike: { family, seconds: SWING_IN } });
        rig.apply(pose);
        // Vers le corps (le bras se plie) et un peu de côté : toujours à portée, même bras tendu dans la pose.
        const hand = rig.racketMount.localToWorld(new THREE.Vector3());
        const target = sweetSpot(rig).lerp(hand, 0.5).add(new THREE.Vector3(0.05, -0.04, 0.03));
        rig.apply(pose, { target, weight: 1 });
        expect(sweetSpot(rig).distanceTo(target)).toBeLessThan(0.01);
      }
    }
  });

  it('ne change rien à poids nul, et plie les jambes pour une balle trop basse', () => {
    const rig = createCharacter(CHARACTERS[1]!, 0xff0000);
    const pose = computePose({ ...still, strike: { family: 'fore', seconds: SWING_IN } });
    rig.apply(pose);
    const free = sweetSpot(rig);
    rig.apply(pose, { target: new THREE.Vector3(5, 5, 5), weight: 0 });
    expect(sweetSpot(rig).distanceTo(free)).toBeLessThan(1e-9);
    // Balle à 25 cm du sol : le bras seul n'y arrive pas, le bassin descend pour s'en approcher.
    const low = free.clone().setY(0.25);
    rig.apply(pose, { target: low, weight: 1 });
    expect(free.distanceTo(low)).toBeGreaterThan(0.3);
    expect(sweetSpot(rig).distanceTo(low)).toBeLessThan(0.15);
  });

  it('pèse plein à l’image d’impact, rien à la frappe ni après la fin du geste', () => {
    expect(strikeReach(0)).toBe(0);
    expect(strikeReach(SWING_IN)).toBeCloseTo(1, 6);
    expect(strikeReach(SWING_IN / 2)).toBeGreaterThan(0.3);
    expect(strikeReach(SWING_IN + 0.2)).toBe(0);
  });
});
