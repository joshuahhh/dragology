import _ from "lodash";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DragBehavior,
  DragInitContext,
  dragSpecToBehavior,
} from "../DragBehavior";
import {
  Draggable,
  getOnDragCallbackOnElement,
  makeDraggableProps,
} from "../draggable";
import { DragSpecBuilder, DragSpecData } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { PAPER_OP_STYLE } from "../studio/StudioHackContext";
import { findElement } from "../svgx";
import { drawLayered, LayeredSvgx } from "../svgx/layers";
import { assignPaths, getPath } from "../svgx/path";
import { localToGlobal } from "../svgx/transform";
import { compileLiveCode } from "../talk/compile";
import { CODE_FONT, LETTER_FONT } from "../talk/fonts";
import { OP_NAMES } from "../talk/opMarks";
import { snippets } from "../talk/snippets";
import { assertDefined } from "../utils/assert";
import { BEAD_INK } from "./model-driven/beads";
import { Cursor } from "./model-driven/ModelDrivenScene";
import { SideArt } from "./side-art";
import {
  STAGE_H,
  STAGE_W,
  useSlideCurrent,
  useSlideShown,
  useSlideStep,
} from "./slide";
import { sourceSans } from "./source-sans";

type BeadsState = { beads: string[] };

/** The live-coded ring of beads, as one of the talk's snippets draws it */
function beadsDraggable(title: string) {
  const snippet = snippets.find((s) => s.title === title)!;
  const live = compileLiveCode(
    snippet.bright?.code ?? snippet.code,
    snippet.bright?.prelude ?? snippet.prelude,
  );
  return {
    draggable: live.draggable as Draggable<BeadsState>,
    state: live.initialState as BeadsState,
    width: snippet.width,
    height: snippet.height,
  };
}

type Output<T> = { preview: LayeredSvgx; dropState: T };

/**
 * What a draggable's drag behavior gives, a moment into a drag: the dragged
 * element grabbed at its origin, then the pointer moved to `pointer`. The
 * behavior is the dragged element's own, or `spec`'s if it's given.
 */
function behaviorOutput<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string,
  pointer: Vec2,
  spec?: (d: DragSpecBuilder<T>) => DragSpecData<T>,
): Output<T> {
  return runBehavior(startBehavior(draggable, state, draggedId, spec), pointer);
}

function runBehavior<T extends object>(
  behavior: DragBehavior<T>,
  pointer: Vec2,
): Output<T> {
  const result = behavior({ pointer });
  return { preview: result.preview(), dropState: result.dropState };
}

/**
 * A draggable's drag behavior, the dragged element grabbed at its origin,
 * to run with pointer positions from there on. The behavior is the dragged
 * element's own, or `spec`'s if it's given.
 */
function startBehavior<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string,
  spec?: (d: DragSpecBuilder<T>) => DragSpecData<T>,
): DragBehavior<T> {
  const props = makeDraggableProps({
    state,
    draggedId,
    setState: () => {},
    isTracking: true,
  });
  const tree = assignPaths(draggable(props));
  const found = assertDefined(
    findElement(tree, (el) => el.props.id === draggedId),
  );
  const callback = spec
    ? () => spec(props.d)
    : assertDefined(getOnDragCallbackOnElement<T>(found.element));
  const ctx: DragInitContext<T> = {
    draggable,
    draggedPath: assertDefined(getPath(found.element)),
    draggedId,
    anchorPos: Vec2(0),
    startState: state,
    debug: { varyVisualizer: false },
  };
  const behavior = dragSpecToBehavior(callback(), ctx);
  behavior({ pointer: localToGlobal(found.accumulatedTransform, Vec2(0)) });
  return behavior;
}

// Where the pointer has got to: up and right of bead A's place at the top,
// nearest the slot clockwise of it
const POINTER = Vec2(258, 52);
const DRAGGED = "A";

// The behavior panel's pointer wanders around the ring, starting toward
// POINTER: `t` seconds in, its angle drifts once around every ORBIT_S,
// swaying back and forth on the way, while its distance from the ring's
// center weaves in and out across the beads. The sways and weaves are sums
// of sines with unrelated periods, which never quite repeat: smooth noise.
const RING_CENTER = Vec2(150, 150);
const ORBIT_S = 30;
const SWAY = [
  { amp: 0.9, period: 9.1, phase: 0 },
  { amp: 0.4, period: 5.3, phase: 1 },
];
const RADIUS = 105;
const WEAVE = [
  { amp: 18, period: 6.7, phase: 0.4 },
  { amp: 8, period: 3.9, phase: 2.1 },
];
function sines(t: number, waves: typeof SWAY) {
  return waves.reduce(
    (sum, { amp, period, phase }) =>
      sum + amp * Math.sin((2 * Math.PI * t) / period + phase),
    0,
  );
}
function pointerAt(t: number) {
  const angle =
    POINTER.sub(RING_CENTER).angleRad() +
    (2 * Math.PI * t) / ORBIT_S +
    sines(t, SWAY);
  return RING_CENTER.add(Vec2.polarRad(RADIUS + sines(t, WEAVE), angle));
}

/**
 * Seconds that have gone by while `running`, from 0: it holds while it
 * isn't, and carries on from there when it is again
 */
function useRunningClock(running: boolean) {
  const [t, setT] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!running) return;
    const base = performance.now() - tRef.current * 1000;
    let raf = requestAnimationFrame(function tick() {
      setT((performance.now() - base) / 1000);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return t;
}

const INK = "#1d1d24";
const MUTED = "#71717a";
const WIRE = "#52525b";
const PANEL_FILL = "#f2f2f4";
const MONO_ADVANCE = 0.602; // DejaVu Sans Mono's characters are all this wide

const PANEL_W = 1660;
const PANEL_H = 330;
const PANEL_X = (STAGE_W - PANEL_W) / 2;
const PANEL_Y = (STAGE_H - PANEL_H) / 2;
const PANEL_RADIUS = 36;

// Within a panel
const MID_Y = PANEL_H / 2;
const INPUT = { x: 230, size: 150 };
const BOX = { x: 480, w: 340, h: 150 };
const THUMB = { x: 970, y: 26, size: 200 };
const CHIP = { x: 970, h: 60, size: 26, padX: 20 };
const CHIP_Y = THUMB.y + THUMB.size + 22;
const CAPTION_GAP = 32;
const PREVIEW_CURSOR_OPACITY = 0.4;

/**
 * A drag behavior (pointer position in, preview and drop state out); then,
 * on the second step, the expression tree that the live-coded ring's last
 * behavior is built from, drawn schematically; then, on the third, the
 * tree's operators join the rest in a table of them. The behavior is the ring of
 * beads', really run: its preview and drop state are what it gives for the
 * pointer position shown.
 */
export function BehaviorDiagramSlide() {
  const step = useSlideStep();
  const { behavior, size } = useMemo(() => {
    const closest = beadsDraggable("ring of beads: closest");
    return {
      behavior: startBehavior(closest.draggable, closest.state, DRAGGED),
      size: Vec2(closest.width, closest.height),
    };
  }, []);
  // While it's on the stage, the pointer drifts and the behavior follows
  const shown = useSlideShown();
  const current = useSlideCurrent();
  const t = useRunningClock(shown && current && step === 0);
  const pointer = pointerAt(t);
  const output = useMemo(
    () => runBehavior(behavior, pointerAt(t)),
    [behavior, t],
  );

  // Going on to the tree, the panel shrinks into closest's pill, which it
  // is: its box takes on the pill's shape and tint while what's in it
  // fades. Then the pill's name, and the rest of the tree, fade in. Coming
  // back, it all plays at once.
  const tree = step >= 1;
  // Going on to the table, all but the tree's operators fade, and they move
  // into their places in it as the rest of it fades in
  const table = step >= 2;
  const scale = CLOSEST_PILL.w / PANEL_W;
  const shrunk = Vec2(
    CLOSEST_PILL.x - CLOSEST_PILL.w / 2,
    CLOSEST_PILL.y - (PANEL_H * scale) / 2,
  );
  return (
    <DiagramStage
      backdrop={
        <>
          <SideArt
            src="composable.png"
            shown={tree && !table}
            delay={800}
            // Further out than the tree is in: its picture is narrower
            // than the image
            centerX={STAGE_W / 2 + 420}
          />
          <div
            style={{
              position: "absolute",
              // Closest's pill, moving off to the table, takes its own
              // background with it
              opacity: table ? 0 : 1,
              ...(tree
                ? {
                    left: CLOSEST_PILL.x - CLOSEST_PILL.w / 2,
                    top: CLOSEST_PILL.y - CLOSEST_PILL.h / 2,
                    width: CLOSEST_PILL.w,
                    height: CLOSEST_PILL.h,
                    borderRadius: CLOSEST_PILL.h / 2,
                    background: PAPER_OP_STYLE.background,
                  }
                : {
                    left: PANEL_X,
                    top: PANEL_Y,
                    width: PANEL_W,
                    height: PANEL_H,
                    borderRadius: PANEL_RADIUS,
                    background: PANEL_FILL,
                  }),
              transition: [
                ...[
                  "left",
                  "top",
                  "width",
                  "height",
                  "border-radius",
                  "background",
                ].map((prop) => `${prop} ${SHRINK}`),
                "opacity 200ms ease",
              ].join(", "),
            }}
          />
        </>
      }
      overlay={
        <>
          <OperatorTable shown={table} />
          <OperatorPills step={step} />
        </>
      }
    >
      <g
        style={{
          transformOrigin: "0 0",
          transform: tree
            ? `translate(${shrunk.x}px, ${shrunk.y}px) scale(${scale})`
            : `translate(${PANEL_X}px, ${PANEL_Y}px)`,
          opacity: tree ? 0 : 1,
          transition: tree
            ? `transform ${SHRINK}, opacity 300ms ease`
            : `transform ${SHRINK}, opacity 400ms ease 300ms`,
        }}
      >
        <BehaviorPanel
          spec={["d.closest(states)"]}
          size={size}
          pointer={pointer}
          output={output}
        />
      </g>

      <SchematicTree shown={tree && !table} />
    </DiagramStage>
  );
}

const SHRINK = "700ms cubic-bezier(0.4, 0, 0.2, 1)";
const MOVE = "900ms cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * The expression tree of the live-coded ring's last behavior, each node
 * showing the preview its behavior gives for the pointer position shown
 */
export function BehaviorTreeSlide() {
  return (
    <DiagramStage>
      <CompositionTree />
    </DiagramStage>
  );
}

/**
 * A white stage, its SVG with the diagrams' markers and filters, between
 * HTML `backdrop` and `overlay`
 */
function DiagramStage({
  backdrop,
  overlay,
  children,
}: {
  backdrop?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-behavior-diagram
      style={{ position: "absolute", inset: 0, background: "white" }}
    >
      <style>
        {`[data-behavior-diagram] text[data-loc] { font-family: ${LETTER_FONT}; }`}
      </style>
      {backdrop}
      <svg
        width={STAGE_W}
        height={STAGE_H}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <marker
            id="bd-arrow"
            viewBox="0 0 12 10"
            refX={10}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M 0 0 L 12 5 L 0 10 L 3 5 z" fill={WIRE} />
          </marker>
          <filter id="bd-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={2} stdDeviation={5} floodOpacity={0.1} />
          </filter>
        </defs>
        {children}
      </svg>
      {overlay}
    </div>
  );
}

// The composition tree, top to bottom: the states' behaviors, into closest;
// it and the removed state's behavior into whenFar; that into withFloating
const TREE = {
  spineX: STAGE_W / 2,
  leaf: { size: 140, gap: 24, y: 30, pad: 8 },
  node: { thumb: 140, pad: 12 },
  // The tops of closest's, whenFar's and withFloating's boxes
  levels: [300, 580, 860],
  // Where the removed state's behavior sits, right of closest
  removedDX: 330,
  // An operator's pill sits on the wire into the box of the behavior it makes
  pill: { h: 60, size: 44, padX: 28, gap: 16 },
  code: { size: 34, gap: 64 },
};
const NODE_W = TREE.node.thumb + 2 * TREE.node.pad;
const NODE_H = NODE_W;

/** Every state with bead `idx` moved to some index (as the snippet's helper) */
function reinsertions(state: BeadsState, idx: number): BeadsState[] {
  return state.beads.map((_, targetIdx) => {
    const beads = [...state.beads];
    const [bead] = beads.splice(idx, 1);
    beads.splice(targetIdx, 0, bead);
    return { beads };
  });
}

/** The state with bead `idx` taken out (as the snippet's helper) */
function removed(state: BeadsState, idx: number): BeadsState {
  return { beads: state.beads.filter((_, i) => i !== idx) };
}

function CompositionTree() {
  const tree = useMemo(() => {
    const ring = beadsDraggable("ring of beads: static");
    const idx = ring.state.beads.indexOf(DRAGGED);
    const states = reinsertions(ring.state, idx);
    const gone = removed(ring.state, idx);
    const run = (
      spec: (d: DragSpecBuilder<BeadsState>) => DragSpecData<BeadsState>,
    ) => behaviorOutput(ring.draggable, ring.state, DRAGGED, POINTER, spec);
    return {
      size: Vec2(ring.width, ring.height),
      leaves: states.map((s) => run((d) => d.fixed(s))),
      removed: run((d) => d.fixed(gone)),
      closest: run((d) => d.closest(states)),
      whenFar: run((d) => d.closest(states).whenFar(gone)),
      floating: run((d) => d.closest(states).whenFar(gone).withFloating()),
    };
  }, []);

  const { spineX, leaf, levels, pill } = TREE;
  const leafX = (i: number) =>
    spineX + (i - (tree.leaves.length - 1) / 2) * (leaf.size + leaf.gap);
  const leafBottom = leaf.y + leaf.size;
  const pillTop = (level: number) => levels[level] - pill.gap - pill.h;
  const removedX = spineX + TREE.removedDX;
  const removedY = levels[0] + (NODE_H - leaf.size) / 2;
  const codeX = spineX - NODE_W / 2 - TREE.code.gap;

  return (
    <g>
      {/* Wires first, under the boxes and pills */}
      {tree.leaves.map((_, i) => (
        <TreeWire
          key={i}
          from={Vec2(leafX(i), leafBottom)}
          to={Vec2(spineX + (i - 2) * 26, pillTop(0) + 6)}
        />
      ))}
      <TreeWire
        from={Vec2(spineX, levels[0] + NODE_H)}
        to={Vec2(spineX - 30, pillTop(1) + 6)}
      />
      <TreeWire
        from={Vec2(removedX, removedY + leaf.size)}
        to={Vec2(spineX + 30, pillTop(1) + 6)}
      />
      <TreeWire
        from={Vec2(spineX, levels[1] + NODE_H)}
        to={Vec2(spineX, pillTop(2) + 6)}
      />
      {levels.map((top, i) => (
        <TreeWire
          key={i}
          from={Vec2(spineX, pillTop(i) + pill.h / 2)}
          to={Vec2(spineX, top)}
        />
      ))}

      {tree.leaves.map((output, i) => (
        <LeafBehavior
          key={i}
          x={leafX(i) - leaf.size / 2}
          y={leaf.y}
          size={tree.size}
          output={output}
        />
      ))}
      <LeafBehavior
        x={removedX - leaf.size / 2}
        y={removedY}
        size={tree.size}
        output={tree.removed}
      />

      <OpNode
        name="closest"
        top={levels[0]}
        size={tree.size}
        output={tree.closest}
      />
      <OpNode
        name="whenFar"
        top={levels[1]}
        size={tree.size}
        output={tree.whenFar}
      />
      <OpNode
        name="withFloating"
        top={levels[2]}
        size={tree.size}
        output={tree.floating}
      />

      {/* The code that builds each operator's node, beside it */}
      {OP_CODE.map((code, i) => (
        <CodeLine
          key={code}
          code={code}
          right={codeX}
          y={levels[i] + NODE_H / 2}
          size={TREE.code.size}
        />
      ))}
      <Caption
        x={leafX(0) - leaf.size / 2 - CAPTION_GAP}
        y={leaf.y + leaf.size / 2}
        anchor="end"
      >
        states
      </Caption>
      <Caption
        x={removedX + leaf.size / 2 + CAPTION_GAP}
        y={removedY + leaf.size / 2}
      >
        removed
      </Caption>
    </g>
  );
}

/** A vertical S-curve from one point down to another */
function TreeWire({ from, to }: { from: Vec2; to: Vec2 }) {
  const k = (to.y - from.y) * 0.5;
  return (
    <path
      d={`M ${from.x} ${from.y} C ${from.x} ${from.y + k} ${to.x} ${to.y - k} ${to.x} ${to.y}`}
      fill="none"
      stroke={WIRE}
      strokeWidth={4}
      strokeLinecap="round"
    />
  );
}

/** A preview, the pointer drawn on it */
function PreviewThumb({
  x,
  y,
  thumb,
  size,
  preview,
}: {
  x: number;
  y: number;
  thumb: number;
  size: Vec2;
  preview: LayeredSvgx;
}) {
  return (
    <svg
      x={x}
      y={y}
      width={thumb}
      height={thumb}
      viewBox={`0 0 ${size.x} ${size.y}`}
      overflow="visible"
    >
      {drawLayered(preview)}
      <Cursor at={POINTER} scale={0.75 / (thumb / size.x)} />
    </svg>
  );
}

/** A state's behavior: a box around the state, which is all it previews */
function LeafBehavior({
  x,
  y,
  size,
  output,
}: {
  x: number;
  y: number;
  size: Vec2;
  output: Output<BeadsState>;
}) {
  const { leaf } = TREE;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={leaf.size}
        height={leaf.size}
        rx={18}
        fill="white"
        stroke={INK}
        strokeWidth={3}
      />
      <svg
        x={x + leaf.pad}
        y={y + leaf.pad}
        width={leaf.size - 2 * leaf.pad}
        height={leaf.size - 2 * leaf.pad}
        viewBox={`0 0 ${size.x} ${size.y}`}
      >
        {drawLayered(output.preview)}
      </svg>
    </g>
  );
}

/**
 * The behavior an operator makes, on the spine: a box showing its preview,
 * the operator on the wire just above it
 */
function OpNode({
  name,
  top,
  size,
  output,
}: {
  name: string;
  top: number;
  size: Vec2;
  output: Output<BeadsState>;
}) {
  const { spineX, node, pill } = TREE;
  const left = spineX - NODE_W / 2;
  return (
    <g>
      <rect
        x={left}
        y={top}
        width={NODE_W}
        height={NODE_H}
        rx={22}
        fill="white"
        stroke={INK}
        strokeWidth={3}
      />
      <PreviewThumb
        x={left + node.pad}
        y={top + node.pad}
        thumb={node.thumb}
        size={size}
        preview={output.preview}
      />
      <OpPill
        name={name}
        x={spineX}
        y={top - pill.gap - pill.h / 2}
        h={pill.h}
        size={pill.size}
        padX={pill.padX}
      />
    </g>
  );
}

/** An operator's name in a pill, centered on (x, y) */
function OpPill({
  name,
  x,
  y,
  h,
  size,
  padX,
  width,
  style,
}: {
  name: string;
  x: number;
  y: number;
  h: number;
  size: number;
  padX: number;
  /** Its width, if not the name's with `padX` either side */
  width?: number;
  style?: React.CSSProperties;
}) {
  return (
    <foreignObject
      x={x - 400}
      y={y - h / 2}
      width={800}
      height={h}
      style={style}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div style={pillStyle({ size, h, padX, width })}>{name}</div>
      </div>
    </foreignObject>
  );
}

/** An operator's pill, `width` wide, or as wide as its name and `padX` */
function pillStyle({
  size,
  h,
  padX,
  width,
}: {
  size: number;
  h: number;
  padX: number;
  width?: number | string;
}): React.CSSProperties {
  return {
    ...PAPER_OP_STYLE,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: size,
    height: h,
    padding: `0 ${padX}px`,
    width,
    boxSizing: "border-box",
    borderRadius: h / 2,
    whiteSpace: "nowrap",
  };
}

/** A line of code, its right end at `right`, centered on `y` */
function CodeLine({
  code,
  right,
  y,
  size,
}: {
  code: string;
  right: number;
  y: number;
  size: number;
}) {
  return (
    <foreignObject x={0} y={y - 40} width={right} height={80}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          height: "100%",
          fontSize: size,
          color: "#3f3f46",
        }}
      >
        <Code code={code} />
      </div>
    </foreignObject>
  );
}

// The same tree, schematically: the states named as in the code, and the
// operators' behaviors just the wires out of them
const SCHEMA = {
  // The tree, left, and the Composable Dragging art, right, share the
  // slide, with even margins. (The tree reaches from withFloating's left
  // end to removed's right, centered about 30px right of its spine.)
  spineX: STAGE_W / 2 - 360 - 30,
  // The states' names: their size, how far below one its wires start, and
  // (for `states`, which is several, its wires parallel, all well within
  // the name's width) how far apart they are
  name: { size: 44, wireGap: 30, spread: 24 },
  statesY: 210,
  // The centers of closest's, whenFar's and withFloating's pills
  levels: [400, 640, 860],
  // How far either side of whenFar's center its two inputs come in.
  // Closest, and the states above it, sit that far left, so its wire to
  // whenFar runs straight down.
  inlet: 70,
  // Where the removed state's name sits, between closest and whenFar
  removed: { dx: 200, y: 500 },
  pill: { h: 84, size: 64, padX: 40 },
  // The code, in the bottom left corner
  code: { size: 34, x: 80, bottom: 70 },
};

const OP_CODE = ["d.closest(states)", ".whenFar(removed)", ".withFloating()"];

// Closest's pill, sized so the behavior panel can shrink into it exactly
const CLOSEST_PILL = {
  x: SCHEMA.spineX - SCHEMA.inlet,
  y: SCHEMA.levels[0],
  w: 270,
  h: SCHEMA.pill.h,
};

/**
 * The tree but its operators' pills (OperatorPills draws those, over its
 * wires' ends). `shown` fades it in, after closest's pill; or, unset, out
 */
function SchematicTree({ shown }: { shown: boolean }) {
  const { spineX, name, statesY, levels, removed, pill, inlet } = SCHEMA;
  const closestX = CLOSEST_PILL.x;
  const n = 5;
  const pillTop = (y: number) => y - pill.h / 2 + 8;
  const pillBottom = (y: number) => y + pill.h / 2 - 8;
  const removedX = spineX + removed.dx;
  const fade = (delay: number) => ({
    opacity: shown ? 1 : 0,
    transition: shown ? `opacity 400ms ease ${delay}ms` : "opacity 250ms ease",
  });
  return (
    <g>
      <g style={fade(TREE_FADE_DELAY)}>
        {/* One wire per state, so it reads as several */}
        {Array.from({ length: n }, (_, i) => (
          <line
            key={i}
            x1={closestX + (i - (n - 1) / 2) * name.spread}
            y1={statesY + name.wireGap}
            x2={closestX + (i - (n - 1) / 2) * name.spread}
            y2={pillTop(levels[0])}
            stroke={WIRE}
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
        <TreeWire
          from={Vec2(closestX, pillBottom(levels[0]))}
          to={Vec2(spineX - inlet, pillTop(levels[1]))}
        />
        <TreeWire
          from={Vec2(removedX, removed.y + name.wireGap)}
          to={Vec2(spineX + inlet, pillTop(levels[1]))}
        />
        <TreeWire
          from={Vec2(spineX, pillBottom(levels[1]))}
          to={Vec2(spineX, pillTop(levels[2]))}
        />

        <StateName x={closestX} y={statesY} name="states" />
        <StateName x={removedX} y={removed.y} name="removed" />

        {/* The code the tree is of, as it's written. Out for now: with the
            Composable Dragging art in, the slide's too crowded.
        <foreignObject
          x={SCHEMA.code.x}
          y={STAGE_H - SCHEMA.code.bottom - 200}
          width={800}
          height={200}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              height: "100%",
              fontSize: SCHEMA.code.size,
              lineHeight: 1.5,
              color: "#3f3f46",
            }}
          >
            {[
              "d.closest(states)",
              "  .whenFar(removed)",
              "  .withFloating()",
            ].map((line) => (
              <Code key={line} code={line} />
            ))}
          </div>
        </foreignObject> */}
      </g>
    </g>
  );
}

/** A state's name in the code, centered on (x, y) */
function StateName({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={CODE_FONT}
      fontSize={SCHEMA.name.size}
      fill={INK}
    >
      {name}
    </text>
  );
}

// # The operators, on their way from the tree to the table

// The tree's fading in: closest's pill first, as the behavior panel
// finishes shrinking into it, then the rest
const CLOSEST_FADE_DELAY = 550;
const TREE_FADE_DELAY = 800;

// The paper's table of operators, streamlined: just their names and what
// they do. The tree's operators move into it from the tree.
const OPERATOR_TABLE: {
  kind: string;
  gist: string;
  rows: { name: string; op: boolean; does: string }[];
}[] = [
  {
    kind: "Primitives",
    gist: "produce base behaviors",
    rows: [
      { name: "state", op: false, does: "Use a state as a static behavior." },
      {
        name: "vary",
        op: true,
        does: "Pull the dragged element to the pointer by varying numbers.",
      },
      {
        name: "dropTarget",
        op: true,
        does: "Go to a new state when dropped over a given element.",
      },
    ],
  },
  {
    kind: "Combinators",
    gist: "compose behaviors",
    rows: [
      {
        name: "closest",
        op: true,
        does: "Pick the behavior whose target is nearest the pointer.",
      },
      {
        name: "between",
        op: true,
        does: "Interpolate smoothly between behaviors.",
      },
      {
        name: "whenFar",
        op: true,
        does: "Switch to another behavior far from this one's targets.",
      },
      {
        name: "switchToStateAndFollow",
        op: true,
        does: "Switch to a new state at once, and follow a new element.",
      },
    ],
  },
  {
    kind: "Modifiers",
    gist: "layer on additional features",
    rows: [
      {
        name: "withFloating",
        op: true,
        does: "Detach the dragged element and make it follow the pointer.",
      },
      {
        name: "withSnapRadius",
        op: true,
        does: "Pull the preview to the drop state when close enough.",
      },
      {
        name: "onDrop",
        op: true,
        does: "Transform the drop state with a given function.",
      },
    ],
  },
];

// The kinds of operator stand out; what each does is fine print
const TABLE = {
  x: 300,
  // How far the rows are indented under their headings
  indent: 40,
  // Where what each does starts, right of the widest pill
  doesX: 880,
  headingH: 80,
  rowH: 62,
  sectionGap: 34,
  kindSize: 44,
  gistSize: 34,
  // Between a kind of operator and its gist
  kindGap: 22,
  doesSize: 28,
  doesColor: "#a1a1aa",
  // Its pills are the tree's, scaled down
  pillScale: 0.625,
};

/** Where the table's headings and rows go: their centers, down the stage */
const TABLE_LAYOUT = (() => {
  const height =
    OPERATOR_TABLE.length * TABLE.headingH +
    _.sumBy(OPERATOR_TABLE, (s) => s.rows.length) * TABLE.rowH +
    (OPERATOR_TABLE.length - 1) * TABLE.sectionGap;
  let y = (STAGE_H - height) / 2;
  const headings: { kind: string; gist: string; y: number }[] = [];
  const rows: { name: string; op: boolean; does: string; y: number }[] = [];
  for (const section of OPERATOR_TABLE) {
    headings.push({
      kind: section.kind,
      gist: section.gist,
      y: y + TABLE.headingH / 2,
    });
    y += TABLE.headingH;
    for (const row of section.rows) {
      rows.push({ ...row, y: y + TABLE.rowH / 2 });
      y += TABLE.rowH;
    }
    y += TABLE.sectionGap;
  }
  return { headings, rows };
})();

/** The tree's operators, where they are in the tree */
const TREE_OPS: {
  name: string;
  center: Vec2;
  /** Its width, if fixed */
  width?: number;
  fadeDelay: number;
}[] = [
  {
    name: "closest",
    center: Vec2(CLOSEST_PILL.x, CLOSEST_PILL.y),
    width: CLOSEST_PILL.w,
    fadeDelay: CLOSEST_FADE_DELAY,
  },
  {
    name: "whenFar",
    center: Vec2(SCHEMA.spineX, SCHEMA.levels[1]),
    fadeDelay: TREE_FADE_DELAY,
  },
  {
    name: "withFloating",
    center: Vec2(SCHEMA.spineX, SCHEMA.levels[2]),
    fadeDelay: TREE_FADE_DELAY,
  },
];

/**
 * The tree's operators' pills: from the second step, in the tree, fading
 * in; from the third, in their rows of the table, scaled down to its size
 */
function OperatorPills({ step }: { step: number }) {
  const { pill } = SCHEMA;
  // The pills' widths, which center them in the tree, measured once their
  // font is in
  const els = useRef(new Map<string, HTMLDivElement>());
  const [widths, setWidths] = useState(new Map<string, number>());
  useLayoutEffect(() => {
    const measure = () =>
      setWidths(
        new Map([...els.current].map(([name, el]) => [name, el.offsetWidth])),
      );
    measure();
    void document.fonts.ready.then(measure);
  }, []);

  const s = TABLE.pillScale;
  return (
    <>
      {TREE_OPS.map(({ name, center, width, fadeDelay }) => {
        const w = width ?? widths.get(name) ?? 0;
        const row = TABLE_LAYOUT.rows.find((r) => r.name === name)!;
        const [left, top, scale] =
          step >= 2
            ? [TABLE.x + TABLE.indent, row.y - (pill.h * s) / 2, s]
            : [center.x - w / 2, center.y - pill.h / 2, 1];
        return (
          <div
            key={name}
            ref={(el) => {
              if (el) els.current.set(name, el);
              else els.current.delete(name);
            }}
            style={{
              ...pillStyle({
                size: pill.size,
                h: pill.h,
                padX: width === undefined ? pill.padX : 0,
                width,
              }),
              position: "absolute",
              left,
              top,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              opacity: step >= 1 ? 1 : 0,
              transition: [
                step >= 1
                  ? `opacity 400ms ease ${step === 1 ? fadeDelay : 0}ms`
                  : "opacity 250ms ease",
                `left ${MOVE}`,
                `top ${MOVE}`,
                `transform ${MOVE}`,
              ].join(", "),
            }}
          >
            {name}
          </div>
        );
      })}
    </>
  );
}

/**
 * The table of operators, but for the tree's, which OperatorPills moves
 * into the places it leaves for them
 */
function OperatorTable({ shown }: { shown: boolean }) {
  const { pill } = SCHEMA;
  const s = TABLE.pillScale;
  const treeOp = (name: string) => TREE_OPS.find((op) => op.name === name);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: shown ? 1 : 0,
        transition: shown ? "opacity 500ms ease 450ms" : "opacity 200ms ease",
      }}
    >
      {TABLE_LAYOUT.headings.map(({ kind, gist, y }) => (
        <div
          key={kind}
          style={{
            position: "absolute",
            left: TABLE.x,
            top: y - TABLE.headingH / 2,
            height: TABLE.headingH,
            display: "flex",
            alignItems: "baseline",
            gap: TABLE.kindGap,
            paddingTop: 18,
            boxSizing: "border-box",
            fontFamily: sourceSans,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{ fontSize: TABLE.kindSize, fontWeight: 700, color: INK }}
          >
            {kind}
          </span>
          <span style={{ fontSize: TABLE.gistSize, color: MUTED }}>{gist}</span>
        </div>
      ))}
      {TABLE_LAYOUT.rows.map(({ name, op, does, y }) => {
        const moving = treeOp(name);
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: TABLE.x + TABLE.indent,
              top: y - TABLE.rowH / 2,
              height: TABLE.rowH,
              display: "flex",
              alignItems: "center",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ width: TABLE.doesX - TABLE.x - TABLE.indent }}>
              {op ? (
                <div
                  style={{
                    ...pillStyle({
                      size: pill.size * s,
                      h: pill.h * s,
                      padX: moving?.width === undefined ? pill.padX * s : 0,
                      // Not stretched across its column
                      width:
                        moving?.width === undefined
                          ? "fit-content"
                          : moving.width * s,
                    }),
                    // The tree's own pill lands here
                    visibility: moving ? "hidden" : undefined,
                  }}
                >
                  {name}
                </div>
              ) : (
                <span
                  style={{
                    fontFamily: CODE_FONT,
                    fontSize: SCHEMA.pill.size * s,
                    color: INK,
                    // In line with the pills' names, not their ends
                    paddingLeft: SCHEMA.pill.padX * s,
                  }}
                >
                  {name}
                </span>
              )}
            </div>
            <span
              style={{
                fontFamily: sourceSans,
                fontSize: TABLE.doesSize,
                color: TABLE.doesColor,
              }}
            >
              {does}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Code, its operators' names styled as the live-code slide styles them */
function Code({ code }: { code: string }) {
  // Split around the names after dots: ["d.", "closest", "(states)"]
  const parts = code.split(/(?<=\.)(\w+)/);
  return (
    <span style={{ fontFamily: CODE_FONT, whiteSpace: "pre" }}>
      {parts.map((part, i) =>
        i % 2 === 1 && OP_NAMES.has(part) ? (
          <span
            key={i}
            style={{ ...PAPER_OP_STYLE, padding: "0 2px", borderRadius: 2 }}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

function Wire({ d, arrow = false }: { d: string; arrow?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={WIRE}
      strokeWidth={3}
      strokeLinecap="round"
      markerEnd={arrow ? "url(#bd-arrow)" : undefined}
    />
  );
}

/** A horizontal S-curve from one point to another, leaving and arriving flat */
function sCurve(from: Vec2, to: Vec2) {
  const k = (to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + k} ${from.y} ${to.x - k} ${to.y} ${to.x} ${to.y}`;
}

function Caption({
  x,
  y,
  anchor = "start",
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "end";
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontFamily={sourceSans}
      fontSize={38}
      fill={MUTED}
    >
      {children}
    </text>
  );
}

function Card({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={14}
      fill="white"
      filter="url(#bd-shadow)"
    />
  );
}

function BehaviorPanel({
  spec,
  size,
  pointer,
  output,
}: {
  /** The spec's code, a line each */
  spec: string[];
  size: Vec2;
  pointer: Vec2;
  output: { preview: LayeredSvgx; dropState: BeadsState };
}) {
  const boxY = MID_Y - BOX.h / 2;
  const boxRight = Vec2(BOX.x + BOX.w, MID_Y);
  const dropText = `{ beads: [${output.dropState.beads.join(", ")}] }`;
  const chipW = dropText.length * CHIP.size * MONO_ADVANCE + 2 * CHIP.padX;
  const inputY = MID_Y - INPUT.size / 2;
  return (
    <g>
      {/* Pointer position in: where it is on the canvas */}
      <Caption x={INPUT.x - CAPTION_GAP} y={MID_Y - 22} anchor="end">
        pointer
      </Caption>
      <Caption x={INPUT.x - CAPTION_GAP} y={MID_Y + 22} anchor="end">
        position
      </Caption>
      <Card x={INPUT.x} y={inputY} w={INPUT.size} h={INPUT.size} />
      <svg
        x={INPUT.x}
        y={inputY}
        width={INPUT.size}
        height={INPUT.size}
        viewBox={`0 0 ${size.x} ${size.y}`}
        overflow="visible"
      >
        {/* Guides from the canvas's edges */}
        <g stroke="#a1a1aa" strokeWidth={3} strokeDasharray="9 9">
          <line x1={pointer.x} y1={0} x2={pointer.x} y2={pointer.y} />
          <line x1={0} y1={pointer.y} x2={pointer.x} y2={pointer.y} />
        </g>
        <Cursor at={pointer} scale={1.4 / (INPUT.size / size.x)} />
      </svg>
      {/* The coordinates the guides give, under the card, clear of the
          pointer */}
      <text
        x={INPUT.x + INPUT.size / 2}
        y={inputY + INPUT.size + 30}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={CODE_FONT}
        fontSize={24}
        fill={INK}
      >
        ({Math.round(pointer.x)}, {Math.round(pointer.y)})
      </text>
      {/* L, not H: Firefox turns the marker on an H segment's end sideways */}
      <Wire
        d={`M ${INPUT.x + INPUT.size + 18} ${MID_Y} L ${BOX.x - 14} ${MID_Y}`}
        arrow
      />

      {/* The behavior */}
      <rect
        x={BOX.x}
        y={boxY}
        width={BOX.w}
        height={BOX.h}
        rx={22}
        fill="white"
        stroke={INK}
        strokeWidth={3}
      />
      <text
        x={BOX.x + BOX.w / 2}
        y={MID_Y - 28}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={sourceSans}
        fontSize={46}
        fontWeight={600}
        fill={INK}
      >
        drag behavior
      </text>
      <foreignObject x={BOX.x} y={MID_Y + 2} width={BOX.w} height={66}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            fontSize: 22,
            lineHeight: "30px",
            color: "#3f3f46",
          }}
        >
          {spec.map((line, i) => (
            <Code key={i} code={line} />
          ))}
        </div>
      </foreignObject>

      {/* Preview and drop state out */}
      <Wire
        d={sCurve(boxRight, Vec2(THUMB.x - 22, THUMB.y + THUMB.size / 2))}
        arrow
      />
      <Wire
        d={sCurve(boxRight, Vec2(CHIP.x - 22, CHIP_Y + CHIP.h / 2))}
        arrow
      />

      <Card x={THUMB.x} y={THUMB.y} w={THUMB.size} h={THUMB.size} />
      <svg
        x={THUMB.x}
        y={THUMB.y}
        width={THUMB.size}
        height={THUMB.size}
        viewBox={`0 0 ${size.x} ${size.y}`}
        overflow="visible"
      >
        {drawLayered(output.preview)}
        {/* Faint: the pointer isn't part of the preview, just where it is */}
        <Cursor
          at={pointer}
          scale={1.4 / (THUMB.size / size.x)}
          opacity={PREVIEW_CURSOR_OPACITY}
        />
      </svg>
      <Caption
        x={THUMB.x + THUMB.size + CAPTION_GAP}
        y={THUMB.y + THUMB.size / 2}
      >
        preview
      </Caption>

      <Card x={CHIP.x} y={CHIP_Y} w={chipW} h={CHIP.h} />
      <text
        x={CHIP.x + CHIP.padX}
        // On the alphabetic baseline, not "central": the colored letters'
        // tspans would each work out their own center, a little higher
        y={CHIP_Y + CHIP.h / 2 + CHIP.size * 0.36}
        fontFamily={CODE_FONT}
        fontSize={CHIP.size}
        fill={INK}
      >
        {"{ beads: ["}
        {output.dropState.beads.map((bead, i) => (
          <tspan key={bead}>
            {i > 0 && ", "}
            <tspan
              fill={BEAD_INK[bead]}
              fontWeight={bead === DRAGGED ? 800 : 500}
            >
              {bead}
            </tspan>
          </tspan>
        ))}
        {"] }"}
      </text>
      <Caption x={CHIP.x + chipW + CAPTION_GAP} y={CHIP_Y + CHIP.h / 2}>
        drop state
      </Caption>
    </g>
  );
}
