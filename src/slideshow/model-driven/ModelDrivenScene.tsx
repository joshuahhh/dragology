// An animated explainer of model-driven dragging, for any draggable: the
// model state and its view; the states the dragged element's drag spec
// offers, and their views; where the element lands in each; and then the
// drag itself, live, with the debug overlay. Everything but the live drag is
// a pure function of the time `t`. The script (layout and timing) is laid out
// to match model-driven-full.mp4, the hand-made video this replaces, second
// for second.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Draggable } from "../../draggable";
import { DraggableRenderer, type DragStatus } from "../../DraggableRenderer";
import { Vec2 } from "../../math/vec2";
import { OverlayVis } from "../../OverlayVis";
import { drawLayered, LayeredSvgx } from "../../svgx/layers";
import { highlightColors } from "../../talk/highlightStyles";
import { robotoMono } from "../roboto-mono";
import { STAGE_H, STAGE_W } from "../slide";
import { sourceSans } from "../source-sans";
import { analyzeDrag } from "./analyze";
import {
  blink,
  cubicBezier,
  eased,
  easeInOut,
  lerp,
  linear,
  progress,
} from "./anim";

/** A line of code, in segments; marked segments are underlined. */
export type CodeLine = {
  text: string;
  mark?: boolean;
  color?: string;
  bold?: boolean;
}[];

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
   * Where the pointer goes in the live drag: [time, x, y, down?], in canvas
   * coordinates. It's pressed from each sample on to the next whose `down`
   * says otherwise (pressed if left out), so a track without any presses at
   * its first sample and never lets go.
   */
  track: readonly (readonly [number, number, number, boolean?])[];
  /**
   * If set, the drag never ends: past the track's end, the pointer heads back
   * to where it was at this time and goes round again from there
   */
  loopFrom?: number;
};

/** How long the pointer takes to get back to the loop's start */
const LOOP_RETURN = 0.3;

// ── The script ──

const DARK_RED = "rgb(110, 30, 24)";
const GREY_ARROW = "#8e8e8e";
const MAGENTA = "rgb(200, 60, 220)";
const BORDER = "#b6b6b6";

/** Layout in stage pixels, and timing in seconds */
export const script = {
  /** How far right the model state and view start out, centered */
  panFrom: 658,
  modelBox: { x: 152, y: 286, w: 300, h: 150 },
  /** The view of the model state: a thumbnail's box and content, scaled up
   * to this width */
  viewBox: { x: 152, y: 520, w: 300 },
  /** The code boxes of the other states, left to right */
  candBox: { x: 639, y: 313, w: 224, h: 123, step: 298 },
  /** Their views, under them */
  thumbBox: { y: 520, w: 210, h: 218, scale: 0.79, contentDy: 3 },
  /** The views after they line up across the top, start state and all */
  row: { y: 65, w: 210, h: 220, step: 298, centerX: STAGE_W / 2 },
  /** The live drag's view */
  big: { x: 975, y: 717, scale: 1.95 },
  /** ...and where it moves to when set aside, with the rest gone */
  bigAside: { x: 560, y: 540, scale: 2.4 },
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
  /** First everything else fades from the views, leaving the element alone */
  othersOut: [18.0, 18.45],
  /** Then, view by view, it bounces, and gets its halo */
  bounces: { start: 18.55, stagger: 0.22, duration: 0.4, scale: 1.3 },
  /** Code, arrows and cursor go */
  codeOut: [20.68, 21.15],
  toRow: [21.17, 21.71],
  /** Each view, now just its element, flies down to the big view, one after
   * another */
  flights: { start: 21.72, stagger: 0.25, duration: 0.27 },
  /** The landed elements go, leaving their halos to mark where they were */
  landedOut: [23.0, 23.25],
  liveIn: [23.2, 23.6],
  overlayIn: [23.45, 23.7],
  /** ...and then the halos go too */
  targetsOut: [23.8, 24.2],
  /** When the debug overlay goes away, mid-drag */
  overlayCut: 25.85,
} as const;

// Fit to the video
const panEase = cubicBezier(0.1, 0.1, 0.6, 1);
const moveEase = cubicBezier(0.15, 0.05, 0.55, 1);
const flightEase = cubicBezier(0.3, 0, 0.3, 1);

/** Where a view puts the canvas center, and its scale */
export type Frame = { x: number; y: number; scale: number };
type Rect = { x: number; y: number; w: number; h: number };

export function lerpFrame(a: Frame, b: Frame, u: number): Frame {
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
  aside = 0,
  arrival,
}: {
  subject: ExplainerSubject<T>;
  t: number;
  /**
   * Whether to drive the live drag (dispatching pointer events to it), which
   * only works while the scene is on screen
   */
  drive: boolean;
  /**
   * How far (0 to 1) the live drag has moved over to the left, alone, to
   * make room for something on the right
   */
  aside?: number;
  /**
   * Where the start view's canvas comes in from, and how far (0 to 1) it's
   * come to its place, as everything else fades in around it
   */
  arrival?: { from: Frame; u: number };
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
  // The states, in the spec's order, and the ones other than the start
  const { candidates } = analysis;
  /** Each state's view, split so the dragged element can be singled out */
  const parts = useMemo(
    () => candidates.map((c) => splitLayers(c.layered, draggedId)),
    [candidates, draggedId],
  );
  const others = candidates.filter((c) => !c.isStart);
  const startIdx = Math.max(
    0,
    candidates.findIndex((c) => c.isStart),
  );

  const s = script;
  const panX = lerp(s.panFrom, 0, eased(t, s.pan, panEase));
  const move = eased(t, s.toRow, moveEase);
  const arriveU = arrival?.u ?? 1;
  const codeOpacity = (1 - progress(t, s.codeOut)) * arriveU;

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
  const viewScale = s.viewBox.w / s.thumbBox.w;
  const startBox0: Rect = {
    x: s.viewBox.x + panX,
    y: s.viewBox.y,
    w: s.viewBox.w,
    h: s.thumbBox.h * viewScale,
  };
  const startFrameHome: Frame = {
    x: startBox0.x + startBox0.w / 2,
    y: startBox0.y + startBox0.h / 2 + s.thumbBox.contentDy * viewScale,
    scale: s.thumbBox.scale * viewScale,
  };
  const startFrame0 = arrival
    ? lerpFrame(arrival.from, startFrameHome, arrival.u)
    : startFrameHome;
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
  const othersOpacity = 1 - progress(t, s.othersOut);
  /** The views bounce in order: the start view, then the others */
  const bounceSpan = (i: number) => {
    const k = candidates[i].isStart ? 0 : others.indexOf(candidates[i]) + 1;
    const start = s.bounces.start + s.bounces.stagger * k;
    return [start, start + s.bounces.duration] as const;
  };
  const bounceOf = (i: number): Bounce => ({
    at: candidates[i].pos,
    scale:
      1 +
      (s.bounces.scale - 1) * Math.sin(Math.PI * progress(t, bounceSpan(i))),
  });
  const haloOpacityOf = (i: number) => {
    const [start] = bounceSpan(i);
    return progress(t, [start, start + 0.12]);
  };
  const cursorOpacity = progress(t, s.cursorIn) * codeOpacity;

  const startPos = toStage(startFrame, analysis.start.pos);

  // The big view, where targets land and the live drag happens
  const big: Frame = lerpFrame(s.big, s.bigAside, aside);
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
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 1 - aside,
        }}
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
          <HaloFilter />
        </defs>

        {/* The model state, and its view */}
        <g opacity={codeOpacity}>
          <Label rect={modelRect}>Model state</Label>
          <CodeBox
            rect={modelRect}
            lines={modelLines}
            style={modelCode}
            markOpacity={candidatesOpacity}
          />
          <Label rect={startBox} below>
            View
          </Label>
        </g>
        <ViewBox
          box={startBox}
          frame={startFrame}
          canvasCenter={canvasCenter}
          parts={parts[startIdx]}
          othersOpacity={othersOpacity}
          bounce={bounceOf(startIdx)}
          boxOpacity={arriveU}
        />
        <g opacity={codeOpacity}>
          <DownArrow
            x={s.modelBox.x + panX + s.modelBox.w / 2}
            y1={modelRect.y + modelRect.h - 5}
            y2={s.viewBox.y + 2}
            label="render"
          />
        </g>

        {/* The other states, as code */}
        {others.length > 0 && (
          <g opacity={candidatesOpacity * codeOpacity}>
            <Label
              rect={{
                ...candRects[0],
                y: Math.min(...candRects.map((r) => r.y)),
              }}
            >
              Accessible model states
            </Label>
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
                parts={parts[i]}
                othersOpacity={othersOpacity}
                bounce={bounceOf(i)}
              />
            );
          })}
          {others.length > 0 && (
            <g opacity={codeOpacity}>
              <Label rect={thumbAt(0, candidates.indexOf(others[0])).box} below>
                Speculatively rendered views
              </Label>
            </g>
          )}
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
        {candidates.map((_c, i) => (
          <g key={i} opacity={haloOpacityOf(i)}>
            <TargetHalo
              frame={viewFrameOf(i)}
              canvasCenter={canvasCenter}
              layered={parts[i].dragged}
              bounce={bounceOf(i)}
            />
          </g>
        ))}

        {/* Each view's background and element, flying down to the big view */}
        {candidates.map((_c, i) => {
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
          return (
            <g key={i}>
              {opacity > 0 && (
                <g opacity={opacity}>
                  <CanvasView
                    frame={frame}
                    canvasCenter={canvasCenter}
                    layered={parts[i].background}
                  />
                </g>
              )}
              <g opacity={1 - progress(t, s.landedOut)}>
                <CanvasView
                  frame={frame}
                  canvasCenter={canvasCenter}
                  layered={parts[i].dragged}
                />
              </g>
            </g>
          );
        })}

        {/* Their halos in flight, and landed: under the live view, so they
            glow around its elements */}
        <g opacity={1 - progress(t, s.targetsOut)}>
          {candidates.map((_c, i) => {
            const span = flightSpan(i);
            if (t < span[0]) return null;
            const frame = lerpFrame(
              viewFrameOf(i),
              big,
              eased(t, span, flightEase),
            );
            return (
              <TargetHalo
                key={i}
                frame={frame}
                canvasCenter={canvasCenter}
                layered={parts[i].dragged}
              />
            );
          })}
        </g>
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

/**
 * A state's view in three parts: its root layer (what it draws besides its
 * id'd elements), the dragged element (with any id'd elements inside it),
 * and everything else
 */
type ViewParts = {
  background: LayeredSvgx;
  dragged: LayeredSvgx;
  others: LayeredSvgx;
};

function splitLayers(layered: LayeredSvgx, draggedId: string): ViewParts {
  const mine = new Set([
    draggedId,
    ...(layered.descendents?.get(draggedId) ?? []),
  ]);
  const pick = (keep: (id: string) => boolean): LayeredSvgx => ({
    byId: new Map([...layered.byId].filter(([id]) => keep(id))),
    descendents: null,
  });
  return {
    background: pick((id) => id === ""),
    dragged: pick((id) => mine.has(id)),
    others: pick((id) => id !== "" && !mine.has(id)),
  };
}

/** A scaling about a point on the canvas, for a bounce */
type Bounce = { at: Vec2; scale: number };

function bounceTransform(bounce: Bounce | undefined) {
  if (!bounce || bounce.scale === 1) return undefined;
  const { at, scale } = bounce;
  return `translate(${at.x} ${at.y}) scale(${scale}) translate(${-at.x} ${-at.y})`;
}

function CanvasView({
  frame,
  canvasCenter,
  layered,
  bounce,
}: {
  frame: Frame;
  canvasCenter: Vec2;
  layered: LayeredSvgx;
  bounce?: Bounce;
}) {
  const drawn = useMemo(() => drawLayered(layered), [layered]);
  return (
    <g
      transform={`translate(${frame.x} ${frame.y}) scale(${frame.scale}) translate(${-canvasCenter.x} ${-canvasCenter.y})`}
    >
      <g transform={bounceTransform(bounce)}>{drawn}</g>
    </g>
  );
}

function ViewBox({
  box,
  frame,
  canvasCenter,
  parts,
  othersOpacity,
  bounce,
  boxOpacity = 1,
}: {
  box: Rect;
  frame: Frame;
  canvasCenter: Vec2;
  parts: ViewParts;
  othersOpacity: number;
  bounce: Bounce;
  boxOpacity?: number;
}) {
  const view = { frame, canvasCenter };
  return (
    <g>
      <g opacity={boxOpacity}>
        <BoxRect rect={box} />
      </g>
      <CanvasView {...view} layered={parts.background} />
      {othersOpacity > 0 && (
        <g opacity={othersOpacity}>
          <CanvasView {...view} layered={parts.others} />
        </g>
      )}
      <CanvasView {...view} layered={parts.dragged} bounce={bounce} />
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

/**
 * A box's name, just above its top-left corner (code boxes), or just below
 * its bottom-left corner (views, whose tops the arrows come in at)
 */
function Label({
  rect,
  below = false,
  children,
}: {
  rect: Rect;
  below?: boolean;
  children: string;
}) {
  return (
    <text
      x={rect.x + 4}
      y={below ? rect.y + rect.h + 46 : rect.y - 14}
      fontFamily={sourceSans}
      fontWeight={700}
      fontSize={44}
    >
      {children}
    </text>
  );
}

type CodeStyle = {
  fontSize: number;
  lineHeight: number;
  pad: { code: number; firstBaseline: number; bottom: number };
};

const modelCode: CodeStyle = {
  fontSize: 24,
  lineHeight: 32,
  pad: { code: 40, firstBaseline: 52, bottom: 34 },
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

/**
 * A code box's rect, grown right and up as needed to fit its lines (up, so
 * the arrow below it keeps its length)
 */
function fitCodeBox(rect: Rect, lines: CodeLine[], style: CodeStyle): Rect {
  const cols = Math.max(
    ...lines.map((line) => line.reduce((n, seg) => n + seg.text.length, 0)),
  );
  const { pad, lineHeight } = style;
  const h = Math.max(
    rect.h,
    pad.firstBaseline + (lines.length - 1) * lineHeight + pad.bottom,
  );
  return {
    x: rect.x,
    y: rect.y + rect.h - h,
    w: Math.max(rect.w, 2 * pad.code + cols * charWidth(style)),
    h,
  };
}

function CodeBox({
  rect,
  lines,
  style,
  markOpacity = 1,
}: {
  rect: Rect;
  lines: CodeLine[];
  style: CodeStyle;
  markOpacity?: number;
}) {
  const { fontSize, lineHeight, pad } = style;
  const charW = charWidth(style);
  return (
    <g>
      <BoxRect rect={rect} />
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
              {line.map((seg, si) => (
                <tspan
                  key={si}
                  fill={seg.color}
                  fontWeight={seg.bold ? 700 : seg.color ? 500 : undefined}
                >
                  {seg.text}
                </tspan>
              ))}
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

/**
 * A maroon arrow straight down, with an optional label to the left of its
 * middle (the grey arrow sweeps up past its right)
 */
function DownArrow({
  x,
  y1,
  y2,
  label,
}: {
  x: number;
  y1: number;
  y2: number;
  label?: string;
}) {
  const headH = 19;
  const headW = 22;
  return (
    <g fill={DARK_RED}>
      <rect x={x - 2} y={y1} width={4} height={y2 - y1 - headH + 1} />
      <path
        d={`M ${x - headW / 2} ${y2 - headH} L ${x + headW / 2} ${y2 - headH} L ${x} ${y2} Z`}
      />
      {label && (
        <text
          x={x - 16}
          y={(y1 + y2) / 2}
          textAnchor="end"
          dominantBaseline="central"
          fontFamily={sourceSans}
          fontStyle="italic"
          fontSize={36}
        >
          {label}
        </text>
      )}
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
  // The body runs a little way into the head, so no seam shows between them
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).sub(to).len() > headLen - 4) lo = mid;
    else hi = mid;
  }
  const uEnd = lo;
  const n = 40;
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

const HALO_FILTER_ID = "md-halo";

/**
 * The live-code slide's "halo fill" highlight (LiveCodePage's HaloFilter):
 * a silhouette grown by GAP, in translucent magenta. Unlike there, it draws
 * the halo alone, without the element, so it can fly on its own. And it
 * grows the silhouette by blurring it and cutting the blur off at a low
 * alpha, not with feMorphology, whose square kernel squares off big round
 * shapes.
 */
function HaloFilter() {
  const GAP = 5;
  const FILL_OPACITY = 0.3;
  // A straight edge's blur falls to 5% alpha 1.645σ out
  const sigma = GAP / 1.645;
  const CUTOFF = 0.05;
  // Ramp from 0 to 1 over alpha CUTOFF ± 0.02, for a crisp but smooth edge
  const slope = 1 / 0.04;
  return (
    <filter id={HALO_FILTER_ID} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={sigma} />
      <feComponentTransfer result="grown">
        <feFuncA type="linear" slope={slope} intercept={0.5 - slope * CUTOFF} />
      </feComponentTransfer>
      <feFlood
        floodColor={highlightColors[0].color}
        floodOpacity={FILL_OPACITY}
        result="color"
      />
      <feComposite in="color" in2="grown" operator="in" />
    </filter>
  );
}

/**
 * Where the element lands: its halo, in a view with frame `frame`. The
 * filter goes inside the view's scaling, so the halo scales with the view.
 */
function TargetHalo({
  frame,
  canvasCenter,
  layered,
  bounce,
}: {
  frame: Frame;
  canvasCenter: Vec2;
  layered: LayeredSvgx;
  bounce?: Bounce;
}) {
  const drawn = useMemo(() => drawLayered(layered), [layered]);
  return (
    <g
      transform={`translate(${frame.x} ${frame.y}) scale(${frame.scale}) translate(${-canvasCenter.x} ${-canvasCenter.y})`}
    >
      <g transform={bounceTransform(bounce)}>
        <g filter={`url(#${HALO_FILTER_ID})`}>{drawn}</g>
      </g>
    </g>
  );
}

// The grabbing cursor: macOS's own closed hand, and the open hand it shows
// over things it could grab, traced from the system's cursor art
// (HIServices.framework's cursors/closedhand/cursor.pdf and
// cursors/openhand/cursor.pdf), in their 32-point space. They share creases.

const INK = "#1d1d24";
const HAND_HOTSPOT = [16, 16] as const;
/** The art is drawn this much bigger than macOS draws it at scale 1 */
const HAND_ART_SCALE = 1.35;
const HAND_OUTLINE =
  "M 12.57 13.04 C 13.05 12.86 14 12.97 14.25 13.51 C 14.46 13.97 14.64 14.75 14.66 14.59 C 14.68 14.21 14.63 13.42 14.79 13 C 14.91 12.7 15.14 12.41 15.48 12.31 C 15.77 12.22 16.1 12.19 16.39 12.25 C 16.71 12.32 17.04 12.54 17.16 12.75 C 17.52 13.38 17.53 14.65 17.55 14.59 C 17.61 14.31 17.61 13.36 17.83 13 C 17.97 12.77 18.32 12.55 18.52 12.52 C 18.81 12.47 19.17 12.45 19.48 12.51 C 19.73 12.56 20.07 12.86 20.16 13 C 20.38 13.34 20.5 14.32 20.54 14.66 C 20.55 14.8 20.61 14.27 20.83 13.92 C 21.23 13.28 22.67 13.16 22.73 14.56 C 22.75 15.21 22.75 15.18 22.75 15.62 C 22.75 16.14 22.73 16.45 22.71 16.83 C 22.68 17.23 22.59 18.13 22.46 18.57 C 22.38 18.87 22.09 19.55 21.81 19.95 C 21.81 19.95 20.74 21.2 20.62 21.77 C 20.5 22.33 20.54 22.33 20.52 22.73 C 20.5 23.13 20.64 23.65 20.64 23.65 C 20.64 23.65 19.84 23.76 19.41 23.69 C 19.02 23.62 18.53 22.85 18.41 22.61 C 18.23 22.28 17.87 22.34 17.72 22.59 C 17.5 22.97 17.02 23.66 16.68 23.7 C 16 23.78 14.62 23.73 13.54 23.72 C 13.54 23.72 13.72 22.71 13.31 22.36 C 13 22.1 12.48 21.58 12.16 21.3 L 11.33 20.38 C 11.05 20.02 10.33 19.45 10.09 18.39 C 9.88 17.46 9.89 17 10.12 16.62 C 10.36 16.24 10.8 16.04 10.98 16 C 11.19 15.96 11.67 15.96 11.86 16.06 C 12.08 16.18 12.17 16.22 12.34 16.45 C 12.57 16.76 12.65 16.91 12.55 16.57 C 12.48 16.31 12.23 15.98 12.12 15.61 C 12.01 15.24 11.72 14.66 11.74 14.08 C 11.75 13.86 11.84 13.31 12.57 13.04";
const OPEN_HAND_OUTLINE =
  "M 12.55 16.57 C 12.46 16.2 12.36 15.73 12.15 15.02 C 11.98 14.46 11.81 14.16 11.68 13.79 C 11.52 13.34 11.38 13.07 11.18 12.61 C 11.04 12.28 10.82 11.56 10.73 11.17 C 10.61 10.66 10.76 10.25 10.97 9.96 C 11.22 9.62 11.93 9.47 12.33 9.61 C 12.7 9.74 13.07 10.12 13.24 10.4 C 13.53 10.86 13.6 11.03 13.96 11.94 C 14.36 12.93 14.52 13.86 14.57 14.17 L 14.66 14.63 C 14.66 14.59 14.61 13.5 14.61 13.46 C 14.58 12.43 14.55 11.64 14.57 10.52 C 14.58 10.4 14.64 9.94 14.66 9.81 C 14.74 9.31 14.96 9.01 15.33 8.83 C 15.74 8.63 16.26 8.61 16.73 8.81 C 17.16 8.98 17.36 9.36 17.42 9.84 C 17.43 9.94 17.52 10.82 17.51 10.94 C 17.5 11.96 17.52 12.58 17.53 13.11 C 17.53 13.35 17.53 14.74 17.54 14.59 C 17.61 13.93 17.64 11.39 17.89 10.64 C 18.03 10.21 18.29 9.89 18.68 9.71 C 19.11 9.51 19.8 9.64 20.09 9.96 C 20.37 10.26 20.53 10.65 20.57 11.11 C 20.6 11.52 20.55 12.01 20.55 12.36 C 20.55 13.22 20.53 13.68 20.51 14.48 C 20.51 14.51 20.5 14.77 20.54 14.66 C 20.63 14.38 20.72 14.11 20.8 13.91 C 20.85 13.79 21.04 13.3 21.16 13.05 C 21.27 12.82 21.37 12.68 21.57 12.36 C 21.77 12.05 21.99 11.92 22.24 11.8 C 22.78 11.57 23.35 11.92 23.54 12.39 C 23.63 12.61 23.55 13.11 23.52 13.5 C 23.45 14.15 23.26 14.8 23.16 15.15 C 23.04 15.59 22.89 16.38 22.82 16.75 C 22.75 17.14 22.59 18.13 22.46 18.57 C 22.38 18.87 22.09 19.55 21.81 19.95 C 21.81 19.95 20.74 21.2 20.62 21.77 C 20.5 22.33 20.54 22.33 20.52 22.73 C 20.5 23.13 20.64 23.65 20.64 23.65 C 20.64 23.65 19.84 23.76 19.41 23.69 C 19.02 23.62 18.53 22.85 18.41 22.61 C 18.23 22.28 17.87 22.34 17.73 22.59 C 17.5 22.97 17.02 23.66 16.67 23.7 C 16 23.78 14.62 23.73 13.54 23.72 C 13.54 23.72 13.72 22.71 13.31 22.36 C 13 22.1 12.48 21.58 12.16 21.3 L 11.33 20.38 C 11.05 20.02 10.7 19.29 10.09 18.39 C 9.74 17.89 9.06 17.31 8.8 16.82 C 8.58 16.39 8.47 15.86 8.61 15.49 C 8.84 14.9 9.29 14.59 9.98 14.66 C 10.5 14.71 10.82 14.86 11.21 15.2 C 11.44 15.39 11.79 15.73 11.96 15.95 C 12.13 16.14 12.17 16.22 12.34 16.45 C 12.57 16.76 12.64 16.91 12.55 16.57";
const HAND_CREASES: [number, number, number, number][] = [
  [15.55, 17.3, 15.57, 20.73],
  [17.55, 20.75, 17.54, 17.27],
  [19.57, 20.73, 19.57, 17.28],
];

/** The closed hand, filled white, in the stroke it's given */
export function MacClosedHand() {
  return <MacHand outline={HAND_OUTLINE} />;
}

function MacHand({ outline }: { outline: string }) {
  return (
    <g>
      <path d={outline} fill="white" strokeLinejoin="round" />
      {HAND_CREASES.map(([x1, y1, x2, y2]) => (
        <line key={x1} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" />
      ))}
    </g>
  );
}

export function Cursor({
  at,
  scale,
  opacity = 1,
  open = false,
}: {
  at: Vec2;
  scale: number;
  opacity?: number;
  /** The open hand, rather than the closed one */
  open?: boolean;
}) {
  const [hx, hy] = HAND_HOTSPOT;
  return (
    <g
      transform={`translate(${at.x} ${at.y}) scale(${scale * HAND_ART_SCALE}) translate(${-hx} ${-hy})`}
      opacity={opacity}
      style={{
        filter:
          "drop-shadow(0 3px 4px rgba(0,0,0,0.38)) drop-shadow(0 0 1px rgba(0,0,0,0.25))",
      }}
      stroke={INK}
      strokeWidth={0.75}
    >
      {open ? <MacHand outline={OPEN_HAND_OUTLINE} /> : <MacClosedHand />}
    </g>
  );
}

// ── The live drag ──

/** The pointer's position on the canvas at time t, along a track */
function pointerAt(
  track: ExplainerSubject<object>["track"],
  loopFrom: number | undefined,
  t: number,
): Vec2 {
  const end = track[track.length - 1][0];
  if (loopFrom !== undefined && t > end) {
    const lap = end - loopFrom + LOOP_RETURN;
    const into = (t - end) % lap;
    if (into < LOOP_RETURN) {
      const u = easeInOut(into / LOOP_RETURN);
      return pointerAt(track, undefined, end).lerp(
        pointerAt(track, undefined, loopFrom),
        u,
      );
    }
    return pointerAt(track, undefined, loopFrom + into - LOOP_RETURN);
  }
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

/** Whether the pointer's pressed at time t, along a track */
function downAt(
  track: ExplainerSubject<object>["track"],
  loopFrom: number | undefined,
  t: number,
): boolean {
  const end = track[track.length - 1][0];
  if (loopFrom !== undefined && t > end) {
    const lap = end - loopFrom + LOOP_RETURN;
    const into = (t - end) % lap;
    // On the way back to the loop's start, as it was at the end
    if (into < LOOP_RETURN) return downAt(track, undefined, end);
    return downAt(track, undefined, loopFrom + into - LOOP_RETURN);
  }
  let down = track[0][3] ?? true;
  for (const sample of track) {
    if (sample[0] > t) break;
    down = sample[3] ?? true;
  }
  return down;
}

/**
 * The draggable, live, in the big view, dragged along the subject's track by
 * synthetic pointer events (as rails.tsx plays recorded tracks). Going back in
 * time starts it over.
 *
 * The real pointer can't nudge the scripted drag, but pressing it on the stage
 * takes over: the scripted drag lets go and stops, and the press starts a drag
 * of the viewer's own.
 */
export function LiveDrag<T extends object>({
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
  const { draggable, state, width, height, track, loopFrom } = subject;
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<DragStatus<T> | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const played = useRef({
    generation: -1,
    t: -Infinity,
    down: false,
    /** Where the last event put the pointer, in client coordinates */
    client: Vec2(0, 0),
    /** Where the scripted drag last pressed, in client coordinates */
    pressedAt: Vec2(0, 0),
  });
  const [takenOver, setTakenOver] = useState(false);
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
  const pointer = pointerAt(track, loopFrom, t);
  const down = downAt(track, loopFrom, t);
  /** Where a point on the canvas is on the page */
  const toClient = (c: Vec2) => {
    // The host is on the stage, scaled however the page scales it
    const rect = hostRef.current!.parentElement!.getBoundingClientRect();
    const sp = origin.add(c.mul(frame.scale));
    return Vec2(
      rect.left + (sp.x / STAGE_W) * rect.width,
      rect.top + (sp.y / STAGE_H) * rect.height,
    );
  };

  // Each new time, dispatch what's due. (Only on new times: the renderer
  // reports each move back through onDragStatus, re-rendering this.)
  useLayoutEffect(() => {
    if (played.current.generation !== generation) {
      played.current = {
        generation,
        t: -Infinity,
        down: false,
        client: Vec2(0, 0),
        pressedAt: Vec2(0, 0),
      };
    }
    const p = played.current;
    const host = hostRef.current;
    if (!drive || !host || ready !== generation || t === p.t) return;
    if (t < p.t) {
      // Back in time: start over, from a fresh mount
      setStatus(null);
      setTakenOver(false);
      setGeneration((g) => g + 1);
      return;
    }
    if (takenOver) return;
    if (t < track[0][0]) {
      p.t = t;
      return;
    }
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
    if (down && !p.down) {
      const client = toClient(pointer);
      const under = document.elementFromPoint(client.x, client.y);
      // (Not there yet? Try again next time.)
      if (!under || !host.contains(under)) return;
      under.dispatchEvent(new PointerEvent("pointerdown", init(client, 1, 0)));
      p.down = true;
      p.client = client;
      p.pressedAt = client;
      p.t = t;
      // Moves wait for the next time, once the renderer listens for them
      return;
    }
    p.t = t;
    if (!down) {
      if (p.down) letGo();
      return;
    }
    p.client = toClient(pointer);
    document.dispatchEvent(
      new PointerEvent("pointermove", init(p.client, 1, -1)),
    );
    // The rest follows from these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, generation, ready, drive, takenOver]);

  const letGo = (client = played.current.client) => {
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: client.x,
        clientY: client.y,
        pointerId: 1,
        buttons: 0,
      }),
    );
    played.current.down = false;
  };

  // Let go on leaving, so the drag doesn't hang on to the real pointer. It
  // lets go where it pressed, so the element settles back into its place and
  // the state is the one the drag started in, as the next slide shows it.
  useLayoutEffect(() => {
    if (!drive && played.current.down) letGo(played.current.pressedAt);
    // Only on leaving
  }, [drive]);

  // While the scripted drag holds on, the renderer hears only it: real moves
  // and releases are kept from it. A real press on the stage takes over,
  // letting go of any scripted drag and re-rendering at once so the press
  // lands on the dropped state's elements. Presses off the stage (on the
  // notes, say) leave it be.
  useEffect(() => {
    const onReal = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      if (e.type === "pointerdown") {
        const stage = hostRef.current?.parentElement;
        if (!(e.target instanceof Node && stage?.contains(e.target))) return;
        flushSync(() => {
          if (played.current.down) letGo();
          setTakenOver(true);
        });
      } else if (played.current.down) {
        e.stopImmediatePropagation();
      }
    };
    const types = ["pointerdown", "pointermove", "pointerup"] as const;
    for (const type of types) window.addEventListener(type, onReal, true);
    return () => {
      for (const type of types) window.removeEventListener(type, onReal, true);
    };
  }, []);

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
        {t >= track[0][0] - 0.25 && !takenOver && (
          <Cursor
            at={origin.add(shownPointer.mul(frame.scale))}
            scale={cursorScale}
            opacity={opacity}
            open={!down}
          />
        )}
      </svg>
    </>
  );
}
