/**
 * Sticks droits virtuels : le clavier et la souris bougent un stick comme le pouce sur une manette. Le geste se
 * reconnaît ensuite avec le même code (`SwingStick`) : mêmes gestes, mêmes seuils, même ressenti.
 */
export interface StickAxes {
  right: number;
  up: number;
}

const CENTER: StickAxes = { right: 0, up: 0 };

/**
 * Touches lâchées : le stick reste où il était tant de temps (s) avant de revenir au centre. Passer de K à I
 * laisse un petit trou sans touche, qui ne doit pas compter comme un stick lâché (la chiquita). [à calibrer en jouant]
 */
export const KEY_GRACE = 0.08;

/** Pixels de souris pour pousser le stick virtuel jusqu'au bord. [à calibrer en jouant] */
export const MOUSE_RANGE = 90;

/** Le plus poussé des deux sticks. */
export function strongest(a: StickAxes, b: StickAxes): StickAxes {
  return Math.hypot(b.right, b.up) > Math.hypot(a.right, a.up) ? b : a;
}

/** Ramène un point dans le disque unité, comme le bord d'un stick. */
function clampDisk(right: number, up: number): StickAxes {
  const magnitude = Math.hypot(right, up);
  return magnitude > 1 ? { right: right / magnitude, up: up / magnitude } : { right, up };
}

/**
 * Stick droit au clavier, quatre directions et leurs diagonales. Deux touches opposées : la dernière pressée
 * l'emporte, pour enchaîner sans attendre (K encore enfoncé quand on presse I : le stick part vers l'avant).
 */
export class KeyStick {
  private order = new Map<string, number>();
  private presses = 0;
  private last: StickAxes = CENTER;
  private releasedFor = 0;

  /** Une touche vient d'être pressée (sans répétition). */
  press(code: string): void {
    this.order.set(code, ++this.presses);
  }

  update(keys: { up: string[]; down: string[]; left: string[]; right: string[] }, held: ReadonlySet<string>, dt: number): StickAxes {
    const latest = (codes: string[]): number => Math.max(0, ...codes.filter((c) => held.has(c)).map((c) => this.order.get(c) ?? 1));
    const axis = (positive: string[], negative: string[]): number => {
      const p = latest(positive);
      const n = latest(negative);
      return p === n ? 0 : p > n ? 1 : -1;
    };
    const right = axis(keys.right, keys.left);
    const up = axis(keys.up, keys.down);
    if (right !== 0 || up !== 0) {
      this.releasedFor = 0;
      this.last = clampDisk(right, up);
      return this.last;
    }
    this.releasedFor += dt;
    if (this.releasedFor >= KEY_GRACE) this.last = CENTER;
    return this.last;
  }
}

/**
 * Stick droit à la souris : bouton gauche enfoncé, c'est le pouce posé sur le stick ; les mouvements le poussent
 * (`MOUSE_RANGE` pixels jusqu'au bord) et il reste où on l'a laissé ; bouton relâché, le stick revient au centre.
 * Tirer la souris vers soi arme, la pousser vers l'écran frappe, par un côté c'est l'arc, relâcher c'est le lâché.
 */
export class MouseStick {
  private pos: StickAxes = CENTER;
  private down = false;

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      this.down = true;
      this.pos = CENTER;
      // Le geste continue même si la souris sort du canevas.
      target.setPointerCapture(event.pointerId);
    });
    target.addEventListener('pointermove', (event) => {
      if (!this.down) return;
      this.pos = clampDisk(this.pos.right + event.movementX / MOUSE_RANGE, this.pos.up - event.movementY / MOUSE_RANGE);
    });
    const release = (): void => {
      this.down = false;
      this.pos = CENTER;
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
    target.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', release);
  }

  read(): StickAxes {
    return this.pos;
  }
}

/** Écran tactile comme pointeur principal (téléphone, tablette) : sticks tactiles, plein écran, rendu allégé. */
export const TOUCH_SCREEN = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * Téléphone : plein écran et paysage au premier doigt levé (le navigateur ne l'accepte qu'après un geste), puis à
 * chaque fois qu'on en est sorti. Sans effet là où le navigateur ne le permet pas (iPhone : ajouter à l'écran d'accueil).
 */
export function fullscreenOnTouch(): void {
  if (!TOUCH_SCREEN) return;
  window.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType !== 'touch' || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    },
    true,
  );
}

/** Pixels de doigt pour pousser un stick tactile jusqu'au bord. [à calibrer en jouant] */
export const TOUCH_RANGE = 60;

/** Un stick tactile : posé là où le doigt touche l'écran, poussé par le glissé, recentré au lever. */
class TouchStick {
  pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private pos: StickAxes = CENTER;
  private readonly base = document.createElement('div');
  private readonly knob = document.createElement('div');

  constructor() {
    this.base.className = 'touch-stick';
    this.knob.className = 'touch-stick-knob';
    this.base.append(this.knob);
    this.base.hidden = true;
    document.body.append(this.base);
  }

  start(event: PointerEvent): void {
    this.pointer = event.pointerId;
    this.origin = { x: event.clientX, y: event.clientY };
    this.pos = CENTER;
    this.base.style.left = `${event.clientX}px`;
    this.base.style.top = `${event.clientY}px`;
    this.base.hidden = false;
    this.draw();
  }

  move(event: PointerEvent): void {
    this.pos = clampDisk((event.clientX - this.origin.x) / TOUCH_RANGE, -(event.clientY - this.origin.y) / TOUCH_RANGE);
    this.draw();
  }

  end(): void {
    this.pointer = null;
    this.pos = CENTER;
    this.base.hidden = true;
  }

  read(): StickAxes {
    return this.pos;
  }

  private draw(): void {
    this.knob.style.transform = `translate(${this.pos.right * TOUCH_RANGE}px, ${-this.pos.up * TOUCH_RANGE}px)`;
  }
}

/**
 * Deux sticks au doigt, pour jouer sur téléphone : moitié gauche de l'écran, le stick de déplacement ; moitié
 * droite, le stick droit (les mêmes gestes qu'à la manette, `swingStick.ts`). Chaque stick naît où le pouce se pose.
 */
export class TouchSticks {
  private readonly left = new TouchStick();
  private readonly right = new TouchStick();

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      const stick = event.clientX < window.innerWidth / 2 ? this.left : this.right;
      if (stick.pointer !== null) return;
      stick.start(event);
      target.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    const find = (event: PointerEvent): TouchStick | null =>
      [this.left, this.right].find((stick) => stick.pointer === event.pointerId) ?? null;
    target.addEventListener('pointermove', (event) => find(event)?.move(event));
    const release = (event: PointerEvent): void => find(event)?.end();
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
    target.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', () => {
      this.left.end();
      this.right.end();
    });
  }

  /** Stick de déplacement. */
  move(): StickAxes {
    return this.left.read();
  }

  /** Stick droit. */
  aim(): StickAxes {
    return this.right.read();
  }
}
