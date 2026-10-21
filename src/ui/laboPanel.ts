import './annexes.css';
import { AI_LEVEL_NAMES, type AiLevel } from '../sim/bot';
import { FEEL_LIMITS, FEEL_PRESETS, type FeelTuning } from '../sim/feel';
import { ARCADE } from '../sim/profile';
import { SITUATIONS, type Situation } from '../sim/situations';
import { formatButtons, sourceKey, type InputSource } from './buttonIcons';
import type { StoredFeel } from './feelStorage';

export interface LaboActions {
  chooseSituation(situation: Situation): void;
  replay(): void;
  setLevel(level: AiLevel): void;
  /** Un réglage de sensation a changé (curseur, préréglage, ou case « en match »). */
  feelChanged(): void;
}

export interface LaboPanel {
  /** Score de la situation en cours ; `buttons` : manette ou clavier du joueur, pour les indices. */
  update(won: number, played: number, buttons: InputSource): void;
}

const FEEL_LABELS: Record<keyof FeelTuning, string> = {
  gravity: 'Gravité (vol de la balle)',
  groundBounce: 'Rebond au sol',
  groundGrip: 'Adhérence du sol',
  glassBounce: 'Rebond des vitres',
  shotSpeed: 'Vitesse des coups',
  sliceBounce: 'Balle coupée qui s’écrase',
  runSpeed: 'Vitesse de course',
};

const UNITS: Partial<Record<keyof FeelTuning, (v: number) => string>> = {
  gravity: (v) => `${v.toFixed(1)} m/s²`,
  shotSpeed: (v) => `×${v.toFixed(2)} (${Math.round(v * ARCADE.rally.normal.speed * 3.6)} km/h)`,
  runSpeed: (v) => `${v.toFixed(1)} m/s`,
};

const LEVEL_NAMES: Record<AiLevel, string> = { facile: 'IA facile', normal: 'IA normale', fort: 'IA forte' };

/**
 * Panneau du labo de sensations : la situation de match rejouée en boucle, l'adversaire, et les
 * curseurs de sensation, qui s'appliquent tout de suite. « Copier » donne les valeurs à transmettre.
 */
export function createLaboPanel(stored: StoredFeel, level: AiLevel, actions: LaboActions): LaboPanel {
  const panel = document.createElement('div');
  panel.id = 'panel';
  const heading = (text: string): HTMLHeadingElement => {
    const h = document.createElement('h2');
    h.textContent = text;
    panel.append(h);
    return h;
  };
  const button = (label: string, onClick: () => void, parent: HTMLElement = panel): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      onClick();
      // Le focus resterait sur le bouton : Espace ou Entrée le recliqueraient pendant le jeu.
      b.blur();
    });
    parent.append(b);
    return b;
  };

  heading('Situation de match');
  const list = document.createElement('div');
  list.className = 'exercises';
  panel.append(list);
  const hint = document.createElement('p');
  hint.className = 'labo-hint';
  const score = document.createElement('p');
  score.className = 'labo-score';
  const situationButtons = SITUATIONS.map((situation) => {
    const b = button(situation.name, () => select(situation), list);
    b.dataset.situation = situation.id;
    return b;
  });
  let current: Situation | null = null;
  let hintKey = '';
  const select = (situation: Situation): void => {
    for (const b of situationButtons) b.classList.toggle('selected', b.dataset.situation === situation.id);
    current = situation;
    hintKey = '';
    actions.chooseSituation(situation);
  };
  panel.append(hint, score);
  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions';
  panel.append(actionsRow);
  button('Rejouer la situation (R)', () => actions.replay(), actionsRow);

  heading('Adversaire');
  const levelSelect = document.createElement('select');
  for (const name of AI_LEVEL_NAMES) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = LEVEL_NAMES[name];
    levelSelect.append(option);
  }
  levelSelect.value = level;
  levelSelect.addEventListener('change', () => {
    actions.setLevel(levelSelect.value as AiLevel);
    levelSelect.blur();
  });
  panel.append(levelSelect);

  heading('Sensations');
  const presets = document.createElement('div');
  presets.className = 'speeds';
  panel.append(presets);
  const sliders = (Object.keys(FEEL_LIMITS) as (keyof FeelTuning)[]).map((key) => {
    const { min, max, step } = FEEL_LIMITS[key];
    const row = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = FEEL_LABELS[key];
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const value = document.createElement('span');
    value.className = 'value';
    const show = (): void => {
      input.value = String(stored.feel[key]);
      value.textContent = UNITS[key]?.(stored.feel[key]) ?? stored.feel[key].toFixed(2);
    };
    input.addEventListener('input', () => {
      stored.feel[key] = Number(input.value);
      show();
      actions.feelChanged();
    });
    input.addEventListener('change', () => input.blur());
    row.append(text, input, value);
    panel.append(row);
    show();
    return show;
  });
  for (const preset of Object.values(FEEL_PRESETS)) {
    button(
      preset.name,
      () => {
        stored.feel = { ...preset.feel };
        for (const show of sliders) show();
        actions.feelChanged();
      },
      presets,
    );
  }

  const inMatch = document.createElement('label');
  inMatch.className = 'check';
  const inMatchBox = document.createElement('input');
  inMatchBox.type = 'checkbox';
  inMatchBox.checked = stored.inMatch;
  inMatchBox.addEventListener('change', () => {
    stored.inMatch = inMatchBox.checked;
    actions.feelChanged();
    inMatchBox.blur();
  });
  const inMatchText = document.createElement('span');
  inMatchText.textContent = 'Utiliser ces sensations en match';
  inMatch.append(inMatchBox, inMatchText);
  panel.append(inMatch);

  const copied = document.createElement('textarea');
  copied.readOnly = true;
  copied.rows = 4;
  copied.hidden = true;
  const bottom = document.createElement('div');
  bottom.className = 'actions';
  panel.append(bottom);
  button(
    'Copier les réglages',
    () => {
      copied.value = JSON.stringify(stored.feel);
      copied.hidden = false;
      copied.select();
      void navigator.clipboard?.writeText(copied.value).catch(() => undefined);
    },
    bottom,
  );
  panel.append(copied);
  button('Retour à l’accueil', () => (location.search = ''), bottom);

  document.body.append(panel);
  // `?situation=lob-court` : la situation choisie dans « Entraînement » ; sinon la première.
  const asked = new URLSearchParams(location.search).get('situation');
  select(SITUATIONS.find((s) => s.id === asked) ?? SITUATIONS[0]!);
  return {
    update(won: number, played: number, buttons: InputSource): void {
      const key = `${current?.id}|${sourceKey(buttons)}`;
      if (current && key !== hintKey) {
        hintKey = key;
        hint.innerHTML = formatButtons(current.hint, buttons);
      }
      score.textContent = played > 0 ? `Points gagnés : ${won} sur ${played}` : 'Joue le point ; il recommence tout seul.';
    },
  };
}
