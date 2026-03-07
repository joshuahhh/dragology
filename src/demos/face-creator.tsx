import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan, moreThan } from "../DragSpec";
import { translate } from "../svgx/helpers";

// Face dimensions
const FACE_CX = 200;
const FACE_CY = 180;
const FACE_R = 120;

// Eye layout (horizontal offset from center is fixed; vertical is state)
const EYE_DX = 40;
const EYE_R = 12;
const EYE_MARGIN = 8;

const FACE_MARGIN = 10;

type State = {
  // Eye y-position (will be draggable later)
  eyeY: number;
  // Mouth endpoints: symmetric around FACE_CX
  mouthDx: number; // half-width (distance from center to each endpoint)
  mouthEy: number; // y position of both endpoints
  // Control point offsets relative to their respective endpoint
  cp1dx: number; // cp1 offset from left endpoint
  cp1dy: number;
  cp2dx: number; // cp2 offset from right endpoint
  cp2dy: number;
};

const initialState: State = {
  eyeY: FACE_CY - 25,
  mouthDx: 50,
  mouthEy: FACE_CY + 40,
  cp1dx: 20,
  cp1dy: 30,
  cp2dx: -20,
  cp2dy: 30,
};

// Derived positions
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
  return { x: FACE_CX - EYE_DX, y: s.eyeY };
}
function rightEye(s: State) {
  return { x: FACE_CX + EYE_DX, y: s.eyeY };
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
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y,
  };
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const faceCenter = { x: FACE_CX, y: FACE_CY };

function mouthCurveConstraints(s: State): number[] {
  const results: number[] = [];
  const le = leftEye(s);
  const re = rightEye(s);
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pt = evalMouthBezier(s, t);
    results.push(lessThan(dist(pt, faceCenter), FACE_R - FACE_MARGIN));
    results.push(moreThan(dist(pt, le), EYE_R + EYE_MARGIN));
    results.push(moreThan(dist(pt, re), EYE_R + EYE_MARGIN));
    results.push(moreThan(pt.y, s.eyeY));
  }
  // X-monotonicity
  for (let i = 0; i < N; i++) {
    const pt1 = evalMouthBezier(s, i / N);
    const pt2 = evalMouthBezier(s, (i + 1) / N);
    results.push(lessThan(pt1.x, pt2.x));
  }
  return results;
}

function endpointConstraints(s: State): number[] {
  const results: number[] = [];
  const ml = mouthLeft(s);
  const mr = mouthRight(s);
  // Endpoints inside face
  results.push(lessThan(dist(ml, faceCenter), FACE_R - FACE_MARGIN));
  results.push(lessThan(dist(mr, faceCenter), FACE_R - FACE_MARGIN));
  // Endpoints below eye line
  results.push(moreThan(s.mouthEy, s.eyeY));
  // Mouth must have positive width
  results.push(moreThan(s.mouthDx, 10));
  // Also enforce curve constraints (moving endpoints can push curve out)
  return [...results, ...mouthCurveConstraints(s)];
}

// Pin the far CP offsets based on which side of the curve is grabbed
function varyOptsForT(t: number) {
  const pinCp2 = (s: State) => [s.cp2dx, s.cp2dy];
  const pinCp1 = (s: State) => [s.cp1dx, s.cp1dy];

  if (t < 0.4) {
    return {
      paramPaths: [["cp1dx"], ["cp1dy"]] as const,
      constraint: mouthCurveConstraints,
      pin: pinCp2,
    };
  } else if (t > 0.6) {
    return {
      paramPaths: [["cp2dx"], ["cp2dy"]] as const,
      constraint: mouthCurveConstraints,
      pin: pinCp1,
    };
  } else {
    return {
      paramPaths: [["cp1dx"], ["cp1dy"], ["cp2dx"], ["cp2dy"]] as const,
      constraint: mouthCurveConstraints,
    };
  }
}

const CURVE_SAMPLES = 11;
const tValues = Array.from(
  { length: CURVE_SAMPLES },
  (_, i) => (i + 1) / (CURVE_SAMPLES + 1),
);

const ENDPOINT_R = 6;

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const ml = mouthLeft(state);
  const mr = mouthRight(state);
  const le = leftEye(state);
  const re = rightEye(state);

  return (
    <g>
      {/* Face outline */}
      <circle
        id="face"
        cx={FACE_CX}
        cy={FACE_CY}
        r={FACE_R}
        fill="#ffe0b2"
        stroke="#e6a756"
        strokeWidth={3}
        data-z-index={0}
      />

      {/* Left eye */}
      <circle
        id="left-eye"
        cx={le.x}
        cy={le.y}
        r={EYE_R}
        fill="#333"
        data-z-index={1}
      />

      {/* Right eye */}
      <circle
        id="right-eye"
        cx={re.x}
        cy={re.y}
        r={EYE_R}
        fill="#333"
        data-z-index={1}
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
        const opts = varyOptsForT(t);
        return (
          <circle
            id={id}
            transform={translate(pt.x, pt.y)}
            r={isDragged ? 8 : 14}
            fill={isDragged ? "rgba(192, 57, 43, 0.4)" : "transparent"}
            data-z-index={2}
            dragology={() =>
              d.vary(state, opts.paramPaths as any, {
                constraint: opts.constraint,
                pin: "pin" in opts ? opts.pin : undefined,
              })
            }
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
        dragology={() =>
          d.vary(state, [["mouthDx"], ["mouthEy"]], {
            constraint: endpointConstraints,
            pin: (s) => [s.cp1dx, s.cp1dy, s.cp2dx, s.cp2dy],
          })
        }
      />
      <circle
        id="mouth-endpoint-right"
        transform={translate(mr.x, mr.y)}
        r={ENDPOINT_R}
        fill={draggedId === "mouth-endpoint-right" ? "#e74c3c" : "#c0392b"}
        stroke="#7f1d1d"
        strokeWidth={1.5}
        data-z-index={3}
        dragology={() =>
          d.vary(state, [["mouthDx"], ["mouthEy"]], {
            constraint: endpointConstraints,
            pin: (s) => [s.cp1dx, s.cp1dy, s.cp2dx, s.cp2dy],
          })
        }
      />
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Drag anywhere on the mouth to reshape it. Drag the endpoint dots to
        widen, narrow, or reposition the mouth (endpoints move symmetrically).
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={350}
      />
    </div>
  ),
  { tags: ["d.vary"] },
);
