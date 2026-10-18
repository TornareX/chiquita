import { describe, expect, it } from 'vitest';
import { IDLE_PAD, type PadState } from '../../src/input/gamepad';
import { detectPadFamily, keyLabel, resolvePadFamily, SHOT_POSITIONS, POSITION_INDEX } from '../../src/input/padStyle';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { vec3 } from '../../src/sim/vec3';
import { buttonIcon, formatButtons, plainButtons } from '../../src/ui/buttonIcons';
import { describeShot, describeStick, ReleaseTracker } from '../../src/ui/inputDisplay';

describe('famille de manette', () => {
  it('reconnaît les identifiants de Chrome et de Firefox', () => {
    expect(detectPadFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(detectPadFamily('054c-09cc-Wireless Controller')).toBe('playstation');
    expect(detectPadFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(detectPadFamily('045e-0b13-Xbox Wireless Controller')).toBe('xbox');
    expect(detectPadFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    expect(detectPadFamily('USB Gamepad (Vendor: 0079 Product: 0011)')).toBe('generic');
  });

  it('le choix des réglages l’emporte sur la détection', () => {
    const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' };
    expect(resolvePadFamily('auto', pad)).toBe('xbox');
    expect(resolvePadFamily('playstation', pad)).toBe('playstation');
    expect(resolvePadFamily('auto', null)).toBe('generic');
  });

  it('chaque coup a sa position, et les positions suivent la disposition standard', () => {
    expect(POSITION_INDEX[SHOT_POSITIONS.normal]).toBe(0);
    expect(POSITION_INDEX[SHOT_POSITIONS.overhead]).toBe(1);
    expect(POSITION_INDEX[SHOT_POSITIONS.slice]).toBe(2);
    expect(POSITION_INDEX[SHOT_POSITIONS.lob]).toBe(3);
  });
});

describe('symboles des boutons', () => {
  it('le coupé est X sur Xbox, carré sur PlayStation, Y sur Nintendo', () => {
    expect(plainButtons('{slice}', 'xbox')).toBe('X');
    expect(plainButtons('{slice}', 'playstation')).toBe('□');
    expect(plainButtons('{slice}', 'nintendo')).toBe('Y');
    expect(plainButtons('{slice}', 'generic')).toBe('bouton de gauche');
  });

  it('le coup normal (bouton du bas) est B sur une manette Nintendo', () => {
    expect(plainButtons('{normal} puis {overhead}', 'nintendo')).toBe('B puis A');
  });

  it('remplace les jetons et échappe le reste', () => {
    const html = formatButtons('<b> {lob} lob', { kind: 'pad', family: 'playstation' });
    expect(html.startsWith('&#60;b&#62; ')).toBe(true);
    expect(html).toContain('△');
    expect(html).toContain('<svg');
  });

  it('au clavier, montre les touches du joueur (disposition imprimée si connue)', () => {
    expect(buttonIcon('normal', { kind: 'keyboard', player: 0 })).toContain('>J<');
    expect(buttonIcon('overhead', { kind: 'keyboard', player: 1 })).toContain('4 (pavé)');
    // KeyM : M en QWERTY, virgule en AZERTY.
    expect(keyLabel('KeyM')).toBe('M');
    expect(keyLabel('KeyM', new Map([['KeyM', ',']]))).toBe(',');
    expect(keyLabel('Comma')).toBe(',');
  });
});

describe('retour des entrées', () => {
  const shot = (over: Partial<DuelShot>): DuelShot => ({
    player: 0,
    kind: 'normal',
    overhead: null,
    outside: false,
    perfect: false,
    timing: 0,
    contact: vec3(0, 1, -8),
    target: vec3(0, 0, 7),
    speed: 20,
    volley: false,
    serve: false,
    manual: false,
    pressure: 0,
    error: 0,
    style: null,
    heightOff: 0,
    wing: 'fore',
    ...over,
  });

  it('dit ce que le relâcher a donné', () => {
    expect(describeShot(shot({ overhead: 'vibora', kind: 'overhead', perfect: true, contact: vec3(0, 2.35, -4) }), ARCADE)).toEqual({
      text: 'víbora parfait !',
      quality: 'perfect',
    });
    expect(describeShot(shot({ timing: 0.1 }), ARCADE).quality).toBe('off');
    expect(describeShot(shot({ style: 'block' }), ARCADE).text).toContain('appuie plus tôt');
    expect(describeShot(shot({ kind: 'slice', style: 'chiquita' }), ARCADE).text).toBe('chiquita');
  });

  it('décrit le stick par rapport au joueur', () => {
    expect(describeStick({ forward: 0, right: 0 })).toBe('stick au centre');
    expect(describeStick({ forward: 1, right: -0.8 })).toBe('stick avant gauche');
    expect(describeStick({ forward: -1, right: 0 })).toBe('stick vers toi');
  });

  it('retient le bouton réellement relâché, même quand la situation change le coup', () => {
    const duel = new Duel();
    const tracker = new ReleaseTracker(0);
    const held: PadState = { ...IDLE_PAD, shot: 'overhead' };
    tracker.step(duel, held);
    duel.tick++;
    // B sur une balle basse : la simulation joue un coupé, mais le joueur a pressé B.
    duel.players[0].lastHit = shot({ kind: 'slice' });
    duel.players[0].lastHitTick = duel.tick;
    duel.players[0].stick = { forward: 0, right: 1 };
    tracker.step(duel, IDLE_PAD);
    expect(tracker.history[0]).toMatchObject({ button: 'overhead', quality: 'good', text: 'coupé', stick: 'stick droite' });

    duel.tick++;
    tracker.step(duel, { ...IDLE_PAD, shot: 'lob' });
    duel.tick++;
    duel.players[0].lastWhiffTick = duel.tick;
    tracker.step(duel, IDLE_PAD);
    expect(tracker.history[0]).toMatchObject({ button: 'lob', quality: 'miss' });
    expect(tracker.history).toHaveLength(2);
  });
});
