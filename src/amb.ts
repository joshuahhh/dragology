/**
 * Nondeterministic computation using the "amb" operator.
 *
 * The amb operator takes an array of options and conceptually
 * "returns all of them at once". In reality, it throws a special
 * error that causes the computation to branch into multiple
 * executions, one for each option.
 */

import { Draft, produce } from "immer";

class AmbError extends Error {
  constructor(public optionsLength: number) {
    super("AmbError");
  }
}

class FailError extends Error {
  constructor() {
    super("FailError");
  }
}

/**
 * Global state tracking the current execution path through amb
 * choices. This is reset for each execution in runAmb.
 */
let currentPath: number[] = [];
let currentAmbIndex = 0;

/**
 * The amb operator: nondeterministically choose one of the given
 * options. For use inside runAmb or one of its cousins.
 */
export function amb<T>(options: T[]): T {
  const myIndex = currentAmbIndex++;

  // If we have a predetermined choice for this amb call, use it
  if (myIndex < currentPath.length) {
    return options[currentPath[myIndex]];
  }

  // Otherwise, we need to branch - throw to signal this
  throw new AmbError(options.length);
}

/**
 * `if (ambBoth()) { A } else { B }` effectively runs both A and B
 * in parallel.
 */
export function ambBoth(): boolean {
  return amb([true, false]);
}

/**
 * Run a function that uses amb, exploring all possible execution
 * paths. Returns results one at a time via a generator.
 */
export function generateAmb<T>(fn: () => T): Generator<T> {
  return generateAmbHelper(fn, []);
}

function* generateAmbHelper<T>(fn: () => T, path: number[]): Generator<T> {
  try {
    currentPath = path;
    currentAmbIndex = 0;
    yield fn();
  } catch (error) {
    if (error instanceof AmbError) {
      // Recursively explore each branch
      for (let i = 0; i < error.optionsLength; i++) {
        yield* generateAmbHelper(fn, [...path, i]);
      }
    } else if (error instanceof FailError) {
      // This path failed - just return without yielding
      return;
    } else {
      throw error;
    }
  }
}

/**
 * Run a function that uses amb, exploring all possible execution
 * paths. Returns an array of all possible results.
 */
export function runAmb<T>(fn: () => T): T[] {
  return [...generateAmb(fn)];
}

/**
 * Terminate this branch of execution without returning any results.
 * For use inside runAmb or one of its cousins.
 */
export function fail(): never {
  throw new FailError();
}

/**
 * Require that a condition is true, otherwise terminate this branch.
 * For use inside runAmb or one of its cousins.
 */
export function require(condition: boolean): void {
  if (!condition) fail();
}

/**
 * Immer's `produce` with new amb powers: Returns all possible
 * versions of the base object resulting from different amb choices
 * in the recipe function.
 */
export function produceAmb<T>(base: T, recipe: (draft: Draft<T>) => void): T[] {
  return runAmb(() => produce(base, recipe));
}
