// "Rails": a slide's demo driven by recorded pointer tracks, one per step, so
// that each press of → plays the next bit of interaction at a pace we chose
// in advance. In "live" mode (the default) the demo is left to the presenter.
//
// R switches between the modes, for every slide at once. (Not F, which is the
// slideshow's fullscreen.)
//
// Recording: in dev, with the slide shown, press Shift+R to start recording
// the current step, fidget with the demo, and press Shift+R again to stop. The track is
// saved to src/slideshow/rails/<id>.json (or, without the dev server, to
// localStorage and the clipboard).
//
// Playback works by dispatching synthetic PointerEvents where the recorded
// pointer was, which DraggableRenderer handles like real ones, and drawing a
// cursor there.

import {
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSlideCurrent, useSlideStep } from "./slide";

/** A moment of a track. x and y are fractions of the stage. */
export type Sample = { t: number; x: number; y: number; down: boolean };

/** Tracks by step */
export type Tracks = Record<number, Sample[]>;

export const SAVE_TRACKS_PATH = "/__rails/save";

// The recorded tracks in src/slideshow/rails, by id
const savedTracks: Record<string, Tracks> = Object.fromEntries(
  Object.entries(
    import.meta.glob<Tracks>("./rails/*.json", {
      eager: true,
      import: "default",
    }),
  ).map(([path, tracks]) => [path.replace(/^.*\/|\.json$/g, ""), tracks]),
);

// ── Mode: live or rails, toggled with R, for every Rails at once ──

export type RailsMode = "live" | "rails";

let mode: RailsMode = "live";
const listeners = new Set<() => void>();

function setMode(m: RailsMode) {
  mode = m;
  listeners.forEach((l) => l());
}

export function useRailsMode() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mode,
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("input, textarea, [contenteditable]")
    ) {
      return;
    }
    setMode(mode === "live" ? "rails" : "live");
  });
}

/**
 * A slide's content, played along recorded tracks in rails mode. Put it
 * around the whole slide content (it measures positions against the stage).
 */
export function Rails({ id, children }: { id: string; children: ReactNode }) {
  const step = useSlideStep();
  const active = useSlideCurrent();
  const railsMode = useRailsMode();
  const frameRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [tracks, setTracks] = useState<Tracks>(
    () => loadLocalTracks(id) ?? savedTracks[id] ?? {},
  );
  const [recording, setRecording] = useState(false);
  // Bumped to start the demo over, from its initial state
  const [generation, setGeneration] = useState(0);

  // Rails: play the step's track when we get to it. Step 0 starts over.
  useEffect(() => {
    if (!active || railsMode !== "rails") return;
    if (step === 0) setGeneration((g) => g + 1);
    const track = tracks[step];
    if (!track || track.length === 0) return;
    // Give a restarted demo a frame to mount
    let raf = requestAnimationFrame(() => {
      const player = new TrackPlayer(
        track,
        frameRef.current!,
        cursorRef.current!,
      );
      raf = requestAnimationFrame(function tick() {
        if (player.advance()) raf = requestAnimationFrame(tick);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [active, railsMode, step, tracks]);

  // Recording, in dev: Shift+R starts and stops
  useEffect(() => {
    if (!active || !import.meta.hot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "R" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }
      setRecording((r) => !r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    if (!recording) return;
    const frame = frameRef.current!;
    const start = performance.now();
    const samples: Sample[] = [];
    const record = (e: PointerEvent) => {
      const rect = frame.getBoundingClientRect();
      samples.push({
        t: Math.round(performance.now() - start),
        x: round4((e.clientX - rect.left) / rect.width),
        y: round4((e.clientY - rect.top) / rect.height),
        down: (e.buttons & 1) === 1,
      });
    };
    const opts = { capture: true };
    window.addEventListener("pointermove", record, opts);
    window.addEventListener("pointerdown", record, opts);
    window.addEventListener("pointerup", record, opts);
    return () => {
      window.removeEventListener("pointermove", record, opts);
      window.removeEventListener("pointerdown", record, opts);
      window.removeEventListener("pointerup", record, opts);
      // Start a beat before the first thing that happened
      const lead = Math.max(0, (samples[0]?.t ?? 0) - 250);
      const next = {
        ...tracks,
        [step]: samples.map((s) => ({ ...s, t: s.t - lead })),
      };
      setTracks(next);
      saveTracks(id, next);
    };
    // Only on starting and stopping a recording
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  return (
    <>
      <Fragment key={generation}>{children}</Fragment>
      <div
        ref={frameRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        <div
          ref={cursorRef}
          style={{ position: "absolute", left: 0, top: 0, display: "none" }}
        >
          <Cursor />
        </div>
        {(recording || railsMode === "rails") && (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 12,
              fontSize: 18,
              color: recording ? "#dc2626" : "#9ca3af",
            }}
          >
            {recording ? `● recording step ${step + 1}` : "rails"}
          </div>
        )}
      </div>
    </>
  );
}

/** Plays a track: dispatches its pointer events, in time, and moves the cursor. */
class TrackPlayer {
  private start = performance.now();
  private next = 0;
  private down = false;
  private target: Element | null = null;

  constructor(
    private track: Sample[],
    private frame: HTMLElement,
    private cursor: HTMLElement,
  ) {}

  /** Plays what's due; returns whether there's more to play. */
  advance(): boolean {
    const elapsed = performance.now() - this.start;
    // Moves only need their latest position. Presses and releases happen
    // where they happened, one a frame, since DraggableRenderer only starts
    // listening for moves and releases once it's re-rendered after a press.
    let last: Sample | null = null;
    while (
      this.next < this.track.length &&
      this.track[this.next].t <= elapsed
    ) {
      const s = this.track[this.next];
      if (s.down !== this.down) {
        if (!last) {
          this.dispatch(s);
          this.next++;
        }
        break;
      }
      last = s;
      this.next++;
    }
    if (last) this.dispatch(last);
    const more = this.next < this.track.length;
    if (!more) this.cursor.style.display = "none";
    return more;
  }

  private dispatch(s: Sample) {
    const rect = this.frame.getBoundingClientRect();
    const clientX = rect.left + s.x * rect.width;
    const clientY = rect.top + s.y * rect.height;
    const under = document.elementFromPoint(clientX, clientY);
    const type =
      s.down && !this.down
        ? "pointerdown"
        : !s.down && this.down
          ? "pointerup"
          : "pointermove";
    if (type === "pointerdown") this.target = under;
    // While pressed, events go where the press started, as with pointer
    // capture; DraggableRenderer listens on document, which they reach either
    // way
    const target = (this.down ? this.target : under) ?? document.body;
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: s.down ? 1 : 0,
      }),
    );
    this.down = s.down;

    // The cursor, in the frame's own (unzoomed) pixels
    const scale = rect.width / this.frame.offsetWidth;
    const grabbable =
      under instanceof Element &&
      /grab|pointer|move/.test(getComputedStyle(under).cursor);
    this.cursor.style.display = "block";
    this.cursor.style.transform = `translate(${(clientX - rect.left) / scale}px, ${(clientY - rect.top) / scale}px)`;
    const shape: CursorShape = s.down ? "fist" : grabbable ? "hand" : "arrow";
    for (const el of this.cursor.children) {
      (el as SVGElement).style.display =
        (el as SVGElement).dataset.shape === shape ? "block" : "none";
    }
  }
}

// The drawn cursor: the same art as d2-talk/recorder/cursor-overlay.js, so
// that rails and recorded clips look alike. Each shape is on a 24-unit grid,
// drawn twice: outlined dark, then filled white on top, so overlapping parts
// merge into one silhouette.

const INK = "#1d1d24";
const OUTLINE = 2.3;
/** Stage pixels per grid unit: the arrow is 54px tall */
const CURSOR_SCALE = 54 / (21.35 - 1.5 + OUTLINE);

type CursorShape = "arrow" | "hand" | "fist";

/** A finger: a capsule `w` wide from (cx, top) down to its base at `bottom` */
function finger(
  cx: number,
  top: number,
  bottom: number,
  w: number,
  deg: number,
) {
  return (
    <rect
      x={cx - w / 2}
      y={top}
      width={w}
      height={bottom - top}
      rx={w / 2}
      transform={`rotate(${deg} ${cx} ${bottom})`}
    />
  );
}

const CURSOR_SHAPES: Record<
  CursorShape,
  { hotspot: [number, number]; shapes: ReactNode }
> = {
  arrow: {
    hotspot: [2, 1.5],
    shapes: (
      <path d="M2 1.5 L2 18.6 L6.15 14.75 L9.05 21.35 L12.05 20.05 L9.2 13.55 L14.85 13.55 Z" />
    ),
  },
  hand: {
    hotspot: [12.3, 12.5],
    shapes: (
      <g>
        <path d="M6.6 11.2 C6.6 9.9 7.6 9.4 8.6 9.4 L17.4 9.4 C18.8 9.4 19.6 10.4 19.4 11.8 L18.6 16.8 C18.2 19.4 16.6 21.6 14.2 21.9 L11 21.9 C8.8 21.6 7.4 20 6.8 18 Z" />
        {finger(8.25, 4.1, 13, 2.9, -11)}
        {finger(11.45, 2.3, 12.4, 2.9, -3)}
        {finger(14.65, 3.1, 12.4, 2.9, 5)}
        {finger(17.6, 5.6, 13.2, 2.6, 14)}
        <rect
          x={5.45}
          y={9.3}
          width={3.1}
          height={8.6}
          rx={1.55}
          transform="rotate(-38 7 17.4)"
        />
      </g>
    ),
  },
  fist: {
    hotspot: [12.5, 13.5],
    shapes: (
      <g>
        <path d="M6.4 12.6 C6.4 11.1 7.4 10.2 8.8 10.2 L17.6 10.2 C19 10.2 19.8 11.3 19.6 12.8 L18.9 17.3 C18.5 19.8 16.8 21.8 14.4 22 L11.2 22 C8.9 21.7 7.4 20.1 6.9 18.1 Z" />
        {finger(8.6, 7.4, 12.8, 3, -4)}
        {finger(11.8, 6.6, 12.4, 3, 0)}
        {finger(15, 6.9, 12.4, 3, 3)}
        {finger(18, 8.4, 13, 2.7, 9)}
        <rect
          x={4.9}
          y={11.4}
          width={3.1}
          height={6.6}
          rx={1.55}
          transform="rotate(-24 6.45 17.6)"
        />
      </g>
    ),
  },
};

/** All three shapes, of which TrackPlayer shows one */
function Cursor() {
  return (
    <>
      {(Object.keys(CURSOR_SHAPES) as CursorShape[]).map((name) => {
        const { hotspot, shapes } = CURSOR_SHAPES[name];
        return (
          <svg
            key={name}
            data-shape={name}
            viewBox="0 0 24 24"
            width={24 * CURSOR_SCALE}
            height={24 * CURSOR_SCALE}
            style={{
              position: "absolute",
              left: -hotspot[0] * CURSOR_SCALE,
              top: -hotspot[1] * CURSOR_SCALE,
              overflow: "visible",
              display: name === "arrow" ? "block" : "none",
              filter:
                "drop-shadow(0 3px 4px rgba(0,0,0,0.38)) drop-shadow(0 0 1px rgba(0,0,0,0.25))",
            }}
          >
            <g
              fill={INK}
              stroke={INK}
              strokeWidth={OUTLINE}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {shapes}
            </g>
            <g fill="white">{shapes}</g>
          </svg>
        );
      })}
    </>
  );
}

function round4(x: number) {
  return Math.round(x * 10000) / 10000;
}

function loadLocalTracks(id: string): Tracks | null {
  try {
    const s = localStorage.getItem(`rails:${id}`);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function saveTracks(id: string, tracks: Tracks) {
  const json = JSON.stringify(tracks);
  try {
    localStorage.setItem(`rails:${id}`, json);
  } catch {}
  fetch(SAVE_TRACKS_PATH, {
    method: "POST",
    body: JSON.stringify({ id, tracks }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      // The file has it now
      localStorage.removeItem(`rails:${id}`);
    })
    .catch(() => {
      navigator.clipboard?.writeText(json).catch(() => {});
      console.log(`Rails tracks for ${id} (copied):`, json);
    });
}
