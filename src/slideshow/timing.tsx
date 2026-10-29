import _ from "lodash";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  SAVE_TIMINGS_PATH,
  type SaveResponse,
  type SaveTimingsRequest,
} from "./notesApi";
import { type Slide, slideSteps } from "./slide";
import { outlineIndexOfSlide, slides } from "./slides";

/**
 * A timed run-through in progress: how long we've spent on each step of each
 * slide. Going back to a step adds to its time.
 */
export type TimingRun = {
  /** Seconds on each step of each slide, by slide index, before `on` */
  seconds: Record<number, number[]>;
  /** The step we're on, and when (as `Date.now()`) we got to it */
  on: { slide: number; step: number; since: number };
};

/** A slide shorter than this in a run was passed through, not presented */
const MIN_SLIDE_SECONDS = 5;

const RUN_KEY = "slideshow-timing-run";

function loadRun(): TimingRun | null {
  try {
    const json = localStorage.getItem(RUN_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

/** The run's `seconds`, with the time on the step we're on added in. */
export function runSeconds(
  run: TimingRun,
  now = Date.now(),
): Record<number, number[]> {
  const { slide, step, since } = run.on;
  const steps = [...(run.seconds[slide] ?? [])];
  steps[step] = (steps[step] ?? 0) + (now - since) / 1000;
  return { ...run.seconds, [slide]: steps };
}

/**
 * Timing mode, for run-throughs: while a run is on, it times each step of
 * each slide we go to, and on `stop`, saves each slide's times to its
 * `timing` in slides.tsx (vite-plugin-slide-notes.ts). Slides the run didn't
 * reach keep the times they had. The run is kept in localStorage until it's
 * saved, so a reload doesn't lose it (and counts toward the step it's on).
 */
export function useTimingRun(
  pos: { slide: number; step: number },
  showError: (title: string, error?: unknown) => void,
) {
  const [run, setRun] = useState(loadRun);
  const [saving, setSaving] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    try {
      if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
      else localStorage.removeItem(RUN_KEY);
    } catch {
      // A reload will lose it, then
    }
  }, [run]);

  const { slide, step } = pos;
  useEffect(() => {
    setRun((run) => {
      if (!run || (run.on.slide === slide && run.on.step === step)) return run;
      const now = Date.now();
      return { seconds: runSeconds(run, now), on: { slide, step, since: now } };
    });
  }, [slide, step]);

  const start = useCallback(() => {
    setRun({ seconds: {}, on: { ...posRef.current, since: Date.now() } });
  }, []);

  const discard = useCallback(() => setRun(null), []);

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run || saving) return;
    const seconds = runSeconds(run);
    const req: SaveTimingsRequest = {
      slides: Object.entries(seconds).flatMap(([i, secs]) => {
        const slide = slides[+i];
        if (!slide || _.sum(secs) < MIN_SLIDE_SECONDS) return [];
        return [
          {
            index: outlineIndexOfSlide[+i],
            notes: slide.notes,
            timing: _.range(slideSteps(slide)).map((k) =>
              Math.round(secs[k] ?? 0),
            ),
          },
        ];
      }),
    };
    setSaving(true);
    void fetch(SAVE_TIMINGS_PATH, {
      method: "POST",
      body: JSON.stringify(req),
    })
      .then((res) => res.json() as Promise<SaveResponse>)
      .catch((e): SaveResponse => ({ error: String(e) }))
      .then(({ error }) => {
        setSaving(false);
        // The run goes on, to save again
        if (error) showError("Timings not saved; still timing", error);
        // Unless it was restarted or discarded meanwhile
        else if (runRef.current === run) setRun(null);
      });
  }, [saving, showError]);

  return { run, saving, start, stop, discard };
}

export type TimingMode = ReturnType<typeof useTimingRun>;

/** Seconds as m:ss */
export function formatSeconds(s: number) {
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The total of every slide's latest timing. */
export function savedTotal(): { seconds: number; slides: number } {
  const timed = slides.filter((s) => s.timing);
  return {
    seconds: _.sum(timed.map((s) => _.sum(s.timing))),
    slides: timed.length,
  };
}

/** Re-renders now and then, for a clock. */
function useTick(ms: number) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const interval = setInterval(tick, ms);
    return () => clearInterval(interval);
  }, [ms]);
}

/**
 * While a run is on, the time on the current step and in the run so far, for
 * the presenter.
 */
export function TimingClock({ run }: { run: TimingRun }) {
  useTick(250);
  const now = Date.now();
  const total = _.sum(Object.values(runSeconds(run, now)).map(_.sum));
  return (
    <div
      className="flex items-center gap-2 text-xs text-zinc-300 tabular-nums"
      title="Timing this run-through (⌃⇧T to stop and save)"
    >
      <span className="h-2 w-2 rounded-full bg-red-500" />
      <span>
        step{" "}
        <span className="text-white">
          {formatSeconds((now - run.on.since) / 1000)}
        </span>
      </span>
      <span className="text-zinc-600">·</span>
      <span>
        run <span className="text-white">{formatSeconds(total)}</span>
      </span>
    </div>
  );
}

/**
 * A slide's time, inset in its thumbnail: from the run on, if it's been to
 * the slide (not counting the current visit), or else its latest timing.
 */
export function SlideTimeBadge({
  slide,
  slideIdx,
  run,
}: {
  slide: Slide;
  slideIdx: number;
  run: TimingRun | null;
}) {
  const runSecs = _.sum(run?.seconds[slideIdx] ?? []);
  const fromRun = runSecs >= MIN_SLIDE_SECONDS;
  const secs = fromRun ? runSecs : slide.timing && _.sum(slide.timing);
  if (secs === undefined) return null;
  return (
    <div
      className={`absolute right-1 bottom-2 rounded px-1 text-[10px] leading-[14px] text-white tabular-nums ${
        fromRun ? "bg-red-600/90" : "bg-black/60"
      }`}
      title={
        fromRun
          ? "Time in this run-through so far"
          : `Latest timing${
              slide.timing!.length > 1
                ? `, by step: ${slide.timing!.map(formatSeconds).join(" + ")}`
                : ""
            }`
      }
    >
      {formatSeconds(secs)}
    </div>
  );
}
