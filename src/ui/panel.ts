import { EXERCISES } from '../sim/exercises';
import { MAX_INTERVAL, MIN_INTERVAL } from '../sim/machine';
import type { World } from '../sim/world';

export interface PanelActions {
  startExercise(id: string): void;
  setDifficulty(value: number): void;
  togglePause(): void;
  replay(): void;
}

export interface Panel {
  /** À appeler à chaque image. Le panneau n'est visible que quand la souris est libre. */
  update(world: World, active: boolean): void;
}

function slider(label: string, min: number, max: number, step: number): {
  row: HTMLLabelElement;
  input: HTMLInputElement;
  value: HTMLSpanElement;
} {
  const row = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const value = document.createElement('span');
  value.className = 'value';
  row.append(text, input, value);
  return { row, input, value };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

/** Panneau de réglage de l'exercice : choix, cadence, difficulté, pause, rejeu. */
export function createPanel(actions: PanelActions): Panel {
  const panel = document.createElement('div');
  panel.id = 'panel';

  const title = document.createElement('h2');
  title.textContent = 'Exercice';
  const list = document.createElement('div');
  list.className = 'exercises';
  const exerciseButtons = EXERCISES.map((exercise, index) => {
    const element = button(`${index + 1} · ${exercise.name}`, () => actions.startExercise(exercise.id));
    element.dataset.exercise = exercise.id;
    list.append(element);
    return element;
  });

  const cadence = slider('Cadence', MIN_INTERVAL, MAX_INTERVAL, 0.5);
  const difficulty = slider('Difficulté', 0, 100, 5);
  const pause = button('', actions.togglePause);
  pause.dataset.action = 'pause';
  const replay = button('Rejouer la balle (R)', actions.replay);
  replay.dataset.action = 'replay';
  const buttons = document.createElement('div');
  buttons.className = 'actions';
  buttons.append(pause, replay);

  panel.append(title, list, cadence.row, difficulty.row, buttons);
  document.body.append(panel);

  let world: World | null = null;
  cadence.input.addEventListener('input', () => world?.machine?.setInterval(Number(cadence.input.value)));
  difficulty.input.addEventListener('input', () => actions.setDifficulty(Number(difficulty.input.value) / 100));

  return {
    update(current: World, active: boolean): void {
      world = current;
      panel.hidden = active;
      if (active) return;
      const machine = current.machine;
      for (const element of exerciseButtons) {
        element.classList.toggle('selected', element.dataset.exercise === machine?.exercise.id);
      }
      pause.textContent = current.paused ? 'Reprendre (P)' : 'Pause (P)';
      if (!machine) return;
      // Ne pas écraser un curseur que l'utilisateur est en train de déplacer.
      if (document.activeElement !== cadence.input) cadence.input.value = String(machine.interval);
      if (document.activeElement !== difficulty.input) difficulty.input.value = String(Math.round(machine.difficulty * 100));
      cadence.value.textContent = `une balle toutes les ${machine.interval} s`;
      difficulty.value.textContent = `${Math.round(machine.difficulty * 100)} %`;
    },
  };
}
