import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_COMMANDS, type PlayerCommands } from './commands';
import { SIM_DT } from './constants';
import { Machine, type Exercise } from './machine';
import { createPlayer, NO_LAUNCH, stepPlayer, type Player } from './player';
import { REALISTIC, type PhysicsProfile } from './profile';
import { createRacket, stepRacket, type Racket, type Shot } from './racket';
import {
  abandon,
  createRally,
  createStats,
  judgeStep,
  recordResult,
  type BallResult,
  type Rally,
  type Stats,
} from './rules';
import { vec3, type Vec3 } from './vec3';

/** État complet de la simulation. Avance uniquement par pas fixes de SIM_DT. */
export class World {
  tick = 0;
  /** Copie modifiable à chaud du profil de physique. */
  profile: PhysicsProfile = structuredClone(REALISTIC);
  ball: Ball | null = null;
  /** Position de la balle au pas précédent, pour l'interpolation du rendu. */
  prevBallPos: Vec3 | null = null;
  /** Contacts de la balle pendant le dernier pas. */
  readonly contacts: Contact[] = [];
  machine: Machine | null = null;
  player: Player = createPlayer();
  /** Position du joueur au pas précédent, pour l'interpolation du rendu. */
  prevPlayerPos: Vec3 = this.player.pos;
  racket: Racket = createRacket();
  /** Frappe réussie pendant le dernier pas, sinon `null`. */
  shot: Shot | null = null;
  /** Dernière frappe sur la balle en cours. */
  lastShot: Shot | null = null;
  rally: Rally = createRally();
  /** Verdict tombé pendant le dernier pas, sinon `null`. */
  result: BallResult | null = null;
  /** Dernier verdict rendu. */
  lastResult: BallResult | null = null;
  /** Statistiques de l'exercice en cours. */
  stats: Stats = createStats();
  /** En pause, `step` ne fait rien : le temps simulé s'arrête. */
  paused = false;

  /** Temps simulé en secondes, dérivé du compteur de pas pour éviter toute dérive. */
  get time(): number {
    return this.tick * SIM_DT;
  }

  launchBall(pos: Vec3, vel: Vec3, spin?: Vec3): void {
    // Une balle remplacée avant son verdict est jugée en l'état.
    if (this.ball) this.settle(abandon(this.rally));
    this.ball = createBall(pos, vel, spin);
    this.prevBallPos = pos;
    this.lastShot = null;
    this.rally = createRally();
  }

  /** Démarre un exercice : la machine lancera ses balles à partir de maintenant. */
  startExercise(exercise: Exercise, seed: number): void {
    this.machine = new Machine(exercise, seed, this.time);
    this.ball = null;
    this.prevBallPos = null;
    this.rally = createRally();
    this.stats = createStats();
    this.lastResult = null;
    this.lastShot = null;
    this.player = createPlayer(vec3(exercise.player.x, 0, exercise.player.z));
    this.prevPlayerPos = this.player.pos;
    this.racket = createRacket();
    this.paused = false;
  }

  /** Relance la dernière balle de la machine, à l'identique. */
  replayLastBall(): void {
    const launch = this.machine?.replay(this.time);
    if (launch) this.launchBall(launch.pos, launch.vel, launch.spin);
  }

  private settle(result: BallResult | null): void {
    if (!result) return;
    this.result = result;
    this.lastResult = result;
    recordResult(this.stats, result);
  }

  step(commands: PlayerCommands = NEUTRAL_COMMANDS): void {
    this.contacts.length = 0;
    this.result = null;
    this.shot = null;
    if (this.paused) return;
    const launch = this.machine?.update(this.time);
    if (launch) this.launchBall(launch.pos, launch.vel, launch.spin);

    // Pendant le swing, la souris oriente surtout le coup : la caméra tourne moins.
    const lookFactor = this.racket.phase === 'swinging' ? this.profile.racket.swingLookFactor : 1;
    const playerCommands: PlayerCommands = {
      ...commands,
      look: { yaw: commands.look.yaw * lookFactor, pitch: commands.look.pitch * lookFactor },
    };
    this.prevPlayerPos = this.player.pos;
    stepPlayer(this.player, playerCommands, SIM_DT, this.profile, this.machine ?? NO_LAUNCH, this.time);

    const ballBefore = this.ball?.pos ?? null;
    if (this.ball) {
      this.prevBallPos = this.ball.pos;
      stepBall(this.ball, SIM_DT, this.profile, this.contacts);
    }
    this.shot = stepRacket(this.racket, this.player, this.ball, ballBefore, commands, SIM_DT, this.profile);
    if (this.shot) {
      this.lastShot = this.shot;
      this.stats.hits++;
      this.stats.qualitySum += this.shot.quality;
    }
    if (this.ball) this.settle(judgeStep(this.rally, this.contacts, this.shot !== null));
    this.tick++;
  }
}
