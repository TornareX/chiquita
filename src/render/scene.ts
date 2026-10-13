import * as THREE from 'three';

export interface View {
  /** `alpha` : fraction de pas de simulation écoulée, pour interpoler entre deux états. */
  render(alpha: number): void;
}

export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);

  // Repère provisoire en attendant le terrain : grille au sol (1 m par case) et axes à l'origine.
  scene.add(new THREE.GridHelper(20, 20, 0x5fa8d3, 0x33475b));
  scene.add(new THREE.AxesHelper(1));

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
  camera.position.set(0, 1.7, -8);
  camera.lookAt(0, 1, 0);

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
    render(_alpha: number): void {
      renderer.render(scene, camera);
    },
  };
}
