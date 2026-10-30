import { useMemo } from "react";
import { DragInitContext, dragSpecToBehavior } from "../DragBehavior";
import {
  Draggable,
  getOnDragCallbackOnElement,
  makeDraggableProps,
} from "../draggable";
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

/**
 * What a draggable's drag behavior gives, a moment into a drag: the dragged
 * element grabbed at its origin, then the pointer moved to `pointer`.
 */
function behaviorOutput<T extends object>(
  draggable: Draggable<T>,
  state: T,
  draggedId: string,
  pointer: Vec2,
): { preview: LayeredSvgx; dropState: T } {
  const tree = assignPaths(
    draggable(
      makeDraggableProps({
        state,
        draggedId,
        setState: () => {},
        isTracking: true,
      }),
    ),
  );
  const found = assertDefined(
    findElement(tree, (el) => el.props.id === draggedId),
  );
  const callback = assertDefined(getOnDragCallbackOnElement<T>(found.element));
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
// The bright beads' ink colors (talk/snippets.ts)
const BEAD_INK: Record<string, string> = {
  A: "#b91c1c",
  B: "#1d4ed8",
  C: "#a16207",
  D: "#15803d",
  E: "#6d28d9",
};
const MONO_ADVANCE = 0.602; // DejaVu Sans Mono's characters are all this wide

const PANEL_W = 1660;
const PANEL_H = 330;
const PANEL_X = (STAGE_W - PANEL_W) / 2;
const GAP = 270;
const TOP_Y = (STAGE_H - 2 * PANEL_H - GAP) / 2;
const BOTTOM_Y = TOP_Y + PANEL_H + GAP;

// Within a panel
const MID_Y = PANEL_H / 2;
const INPUT = { x: 230, size: 150 };
const BOX = { x: 480, w: 340, h: 150 };
const THUMB = { x: 970, y: 26, size: 200 };
const CHIP = { x: 970, h: 60, size: 26, padX: 20 };
const CHIP_Y = THUMB.y + THUMB.size + 22;
const CAPTION_GAP = 32;

const OP = { h: 92, size: 54, padX: 44 };

/**
 * A drag behavior (pointer position in, preview and drop state out), and
 * below it, an operator that turns it into another. The behaviors are the
 * ring of beads', really run: their previews and drop states are what they
 * give for the pointer position shown.
 */
export function BehaviorDiagramSlide() {
  const step = useSlideStep();
  const outputs = useMemo(() => {
    const closest = beadsDraggable("ring of beads: closest");
    const floating = beadsDraggable("ring of beads: floating");
    return {
      size: Vec2(closest.width, closest.height),
      closest: behaviorOutput(
        closest.draggable,
        closest.state,
        DRAGGED,
        POINTER,
      ),
      floating: behaviorOutput(
        floating.draggable,
        floating.state,
        DRAGGED,
        POINTER,
      ),
    };
  }, []);

  // The operator sits on a heavy spine from one behavior's panel to the other
  const spineX = STAGE_W / 2;
  const opY = TOP_Y + PANEL_H + (GAP - OP.h) / 2;
  const SPINE_GAP = 14;

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

        <g transform={`translate(${PANEL_X} ${TOP_Y})`}>
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
          <g transform={`translate(${PANEL_X} ${BOTTOM_Y})`}>
            <BehaviorPanel
              spec={["d.closest(states)", ".withFloating()"]}
              size={outputs.size}
              output={outputs.floating}
            />
          </g>
          <HeavyArrow
            x={spineX}
            y0={TOP_Y + PANEL_H + SPINE_GAP}
            y1={opY - SPINE_GAP}
          />
          <HeavyArrow
            x={spineX}
            y0={opY + OP.h + SPINE_GAP}
            y1={BOTTOM_Y - SPINE_GAP}
          />
          <foreignObject x={0} y={opY} width={STAGE_W} height={OP.h}>
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
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  fontSize: OP.size,
                  padding: `0 ${OP.padX}px`,
                  borderRadius: OP.h / 2,
                }}
              >
                withFloating
                <div
                  style={{
                    position: "absolute",
                    left: `calc(100% + ${CAPTION_GAP}px)`,
                    whiteSpace: "nowrap",
                    fontFamily: sourceSans,
                    fontWeight: 400,
                    fontSize: 38,
                    color: MUTED,
                  }}
                >
                  an operator
                </div>
              </div>
            </div>
          </foreignObject>
        </g>
      </svg>
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

/** A thick downward arrow, its tip at y1 */
function HeavyArrow({ x, y0, y1 }: { x: number; y0: number; y1: number }) {
  const head = { w: 36, h: 26 };
  return (
    <g fill={INK}>
      <rect x={x - 5} y={y0} width={10} height={y1 - y0 - head.h + 2} />
      <path
        d={`M ${x - head.w / 2} ${y1 - head.h} H ${x + head.w / 2} L ${x} ${y1} Z`}
        strokeLinejoin="round"
        stroke={INK}
        strokeWidth={3}
      />
    </g>
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
