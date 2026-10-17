import * as THREE from 'three';
import { BANNER_LIFE, Effects, fade, FLASH_LIFE, meshOffset, ringOpening, type Effect } from './effects';

/**
 * Dessin des effets de balle et de vitre (`effects.ts`) : quatre appels de dessin au plus, aucun quand rien ne
 * se passe. Anneaux, étoiles et grillage sont des maillages instanciés en mélange additif (un effet s'éteint en
 * tendant vers le noir) ; poussière et étincelles, un nuage de points. Éclair et annonce du por tres : en HTML,
 * par-dessus le canevas.
 */
export interface EffectsView {
  readonly effects: Effects;
  /** `dt` : temps réel écoulé (s), 0 pendant la micro-pause. */
  update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void;
}

/** `?effets=0` coupe les effets. */
export function effectsEnabled(): boolean {
  return new URLSearchParams(location.search).get('effets') !== '0';
}

/** Au-delà de cette distance à la caméra (m), les effets grandissent pour rester lisibles au fond, comme la balle. */
const FAR_DISTANCE = 28;

/** Étoile à huit branches, longues et courtes en alternance, dans le plan XY. */
function starGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const points = 16;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const radius = i % 2 === 1 ? 0.16 : i % 4 === 0 ? 1 : 0.55;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape);
}

/** Losanges du grillage, blancs, estompés vers les bords : la tache de grillage qui s'éclaire. */
function meshTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    const step = size / 6;
    g.beginPath();
    for (let k = -size; k <= 2 * size; k += step) {
      g.moveTo(k, 0);
      g.lineTo(k + size, size);
      g.moveTo(k, size);
      g.lineTo(k + size, 0);
    }
    g.stroke();
    // Estompe : seul le centre reste.
    g.globalCompositeOperation = 'destination-in';
    const halo = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    halo.addColorStop(0, 'rgba(255,255,255,1)');
    halo.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uPixels;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(2.0, aSize * uPixels / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * (1.0 - r * r));
  }
`;

const POINT_ATTRIBUTES = ['position', 'aColor', 'aAlpha', 'aSize'] as const;

function createOverlay(): { flash: HTMLDivElement; banner: HTMLDivElement } {
  const flash = document.createElement('div');
  flash.id = 'effect-flash';
  Object.assign(flash.style, {
    position: 'fixed',
    inset: '0',
    background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(255,236,170,0.7))',
    pointerEvents: 'none',
    opacity: '0',
    zIndex: '5',
  });
  const banner = document.createElement('div');
  banner.id = 'effect-banner';
  Object.assign(banner.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    top: '26%',
    textAlign: 'center',
    font: 'italic 900 clamp(48px, 9vw, 120px) system-ui, sans-serif',
    letterSpacing: '0.02em',
    color: '#ffd23f',
    textShadow: '0 0 18px rgba(255,170,30,0.8), 0 5px 0 #b04a00, 0 8px 18px rgba(0,0,0,0.6)',
    WebkitTextStroke: '3px #3a1800',
    pointerEvents: 'none',
    opacity: '0',
    zIndex: '6',
  });
  document.body.append(flash, banner);
  return { flash, banner };
}

export function createEffectsView(scene: THREE.Scene, clippingPlanes: THREE.Plane[] = []): EffectsView {
  const effects = new Effects();
  const capacity = effects.effects.items.length;
  const glow = {
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    clippingPlanes,
    clipIntersection: true,
  } as const;
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(0));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 15;
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  const rings = instanced(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial(glow));
  const stars = instanced(starGeometry(), new THREE.MeshBasicMaterial(glow));
  const meshes = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ ...glow, map: meshTexture() }));

  // Poussière et étincelles : un nuage de points à attributs dynamiques, lus de la réserve de particules.
  const particleCount = effects.particles.items.length;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const alphas = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const pointGeometry = new THREE.BufferGeometry();
  const attribute = (array: Float32Array, size: number): THREE.BufferAttribute =>
    new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
  pointGeometry.setAttribute('position', attribute(positions, 3));
  pointGeometry.setAttribute('aColor', attribute(colors, 3));
  pointGeometry.setAttribute('aAlpha', attribute(alphas, 1));
  pointGeometry.setAttribute('aSize', attribute(sizes, 1));
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixels: { value: 1000 } },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 14;
  points.visible = false;
  scene.add(points);

  const overlay = createOverlay();
  let flashShown = false;
  let bannerShown: string | null = null;

  // Objets de travail, réutilisés à chaque image.
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const facing = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const color = new THREE.Color();

  /** Agrandissement au fond, et orientation : face à la caméra, ou sur le plan de la surface. */
  const place = (e: Effect, camera: THREE.PerspectiveCamera, billboard: boolean): number => {
    position.set(e.x, e.y, e.z);
    if (billboard) facing.copy(camera.quaternion);
    else facing.setFromUnitVectors(zAxis, normal.set(e.nx, e.ny, e.nz));
    return Math.max(1, camera.position.distanceTo(position) / FAR_DISTANCE);
  };
  const write = (mesh: THREE.InstancedMesh, index: number, size: number, hex: number, brightness: number): void => {
    scale.set(size, size, size);
    matrix.compose(position, facing, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(hex).multiplyScalar(brightness));
  };
  const finish = (mesh: THREE.InstancedMesh, count: number): void => {
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  };

  return {
    effects,
    update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
      effects.update(dt);

      let ringCount = 0;
      let starCount = 0;
      let meshCount = 0;
      for (const e of effects.effects.items) {
        if (!e.active || e.age < 0) continue;
        const t = e.age / e.life;
        if (e.kind === 'mesh') {
          const far = place(e, camera, false);
          position.addScaledVector(normal, meshOffset(e.age, e.strength));
          // Vu de la caméra, un grillage latéral est presque de profil : la tache se tourne à moitié vers elle.
          toCamera.subVectors(camera.position, position).normalize();
          facing.setFromUnitVectors(zAxis, toCamera.addScaledVector(normal, 0.6).normalize());
          write(meshes, meshCount++, e.size * far, e.color, (0.6 + 0.6 * e.strength) * fade(t));
          continue;
        }
        const far = place(e, camera, e.kind !== 'glass');
        // Une vitre se voit toujours, même touchée doucement.
        const brightness = e.kind === 'glass' ? 0.45 + 0.55 * e.strength : e.strength;
        write(rings, ringCount++, e.size * far * (0.15 + 0.85 * ringOpening(t)), e.color, brightness * fade(t));
        if (e.star) {
          // Étoile qui jaillit et tourne, éteinte avant l'anneau.
          spin.setFromAxisAngle(zAxis, 0.4 + t * 1.6);
          facing.multiply(spin);
          write(stars, starCount++, e.size * far * 0.75 * (0.5 + 0.5 * ringOpening(t * 2)), e.color, 1.2 * e.strength * fade(t * 1.5));
        }
      }
      finish(rings, ringCount);
      finish(stars, starCount);
      finish(meshes, meshCount);

      let pointCount = 0;
      for (const p of effects.particles.items) {
        if (!p.active) continue;
        const k = pointCount++;
        positions[k * 3] = p.x;
        positions[k * 3 + 1] = p.y;
        positions[k * 3 + 2] = p.z;
        // Couleur sRGB telle quelle : le nuage de points n'applique pas de conversion à la sortie.
        color.setHex(p.color, THREE.LinearSRGBColorSpace);
        colors[k * 3] = color.r;
        colors[k * 3 + 1] = color.g;
        colors[k * 3 + 2] = color.b;
        alphas[k] = p.alpha * (1 - p.age / p.life);
        const far = Math.max(1, camera.position.distanceTo(position.set(p.x, p.y, p.z)) / FAR_DISTANCE);
        sizes[k] = p.size * far;
      }
      points.visible = pointCount > 0;
      if (pointCount > 0) {
        pointGeometry.setDrawRange(0, pointCount);
        for (const name of POINT_ATTRIBUTES) pointGeometry.getAttribute(name).needsUpdate = true;
        pointMaterial.uniforms.uPixels!.value = viewportHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      }

      // Por tres : éclair bref puis annonce qui grossit d'un coup et s'efface.
      const flash = effects.flashAge < FLASH_LIFE ? 0.75 * fade(effects.flashAge / FLASH_LIFE) : 0;
      if (flash > 0 || flashShown) {
        overlay.flash.style.opacity = flash.toFixed(3);
        flashShown = flash > 0;
      }
      const text = effects.banner;
      if (text !== bannerShown) {
        overlay.banner.textContent = text ?? '';
        bannerShown = text;
        if (!text) overlay.banner.style.opacity = '0';
      }
      if (text) {
        const t = effects.bannerAge / BANNER_LIFE;
        const pop = t < 0.12 ? 1.6 - (t / 0.12) * 0.6 : 1 + 0.04 * (t - 0.12);
        overlay.banner.style.opacity = (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25).toFixed(3);
        overlay.banner.style.transform = `scale(${pop.toFixed(3)}) rotate(-4deg)`;
      }
    },
  };
}
