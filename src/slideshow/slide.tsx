import {
  createContext,
  ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DemoSettingsBar, DemoSettingsProvider } from "../demo/ui";

// The slideshow is presented on a 1920×1080 screen. Everything is laid out in
// a stage of exactly that size, which is then zoomed to fit the window, so
// that any window shows what the real screen would.
export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** The arrow keys that step forward and back through the slides. */
export const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
export const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

export type Transition = "fade-white" | "fade";

/**
 * A stretch of a video file in public/slides, played once and then held on its
 * last frame.
 */
export type VideoClip = { file: string; start: number; end: number };

/**
 * A slide is JSX to show on the stage, or a clip of a video. Video slides are
 * data rather than JSX so that the page can keep each video file loaded
 * across slides, which makes cuts between clips seamless.
 *
 * The outline in slides.tsx writes every slide as an object literal, so that
 * the dev server can find a slide's notes there to save edits to them
 * (vite-plugin-slide-notes.ts).
 */
export type Slide = {
  /** Speaker notes, in Markdown. */
  notes?: string;
  /**
   * Seconds spent on each step in the latest timed run-through that reached
   * the slide. The slideshow's timing mode writes these (timing.ts).
   */
  timing?: number[];
  /** How to arrive at this slide when going forward. Going back always cuts. */
  transition?: Transition;
  /**
   * How many steps the slide goes through before going on to the next slide
   * (default 1). The slide stays mounted throughout, so whatever it's doing
   * carries on from step to step; its content reads the step with
   * `useSlideStep`. Notes with more stages than this give the slide more
   * steps, through which its content holds on its last.
   */
  steps?: number;
  /**
   * Whether the slide is mounted, hidden, while the slide before it shows, so
   * that its images and videos have loaded by the time we get to it (default
   * true). Turn it off for a slide that does something on mount that should
   * wait until it's shown, like taking focus.
   */
  preload?: boolean;
  /**
   * Not presented: kept for reference, to look at from the outlines, but
   * going forward or back passes over it.
   */
  skip?: boolean;
} & ({ content: ReactNode } | { video: VideoClip });

/**
 * A heading among the slides, for us authors: it shows in the outline, not
 * the slideshow. Level 2 is a subheading.
 */
export type Heading = { heading: string; level?: 1 | 2 };

// A line of notes that's just --- starts the notes for the slide's next step
export const STAGE_BREAK = /^\s*---\s*$/;

/** How many stages a slide's notes are divided into by --- lines. */
function notesStages(notes: string | undefined): number {
  if (!notes) return 1;
  return 1 + notes.split("\n").filter((l) => STAGE_BREAK.test(l)).length;
}

export function slideSteps(slide: Slide) {
  return Math.max(slide.steps ?? 1, notesStages(slide.notes));
}

/**
 * The step a slide's content sees at `step`: steps past its own `steps`,
 * which only its notes have, hold on its last.
 */
export function contentStep(slide: Slide, step: number) {
  return Math.min(step, (slide.steps ?? 1) - 1);
}

export const SlideStepContext = createContext(0);

/** The step (from 0) of a slide with `steps`. */
export function useSlideStep() {
  return useContext(SlideStepContext);
}

export const SlidePresenceContext = createContext({
  shown: true,
  current: true,
  arrivedForward: false,
});

/**
 * Whether the slide is on the stage for the audience, rather than mounted
 * hidden to preload.
 */
export function useSlideShown() {
  return useContext(SlidePresenceContext).shown;
}

/**
 * Whether the slide is the one we're on. A slide fading out as we go on to
 * the next one is shown but no longer current.
 */
export function useSlideCurrent() {
  return useContext(SlidePresenceContext).current;
}

/**
 * Whether we came to the slide we're on by going forward, as its transition
 * plays (going back always cuts)
 */
export function useSlideArrivedForward() {
  return useContext(SlidePresenceContext).arrivedForward;
}

/**
 * Where a slide that glides into place on arrival is in that: at the start,
 * as it's preloaded and while it fades in; gliding, once we've come to it
 * going forward; or at the end, having come to it any other way
 */
export function useArrivalGlide(): "start" | "gliding" | "end" {
  const current = useSlideCurrent();
  const shown = useSlideShown();
  const arrivedForward = useSlideArrivedForward();
  const [phase, setPhase] = useState<"start" | "gliding" | "end">("start");
  // Before paint, so that coming to it some other way never shows the start
  useLayoutEffect(() => {
    if (current && !arrivedForward) setPhase("end");
    else if (!shown) setPhase("start");
    if (!current || !arrivedForward) return;
    // A frame at the start first, for the glide to go from
    const raf = requestAnimationFrame(() => setPhase("gliding"));
    return () => cancelAnimationFrame(raf);
  }, [current, shown, arrivedForward]);
  return phase;
}

/**
 * Where the presenter's status bar has room for the current slide's own
 * items, or null where there's no status bar (as on the stage-only page).
 */
export const StatusBarSlotContext = createContext<HTMLElement | null>(null);

/**
 * Puts its children in the presenter's status bar, below the stage, while the
 * slide is the current one: for things the presenter wants to see and the
 * audience doesn't.
 */
export function InStatusBar({ children }: { children: ReactNode }) {
  const slot = useContext(StatusBarSlotContext);
  const current = useSlideCurrent();
  if (!slot || !current) return null;
  return createPortal(children, slot);
}

/** The URL of a file in public/slides. */
export function slideFileUrl(file: string) {
  return `${import.meta.env.BASE_URL}slides/${file}`;
}

/** A line of notes without its // comment, if it has one (see NotesEditor) */
function stripNotesComment(line: string): string {
  return line.replace(/(?<=^|\s)\/\/.*/, "");
}

/** Whether a slide's notes say there's something left to do. */
/**
 * The slide that going forward (`dir` 1) or back (-1) from slide `from` goes
 * to, passing over those not presented; null if there are none.
 */
export function adjacentPresented(
  slides: Slide[],
  from: number,
  dir: 1 | -1,
): number | null {
  for (let i = from + dir; i >= 0 && i < slides.length; i += dir) {
    if (!slides[i].skip) return i;
  }
  return null;
}

export function slideHasTodo(slide: Slide): boolean {
  return !!slide.notes && /\bto-?do\b/i.test(slide.notes);
}

/** The first line of a slide's notes, as plain text, for at-a-glance views. */
export function notesFirstLine(notes: string | undefined): string | undefined {
  const line = notes
    ?.split("\n")
    .map((l) => stripNotesComment(l).trim())
    .find((l) => l !== "");
  return line
    ?.replace(/^(#+|[-*+>]|\d+\.)\s+/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "");
}

/** A demo, zoomed to fit the stage, with the demo settings bar. */
export function DemoSlide({
  children,
  width = 400,
  height = 400,
  overlayTitle,
  demoId,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  overlayTitle?: string;
  /** The demo's id on the demos page, to link to it */
  demoId?: string;
}) {
  const padX = 64;
  const padY = overlayTitle ? 120 : 64;
  const zoom = Math.min((STAGE_W - padX) / width, (STAGE_H - padY) / height, 3);
  return (
    <DemoSettingsProvider persist={false}>
      {overlayTitle && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 32,
            fontSize: 42,
            fontWeight: "bold",
            fontStyle: "italic",
            color: "#1a1a1a",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {overlayTitle}
        </div>
      )}
      {demoId && <DemoLink demoId={demoId} />}
      <div
        className="flex items-center justify-center"
        style={{ zoom, marginTop: overlayTitle ? 40 : 0 }}
      >
        {children}
      </div>
      <DemoSettingsBar compact />
    </DemoSettingsProvider>
  );
}

/** An image from public/slides, fit to the stage. */
export function ImageSlide({ src }: { src: string }) {
  return (
    <img
      src={slideFileUrl(src)}
      alt=""
      className="max-w-full max-h-full object-contain"
      draggable={false}
    />
  );
}

export function DemoLink({ demoId }: { demoId: string }) {
  return (
    <InStatusBar>
      <a
        href={`#/demos/${demoId}`}
        className="flex items-center gap-1 text-gray-400 no-underline hover:text-white"
        title="Open demo"
      >
        {demoId}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.5 3.5H3.5C2.95 3.5 2.5 3.95 2.5 4.5V12.5C2.5 13.05 2.95 13.5 3.5 13.5H11.5C12.05 13.5 12.5 13.05 12.5 12.5V9.5" />
          <path d="M9.5 2.5H13.5V6.5" />
          <path d="M6.5 9.5L13.5 2.5" />
        </svg>
      </a>
    </InStatusBar>
  );
}
