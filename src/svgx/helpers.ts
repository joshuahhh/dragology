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
