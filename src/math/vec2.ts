// mini Vec2 library by Elliot & Josh

import { clamp } from "../utils";
import { assertNever } from "../utils/assert";

export type Vec2 = Vec2Class;

export type Vec2able =
  | Vec2
  | { x: number; y: number }
  | ArrayWithTwoNumbers
  | number;

export function Vec2(xy: Vec2able): Vec2;
export function Vec2(x: number, y: number): Vec2;
export function Vec2(xOrXY: number | Vec2able, y?: number): Vec2 {
  if (typeof xOrXY === "number") {
    if (y === undefined) {
      return new Vec2Class(xOrXY, xOrXY);
    } else {
      return new Vec2Class(xOrXY, y);
    }
  } else if (isVec2(xOrXY)) {
    return xOrXY;
  } else if (typeof xOrXY === "object" && "x" in xOrXY && "y" in xOrXY) {
    return new Vec2Class(xOrXY.x, xOrXY.y);
  } else if (isArrayWithTwoNumbers(xOrXY)) {
    return new Vec2Class(xOrXY[0], xOrXY[1]);
  } else {
    assertNever(xOrXY);
  }
}

export namespace Vec2 {
  export function polarRad(r: number, angleRad: number): Vec2 {
    return Vec2(r, 0).rotateRad(angleRad);
  }
  export function polarDeg(r: number, angleDeg: number): Vec2 {
    return Vec2(r, 0).rotateDeg(angleDeg);
  }
}

type ArrayWithTwoNumbers =
  | [number, number, ...any]
  | readonly [number, number, ...any];

function isArrayWithTwoNumbers(value: unknown): value is ArrayWithTwoNumbers {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

export function isVec2(value: unknown): value is Vec2 {
  return value instanceof Vec2Class;
}

class Vec2Class {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  // # extraction

  /**
   * Return as a pair [x, y], for splicing into argument lists.
   */
  arr(): [number, number] {
    return [this.x, this.y];
  }

  /**
   * Return as a string "x,y" (or with an alternative separator).
   */
  str(sep = ","): string {
    return `${this.x}${sep}${this.y}`;
  }

  /**
   * Return as an object { x, y }.
   */
  xy(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Return as a "point 1" object { x1: x, y1: y }, for splicing into
   * `<line>`.
   */
  xy1(): { x1: number; y1: number } {
    return { x1: this.x, y1: this.y };
  }

  /**
   * Return as a "point 2" object { x2: x, y2: y }, for splicing into
   * `<line>`.
   */
  xy2(): { x2: number; y2: number } {
    return { x2: this.x, y2: this.y };
  }

  /**
   * Return as a "center" object { cx: x, cy: y }, for splicing into
   * `<circle>`.
   */
  cxy(): { cx: number; cy: number } {
    return { cx: this.x, cy: this.y };
  }

  // # operations

  eq(v: Vec2able): boolean {
    v = Vec2(v);
    return this.x === v.x && this.y === v.y;
  }

  add(...vs: Vec2able[]): Vec2 {
    let result: Vec2 = this;
    for (const v of vs) {
      const vec = Vec2(v);
      result = Vec2(result.x + vec.x, result.y + vec.y);
    }
    return result;
  }

  sub(v: Vec2able): Vec2 {
    v = Vec2(v);
    return Vec2(this.x - v.x, this.y - v.y);
  }

  mul(n: number): Vec2 {
    return Vec2(this.x * n, this.y * n);
  }

  div(n: number): Vec2 {
    return Vec2(this.x / n, this.y / n);
  }

  scale(v: Vec2able): Vec2 {
    v = Vec2(v);
    return Vec2(this.x * v.x, this.y * v.y);
  }

  dot(v: Vec2able): number {
    v = Vec2(v);
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vec2able): number {
    v = Vec2(v);
    return this.x * v.y - this.y * v.x;
  }

  len2(): number {
    return this.dot(this);
  }

  len(): number {
    return Math.sqrt(this.len2());
  }

  norm(): Vec2 {
    return this.div(this.len());
  }

  withLen(length: number): Vec2 {
    return this.norm().mul(length);
  }

  angleRad(): number {
    return Math.atan2(this.y, this.x);
  }

  angleToRad(v: Vec2able): number {
    v = Vec2(v);
    return Math.atan2(v.y - this.y, v.x - this.x);
  }

  dist2(v: Vec2able): number {
    v = Vec2(v);
    return this.sub(v).len2();
  }

  dist(v: Vec2able): number {
    v = Vec2(v);
    return this.sub(v).len();
  }

  lerp(v: Vec2able, t: number): Vec2 {
    v = Vec2(v);
    return Vec2(lerp(this.x, v.x, t), lerp(this.y, v.y, t));
  }

  mid(v: Vec2able): Vec2 {
    return this.lerp(v, 0.5);
  }

  projOnto(v: Vec2able): Vec2 {
    // TODO weird that we need a new variable here to make TS happy
    const v2 = Vec2(v);
    const scalar = this.dot(v2) / v2.len2();
    return v2.mul(scalar);
  }

  /**
   * Thinking of `this` and `v` as points, return the point a
   * distance `d` from `this` toward `v`.
   */
  towards(v: Vec2able, d: number): Vec2 {
    // TODO weird that we need a new variable here to make TS happy
    const v2 = Vec2(v);
    return this.add(v2.sub(this).norm().mul(d));
  }

  rotateRad(angleRad: number): Vec2 {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    return Vec2(this.x * cosA - this.y * sinA, this.x * sinA + this.y * cosA);
  }

  rotateDeg(angleDeg: number): Vec2 {
    return this.rotateRad((angleDeg * Math.PI) / 180);
  }

  round(): Vec2 {
    return Vec2(Math.round(this.x), Math.round(this.y));
  }

  clamp(a: Vec2able, b: Vec2able): Vec2 {
    a = Vec2(a);
    b = Vec2(b);
    return Vec2(clamp(a.x, b.x, this.x), clamp(a.y, b.y, this.y));
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
