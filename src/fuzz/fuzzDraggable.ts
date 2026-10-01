/**
 * Breadth-first exploration of a Draggable, without a DOM.
 *
 * Starting from an initial state, we render the draggable, find every
 * element that can be clicked or dragged, and plan actions: clicks
 * call the handler; drags run the element's drag behavior along a
 * short pointer path to a candidate target point, exercising previews
 * and interpolation. Target points are the centers of id'd elements,
 * the drop positions the element's drag spec reports in its debug
 * trace (e.g. where each `fixed` state puts the element), and short
 * nudges, the nudges also from an off-center grab (so drags that
 * rotate or scale the element, leaving its center put, do something).
 * HTML controls inside foreignObjects (buttons, checkboxes, text
 * inputs) get clicks and changes, too. Every reached state is explored
 * in turn.
 *
 * Exploration runs in passes: each pass tries a few actions from every
 * known state (oldest first), and states discovered along the way join
 * the same pass. A state with hundreds of actions therefore doesn't
 * block exploration of the states it leads to, and a time budget buys
 * depth as well as breadth. Given enough budget, every planned action
 * of every reachable state is eventually tried.
 *
 * Any exception thrown by rendering, layering, drag behaviors,
 * previews, or lerping is recorded (with the action that triggered
 * it) rather than propagated, so a single run reports all the
 * distinct trouble it finds.
 */

import _ from "lodash";
import React from "react";
import { DragInitContext, dragSpecToBehavior } from "../DragBehavior";
import { DragSpec, DragSpecData } from "../DragSpec";
import { getTraceInfo } from "../DragSpecTraceInfo";
import {
  Draggable,
  getOnDragCallbackOnElement,
  makeDraggableProps,
  SetState,
} from "../draggable";
import { Vec2 } from "../math/vec2";
import { findElement, shouldRecurseIntoChildren, Svgx } from "../svgx";
import { Bounds, boundsCenter, getLocalBounds } from "../svgx/bounds";
import { LayeredSvgx, layerSvg } from "../svgx/layers";
import { lerpLayered } from "../svgx/lerp";
import { assignPaths, findByPath, getPath } from "../svgx/path";
import { combineTransforms, localToGlobal } from "../svgx/transform";

export type FuzzAction =
  | { type: "click"; elementId: string | null; path: string }
  | {
      type: "drag";
      elementId: string | null;
      path: string;
      from: Vec2;
      to: Vec2;
      targetDescription: string;
    }
  | {
      type: "html";
      /** Id and path of the foreignObject holding the control. */
      elementId: string | null;
      path: string;
      /** The control's index among the foreignObject's controls. */
      index: number;
      tag: string;
      event: HtmlEvent;
    };

/**
 * An event fired on an HTML control: a click, or a change to a text
 * value or a checked state.
 */
export type HtmlEvent =
  | { type: "click" }
  | { type: "change"; value: string }
  | { type: "change"; checked: boolean };

export type FuzzError = {
  /** The state the action started from. */
  state: unknown;
  /** Depth (number of actions) from the initial state. */
  depth: number;
  action: FuzzAction | { type: "render" };
  error: unknown;
};

/**
 * Why exploration stopped: it ran out of states to explore, or it hit
 * one of the limits (`maxStates`, `maxActions`, `maxErrors`,
 * `maxTimeMs`).
 */
export type FuzzStopReason =
  | "exhaustive"
  | "states"
  | "actions"
  | "errors"
  | "time";

export type FuzzReport = {
  statesVisited: number;
  statesQueued: number;
  actionsTried: number;
  errors: FuzzError[];
  stopReason: FuzzStopReason;
  /** Whether exploration was cut short by a limit. */
  truncated: boolean;
  elapsedMs: number;
  /** Deepest visited state (number of actions from the initial state). */
  maxDepthVisited: number;
  /**
   * How many actions the initial state offers (clicks, HTML events,
   * and drag targets). Counts every drop-position sample, though a
   * spec may name fewer.
   */
  initialStateActions: number;
  /** The single most expensive action, for diagnosing slow runs. */
  slowestAction: { ms: number; action: FuzzAction } | null;
};

export type FuzzOptions<T extends object> = {
  /** Don't visit (plan actions for) more than this many states. Default 50. */
  maxStates?: number;
  /** Don't explore states deeper than this. Default Infinity. */
  maxDepth?: number;
  /** Stop after this many errors. Default 10. */
  maxErrors?: number;
  /**
   * Key used to dedupe states. Default `defaultStateKey`: JSON with
   * non-integer numbers rounded to 3 significant figures. Override
   * when states contain incidental data (random ids, history) that
   * shouldn't distinguish them, or numbers that need more precision.
   */
  stateKey?: (state: T) => string;
  /** Actions tried per state per pass. Default 4. */
  actionsPerPass?: number;
  /** Stop after trying this many actions in total. Default 3000. */
  maxActions?: number;
  /**
   * Stop after this much wall-clock time. Checked between actions, so
   * a run can overshoot by up to one action. Default Infinity.
   */
  maxTimeMs?: number;
  /** Number of intermediate pointer steps per drag. Default 3. */
  stepsPerDrag?: number;
  /**
   * Extra pointer offsets (relative to the drag start) to try in
   * addition to every element's center. Default: nudges of 30px and
   * 100px in each direction.
   */
  extraOffsets?: Vec2[];
  /**
   * Where to grab dragged elements, as fractions of their local
   * bounding box ((0.5, 0.5) is the center). Element centers and drop
   * positions are tried from the first grab point; `extraOffsets`
   * from every one. Default: the center, and (0.75, 0.75).
   */
  grabPoints?: Vec2[];
  /**
   * How many of a dragged element's drop positions (see above) to
   * try, sampled. Default 10.
   */
  dropPositionsPerDrag?: number;
  /** Cap on pointer targets tried per dragged element. Default 40. */
  maxTargetsPerDrag?: number;
  /** Seed for the deterministic target sampling. Default 1. */
  seed?: number;
  /** Max chained re-inits within a single drag. Default 5. */
  maxChains?: number;
  /** Called after each pass (for progress logging). */
  onProgress?: (report: FuzzReport) => void;
};

type Found = {
  element: Svgx;
  path: string;
  id: string | null;
  center: Vec2 | null;
  accumulatedTransform: string;
};

/** Walk the tree collecting elements with their global centers. */
function collectElements(root: Svgx): Found[] {
  const out: Found[] = [];
  const go = (el: Svgx, acc: string) => {
    const t = combineTransforms(acc, (el.props as any).transform || "");
    const path = getPath(el);
    if (path) {
      const lb = getLocalBounds(el);
      out.push({
        element: el,
        path,
        id: el.props.id ?? null,
        center: lb.empty ? null : localToGlobal(t, boundsCenter(lb)),
        accumulatedTransform: t,
      });
    }
    if (shouldRecurseIntoChildren(el)) {
      for (const child of React.Children.toArray(el.props.children)) {
        if (React.isValidElement(child)) go(child as Svgx, t);
      }
    }
  };
  go(root, "");
  return out;
}

/** The point at fractions `frac` across a (non-empty) bounding box. */
function pointInBox(bounds: Bounds & { empty: false }, frac: Vec2): Vec2 {
  return Vec2(
    bounds.minX + frac.x * (bounds.maxX - bounds.minX),
    bounds.minY + frac.y * (bounds.maxY - bounds.minY),
  );
}

/**
 * Where the pointer goes to reach each drop candidate of a traced
 * drag spec (one built with `debug.trace`): the positions of its
 * `fixed` states, of the states its `between`s and `vary`s rendered,
 * and the centers of its `dropTarget`s, looking through combinators
 * and wrappers. Untraced parts (like a `whenFar` background while the
 * pointer is near) contribute nothing.
 */
function tracedDropPositions(spec: DragSpecData<any>): Vec2[] {
  const here: Vec2[] = [];
  switch (spec.type) {
    case "fixed": {
      const position = getTraceInfo(spec)?.position;
      if (position) here.push(position);
      break;
    }
    case "between":
    case "vary":
    case "varyFunc":
      for (const r of getTraceInfo(spec)?.renderedStates ?? []) {
        here.push(r.position);
      }
      break;
    case "dropTarget": {
      const bounds = getTraceInfo(spec)?.globalBounds;
      if (bounds && !bounds.empty) here.push(boundsCenter(bounds));
      break;
    }
    case "switchToStateAndFollow":
    case "reactTo": {
      const inner = getTraceInfo(spec)?.tracedInner;
      if (inner) here.push(...tracedDropPositions(inner));
      break;
    }
  }
  const children: DragSpecData<any>[] = [
    ...("specs" in spec ? spec.specs : []),
    ...("inner" in spec ? [spec.inner] : []),
    ...("foreground" in spec ? [spec.foreground, spec.background] : []),
    ...("innerSpec" in spec ? [spec.innerSpec] : []),
  ];
  return [...here, ...children.flatMap(tracedDropPositions)];
}

/**
 * HTML elements inside a foreignObject that handle clicks or changes,
 * in document order. The library doesn't walk into foreignObjects, so
 * these have no paths; actions find them again by index.
 */
function collectHtmlControls(foreignObject: Svgx): Svgx[] {
  const out: Svgx[] = [];
  const go = (el: Svgx) => {
    const props = el.props as any;
    if (props.onClick || props.onChange) out.push(el);
    for (const child of React.Children.toArray(props.children)) {
      if (React.isValidElement(child)) go(child as Svgx);
    }
  };
  for (const child of React.Children.toArray(foreignObject.props.children)) {
    if (React.isValidElement(child)) go(child as Svgx);
  }
  return out;
}

/**
 * Events to try on an HTML control: a click if it handles clicks;
 * toggling a checkbox or selecting a radio button; clearing a text
 * field or typing into it.
 */
function htmlEvents(control: Svgx): HtmlEvent[] {
  const props = control.props as any;
  const events: HtmlEvent[] = [];
  if (props.onClick) events.push({ type: "click" });
  if (props.onChange) {
    if (props.type === "checkbox") {
      events.push({ type: "change", checked: !props.checked });
    } else if (props.type === "radio") {
      events.push({ type: "change", checked: true });
    } else {
      events.push(
        { type: "change", value: "" },
        { type: "change", value: "fuzz" },
      );
    }
  }
  return events;
}

/** A stand-in for the React event a handler would receive. */
function fakeEvent(props: object, event: HtmlEvent) {
  const target = { ...props, ...event };
  return {
    target,
    currentTarget: target,
    stopPropagation() {},
    preventDefault() {},
  };
}

/**
 * Round a non-integer number to `digits` significant figures, and snap
 * values within 1e-6 of zero to zero. Scale-free, so it works whether
 * a number is pixels, radians, or a 0–1 parameter. Integers (ids,
 * counts, indices) pass through unchanged.
 */
export function roundSignificant(v: number, digits = 3): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return v;
  if (Math.abs(v) < 1e-6) return 0;
  return Number(v.toPrecision(digits));
}

/**
 * Default dedupe key: JSON, with non-integer numbers rounded to 3
 * significant figures, so continuous drags (d.vary) that land a hair
 * apart count as the same state.
 */
export function defaultStateKey(state: unknown): string {
  return JSON.stringify(state, (_key, v) =>
    typeof v === "number" ? roundSignificant(v) : v,
  );
}

/** Tiny seeded PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fuzzDraggable<T extends object>(
  draggable: Draggable<T>,
  initialState: T,
  options: FuzzOptions<T> = {},
): FuzzReport {
  const {
    maxStates = 50,
    maxDepth = Infinity,
    maxErrors = 10,
    stateKey = defaultStateKey,
    actionsPerPass = 4,
    maxActions = 3000,
    maxTimeMs = Infinity,
    stepsPerDrag = 3,
    extraOffsets = [
      Vec2(30, 0),
      Vec2(-30, 0),
      Vec2(0, 30),
      Vec2(0, -30),
      Vec2(100, 0),
      Vec2(-100, 0),
      Vec2(0, 100),
      Vec2(0, -100),
    ],
    grabPoints = [Vec2(0.5, 0.5), Vec2(0.75, 0.75)],
    dropPositionsPerDrag = 10,
    maxTargetsPerDrag = 40,
    seed = 1,
    maxChains = 5,
    onProgress,
  } = options;
  const random = rng(seed);
  const mainGrab = grabPoints[0] ?? Vec2(0.5, 0.5);

  const report: FuzzReport = {
    statesVisited: 0,
    statesQueued: 1,
    actionsTried: 0,
    errors: [],
    stopReason: "exhaustive",
    truncated: false,
    elapsedMs: 0,
    maxDepthVisited: 0,
    initialStateActions: 0,
    slowestAction: null,
  };
  const timeAction = (action: FuzzAction, t0: number) => {
    const ms = performance.now() - t0;
    if (!report.slowestAction || ms > report.slowestAction.ms) {
      report.slowestAction = { ms, action };
    }
  };
  const startTime = performance.now();
  let stopReason: FuzzStopReason | null = null;

  /** Discovered but not yet visited, in discovery order. */
  const frontier: { state: T; depth: number }[] = [
    { state: initialState, depth: 0 },
  ];
  const seen = new Set<string>([stateKey(initialState)]);

  const enqueue = (state: T, depth: number) => {
    if (depth > maxDepth) return;
    const key = stateKey(state);
    if (seen.has(key)) return;
    seen.add(key);
    frontier.push({ state, depth });
    report.statesQueued++;
  };

  /** Checks the per-action limits, recording which one (if any) was hit. */
  const outOfBudget = () => {
    if (stopReason !== null) return true;
    if (report.errors.length >= maxErrors) stopReason = "errors";
    else if (report.actionsTried >= maxActions) stopReason = "actions";
    else if (performance.now() - startTime >= maxTimeMs) stopReason = "time";
    return stopReason !== null;
  };

  /** Render with a setState that captures the resulting state. */
  const render = (state: T, draggedId: string | null, isTracking: boolean) => {
    let captured: T | null = null;
    const setState: SetState<T> = (action) => {
      captured =
        typeof action === "function" ? (action as (p: T) => T)(state) : action;
    };
    const element = assignPaths(
      draggable(makeDraggableProps({ state, draggedId, setState, isTracking })),
    );
    return { element, getCaptured: () => captured };
  };

  const layeredInert = (state: T, draggedId: string | null): LayeredSvgx =>
    layerSvg(render(state, draggedId, false).element);

  /** Exercise the interpolation between two renderings. */
  const checkLerp = (a: LayeredSvgx, b: LayeredSvgx) => {
    lerpLayered(a, b, 0.5);
  };

  type Planned =
    | { type: "click"; found: Found }
    | {
        type: "html";
        found: Found;
        index: number;
        tag: string;
        event: HtmlEvent;
      }
    | {
        type: "drag";
        found: Found;
        /** Where on the element to grab, as fractions of its bounds. */
        grab: Vec2;
        from: Vec2;
        /**
         * A pointer target, or one of the spec's drop positions. The
         * spec is only built and traced when a drop-position action
         * runs, since that can be expensive, and an action whose slot
         * is past the end of the (shuffled) drop positions is skipped.
         */
        target: { point: Vec2 } | { dropPoints: () => Vec2[]; slot: number };
        description: string;
      };

  /** A visited state, with the actions not yet tried from it. */
  type Node = {
    state: T;
    depth: number;
    layered: LayeredSvgx;
    pending: Planned[];
  };
  const nodes: Node[] = [];

  const shuffle = <X>(xs: X[]): X[] => _.sortBy(xs, () => random());

  /**
   * Render a state and plan its actions. The plan interleaves elements
   * (round-robin over a shuffled order), so the first few actions of a
   * state touch different elements rather than one element's targets.
   */
  const visit = (state: T, depth: number) => {
    report.statesVisited++;
    report.maxDepthVisited = Math.max(report.maxDepthVisited, depth);
    let layered: LayeredSvgx;
    let elements: Found[];
    try {
      const rendered = render(state, null, false);
      layered = layerSvg(rendered.element);
      elements = collectElements(rendered.element);
    } catch (error) {
      report.errors.push({ state, depth, action: { type: "render" }, error });
      return;
    }

    // Pointer targets: centers of id'd elements (the things that can
    // be drop targets / layers), deduped by rounded position.
    const targetPoints: { point: Vec2; description: string }[] = [];
    const seenPoints = new Set<string>();
    for (const e of elements) {
      if (!e.center || e.id === null) continue;
      const key = `${Math.round(e.center.x)},${Math.round(e.center.y)}`;
      if (seenPoints.has(key)) continue;
      seenPoints.add(key);
      targetPoints.push({ point: e.center, description: `center of ${e.id}` });
    }

    const groups: Planned[][] = [];
    for (const found of elements) {
      if ((found.element.props as any).onClick) {
        groups.push([{ type: "click", found }]);
      }
      if (found.element.type === "foreignObject") {
        collectHtmlControls(found.element).forEach((control, index) => {
          const tag = String(control.type);
          groups.push(
            htmlEvents(control).map((event) => ({
              type: "html",
              found,
              index,
              tag,
              event,
            })),
          );
        });
      }
      const callback = getOnDragCallbackOnElement<T>(found.element);
      const lb = getLocalBounds(found.element);
      if (!callback || lb.empty) continue;
      const grabFrom = (grab: Vec2) =>
        localToGlobal(found.accumulatedTransform, pointInBox(lb, grab));
      const from = grabFrom(mainGrab);

      // The spec's drop positions, other than staying put, deduped and
      // shuffled. (If building the behavior throws, the drag itself
      // will report it.)
      const dropPoints = _.once((): Vec2[] => {
        try {
          const behavior = dragSpecToBehavior(callback(), {
            draggable,
            draggedPath: found.path,
            draggedId: found.id,
            anchorPos: pointInBox(lb, mainGrab),
            startState: state,
            debug: { varyVisualizer: false, trace: true },
          });
          const points = tracedDropPositions(
            behavior({ pointer: from }).tracedSpec,
          ).filter((p) => p.dist(from) > 1);
          return shuffle(
            _.uniqBy(points, (p) => `${Math.round(p.x)},${Math.round(p.y)}`),
          );
        } catch {
          return [];
        }
      });

      const candidates: Planned[] = [
        ...targetPoints.map(({ point, description }) => ({
          type: "drag" as const,
          found,
          grab: mainGrab,
          from,
          target: { point },
          description,
        })),
        ..._.range(dropPositionsPerDrag).map((slot) => ({
          type: "drag" as const,
          found,
          grab: mainGrab,
          from,
          target: { dropPoints, slot },
          description: `drop position (sample ${slot}) of the spec`,
        })),
        ...grabPoints.flatMap((grab) => {
          const grabbedFrom = grabFrom(grab);
          return extraOffsets.map((o) => ({
            type: "drag" as const,
            found,
            grab,
            from: grabbedFrom,
            target: { point: grabbedFrom.add(o) },
            description: `start + (${o.x}, ${o.y})`,
          }));
        }),
      ];
      groups.push(shuffle(candidates).slice(0, maxTargetsPerDrag));
    }
    const shuffledGroups = shuffle(groups);
    const pending: Planned[] = [];
    const longest = _.max(groups.map((g) => g.length)) ?? 0;
    for (let j = 0; j < longest; j++) {
      for (const g of shuffledGroups) if (j < g.length) pending.push(g[j]);
    }

    if (nodes.length === 0) report.initialStateActions = pending.length;
    nodes.push({ state, depth, layered, pending });
  };

  /** Visit discovered states, up to maxStates. */
  const visitFrontier = () => {
    while (frontier.length > 0 && report.statesVisited < maxStates) {
      const { state, depth } = frontier.shift()!;
      visit(state, depth);
    }
  };

  const runAction = (node: Node, planned: Planned) => {
    const { state, depth } = node;
    const { found } = planned;
    let action: FuzzAction = {
      type: "click",
      elementId: found.id,
      path: found.path,
    };
    let to: Vec2 | null = null;
    if (planned.type === "html") {
      action = {
        type: "html",
        elementId: found.id,
        path: found.path,
        index: planned.index,
        tag: planned.tag,
        event: planned.event,
      };
    } else if (planned.type === "drag") {
      const { target } = planned;
      to = "point" in target ? target.point : target.dropPoints()[target.slot];
      // A slot past the end of the spec's drop positions is no action.
      if (to === undefined) return;
      action = {
        type: "drag",
        elementId: found.id,
        path: found.path,
        from: planned.from,
        to,
        targetDescription: planned.description,
      };
    }
    report.actionsTried++;
    const t0 = performance.now();
    try {
      if (planned.type === "click" || planned.type === "html") {
        // Re-render so setState captures relative to a fresh render.
        const r = render(state, null, false);
        const el = findByPath(found.path, r.element);
        let handler: ((e: unknown) => void) | undefined;
        let event: unknown;
        if (el && planned.type === "click") {
          handler = (el.element.props as any).onClick;
          event = { stopPropagation() {}, preventDefault() {} };
        } else if (el && planned.type === "html") {
          const control = collectHtmlControls(el.element)[planned.index];
          const props = (control?.props ?? {}) as any;
          handler =
            planned.event.type === "click" ? props.onClick : props.onChange;
          event = fakeEvent(props, planned.event);
        }
        if (handler) {
          handler(event);
          const next = r.getCaptured();
          if (next !== null && next !== state) {
            checkLerp(node.layered, layeredInert(next, null));
            enqueue(next, depth + 1);
          }
        }
      } else if (to !== null) {
        const dropState = simulateDrag(state, found, planned.grab, to);
        if (dropState !== null) enqueue(dropState, depth + 1);
      }
    } catch (error) {
      report.errors.push({ state, depth, action, error });
    }
    timeAction(action, t0);
  };

  visitFrontier();
  passes: while (nodes.some((n) => n.pending.length > 0)) {
    // Nodes appended during this pass are reached later in the same pass.
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      for (let k = 0; k < actionsPerPass && node.pending.length > 0; k++) {
        if (outOfBudget()) break passes;
        runAction(node, node.pending.shift()!);
      }
      visitFrontier();
    }
    onProgress?.(report);
  }

  if (stopReason === null && frontier.length > 0) stopReason = "states";
  report.stopReason = stopReason ?? "exhaustive";
  report.truncated = report.stopReason !== "exhaustive";
  report.elapsedMs = performance.now() - startTime;
  return report;

  /**
   * Run one drag of `found` (rendered from `state`), grabbed at
   * `grab` (fractions of its bounds), to `to`, in steps. Mirrors
   * DraggableRenderer: init behavior at the start point, advance
   * along the path, handle chaining, then drop. Returns the drop
   * state.
   *
   * Every frame's preview is computed (catching errors in anything
   * the user would see), but previews are only interpolated where
   * DraggableRenderer interpolates them: when the active path
   * changes (branch switch spring), when a drag chains, and on drop.
   */
  function simulateDrag(
    state: T,
    found: Found,
    grab: Vec2,
    to: Vec2,
  ): T | null {
    // Like a real pointer-down: render with the dragged id known.
    const dragRender = render(state, found.id, true).element;
    const draggedEl = findByPath(found.path, dragRender);
    if (!draggedEl) return null;
    const callback = getOnDragCallbackOnElement<T>(draggedEl.element);
    if (!callback) return null;
    const lb = getLocalBounds(draggedEl.element);
    if (lb.empty) return null;
    const anchorPos = pointInBox(lb, grab);
    const from = localToGlobal(draggedEl.accumulatedTransform, anchorPos);

    let ctx: DragInitContext<T> = {
      draggable,
      draggedPath: found.path,
      draggedId: found.id,
      anchorPos,
      startState: state,
      debug: { varyVisualizer: false, trace: false },
    };
    let spec: DragSpec<T> = callback();
    let behavior = dragSpecToBehavior(spec, ctx);
    let chains = 0;

    const steps = Math.max(1, stepsPerDrag);
    let result = behavior({ pointer: from });
    let prevPreview: LayeredSvgx = result.preview();
    let prevActivePath = result.activePath;
    for (let i = 1; i <= steps; i++) {
      const pointer = from.lerp(to, i / steps);
      result = behavior({ pointer });
      let chained = false;

      // Chaining: re-init from the new state (cf. resolveChainNows).
      if (
        result.chainNow &&
        !_.isEqual(result.dropState, ctx.startState) &&
        chains < maxChains
      ) {
        chains++;
        const newState = result.dropState;
        const newDraggedId = result.chainNow.draggedId ?? ctx.draggedId;
        const content = render(newState, newDraggedId, true).element;
        const nf = newDraggedId
          ? findElement(content, (el) => el.props.id === newDraggedId)
          : findByPath(ctx.draggedPath, content);
        if (!nf) throw new Error(`chain: dragged element not found`);
        const newSpec =
          result.chainNow.followSpec ??
          getOnDragCallbackOnElement<T>(nf.element)?.();
        if (newSpec) {
          const newPath = getPath(nf.element);
          if (!newPath) throw new Error("chain: element has no path");
          ctx = {
            ...ctx,
            draggedPath: newPath,
            draggedId: newDraggedId,
            startState: newState,
          };
          spec = newSpec;
          behavior = dragSpecToBehavior(spec, ctx);
          result = behavior({ pointer });
          chained = true;
        }
      }

      const preview = result.preview();
      if (chained || result.activePath !== prevActivePath) {
        checkLerp(prevPreview, preview);
      }
      prevPreview = preview;
      prevActivePath = result.activePath;
    }

    // Drop: the idle render of the drop state, sprung from the last preview.
    const dropState = result.dropState;
    checkLerp(prevPreview, layeredInert(dropState, null));
    return dropState;
  }
}

/** Compact description of a fuzz error, for test output. */
export function describeFuzzAction(a: FuzzAction | { type: "render" }): string {
  if (a.type === "render") return "rendering";
  if (a.type === "click") return `clicking ${a.elementId ?? a.path}`;
  if (a.type === "html") {
    const control = `<${a.tag}> #${a.index} in ${a.elementId ?? a.path}`;
    const e = a.event;
    if (e.type === "click") return `clicking ${control}`;
    if ("checked" in e) {
      return `${e.checked ? "checking" : "unchecking"} ${control}`;
    }
    return `setting ${control} to ${JSON.stringify(e.value)}`;
  }
  return `dragging ${a.elementId ?? a.path} from (${a.from.x.toFixed(0)}, ${a.from.y.toFixed(0)}) to ${a.targetDescription}`;
}

export function describeFuzzError(e: FuzzError): string {
  const err = e.error instanceof Error ? e.error.message : String(e.error);
  return `[depth ${e.depth}] ${describeFuzzAction(e.action)}: ${err}`;
}

/** Throw a readable AssertionError-ish if the report has errors. */
export function expectNoFuzzErrors(report: FuzzReport, label = "") {
  if (report.errors.length === 0) return;
  const lines = report.errors.map(describeFuzzError);
  const unique = _.uniq(lines);
  throw new Error(
    `${label ? label + ": " : ""}${report.errors.length} fuzz error(s) after ` +
      `${report.statesVisited} states / ${report.actionsTried} actions:\n  ` +
      unique.join("\n  ") +
      (report.errors[0].error instanceof Error && report.errors[0].error.stack
        ? `\n\nFirst error stack:\n${report.errors[0].error.stack}`
        : ""),
  );
}
