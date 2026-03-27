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
  private scales: number[] | undefined;

  constructor(initialParams: number[], numConstraints: number) {
    this.curParams = initialParams.slice();
    this.numConstraints = numConstraints;
  }

  get params(): number[] {
    return this.curParams;
  }

  /**
   * Estimate per-parameter scaling: how many pixels of element movement
   * does a unit change in each parameter produce? Used to rescale the
   * parameter space so COBYLA's uniform rhobeg works for all dimensions.
   */
  private estimateScales(
    paramsToPoint: (params: number[]) => Vec2,
    baseParams: number[],
  ): number[] {
    const n = baseParams.length;
    const basePos = paramsToPoint(baseParams);
    const eps = 1e-3;
    const scales: number[] = [];
    for (let i = 0; i < n; i++) {
      const perturbed = baseParams.slice();
      perturbed[i] += eps;
      const perturbedPos = paramsToPoint(perturbed);
      const sensitivity = perturbedPos.dist(basePos) / eps;
      // Clamp to avoid division by zero or extreme ratios
      scales[i] = Math.max(sensitivity, 0.01);
    }
    return scales;
  }

  minimize(
    target: Vec2,
    paramsToPoint: (params: number[]) => Vec2,
    options?: {
      constraints?: (params: number[]) => number[];
    },
  ): number[] {
    const n = this.curParams.length;

    // Estimate parameter scales (pixels per unit param) on first call,
    // then refresh periodically to handle changing geometry
    if (!this.scales) {
      this.scales = this.estimateScales(paramsToPoint, this.curParams);
    }
    const scales = this.scales;

    // Convert to scaled space: scaledParam = param * scale
    // In scaled space, unit change ≈ 1 pixel of movement
    const toScaled = (params: number[]): number[] =>
      params.map((v, i) => v * scales[i]);
    const fromScaled = (scaled: number[]): number[] =>
      scaled.map((v, i) => v / scales[i]);

    const sx = toScaled(this.curParams);

    // COBYLA uses zero as another simplex vertex, so avoid coincidence
    if (sx.every((v) => v === 0)) {
      (sx as number[])[0] = 1e-4;
    }

    const rhoend = 1e-3;
    // In scaled space, pixel distance is a natural rhobeg
    const rhobeg = Math.max(1, paramsToPoint(fromScaled(sx)).dist(target));

    const constraints = options?.constraints;

    FindMinimum(
      (_n, _m, sxArr, con) => {
        const scaledParams: number[] = [];
        for (let i = 0; i < n; i++) scaledParams[i] = sxArr[i];
        const params = fromScaled(scaledParams);

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
      sx,
      rhobeg,
      rhoend,
      0, // iprint: silent
      200, // maxfun
    );

    this.curParams = fromScaled(sx);
    return this.curParams;
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
