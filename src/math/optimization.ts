import { FindMinimum } from "./cobyla";
import { Vec2 } from "./vec2";

/**
 * A stateful minimizer that finds params minimizing the distance
 * between a target point and a point derived from those params.
 * Backed by COBYLA. Supports warm-starting: each call to `minimize`
 * starts from the previous solution.
 *
 * Constraint convention: `constraints(params)` returns values where
 * <= 0 means satisfied, > 0 means violated (same as `moreThan`,
 * `lessThan`, etc. below).
 */
export class DistanceMinimizer {
  private curParams: number[];
  private readonly numConstraints: number;

  constructor(initialParams: number[], numConstraints: number) {
    this.curParams = initialParams.slice();
    this.numConstraints = numConstraints;
  }

  get params(): number[] {
    return this.curParams;
  }

  minimize(
    target: Vec2,
    paramsToPoint: (params: number[]) => Vec2,
    options?: {
      constraints?: (params: number[]) => number[];
    },
  ): number[] {
    const n = this.curParams.length;
    const x = this.curParams.slice();

    // COBYLA uses zero as another simplex vertex, so avoid coincidence
    if (x.every((v) => v === 0)) {
      (x as number[])[0] = 1e-4;
    }

    const rhoend = 1e-3;
    const rhobeg = Math.max(1, paramsToPoint(x).dist(target));

    const constraints = options?.constraints;

    FindMinimum(
      (_n, _m, xArr, con) => {
        const params: number[] = [];
        for (let i = 0; i < n; i++) params[i] = xArr[i];

        const obj = paramsToPoint(params).dist2(target);

        if (constraints) {
          const gs = constraints(params);
          for (let k = 0; k < gs.length; k++) {
            con[k] = -gs[k];
          }
        }

        return obj;
      },
      n,
      this.numConstraints,
      x,
      rhobeg,
      rhoend,
      0, // iprint: silent
      200, // maxfun
    );

    this.curParams = x;
    return x;
  }
}

// # Constraint helpers

/** Constraint helper: returns a - b, so a < b when result ≤ 0 */
export function lessThan(a: number, b: number): number {
  return a - b;
}

/** Constraint helper: returns b - a, so a > b when result ≤ 0 */
export function moreThan(a: number, b: number): number {
  return b - a;
}

/** Constraint helper: returns two opposing inequalities, so a == b when both ≤ 0 */
export function equal(a: number, b: number): number[] {
  return [a - b, b - a];
}

/** Constraint helper: ensure numbers are in ascending order */
export function inOrder(...nums: number[]): number[] {
  const constraints: number[] = [];
  for (let i = 0; i < nums.length - 1; i++) {
    constraints.push(lessThan(nums[i], nums[i + 1]));
  }
  return constraints;
}

/** Constraint helper: combine multiple numeric constraints */
export function and(...constraints: number[]): number[] {
  return constraints;
}
