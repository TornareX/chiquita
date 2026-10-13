import { createView } from './render/scene';
import { SIM_DT } from './sim/constants';
import { FixedStepLoop } from './sim/loop';
import { World } from './sim/world';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');

const world = new World();
const view = createView(canvas);
const loop = new FixedStepLoop(SIM_DT, () => world.step());

const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
if (debug) window.__sim = { world };

let last = performance.now();
const frame = (now: number): void => {
  const alpha = loop.advance((now - last) / 1000);
  last = now;
  view.render(alpha);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
