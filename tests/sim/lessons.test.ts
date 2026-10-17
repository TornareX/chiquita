import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from '../../src/sim/commands';
import { Duel } from '../../src/sim/duel';
import { AttemptWatcher, LESSONS, type AttemptOutcome, type Lesson } from '../../src/sim/lessons';

/** Joue un essai : Bleu est piloté par `blue` (ou ne fait rien), Rouge ne joue pas. */
function attempt(lesson: Lesson, n: number, blue: Bot | null): { outcome: AttemptOutcome; duel: Duel } {
  const duel = new Duel(null);
  lesson.start(duel, n);
  const watcher = new AttemptWatcher(duel);
  for (;;) {
    // Leçon au stick : le démonstrateur joue avec le geste de la leçon (comme dans le tutoriel).
    const gesture = lesson.stick?.swing;
    const commands: ArcadeCommands = blue ? { ...blue.commands(duel), ...(gesture ? { swing: { ...gesture } } : {}) } : NEUTRAL_ARCADE;
    duel.step([commands, NEUTRAL_ARCADE]);
    const outcome = watcher.step(duel, commands);
    if (outcome) return { outcome, duel };
  }
}

/** Démonstrateur : le coup de la leçon, relâché au moment idéal. */
const demonstrator = (kind: ShotKind, stick: ArcadeCommands['stick'], release = 0): Bot =>
  new Bot(0, 7, { ...DEFAULT_BOT, release: { offset: release, spread: 0 }, forced: { kind, stick } });

describe('leçons du tutoriel', () => {
  for (const lesson of LESSONS) {
    for (let n = 0; n < 4; n++) {
      it(`${lesson.title}, essai ${n + 1} : le démonstrateur réussit`, () => {
        const { kind, stick } = lesson.demo(n);
        const { outcome, duel } = attempt(lesson, n, demonstrator(kind, stick));
        const verdict = lesson.judge(outcome, n, duel.profile);
        expect(verdict, JSON.stringify({ ...outcome, shot: outcome.shot && { ...outcome.shot } })).toMatchObject({ success: true });
      });
    }

    it(`${lesson.title} : sans frappe, on dit d’appuyer`, () => {
      const { outcome, duel } = attempt(lesson, 0, null);
      const verdict = lesson.judge(outcome, 0, duel.profile);
      expect(verdict.success).toBe(false);
      expect(verdict.message).toContain('Tu n’as pas frappé');
    });

    it(`${lesson.title} : l’essai est rejoué à l’identique`, () => {
      const { kind, stick } = lesson.demo(1);
      const a = attempt(lesson, 1, demonstrator(kind, stick)).outcome;
      const b = attempt(lesson, 1, demonstrator(kind, stick)).outcome;
      expect(b.landing).toEqual(a.landing);
    });
  }

  it('mauvais bouton : on dit lequel a été pressé et lequel il fallait', () => {
    const lesson = LESSONS.find((l) => l.id === 'coup-normal')!;
    const { outcome, duel } = attempt(lesson, 0, demonstrator('slice', { forward: 0, right: 0 }));
    const verdict = lesson.judge(outcome, 0, duel.profile);
    expect(verdict.success).toBe(false);
    expect(verdict.message).toContain('Tu as appuyé sur {slice}');
    expect(verdict.message).toContain('c’est {normal}');
  });

  it('direction : stick au centre, la balle ne va pas sur le côté demandé', () => {
    const lesson = LESSONS.find((l) => l.id === 'diriger')!;
    const { outcome, duel } = attempt(lesson, 0, demonstrator('normal', { forward: 0, right: 0 }));
    const verdict = lesson.judge(outcome, 0, duel.profile);
    expect(verdict.success).toBe(false);
    expect(verdict.message).toContain('pas à droite');
  });

  it('bandeja : stick sur le côté donne une víbora, et on le dit', () => {
    const lesson = LESSONS.find((l) => l.id === 'bandeja')!;
    const { outcome, duel } = attempt(lesson, 0, demonstrator('overhead', { forward: 0, right: 1 }));
    expect(outcome.shot?.overhead).toBe('vibora');
    expect(lesson.judge(outcome, 0, duel.profile).message).toContain('víbora');
  });

  it('bandeja relâchée trop tôt : prise trop haute, ratée, et on dit pourquoi', () => {
    const lesson = LESSONS.find((l) => l.id === 'bandeja')!;
    const { outcome, duel } = attempt(lesson, 0, demonstrator('overhead', { forward: 0, right: 0 }, -0.12));
    const verdict = lesson.judge(outcome, 0, duel.profile);
    expect(verdict.success).toBe(false);
    expect(verdict.message).toContain('Prise trop haute');
  });

  it('bandeja relâchée trop tard : prise trop basse, dans le filet', () => {
    const lesson = LESSONS.find((l) => l.id === 'bandeja')!;
    const { outcome, duel } = attempt(lesson, 0, demonstrator('overhead', { forward: 0, right: 0 }, 0.08));
    const verdict = lesson.judge(outcome, 0, duel.profile);
    expect(verdict.success).toBe(false);
    expect(verdict.message).toContain('Prise trop basse');
    expect(verdict.message).toContain('filet');
  });
});
