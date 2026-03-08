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
import { lessThan, moreThan } from "../DragSpec";
import { PathIn } from "../paths";
import { translate } from "../svgx/helpers";

// Face center (fixed)
const FACE_CX = 200;
const FACE_CY = 180;
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
  cp1dx: number;
  cp1dy: number;
  cp2dx: number;
  cp2dy: number;
  pinned: { eyes: boolean; mouth: boolean };
  // Face shape
  faceRx: number;
  faceRyTop: number;
  faceRyBot: number;
  faceBulgeTR: number;
  faceBulgeBR: number;
};

const initialState: State = {
  eyeY: FACE_CY - 25,
  eyeDx: 40,
  mouthDx: 50,
  mouthEy: FACE_CY + 40,
  cp1dx: 20,
  cp1dy: 30,
  cp2dx: -20,
  cp2dy: 30,
  pinned: { eyes: false, mouth: false },
  faceRx: FACE_R,
  faceRyTop: FACE_R,
  faceRyBot: FACE_R,
  faceBulgeTR: 0,
  faceBulgeBR: 0,
};

// ── Face outline geometry ──────────────────────────────────────────

type BezierSeg = {
  p0: { x: number; y: number };
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
  p3: { x: number; y: number };
};

function evalBezier(seg: BezierSeg, t: number): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x:
      mt ** 3 * seg.p0.x +
      3 * mt ** 2 * t * seg.cp1.x +
      3 * mt * t ** 2 * seg.cp2.x +
      t ** 3 * seg.p3.x,
    y:
      mt ** 3 * seg.p0.y +
      3 * mt ** 2 * t * seg.cp1.y +
      3 * mt * t ** 2 * seg.cp2.y +
      t ** 3 * seg.p3.y,
  };
}

// Compute 4 Bezier segments for the face outline (relative to FACE_CX/CY).
// Bilateral symmetry: left segments mirror right.
function faceSegments(s: State): BezierSeg[] {
  const { faceRx: rx, faceRyTop: ryT, faceRyBot: ryB } = s;
  const bTR = s.faceBulgeTR;
  const bBR = s.faceBulgeBR;

  // Default midpoints (on the ellipse at 45 degrees)
  const mid45 = 1 / Math.SQRT2;

  // Top-right: top (0, -ryT) → right (rx, 0)
  // Desired midpoint = default + bulge along radial direction
  const trMidDef = { x: rx * mid45, y: -ryT * mid45 };
  const trMidR = Math.sqrt(trMidDef.x ** 2 + trMidDef.y ** 2);
  const trDir = { x: trMidDef.x / trMidR, y: trMidDef.y / trMidR };
  const trMid = {
    x: trMidDef.x + bTR * trDir.x,
    y: trMidDef.y + bTR * trDir.y,
  };
  // Solve for CPs from midpoint (t=0.5):
  // Pmid.x = 0.375*cp1x + 0.5*rx  →  cp1x = (Pmid.x - 0.5*rx) / 0.375
  // Pmid.y = -0.5*ryT + 0.375*cp2y  →  cp2y = (Pmid.y + 0.5*ryT) / 0.375
  const trCP1x = (trMid.x - 0.5 * rx) / 0.375;
  const trCP2y = (trMid.y + 0.5 * ryT) / 0.375;

  // Bottom-right: right (rx, 0) → bottom (0, ryB)
  const brMidDef = { x: rx * mid45, y: ryB * mid45 };
  const brMidR = Math.sqrt(brMidDef.x ** 2 + brMidDef.y ** 2);
  const brDir = { x: brMidDef.x / brMidR, y: brMidDef.y / brMidR };
  const brMid = {
    x: brMidDef.x + bBR * brDir.x,
    y: brMidDef.y + bBR * brDir.y,
  };
  // Pmid.x = 0.5*rx + 0.375*cp2x  →  cp2x = (Pmid.x - 0.5*rx) / 0.375
  // Pmid.y = 0.375*cp1y + 0.5*ryB  →  cp1y = (Pmid.y - 0.5*ryB) / 0.375
  const brCP1y = (brMid.y - 0.5 * ryB) / 0.375;
  const brCP2x = (brMid.x - 0.5 * rx) / 0.375;

  const cx = FACE_CX;
  const cy = FACE_CY;

  return [
    // Top-right
    {
      p0: { x: cx, y: cy - ryT },
      cp1: { x: cx + trCP1x, y: cy - ryT },
      cp2: { x: cx + rx, y: cy + trCP2y },
      p3: { x: cx + rx, y: cy },
    },
    // Bottom-right
    {
      p0: { x: cx + rx, y: cy },
      cp1: { x: cx + rx, y: cy + brCP1y },
      cp2: { x: cx + brCP2x, y: cy + ryB },
      p3: { x: cx, y: cy + ryB },
    },
    // Bottom-left (mirror of bottom-right)
    {
      p0: { x: cx, y: cy + ryB },
      cp1: { x: cx - brCP2x, y: cy + ryB },
      cp2: { x: cx - rx, y: cy + brCP1y },
      p3: { x: cx - rx, y: cy },
    },
    // Top-left (mirror of top-right)
    {
      p0: { x: cx - rx, y: cy },
      cp1: { x: cx - rx, y: cy + trCP2y },
      cp2: { x: cx - trCP1x, y: cy - ryT },
      p3: { x: cx, y: cy - ryT },
    },
  ];
}

function faceSvgPath(s: State): string {
  const segs = faceSegments(s);
  let d = `M ${segs[0].p0.x} ${segs[0].p0.y}`;
  for (const seg of segs) {
    d += ` C ${seg.cp1.x} ${seg.cp1.y}, ${seg.cp2.x} ${seg.cp2.y}, ${seg.p3.x} ${seg.p3.y}`;
  }
  d += " Z";
  return d;
}

// Sample the face outline and build a radial lookup (angle → radius from center).
// Returns samples sorted by angle in [-π, π).
type FaceSample = { x: number; y: number; angle: number; radius: number };

function sampleFaceOutline(
  s: State,
  pointsPerSegment: number = 16,
): FaceSample[] {
  const segs = faceSegments(s);
  const samples: FaceSample[] = [];
  for (const seg of segs) {
    for (let i = 0; i < pointsPerSegment; i++) {
      const t = i / pointsPerSegment;
      const pt = evalBezier(seg, t);
      const dx = pt.x - FACE_CX;
      const dy = pt.y - FACE_CY;
      samples.push({
        x: pt.x,
        y: pt.y,
        angle: Math.atan2(dy, dx),
        radius: Math.sqrt(dx * dx + dy * dy),
      });
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

// Clamp a point to be inside the face outline (with margin).
// Pushes the point toward the center along the radial direction.
function clampPointInsideFace(
  samples: FaceSample[],
  point: { x: number; y: number },
  margin: number,
): { x: number; y: number } {
  const dx = point.x - FACE_CX;
  const dy = point.y - FACE_CY;
  const pointDist = Math.sqrt(dx * dx + dy * dy);
  if (pointDist === 0) return point;
  const angle = Math.atan2(dy, dx);
  const maxDist = faceRadiusAtAngle(samples, angle) - margin;
  if (pointDist <= maxDist) return point;
  return {
    x: FACE_CX + (dx / pointDist) * maxDist,
    y: FACE_CY + (dy / pointDist) * maxDist,
  };
}

// ── Mouth / eye positions ──────────────────────────────────────────

function mouthLeft(s: State) {
  return { x: FACE_CX - s.mouthDx, y: s.mouthEy };
}
function mouthRight(s: State) {
  return { x: FACE_CX + s.mouthDx, y: s.mouthEy };
}
function cp1(s: State) {
  const ml = mouthLeft(s);
  return { x: ml.x + s.cp1dx, y: ml.y + s.cp1dy };
}
function cp2(s: State) {
  const mr = mouthRight(s);
  return { x: mr.x + s.cp2dx, y: mr.y + s.cp2dy };
}
function leftEye(s: State) {
  return { x: FACE_CX - s.eyeDx, y: s.eyeY };
}
function rightEye(s: State) {
  return { x: FACE_CX + s.eyeDx, y: s.eyeY };
}

function mouthPath(s: State): string {
  const ml = mouthLeft(s);
  const mr = mouthRight(s);
  const c1 = cp1(s);
  const c2 = cp2(s);
  return `M ${ml.x} ${ml.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${mr.x} ${mr.y}`;
}

function evalMouthBezier(s: State, t: number): { x: number; y: number } {
  const p0 = mouthLeft(s);
  const p1 = cp1(s);
  const p2 = cp2(s);
  const p3 = mouthRight(s);
  const mt = 1 - t;
  return {
    x:
      mt ** 3 * p0.x +
      3 * mt ** 2 * t * p1.x +
      3 * mt * t ** 2 * p2.x +
      t ** 3 * p3.x,
    y:
      mt ** 3 * p0.y +
      3 * mt ** 2 * t * p1.y +
      3 * mt * t ** 2 * p2.y +
      t ** 3 * p3.y,
  };
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
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
  results.push(
    lessThan(Math.sqrt(s.cp1dx ** 2 + s.cp1dy ** 2), MAX_CP_OFFSET),
  );
  results.push(
    lessThan(Math.sqrt(s.cp2dx ** 2 + s.cp2dy ** 2), MAX_CP_OFFSET),
  );

  const N = 8;
  for (let i = 0; i < N; i++) {
    const pt1 = evalMouthBezier(s, i / N);
    const pt2 = evalMouthBezier(s, (i + 1) / N);
    results.push(lessThan(pt1.x, pt2.x));
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
      const pt = evalBezier(seg, t);
      angles.push(Math.atan2(pt.y - FACE_CY, pt.x - FACE_CX));
    }
  }
  const results: number[] = [];
  const n = angles.length;
  for (let i = 0; i < n; i++) {
    let diff = angles[(i + 1) % n] - angles[i];
    if (diff < -Math.PI) diff += 2 * Math.PI;
    // Each step must be at least 25% of uniform spacing (prevents sharp pinches)
    results.push(moreThan(diff, (2 * Math.PI) / n * 0.25));
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
function expandFaceForPoint(
  s: State,
  point: { x: number; y: number },
  margin: number,
): State {
  const samples = sampleFaceOutline(s);
  const dx = point.x - FACE_CX;
  const dy = point.y - FACE_CY;
  const pointDist = Math.sqrt(dx * dx + dy * dy);
  if (pointDist === 0) return s;
  const angle = Math.atan2(dy, dx);
  const maxDist = faceRadiusAtAngle(samples, angle) - margin;
  if (pointDist <= maxDist) return s;

  const deficit = pointDist - maxDist;
  const cosA = Math.abs(Math.cos(angle));
  const sinA = Math.abs(Math.sin(angle));

  return {
    ...s,
    faceRx: s.faceRx + deficit * cosA,
    faceRyTop: dy < 0 ? s.faceRyTop + deficit * sinA : s.faceRyTop,
    faceRyBot: dy > 0 ? s.faceRyBot + deficit * sinA : s.faceRyBot,
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
  if (clampedLE.x !== le.x || clampedLE.y !== le.y ||
      clampedRE.x !== re.x || clampedRE.y !== re.y) {
    // Use the more restrictive of the two eyes
    const newEyeY = Math.min(clampedLE.y, clampedRE.y);
    // For eyeDx, take the minimum distance from center
    const newEyeDx = Math.max(
      MIN_EYE_SPACING,
      Math.min(
        Math.abs(clampedLE.x - FACE_CX),
        Math.abs(clampedRE.x - FACE_CX),
      ),
    );
    result = { ...result, eyeY: newEyeY, eyeDx: newEyeDx };
  }

  // Clamp mouth endpoints
  const ml = mouthLeft(result);
  const mr = mouthRight(result);
  const clampedML = clampPointInsideFace(samples, ml, FACE_MARGIN);
  const clampedMR = clampPointInsideFace(samples, mr, FACE_MARGIN);
  if (clampedML.x !== ml.x || clampedML.y !== ml.y ||
      clampedMR.x !== mr.x || clampedMR.y !== mr.y) {
    const newMouthEy = Math.max(clampedML.y, clampedMR.y);
    const newMouthDx = Math.max(
      10,
      Math.min(
        Math.abs(clampedML.x - FACE_CX),
        Math.abs(clampedMR.x - FACE_CX),
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
        const d = dist(pt, eye);
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
        const d = dist(pt, eye);
        if (d < minDist && d > 0) {
          const deficit = minDist - d;
          const dirX = (eye.x - pt.x) / d;
          const dirY = (eye.y - pt.y) / d;
          totalPushY += dirY * deficit;
          const isLeftEye = eye.x < FACE_CX;
          totalPushDx += (isLeftEye ? -dirX : dirX) * deficit;
        }
      }
    }
    const mag = Math.sqrt(totalPushY ** 2 + totalPushDx ** 2);
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
const PIN_R = 5;

const FACE_PERIMETER_SAMPLES = 7;
const facePerimeterTs = Array.from(
  { length: FACE_PERIMETER_SAMPLES },
  (_, i) => (i + 1) / (FACE_PERIMETER_SAMPLES + 1),
);

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
    const eyesPinned = state.pinned.eyes;
    const mouthPinned = state.pinned.mouth;

    const segs = faceSegments(state);

    // Pin indicator x position (relative to rightmost face edge)
    const pinX = FACE_CX + state.faceRx + 18;

    function eyeDragology() {
      const spec = d.vary(state, [["eyeY"], ["eyeDx"]], {
        constraint: featureConstraints,
      });
      if (mouthPinned && !eyesAboveMouth) return spec;
      const origMouthEy = state.mouthEy;
      const origCp1dy = state.cp1dy;
      const origCp2dy = state.cp2dy;
      return spec.during((s) => {
        let result = s;
        if (!mouthPinned) {
          result = eyesAboveMouth
            ? pushMouthBelowEyes(result)
            : pushMouthAway(result);
        }
        if (result.mouthEy !== origMouthEy) {
          const fb = FACE_CY + state.faceRyBot - FACE_MARGIN;
          const origSpace = fb - origMouthEy;
          const newSpace = fb - result.mouthEy;
          const scale = origSpace > 0 ? newSpace / origSpace : 1;
          result = {
            ...result,
            cp1dy: origCp1dy * scale,
            cp2dy: origCp2dy * scale,
          };
        }
        if (eyesAboveMouth) result = clampEyesAboveCurve(result);
        if (expandFace) result = expandFaceForFeatures(result);
        return clampInsideFace(result);
      });
    }

    function endpointDragology() {
      const spec = d.vary(state, [["mouthDx"], ["mouthEy"]], {
        constraint: featureConstraints,
      });
      const origDx = state.mouthDx;
      const origEy = state.mouthEy;
      const origCp1dx = state.cp1dx;
      const origCp1dy = state.cp1dy;
      const origCp2dx = state.cp2dx;
      const origCp2dy = state.cp2dy;
      return spec.during((s) => {
        let result = eyesPinned ? s : pushEyesAway(s);
        if (eyesAboveMouth) result = clampEyesAboveCurve(result);
        if (scaleCurve) {
          const dxScale = origDx > 0 ? result.mouthDx / origDx : 1;
          const fb = FACE_CY + state.faceRyBot - FACE_MARGIN;
          const origSpace = fb - origEy;
          const newSpace = fb - result.mouthEy;
          const vyScale = origSpace > 0 ? newSpace / origSpace : 1;
          result = {
            ...result,
            cp1dx: origCp1dx * dxScale,
            cp2dx: origCp2dx * dxScale,
            cp1dy: origCp1dy * vyScale,
            cp2dy: origCp2dy * vyScale,
          };
        }
        if (expandFace) result = expandFaceForFeatures(result);
        return clampInsideFace(result);
      });
    }

    function curveDragology(t: number) {
      const paths: PathIn<State, number>[] =
        t < 0.4
          ? [["cp1dx"], ["cp1dy"]]
          : t > 0.6
            ? [["cp2dx"], ["cp2dy"]]
            : [["cp1dx"], ["cp1dy"], ["cp2dx"], ["cp2dy"]];
      const spec = d.vary(state, paths, { constraint: featureConstraints });
      return spec.during((s) => {
        let result = eyesPinned ? s : pushEyesAway(s);
        if (eyesAboveMouth) result = clampEyesAboveCurve(result);
        if (expandFace) result = expandFaceForFeatures(result);
        return clampInsideFace(result);
      });
    }

    function faceConstraint(s: State): number[] {
      const base = faceOnlyConstraints(s);
      return constrainFaceShape ? [...base, ...faceShapeConstraints(s)] : base;
    }

    function faceDuring(s: State): State {
      let result = s;
      if (!mouthPinned && !eyesPinned) {
        result = eyesAboveMouth
          ? pushMouthBelowEyes(result)
          : pushMouthAway(result);
        result = pushEyesAway(result);
      } else if (!mouthPinned) {
        result = eyesAboveMouth
          ? pushMouthBelowEyes(result)
          : pushMouthAway(result);
      } else if (!eyesPinned) {
        result = pushEyesAway(result);
      }
      if (eyesAboveMouth) result = clampEyesAboveCurve(result);
      return clampInsideFace(result);
    }

    // Face perimeter: pin-by-t selects which param to vary per segment.
    // [startParam, midParam (bulge), endParam] for each segment.
    const faceSegParams: [PathIn<State, number>, PathIn<State, number>, PathIn<State, number>][] = [
      [["faceRyTop"], ["faceBulgeTR"], ["faceRx"]],   // seg 0: top → right
      [["faceRx"], ["faceBulgeBR"], ["faceRyBot"]],   // seg 1: right → bottom
      [["faceRyBot"], ["faceBulgeBR"], ["faceRx"]],   // seg 2: bottom → left (mirror)
      [["faceRx"], ["faceBulgeTR"], ["faceRyTop"]],   // seg 3: left → top (mirror)
    ];

    function facePerimeterDragology(segIdx: number, t: number) {
      const [startP, midP, endP] = faceSegParams[segIdx];
      const paths: PathIn<State, number>[] =
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
          data-z-index={0}
        />

        {/* Face perimeter drag handles (invisible, like mouth curve handles) */}
        {segs.flatMap((seg, segIdx) =>
          facePerimeterTs.map((t) => {
            const pt = evalBezier(seg, t);
            const id = `face-${segIdx}-${t}`;
            const isDragged = draggedId === id;
            return (
              <circle
                id={id}
                transform={translate(pt.x, pt.y)}
                r={isDragged ? 6 : 12}
                fill={isDragged ? "rgba(230, 167, 86, 0.4)" : "transparent"}
                data-z-index={5}
                dragology={() => facePerimeterDragology(segIdx, t)}
              />
            );
          }),
        )}

        {/* Eyes */}
        <circle
          id="left-eye"
          transform={translate(le.x, le.y)}
          r={EYE_R}
          fill="#333"
          data-z-index={1}
          dragology={eyeDragology}
        />
        <circle
          id="right-eye"
          transform={translate(re.x, re.y)}
          r={EYE_R}
          fill="#333"
          data-z-index={1}
          dragology={eyeDragology}
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
          data-z-index={1}
        />

        {/* Drag handles along the mouth curve */}
        {tValues.map((t) => {
          const pt = evalMouthBezier(state, t);
          const id = `mouth-${t}`;
          const isDragged = draggedId === id;
          return (
            <circle
              id={id}
              transform={translate(pt.x, pt.y)}
              r={isDragged ? 8 : 14}
              fill={isDragged ? "rgba(192, 57, 43, 0.4)" : "transparent"}
              data-z-index={2}
              dragology={() => curveDragology(t)}
            />
          );
        })}

        {/* Mouth endpoint handles */}
        <circle
          id="mouth-endpoint-left"
          transform={translate(ml.x, ml.y)}
          r={ENDPOINT_R}
          fill={draggedId === "mouth-endpoint-left" ? "#e74c3c" : "#c0392b"}
          stroke="#7f1d1d"
          strokeWidth={1.5}
          data-z-index={3}
          dragology={endpointDragology}
        />
        <circle
          id="mouth-endpoint-right"
          transform={translate(mr.x, mr.y)}
          r={ENDPOINT_R}
          fill={draggedId === "mouth-endpoint-right" ? "#e74c3c" : "#c0392b"}
          stroke="#7f1d1d"
          strokeWidth={1.5}
          data-z-index={3}
          dragology={endpointDragology}
        />

        {/* Pin toggles */}
        <g id="pin-eyes" data-z-index={4}>
          <circle
            transform={translate(pinX, state.eyeY)}
            r={PIN_R}
            fill={eyesPinned ? "#666" : "transparent"}
            stroke={eyesPinned ? "#666" : "#ccc"}
            strokeWidth={1.5}
            dragology={() =>
              d.fixed({
                ...state,
                pinned: { ...state.pinned, eyes: !eyesPinned },
              })
            }
          />
          <line
            x1={pinX}
            y1={state.eyeY - PIN_R + 1}
            x2={pinX}
            y2={state.eyeY + PIN_R + 3}
            stroke="#666"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={eyesPinned ? 1 : 0}
          />
        </g>
        <g id="pin-mouth" data-z-index={4}>
          <circle
            transform={translate(pinX, state.mouthEy)}
            r={PIN_R}
            fill={mouthPinned ? "#666" : "transparent"}
            stroke={mouthPinned ? "#666" : "#ccc"}
            strokeWidth={1.5}
            dragology={() =>
              d.fixed({
                ...state,
                pinned: { ...state.pinned, mouth: !mouthPinned },
              })
            }
          />
          <line
            x1={pinX}
            y1={state.mouthEy - PIN_R + 1}
            x2={pinX}
            y2={state.mouthEy + PIN_R + 3}
            stroke="#666"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={mouthPinned ? 1 : 0}
          />
        </g>
      </g>
    );
  };
}

export default demo(
  () => {
    const [scaleCurve, setScaleCurve] = useState(false);
    const [eyesAboveMouth, setEyesAboveMouth] = useState(false);
    const [constrainFaceShape, setConstrainFaceShape] = useState(true);
    const [expandFace, setExpandFace] = useState(false);
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
            Drag the face outline handles to reshape. Unpinned features get
            pushed. Click indicators on the right to pin/unpin.
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
            label="Enable Mickey mode"
            value={!constrainFaceShape}
            onChange={(v) => setConstrainFaceShape(!v)}
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
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["d.vary"] },
);
