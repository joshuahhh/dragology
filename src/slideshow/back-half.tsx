// Pieces of the back half of the talk (Andrew's part: the demos, Hazel, where
// the ideas came from, and the close). The slides themselves are in the
// outline in slides.tsx, where their notes can be edited in place.

import { type ReactNode, useContext, useEffect, useRef } from "react";
import { DemoContext, type DemoToggleSettings } from "../demo/ui";
import "../studio/shantell-sans";
import { EmbedSlide } from "./EmbedSlide";
import hazelProgram from "./hazel-demo-program.txt?raw";
import {
  slideFileUrl,
  useSlideCurrent,
  useSlideShown,
  useSlideStep,
} from "./slide";

const HIGHLIGHT = "#d5e5a3";
const EASE = "cubic-bezier(0.45, 0, 0.25, 1)";

/** A file in public/slides/back-half */
function file(name: string) {
  return slideFileUrl(`back-half/${name}`);
}

// ── Code callouts ──

/** Code highlighted at the given steps of the slide. */
export function Hl({ at, children }: { at: number[]; children: ReactNode }) {
  const on = at.includes(useSlideStep());
  return (
    <span
      style={{
        backgroundColor: on ? HIGHLIGHT : "transparent",
        padding: "0 6px",
        borderRadius: 4,
        transition: "background-color 300ms ease",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Code in a corner of the stage, shown from step `from`. Put it beside a
 * DemoSlide, not in it, so that it's drawn at stage scale.
 */
export function CodeCallout({
  children,
  from = 0,
  corner = "bottom-right",
}: {
  children: ReactNode;
  from?: number;
  corner?: "bottom-right" | "bottom-left" | "top-right";
}) {
  const shown = useSlideStep() >= from;
  const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  return (
    <pre
      style={{
        position: "absolute",
        [v]: 72,
        [h]: 64,
        zIndex: 10,
        margin: 0,
        padding: "20px 28px",
        fontFamily: "monospace",
        fontSize: 32,
        fontWeight: "bold",
        lineHeight: 1.45,
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(12px)",
        transition: "opacity 400ms ease, transform 400ms ease",
        pointerEvents: "none",
      }}
    >
      {children}
    </pre>
  );
}

/**
 * Turns demo settings (overlays and such) on or off at each step. Goes inside
 * a DemoSlide, whose settings it changes; `byStep[i]` applies from step i
 * until a later entry says otherwise.
 */
export function StepToggles({
  byStep,
}: {
  byStep: Partial<DemoToggleSettings>[];
}) {
  const step = useSlideStep();
  const { setToggles } = useContext(DemoContext);
  useEffect(() => {
    const merged = Object.assign({}, ...byStep.slice(0, step + 1));
    setToggles((t) => ({ ...t, ...merged }));
  }, [step, byStep, setToggles]);
  return null;
}

// ── Pictures ──

/** A picture filling the stage, cropped to fill it or fit inside it. */
function Picture({
  name,
  fit = "contain",
  style,
}: {
  name: string;
  fit?: "contain" | "cover";
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={file(name)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: fit,
        ...style,
      }}
    />
  );
}

/** A caption in a corner, like a photo's date. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 40,
        padding: "8px 18px",
        fontSize: 36,
        color: "white",
        background: "rgba(0,0,0,0.45)",
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A muted video from public/slides/back-half that plays (looping) while its
 * slide is shown and waits at its start otherwise. Before the clip exists,
 * shows `poster`.
 */
export function ClipVideo({
  name,
  poster,
  loop = true,
}: {
  name: string;
  poster?: string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const shown = useSlideShown();
  const current = useSlideCurrent();
  // Plays from the start each time the slide is shown, and keeps playing as
  // it fades out (like Josh's montage), rather than jumping back to the start
  useEffect(() => {
    const video = ref.current!;
    if (shown && current) {
      video.play()?.catch(() => {});
    } else if (!shown) {
      video.pause();
      if (video.currentTime !== 0) video.currentTime = 0;
    }
  }, [shown, current]);
  return (
    <video
      ref={ref}
      src={file(name)}
      poster={poster && file(poster)}
      muted
      playsInline
      loop={loop}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "white",
      }}
    />
  );
}

// ── Slides ──

/** Hazel, its chrome hidden but for the nut menu and the start of the top bar. */
export function HazelSlide() {
  return (
    <EmbedSlide
      // A static build of Hazel's talk-demo branch: the refactorings branch
      // with Drag Refactoring and Animate All Edits on by default. Hazel
      // opens a share link as a new scratch slide, its program URI-encoded
      // (by Hazel) and then encoded again as a URL parameter.
      src={`hazel/index.html?name=${encodeURIComponent(
        "declarative dragging",
      )}&share=${encodeURIComponent(encodeURIComponent(hazelProgram))}`}
      // About twice what Hazel draws itself; ⌘+ and ⌘− adjust it on the slide
      zoom={2.5}
      css={HAZEL_CSS}
    />
  );
}

// Hazel's page is a grid: the top bar, the editor (#main), the sidebars, and
// the bottom bar. We keep the top bar's left end (the nut menu, the mode, and
// the scratch slide's name) and the editor, which takes the sidebars' room.
const HAZEL_CSS = `
  #sidebars, #bottom-bar, #edit-buttons, #sample-focus-bar { display: none !important; }
  #main { grid-column: 1 / -1 !important; }
`;

/** Nool before dragging: select a subterm, pick a rewrite, see it happen. */
export function NoolClassicSlide() {
  return (
    <div className="absolute inset-0">
      <ClipVideo name="nool-classic.mp4" poster="nool-classic.jpg" />
    </div>
  );
}

// ── The whiteboard ──

// wb-board.jpg is the whiteboard photo cropped to the board (1590×1260).
// Shown full height on the stage, it's 1363 wide.
const BOARD_W = 1590;
const BOARD_H = 1260;
const BOARD_SCALE = 1080 / BOARD_H;

/** Close-ups of sketches on the board, with where they are on it */
const BOARD_SKETCHES = [
  { name: "wb-arrows.jpg", at: 1, cx: 200, cy: 468, r: 120 },
  { name: "wb-nested.jpg", at: 2, cx: 720, cy: 504, r: 160 },
];

/**
 * The board at full stage height, its left edge at `x`, with a ring around
 * each sketch from the step its close-up shows.
 */
function Board({ x }: { x: number }) {
  const step = useSlideStep();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 0,
        width: BOARD_W * BOARD_SCALE,
        height: BOARD_H * BOARD_SCALE,
      }}
    >
      <Picture name="wb-board.jpg" fit="cover" />
      <svg
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {BOARD_SKETCHES.map((k) => (
          <circle
            key={k.name}
            cx={k.cx}
            cy={k.cy}
            r={k.r}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={8}
            strokeDasharray="22 14"
            style={{
              opacity: step >= k.at ? 0.9 : 0,
              transition: "opacity 500ms ease",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/** A close-up photo, shown from its step */
function CloseUp({
  name,
  at,
  style,
}: {
  name: string;
  at: number;
  style: React.CSSProperties;
}) {
  const shown = useSlideStep() >= at;
  return (
    <div
      style={{
        position: "absolute",
        overflow: "hidden",
        border: "6px solid white",
        boxShadow: "0 16px 50px rgba(0,0,0,0.3)",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "scale(0.92)",
        transition: "opacity 500ms ease, transform 500ms ease",
        ...style,
      }}
    >
      <Picture name={name} fit="cover" />
    </div>
  );
}

/**
 * The whiteboard, whole, and two of its sketches close up: each pops out of
 * the board as a round lens, tied by a line to where it is on the board.
 */
export function WhiteboardSlide() {
  const step = useSlideStep();
  const centered = (1920 - BOARD_W * BOARD_SCALE) / 2;
  const lenses = [
    { cx: 330, cy: 790 },
    { cx: 1520, cy: 330 },
  ];
  const R = 230;
  return (
    <div className="absolute inset-0" style={{ background: "#efeee9" }}>
      <Board x={centered} />
      <svg
        viewBox="0 0 1920 1080"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {BOARD_SKETCHES.map((k, i) => (
          <line
            key={k.name}
            x1={centered + k.cx * BOARD_SCALE}
            y1={k.cy * BOARD_SCALE}
            x2={lenses[i].cx}
            y2={lenses[i].cy}
            stroke="#f59e0b"
            strokeWidth={5}
            style={{
              opacity: step >= k.at ? 0.9 : 0,
              transition: "opacity 500ms ease",
            }}
          />
        ))}
      </svg>
      {BOARD_SKETCHES.map((k, i) => (
        <CloseUp
          key={k.name}
          name={k.name}
          at={k.at}
          style={{
            left: lenses[i].cx - R,
            top: lenses[i].cy - R,
            width: 2 * R,
            height: 2 * R,
            borderRadius: "50%",
            borderColor: "#f59e0b",
          }}
        />
      ))}
    </div>
  );
}

/** The walk: the trail, then the map of the route inset over it. */
export function WalkSlide() {
  const mapShown = useSlideStep() >= 1;
  const mapW = 760;
  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      <Picture name="walk-trail.jpg" fit="cover" />
      <Caption>Seattle, 2022</Caption>
      <img
        src={file("walk-map.jpg")}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          right: 56,
          bottom: 56,
          width: mapW,
          border: "10px solid white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          opacity: mapShown ? 1 : 0,
          transform: mapShown
            ? "rotate(1.5deg)"
            : "rotate(1.5deg) translateY(40px)",
          transition: `opacity 600ms ease, transform 600ms ${EASE}`,
        }}
      />
    </div>
  );
}

/**
 * Elliot's order-preserving maps and Josh's drawings of them, together on one
 * page as they appear one by one, and then the live demo they became
 * (passed in as `live`).
 */
export function ElliotSlide({ live }: { live: ReactNode }) {
  const step = useSlideStep();
  const fade = (at: number): React.CSSProperties => ({
    opacity: step >= at && step < 3 ? 1 : 0,
    transition: "opacity 600ms ease",
  });
  return (
    <div className="absolute inset-0" style={{ background: "white" }}>
      <img
        src={file("elliot-1.jpg")}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: (1920 - 1320) / 2,
          top: 30,
          width: 1320,
          ...fade(0),
        }}
      />
      <img
        src={file("elliot-2.jpg")}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: 330,
          top: 520,
          height: 530,
          ...fade(1),
        }}
      />
      <img
        src={file("elliot-3.jpg")}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          right: 330,
          top: 520,
          height: 530,
          ...fade(2),
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: step >= 3 ? 1 : 0,
          transition: "opacity 600ms ease",
          pointerEvents: step >= 3 ? "auto" : "none",
        }}
      >
        {live}
      </div>
    </div>
  );
}

/**
 * Supernool's talk build. It runs its own beats on Space, and moves the
 * avatar with the arrow keys, so it gets those; the clicker's keys (or
 * Escape, then →) move on.
 */
export function SupernoolSlide() {
  return (
    <EmbedSlide
      // What supernool/wist/ redirects to (a directory URL, which the dev
      // server would answer with our own page)
      src="supernool/explorations/018-painted-ground/index.html?demo=wist&inhabited=1"
      arrows="app"
      focusOnShow
    />
  );
}

/**
 * The close: where to find Dragology, and thanks, written on the whiteboard
 * the drag ideas haunted, now wiped clean.
 */
export function CallToActionSlide() {
  const ink = "#1f3a8a";
  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      <Picture name="empty-wb.jpg" fit="cover" />
      {/* The board's face: 440–1450 × 280–1080 in the 1920×1440 photo,
          whose top 180px the stage crops off */}
      <div
        style={{
          position: "absolute",
          left: 440,
          top: 100,
          width: 1010,
          height: 800,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Shantell Sans', cursive",
          color: ink,
          transform: "rotate(-0.6deg)",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            width: 240,
            height: 240,
            border: `6px dashed ${ink}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            opacity: 0.7,
          }}
        >
          QR
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 28 }}>
          Dragology
        </div>
        <div style={{ fontSize: 50, fontWeight: 500 }}>
          declarative-dragging.github.io
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            marginTop: 56,
            color: "#b91c1c",
            transform: "rotate(-3deg)",
          }}
        >
          Thanks!
        </div>
      </div>
    </div>
  );
}
