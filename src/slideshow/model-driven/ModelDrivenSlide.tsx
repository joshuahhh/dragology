import { useEffect, useRef, useState } from "react";
import { useArrivalGlide, useSlideCurrent, useSlideStep } from "../slide";
import { cubicBezier } from "./anim";
import { beadsSubject } from "./beads";
import {
  type Frame,
  lerpFrame,
  LiveDrag,
  ModelDrivenScene,
  script,
} from "./ModelDrivenScene";

/**
 * The model-driven-dragging explainer, played from time `from` to `to` once
 * the slide comes up, then held there: a stretch of it, as the video slides
 * play a stretch of a clip. With no `to`, it just shows time `from`.
 *
 * `stops` split the stretch into stages, one per step of the slide (so a
 * slide with n stops has n + 1 steps): each step plays from its stop to the
 * next, then holds. Steps past the last stop leave the last stage playing.
 *
 * With `arriveFrom`, the start view's beads come in at that frame, where the
 * slide before left them, and glide into place as the rest fades in.
 */
export function ModelDrivenSlide({
  from,
  to = from,
  stops = [],
  aside = false,
  arriveFrom,
}: {
  from: number;
  to?: number;
  stops?: number[];
  /** Whether the live drag moves over to the left, alone (animated) */
  aside?: boolean;
  arriveFrom?: Frame;
}) {
  const current = useSlideCurrent();
  const step = useSlideStep();
  const bounds = [from, ...stops, to];
  const stageFrom = bounds[Math.min(step, bounds.length - 2)];
  const stageTo = bounds[Math.min(step + 1, bounds.length - 1)];
  const t = usePlayhead(current, stageFrom, stageTo);

  const asideU = useTween(aside ? 1 : 0);

  const phase = useArrivalGlide();
  const arriveU = useTween(phase === "start" ? 0 : 1, {
    instant: phase !== "gliding",
    delayMs: ARRIVE_DELAY_MS,
  });

  return (
    <ModelDrivenScene
      subject={beadsSubject}
      t={t}
      drive={current}
      aside={asideU}
      arrival={arriveFrom && { from: arriveFrom, u: arriveU }}
    />
  );
}

/** Long enough for the crossfade in */
const ARRIVE_DELAY_MS = 350;

/** A pause before the press, with the cursor on the bead */
const LOOP_LEAD = 0.5;

/**
 * Just the explainer's live drag, at `frame`, going round and round from the
 * moment the slide comes up. Put it in a stage-sized box. With `aside`, it
 * moves over to where the explainer sets its own live drag aside (animated).
 */
export function LiveDragLoop({
  frame: home,
  aside = false,
}: {
  frame: Frame;
  aside?: boolean;
}) {
  const current = useSlideCurrent();
  const t = usePlayhead(
    current,
    beadsSubject.track[0][0] - LOOP_LEAD,
    Infinity,
  );
  const frame = lerpFrame(home, script.bigAside, useTween(aside ? 1 : 0));
  return (
    <LiveDrag
      subject={beadsSubject}
      frame={frame}
      t={t}
      drive={current}
      opacity={1}
      overlayOpacity={0}
      // As big against the beads as in the explainer's own live drag
      cursorScale={(script.cursor.liveScale * frame.scale) / script.big.scale}
    />
  );
}

/**
 * Seconds from `from` to `to`, played in real time each time `playing` turns
 * on or the span changes, then held. (Stopping holds the last time, for a
 * transition out.)
 */
function usePlayhead(playing: boolean, from: number, to: number): number {
  const [t, setT] = useState(from);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    setT(from);
    let raf = requestAnimationFrame(function tick() {
      const now = Math.min(to, from + (performance.now() - start) / 1000);
      setT(now);
      if (now < to) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, from, to]);
  return t;
}

const ASIDE_MS = 600;
const asideEase = cubicBezier(0.4, 0, 0.2, 1);

/**
 * A number that eases to each new `target` it's given, after `delayMs`, or
 * jumps there if `instant`
 */
function useTween(
  target: number,
  { instant = false, delayMs = 0 } = {},
): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;
    if (instant) {
      setValue(target);
      return;
    }
    const start = performance.now() + delayMs;
    let raf = requestAnimationFrame(function tick() {
      const u = Math.max(
        0,
        Math.min(1, (performance.now() - start) / ASIDE_MS),
      );
      setValue(from + (target - from) * asideEase(u));
      if (u < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, instant, delayMs]);
  // Jumping, not a frame late
  return instant ? target : value;
}
