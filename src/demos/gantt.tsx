import { produce } from "immer";
import _ from "lodash";
import { arrowhead } from "../arrows";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { lessThan, moreThan, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";

// # State

type Task = {
  name: string;
  /**
   * Days to wait after the earliest possible start (when all
   * prerequisites are done). Start times are never stored: they are
   * derived from the dependency graph plus these lags, so moving an
   * upstream task moves everything downstream with it.
   */
  lag: number;
  duration: number; // in days
  lane: number;
};

/** `from` must finish before `to` starts. */
type Dep = { from: string; to: string };

export type State = {
  tasks: Record<string, Task>;
  deps: Dep[];
};

export const initialState: State = {
  tasks: {
    plan: { name: "Plan", lag: 0, duration: 4, lane: 0 },
    design: { name: "Design", lag: 0, duration: 6, lane: 1 },
    infra: { name: "Infra", lag: 0, duration: 5, lane: 2 },
    build: { name: "Build", lag: 0, duration: 8, lane: 0 },
    docs: { name: "Docs", lag: 1, duration: 4, lane: 3 },
    test: { name: "Test", lag: 0, duration: 4, lane: 1 },
    ship: { name: "Ship", lag: 0, duration: 2, lane: 2 },
  },
  deps: [
    { from: "plan", to: "design" },
    { from: "plan", to: "infra" },
    { from: "design", to: "build" },
    { from: "infra", to: "build" },
    { from: "design", to: "docs" },
    { from: "build", to: "test" },
    { from: "test", to: "ship" },
    { from: "docs", to: "ship" },
  ],
};

// # Layout

const NUM_LANES = 4;
const LANE_NAMES = ["Ana", "Ben", "Cam", "Dee"];
const HORIZON = 40; // days
const DAY_W = 13;
const LANE_H = 44;
const BAR_H = 24;
const LABEL_W = 44;
const HEADER_H = 22;
const MIN_DURATION = 1;
const GRIP_W = 10;
const END_HANDLE_W = 8;

export const CANVAS_W = LABEL_W + HORIZON * DAY_W + 10;
const FOOTER_H = 18;
export const CANVAS_H = HEADER_H + NUM_LANES * LANE_H + FOOTER_H;

const dayX = (day: number) => LABEL_W + day * DAY_W;
const laneY = (lane: number) => HEADER_H + lane * LANE_H + LANE_H / 2;

const COLOR = "#3b82f6";
const CRITICAL_COLOR = "#ef4444";

// # Graph helpers

function successors(state: State, id: string): string[] {
  return state.deps.filter((d) => d.from === id).map((d) => d.to);
}

function predecessors(state: State, id: string): string[] {
  return state.deps.filter((d) => d.to === id).map((d) => d.from);
}

/** All tasks reachable from `id` by following deps forward (excluding `id`). */
function descendants(state: State, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const next of successors(state, cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** Topological order (Kahn). Deps are kept acyclic, so this covers all tasks. */
function topoOrder(state: State): string[] {
  const ids = Object.keys(state.tasks);
  const indeg = new Map(ids.map((id) => [id, predecessors(state, id).length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of successors(state, id)) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  return order;
}

type Scheduled = { earliest: number; start: number; end: number };

/**
 * Derive every task's start time: the latest end among its
 * prerequisites (or day 0), plus its own lag. One pass in topological
 * order covers the whole DAG.
 */
function schedule(state: State): Map<string, Scheduled> {
  const out = new Map<string, Scheduled>();
  for (const id of topoOrder(state)) {
    const task = state.tasks[id];
    const earliest = Math.max(
      0,
      ...predecessors(state, id).map((p) => out.get(p)!.end),
    );
    const start = earliest + task.lag;
    out.set(id, { earliest, start, end: start + task.duration });
  }
  return out;
}

/**
 * Change the dependency edges while keeping every task's start time
 * where it was, as far as the new graph allows: lags are recomputed
 * so tasks don't jump when an arrow is added or removed.
 */
function withDeps(state: State, deps: Dep[]): State {
  const before = schedule(state);
  return produce(state, (draft) => {
    draft.deps = deps;
    const after = schedule(draft);
    for (const id of Object.keys(draft.tasks)) {
      draft.tasks[id].lag = Math.max(
        0,
        before.get(id)!.start - after.get(id)!.earliest,
      );
    }
  });
}

/**
 * Critical path analysis on the schedule as it actually stands:
 * a task is critical if delaying it would delay the project's end.
 */
function criticalPath(state: State, sched: Map<string, Scheduled>) {
  const order = topoOrder(state);
  const end = (id: string) => sched.get(id)!.end;
  const projectEnd = Math.max(0, ...order.map(end));
  const latestFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const succs = successors(state, id);
    latestFinish.set(
      id,
      succs.length === 0
        ? projectEnd
        : Math.min(
            ...succs.map((s) => latestFinish.get(s)! - state.tasks[s].duration),
          ),
    );
  }
  const slack = new Map(
    order.map((id) => [id, latestFinish.get(id)! - end(id)]),
  );
  const isCritical = (id: string) => slack.get(id)! < 1e-6;
  const isCriticalDep = (dep: Dep) =>
    isCritical(dep.from) &&
    isCritical(dep.to) &&
    Math.abs(end(dep.from) - sched.get(dep.to)!.start) < 1e-6;
  return { projectEnd, slack, isCritical, isCriticalDep };
}

// # Draggable

export const draggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => {
  const sched = schedule(state);
  const { projectEnd, isCritical, isCriticalDep, slack } = criticalPath(
    state,
    sched,
  );

  // If a bar is being dragged, which tasks may it be dropped on?
  const draggedTaskId = draggedId?.startsWith("bar-")
    ? draggedId.slice(4)
    : null;
  const validTargets = draggedTaskId
    ? new Set(linkTargets(state, draggedTaskId))
    : null;

  return (
    <g>
      {/* Day grid */}
      {_.range(0, HORIZON + 1, 2).map((day) => (
        <g id={`grid-${day}`} dragologyZIndex={-2}>
          <line
            x1={dayX(day)}
            y1={HEADER_H}
            x2={dayX(day)}
            y2={HEADER_H + NUM_LANES * LANE_H}
            stroke={day % 10 === 0 ? "#d1d5db" : "#f1f5f9"}
          />
          {day % 10 === 0 && (
            <text
              transform={translate(dayX(day), HEADER_H - 8)}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              day {day}
            </text>
          )}
        </g>
      ))}

      {/* Lanes */}
      {_.range(NUM_LANES).map((lane) => (
        <g id={`lane-${lane}`} dragologyZIndex={-2}>
          <line
            x1={LABEL_W}
            y1={laneY(lane) + LANE_H / 2}
            x2={dayX(HORIZON)}
            y2={laneY(lane) + LANE_H / 2}
            stroke="#e5e7eb"
          />
          <text
            transform={translate(LABEL_W - 8, laneY(lane) + 4)}
            textAnchor="end"
            fontSize={11}
            fill="#6b7280"
          >
            {LANE_NAMES[lane]}
          </text>
        </g>
      ))}

      {/* Project end marker */}
      <g id="project-end" dragologyZIndex={-1}>
        <line
          x1={dayX(projectEnd)}
          y1={HEADER_H}
          x2={dayX(projectEnd)}
          y2={HEADER_H + NUM_LANES * LANE_H}
          stroke={CRITICAL_COLOR}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          transform={translate(
            dayX(projectEnd),
            HEADER_H + NUM_LANES * LANE_H + 12,
          )}
          textAnchor="middle"
          fontSize={9}
          fill={CRITICAL_COLOR}
        >
          {`done: day ${Math.round(projectEnd)}`}
        </text>
      </g>

      {/* Dependency arrows */}
      {state.deps.map((dep) => {
        const from = state.tasks[dep.from];
        const to = state.tasks[dep.to];
        const a = Vec2(dayX(sched.get(dep.from)!.end), laneY(from.lane));
        const b = Vec2(dayX(sched.get(dep.to)!.start), laneY(to.lane));
        const critical = isCriticalDep(dep);
        const color = critical ? CRITICAL_COLOR : "#94a3b8";
        // Route: out to the right, down/up, then into the successor
        const mid = a.x + Math.max(6, (b.x - a.x) / 2);
        const dPath = `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x - 6} ${b.y}`;
        return (
          <g
            id={`dep-${dep.from}-${dep.to}`}
            dragologyZIndex={-1}
            onClick={() =>
              setState(
                withDeps(
                  state,
                  state.deps.filter(
                    (x) => !(x.from === dep.from && x.to === dep.to),
                  ),
                ),
                { transition: 200 },
              )
            }
            style={{ cursor: "pointer" }}
          >
            {/* fat invisible hit area for clicking */}
            <path d={dPath} fill="none" stroke="transparent" strokeWidth={10} />
            <path
              d={dPath}
              fill="none"
              stroke={color}
              strokeWidth={critical ? 2.5 : 1.5}
            />
            {arrowhead({
              tip: b,
              direction: Vec2(1, 0),
              headLength: 7,
              headAngleRad: Math.PI / 3,
              fill: color,
            })}
          </g>
        );
      })}

      {/* Task bars */}
      {Object.entries(state.tasks).map(([id, task]) => {
        const { earliest, start } = sched.get(id)!;
        const x = dayX(start);
        const y = laneY(task.lane) - BAR_H / 2;
        const w = task.duration * DAY_W;
        const critical = isCritical(id);
        const fill = critical ? CRITICAL_COLOR : COLOR;
        const isDragged = draggedId === `bar-${id}`;
        const isTarget = validTargets?.has(id) ?? false;
        const dimmed = validTargets !== null && !isTarget && !isDragged;

        // Vary a numeric field of this task. Because starts are derived
        // in `schedule`, everything downstream follows automatically.
        const varyField = (
          field: "lag" | "duration",
          constraint: (s: State) => number[],
        ) => d.vary(state, param("tasks", id, field), { constraint });

        // Drag body: slide start (i.e. vary lag); hover another task to
        // make it a prerequisite.
        const onDragBar = () =>
          d
            .closest(
              linkTargets(state, id).map((targetId) =>
                d.dropTarget(
                  `bar-${targetId}`,
                  withDeps(state, [...state.deps, { from: targetId, to: id }]),
                ),
              ),
            )
            .withFloating({ ghost: { opacity: 0.35 } })
            .whenFar(
              varyField("lag", (s) => [
                moreThan(s.tasks[id].lag, 0),
                lessThan(schedule(s).get(id)!.end, HORIZON),
              ]),
            )
            .withBranchTransition(120);

        // Drag right edge: change duration.
        const onDragEnd = () =>
          varyField("duration", (s) => [
            moreThan(s.tasks[id].duration, MIN_DURATION),
            lessThan(schedule(s).get(id)!.end, HORIZON),
          ]);

        // Drag grip: move between resource lanes.
        const onDragGrip = () =>
          d
            .between(
              _.range(NUM_LANES).map((lane) =>
                produce(state, (s) => {
                  s.tasks[id].lane = lane;
                }),
              ),
            )
            .withSnapRadius(12, { transition: true });

        return (
          <g
            id={`task-${id}`}
            dragologyZIndex={isDragged ? "/1" : false}
            opacity={dimmed ? 0.4 : 1}
          >
            {/* Lag: the wait between earliest possible start and actual start */}
            {task.lag > 0 && (
              <g id={`lag-${id}`} dragologyZIndex={-1}>
                <line
                  x1={dayX(earliest)}
                  y1={y + BAR_H / 2}
                  x2={x}
                  y2={y + BAR_H / 2}
                  stroke={fill}
                  strokeWidth={3}
                  strokeDasharray="2 3"
                  strokeLinecap="round"
                />
                <line
                  x1={dayX(earliest)}
                  y1={y + 4}
                  x2={dayX(earliest)}
                  y2={y + BAR_H - 4}
                  stroke={fill}
                  strokeWidth={2}
                />
              </g>
            )}
            <rect
              id={`bar-${id}`}
              transform={translate(x, y)}
              width={w}
              height={BAR_H}
              rx={5}
              fill={fill}
              stroke={isTarget ? "#111827" : "white"}
              strokeWidth={isTarget ? 2 : 1}
              strokeDasharray={isTarget ? "4 2" : undefined}
              style={{ cursor: "grab" }}
              dragologyOnDrag={onDragBar}
            />
            <text
              transform={translate(x + GRIP_W + 4, y + BAR_H / 2 + 4)}
              fontSize={11}
              fill="white"
              fontWeight="bold"
              pointerEvents="none"
            >
              {task.name}
            </text>
            {/* Slack readout */}
            {!critical && (
              <text
                id={`slack-${id}`}
                transform={translate(x + w + 4, y + BAR_H / 2 + 4)}
                fontSize={9}
                fill="#9ca3af"
                pointerEvents="none"
              >
                {`+${Math.round(slack.get(id)!)}`}
              </text>
            )}
            {/* Lane grip */}
            <g
              id={`grip-${id}`}
              transform={translate(x, y)}
              style={{ cursor: "ns-resize" }}
              dragologyOnDrag={onDragGrip}
            >
              <rect
                width={GRIP_W}
                height={BAR_H}
                rx={5}
                fill="black"
                opacity={0.15}
              />
              {[8, 12, 16].map((dy) => (
                <line
                  x1={3}
                  y1={dy}
                  x2={GRIP_W - 3}
                  y2={dy}
                  stroke="white"
                  strokeOpacity={0.7}
                />
              ))}
            </g>
            {/* Duration handle */}
            <rect
              id={`end-${id}`}
              transform={translate(x + w - END_HANDLE_W, y)}
              width={END_HANDLE_W}
              height={BAR_H}
              rx={4}
              fill="black"
              opacity={0.15}
              style={{ cursor: "ew-resize" }}
              dragologyOnDrag={onDragEnd}
            />
          </g>
        );
      })}
    </g>
  );
};

/**
 * Tasks that may become a prerequisite of `id` by dropping `id` on
 * them: not itself, not already a prerequisite, and not downstream
 * of `id` (that would create a cycle).
 */
function linkTargets(state: State, id: string): string[] {
  const downstream = descendants(state, id);
  const existing = new Set(predecessors(state, id));
  return Object.keys(state.tasks).filter(
    (other) => other !== id && !downstream.has(other) && !existing.has(other),
  );
}

export default demo(
  () => (
    <div>
      <DemoNotes>
        A Gantt chart with dependencies. Start times are never stored: each task
        starts when its prerequisites are done, plus an optional lag (shown as a
        dotted lead-in). Drag a bar to change its lag; everything downstream
        moves with it. Drag the right edge to change duration. Drop a bar onto
        another task to make that task a prerequisite (targets that would create
        a cycle are dimmed). Drag the grip on the left to move between resource
        lanes. Click an arrow to remove it. The critical path is highlighted in
        red and updates live; grey numbers show slack.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={CANVAS_W}
        height={CANVAS_H}
      />
    </div>
  ),
  {
    tags: [
      "d.vary [constraint]",
      "d.dropTarget",
      "d.closest",
      "spec.whenFar",
      "spec.withFloating [ghost]",
      "d.between",
      "spec.withSnapRadius",
    ],
  },
);
