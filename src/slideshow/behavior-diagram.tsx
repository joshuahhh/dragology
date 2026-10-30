import { useMemo } from "react";
import { DragInitContext, dragSpecToBehavior } from "../DragBehavior";
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
import { STAGE_H, STAGE_W, useSlideStep } from "./slide";
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
  const result = behavior({ pointer });
  return { preview: result.preview(), dropState: result.dropState };
}

// Where the pointer has got to: up and right of bead A's place at the top,
// nearest the slot clockwise of it
const POINTER = Vec2(258, 52);
const DRAGGED = "A";

const INK = "#1d1d24";
const MUTED = "#71717a";
const WIRE = "#52525b";
const PANEL_FILL = "#f2f2f4";
const MONO_ADVANCE = 0.602; // DejaVu Sans Mono's characters are all this wide

const PANEL_W = 1660;
const PANEL_H = 330;
const PANEL_X = (STAGE_W - PANEL_W) / 2;
const PANEL_Y = (STAGE_H - PANEL_H) / 2;

// Within a panel
const MID_Y = PANEL_H / 2;
const INPUT = { x: 230, size: 150 };
const BOX = { x: 480, w: 340, h: 150 };
const THUMB = { x: 970, y: 26, size: 200 };
const CHIP = { x: 970, h: 60, size: 26, padX: 20 };
const CHIP_Y = THUMB.y + THUMB.size + 22;
const CAPTION_GAP = 32;

/**
 * A drag behavior (pointer position in, preview and drop state out); then,
 * on the second step, the expression tree that the live-coded ring's last
 * behavior is built from, drawn schematically. The behavior is the ring of
 * beads', really run: its preview and drop state are what it gives for the
 * pointer position shown.
 */
export function BehaviorDiagramSlide() {
  const step = useSlideStep();
  const outputs = useMemo(() => {
    const closest = beadsDraggable("ring of beads: closest");
    return {
      size: Vec2(closest.width, closest.height),
      closest: behaviorOutput(
        closest.draggable,
        closest.state,
        DRAGGED,
        POINTER,
      ),
    };
  }, []);

  return (
    <DiagramStage>
      <g
        transform={`translate(${PANEL_X} ${PANEL_Y})`}
        style={{
          opacity: step === 0 ? 1 : 0,
          transition: "opacity 500ms ease",
        }}
      >
        <BehaviorPanel
          spec={["d.closest(states)"]}
          size={outputs.size}
          output={outputs.closest}
        />
      </g>

      <g
        style={{
          opacity: step >= 1 ? 1 : 0,
          transition: "opacity 500ms ease",
        }}
      >
        <SchematicTree />
      </g>
    </DiagramStage>
  );
}

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

/** A white stage, its SVG with the diagrams' markers and filters */
function DiagramStage({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-behavior-diagram
      style={{ position: "absolute", inset: 0, background: "white" }}
    >
      <style>
        {`[data-behavior-diagram] text[data-loc] { font-family: ${LETTER_FONT}; }`}
      </style>
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
}: {
  name: string;
  x: number;
  y: number;
  h: number;
  size: number;
  padX: number;
}) {
  return (
    <foreignObject x={x - 400} y={y - h / 2} width={800} height={h}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div
          style={{
            ...PAPER_OP_STYLE,
            display: "flex",
            alignItems: "center",
            fontSize: size,
            padding: `0 ${padX}px`,
            borderRadius: h / 2,
          }}
        >
          {name}
        </div>
      </div>
    </foreignObject>
  );
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

// The same tree, schematically: the states in plain boxes, and the
// operators' behaviors just the wires out of them
const SCHEMA = {
  spineX: STAGE_W / 2,
  leaf: { w: 170, h: 84, gap: 30, y: 150, size: 44 },
  // The centers of closest's, whenFar's and withFloating's pills
  levels: [440, 680, 900],
  // Where the removed state sits, between closest and whenFar
  removed: { dx: 380, y: 540 },
  pill: { h: 84, size: 64, padX: 40 },
  code: { size: 40, gap: 270 },
};

const OP_CODE = ["d.closest(states)", ".whenFar(removed)", ".withFloating()"];

function SchematicTree() {
  const { spineX, leaf, levels, removed, pill } = SCHEMA;
  const n = 5;
  const leafX = (i: number) => spineX + (i - (n - 1) / 2) * (leaf.w + leaf.gap);
  const pillTop = (y: number) => y - pill.h / 2 + 8;
  const pillBottom = (y: number) => y + pill.h / 2 - 8;
  const removedX = spineX + removed.dx;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <TreeWire
          key={i}
          from={Vec2(leafX(i), leaf.y + leaf.h)}
          to={Vec2(spineX + (i - 2) * 30, pillTop(levels[0]))}
        />
      ))}
      <TreeWire
        from={Vec2(spineX, pillBottom(levels[0]))}
        to={Vec2(spineX - 36, pillTop(levels[1]))}
      />
      <TreeWire
        from={Vec2(removedX, removed.y + leaf.h / 2)}
        to={Vec2(spineX + 36, pillTop(levels[1]))}
      />
      <TreeWire
        from={Vec2(spineX, pillBottom(levels[1]))}
        to={Vec2(spineX, pillTop(levels[2]))}
      />

      {Array.from({ length: n }, (_, i) => (
        <StateBox key={i} x={leafX(i)} y={leaf.y + leaf.h / 2} />
      ))}
      <StateBox x={removedX} y={removed.y} />
      <Caption x={removedX + leaf.w / 2 + CAPTION_GAP} y={removed.y}>
        removed
      </Caption>

      {["closest", "whenFar", "withFloating"].map((name, i) => (
        <OpPill
          key={name}
          name={name}
          x={spineX}
          y={levels[i]}
          h={pill.h}
          size={pill.size}
          padX={pill.padX}
        />
      ))}
      {OP_CODE.map((code, i) => (
        <CodeLine
          key={code}
          code={code}
          right={spineX - SCHEMA.code.gap}
          y={levels[i]}
          size={SCHEMA.code.size}
        />
      ))}
    </g>
  );
}

/** A state, as a behavior: a plain box, centered on (x, y) */
function StateBox({ x, y }: { x: number; y: number }) {
  const { w, h, size } = SCHEMA.leaf;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={18}
        fill="white"
        stroke={INK}
        strokeWidth={3}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={sourceSans}
        fontSize={size}
        fill={INK}
      >
        state
      </text>
    </g>
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
  output,
}: {
  /** The spec's code, a line each */
  spec: string[];
  size: Vec2;
  output: { preview: LayeredSvgx; dropState: BeadsState };
}) {
  const boxY = MID_Y - BOX.h / 2;
  const boxRight = Vec2(BOX.x + BOX.w, MID_Y);
  const thumbScale = THUMB.size / size.x;
  const dropText = `{ beads: [${output.dropState.beads.join(", ")}] }`;
  const chipW = dropText.length * CHIP.size * MONO_ADVANCE + 2 * CHIP.padX;
  const inputY = MID_Y - INPUT.size / 2;
  return (
    <g>
      <rect width={PANEL_W} height={PANEL_H} rx={36} fill={PANEL_FILL} />

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
        {/* Guides from the canvas's edges, and the coordinates they give */}
        <g stroke="#a1a1aa" strokeWidth={3} strokeDasharray="9 9">
          <line x1={POINTER.x} y1={0} x2={POINTER.x} y2={POINTER.y} />
          <line x1={0} y1={POINTER.y} x2={POINTER.x} y2={POINTER.y} />
        </g>
        <text
          x={size.x / 2}
          y={size.y * 0.68}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={CODE_FONT}
          fontSize={46}
          fill={INK}
        >
          ({POINTER.x}, {POINTER.y})
        </text>
        <Cursor at={POINTER} scale={1.4 / (INPUT.size / size.x)} />
      </svg>
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
        <Cursor at={POINTER} scale={1.4 / thumbScale} />
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
