import { Vec2, Vec2able, Vec2Args } from "../math/vec2";

export function translate(...args: Vec2Args): string {
  const { x, y } = Vec2(...args);
  return `translate(${x},${y}) `; // end in space
}

export function rotateDeg(degrees: number, c: Vec2able = Vec2(0)): string {
  const { x, y } = Vec2(c);
  return `rotate(${degrees},${x},${y}) `; // end in space
}

export function rotateRad(radians: number, c: Vec2able = Vec2(0)): string {
  return rotateDeg((radians * 180) / Math.PI, c);
}

export function scale(sx: number, sy?: number): string {
  if (sy === undefined) sy = sx;
  return `scale(${sx},${sy}) `; // end in space
}

export function path(...pts: (Vec2able | string | number)[]): string {
  return pts
    .map((pt) =>
      typeof pt === "string"
        ? pt
        : typeof pt === "number"
          ? pt.toString()
          : Vec2(pt).str(),
    )
    .join(" ");
}

/**
 * Props for a `<line>` from `a` to `b`, drawn as a unit line placed by
 * its transform: `<line {...draggableLine(a, b)} stroke="black" />`.
 *
 * Dragology follows a grabbed point only through the dragged element's
 * transform, so a line drawn with x1/y1/x2/y2 doesn't carry the grab
 * point along when its ends move. Drawn this way, a point grabbed 30%
 * of the way along the line is looked for 30% of the way along it in
 * every other state. (`vectorEffect` keeps the stroke from scaling with
 * the line's length.)
 *
 * Interpolating between states blends the transform (angle and length
 * separately), so mid-drag the line swings along a curve rather than
 * moving its ends in straight lines, and the grabbed point bows away
 * from the pointer under `d.between`. So use it for the line that is
 * grabbed, and keep it out of sight when that matters: put
 * `dragologyOnDrag` on a transparent `draggableLine` line (a wide stroke
 * makes a good hit area), and draw the visible line with x1/y1/x2/y2.
 * Blended linearly, the visible line's grabbed point stays under the
 * pointer, and its ends stay with whatever they're attached to. Under
 * `d.vary`, which only renders real states, a visible `draggableLine`
 * line is fine.
 */
export function draggableLine(a: Vec2able, b: Vec2able) {
  const start = Vec2(a);
  const v = Vec2(b).sub(start);
  return {
    transform: translate(start) + rotateDeg(v.angleDeg()) + scale(v.len()),
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    vectorEffect: "non-scaling-stroke",
  } as const;
}
