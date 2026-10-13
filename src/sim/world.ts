import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_COMMANDS, type PlayerCommands } from './commands';
import { SIM_DT } from './constants';
import { Machine, type Exercise } from './machine';
import { createPlayer, NO_LAUNCH, stepPlayer, type Player } from './player';
import { REALISTIC, type PhysicsProfile } from './profile';
import type { Vec3 } from './vec3';

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

  /** Temps simulé en secondes, dérivé du compteur de pas pour éviter toute dérive. */
  get time(): number {
    return this.tick * SIM_DT;
  }

  launchBall(pos: Vec3, vel: Vec3, spin?: Vec3): void {
    this.ball = createBall(pos, vel, spin);
    this.prevBallPos = pos;
  }

  /** Démarre un exercice : la machine lancera ses balles à partir de maintenant. */
  startExercise(exercise: Exercise, seed: number): void {
    this.machine = new Machine(exercise, seed, this.time);
    this.ball = null;
    this.prevBallPos = null;
  }

  step(commands: PlayerCommands = NEUTRAL_COMMANDS): void {
    this.contacts.length = 0;
    const launch = this.machine?.update(this.time);
    if (launch) this.launchBall(launch.pos, launch.vel, launch.spin);

    this.prevPlayerPos = this.player.pos;
    stepPlayer(this.player, commands, SIM_DT, this.profile, this.machine ?? NO_LAUNCH, this.time);

    if (this.ball) {
      this.prevBallPos = this.ball.pos;
      stepBall(this.ball, SIM_DT, this.profile, this.contacts);
    }
    this.tick++;
  }
}
