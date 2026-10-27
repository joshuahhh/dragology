import { ReactNode } from "react";
import { DemoSettingsBar, DemoSettingsProvider } from "../demo/ui";

// The slideshow is presented on a 1920×1080 screen. Everything is laid out in
// a stage of exactly that size, which is then zoomed to fit the window, so
// that any window shows what the real screen would.
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export type Transition = "fade-white" | "fade";

/** A stretch of a video file, played once and then held on its last frame. */
export type VideoClip = { src: string; start: number; end: number };

/**
 * A slide is JSX to show on the stage, or a clip of a video. Video slides are
 * data rather than JSX so that the page can keep each video file loaded
 * across slides, which makes cuts between clips seamless.
 */
export type Slide = {
  title?: string;
  subtitles?: string;
  /** How to arrive at this slide when going forward. Going back always cuts. */
  transition?: Transition;
} & ({ content: ReactNode } | { video: VideoClip });

type SlideMeta = Pick<Slide, "title" | "subtitles" | "transition">;

export function demoSlide(
  title: string,
  demo: ReactNode,
  opts: SlideMeta & {
    width?: number;
    height?: number;
    overlayTitle?: string;
    demoId?: string;
  } = {},
): Slide {
  const { width = 400, height = 400, overlayTitle, demoId, ...meta } = opts;
  const padX = 64;
  const padY = overlayTitle ? 120 : 64;
  const zoom = Math.min((STAGE_W - padX) / width, (STAGE_H - padY) / height, 3);
  return {
    title,
    ...meta,
    content: (
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
          {demo}
        </div>
        <DemoSettingsBar compact />
      </DemoSettingsProvider>
    ),
  };
}

export function imageSlide(
  image: string,
  title: string,
  subtitles?: string,
  opts?: { transition?: Transition },
): Slide {
  return {
    title,
    subtitles,
    ...opts,
    content: (
      <img
        src={`${import.meta.env.BASE_URL}slides/${image}`}
        alt=""
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    ),
  };
}

export function videoSlide(
  video: string,
  title: string,
  start: number,
  end: number,
  subtitles?: string,
  opts?: { transition?: Transition },
): Slide {
  return {
    title,
    subtitles,
    ...opts,
    video: { src: `${import.meta.env.BASE_URL}slides/${video}`, start, end },
  };
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
