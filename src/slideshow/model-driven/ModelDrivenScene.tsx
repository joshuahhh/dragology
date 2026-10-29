// An animated explainer of model-driven dragging, for any draggable: the
// model state and its view; the states the dragged element's drag spec
// offers, and their views; where the element lands in each; and then the
// drag itself, live, with the debug overlay. Everything but the live drag is
// a pure function of the time `t`. The script (layout and timing) is laid out
// to match model-driven-full.mp4, the hand-made video this replaces, second
// for second.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Draggable } from "../../draggable";
import { DraggableRenderer, type DragStatus } from "../../DraggableRenderer";
import { Vec2 } from "../../math/vec2";
import { OverlayVis } from "../../OverlayVis";
import { drawLayered, LayeredSvgx } from "../../svgx/layers";
import { robotoMono } from "../roboto-mono";
import { STAGE_H, STAGE_W } from "../slide";
import { sourceSans } from "../source-sans";
import { analyzeDrag } from "./analyze";
import { blink, cubicBezier, eased, lerp, linear, progress } from "./anim";

/** A line of code, in segments; marked segments are underlined. */
export type CodeLine = { text: string; mark?: boolean }[];

/** What the explainer explains: a drag of one element of a draggable. */
export type ExplainerSubject<T extends object> = {
  draggable: Draggable<T>;
  /** The draggable's canvas size */
  width: number;
  height: number;
  state: T;
  draggedId: string;
  /** How to show a state as code, marking the dragged element in it */
  formatState: (state: T) => CodeLine[];
  /**
   * Where the pointer goes in the live drag: [time, x, y], in canvas
   * coordinates. It presses at the first sample.
   */
  track: readonly (readonly [number, number, number])[];
};

// ── The script ──

const DARK_RED = "rgb(110, 30, 24)";
const GREY_ARROW = "#8e8e8e";
const MAGENTA = "rgb(200, 60, 220)";
const BORDER = "#b6b6b6";

/** Layout in stage pixels, and timing in seconds */
export const script = {
  /** How far right the model state and view start out, centered */
  panFrom: 658,
  modelBox: { x: 152, y: 258, w: 300, h: 208 },
  viewBox: { x: 152, y: 520, w: 300, h: 302 },
  /** Where the view puts its canvas's center, and at what scale */
  viewContent: { x: 296, y: 690, scale: 1 },
  /** The code boxes of the other states, left to right */
  candBox: { x: 639, y: 343, w: 224, h: 123, step: 298 },
  /** Their views, under them */
  thumbBox: { y: 520, w: 210, h: 218, scale: 0.79, contentDy: 3 },
  /** The views after they line up across the top, start state and all */
  row: { y: 65, w: 210, h: 220, step: 298, centerX: STAGE_W / 2 },
  /** The live drag's view */
  big: { x: 975, y: 717, scale: 1.95 },
  /** The grabbing cursor's offset from the element, and its size per unit */
  cursor: { dx: 25, dy: 20, scale: 2.5, liveScale: 1.35 },

  pan: [7.57, 8.09],
  cursorIn: [7.6, 7.85],
  /** The other states' code, and the arrow to it */
  candidatesIn: [8.06, 8.52],
  /** Their views, and the arrows to them */
  viewsIn: [14.8, 15.32],
  viewArrowsBlink: { start: 15.42, period: 0.6, count: 3 },
  /** Where the element lands in each view */
  targetsIn: [18.0, 18.45],
  targetsBlink: { start: 18.5, period: 0.6, count: 3 },
  /** Code, arrows and cursor go; the start view gets its target too */
  codeOut: [20.68, 21.15],
  toRow: [21.17, 21.71],
  /** Each view's target flies down to the big view, one after another */
  flights: { start: 21.72, stagger: 0.25, duration: 0.27 },
  liveIn: [23.0, 23.5],
  targetsOut: [23.62, 24.05],
  overlayIn: [23.25, 23.5],
  /** When the debug overlay goes away, mid-drag */
  overlayCut: 25.85,
} as const;

// Fit to the video
const panEase = cubicBezier(0.1, 0.1, 0.6, 1);
const moveEase = cubicBezier(0.15, 0.05, 0.55, 1);
const flightEase = cubicBezier(0.3, 0, 0.3, 1);

/** Where a view puts the canvas center, and its scale */
type Frame = { x: number; y: number; scale: number };
type Rect = { x: number; y: number; w: number; h: number };

function lerpFrame(a: Frame, b: Frame, u: number): Frame {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    scale: lerp(a.scale, b.scale, u),
  };
}

function lerpRect(a: Rect, b: Rect, u: number): Rect {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    w: lerp(a.w, b.w, u),
    h: lerp(a.h, b.h, u),
  };
}

// ── The scene ──

export function ModelDrivenScene<T extends object>({
  subject,
  t,
  drive,
}: {
  subject: ExplainerSubject<T>;
  t: number;
  /**
   * Whether to drive the live drag (dispatching pointer events to it), which
   * only works while the scene is on screen
   */
  drive: boolean;
}) {
  const { draggable, state, draggedId, width, height } = subject;
  const analysis = useMemo(
    () => analyzeDrag(draggable, state, draggedId),
    [draggable, state, draggedId],
  );
  const canvasCenter = Vec2(width / 2, height / 2);
  /** A point on the canvas, in a view with frame `f` */
  const toStage = (f: Frame, p: Vec2) =>
    Vec2(f.x, f.y).add(p.sub(canvasCenter).mul(f.scale));
  /** Half the size of the mark around where the element lands */
  const targetHalf = (f: Frame) =>
    analysis.elementHalfSize.mul(f.scale).add(Vec2(4 + 5 * f.scale));

  // The states, in the spec's order, and the ones other than the start
  const { candidates } = analysis;
  const others = candidates.filter((c) => !c.isStart);
  const startIdx = Math.max(
    0,
    candidates.findIndex((c) => c.isStart),
  );

  const s = script;
  const panX = lerp(s.panFrom, 0, eased(t, s.pan, panEase));
  const move = eased(t, s.toRow, moveEase);
  const codeOpacity = 1 - progress(t, s.codeOut);

  /** A view's box and frame in the row across the top, by spec order */
  const rowSlot = (i: number): { box: Rect; frame: Frame } => {
    const n = candidates.length;
    const cx = s.row.centerX + s.row.step * (i - (n - 1) / 2);
    const box = { x: cx - s.row.w / 2, y: s.row.y, w: s.row.w, h: s.row.h };
    return {
      box,
      frame: {
        x: cx,
        y: box.y + box.h / 2 + s.thumbBox.contentDy,
        scale: s.thumbBox.scale,
      },
    };
  };

  // The start view: big and on the left, then into the row
  const startBox0: Rect = { ...s.viewBox, x: s.viewBox.x + panX };
  const startFrame0: Frame = { ...s.viewContent, x: s.viewContent.x + panX };
  const startSlot = rowSlot(startIdx);
  const startBox = lerpRect(startBox0, startSlot.box, move);
  const startFrame = lerpFrame(startFrame0, startSlot.frame, move);

  // The other states' code boxes, and their views below
  const candRect = (j: number): Rect => ({
    x: s.candBox.x + s.candBox.step * j,
    y: s.candBox.y,
    w: s.candBox.w,
    h: s.candBox.h,
  });
  const modelLines = subject.formatState(state);
  const modelRect = fitCodeBox(
    { ...s.modelBox, x: s.modelBox.x + panX },
    modelLines,
    modelCode,
  );
  const candLines = others.map((c) => subject.formatState(c.state));
  const candRects = candLines.map((lines, j) =>
    fitCodeBox(candRect(j), lines, candCode),
  );
  const thumbAt = (j: number, i: number) => {
    const cx = s.candBox.x + s.candBox.step * j + s.candBox.w / 2;
    const box0: Rect = {
      x: cx - s.thumbBox.w / 2,
      y: s.thumbBox.y,
      w: s.thumbBox.w,
      h: s.thumbBox.h,
    };
    const frame0: Frame = {
      x: cx,
      y: box0.y + box0.h / 2 + s.thumbBox.contentDy,
      scale: s.thumbBox.scale,
    };
    const slot = rowSlot(i);
    return {
      box: lerpRect(box0, slot.box, move),
      frame: lerpFrame(frame0, slot.frame, move),
    };
  };

  const candidatesOpacity = progress(t, s.candidatesIn);
  const viewsOpacity = progress(t, s.viewsIn);
  const viewArrowsOpacity =
    viewsOpacity *
    blink(
      t,
      s.viewArrowsBlink.start,
      s.viewArrowsBlink.period,
      s.viewArrowsBlink.count,
    );
  const targetsOpacity =
    progress(t, s.targetsIn) *
    blink(t, s.targetsBlink.start, s.targetsBlink.period, s.targetsBlink.count);
  const startTargetOpacity = progress(t, s.codeOut);
  const cursorOpacity = progress(t, s.cursorIn) * codeOpacity;

  const startPos = toStage(startFrame, analysis.start.pos);

  // The big view, where targets land and the live drag happens
  const big: Frame = s.big;
  const liveOpacity = progress(t, s.liveIn);
  const flightSpan = (i: number) => {
    const start = s.flights.start + s.flights.stagger * i;
    return [start, start + s.flights.duration] as const;
  };
  const viewFrameOf = (i: number) =>
    candidates[i].isStart
      ? startFrame
      : thumbAt(others.indexOf(candidates[i]), i).frame;

  const live = t >= s.liveIn[0] - 0.2;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: STAGE_W,
        height: STAGE_H,
        background: "#fefefe",
        overflow: "hidden",
      }}
    >
      <svg
        width={STAGE_W}
        height={STAGE_H}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter
            id="md-box-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="150%"
          >
            <feDropShadow
              dx={0}
              dy={4}
              stdDeviation={4}
              floodColor="#000"
              floodOpacity={0.3}
            />
          </filter>
        </defs>

        {/* The model state, and its view */}
        <g opacity={codeOpacity}>
          <CodeBox
            rect={modelRect}
            title="Model state"
            lines={modelLines}
            style={modelCode}
            markOpacity={candidatesOpacity}
          />
        </g>
        <ViewBox
          box={startBox}
          frame={startFrame}
          canvasCenter={canvasCenter}
          layered={analysis.start.layered}
        />
        <text
          x={startBox.x + 16}
          y={startBox.y + 40}
          fontFamily={sourceSans}
          fontWeight={700}
          fontSize={36}
          opacity={codeOpacity}
        >
          View
        </text>
        <g opacity={codeOpacity}>
          <DownArrow
            x={s.modelBox.x + panX + s.modelBox.w / 2}
            y1={modelRect.y + modelRect.h - 5}
            y2={s.viewBox.y + 2}
          />
        </g>

        {/* The other states, as code */}
        {others.length > 0 && (
          <g opacity={candidatesOpacity * codeOpacity}>
            {candRects.map((rect, j) => (
              <CodeBox
                key={j}
                rect={rect}
                lines={candLines[j]}
                style={candCode}
              />
            ))}
            <GreyArrow
              from={startPos.add(
                Vec2(analysis.elementHalfSize.x * startFrame.scale + 4, 0),
              )}
              to={Vec2(
                candRects[0].x + 1,
                candRects[0].y + candRects[0].h / 2 + 5,
              )}
            />
          </g>
        )}

        {/* ...and their views */}
        <g opacity={viewsOpacity}>
          {others.map((c, j) => {
            const i = candidates.indexOf(c);
            const { box, frame } = thumbAt(j, i);
            return (
              <ViewBox
                key={j}
                box={box}
                frame={frame}
                canvasCenter={canvasCenter}
                layered={c.layered}
              />
            );
          })}
        </g>
        <g opacity={viewArrowsOpacity * codeOpacity}>
          {others.map((_c, j) => {
            const r = candRect(j);
            return (
              <DownArrow
                key={j}
                x={r.x + r.w / 2 + 1}
                y1={candRects[j].y + candRects[j].h - 5}
                y2={s.thumbBox.y + 2}
              />
            );
          })}
        </g>

        {/* Where the element lands in each view */}
        <g opacity={targetsOpacity}>
          {others.map((c, j) => {
            const { frame } = thumbAt(j, candidates.indexOf(c));
            return (
              <TargetMark
                key={j}
                center={toStage(frame, c.pos)}
                half={targetHalf(frame)}
              />
            );
          })}
        </g>
        <g opacity={startTargetOpacity}>
          <TargetMark center={startPos} half={targetHalf(startFrame)} />
        </g>

        {/* The views' backgrounds, flying down with their targets */}
        {candidates.map((c, i) => {
          const span = flightSpan(i);
          if (t < span[0]) return null;
          const u = eased(t, span, flightEase);
          const frame = lerpFrame(viewFrameOf(i), big, u);
          // The first lands as the big view's background, until the live
          // view fades in over it; the rest fade as they land
          const opacity =
            i === 0
              ? lerp(0.6, 1, u) * (1 - liveOpacity)
              : 0.6 * (1 - progress(t, [lerp(span[0], span[1], 0.6), span[1]]));
          if (opacity <= 0) return null;
          return (
            <g key={i} opacity={opacity}>
              <CanvasView
                frame={frame}
                canvasCenter={canvasCenter}
                layered={backgroundOnly(c.layered)}
              />
            </g>
          );
        })}
      </svg>

      {live && (
        <LiveDrag
          subject={subject}
          frame={big}
          t={t}
          drive={drive}
          opacity={liveOpacity}
          overlayOpacity={progress(t, s.overlayIn) * (t < s.overlayCut ? 1 : 0)}
          cursorScale={s.cursor.liveScale}
        />
      )}

      <svg
        width={STAGE_W}
        height={STAGE_H}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {/* The targets in flight, and landed */}
        <g opacity={1 - progress(t, s.targetsOut)}>
          {candidates.map((c, i) => {
            const span = flightSpan(i);
            if (t < span[0]) return null;
            const frame = lerpFrame(
              viewFrameOf(i),
              big,
              eased(t, span, flightEase),
            );
            return (
              <TargetMark
                key={i}
                center={toStage(frame, c.pos)}
                half={targetHalf(frame)}
              />
            );
          })}
        </g>

        {cursorOpacity > 0 && (
          <Cursor
            at={startPos.add(Vec2(s.cursor.dx, s.cursor.dy))}
            scale={s.cursor.scale}
            opacity={cursorOpacity}
          />
        )}
      </svg>
    </div>
  );
}

/** A state's root layer alone: what it draws besides its id'd elements */
function backgroundOnly(layered: LayeredSvgx): LayeredSvgx {
  const root = layered.byId.get("");
  return {
    byId: new Map(root ? [["", root]] : []),
    descendents: null,
  };
}

function CanvasView({
  frame,
  canvasCenter,
  layered,
}: {
  frame: Frame;
  canvasCenter: Vec2;
  layered: LayeredSvgx;
}) {
  const drawn = useMemo(() => drawLayered(layered), [layered]);
  return (
    <g
      transform={`translate(${frame.x} ${frame.y}) scale(${frame.scale}) translate(${-canvasCenter.x} ${-canvasCenter.y})`}
    >
      {drawn}
    </g>
  );
}

function ViewBox({
  box,
  frame,
  canvasCenter,
  layered,
}: {
  box: Rect;
  frame: Frame;
  canvasCenter: Vec2;
  layered: LayeredSvgx;
}) {
  return (
    <g>
      <BoxRect rect={box} />
      <CanvasView frame={frame} canvasCenter={canvasCenter} layered={layered} />
    </g>
  );
}

function BoxRect({ rect }: { rect: Rect }) {
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      rx={14}
      fill="white"
      stroke={BORDER}
      strokeWidth={2}
      filter="url(#md-box-shadow)"
    />
  );
}

type CodeStyle = {
  fontSize: number;
  lineHeight: number;
  pad: { title?: number; code: number; firstBaseline: number; bottom: number };
};

const modelCode: CodeStyle = {
  fontSize: 24,
  lineHeight: 32,
  pad: { title: 24, code: 40, firstBaseline: 98, bottom: 46 },
};

const candCode: CodeStyle = {
  fontSize: 20,
  lineHeight: 26,
  pad: { code: 21, firstBaseline: 43, bottom: 28 },
};

/** Roboto Mono's characters are all 0.6em wide */
function charWidth(style: CodeStyle) {
  return 0.6 * style.fontSize;
}

/** A code box's rect, grown right and down as needed to fit its lines */
function fitCodeBox(rect: Rect, lines: CodeLine[], style: CodeStyle): Rect {
  const cols = Math.max(
    ...lines.map((line) => line.reduce((n, seg) => n + seg.text.length, 0)),
  );
  const { pad, lineHeight } = style;
  return {
    ...rect,
    w: Math.max(rect.w, 2 * pad.code + cols * charWidth(style)),
    h: Math.max(
      rect.h,
      pad.firstBaseline + (lines.length - 1) * lineHeight + pad.bottom,
    ),
  };
}

function CodeBox({
  rect,
  title,
  lines,
  style,
  markOpacity = 1,
}: {
  rect: Rect;
  title?: string;
  lines: CodeLine[];
  style: CodeStyle;
  markOpacity?: number;
}) {
  const { fontSize, lineHeight, pad } = style;
  const charW = charWidth(style);
  return (
    <g>
      <BoxRect rect={rect} />
      {title && (
        <text
          x={rect.x + (pad.title ?? 0)}
          y={rect.y + 44}
          fontFamily={sourceSans}
          fontWeight={700}
          fontSize={36}
        >
          {title}
        </text>
      )}
      {lines.map((line, li) => {
        const x = rect.x + pad.code;
        const y = rect.y + pad.firstBaseline + li * lineHeight;
        let col = 0;
        const marks: { col: number; len: number }[] = [];
        for (const seg of line) {
          if (seg.mark) marks.push({ col, len: seg.text.length });
          col += seg.text.length;
        }
        return (
          <g key={li}>
            <text
              x={x}
              y={y}
              fontFamily={robotoMono}
              fontSize={fontSize}
              fill="#1a1a1a"
              style={{ whiteSpace: "pre" }}
            >
              {line.map((seg) => seg.text).join("")}
            </text>
            {marks.map((m, mi) => (
              <rect
                key={mi}
                x={x + m.col * charW}
                y={y + 2}
                width={m.len * charW}
                height={3}
                fill={MAGENTA}
                opacity={markOpacity}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function DownArrow({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const headH = 19;
  const headW = 22;
  return (
    <g fill={DARK_RED}>
      <rect x={x - 2} y={y1} width={4} height={y2 - y1 - headH + 1} />
      <path
        d={`M ${x - headW / 2} ${y2 - headH} L ${x + headW / 2} ${y2 - headH} L ${x} ${y2} Z`}
      />
    </g>
  );
}

/** A thick grey arrow that swells from a point, curving up and over to `to` */
function GreyArrow({ from, to }: { from: Vec2; to: Vec2 }) {
  const ctrl = Vec2(lerp(from.x, to.x, 0.33), to.y + 10);
  const at = (u: number) =>
    from
      .mul((1 - u) ** 2)
      .add(ctrl.mul(2 * u * (1 - u)))
      .add(to.mul(u ** 2));
  const tangentAt = (u: number) =>
    ctrl
      .sub(from)
      .mul(2 * (1 - u))
      .add(to.sub(ctrl).mul(2 * u))
      .norm();
  const headLen = 18;
  const headHalfW = 11;
  // The body stops where the head starts
  const n = 40;
  const uEnd = 1 - headLen / to.sub(from).len() / 1.1;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const u = (k / n) * uEnd;
    const w = 2.5 + 11.5 * Math.min(1, (u / 0.55) ** 0.8);
    const p = at(u);
    const nrm = tangentAt(u)
      .rotateDeg(90)
      .mul(w / 2);
    left.push(p.add(nrm));
    right.push(p.sub(nrm));
  }
  const body = [...left, ...right.reverse()];
  const tan = tangentAt(1);
  const base = to.sub(tan.mul(headLen));
  const side = tan.rotateDeg(90).mul(headHalfW);
  return (
    <g fill={GREY_ARROW}>
      <path d={`M ${body.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`} />
      <path
        d={`M ${base.add(side).x} ${base.add(side).y} L ${to.x} ${to.y} L ${base.sub(side).x} ${base.sub(side).y} Z`}
      />
    </g>
  );
}

/**
 * A dashed outline around where the element lands: a rounded rect with
 * fully rounded ends, so a circle around a round element.
 */
function TargetMark({ center, half }: { center: Vec2; half: Vec2 }) {
  const r = Math.min(half.x, half.y);
  const perimeter = 4 * (half.x - r) + 4 * (half.y - r) + 2 * Math.PI * r;
  // Square dashes about 7px apart, evenly round it
  const n = Math.max(8, Math.round(perimeter / 7));
  return (
    <rect
      x={center.x - half.x}
      y={center.y - half.y}
      width={2 * half.x}
      height={2 * half.y}
      rx={r}
      fill="none"
      stroke={MAGENTA}
      strokeWidth={3.6}
      pathLength={n}
      strokeDasharray="0.52 0.48"
    />
  );
}

// The grabbing cursor: macOS's closed hand, on a 24-unit grid, drawn like
// rails.tsx's cursors (outlined dark, then filled white on top, so
// overlapping parts merge into one silhouette)

const INK = "#1d1d24";
const HAND_HOTSPOT = [12.4, 14] as const;

const closedHand = (
  <g>
    <path d="M6.8 10.6 L20.4 10.6 Q21.8 10.6 21.6 12.6 L20.8 17.2 Q20 21.4 15.4 21.8 L12.2 21.8 Q8.6 21.5 7.6 18.4 Z" />
    {[8.6, 11.8, 15, 18.2].map((cx, i) => (
      <rect
        key={cx}
        x={cx - 1.6}
        y={i === 3 ? 8.6 : 8}
        width={3.2}
        height={5.6}
        rx={1.6}
      />
    ))}
    <rect
      x={2.6}
      y={10.9}
      width={6.6}
      height={3.4}
      rx={1.7}
      transform="rotate(15 8.6 12.6)"
    />
  </g>
);

function Cursor({
  at,
  scale,
  opacity = 1,
}: {
  at: Vec2;
  scale: number;
  opacity?: number;
}) {
  const [hx, hy] = HAND_HOTSPOT;
  return (
    <g
      transform={`translate(${at.x} ${at.y}) scale(${scale}) translate(${-hx} ${-hy})`}
      opacity={opacity}
      style={{
        filter:
          "drop-shadow(0 3px 4px rgba(0,0,0,0.38)) drop-shadow(0 0 1px rgba(0,0,0,0.25))",
      }}
    >
      <g
        fill={INK}
        stroke={INK}
        strokeWidth={2.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {closedHand}
      </g>
      <g fill="white">{closedHand}</g>
      <g stroke={INK} strokeWidth={1.15} strokeLinecap="round">
        {[12, 14.8, 17.6].map((x) => (
          <line key={x} x1={x} y1={14.4} x2={x} y2={18.2} />
        ))}
      </g>
    </g>
  );
}

// ── The live drag ──

/** The pointer's position on the canvas at time t, along a track */
function pointerAt(track: ExplainerSubject<object>["track"], t: number): Vec2 {
  if (t <= track[0][0]) return Vec2(track[0][1], track[0][2]);
  for (let k = 1; k < track.length; k++) {
    const [t1, x1, y1] = track[k];
    if (t <= t1) {
      const [t0, x0, y0] = track[k - 1];
      const u = linear((t - t0) / (t1 - t0));
      return Vec2(lerp(x0, x1, u), lerp(y0, y1, u));
    }
  }
  const last = track[track.length - 1];
  return Vec2(last[1], last[2]);
}

/**
 * The draggable, live, in the big view, dragged along the subject's track by
 * synthetic pointer events (as rails.tsx plays recorded tracks). Going back in
 * time starts it over.
 */
function LiveDrag<T extends object>({
  subject,
  frame,
  t,
  drive,
  opacity,
  overlayOpacity,
  cursorScale,
}: {
  subject: ExplainerSubject<T>;
  frame: Frame;
  t: number;
  drive: boolean;
  opacity: number;
  overlayOpacity: number;
  cursorScale: number;
}) {
  const { draggable, state, width, height, track } = subject;
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<DragStatus<T> | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const played = useRef({ generation: -1, t: -Infinity, down: false });
  // The renderer takes a frame after mounting to be ready for a press
  const [ready, setReady] = useState(-1);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(generation));
    return () => cancelAnimationFrame(raf);
  }, [generation]);

  const origin = Vec2(
    frame.x - (width / 2) * frame.scale,
    frame.y - (height / 2) * frame.scale,
  );
  const pointer = pointerAt(track, t);

  // Each new time, dispatch what's due. (Only on new times: the renderer
  // reports each move back through onDragStatus, re-rendering this.)
  useLayoutEffect(() => {
    if (played.current.generation !== generation) {
      played.current = { generation, t: -Infinity, down: false };
    }
    const p = played.current;
    const host = hostRef.current;
    if (!drive || !host || ready !== generation || t === p.t) return;
    if (t < p.t) {
      // Back in time: start over, from a fresh mount
      setStatus(null);
      setGeneration((g) => g + 1);
      return;
    }
    if (t < track[0][0]) {
      p.t = t;
      return;
    }
    // The host is the stage, scaled however the page scales it
    const stage = host.parentElement!;
    const rect = stage.getBoundingClientRect();
    const toClient = (c: Vec2) => {
      const sp = origin.add(c.mul(frame.scale));
      return Vec2(
        rect.left + (sp.x / STAGE_W) * rect.width,
        rect.top + (sp.y / STAGE_H) * rect.height,
      );
    };
    const init = (client: Vec2, buttons: number, button: number) => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: client.x,
      clientY: client.y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button,
      buttons,
    });
    if (!p.down) {
      const client = toClient(Vec2(track[0][1], track[0][2]));
      const under = document.elementFromPoint(client.x, client.y);
      // (Not there yet? Try again next time.)
      if (!under || !host.contains(under)) return;
      under.dispatchEvent(new PointerEvent("pointerdown", init(client, 1, 0)));
      p.down = true;
      p.t = t;
      // Moves wait for the next time, once the renderer listens for them
      return;
    }
    p.t = t;
    document.dispatchEvent(
      new PointerEvent("pointermove", init(toClient(pointer), 1, -1)),
    );
    // The rest follows from these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, generation, ready, drive]);

  // Let go on leaving, so the drag doesn't hang on to the real pointer
  useLayoutEffect(() => {
    if (drive) return;
    const p = played.current;
    if (!p.down) return;
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        buttons: 0,
      }),
    );
    p.down = false;
  }, [drive]);

  const transform = `translate(${origin.x} ${origin.y}) scale(${frame.scale})`;
  // Mid-drag, the cursor goes where the renderer last saw the pointer, so it
  // keeps up with what's drawn (the renderer catches up a frame or so later)
  const shownPointer =
    (status?.type === "dragging" && status.result.op.lastFrame?.pointer) ||
    pointer;
  return (
    <>
      <div
        ref={hostRef}
        style={{
          position: "absolute",
          left: origin.x,
          top: origin.y,
          transform: `scale(${frame.scale})`,
          transformOrigin: "0 0",
          opacity,
        }}
      >
        <DraggableRenderer
          key={generation}
          draggable={draggable}
          initialState={state}
          width={width}
          height={height}
          dragThreshold={0}
          onDragStatus={setStatus}
        />
      </div>
      <svg
        width={STAGE_W}
        height={STAGE_H}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {status?.type === "dragging" && overlayOpacity > 0 && (
          <g transform={transform} opacity={overlayOpacity}>
            <OverlayVis op={status.result.op} />
          </g>
        )}
        {t >= track[0][0] - 0.25 && (
          <Cursor
            at={origin.add(shownPointer.mul(frame.scale))}
            scale={cursorScale}
            opacity={opacity}
          />
        )}
      </svg>
    </>
  );
}
