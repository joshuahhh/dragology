import { Knot, knotFromParametric } from "./knot";

export const CX = 280;
export const CY = 230;

export const trefoil = (): Knot =>
  knotFromParametric(
    (t) => ({
      x: CX + 36 * (Math.sin(t) + 2 * Math.sin(2 * t)),
      y: CY + 36 * (Math.cos(t) - 2 * Math.cos(2 * t)),
      z: -Math.sin(3 * t),
    }),
    60,
  );

export const figureEight = (): Knot =>
  knotFromParametric(
    (t) => ({
      x: CX + 46 * (2 + Math.cos(2 * t)) * Math.cos(3 * t),
      y: CY + 46 * (2 + Math.cos(2 * t)) * Math.sin(3 * t),
      z: Math.sin(4 * t),
    }),
    90,
  );

export const unknot = (): Knot =>
  knotFromParametric(
    (t) => ({ x: CX + 80 * Math.cos(t), y: CY + 80 * Math.sin(t), z: 0 }),
    30,
  );
