// Pieces of the back half of the talk (Andrew's part: the demos, Hazel, where
// the ideas came from, and the close). The slides themselves are in the
// outline in slides.tsx, where their notes can be edited in place.

import qrcode from "qrcode-generator";
import {
  Children,
  type CSSProperties,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DemoContext,
  DemoDraggable,
  type DemoToggleSettings,
} from "../demo/ui";
import "../studio/shantell-sans";
import {
  makeDraggable as makeStickyNotes,
  initialState as stickyInitialState,
} from "../studio/sticky-notes";
import { PAPER_OP_STYLE } from "../studio/StudioHackContext";
import { CODE_FONT } from "../talk/fonts";
import { OP_NAMES } from "../talk/opMarks";
import { EmbedSlide } from "./EmbedSlide";
import hazelProgram from "./hazel-demo-program.txt?raw";
import { ClosingMontageBackdrop } from "./montage/closing";
import { type Sample, useCue } from "./rails";
import {
  DemoSlide,
  slideFileUrl,
  useSlideCurrent,
  useSlideShown,
  useSlideStep,
} from "./slide";
import { sourceSans } from "./source-sans";

const EASE = "cubic-bezier(0.45, 0, 0.25, 1)";

/** A file in public/slides/back-half */
function file(name: string) {
  return slideFileUrl(`back-half/${name}`);
}

// ── Code callouts ──

// Code as the live-code slide shows it: DejaVu Sans Mono in its "quiet"
// colors, with drag spec operators' names in the paper's style
const CODE_COLORS = {
  text: "#18181b",
  punctuation: "#a1a1aa",
  string: "#0f766e",
  literal: "#c2410c",
};

// What's highlighted at a step is ringed in the live-code slide's highlight
// color, with a faint wash of it multiplied over the code (tinting the
// operators a little too, without dimming the text); both draw themselves in
// from the left as the step arrives
const HL_COLOR = "#d946ef";
const HL_RING = "0.12em";
const HL_FILL = "rgba(217, 70, 239, 0.15)";
const HL_INSET = "-0.14em -0.1em";
const HL_WIPE_MS = 800;
const HL_KEYFRAMES = `@keyframes code-hl-wipe {
  from { clip-path: inset(-20% 100% -20% 0); }
  to { clip-path: inset(-20% 0 -20% 0); }
}`;

/** Code highlighted at the given steps, in a CodeCallout (which draws it) */
export function Hl({ children }: { at: number[]; children: ReactNode }) {
  return <>{children}</>;
}

type Piece = { text: string; lit: boolean };
type Token = { text: string; style?: CSSProperties };
/** Neighbouring code on one line that's lit, or not, together */
type Run = { lit: boolean; text: string; tokens: Token[] };

/** A callout's code as pieces, lit where an Hl is at `step` */
function codePieces(children: ReactNode, step: number): Piece[] {
  const out: Piece[] = [];
  Children.forEach(children, (child) => {
    if (typeof child === "string") out.push({ text: child, lit: false });
    else if (
      isValidElement<{ at: number[]; children: ReactNode }>(child) &&
      child.type === Hl
    ) {
      const lit = child.props.at.includes(step);
      Children.forEach(child.props.children, (c) => {
        if (typeof c === "string") out.push({ text: c, lit });
      });
    }
  });
  return out;
}

const TOKEN =
  /("[^"]*")|(\d+|true|false)\b|([A-Za-z_]\w*)|([()[\]{},.:=>])|(\s+|.)/g;

/**
 * The pieces as lines of runs, colored. A name is an operator's if it
 * follows a dot, or starts the code (as in `{"d."}<Hl>vary</Hl>`, it
 * follows one across pieces).
 */
function codeRuns(pieces: Piece[]): Run[][] {
  const lines: Run[][] = [[]];
  let prev = "";
  for (const { text, lit } of pieces) {
    text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      const line = lines[lines.length - 1];
      for (const [tok, str, literal, name, punct] of part.matchAll(TOKEN)) {
        const style: CSSProperties | undefined = str
          ? { color: CODE_COLORS.string }
          : literal
            ? { color: CODE_COLORS.literal }
            : name && OP_NAMES.has(name) && (prev === "." || prev === "")
              ? { ...PAPER_OP_STYLE, padding: "0 2px", borderRadius: 2 }
              : punct
                ? { color: CODE_COLORS.punctuation }
                : undefined;
        const last = line[line.length - 1];
        if (last && last.lit === lit) {
          last.tokens.push({ text: tok, style });
          last.text += tok;
        } else line.push({ lit, text: tok, tokens: [{ text: tok, style }] });
        if (tok.trim()) prev = tok;
      }
    });
  }
  return lines;
}

/** Which runs are lit, by line, as `line:text` */
function litRuns(lines: Run[][]) {
  return new Set(
    lines.flatMap((line, i) =>
      line.filter((r) => r.lit).map((r) => `${i}:${r.text}`),
    ),
  );
}

function RunView({ run, entering }: { run: Run; entering: boolean }) {
  const mark = (style: CSSProperties) => (
    <span
      style={{
        position: "absolute",
        inset: HL_INSET,
        borderRadius: "0.3em",
        pointerEvents: "none",
        animation: entering
          ? `code-hl-wipe ${HL_WIPE_MS}ms cubic-bezier(.3, .7, .3, 1) both`
          : undefined,
        ...style,
      }}
    />
  );
  return (
    <span style={{ position: "relative" }}>
      {/* The wash and the ring both go over the code, operators and all */}
      {run.lit &&
        mark({ background: HL_FILL, mixBlendMode: "multiply", zIndex: 1 })}
      {run.tokens.map((t, i) =>
        t.style ? (
          <span key={i} style={t.style}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}
      {run.lit && mark({ border: `${HL_RING} solid ${HL_COLOR}`, zIndex: 2 })}
    </span>
  );
}

/**
 * Code in a corner of the stage, shown from step `from`, with its `Hl`s
 * ringed at their steps. Put it beside a DemoSlide, not in it, so that it's
 * drawn at stage scale.
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
  const step = useSlideStep();
  const shown = step >= from;
  const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  const lines = codeRuns(codePieces(children, step));
  // Runs lit now that weren't at the step before wipe in; arriving, they're
  // just there
  const prevStep = useRef<number | null>(null);
  const before =
    prevStep.current === null || prevStep.current === step
      ? null
      : litRuns(codeRuns(codePieces(children, prevStep.current)));
  useEffect(() => {
    prevStep.current = step;
  }, [step]);
  return (
    <pre
      style={{
        position: "absolute",
        [v]: 72,
        [h]: 64,
        zIndex: 10,
        isolation: "isolate",
        margin: 0,
        padding: "22px 30px",
        fontFamily: CODE_FONT,
        fontSize: 36,
        lineHeight: 1.55,
        color: CODE_COLORS.text,
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
      <style>{HL_KEYFRAMES}</style>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {line.map((run, j) => (
            <RunView
              key={`${j}:${run.text}:${run.lit}`}
              run={run}
              entering={!!before && run.lit && !before.has(`${i}:${run.text}`)}
            />
          ))}
        </Fragment>
      ))}
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

/**
 * A recording played in sections, one a step: the video `name` (in
 * public/slides/back-half) plays from `stops[step]` to the next stop, or to
 * the end at the last one. It arrives still, on its first frame, and starts
 * on the first → or Space. Moving on before a section ends carries straight
 * on into the next one; a section that ends first waits at its stop. Going
 * back a step, or jumping in, plays that step's section afresh.
 */
export function StagedVideo({
  name,
  stops = [0],
}: {
  name: string;
  stops?: number[];
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const step = useSlideStep();
  const current = useSlideCurrent();
  const cue = useCue(current);
  // Read when the step changes, not watched: a re-render with an equal (new)
  // array mustn't replay a section that has finished
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  // The step it last played for, or null when it isn't on screen
  const playedRef = useRef<number | null>(null);
  // Escape pauses it where it is; the next step plays on from there
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey) return;
      cue.current = null;
      ref.current?.pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, cue]);
  useEffect(() => {
    const video = ref.current!;
    const stops = stopsRef.current;
    const last = playedRef.current;
    playedRef.current = current ? step : null;
    if (!current) {
      cue.current = null;
      video.pause();
      video.currentTime = stops[0];
      return;
    }
    if (step >= stops.length) return;
    const start = stops[step];
    const end = stops[step + 1] ?? Infinity;
    // The same step again (Fast Refresh re-running this) leaves it be. On
    // from the step before, it carries on from wherever it's got to.
    if (last !== step) {
      cue.current = null;
      if (last !== step - 1) video.currentTime = start;
      const go = () => void video.play()?.catch(() => {});
      if (last === null && step === 0) cue.current = go;
      else go();
    }
    let frame = 0;
    const check = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
      } else {
        frame = video.requestVideoFrameCallback(check);
      }
    };
    frame = video.requestVideoFrameCallback(check);
    return () => video.cancelVideoFrameCallback(frame);
  }, [current, step, cue]);
  return (
    <video
      ref={ref}
      src={file(name)}
      // Its first frame, beside it: shown until the video has one to show
      // (and in slide snapshots, whose browser may not decode it)
      poster={file(name.replace(/\.mp4$/, ".jpg"))}
      muted
      playsInline
      preload="auto"
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

// The study's findings as sticky notes, from the studio section the
// submission video was shot from. There the notes start below the canvas,
// out of shot; here they peek up from the bottom edge, ready to drag in. Each
// snaps to its place on the board once it's dragged near it. They wait in
// groups, in the order they're brought in (yellow, green, orange, blue),
// peeking up only a sliver, their text below the edge; the greens step
// down left to right.
const STUDY_NOTE_REST = [
  { x: 10, peek: 14 },
  { x: 222, peek: 30 },
  { x: 282, peek: 20 },
  { x: 342, peek: 10 },
  { x: 556, peek: 25 },
  { x: 758, peek: 22 },
  { x: 800, peek: 12 },
];
const studyInitialState = {
  ...stickyInitialState,
  notes: stickyInitialState.notes.map((note, i) => ({
    ...note,
    x: STUDY_NOTE_REST[i].x,
    y: 540 - STUDY_NOTE_REST[i].peek,
  })),
};

// Without the studio's drag marks or chaining checkbox (still there, hidden,
// for the exit to tick). The chain's links show once the exit chains them.
const studyNotes = makeStickyNotes({ marks: false, chainingToggle: false });

/** The user study, its findings on sticky notes dragged onto the board */
export function StudySlide() {
  return (
    // The chaining checkbox lets go of focus once clicked, so that Space
    // goes on with the talk instead of unticking it
    <div
      style={{ display: "contents" }}
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement) e.target.blur();
      }}
    >
      <DemoSlide width={960} height={540}>
        <DemoDraggable
          draggable={studyNotes}
          initialState={studyInitialState}
          width={960}
          height={540}
        />
      </DemoSlide>
    </div>
  );
}

/**
 * The study slide's exit, for its rails `script`: with the notes chained
 * (switched on here if they aren't), the last note is dragged far off the
 * right of the stage and the rest follow it off. A real pointer can't leave
 * the screen, so this one is scripted.
 */
export function studyExit(frame: HTMLElement): Sample[] | null {
  const stage = frame.parentElement!;
  const note = stage.querySelector("g#note-7");
  if (!note) return null;
  const chaining = stage.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (chaining && !chaining.checked) {
    // With a pointerdown first, like a real click: after a drag, the
    // renderer swallows a click that comes without one
    chaining.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    chaining.click();
    chaining.blur();
  }

  // Grab the note in the middle of the part of it that's on the stage
  const f = frame.getBoundingClientRect();
  const r = note.getBoundingClientRect();
  const mid = (lo: number, hi: number) => (lo + hi) / 2;
  const x =
    (mid(Math.max(r.left, f.left), Math.min(r.right, f.right)) - f.left) /
    f.width;
  const y =
    (mid(Math.max(r.top, f.top), Math.min(r.bottom, f.bottom)) - f.top) /
    f.height;

  // Hover, press (after chaining has re-rendered), then pull away, under way
  // at once and speeding up, to well past the edge: the diagram pulls 5×
  // harder out there
  const PRESS = 250;
  const PULL = 2400;
  const END_X = 1.6;
  const pull: Sample[] = Array.from({ length: 48 }, (_, i) => {
    const u = (i + 1) / 48;
    return {
      t: PRESS + 100 + u * PULL,
      x: x + (END_X - x) * (0.45 * u + 0.55 * u * u),
      y,
      down: true,
    };
  });
  return [
    { t: 0, x, y, down: false },
    { t: PRESS, x, y, down: true },
    ...pull,
    { t: PRESS + PULL + 200, x: END_X, y, down: false },
  ];
}

const TREE_DOTS = ["root", "a", "a1", "a2", "b", "b1", "b2"];

/**
 * A script for the 7→7 twisted trees that drags itself around: each track is
 * one drag of a random dot to the middle of a bubble it isn't in, made from
 * where things are now, so it's for a `loop`ing Rails. Each track starts
 * where the last one let go.
 */
export function twistedTreesWander(): (frame: HTMLElement) => Sample[] | null {
  let from: { x: number; y: number } | null = null;
  return (frame) => {
    const stage = frame.parentElement!;
    const f = frame.getBoundingClientRect();
    // Centers and radii, in the frame's pixels
    const circle = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - f.left,
        y: r.top + r.height / 2 - f.top,
        r: r.width / 2,
      };
    };
    const dots = TREE_DOTS.flatMap((id) => {
      const el = stage.querySelector(`circle[id="${id}"]`);
      return el ? [circle(el)] : [];
    });
    const bubbles = [...stage.querySelectorAll('circle[id^="bg-circle-"]')].map(
      circle,
    );
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    const dot = pick(dots);
    if (!dot) return null;
    const target = pick(
      bubbles.filter((b) => Math.hypot(b.x - dot.x, b.y - dot.y) > b.r),
    );
    if (!target) return null;

    // Glide over to the dot (first time, after the demo has faded in), press,
    // drag along a slight arc, hold, let go, and rest while the drop settles
    const LEAD = from ? 0 : 900;
    const GLIDE = 700;
    const PRESS = LEAD + GLIDE + 150;
    const DRAG = 1500;
    const RELEASE = PRESS + DRAG + 300;
    const REST = 1100;
    const start = from ?? { x: dot.x + 70, y: dot.y + 90 };
    const ease = (u: number) =>
      u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const at = (t: number, x: number, y: number, down: boolean): Sample => ({
      t,
      x: x / f.width,
      y: y / f.height,
      down,
    });
    const glide = Array.from({ length: 20 }, (_, i) => {
      const u = ease((i + 1) / 20);
      return at(
        LEAD + ((i + 1) / 20) * GLIDE,
        start.x + (dot.x - start.x) * u,
        start.y + (dot.y - start.y) * u,
        false,
      );
    });
    const dx = target.x - dot.x;
    const dy = target.y - dot.y;
    const drag = Array.from({ length: 45 }, (_, i) => {
      const v = (i + 1) / 45;
      const u = ease(v);
      const bow = 0.15 * Math.sin(Math.PI * u);
      return at(
        PRESS + 100 + v * DRAG,
        dot.x + dx * u - dy * bow,
        dot.y + dy * u + dx * bow,
        true,
      );
    });
    from = { x: target.x, y: target.y };
    return [
      at(LEAD, start.x, start.y, false),
      ...glide,
      at(PRESS, dot.x, dot.y, true),
      ...drag,
      at(RELEASE, target.x, target.y, false),
      at(RELEASE + REST, target.x, target.y, false),
    ];
  };
}

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
      // Space advances the talk even after a click into Hazel; the demo only
      // drags, so Hazel doesn't need it
      space="slideshow"
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
  // The map drops in a moment after the slide comes on
  const shown = useSlideShown();
  const [mapShown, setMapShown] = useState(false);
  useEffect(() => {
    if (!shown) return setMapShown(false);
    const timer = setTimeout(() => setMapShown(true), 1500);
    return () => clearTimeout(timer);
  }, [shown]);
  const mapW = 620;
  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      <Picture name="walk-trail.jpg" fit="cover" />
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
 * avatar with the arrow keys, so it gets those; Escape, then →, or
 * Ctrl+→, moves on.
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

/** Where the closing slide's QR code goes */
const SITE_URL = "https://declarative-dragging.github.io/";

/**
 * How the closing slide's montage sits behind its card: "dim" darkens it,
 * "fade" washes it out toward white
 */
const CLOSE_BACKDROP: "dim" | "fade" = "dim";

/** A QR code, drawn as crisp squares filling its width; leave a quiet zone around it */
function QrCode({ text }: { text: string }) {
  const { n, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { n, path };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      style={{ display: "block", width: "100%", aspectRatio: "1" }}
    >
      <path d={path} fill="#111827" />
    </svg>
  );
}

/**
 * A card with a QR code for the site and our names, over a veil that dims
 * whatever's behind it. With `fromStep`, it waits for that step of its
 * slide (from 0), then the veil darkens and the card fades in.
 */
export function CallToActionCard({ fromStep }: { fromStep?: number }) {
  const step = useSlideStep();
  const shown = fromStep === undefined || step >= fromStep;
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            CLOSE_BACKDROP === "dim"
              ? "rgba(15, 23, 42, 0.55)"
              : "rgba(255, 255, 255, 0.65)",
          opacity: shown ? 1 : 0,
          transition: "opacity 900ms ease",
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "scale(1)" : "scale(0.94)",
          transition: shown
            ? "opacity 600ms ease 250ms, transform 600ms ease 250ms"
            : "opacity 400ms ease, transform 400ms ease",
        }}
      >
        <div
          // One column as wide as the address; the QR code a little narrower
          className="bg-white"
          style={{
            display: "grid",
            gridTemplateColumns: "max-content",
            boxShadow:
              "0 32px 84px rgba(0,0,0,0.45), 0 8px 22px rgba(0,0,0,0.2)",
            border: "1px solid #e5e7eb",
            borderRadius: 24,
            padding: "44px 44px 36px",
            rowGap: 14,
            fontFamily: sourceSans,
            color: "#1f2937",
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              textAlign: "center",
              whiteSpace: "nowrap",
              marginBottom: 10,
            }}
          >
            Declarative Dragging
          </div>
          <div style={{ width: 296, justifySelf: "center" }}>
            <QrCode text={SITE_URL} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, whiteSpace: "nowrap" }}>
            {SITE_URL.replace(/^https:\/\/|\/$/g, "")}
          </div>
          <div
            style={{
              alignSelf: "stretch",
              textAlign: "right",
              fontSize: 30,
              lineHeight: 1.3,
              marginTop: 6,
              whiteSpace: "nowrap",
            }}
          >
            <div>Joshua Horowitz</div>
            <div>Andrew Blinn</div>
            <div>Jeffrey Heer</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The close as a slide of its own: the montage of what people might build,
 * zoomed all the way out, behind the card. (Presented as the closing
 * montage's last step instead, so its canvas carries on.)
 */
export function CallToActionSlide() {
  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      <ClosingMontageBackdrop />
      <CallToActionCard />
    </div>
  );
}
