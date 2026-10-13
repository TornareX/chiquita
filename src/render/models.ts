import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelName = 'court' | 'racket' | 'ball';

const loader = new GLTFLoader();

/**
 * Charge un modèle converti par tools/convert_assets.py (déjà en mètres, aligné sur le repère du jeu).
 * Retourne `null` s'il est absent ou illisible : le rendu garde alors ses formes simples.
 */
export async function loadModel(name: ModelName): Promise<THREE.Object3D | null> {
  try {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        // Vitres, grillage, filet : visibles des deux côtés, sans masquer ce qui est derrière.
        if (material.transparent) {
          material.depthWrite = false;
          material.side = THREE.DoubleSide;
        }
      }
    });
    return gltf.scene;
  } catch {
    return null;
  }
}

/** `?models=off` force les formes simples. */
export function modelsEnabled(): boolean {
  return new URLSearchParams(location.search).get('models') !== 'off';
}
