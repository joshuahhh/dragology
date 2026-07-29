import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { VaryPath, lessThan, moreThan, param } from "../DragSpec";
import { Vec2, Vec2able } from "../math/vec2";
import { path, translate } from "../svgx/helpers";

// Face center (fixed)
const CENTER = Vec2(200, 180);
const FACE_R = 120; // default radius

const EYE_R = 12;
const FACE_STROKE = 3;
const MOUTH_STROKE = 4;
const FACE_MARGIN = EYE_R + FACE_STROKE / 2 + 2;
const EYE_MARGIN = EYE_R + MOUTH_STROKE / 2 + 4;
const MIN_EYE_SPACING = EYE_R + 5;

type State = {
  eyeY: number;
  eyeDx: number;
  mouthDx: number;
  mouthEy: number;
  cp1d: { x: number; y: number };
  cp2d: { x: number; y: number };
  // Face shape
  faceRx: number;
  faceRyTop: number;
  faceRyBot: number;
  faceBulgeTR: number;
  faceBulgeBR: number;
};

const initialState: State = {
  eyeY: CENTER.y - 25,
  eyeDx: 40,
  mouthDx: 50,
  mouthEy: CENTER.y + 40,
  cp1d: { x: 20, y: 30 },
  cp2d: { x: -20, y: 30 },
  faceRx: FACE_R,
  faceRyTop: FACE_R,
  faceRyBot: FACE_R,
  faceBulgeTR: 0,
  faceBulgeBR: 0,
};

// ── Face outline geometry ──────────────────────────────────────────

type BezierSeg = { p0: Vec2; cp1: Vec2; cp2: Vec2; p3: Vec2 };

function evalBezier({ p0, cp1, cp2, p3 }: BezierSeg, t: number): Vec2 {
  const mt = 1 - t;
  return p0
    .mul(mt ** 3)
    .add(cp1.mul(3 * mt ** 2 * t))
    .add(cp2.mul(3 * mt * t ** 2))
    .add(p3.mul(t ** 3));
}

// Compute 4 Bezier segments for the face outline (relative to CENTER).
// Bilateral symmetry: left segments mirror right.
function faceSegments(s: State): BezierSeg[] {
  const { faceRx: rx, faceRyTop: ryT, faceRyBot: ryB } = s;
  const bTR = s.faceBulgeTR;
  const bBR = s.faceBulgeBR;

  // Default midpoints (on the ellipse at 45 degrees)
  const mid45 = 1 / Math.SQRT2;

  // Top-right: top (0, -ryT) → right (rx, 0)
  // Desired midpoint = default + bulge along radial direction
  const trMidDef = Vec2(rx * mid45, -ryT * mid45);
  const trMid = trMidDef.add(trMidDef.norm().mul(bTR));
  // Solve for CPs from midpoint (t=0.5):
  // Pmid.x = 0.375*cp1x + 0.5*rx  →  cp1x = (Pmid.x - 0.5*rx) / 0.375
  // Pmid.y = -0.5*ryT + 0.375*cp2y  →  cp2y = (Pmid.y + 0.5*ryT) / 0.375
  const trCP1x = (trMid.x - 0.5 * rx) / 0.375;
  const trCP2y = (trMid.y + 0.5 * ryT) / 0.375;

  // Bottom-right: right (rx, 0) → bottom (0, ryB)
  const brMidDef = Vec2(rx * mid45, ryB * mid45);
  const brMid = brMidDef.add(brMidDef.norm().mul(bBR));
  // Pmid.x = 0.5*rx + 0.375*cp2x  →  cp2x = (Pmid.x - 0.5*rx) / 0.375
  // Pmid.y = 0.375*cp1y + 0.5*ryB  →  cp1y = (Pmid.y - 0.5*ryB) / 0.375
  const brCP1y = (brMid.y - 0.5 * ryB) / 0.375;
  const brCP2x = (brMid.x - 0.5 * rx) / 0.375;

  return [
    // Top-right
    {
      p0: CENTER.add([0, -ryT]),
      cp1: CENTER.add([trCP1x, -ryT]),
      cp2: CENTER.add([rx, trCP2y]),
      p3: CENTER.add([rx, 0]),
    },
    // Bottom-right
    {
      p0: CENTER.add([rx, 0]),
      cp1: CENTER.add([rx, brCP1y]),
      cp2: CENTER.add([brCP2x, ryB]),
      p3: CENTER.add([0, ryB]),
    },
    // Bottom-left (mirror of bottom-right)
    {
      p0: CENTER.add([0, ryB]),
      cp1: CENTER.add([-brCP2x, ryB]),
      cp2: CENTER.add([-rx, brCP1y]),
      p3: CENTER.add([-rx, 0]),
    },
    // Top-left (mirror of top-right)
    {
      p0: CENTER.add([-rx, 0]),
      cp1: CENTER.add([-rx, trCP2y]),
      cp2: CENTER.add([-trCP1x, -ryT]),
      p3: CENTER.add([0, -ryT]),
    },
  ];
}

function faceSvgPath(s: State): string {
  const segs = faceSegments(s);
  return path(
    "M",
    segs[0].p0,
    ...segs.flatMap((seg) => ["C", seg.cp1, ",", seg.cp2, ",", seg.p3]),
    "Z",
  );
}

// Sample the face outline and build a radial lookup (angle → radius from center).
// Returns samples sorted by angle in [-π, π).
type FaceSample = { angle: number; radius: number };

function sampleFaceOutline(
  s: State,
  pointsPerSegment: number = 16,
): FaceSample[] {
  const segs = faceSegments(s);
  const samples: FaceSample[] = [];
  for (const seg of segs) {
    for (let i = 0; i < pointsPerSegment; i++) {
      const offset = evalBezier(seg, i / pointsPerSegment).sub(CENTER);
      samples.push({ angle: offset.angleRad(), radius: offset.len() });
    }
  }
  // Sort by angle for binary search
  samples.sort((a, b) => a.angle - b.angle);
  return samples;
}

// Get the face radius at a given angle by interpolating between samples.
function faceRadiusAtAngle(samples: FaceSample[], angle: number): number {
  const n = samples.length;
  // Binary search for the first sample with angle >= target
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].angle < angle) lo = mid + 1;
    else hi = mid;
  }
  const i1 = lo % n;
  const i0 = (i1 - 1 + n) % n;
  const a0 = samples[i0].angle;
  const a1 = samples[i1].angle;
  // Handle wrap-around
  let span = a1 - a0;
  let offset = angle - a0;
  if (span <= 0) span += 2 * Math.PI;
  if (offset < 0) offset += 2 * Math.PI;
  const t = span > 0 ? offset / span : 0;
  return samples[i0].radius + t * (samples[i1].radius - samples[i0].radius);
}

// Constraint-compatible: returns ≤ 0 if point is inside face (with margin), > 0 if outside.
function faceContains(
  samples: FaceSample[],
  point: Vec2able,
  margin: number,
): number {
  const offset = Vec2(point).sub(CENTER);
  const maxDist = faceRadiusAtAngle(samples, offset.angleRad()) - margin;
  return offset.len() - maxDist;
}

// Clamp a point to be inside the face outline (with margin).
// Pushes the point toward the center along the radial direction.
function clampPointInsideFace(
  samples: FaceSample[],
  point: Vec2able,
  margin: number,
): Vec2 {
  const offset = Vec2(point).sub(CENTER);
  const pointDist = offset.len();
  if (pointDist === 0) return Vec2(point);
  const maxDist = faceRadiusAtAngle(samples, offset.angleRad()) - margin;
  if (pointDist <= maxDist) return Vec2(point);
  return CENTER.add(offset.withLen(maxDist));
}

// ── Mouth / eye positions ──────────────────────────────────────────

function mouthLeft(s: State) {
  return Vec2(CENTER.x - s.mouthDx, s.mouthEy);
}
function mouthRight(s: State) {
  return Vec2(CENTER.x + s.mouthDx, s.mouthEy);
}
function cp1(s: State) {
  return mouthLeft(s).add(s.cp1d);
}
function cp2(s: State) {
  return mouthRight(s).add(s.cp2d);
}
function leftEye(s: State) {
  return Vec2(CENTER.x - s.eyeDx, s.eyeY);
}
function rightEye(s: State) {
  return Vec2(CENTER.x + s.eyeDx, s.eyeY);
}

function mouthPath(s: State): string {
  return path("M", mouthLeft(s), "C", cp1(s), ",", cp2(s), ",", mouthRight(s));
}

function evalMouthBezier(s: State, t: number): Vec2 {
  return evalBezier(
    { p0: mouthLeft(s), cp1: cp1(s), cp2: cp2(s), p3: mouthRight(s) },
    t,
  );
}

// ── Constraints ────────────────────────────────────────────────────

// Constraints for feature drags: everything except inside-face checks.
// Omitting face containment lets COBYLA freely position features,
// then .during() expands the face to fit (same pattern as eye-mouth push).
function featureConstraints(s: State): number[] {
  const results: number[] = [];
  results.push(moreThan(s.eyeDx, MIN_EYE_SPACING));
  results.push(moreThan(s.mouthDx, 10));

  const MAX_CP_OFFSET = 100;
  results.push(lessThan(Vec2(s.cp1d).len(), MAX_CP_OFFSET));
  results.push(lessThan(Vec2(s.cp2d).len(), MAX_CP_OFFSET));

  const N = 8;
  for (let i = 0; i < N; i++) {
    const pt1 = evalMouthBezier(s, i / N);
    const pt2 = evalMouthBezier(s, (i + 1) / N);
    results.push(lessThan(pt1.x, pt2.x));
  }

  return results;
}

// Feature constraints + inside-face checks for all features and mouth curve.
function featureConstraintsWithFace(s: State): number[] {
  const results = featureConstraints(s);
  const samples = sampleFaceOutline(s);

  results.push(faceContains(samples, leftEye(s), FACE_MARGIN));
  results.push(faceContains(samples, rightEye(s), FACE_MARGIN));
  results.push(faceContains(samples, mouthLeft(s), FACE_MARGIN));
  results.push(faceContains(samples, mouthRight(s), FACE_MARGIN));

  const N = 8;
  for (let i = 0; i <= N; i++) {
    results.push(faceContains(samples, evalMouthBezier(s, i / N), FACE_MARGIN));
  }

  return results;
}

// Constraints for face drags only: radii limits, no feature-inside-face checks.
// Omitting feature constraints lets COBYLA freely shrink the face,
// then .during() clamps features inside (same pattern as eye-mouth push).
function faceOnlyConstraints(s: State): number[] {
  return [
    moreThan(s.faceRx, 40),
    moreThan(s.faceRyTop, 40),
    moreThan(s.faceRyBot, 40),
  ];
}

// Prevents self-intersections/loops by checking that the outline's angle
// from center progresses monotonically (the outline stays star-shaped).
const FACE_SHAPE_SAMPLES_PER_SEG = 8;
function faceShapeConstraints(s: State): number[] {
  const segs = faceSegments(s);
  const angles: number[] = [];
  for (const seg of segs) {
    for (let i = 0; i < FACE_SHAPE_SAMPLES_PER_SEG; i++) {
      const t = i / FACE_SHAPE_SAMPLES_PER_SEG;
      angles.push(evalBezier(seg, t).sub(CENTER).angleRad());
    }
  }
  const results: number[] = [];
  const n = angles.length;
  for (let i = 0; i < n; i++) {
    let diff = angles[(i + 1) % n] - angles[i];
    if (diff < -Math.PI) diff += 2 * Math.PI;
    // Each step must be at least 25% of uniform spacing (prevents sharp pinches)
    results.push(moreThan(diff, ((2 * Math.PI) / n) * 0.25));
  }
  return results;
}

// ── Push / clamp helpers ───────────────────────────────────────────

function pushMouthBelowEyes(s: State): State {
  let result = s;
  for (let iter = 0; iter < 3; iter++) {
    const le = leftEye(result);
    const re = rightEye(result);
    const threshold = EYE_R + 2;
    let maxPush = 0;
    for (let i = 0; i <= 8; i++) {
      const pt = evalMouthBezier(result, i / 8);
      for (const eye of [le, re]) {
        const hDist = Math.abs(pt.x - eye.x);
        if (hDist < threshold && pt.y < eye.y + EYE_MARGIN) {
          maxPush = Math.max(maxPush, eye.y + EYE_MARGIN - pt.y);
        }
      }
    }
    if (maxPush <= 0) break;
    result = { ...result, mouthEy: result.mouthEy + maxPush };
  }
  return result;
}

function clampEyesAboveCurve(s: State): State {
  const le = leftEye(s);
  const re = rightEye(s);
  const threshold = EYE_R + 2;
  let minEyeY = s.eyeY;
  for (let i = 0; i <= 8; i++) {
    const pt = evalMouthBezier(s, i / 8);
    for (const eye of [le, re]) {
      const hDist = Math.abs(pt.x - eye.x);
      if (hDist < threshold) {
        minEyeY = Math.min(minEyeY, pt.y - EYE_MARGIN);
      }
    }
  }
  if (minEyeY < s.eyeY) {
    return { ...s, eyeY: minEyeY };
  }
  return s;
}

// Expand face radii so a point fits inside (instead of clamping the point).
// Decomposes the deficit into horizontal/vertical and expands the relevant radii.
function expandFaceForPoint(s: State, point: Vec2able, margin: number): State {
  const samples = sampleFaceOutline(s);
  const offset = Vec2(point).sub(CENTER);
  const pointDist = offset.len();
  if (pointDist === 0) return s;
  const angle = offset.angleRad();
  const maxDist = faceRadiusAtAngle(samples, angle) - margin;
  if (pointDist <= maxDist) return s;

  const deficit = pointDist - maxDist;
  const cosA = Math.abs(Math.cos(angle));
  const sinA = Math.abs(Math.sin(angle));

  return {
    ...s,
    faceRx: s.faceRx + deficit * cosA,
    faceRyTop: offset.y < 0 ? s.faceRyTop + deficit * sinA : s.faceRyTop,
    faceRyBot: offset.y > 0 ? s.faceRyBot + deficit * sinA : s.faceRyBot,
  };
}

// Expand face to contain all feature points.
function expandFaceForFeatures(s: State): State {
  let result = s;
  result = expandFaceForPoint(result, leftEye(result), FACE_MARGIN);
  result = expandFaceForPoint(result, rightEye(result), FACE_MARGIN);
  result = expandFaceForPoint(result, mouthLeft(result), FACE_MARGIN);
  result = expandFaceForPoint(result, mouthRight(result), FACE_MARGIN);
  for (let i = 0; i <= 8; i++) {
    result = expandFaceForPoint(
      result,
      evalMouthBezier(result, i / 8),
      FACE_MARGIN,
    );
  }
  return result;
}

function clampInsideFace(s: State): State {
  const samples = sampleFaceOutline(s);
  let result = s;

  // Clamp eyes
  const le = leftEye(result);
  const re = rightEye(result);
  const clampedLE = clampPointInsideFace(samples, le, FACE_MARGIN);
  const clampedRE = clampPointInsideFace(samples, re, FACE_MARGIN);
  if (!clampedLE.eq(le) || !clampedRE.eq(re)) {
    const newEyeY = Math.min(clampedLE.y, clampedRE.y);
    const newEyeDx = Math.max(
      MIN_EYE_SPACING,
      Math.min(
        Math.abs(clampedLE.x - CENTER.x),
        Math.abs(clampedRE.x - CENTER.x),
      ),
    );
    result = { ...result, eyeY: newEyeY, eyeDx: newEyeDx };
  }

  // Clamp mouth endpoints
  const ml = mouthLeft(result);
  const mr = mouthRight(result);
  const clampedML = clampPointInsideFace(samples, ml, FACE_MARGIN);
  const clampedMR = clampPointInsideFace(samples, mr, FACE_MARGIN);
  if (!clampedML.eq(ml) || !clampedMR.eq(mr)) {
    const newMouthEy = Math.max(clampedML.y, clampedMR.y);
    const newMouthDx = Math.max(
      10,
      Math.min(
        Math.abs(clampedML.x - CENTER.x),
        Math.abs(clampedMR.x - CENTER.x),
      ),
    );
    result = { ...result, mouthEy: newMouthEy, mouthDx: newMouthDx };
  }

  return result;
}

function pushMouthAway(s: State): State {
  const minDist = EYE_R + EYE_MARGIN;
  let result = s;
  for (let iter = 0; iter < 3; iter++) {
    const le = leftEye(result);
    const re = rightEye(result);
    let maxPush = 0;
    for (let i = 0; i <= 8; i++) {
      const pt = evalMouthBezier(result, i / 8);
      for (const eye of [le, re]) {
        const d = pt.dist(eye);
        if (d < minDist) {
          maxPush = Math.max(maxPush, minDist - d);
        }
      }
    }
    if (maxPush <= 0) break;
    result = { ...result, mouthEy: result.mouthEy + maxPush };
  }
  return result;
}

const EYE_PUSH_VERTICAL_BIAS = 0.5;

function pushEyesAway(s: State): State {
  const minDist = EYE_R + EYE_MARGIN;
  let result = s;
  for (let iter = 0; iter < 3; iter++) {
    const le = leftEye(result);
    const re = rightEye(result);
    let totalPushY = 0;
    let totalPushDx = 0;
    for (let i = 0; i <= 8; i++) {
      const pt = evalMouthBezier(result, i / 8);
      for (const eye of [le, re]) {
        const d = pt.dist(eye);
        if (d < minDist && d > 0) {
          const deficit = minDist - d;
          const dir = eye.sub(pt).div(d);
          totalPushY += dir.y * deficit;
          const isLeftEye = eye.x < CENTER.x;
          totalPushDx += (isLeftEye ? -dir.x : dir.x) * deficit;
        }
      }
    }
    const mag = Vec2(totalPushY, totalPushDx).len();
    if (mag < 0.1) break;
    const pushY = totalPushY * EYE_PUSH_VERTICAL_BIAS;
    const pushDx = totalPushDx * (1 - EYE_PUSH_VERTICAL_BIAS);
    const newEyeY = result.eyeY + pushY;
    const newEyeDx = Math.max(MIN_EYE_SPACING, result.eyeDx + pushDx);
    result = { ...result, eyeY: newEyeY, eyeDx: newEyeDx };
  }
  return result;
}

// ── Rendering ──────────────────────────────────────────────────────

const CURVE_SAMPLES = 11;
const tValues = Array.from(
  { length: CURVE_SAMPLES },
  (_, i) => (i + 1) / (CURVE_SAMPLES + 1),
);

const ENDPOINT_R = 6;

const FACE_PERIMETER_SAMPLES = 7;
const facePerimeterTs = [
  0, // junction handle at segment start
  ...Array.from(
    { length: FACE_PERIMETER_SAMPLES },
    (_, i) => (i + 1) / (FACE_PERIMETER_SAMPLES + 1),
  ),
];

function makeDraggable(
  scaleCurve: boolean,
  eyesAboveMouth: boolean,
  constrainFaceShape: boolean,
  expandFace: boolean,
): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const ml = mouthLeft(state);
    const mr = mouthRight(state);
    const le = leftEye(state);
    const re = rightEye(state);

    const segs = faceSegments(state);

    // When expandFace is off, COBYLA keeps features inside face.
    // When on, features can go outside and .during() expands the face.
    const featureConstraint = expandFace
      ? featureConstraints
      : featureConstraintsWithFace;

    // Shared tail for feature .during(): clamp eyes above curve, expand face, clamp inside.
    function finalizeDuring(s: State): State {
      let result = s;
      if (eyesAboveMouth) result = clampEyesAboveCurve(result);
      if (expandFace) result = expandFaceForFeatures(result);
      return clampInsideFace(result);
    }

    function eyeDragology() {
      const spec = d.vary(state, [param("eyeY"), param("eyeDx")], {
        constraint: featureConstraint,
      });
      const origMouthEy = state.mouthEy;
      const origCp1d = state.cp1d;
      const origCp2d = state.cp2d;
      return spec.during((s) => {
        let result = eyesAboveMouth ? pushMouthBelowEyes(s) : pushMouthAway(s);
        if (result.mouthEy !== origMouthEy) {
          const fb = CENTER.y + state.faceRyBot - FACE_MARGIN;
          const origSpace = fb - origMouthEy;
          const newSpace = fb - result.mouthEy;
          const scale = origSpace > 0 ? newSpace / origSpace : 1;
          result = {
            ...result,
            cp1d: { ...result.cp1d, y: origCp1d.y * scale },
            cp2d: { ...result.cp2d, y: origCp2d.y * scale },
          };
        }
        return finalizeDuring(result);
      });
    }

    function endpointDragology() {
      const spec = d.vary(state, [param("mouthDx"), param("mouthEy")], {
        constraint: featureConstraint,
      });
      const origDx = state.mouthDx;
      const origEy = state.mouthEy;
      const origCp1d = Vec2(state.cp1d);
      const origCp2d = Vec2(state.cp2d);
      return spec.during((s) => {
        let result = pushEyesAway(s);
        if (scaleCurve) {
          const dxScale = origDx > 0 ? result.mouthDx / origDx : 1;
          const fb = CENTER.y + state.faceRyBot - FACE_MARGIN;
          const origSpace = fb - origEy;
          const newSpace = fb - result.mouthEy;
          const vyScale = origSpace > 0 ? newSpace / origSpace : 1;
          const cp1d = origCp1d.scale([dxScale, vyScale]);
          const cp2d = origCp2d.scale([dxScale, vyScale]);
          result = { ...result, cp1d, cp2d };
        }
        return finalizeDuring(result);
      });
    }

    function curveDragology(t: number) {
      const paths: VaryPath<State>[] =
        t < 0.4
          ? [param("cp1d", "x"), param("cp1d", "y")]
          : t > 0.6
            ? [param("cp2d", "x"), param("cp2d", "y")]
            : [
                param("cp1d", "x"),
                param("cp1d", "y"),
                param("cp2d", "x"),
                param("cp2d", "y"),
              ];
      const spec = d.vary(state, paths, { constraint: featureConstraint });
      return spec.during((s) => finalizeDuring(pushEyesAway(s)));
    }

    function faceConstraint(s: State): number[] {
      const results = faceOnlyConstraints(s);
      if (constrainFaceShape) results.push(...faceShapeConstraints(s));
      return results;
    }

    function faceDuring(s: State): State {
      let result = eyesAboveMouth ? pushMouthBelowEyes(s) : pushMouthAway(s);
      result = pushEyesAway(result);
      if (eyesAboveMouth) result = clampEyesAboveCurve(result);
      return clampInsideFace(result);
    }

    // Face perimeter: pin-by-t selects which param to vary per segment.
    // [startParam, midParam (bulge), endParam] for each segment.
    const faceSegParams: [VaryPath<State>, VaryPath<State>, VaryPath<State>][] =
      [
        [param("faceRyTop"), param("faceBulgeTR"), param("faceRx")], // seg 0: top → right
        [param("faceRx"), param("faceBulgeBR"), param("faceRyBot")], // seg 1: right → bottom
        [param("faceRyBot"), param("faceBulgeBR"), param("faceRx")], // seg 2: bottom → left (mirror)
        [param("faceRx"), param("faceBulgeTR"), param("faceRyTop")], // seg 3: left → top (mirror)
      ];

    function facePerimeterDragology(segIdx: number, t: number) {
      const [startP, midP, endP] = faceSegParams[segIdx];
      const paths: VaryPath<State>[] =
        t < 0.35 ? [startP] : t > 0.65 ? [endP] : [midP];
      return d
        .vary(state, paths, { constraint: faceConstraint })
        .during(faceDuring);
    }

    return (
      <g>
        {/* Face outline */}
        <path
          id="face"
          d={faceSvgPath(state)}
          fill="#ffe0b2"
          stroke="#e6a756"
          strokeWidth={FACE_STROKE}
          dragologyZIndex={0}
        />

        {/* Face perimeter drag handles (invisible, below features so eyes/mouth win) */}
        {(() => {
          const maxR = Math.max(state.faceRx, state.faceRyTop, state.faceRyBot);
          const hitR = Math.max(16, maxR * 0.13);
          return segs.flatMap((seg, segIdx) =>
            facePerimeterTs.map((t) => {
              const pt = evalBezier(seg, t);
              const id = `face-${segIdx}-${t}`;
              const isDragged = draggedId === id;
              return (
                <circle
                  id={id}
                  transform={translate(pt)}
                  r={isDragged ? 6 : hitR}
                  fill={isDragged ? "rgba(230, 167, 86, 0.4)" : "transparent"}
                  dragologyZIndex={0}
                  dragologyOnDrag={() => facePerimeterDragology(segIdx, t)}
                />
              );
            }),
          );
        })()}

        {/* Eyes */}
        <circle
          id="left-eye"
          transform={translate(le)}
          r={EYE_R}
          fill="#333"
          dragologyZIndex={1}
          dragologyOnDrag={eyeDragology}
        />
        <circle
          id="right-eye"
          transform={translate(re)}
          r={EYE_R}
          fill="#333"
          dragologyZIndex={1}
          dragologyOnDrag={eyeDragology}
        />

        {/* Mouth curve */}
        <path
          id="mouth"
          d={mouthPath(state)}
          fill="none"
          stroke="#c0392b"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
          dragologyZIndex={1}
        />

        {/* Drag handles along the mouth curve */}
        {tValues.map((t) => {
          const pt = evalMouthBezier(state, t);
          const id = `mouth-${t}`;
          const isDragged = draggedId === id;
          return (
            <circle
              id={id}
              transform={translate(pt)}
              r={isDragged ? 8 : 14}
              fill={isDragged ? "rgba(192, 57, 43, 0.4)" : "transparent"}
              dragologyZIndex={2}
              dragologyOnDrag={() => curveDragology(t)}
            />
          );
        })}

        {/* Mouth endpoint handles */}
        <circle
          id="mouth-endpoint-left"
          transform={translate(ml)}
          r={ENDPOINT_R}
          fill={draggedId === "mouth-endpoint-left" ? "#e74c3c" : "#c0392b"}
          stroke="#c0392b"
          strokeWidth={1.5}
          dragologyZIndex={3}
          dragologyOnDrag={endpointDragology}
        />
        <circle
          id="mouth-endpoint-right"
          transform={translate(mr)}
          r={ENDPOINT_R}
          fill={draggedId === "mouth-endpoint-right" ? "#e74c3c" : "#c0392b"}
          stroke="#c0392b"
          strokeWidth={1.5}
          dragologyZIndex={3}
          dragologyOnDrag={endpointDragology}
        />
      </g>
    );
  };
}

export default demo(
  () => {
    const [scaleCurve, setScaleCurve] = useState(true);
    const [eyesAboveMouth, setEyesAboveMouth] = useState(true);
    const [constrainFaceShape, setConstrainFaceShape] = useState(true);
    const [expandFace, setExpandFace] = useState(true);
    const draggable = useMemo(
      () =>
        makeDraggable(
          scaleCurve,
          eyesAboveMouth,
          constrainFaceShape,
          expandFace,
        ),
      [scaleCurve, eyesAboveMouth, constrainFaceShape, expandFace],
    );
    return (
      <DemoWithConfig>
        <div>
          <DemoNotes>
            Drag eyes to move/space them. Drag the mouth curve or endpoints.
            Drag the face outline to reshape. Features push each other.
          </DemoNotes>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={400}
            height={350}
          />
        </div>
        <ConfigPanel>
          <ConfigCheckbox
            label="Keep eyes above mouth"
            value={eyesAboveMouth}
            onChange={setEyesAboveMouth}
          />
          <ConfigCheckbox
            label="Features move face"
            value={expandFace}
            onChange={setExpandFace}
          />
          <ConfigCheckbox
            label="Scale mouth with endpoints"
            value={scaleCurve}
            onChange={setScaleCurve}
          />
          <ConfigCheckbox
            label="Enable Mickey mode"
            value={!constrainFaceShape}
            onChange={(v) => setConstrainFaceShape(!v)}
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["spec.during", "d.vary [w/constraint]"] },
);
