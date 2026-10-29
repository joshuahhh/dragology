import { createContext, ReactNode, useContext } from "react";
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
  title?: string;
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
   * `useSlideStep`.
   */
  steps?: number;
  /**
   * Whether the slide is mounted, hidden, while the slide before it shows, so
   * that its images and videos have loaded by the time we get to it (default
   * true). Turn it off for a slide that does something on mount that should
   * wait until it's shown, like taking focus.
   */
  preload?: boolean;
} & ({ content: ReactNode } | { video: VideoClip });

/**
 * A heading among the slides, for us authors: it shows in the outline, not
 * the slideshow. Level 2 is a subheading.
 */
export type Heading = { heading: string; level?: 1 | 2 };

export function slideSteps(slide: Slide) {
  return slide.steps ?? 1;
}

export const SlideStepContext = createContext(0);

/** The step (from 0) of a slide with `steps`. */
export function useSlideStep() {
  return useContext(SlideStepContext);
}

export const SlidePresenceContext = createContext({
  shown: true,
  current: true,
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

/** The URL of a file in public/slides. */
export function slideFileUrl(file: string) {
  return `${import.meta.env.BASE_URL}slides/${file}`;
}

/** A line of notes without its // comment, if it has one (see NotesEditor) */
function stripNotesComment(line: string): string {
  return line.replace(/(?<=^|\s)\/\/.*/, "");
}

/** Whether a slide's title or notes say there's something left to do. */
export function slideHasTodo(slide: Slide): boolean {
  return [slide.title, slide.notes].some((s) => s && /\bto-?do\b/i.test(s));
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

function DemoLink({ demoId }: { demoId: string }) {
  return (
    <a
      href={`#/demos/${demoId}`}
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        zIndex: 10,
        fontSize: 16,
        color: "#9ca3af",
        textDecoration: "none",
        padding: "4px 6px",
        borderRadius: 4,
      }}
      title="Open demo"
    >
      <svg
        width="14"
        height="14"
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
  );
}
