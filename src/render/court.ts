import * as THREE from 'three';
import {
  CENTER_LINE_OVERSHOOT,
  COURT_LENGTH,
  COURT_WIDTH,
  HALF_WIDTH,
  LINE_WIDTH,
  NET_HEIGHT_POSTS,
  SERVICE_LINE_DISTANCE,
} from '../sim/constants';
import { netHeightAt, PANELS, WALLS, type Panel } from '../sim/court';

const NET_BAND_HEIGHT = 0.05;
/** Taille d'une maille du grillage dessiné (plus grande que la vraie, pour rester lisible). */
const MESH_CELL = 0.1;

function createMeshTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  // Fond légèrement teinté : de loin, les mailles disparaissent mais le panneau reste visible.
  ctx.fillStyle = 'rgba(170, 185, 200, 0.22)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c9d2da';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPanel(panel: Panel, meshTexture: THREE.Texture): THREE.Mesh {
  const width = panel.max - panel.min;
  const height = panel.yMax - panel.yMin;

  let material: THREE.Material;
  if (panel.surface === 'glass') {
    material = new THREE.MeshBasicMaterial({
      color: 0x9fd4ee,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  } else {
    const map = meshTexture.clone();
    map.repeat.set(width / MESH_CELL, height / MESH_CELL);
    map.needsUpdate = true;
    material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  const wall = WALLS[panel.wall];
  const along = (panel.min + panel.max) / 2;
  const y = (panel.yMin + panel.yMax) / 2;
  if (wall.axis === 'x') {
    mesh.position.set(along, y, wall.offset);
  } else {
    mesh.position.set(wall.offset, y, along);
    mesh.rotation.y = Math.PI / 2;
  }
  return mesh;
}

function createGround(): THREE.Group {
  const group = new THREE.Group();

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshLambertMaterial({ color: 0x2b3138 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.01;
  group.add(surround);

  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_WIDTH, COURT_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0x2f6fb5 }),
  );
  turf.rotation.x = -Math.PI / 2;
  group.add(turf);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addLine = (x: number, z: number, sizeX: number, sizeZ: number): void => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), lineMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.004, z);
    group.add(line);
  };
  for (const side of [-1, 1]) {
    addLine(0, side * SERVICE_LINE_DISTANCE, COURT_WIDTH, LINE_WIDTH);
    const centerLength = SERVICE_LINE_DISTANCE + CENTER_LINE_OVERSHOOT;
    addLine(0, (side * centerLength) / 2, LINE_WIDTH, centerLength);
  }
  return group;
}

function createNet(): THREE.Group {
  const group = new THREE.Group();

  // Profil du filet entre deux hauteurs relatives au bord supérieur.
  const strip = (fromTop: number, toTop: number | null): THREE.ShapeGeometry => {
    const top = (x: number): number => netHeightAt(x) - fromTop;
    const bottom = (x: number): number => (toTop === null ? 0 : netHeightAt(x) - toTop);
    const shape = new THREE.Shape();
    shape.moveTo(-HALF_WIDTH, bottom(-HALF_WIDTH));
    shape.lineTo(0, bottom(0));
    shape.lineTo(HALF_WIDTH, bottom(HALF_WIDTH));
    shape.lineTo(HALF_WIDTH, top(HALF_WIDTH));
    shape.lineTo(0, top(0));
    shape.lineTo(-HALF_WIDTH, top(-HALF_WIDTH));
    return new THREE.ShapeGeometry(shape);
  };

  group.add(
    new THREE.Mesh(
      strip(NET_BAND_HEIGHT, null),
      new THREE.MeshBasicMaterial({
        color: 0x0c0f12,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
    new THREE.Mesh(
      strip(0, NET_BAND_HEIGHT),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    ),
  );

  const postMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1d21 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, NET_HEIGHT_POSTS), postMaterial);
    post.position.set(side * HALF_WIDTH, NET_HEIGHT_POSTS / 2, 0);
    group.add(post);
  }
  return group;
}

/** Terrain en formes simples, construit à partir de la géométrie de collision. */
export function createCourt(): THREE.Group {
  const court = new THREE.Group();
  court.add(createGround(), createNet());
  const meshTexture = createMeshTexture();
  for (const panel of PANELS) court.add(createPanel(panel, meshTexture));
  return court;
}
