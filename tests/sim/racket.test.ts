import { describe, expect, it } from 'vitest';
import type { Contact } from '../../src/sim/collisions';
import { NEUTRAL_COMMANDS, type PlayerCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { createBall } from '../../src/sim/ball';
import { createPlayer } from '../../src/sim/player';
import { REALISTIC } from '../../src/sim/profile';
import { computeShot, createRacket, isInReach, reachOf, type Shot, type ShotInput } from '../../src/sim/racket';
import { length, vec3, type Vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';

const T = REALISTIC.racket;

/**
 * Scénario de référence : le joueur reste en (0, 0, -7), face au filet. La balle arrive sur son
 * coup droit (à droite = -X), après un rebond au sol, et traverse sa zone de frappe vers t = 1,2 s.
 */
interface Scenario {
  /** Durée de maintien de la préparation avant le relâchement (s). */
  hold: number;
  /** Instant du relâchement, qui déclenche le swing (s). `null` : pas de swing. */
  release: number | null;
  /** Abscisse de la balle : -0,5 est à la distance idéale, côté coup droit. */
  ballX?: number;
  extra?: Partial<PlayerCommands>;
}

interface Outcome {
  shot: Shot | null;
  /** Contacts de la balle après la frappe. */
  contacts: Contact[];
  world: World;
}

function play({ hold, release, ballX = -0.5, extra = {} }: Scenario): Outcome {
  const world = new World();
  world.launchBall(vec3(ballX, 1.1, 6), vec3(0, 2.3, -12.8));
  let shot: Shot | null = null;
  const contacts: Contact[] = [];
  for (let i = 0; i < 5 / SIM_DT; i++) {
    const time = i * SIM_DT;
    const prepare = release !== null && time >= release - hold && time < release;
    world.step({ ...NEUTRAL_COMMANDS, ...extra, prepare });
    if (world.shot) shot = world.shot;
    else if (shot) contacts.push(...world.contacts);
  }
  return { shot, contacts, world };
}

/** Le renvoi franchit le filet et rebondit dans le camp adverse avant de toucher un mur. */
function isValidReturn(contacts: Contact[]): boolean {
  const first = contacts[0];
  return first !== undefined && first.surface === 'ground' && first.pos.z > 0;
}

describe('cycle de la raquette', () => {
  it('préparation tant que le bouton est maintenu, swing au relâchement, puis retour', () => {
    const world = new World();
    const phases: string[] = [];
    const record = (commands: PlayerCommands, seconds: number): void => {
      for (let i = 0; i < seconds / SIM_DT; i++) {
        world.step(commands);
        if (phases.at(-1) !== world.racket.phase) phases.push(world.racket.phase);
      }
    };
    record(NEUTRAL_COMMANDS, 0.1);
    record({ ...NEUTRAL_COMMANDS, prepare: true }, T.prepareTime / 2);
    expect(world.racket.charge).toBeCloseTo(0.5, 1);
    record({ ...NEUTRAL_COMMANDS, prepare: true }, T.prepareTime);
    expect(world.racket.charge).toBe(1);
    record(NEUTRAL_COMMANDS, 1);
    expect(phases).toEqual(['idle', 'preparing', 'swinging', 'recovering', 'idle']);
  });

  it('pendant le swing, le tamis part de derrière le joueur et finit devant', () => {
    const world = new World();
    for (let i = 0; i < 0.5 / SIM_DT; i++) world.step({ ...NEUTRAL_COMMANDS, prepare: true });
    const start = world.racket.headPos;
    expect(start.z).toBeLessThan(world.player.pos.z);
    let maxZ = -Infinity;
    for (let i = 0; i < T.swingDurationMin / SIM_DT; i++) {
      world.step(NEUTRAL_COMMANDS);
      maxZ = Math.max(maxZ, world.racket.headPos.z);
    }
    expect(maxZ).toBeGreaterThan(world.player.pos.z + 0.8);
    // Coup droit par défaut : le tamis est à droite du joueur (-X).
    expect(start.x).toBeLessThan(0);
  });
});

describe('frappe', () => {
  it('sans swing, la raquette ne touche jamais la balle', () => {
    expect(play({ hold: 0, release: null }).shot).toBeNull();
    // Préparer sans relâcher ne frappe pas non plus.
    expect(play({ hold: 5, release: 5 }).shot).toBeNull();
  });

  it('un swing bien calé renvoie la balle dans le camp adverse', () => {
    const { shot, contacts } = play({ hold: 0.25, release: 1.18 });
    expect(shot).not.toBeNull();
    expect(shot!.quality).toBeGreaterThan(0.8);
    expect(shot!.side).toBe(1);
    expect(isValidReturn(contacts)).toBe(true);
  });

  it('la fenêtre de timing est large mais finie ; hors fenêtre, la balle passe', () => {
    let hits = 0;
    let valid = 0;
    for (let release = 0.6; release < 1.8; release += 0.01) {
      const { shot, contacts } = play({ hold: 0.25, release });
      if (shot) hits++;
      if (shot && isValidReturn(contacts)) valid++;
    }
    // Entre 0,2 et 0,5 s pour toucher la balle, dont au moins 0,1 s qui donnent un renvoi valide.
    expect(hits).toBeGreaterThanOrEqual(20);
    expect(hits).toBeLessThanOrEqual(50);
    expect(valid).toBeGreaterThanOrEqual(10);
    expect(play({ hold: 0.25, release: 0.7 }).shot).toBeNull();
    expect(play({ hold: 0.25, release: 1.7 }).shot).toBeNull();
  });

  it('une préparation complète donne un coup plus rapide', () => {
    const quick = play({ hold: 0.05, release: 1.15 }).shot!;
    const full = play({ hold: 0.5, release: 1.19 }).shot!;
    expect(full.speed).toBeGreaterThan(quick.speed * 1.3);
  });

  it('le coup de toucher (clic droit) est nettement plus lent', () => {
    const normal = play({ hold: 0.25, release: 1.18 }).shot!;
    const soft = play({ hold: 0.25, release: 1.18, extra: { softShot: true } }).shot!;
    expect(soft.soft).toBe(true);
    expect(soft.speed).toBeLessThan(normal.speed * 0.7);
  });

  it('plus la balle est loin du point idéal, moins le contact est bon ; hors de portée, elle est manquée', () => {
    const ideal = play({ hold: 0.25, release: 1.18 }).shot!;
    const stretched = play({ hold: 0.25, release: 1.18, ballX: -1.0 }).shot!;
    expect(stretched.quality).toBeLessThan(ideal.quality - 0.2);
    expect(stretched.speed).toBeLessThan(ideal.speed);
    // À 1,6 m sur le côté, le bras ne suffit plus.
    const outcome = play({ hold: 0.25, release: 1.18, ballX: -1.6 });
    expect(outcome.shot).toBeNull();
    expect(outcome.world.racket.miss).toBe('far');
  });

  it('un swing dans le vide dit pourquoi : trop tôt ou trop tard', () => {
    const early = play({ hold: 0.25, release: 0.95 });
    expect(early.shot).toBeNull();
    expect(early.world.racket.miss).toBe('early');
    const late = play({ hold: 0.25, release: 1.45 });
    expect(late.shot).toBeNull();
    expect(late.world.racket.miss).toBe('late');
  });

  it('un swing sans balle à proximité ne signale rien', () => {
    const outcome = play({ hold: 0.25, release: 0.3 });
    expect(outcome.shot).toBeNull();
    expect(outcome.world.racket.miss).toBeNull();
  });

  it('balle à gauche : le revers est choisi automatiquement', () => {
    const { shot, contacts } = play({ hold: 0.25, release: 1.18, ballX: 0.5 });
    expect(shot!.side).toBe(-1);
    expect(isValidReturn(contacts)).toBe(true);
  });

  it('un swing ne touche la balle qu’une fois', () => {
    const world = new World();
    world.launchBall(vec3(-0.5, 1.1, 6), vec3(0, 2.3, -12.8));
    let shots = 0;
    for (let i = 0; i < 3 / SIM_DT; i++) {
      const time = i * SIM_DT;
      world.step({ ...NEUTRAL_COMMANDS, prepare: time >= 0.93 && time < 1.18 });
      if (world.shot) shots++;
    }
    expect(shots).toBe(1);
  });

  it('est déterministe', () => {
    const run = (): string => JSON.stringify(play({ hold: 0.25, release: 1.2 }).world.ball);
    expect(run()).toBe(run());
  });
});

describe('calcul du coup', () => {
  const BASE: ShotInput = {
    contact: vec3(-0.55, 0.9, -6.5),
    ballVel: vec3(0, -1, -8),
    yaw: 0,
    pitch: 0,
    headSpeed: 12,
    side: 1,
    charge: 0.5,
    progress: T.idealContact,
    offsetRight: 0,
    offsetUp: 0,
    depth: 0,
    gestureX: 0,
    gestureY: 0,
    soft: false,
  };
  const shot = (overrides: Partial<ShotInput> = {}): { vel: Vec3; spin: Vec3; quality: number } =>
    computeShot({ ...BASE, ...overrides }, REALISTIC)!;
  const elevation = (vel: Vec3): number => Math.atan2(vel.y, Math.hypot(vel.x, vel.z));

  it('à plat et au centre : droit devant, vers le filet', () => {
    const { vel, quality } = shot();
    expect(vel.x).toBeCloseTo(0, 9);
    expect(vel.z).toBeGreaterThan(12);
    expect(quality).toBe(1);
  });

  it('la vitesse sortante combine celle du swing et celle de la balle entrante', () => {
    expect(length(shot({ headSpeed: 15 }).vel)).toBeGreaterThan(length(shot().vel));
    expect(length(shot({ ballVel: vec3(0, -1, -16) }).vel)).toBeGreaterThan(length(shot().vel) + 1);
  });

  it('la direction suit le regard', () => {
    // Regard tourné vers la droite (-X).
    expect(shot({ yaw: 0.3 }).vel.x).toBeLessThan(-3);
    expect(shot({ yaw: -0.3 }).vel.x).toBeGreaterThan(3);
    expect(elevation(shot({ pitch: 0.3 }).vel)).toBeGreaterThan(elevation(shot().vel));
  });

  it('geste de souris vers le haut : lift et trajectoire plus haute', () => {
    const up = shot({ gestureY: 0.2 });
    // Pour une balle allant vers +Z, le lift est un spin +X.
    expect(up.spin.x).toBeGreaterThan(shot().spin.x + 20);
    expect(elevation(up.vel)).toBeGreaterThan(elevation(shot().vel) + 0.05);
  });

  it('geste de souris vers le bas : slice et trajectoire plus basse', () => {
    const down = shot({ gestureY: -0.2 });
    expect(down.spin.x).toBeLessThan(shot().spin.x - 20);
    expect(elevation(down.vel)).toBeLessThan(elevation(shot().vel));
  });

  it('geste de souris sur le côté : angle supplémentaire', () => {
    expect(shot({ gestureX: 0.2 }).vel.x).toBeLessThan(-1);
    expect(shot({ gestureX: -0.2 }).vel.x).toBeGreaterThan(1);
  });

  it('en retard, la balle part du côté de la raquette ; en avance, de l’autre', () => {
    expect(shot({ progress: 0.3, side: 1 }).vel.x).toBeLessThan(-1);
    expect(shot({ progress: 0.9, side: 1 }).vel.x).toBeGreaterThan(1);
    expect(shot({ progress: 0.3, side: -1 }).vel.x).toBeGreaterThan(1);
  });

  it('au bord du tamis : coup plus faible et dévié, moins si la préparation est complète', () => {
    const edge = shot({ offsetRight: 0.9, charge: 0 });
    expect(edge.quality).toBeCloseTo(0.1, 9);
    expect(length(edge.vel)).toBeLessThan(length(shot().vel) * 0.8);
    expect(Math.abs(edge.vel.x)).toBeGreaterThan(0.5);
    const prepared = shot({ offsetRight: 0.9, charge: 1 });
    expect(Math.abs(prepared.vel.x)).toBeLessThan(Math.abs(edge.vel.x));
  });

  it('pas de contact si la balle fuit plus vite que le tamis', () => {
    expect(computeShot({ ...BASE, ballVel: vec3(0, 0, 30) }, REALISTIC)).toBeNull();
  });
});

describe('zone de frappe', () => {
  const player = createPlayer();
  const racket = createRacket();
  // Joueur en (0, 0, -7) face au filet ; coup droit à droite, donc vers -X.
  const reach = (x: number, y: number, z: number) =>
    reachOf(player, racket, createBall(vec3(x, y, z), vec3(0, 0, 0)), T);

  it('le point idéal est devant le joueur, sur le côté, à hauteur de hanche', () => {
    const ideal = reach(-T.idealLateral, 0.9, -7 + T.idealForward);
    expect(ideal).toEqual({ depth: 0, side: 0, height: 0 });
    expect(isInReach(ideal)).toBe(true);
  });

  it('la zone couvre ce qu’un bras tendu peut atteindre', () => {
    expect(isInReach(reach(-1.1, 0.9, -6.5))).toBe(true);
    expect(isInReach(reach(-0.5, 0.3, -6))).toBe(true);
    expect(isInReach(reach(-0.5, 1.9, -6.5))).toBe(true);
    // Trop loin, trop devant, trop haut (pas de coup au-dessus de la tête dans le MVP).
    expect(isInReach(reach(-1.5, 0.9, -6.5))).toBe(false);
    expect(isInReach(reach(-0.5, 0.9, -5))).toBe(false);
    expect(isInReach(reach(-0.5, 2.6, -6.5))).toBe(false);
  });

  it('les écarts sont signés : devant, derrière, loin, près, haut, bas', () => {
    expect(reach(-0.55, 0.9, -5.8).depth).toBeGreaterThan(0);
    expect(reach(-0.55, 0.9, -7.3).depth).toBeLessThan(0);
    expect(reach(-1, 0.9, -6.5).side).toBeGreaterThan(0);
    expect(reach(-0.1, 0.9, -6.5).side).toBeLessThan(0);
    expect(reach(-0.55, 1.8, -6.5).height).toBeGreaterThan(0);
    expect(reach(-0.55, 0.2, -6.5).height).toBeLessThan(0);
  });

  it('l’aide « taille de la zone » l’agrandit', () => {
    const ball = createBall(vec3(-1.5, 0.9, -6.5), vec3(0, 0, 0));
    expect(isInReach(reachOf(player, racket, ball, T))).toBe(false);
    expect(isInReach(reachOf(player, racket, ball, { ...T, tolerance: 1.6 }))).toBe(true);
  });
});
