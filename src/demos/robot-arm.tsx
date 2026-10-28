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
import { inOrder, lessThan, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { Svgx } from "../svgx";
import { rotateDeg, translate } from "../svgx/helpers";

const WIDTH = 640;
const HEIGHT = 400;
const FLOOR_Y = 370;
const RAIL = { min: 70, max: 370 };
const SHOULDER_HEIGHT = 40;
const SEGMENTS = [
  { len: 130, width: 26, color: "#f59e0b" },
  { len: 110, width: 22, color: "#fbbf24" },
  { len: 80, width: 18, color: "#fcd34d" },
];
/** From the wrist to the point between the fingers, where a held ball sits. */
const CLAW_LEN = 36;
const BALL_R = 13;
const GRAB_R = 20;
const BIN = { left: 480, right: 610, height: 64, wall: 6 };

type Ball = { id: string; color: string; x: number };

type State = {
  baseX: number;
  /**
   * Each joint's angle relative to the link before it, in degrees.
   * The first is the shoulder (relative to +x); the last is the claw.
   */
  angles: number[];
  balls: Ball[];
  /** Balls in the bin, in the order they went in. */
  binOrder: string[];
  held: string | null;
  config: { clawDown: boolean };
};

const initialBalls: Ball[] = [
  { id: "red", color: "#ef4444", x: 50 },
  { id: "blue", color: "#3b82f6", x: 290 },
  { id: "green", color: "#22c55e", x: 410 },
  { id: "purple", color: "#a855f7", x: 450 },
];

const initialState: State = {
  baseX: 200,
  angles: [-70, 80, 60, 20],
  balls: initialBalls,
  binOrder: [],
  held: null,
  config: undefined as any,
};

/** With `clawDown`, the claw's angle is whatever points it straight down. */
function clawAngle(state: State): number {
  const [a0, a1, a2, a3] = state.angles;
  return state.config.clawDown ? 90 - (a0 + a1 + a2) : a3;
}

function relativeAngles(state: State): number[] {
  return [...state.angles.slice(0, 3), clawAngle(state)];
}

function shoulderPos(state: State): Vec2 {
  return Vec2(state.baseX, FLOOR_Y - SHOULDER_HEIGHT);
}

/** Forward kinematics: shoulder, elbow, wrist, claw joint, claw tip. */
function jointPositions(state: State): Vec2[] {
  const lens = [...SEGMENTS.map((s) => s.len), CLAW_LEN];
  const points = [shoulderPos(state)];
  let absAngle = 0;
  relativeAngles(state).forEach((a, i) => {
    absAngle += a;
    points.push(points[i].add(Vec2(lens[i], 0).rotateDeg(absAngle)));
  });
  return points;
}

function clawTip(state: State): Vec2 {
  return jointPositions(state)[4];
}

function ballPos(state: State, ball: Ball): Vec2 {
  if (state.held === ball.id) return clawTip(state);
  const binIdx = state.binOrder.indexOf(ball.id);
  if (binIdx >= 0) {
    return Vec2(
      BIN.left + BIN.wall + BALL_R + 2 + binIdx * (2 * BALL_R + 3),
      FLOOR_Y - BIN.wall - BALL_R,
    );
  }
  return Vec2(ball.x, FLOOR_Y - BALL_R);
}

function overBin(p: Vec2): boolean {
  return p.x > BIN.left && p.x < BIN.right;
}

/** The ball the claw would close on if the arm came to rest here. */
function grabbable(state: State): Ball | null {
  if (state.held) return null;
  const tip = clawTip(state);
  let best: Ball | null = null;
  let bestDist = GRAB_R;
  for (const ball of state.balls) {
    const dist = ballPos(state, ball).dist(tip);
    if (dist < bestDist) {
      best = ball;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * What the claw does when the arm comes to rest: close on a ball
 * within reach, or let go of the one it holds if it's over the bin
 * or down by the floor. Also bakes a `clawDown` claw angle into the
 * state, so turning `clawDown` off leaves the claw where it is.
 */
function settle(state: State): State {
  const angles = [...state.angles];
  angles[3] = clawAngle(state);
  const settled = { ...state, angles };
  const tip = clawTip(state);

  if (state.held) {
    const held = state.held;
    if (overBin(tip)) {
      return { ...settled, held: null, binOrder: [...state.binOrder, held] };
    }
    if (tip.y > FLOOR_Y - 3 * BALL_R) {
      const x = Math.min(Math.max(tip.x, BALL_R), WIDTH - BALL_R);
      return {
        ...settled,
        held: null,
        balls: state.balls.map((b) => (b.id === held ? { ...b, x } : b)),
      };
    }
    return settled;
  }

  const ball = grabbable(state);
  if (ball) {
    return {
      ...settled,
      held: ball.id,
      binOrder: state.binOrder.filter((id) => id !== ball.id),
    };
  }
  return settled;
}

/**
 * Joint limits, plus: no part of the arm goes through the floor.
 */
function armConstraint(state: State): number[] {
  const [a0, a1, a2, a3] = relativeAngles(state);
  const points = jointPositions(state);
  return [
    ...inOrder([-180, a0, 0]),
    ...inOrder([-150, a1, 150]),
    ...inOrder([-150, a2, 150]),
    ...inOrder([-120, a3, 120]),
    ...points.slice(1, 4).map((p) => lessThan(p.y, FLOOR_Y - 12)),
    lessThan(points[4].y, FLOOR_Y - 6),
  ];
}

function finger(side: 1 | -1, open: boolean) {
  return (
    <g transform={translate(16, side * 7) + rotateDeg(side * (open ? 38 : 14))}>
      <line
        x1={0}
        y1={0}
        x2={20}
        y2={0}
        stroke="#475569"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <g transform={translate(20, 0) + rotateDeg(-side * 55)}>
        <line
          x1={0}
          y1={0}
          x2={9}
          y2={0}
          stroke="#475569"
          strokeWidth={5}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

const draggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
  isTracking,
}) => {
  const angles = relativeAngles(state);

  // Dragging a piece of the arm varies the first `numJoints` angles:
  // the joints between that piece and the shoulder. Joints beyond it
  // keep their angles.
  const varyArm = (numJoints: number) =>
    d
      .vary(
        state,
        [0, 1, 2, 3]
          .slice(0, numJoints)
          .filter((i) => !(i === 3 && state.config.clawDown))
          .map((i) => param("angles", i)),
        { constraint: armConstraint },
      )
      .onDrop(settle);

  const slideBase = () =>
    d
      .vary(state, param("baseX"), {
        constraint: (s) => inOrder([RAIL.min, s.baseX, RAIL.max]),
      })
      .onDrop(settle);

  // A joint gets a grab target of its own, covering the part of the
  // arm around it. Turning a joint barely moves a point right next to
  // it, so the optimizer can't steer that point with that joint; a
  // grabbed joint moves with the joints before it instead. (The
  // shoulder moves with the base.)
  const joint = (i: number) => {
    const isClaw = i === SEGMENTS.length;
    return (
      <g
        id={`joint-${i}`}
        dragologyZIndex={2}
        dragologyOnDrag={i === 0 ? slideBase : () => varyArm(i)}
        style={{ cursor: "grab" }}
      >
        <circle r={isClaw ? 10 : SEGMENTS[i].width / 2} fill="transparent" />
        <circle
          r={isClaw ? 6 : SEGMENTS[i].width / 4}
          fill={isClaw ? "#334155" : "#92400e"}
        />
      </g>
    );
  };

  const link = (i: number): Svgx => {
    if (i === SEGMENTS.length) {
      return (
        <g transform={rotateDeg(angles[i])}>
          <g
            id="claw"
            dragologyZIndex={1}
            dragologyOnDrag={() => varyArm(4)}
            style={{ cursor: "grab" }}
          >
            {/* generous invisible grab area */}
            <circle transform={translate(22, 0)} r={22} fill="transparent" />
            <line
              x1={0}
              y1={0}
              x2={16}
              y2={0}
              stroke="#475569"
              strokeWidth={8}
              strokeLinecap="round"
            />
            <line
              x1={16}
              y1={-10}
              x2={16}
              y2={10}
              stroke="#475569"
              strokeWidth={6}
              strokeLinecap="round"
            />
            {finger(1, !state.held)}
            {finger(-1, !state.held)}
          </g>
          {joint(i)}
        </g>
      );
    }
    const seg = SEGMENTS[i];
    return (
      <g transform={rotateDeg(angles[i])}>
        <g
          id={`seg-${i}`}
          dragologyOnDrag={() => varyArm(i + 1)}
          style={{ cursor: "grab" }}
        >
          <rect
            transform={translate(-seg.width / 2, -seg.width / 2)}
            width={seg.len + seg.width}
            height={seg.width}
            rx={seg.width / 2}
            fill={seg.color}
            stroke="#92400e"
            strokeWidth={1.5}
          />
        </g>
        {joint(i)}
        <g transform={translate(seg.len, 0)}>{link(i + 1)}</g>
      </g>
    );
  };

  const arm = (
    <g transform={translate(shoulderPos(state))}>
      <g id="base" dragologyOnDrag={slideBase} style={{ cursor: "ew-resize" }}>
        <path
          d={`M -36 ${SHOULDER_HEIGHT - 4} L -20 -6 L 20 -6 L 36 ${SHOULDER_HEIGHT - 4} Z`}
          fill="#64748b"
          stroke="#334155"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <circle
          transform={translate(-22, SHOULDER_HEIGHT - 4)}
          r={6}
          fill="#334155"
        />
        <circle
          transform={translate(22, SHOULDER_HEIGHT - 4)}
          r={6}
          fill="#334155"
        />
      </g>
      {link(0)}
    </g>
  );

  if (isTracking) return arm;

  const dragging = draggedId !== null;
  const target = dragging ? grabbable(state) : null;
  const tip = clawTip(state);
  const binLit = dragging && state.held !== null && overBin(tip);
  const allTidy = state.binOrder.length === state.balls.length;

  return (
    <g>
      {/* floor and rail */}
      <rect
        transform={translate(0, FLOOR_Y)}
        width={WIDTH}
        height={HEIGHT - FLOOR_Y}
        fill="#e7e5e4"
      />
      <line
        x1={RAIL.min - 40}
        y1={FLOOR_Y - 2}
        x2={RAIL.max + 40}
        y2={FLOOR_Y - 2}
        stroke="#a8a29e"
        strokeWidth={4}
        strokeLinecap="round"
      />

      {/* bin */}
      <g transform={translate(BIN.left, FLOOR_Y - BIN.height)}>
        <rect
          width={BIN.right - BIN.left}
          height={BIN.height}
          fill={binLit ? "#bbf7d0" : "#f5f5f4"}
        />
        <path
          d={`M 0 0 L 0 ${BIN.height} L ${BIN.right - BIN.left} ${BIN.height} L ${BIN.right - BIN.left} 0`}
          fill="none"
          stroke="#78716c"
          strokeWidth={BIN.wall}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text
          transform={translate((BIN.right - BIN.left) / 2, BIN.height + 21)}
          textAnchor="middle"
          fontSize={14}
          fill="#78716c"
        >
          {`${state.binOrder.length} / ${state.balls.length}`}
        </text>
      </g>

      {arm}

      {state.balls.map((ball) => (
        <g
          id={`ball-${ball.id}`}
          transform={translate(ballPos(state, ball))}
          style={{ pointerEvents: "none" }}
        >
          <circle
            r={BALL_R + 5}
            fill="none"
            stroke={ball.color}
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={target?.id === ball.id ? 1 : 0}
          />
          <circle r={BALL_R} fill={ball.color} />
          <circle
            transform={translate(-4, -4)}
            r={4}
            fill="white"
            opacity={0.5}
          />
        </g>
      ))}

      <g
        transform={translate(WIDTH / 2, 50)}
        opacity={allTidy ? 1 : 0}
        style={{
          cursor: "pointer",
          pointerEvents: allTidy ? undefined : "none",
        }}
        onClick={() =>
          setState({
            ...state,
            balls: initialBalls,
            binOrder: [],
            held: null,
          })
        }
      >
        <text textAnchor="middle" fontSize={22} fill="#15803d">
          All tidy!
        </text>
        <text
          transform={translate(0, 24)}
          textAnchor="middle"
          fontSize={14}
          fill="#78716c"
          textDecoration="underline"
        >
          mess it up again
        </text>
      </g>
    </g>
  );
};

export default demo(
  () => {
    const [clawDown, setClawDown] = useState(true);
    const stateOverride = useMemo(() => ({ config: { clawDown } }), [clawDown]);
    return (
      <>
        <DemoNotes>
          Inverse kinematics with <code>d.vary</code>. Each link is rotated
          inside the one before it, and grabbing a link varies the angles of
          every joint between it and the shoulder. Joint limits and "don't go
          through the floor" are <code>constraint</code>s. Slide the base along
          its rail. Let go with the claw near a ball to grab it; let go over the
          bin (or down by the floor) to drop it.
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={WIDTH}
            height={HEIGHT}
            stateOverride={stateOverride}
          />
          <ConfigPanel>
            <ConfigCheckbox
              label="Keep claw pointing down"
              value={clawDown}
              onChange={setClawDown}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </>
    );
  },
  { tags: ["d.vary [constraint]", "spec.onDrop", "setState", "math"] },
);
