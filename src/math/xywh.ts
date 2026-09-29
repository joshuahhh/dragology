import { lerp, Vec2 } from "./vec2";

export type XYWH = readonly [number, number, number, number];

export const XYWH = (x: number, y: number, w: number, h: number): XYWH => {
  if (w < 0) {
    x -= w;
    w = -w;
  }
  if (h < 0) {
    y -= h;
    h = -h;
  }
  return [x, y, w, h];
};

/** The smallest XYWH containing all the points. */
export const boundingXYWH = (pts: Vec2[]): XYWH => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return XYWH(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
};

/** Whether a and b overlap (or are within `margin` of each other). */
export const overlapsXYWH = (
  [ax, ay, aw, ah]: XYWH,
  [bx, by, bw, bh]: XYWH,
  margin = 0,
): boolean =>
  ax <= bx + bw + margin &&
  bx <= ax + aw + margin &&
  ay <= by + bh + margin &&
  by <= ay + ah + margin;

export const inXYWH = (t: Vec2, [x, y, w, h]: XYWH) => {
  return x <= t.x && t.x <= x + w && y <= t.y && t.y <= y + h;
};

export const fromCenter = (center: Vec2, w: number, h: number): XYWH => {
  return XYWH(center.x - w / 2, center.y - h / 2, w, h);
};

export const translateXYWH = (xywh: XYWH, v: Vec2): XYWH => {
  return XYWH(xywh[0] + v.x, xywh[1] + v.y, xywh[2], xywh[3]);
};

export const lerpXYWH = (a: XYWH, b: XYWH, t: number): XYWH => {
  return XYWH(
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t),
  );
};

export const merge = (a: XYWH | null, b: XYWH | null): XYWH | null => {
  if (a === null) return b;
  if (b === null) return a;
  const x1 = Math.min(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.max(a[1] + a[3], b[1] + b[3]);
  return XYWH(x1, y1, x2 - x1, y2 - y1);
};

export const mergeMany = (xywhs: (XYWH | null)[]): XYWH | null => {
  return xywhs.reduce((acc, xywh) => merge(acc, xywh), null);
};

export const tl = (xywh: XYWH): Vec2 => Vec2(xywh[0], xywh[1]);
export const tr = (xywh: XYWH): Vec2 => Vec2(xywh[0] + xywh[2], xywh[1]);
export const bl = (xywh: XYWH): Vec2 => Vec2(xywh[0], xywh[1] + xywh[3]);
export const br = (xywh: XYWH): Vec2 =>
  Vec2(xywh[0] + xywh[2], xywh[1] + xywh[3]);
export const tm = (xywh: XYWH): Vec2 => Vec2(xywh[0] + xywh[2] / 2, xywh[1]);
export const bm = (xywh: XYWH): Vec2 =>
  Vec2(xywh[0] + xywh[2] / 2, xywh[1] + xywh[3]);
export const ml = (xywh: XYWH): Vec2 => Vec2(xywh[0], xywh[1] + xywh[3] / 2);
export const mr = (xywh: XYWH): Vec2 =>
  Vec2(xywh[0] + xywh[2], xywh[1] + xywh[3] / 2);
export const mm = (xywh: XYWH): Vec2 =>
  Vec2(xywh[0] + xywh[2] / 2, xywh[1] + xywh[3] / 2);

export const expand = (xywh: XYWH, dx: number, dy?: number): XYWH => {
  if (dy === undefined) dy = dx;
  return [xywh[0] - dx, xywh[1] - dy, xywh[2] + 2 * dx, xywh[3] + 2 * dy];
};

export const polyXYWH = (xywh: XYWH): Vec2[] => {
  return [tl(xywh), tr(xywh), br(xywh), bl(xywh)];
};

export function pointInPoly(point: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: Vec2[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}
