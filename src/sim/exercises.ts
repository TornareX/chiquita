import data from './exercises.json';
import type { Exercise } from './machine';

export const EXERCISES: readonly Exercise[] = data;

export function findExercise(id: string): Exercise {
  const exercise = EXERCISES.find((e) => e.id === id);
  if (!exercise) throw new Error(`Exercice inconnu : ${id}`);
  return exercise;
}
