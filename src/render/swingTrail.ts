import * as THREE from 'three';

/**
 * Arc de raquette (étape V7, `research/rendu/POLISH_VISUEL.md` §3.9) : un ruban lumineux balayé par le tamis pendant le
 * geste, de la préparation à la fin de l'accompagnement. Plus long et plus vif sur un coup fort, doré sur une frappe
 * parfaite. Le geste du personnage passe de l'armé à l'impact en une image : entre deux positions du tamis, le ruban
 * suit un arc de cercle autour de l'épaule plutôt qu'une corde droite.
 */
export interface SwingTrail {
  readonly object: THREE.Mesh;
  /** Commence un nouvel arc depuis la position précédente du tamis. */
  start(look: SwingLook): void;
  /**
   * Ajoute la position du tamis de cette image (`tip` : haut du tamis, `throat` : sa gorge, `pivot` : l'épaule, en
   * coordonnées du monde) si le geste est en cours, puis fait vieillir le ruban de `dt` secondes (0 : tout reste figé).
   */
  update(dt: number, tip: THREE.Vector3, throat: THREE.Vector3, pivot: THREE.Vector3, swinging: boolean): void;
}

export interface SwingLook {
  color: number;
  /** Éclat de 0 à 1. */
  strength: number;
  /** Durée de vie d'un point du ruban (s). */
  life: number;
}

/**
 * Allure de l'arc selon le coup, en trois tailles : discret sur un coup normal, net sur une frappe parfaite, vif et long
 * sur un smash. Un coup dans le vide garde un arc pâle (on voit le geste raté). [à calibrer à la manette]
 */
export function swingLook(shot: { perfect: boolean; overhead: string | null; speed: number } | null): SwingLook {
  if (!shot) return { color: 0xdfe8ff, strength: 0.18, life: 0.12 };
  const smash = shot.overhead === 'remate';
  const fast = Math.min(1, Math.max(0, (shot.speed - 10) / 20));
  const strength = shot.perfect ? 0.8 : 0.4 + 0.2 * fast;
  return {
    color: shot.perfect ? 0xffd46a : 0xeef4ff,
    strength: Math.min(1, strength + (smash ? 0.25 : 0)),
    life: 0.13 + 0.05 * fast + (smash ? 0.05 : 0) + (shot.perfect ? 0.03 : 0),
  };
}

/** Points du ruban gardés au plus, et angle (rad) au-delà duquel deux positions du tamis sont reliées par un arc. */
const CAPACITY = 48;
const ARC_STEP = 0.12;

const VERTEX = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor * vAlpha, 1.0);
  }
`;

export function createSwingTrail(): SwingTrail {
  // Deux sommets par point : le haut du tamis (opaque) et sa gorge (transparente), en bande de triangles indexée.
  const positions = new Float32Array(CAPACITY * 2 * 3);
  const alphas = new Float32Array(CAPACITY * 2);
  const index: number[] = [];
  for (let i = 0; i < CAPACITY - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const object = new THREE.Mesh(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 13;
  object.visible = false;

  /** Points du ruban, du plus ancien au plus récent. */
  const tips: THREE.Vector3[] = [];
  const throats: THREE.Vector3[] = [];
  const ages: number[] = [];
  const spare: THREE.Vector3[] = [];
  let look: SwingLook = swingLook(null);
  /** Dernière position connue du tamis (même hors du geste), pour partir de l'armé. */
  const lastTip = new THREE.Vector3();
  const lastThroat = new THREE.Vector3();
  const lastPivot = new THREE.Vector3();
  let known = false;
  let pendingStart = false;

  const vec = (v: THREE.Vector3): THREE.Vector3 => (spare.pop() ?? new THREE.Vector3()).copy(v);
  const push = (tip: THREE.Vector3, throat: THREE.Vector3): void => {
    if (tips.length >= CAPACITY) {
      spare.push(tips.shift()!, throats.shift()!);
      ages.shift();
    }
    tips.push(vec(tip));
    throats.push(vec(throat));
    ages.push(0);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const tipAt = new THREE.Vector3();
  const throatAt = new THREE.Vector3();
  /** Du point précédent au nouveau : arc autour de l'épaule (longueur et pivot interpolés). */
  const arcTo = (tip: THREE.Vector3, throat: THREE.Vector3, pivot: THREE.Vector3): void => {
    a.subVectors(lastTip, lastPivot);
    b.subVectors(tip, pivot);
    const la = a.length();
    const lb = b.length();
    const angle = la > 1e-4 && lb > 1e-4 ? a.angleTo(b) : 0;
    const steps = Math.min(16, Math.max(1, Math.ceil(angle / ARC_STEP)));
    na.copy(a).normalize();
    nb.copy(b).normalize();
    qa.setFromUnitVectors(na, nb);
    const ta = lastThroat.distanceTo(lastPivot);
    const tb = throat.distanceTo(pivot);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      q.identity().slerp(qa, t);
      p.lerpVectors(lastPivot, pivot, t);
      tipAt.copy(na).applyQuaternion(q).multiplyScalar(la + (lb - la) * t).add(p);
      // La gorge suit le même arc, à sa propre distance de l'épaule.
      throatAt.copy(na).applyQuaternion(q).multiplyScalar(ta + (tb - ta) * t).add(p);
      push(tipAt, throatAt);
    }
  };

  return {
    object,
    start(next: SwingLook): void {
      look = next;
      spare.push(...tips.splice(0), ...throats.splice(0));
      ages.length = 0;
      pendingStart = true;
    },
    update(dt: number, tip: THREE.Vector3, throat: THREE.Vector3, pivot: THREE.Vector3, swinging: boolean): void {
      for (let i = 0; i < ages.length; i++) ages[i]! += dt;
      while (ages.length > 0 && ages[0]! >= look.life) {
        spare.push(tips.shift()!, throats.shift()!);
        ages.shift();
      }
      // Tamis immobile (micro-pause, partie figée) : rien à ajouter, l'arc reste tel quel.
      if (swinging && (!known || tip.distanceToSquared(lastTip) > 1e-6 || pendingStart)) {
        if (pendingStart && known) push(lastTip, lastThroat);
        if (known && tips.length > 0) arcTo(tip, throat, pivot);
        else push(tip, throat);
        pendingStart = false;
      }
      lastTip.copy(tip);
      lastThroat.copy(throat);
      lastPivot.copy(pivot);
      known = true;

      const n = tips.length;
      object.visible = n >= 2;
      if (!object.visible) return;
      for (let i = 0; i < n; i++) {
        const t = tips[i]!;
        const g = throats[i]!;
        positions.set([t.x, t.y, t.z, g.x, g.y, g.z], i * 6);
        // Plus vif au point le plus récent, éteint en vieillissant ; la gorge est transparente (bord doux).
        const fresh = 1 - ages[i]! / look.life;
        const tail = (i + 1) / n;
        alphas[i * 2] = look.strength * fresh * fresh * (0.25 + 0.75 * tail);
        alphas[i * 2 + 1] = 0;
      }
      geometry.setDrawRange(0, (n - 1) * 6);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('aAlpha').needsUpdate = true;
      material.uniforms.uColor!.value.setHex(look.color, THREE.LinearSRGBColorSpace);
    },
  };
}
