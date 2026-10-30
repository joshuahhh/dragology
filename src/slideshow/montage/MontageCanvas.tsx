import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { STAGE_H, STAGE_W, useSlideShown, useSlideStep } from "../slide";
import {
  type MontageLayout,
  montageLayout,
  type Rect,
  resolveView,
} from "./layout";
import { TileContent } from "./MontageTile";

// The closing montage: a canvas of tiles of looping demo videos, seen through
// a camera that glides between named views of it (layout.json). Tiles can be
// lit up by group, dimming the rest.

export type MontageCanvasProps = {
  /** The camera's view: a view's name in the layout, or a rect */
  view: string | Rect;
  /** The group whose tiles to light up, dimming the others; null for none */
  highlight?: string | null;
  /** How long the camera takes to move to a new view (default 2600 ms) */
  cameraMs?: number;
  /**
   * Once at `view`, keep drifting slowly toward this view (a name in the
   * layout, or a rect) over `ms`. Ignored if the layout has no such view.
   */
  pan?: { to: string | Rect; ms: number };
  /** Show the highlighted group's label as a caption (default true) */
  caption?: boolean;
  /** How visible dimmed tiles are (default 0.15) */
  dimOpacity?: number;
  /** Behind the tiles, showing through the gutters (default: the layout's) */
  background?: string;
  /** The size of the box the canvas fills (default the stage) */
  width?: number;
  height?: number;
  layout?: MontageLayout;
  /** Hold the clips at their first frames */
  paused?: boolean;
  /**
   * Fill the box with the view, letting what doesn't fit run off its edges,
   * rather than fit all of the view inside it (default false)
   */
  cover?: boolean;
};

/** The scale and center that fit `view` in (or with `cover`, over) a width×height box */
function cameraFor(view: Rect, width: number, height: number, cover = false) {
  return {
    scale: (cover ? Math.max : Math.min)(width / view.w, height / view.h),
    cx: view.x + view.w / 2,
    cy: view.y + view.h / 2,
  };
}
type Camera = ReturnType<typeof cameraFor>;

type Ease = (t: number) => number;
const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine: Ease = (t) => (1 - Math.cos(Math.PI * t)) / 2;

/** Partway from camera a to b. Zoom moves evenly in log scale. */
function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    scale: a.scale * Math.pow(b.scale / a.scale, t),
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
  };
}

export function MontageCanvas({
  view,
  highlight = null,
  cameraMs = 2600,
  pan,
  caption = true,
  dimOpacity = 0.15,
  background,
  width = STAGE_W,
  height = STAGE_H,
  layout = montageLayout,
  paused = false,
  cover = false,
}: MontageCanvasProps) {
  const bare = layout.tileStyle === "bare";
  const target = cameraFor(resolveView(layout, view), width, height, cover);
  const panView =
    pan && (typeof pan.to !== "string" || pan.to in layout.views)
      ? cameraFor(resolveView(layout, pan.to), width, height)
      : null;
  const panMs = pan?.ms ?? 0;
  const targetKey = `${target.scale} ${target.cx} ${target.cy}`;
  const panKey = panView ? `${panView.scale} ${panView.cx} ${panView.cy}` : "";

  // The camera moves by setting the world's transform directly, each frame,
  // rather than re-rendering every tile.
  const worldRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const place = (c: Camera) => {
    cameraRef.current = c;
    const el = worldRef.current;
    if (!el) return;
    const tx = width / 2 - c.cx * c.scale;
    const ty = height / 2 - c.cy * c.scale;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${c.scale})`;
  };
  useLayoutEffect(() => {
    const from = cameraRef.current;
    // Each leg of the trip: to the view, then (if panning) on to the pan view
    const legs: { from: Camera; to: Camera; ms: number; ease: Ease }[] = [];
    if (!from || cameraMs <= 0) place(target);
    else legs.push({ from, to: target, ms: cameraMs, ease: easeInOutCubic });
    if (panView) {
      legs.push({ from: target, to: panView, ms: panMs, ease: easeInOutSine });
    }
    let raf = 0;
    let leg = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const l = legs[leg];
      const t = Math.max(0, Math.min(1, (now - start) / l.ms));
      place(lerpCamera(l.from, l.to, l.ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (++leg < legs.length) {
        start = now;
        raf = requestAnimationFrame(tick);
      }
    };
    if (legs.length) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, panKey, panMs, width, height, cameraMs]);

  const groupLabel = layout.groups.find((g) => g.id === highlight)?.label;
  // Keep the last label while the caption fades out
  const [shownLabel, setShownLabel] = useState(groupLabel);
  useEffect(() => {
    if (groupLabel) setShownLabel(groupLabel);
  }, [groupLabel]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "hidden",
        background: background ?? layout.background ?? "#141416",
      }}
    >
      <div
        ref={worldRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {layout.tiles.map((tile) => {
          const lit = highlight === null || tile.groups.includes(highlight);
          return (
            <div
              key={tile.id}
              style={{
                position: "absolute",
                left: tile.x,
                top: tile.y,
                width: tile.w,
                height: tile.h,
                borderRadius: bare ? 0 : layout.radius,
                overflow: "hidden",
                background: bare ? undefined : "white",
                opacity: lit ? 1 : dimOpacity,
                transition: "opacity 600ms ease",
              }}
            >
              <TileContent tile={tile} paused={paused} alpha={layout.alpha} />
            </div>
          );
        })}
      </div>
      {caption && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: height * 0.07,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: groupLabel ? 1 : 0,
            transform: groupLabel ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 400ms ease, transform 400ms ease",
          }}
        >
          <div
            style={{
              fontSize: height * 0.052,
              padding: `${height * 0.012}px ${height * 0.035}px`,
              borderRadius: 999,
              background: "rgba(255,255,255,0.94)",
              color: "#18181b",
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              fontStyle: "italic",
            }}
          >
            {shownLabel}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What the montage shows at a step of its slide. With `cycle`, the step lights
 * up each of the groups in turn, `ms` apiece, then (with `thenAll`) all of
 * them.
 */
export type MontageStep = {
  view: string | Rect;
  /** A slow drift onward from `view` (see MontageCanvasProps.pan) */
  pan?: { to: string | Rect; ms: number };
  highlight?: string | null;
  cycle?: { groups: string[]; ms: number; thenAll?: boolean };
  /** Fill the stage with the view (see MontageCanvasProps.cover) */
  cover?: boolean;
};

/**
 * Through the opening steps the camera drifts from "start" toward
 * "start-end", if the layout has that view, then pulls back to show it all.
 */
const OPENING_PAN = { to: "start-end", ms: 24000 };

const groupIds = montageLayout.groups.map((g) => g.id);

/**
 * Three steps, as in the script: the opening view; the groups lighting up in
 * turn, timed; the camera pulling back to show everything.
 */
export const MONTAGE_PLAN_TIMED: MontageStep[] = [
  { view: "start", pan: OPENING_PAN },
  {
    view: "start",
    pan: OPENING_PAN,
    cycle: { groups: groupIds, ms: 2000, thenAll: true },
  },
  // Pulled back over every tile (no view is named "tiles"), filling the
  // stage and running off its edges, to show how many there are
  { view: "tiles", cover: true },
];

/** The same, but a step per group, so each one waits for a click */
export const MONTAGE_PLAN_SPLIT: MontageStep[] = [
  { view: "start", pan: OPENING_PAN },
  ...groupIds.map((g) => ({ view: "start", pan: OPENING_PAN, highlight: g })),
  // Pulled back over every tile (no view is named "tiles"), filling the
  // stage and running off its edges, to show how many there are
  { view: "tiles", cover: true },
];

/**
 * The montage as a slide's content, following the slide's step through a
 * plan. Give the slide `steps: plan.length`.
 */
export function ClosingMontageSlide({
  plan = MONTAGE_PLAN_TIMED,
  ...rest
}: { plan?: MontageStep[] } & Omit<MontageCanvasProps, "view" | "highlight">) {
  const step = useSlideStep();
  // Like Josh's intro montage: the clips play only while the slide is shown,
  // not while it's mounted hidden to preload
  const shown = useSlideShown();
  return <MontagePlayer plan={plan} step={step} paused={!shown} {...rest} />;
}

/** The montage at a step of a plan, outside of a slide */
export function MontagePlayer({
  plan,
  step,
  ...rest
}: { plan: MontageStep[]; step: number } & Omit<
  MontageCanvasProps,
  "view" | "highlight"
>) {
  const s = plan[Math.max(0, Math.min(step, plan.length - 1))];
  const highlight = useCycle(s, step);
  return (
    <MontageCanvas
      view={s.view}
      pan={s.pan}
      cover={s.cover}
      highlight={highlight}
      {...rest}
    />
  );
}

/** The highlighted group at a step, running the step's cycle if it has one */
function useCycle(s: MontageStep, step: number): string | null {
  const [cycleState, setCycleState] = useState({ step, i: 0 });
  const cycle = s.cycle;
  useEffect(() => {
    setCycleState({ step, i: 0 });
    if (!cycle) return;
    const n = cycle.groups.length + (cycle.thenAll ? 1 : 0);
    const timer = setInterval(
      () => setCycleState((c) => ({ step, i: c.i + 1 < n ? c.i + 1 : c.i })),
      cycle.ms,
    );
    return () => clearInterval(timer);
  }, [cycle, step]);
  if (!cycle) return s.highlight ?? null;
  // Until the effect catches up with a new step, start from its first group
  const i = cycleState.step === step ? cycleState.i : 0;
  return cycle.groups[i] ?? null;
}
