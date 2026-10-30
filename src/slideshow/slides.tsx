import _ from "lodash";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DemoDraggable } from "../demo/ui";
import ringOfBeadsSource from "../demos/ring-of-beads-vanilla-js/ringOfBeads.ts?raw";
import { DraggableRenderer } from "../DraggableRenderer";
import { LETTER_FONT } from "../talk/fonts";
import {
  CODE_FLEX,
  DIAGRAM_FILL,
  DIAGRAM_FLEX,
  LiveCode,
} from "../talk/LiveCodePage";
import { slideSnippet } from "../talk/snippets";
import {
  CallToActionSlide,
  CodeCallout,
  ElliotSlide,
  HazelSlide,
  Hl,
  NoolClassicSlide,
  RailsVideo,
  StepToggles,
  studyExit,
  StudySlide,
  SupernoolSlide,
  WalkSlide,
  WhiteboardSlide,
} from "./back-half";
import { BehaviorDiagramSlide } from "./behavior-diagram";
import { beadsSubject } from "./model-driven/beads";
import { script as modelDrivenScript } from "./model-driven/ModelDrivenScene";
import {
  LiveDragLoop,
  ModelDrivenSlide,
} from "./model-driven/ModelDrivenSlide";
import { ClosingMontageSlide } from "./montage/MontageCanvas";
import { Rails } from "./rails";
import { robotoMono } from "./roboto-mono";
import {
  DemoLink,
  DemoSlide,
  type Heading,
  ImageSlide,
  type Slide,
  slideFileUrl,
  STAGE_H,
  STAGE_W,
  useSlideArrivedForward,
  useSlideCurrent,
  useSlideShown,
  useSlideStep,
} from "./slide";
import { sourceSans } from "./source-sans";

/** The live editor (#/talk/livecode) on the stage, with just one code block. */
function LiveCodeSlide() {
  const step = useSlideStep();
  const current = useSlideCurrent();
  const shown = useSlideShown();
  // Not until its layer shows, too: focus can't get into a hidden one
  const hasKeyboard = current && shown;
  return (
    // Absolute, so the stage sizes it: in the slide's own flow, a longer
    // program would grow the slide and push the diagram down.
    <div style={{ position: "absolute", inset: 0 }}>
      <LiveCode
        snippets={[slideSnippet]}
        highlight={step === 0}
        excerpt={step === 2}
        hasKeyboard={hasKeyboard}
      />
    </div>
  );
}

/**
 * The library's title, beside the ring of beads, live. The ring sits right
 * where the live-code slide that follows draws it, and the same size, so
 * fading from one to the other leaves it in place.
 *
 * Coming from the live drag, the ring starts where that slide left it, so
 * the crossfade between them leaves it in place too; then it glides over,
 * and the title comes in.
 */
function DragologyTitleSlide() {
  const { width, height } = beadsSubject;
  // The live editor's diagram pane: its share of the stage's width, all of
  // its height
  const paneX = (STAGE_W * CODE_FLEX) / (CODE_FLEX + DIAGRAM_FLEX);
  const paneW = STAGE_W - paneX;
  const scale = Math.min(
    (paneW * DIAGRAM_FILL) / width,
    (STAGE_H * DIAGRAM_FILL) / height,
  );
  const ringAt = (x: number, y: number, scale: number) =>
    `translate(${x - (width / 2) * scale}px, ${y - (height / 2) * scale}px) scale(${scale})`;
  const ringHome = ringAt(paneX + paneW / 2, STAGE_H / 2, scale);
  const { bigAside } = modelDrivenScript;
  const ringFromLiveDrag = ringAt(bigAside.x, bigAside.y, bigAside.scale);

  const phase = useArrivalGlide();
  const settled = phase !== "start";
  const glide = (props: string[], delay: number) =>
    phase === "gliding"
      ? props.map((p) => `${p} ${TITLE_GLIDE} ${delay}ms`).join(", ")
      : "none";

  return (
    <div style={{ position: "absolute", inset: 0, background: "white" }}>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          opacity: settled ? 1 : 0,
          transform: settled ? "none" : "translateX(-40px)",
          transition: glide(["opacity", "transform"], TITLE_IN_DELAY_MS),
        }}
      >
        <div style={{ fontFamily: robotoMono, fontSize: 158, lineHeight: 1 }}>
          Dragology
        </div>
        <div
          style={{
            fontFamily: sourceSans,
            fontWeight: 300,
            fontSize: 46,
            marginTop: 20,
          }}
        >
          a library for Declarative Dragging
        </div>
      </div>
      <style>
        {`[data-title-ring] text[data-loc] { font-family: ${LETTER_FONT}; }`}
      </style>
      <div
        data-title-ring
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: settled ? ringHome : ringFromLiveDrag,
          transformOrigin: "top left",
          transition: glide(["transform"], RING_GLIDE_DELAY_MS),
        }}
      >
        <DraggableRenderer
          draggable={beadsSubject.draggable}
          initialState={beadsSubject.state}
          width={width}
          height={height}
        />
      </div>
    </div>
  );
}

const TITLE_GLIDE = "700ms cubic-bezier(0.4, 0, 0.2, 1)";
/** Long enough for the crossfade in, and the beads settling */
const RING_GLIDE_DELAY_MS = 350;
const TITLE_IN_DELAY_MS = 650;

/**
 * Where a slide that glides into place on arrival is in that: at the start,
 * as it's preloaded and while it fades in; gliding, once we've come to it
 * going forward; or at the end, having come to it any other way
 */
function useArrivalGlide(): "start" | "gliding" | "end" {
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

// The Model-Driven and Composable Dragging art (model-driven.png is
// 1125×1620, composable.png the same shape smaller), as the live drag and
// operators slides show it on the right on their second steps
const ART_H = 820;
const ART_W = (ART_H * 1125) / 1620;
const ART_CENTER_X = 1459;
const STEP_EASE = "600ms cubic-bezier(0.4, 0, 0.2, 1)";

function SideArt({ src, shown }: { src: string; shown: boolean }) {
  return (
    <img
      src={slideFileUrl(src)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        top: (STAGE_H - ART_H) / 2,
        left: ART_CENTER_X - ART_W / 2,
        height: ART_H,
        opacity: shown ? 1 : 0,
        // Its white background vanishes on the explainer's off-white
        mixBlendMode: "multiply",
        transition: `opacity ${STEP_EASE}`,
      }}
    />
  );
}

/**
 * Where we are in the talk: Declarative Dragging's two ideas, drawn with the
 * intro's art, the one we're on and the one to come, faded
 */
function RoadmapSlide({ on }: { on: "model-driven" | "composable" }) {
  const art = (src: string, centerX: number) => (
    <img
      src={slideFileUrl(src)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        top: 280,
        left: centerX - ART_W / 2,
        height: ART_H,
        opacity: src.startsWith(on) ? 1 : 0.2,
        mixBlendMode: "multiply",
      }}
    />
  );
  return (
    <div className="absolute inset-0 bg-white">
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 64,
          fontFamily: sourceSans,
          fontSize: 104,
        }}
      >
        Declarative Dragging
      </div>
      {art("model-driven.png", 580)}
      {art("composable.png", 1350)}
    </div>
  );
}

/**
 * The model-driven explainer's live drag; on the second step it moves left,
 * and the Model-Driven Dragging art comes in on the right.
 */
function LiveDragSlide() {
  const aside = useSlideStep() >= 1;
  return (
    <div className="absolute inset-0">
      <ModelDrivenSlide from={23} to={Infinity} aside={aside} />
      <SideArt src="model-driven.png" shown={aside} />
    </div>
  );
}

/**
 * The paper's table of operators, centered; on the second step it moves
 * left, and the Composable Dragging art comes in on the right.
 */
function OperatorsSlide() {
  const step = useSlideStep();
  // operators.png is 1494×1656
  const tableH = STAGE_H - 96;
  const tableW = (tableH * 1494) / 1656;
  const tableLeft = step === 0 ? (STAGE_W - tableW) / 2 : 110;
  return (
    <div className="absolute inset-0 bg-white">
      <img
        src={slideFileUrl("operators.png")}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          top: (STAGE_H - tableH) / 2,
          left: tableLeft,
          height: tableH,
          transition: `left ${STEP_EASE}`,
        }}
      />
      <SideArt src="composable.png" shown={step >= 1} />
    </div>
  );
}

// ── Demo wrappers ──

// We lazily import the demo components to keep the main bundle lean.
// Each demo module's default export is a `demo(Component, opts)` object.

import {
  draggableFactory as algebraDraggableFactory,
  initialState as algebraInitialState,
  rewriteSets,
} from "../demos/animate-algebra/tree";
import dragSpecDesignerDemo from "../demos/drag-spec-designer";
import {
  draggable as listsInListsDraggable,
  initialState as listsInListsInitialState,
} from "../demos/lists-in-lists";
import {
  PERM_TALK_HEIGHT,
  PERM_TALK_WIDTH,
  PermutationLabTalk,
} from "../demos/permutation-lab-talk";
import {
  initialState as beadsInitialState,
  makeDraggable,
} from "../demos/ring-of-beads";
import schedulerDemo from "../demos/scheduler";
import tactileTessellationsDemo from "../demos/tactile-tessellations";
import {
  allMorphs7,
  draggableFactory,
  initialState7,
} from "../demos/twisted-trees/index";
import { tree7 } from "../demos/twisted-trees/trees";

/** Every video in public/slides/montage, found at build time (only the names). */
const montageFiles = Object.keys(
  import.meta.glob("/public/slides/montage/*.mp4"),
)
  .map((p) => p.replace("/public/slides/", ""))
  .sort();

/**
 * The montage of drag and drop: clips cut one to the next on black, in name
 * order, round and round. It starts from the first clip each time it's shown.
 * On its second step, a "Drag and Drop" inset comes in over it, low down,
 * out of the way of the clips' action, which is mostly in the middle.
 */
function MontageSlide() {
  const shown = useSlideShown();
  const current = useSlideCurrent();
  const [clip, setClip] = useState(0);
  if (!shown && clip !== 0) setClip(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  // Only the current clip plays; the others wait at their first frame, so a
  // cut to one shows it at once
  useEffect(() => {
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (shown && i === clip) {
        video.play()?.catch(() => {});
      } else {
        video.pause();
        if (video.currentTime !== 0) video.currentTime = 0;
      }
    });
  }, [shown, clip]);

  return (
    <div className="absolute inset-0" style={{ background: "black" }}>
      {montageFiles.map((file, i) => (
        <video
          key={file}
          ref={(el) => {
            videos.current[i] = el;
          }}
          src={slideFileUrl(file)}
          preload="auto"
          muted
          playsInline
          // Once we've gone on, a clip that ends holds on its last frame, so
          // there's no cut while the slide fades out
          onEnded={() => current && setClip((i + 1) % montageFiles.length)}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ visibility: i === clip ? "visible" : "hidden" }}
        />
      ))}
      <SlideInsets insets={[null, dragAndDropInset]} bottom={96} />
    </div>
  );
}

// The Declarative Dragging slide: two rows of demo videos scroll endlessly in
// opposite directions behind an inset that changes with each step.

/** Every video in public/slides/awe, found at build time (only the names). */
const reelFiles = Object.keys(import.meta.glob("/public/slides/awe/*.mp4"))
  .map((p) => p.replace("/public/slides/", ""))
  .sort();

const REEL_ROW_H = 480;
const REEL_GAP = 32;
/** How fast the rows scroll, in stage pixels per second */
const REEL_SPEED = 60;
/** How long a video's last frame takes to crossfade into its start */
const REEL_CROSSFADE_S = 0.5;

// Each row gets every other video
const reelRows: { files: string[]; direction: "left" | "right" }[] = [
  { files: reelFiles.filter((_, i) => i % 2 === 0), direction: "left" },
  { files: reelFiles.filter((_, i) => i % 2 === 1), direction: "right" },
];

/** An inset drawn as a whole, margins and all, in an image in public/slides */
function ImageInset({ src }: { src: string }) {
  return (
    <img
      src={slideFileUrl(src)}
      alt=""
      draggable={false}
      style={{ display: "block", height: 720 }}
    />
  );
}

/**
 * Insets over a slide's background, one per step, each fading in as its step
 * comes. A step whose inset is null shows just the background.
 */
function SlideInsets({
  insets,
  bottom,
}: {
  insets: ReactNode[];
  /**
   * How far above the stage's bottom edge to put the insets, rather than in
   * the middle
   */
  bottom?: number;
}) {
  const step = useSlideStep();
  return insets.map(
    (inset, i) =>
      inset != null && (
        <div
          key={i}
          className={`absolute inset-0 flex justify-center ${
            bottom === undefined ? "items-center" : "items-end"
          }`}
          style={{
            paddingBottom: bottom,
            transformOrigin: bottom === undefined ? undefined : "bottom",
            opacity: i === step ? 1 : 0,
            transform: i === step ? "scale(1)" : "scale(0.94)",
            transition: "opacity 400ms ease, transform 400ms ease",
            pointerEvents: "none",
          }}
        >
          <div
            className="bg-white"
            style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.35)" }}
          >
            {inset}
          </div>
        </div>
      ),
  );
}

/** An inset that's a line of title text, after an optional icon */
function TitleInset({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center"
      style={{
        fontFamily: sourceSans,
        fontSize: 96,
        whiteSpace: "nowrap",
        padding: "48px 64px",
        gap: 40,
      }}
    >
      {children}
    </div>
  );
}

// Lucide's "grab" icon (ISC license), a closed hand
const grabHandPaths = [
  "M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4",
  "M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",
  "M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5",
  "M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
  "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0",
];

/**
 * A grabbing hand carrying a card away from the dashed outline of where it
 * was
 */
function DragAndDropIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={2} y={18} width={14} height={14} rx={2} strokeDasharray="3 3" />
      <rect
        x={12}
        y={4}
        width={14}
        height={14}
        rx={2}
        fill="currentColor"
        fillOpacity={0.15}
      />
      <g transform="translate(12 9) scale(0.95)">
        {/* The hand's outline is open, so fill it in a pass of its own, under
            the strokes, to hide the card behind it */}
        {grabHandPaths.map((d) => (
          <path key={`fill-${d}`} d={d} fill="white" stroke="none" />
        ))}
        {grabHandPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

const dragAndDropInset = (
  <TitleInset>
    <DragAndDropIcon size={120} />
    Drag and Drop
  </TitleInset>
);

/** The insets, one per step */
const introInsets: ReactNode[] = [
  <TitleInset>Declarative Dragging</TitleInset>,
  <ImageInset src="model-driven.png" />,
  <ImageInset src="composable.png" />,
  // The wordmark from the Dragology title slide
  <div
    className="flex flex-col items-end"
    style={{ padding: "56px 72px 64px", whiteSpace: "nowrap" }}
  >
    <div style={{ fontFamily: robotoMono, fontSize: 144, lineHeight: 1 }}>
      Dragology
    </div>
    <div
      style={{
        fontFamily: sourceSans,
        fontSize: 44,
        fontWeight: 300,
        marginTop: 20,
      }}
    >
      a library for Declarative Dragging
    </div>
  </div>,
];

/**
 * A video that loops forever. Each time round, its last frame crossfades into
 * its start: the frame is copied to a canvas over the video, which fades out
 * once the video is playing again.
 */
function LoopingVideo({
  file,
  width,
  onAspect,
}: {
  file: string;
  width: number;
  onAspect: (file: string, aspect: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fill = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  } as const;
  return (
    <div
      className="rounded-2xl overflow-hidden border border-gray-200 bg-white"
      style={{ position: "relative", width, height: "100%", flexShrink: 0 }}
    >
      <video
        src={slideFileUrl(file)}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={(e) =>
          onAspect(
            file,
            e.currentTarget.videoWidth / e.currentTarget.videoHeight,
          )
        }
        onEnded={async (e) => {
          const video = e.currentTarget;
          const canvas = canvasRef.current!;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d")!.drawImage(video, 0, 0);
          canvas.style.transition = "none";
          canvas.style.opacity = "1";
          // Commit the opacity, so that the fade below starts from it
          canvas.getBoundingClientRect();
          video.currentTime = 0;
          await video.play();
          canvas.style.transition = `opacity ${REEL_CROSSFADE_S * 1000}ms linear`;
          canvas.style.opacity = "0";
        }}
        style={fill}
      />
      <canvas ref={canvasRef} style={{ ...fill, opacity: 0 }} />
    </div>
  );
}

function VideoReelRow({
  files,
  direction,
  aspects,
  onAspect,
}: {
  files: string[];
  direction: "left" | "right";
  aspects: Map<string, number>;
  onAspect: (file: string, aspect: number) => void;
}) {
  // Tiles are sized from their videos' aspect ratios, once known
  const widths = files.map((f) => REEL_ROW_H * (aspects.get(f) ?? 16 / 9));
  const setW = _.sum(widths) + REEL_GAP * files.length;
  // Each tile wraps around on its own, jumping from one end of the row to the
  // other while it's off-screen. That works so long as the row is wider than
  // the stage plus any one tile, so no tile is ever needed at both ends at
  // once; a row too short for that repeats its videos.
  const copies =
    files.length > 0 ? Math.ceil((STAGE_W + _.max(widths)!) / setW) : 0;
  const loopW = copies * setW;
  const tiles = _.range(copies).flatMap((c) =>
    files.map((file, i) => ({
      key: `${c}-${file}`,
      file,
      w: widths[i],
      x: c * setW + _.sum(widths.slice(0, i)) + REEL_GAP * i,
    })),
  );

  const tileEls = useRef(new Map<string, HTMLDivElement>());
  const [startTime] = useState(() => performance.now());
  const tilesKey = JSON.stringify(tiles);
  useLayoutEffect(() => {
    const sign = direction === "left" ? -1 : 1;
    const place = () => {
      const shift =
        (sign * REEL_SPEED * (performance.now() - startTime)) / 1000;
      for (const { key, w, x } of tiles) {
        // Where the tile is, wrapped into [-w, loopW - w)
        const wrapped = ((((x + shift + w) % loopW) + loopW) % loopW) - w;
        const el = tileEls.current.get(key);
        if (el) el.style.transform = `translateX(${wrapped}px)`;
      }
    };
    place();
    let raf = requestAnimationFrame(function tick() {
      place();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesKey, loopW, direction, startTime]);

  return (
    <div
      style={{ position: "relative", height: REEL_ROW_H, overflow: "hidden" }}
    >
      {tiles.map(({ key, file, w }) => (
        <div
          key={key}
          ref={(el) => {
            if (el) tileEls.current.set(key, el);
            else tileEls.current.delete(key);
          }}
          style={{ position: "absolute", top: 0, left: 0, height: "100%" }}
        >
          <LoopingVideo file={file} width={w} onAspect={onAspect} />
        </div>
      ))}
    </div>
  );
}

function DeclarativeDraggingIntro() {
  const [aspects, setAspects] = useState(() => new Map<string, number>());
  const onAspect = useCallback(
    (file: string, aspect: number) =>
      setAspects((prev) =>
        prev.get(file) === aspect ? prev : new Map(prev).set(file, aspect),
      ),
    [],
  );
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 flex flex-col justify-center"
        style={{ gap: REEL_GAP }}
      >
        {reelRows.map((row, i) => (
          <VideoReelRow
            key={i}
            {...row}
            aspects={aspects}
            onAspect={onAspect}
          />
        ))}
      </div>
      <SlideInsets insets={introInsets} />
    </div>
  );
}

/**
 * The ring of beads written without Dragology or React, from where a drag
 * starts to its event listeners, comments dropped: what you'd write
 * traditionally
 */
const vanillaDragExcerpt = (() => {
  const lines = ringOfBeadsSource.split("\n");
  const start = lines.findIndex((l) => l.includes("function startDrag"));
  const end = lines.findIndex((l) => l.includes('"pointercancel"'));
  if (start < 0 || end < start) {
    throw new Error("Drag code not found in ringOfBeads.ts");
  }
  const body = lines
    .slice(start, end + 1)
    .filter((l) => !l.trim().startsWith("//"))
    .map((l) => l.slice(2));
  return ["...", "", ...body, "", "..."].join("\n");
})();

function VanillaDragCode() {
  return (
    <pre
      style={{
        margin: 0,
        padding: "28px 40px",
        fontFamily: robotoMono,
        fontSize: 20,
        lineHeight: 1.3,
      }}
    >
      {vanillaDragExcerpt}
    </pre>
  );
}

// @ts-expect-error -- kept around for a possible d.between slide
function BeadsBetween() {
  const draggable = useMemo(() => makeDraggable("d.between()"), []);
  return (
    <>
      <DemoDraggable
        draggable={draggable}
        initialState={beadsInitialState}
        width={300}
        height={300}
      />
    </>
  );
}

// Twisted trees — just the 7→7 tree, no config panel
function TwistedTrees7() {
  const draggable = useMemo(
    () =>
      draggableFactory(
        tree7,
        tree7,
        allMorphs7,
        {
          oneNodeAtATime: false,
          showTradRep: false,
          interpolation: "natural-neighbor",
          dragQuality: "good",
        },
        500,
        undefined,
      ),
    [],
  );
  return (
    <>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState7}
        width={400}
        height={600}
      />
    </>
  );
}

// Lists in lists — no DemoNotes
function ListsInListsClean() {
  return (
    <>
      <DemoDraggable
        draggable={listsInListsDraggable}
        initialState={listsInListsInitialState}
        width={400}
        height={400}
      />
    </>
  );
}

// Animate algebra (tree variant) — no config panel
function AnimateAlgebraClean() {
  const draggable = useMemo(
    () =>
      algebraDraggableFactory({
        // The defaults, plus associativity's "pull up/down operand" (sets 5
        // and 6), so an operand can chain its way around the tree
        activeRewriteSets: rewriteSets.map(
          (rs, i) => (rs.defaultEnabled ?? false) || i === 5 || i === 6,
        ),
        enableEmergeAnimation: true,
        forceTransformScale: false,
      }),
    [],
  );
  return (
    <>
      <DemoDraggable
        draggable={draggable}
        initialState={algebraInitialState}
        width={300}
        height={350}
      />
    </>
  );
}

// ── Slide sequence ──

/** The slides, with headings among them. */
export const outline: (Slide | Heading)[] = [
  { heading: "Intro" },
  {
    content: <ImageSlide src="earth.jpg" />,
    notes: `
      A photograph is a portal into another place on Earth.

      But graphical interfaces can be portals into other worlds.
    `,
  },
  {
    notes: `
      // prob 38 sec total

      Interfaces can show you worlds of information, imagination, structures, patterns, simulation.

      And unlike photographs, interfaces let us reach into these worlds, tug things around, and see how they respond.

      ---
      Often, we do this with drag and drop, which gives us virtual hands to act in virtual worlds

      But drag-and-drop interactions are difficult to make, or at least difficult to make **well**. If you want interactions with the fluidity and tangibility of an imagined world, you'll need complex and cross-cutting choreography.

      We think interface inventors need better infrastructure.
    `,
    steps: 2,
    content: <MontageSlide />,
  },
  {
    steps: 4,
    transition: "fade-white",
    content: <DeclarativeDraggingIntro />,
    notes: `
      // Design concept: endless array of animated demos scrolls right to left in background, as we show insets: “Declarative Dragging”, “Model-Driven”, and “Composable”, “Dragology”

      So we’d like to share **Declarative Dragging**, a new approach which makes it possible to build higher quality drag-and-drop interfaces with less work.

      Declarative Dragging combines two ideas.

      ---

      The first is defining drags in terms of semantic transformations, rather than low-level logic.
      We call that **model-driven dragging**.

      ---

      To make it possible for model-driven dragging to express different drag-and-drop styles, we extend it with a powerful DSL of behaviors. We call that **composable dragging**.

      ---

      The demos we’ve been teasing in the background here were made with a new library called **Dragology**, based on these two ideas.

      Let’s dive in and look at how these ideas work.
    `,
  },

  { heading: "Model-driven dragging" },
  {
    transition: "fade-white",
    // Then the drag code you'd write without a library, over the ring
    steps: 2,
    notes: `
      We’ll start with a simple drag-and-drop interface for reordering beads in a ring.

      ---

      Traditionally you would make this manually, by adding listeners to pointer events, and managing ephemeral state during the drag.
    `,
    content: (
      <div className="absolute inset-0 bg-white">
        <LiveDragLoop frame={{ x: STAGE_W / 2, y: STAGE_H / 2, scale: 3 }} />
        <DemoLink demoId="ring-of-beads" />
        <SlideInsets insets={[null, <VanillaDragCode />]} />
      </div>
    ),
  },
  {
    transition: "fade-white",
    notes: `
      **Model-driven dragging** works at a higher level.
    `,
    content: <RoadmapSlide on="model-driven" />,
  },
  {
    transition: "fade-white",
    notes: `
      First, the interface developer implements a static version of the interface as a function from a model state to a view tree, like in React.
    `,
    content: <ModelDrivenSlide from={0} />,
  },
  {
    notes: `
      Next, they specify, for each draggable element, a set of new model states the user should be able to **access** by dragging that element.

      In this case, that means states that move the dragged element to a new position in the array.
    `,
    content: <ModelDrivenSlide from={7.5} to={9} />,
  },
  {
    notes: `
      When a drag starts, an engine speculatively renders each of these states to a view...
    `,
    content: <ModelDrivenSlide from={14.7} to={17.2} />,
  },
  {
    // The dragged element singled out in each view; then the views line up
    // and send its positions down onto one ring
    steps: 2,
    notes: `
      ... and examines where the dragged element ends up in each of these hypothetical future worlds.

      Putting all this information together...

      ---
      // keep going
    `,
    content: <ModelDrivenSlide from={17.5} stops={[20.6]} to={23} />,
  },
  {
    notes: `
      // These views and positions provide 
      ... the engine has enough information to run a high-quality animated drag-and-drop interaction.

      ---

      That’s the core idea of model-driven dragging: synthesizing a drag-and-drop interaction from semantics, by speculatively rendering future model states.

      // Consider: introduce repositional drags
    `,
    steps: 2,
    content: <LiveDragSlide />,
  },

  { heading: "Live-coding, composable dragging" },
  {
    // The ring glides over from the live drag
    transition: "fade",
    notes: `
      To show you how this works in practice, and introduce the complementary concept of composable dragging, we’ll make this ring demo using our library Dragology.
    `,
    content: <DragologyTitleSlide />,
  },
  {
    transition: "fade",
    // Highlighting is on for the first stage, off after. The third
    // shows just the drag spec, with the spec tree, in the studio's
    // layout.
    steps: 3,
    notes: `
      This "draggable" is a function that, given a model state, returns a static view.
      Here’s the line that draws the background ring…
      And this SVG group renders each of the beads, in a loop.
      This interface isn't draggable yet. [demonstrate]
      We want to make each of these beads draggable.
      [next stage to turn off highlight]

      ---
      So we'll go to the beads and add a special attribute, called “dragologyOnDrag”.
      We'll set it to a handler function with two parts.
      First, we'll compute the set of states reachable by dragging the bead.
        And we'll do that using a readymade function down here.
      Second, we'll use Dragology's domain-specific language to specify HOW drag-and-drop should access these states.
      We'll start with the simplest option, a combinator called "closest".
      Once we've added this, the beads are draggable!

      dragologyOnDrag={() => {
        const states = reinsertions(state, idx);
        return d.closest(states);
       }}

      ---
      "Closest" simply snaps the dragged element to the closest target position to the pointer.

      Our tree inspector, on the right, shows how the DSL operators create this behavior from rendered states.
      In this case, it shows how closest selects the closest target state, which is highlighted as we drag.

      This interaction is straightforward, but it’s slow to provide feedback to the user that their action is doing anything.

      ---
      So we can attach a modifier called “withFloating”. [demonstrate]
      "withFloating" detaches the dragged element, letting it follow the cursor immediately, giving the interaction a more responsive feel.
      Here, the inspector shows how withFloating takes the result returned by closest and detaches the dragged element from its original position.

      ---
      Finally, we can layer on a whole new feature. Maybe a bead should be removed if it’s dropped far from any target.
      We can do that with the “whenFar” modifier, using another helper function that produces the removed state. [removed(state, idx) BEFORE withFloating]
    `,
    content: <LiveCodeSlide />,
  },
  {
    transition: "fade-white",
    steps: 2,
    notes: `
      So what are these "d-dot" things we're returning from dragologyOnDrag? They're what we call **drag behaviors**: functions that run every frame during a drag, that take a changing pointer position and say what should be shown on the screen as a preview, and what state should be transitioned to on drop.

      ---

      As we apply operators like "withFloating", we're producing new behaviors from old ones.
    `,
    content: <BehaviorDiagramSlide />,
  },
  {
    steps: 2,
    notes: `
      You can actually make your own Dragology operators, but we've developed a core set that you can plug together in different ways to create a surprising variety of interactions. [TODO]

      ---
      Because this approach is centered around composing behaviors, we call it composable dragging.
      We’ve found that it lets us incrementally build up refined interactions while keeping the underlying simplicity of model-driven dragging.
      Andrew's going to share some more examples of what these ingredients can do together.
    `,
    content: <OperatorsSlide />,
  },

  { heading: "Demos" },
  // Scheduler (130-155s)
  {
    transition: "fade-white",
    steps: 4,
    notes: `
      This diagram of a scheduling problem uses a discrete drag, like we've seen before, to move meetings between rooms.

      ---

      But it also has a continuous drag to change start and end times. A continuous drag has an infinite number of possible destination states. You can't list them all.

      ---

      So our DSL offers an operator called "vary" which controls one or more numeric parameters in the model.

      ---

      Behind the scenes, Dragology uses numerical optimization to search for the best parameter settings. Numerical optimization lets us extend model-driven dragging to continuous state spaces.
    `,
    content: (
      <Rails id="scheduler">
        <>
          <DemoSlide
            width={560}
            height={212}
            overlayTitle="Alex’s Scheduler"
            demoId="scheduler"
          >
            <schedulerDemo.Component />
            <StepToggles byStep={[{}, {}, {}, { showVaryVisualizer: true }]} />
          </DemoSlide>
          <CodeCallout from={2}>
            {"d."}
            <Hl at={[2, 3]}>vary</Hl>
            {'(state, param("meetings", i, "end"))'}
          </CodeCallout>
        </>
      </Rails>
    ),
  },
  // Lists in Lists (155-170s)
  {
    transition: "fade-white",
    steps: 4,
    notes: `
      Vary can be combined freely with other behaviors using Dragology's DSL.

      ---

      This interface uses vary inside whenFar to combine a continuous drag on the canvas

      ---

      with a discrete drag into snapping points.

      ---

      This use of whenFar makes the snapping locations into discrete islands in a continuous ocean.
    `,
    content: (
      <Rails id="lists-in-lists">
        <>
          <DemoSlide
            width={400}
            height={400}
            overlayTitle="Lists in Lists"
            demoId="lists-in-lists"
          >
            <ListsInListsClean />
            <StepToggles byStep={[{}, {}, {}, { showDropZones: true }]} />
          </DemoSlide>
          <CodeCallout>
            {"d."}
            <Hl at={[2, 3]}>closest</Hl>
            {"(snapStates)\n .withFloating()\n "}
            <Hl at={[1]}>.whenFar(</Hl>
            <Hl at={[0, 1]}>d.vary(state, [x, y])</Hl>
            <Hl at={[1]}>)</Hl>
          </CodeCallout>
        </>
      </Rails>
    ),
  },
  // Tactile Tessellations (170-180s)
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      This tessellation editor uses this same pattern, where the discrete states are edge-to-edge snaps, and the continuous states are free-floating shapes.

      ---

      This example also shows how Dragology supports creating

      ---

      and destroying objects using some additional operators.
    `,
    content: (
      <Rails id="tactile-tessellations">
        <>
          <DemoSlide
            width={900}
            height={600}
            overlayTitle="Tactile Tessellations"
            demoId="tactile-tessellations"
          >
            <tactileTessellationsDemo.Component />
          </DemoSlide>
          <CodeCallout from={1} corner="top-right">
            <Hl at={[1]}>d.switchToStateAndFollow</Hl>
            {"(withNew, newId)\n"}
            <Hl at={[2]}>d.dropTarget</Hl>
            {'("trash", without)'}
          </CodeCallout>
        </>
      </Rails>
    ),
  },
  // Twisted Trees (210-230s) — single slide combining both
  {
    transition: "fade-white",
    steps: 2,
    notes: `
      Our next operator, called "between", interpolates between previews as you drag. In this diagram of an order-preserving map between trees, the black dots can be dragged freely between the gray bubbles. As you drag, bubbles grow, anticipating the arrival of the dot.

      ---

      // purple overlay comes on
      "Between" produces this interpolation by tracking the dot's position in a triangulation of target positions.
    `,
    content: (
      <Rails id="twisted-trees">
        <DemoSlide
          width={400}
          height={600}
          overlayTitle="Twisted Trees"
          demoId="twisted-trees"
        >
          <TwistedTrees7 />
          <StepToggles
            byStep={[{ showDebugOverlay: false }, { showDebugOverlay: true }]}
          />
        </DemoSlide>
      </Rails>
    ),
  },
  // Animate Algebra (190-210s)
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      Here, "between" is composed with two more operators. Each "between" makes a track to one destination state.

      ---

      The "closest", which we've seen before, reappears to combine these tracks together.

      ---

      And finally, Dragology's "chaining" feature lets you drag through multiple model states in a single gesture, instead of having to drop and drag again in intermediate states.
    `,
    content: (
      <Rails id="animate-algebra">
        <>
          <DemoSlide
            width={300}
            height={350}
            overlayTitle="Animate Algebra"
            demoId="animate-algebra-tree"
          >
            <AnimateAlgebraClean />
            <StepToggles byStep={[{}, { showDebugOverlay: true }]} />
          </DemoSlide>
          <CodeCallout>
            {"d."}
            <Hl at={[1]}>closest</Hl>
            {"(newTrees.map((t) =>\n  d."}
            <Hl at={[0]}>between</Hl>
            {"([state, t])))\n .withSnapRadius(1, { "}
            <Hl at={[2]}>chain: true</Hl>
            {" })"}
          </CodeCallout>
        </>
      </Rails>
    ),
  },
  // Permutation Playground
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      We found Dragology to be particularly suited to interfaces that combine parallel representations, where you see the same system from different perspectives.
      This is a playground for experimenting with permutations. Interacting with any of these representations

      ---

      fluidly updates the others, even halfway through a drag,

      ---

      showing their relationships in real time.
    `,
    content: (
      <Rails id="permutation-lab">
        <DemoSlide
          width={PERM_TALK_WIDTH}
          height={PERM_TALK_HEIGHT}
          overlayTitle="Permutation Playground"
          demoId="permutation-lab-talk"
        >
          <PermutationLabTalk />
        </DemoSlide>
      </Rails>
    ),
  },
  // Drag-Spec Designer (230-240s)
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      And as a recursive finale, this block-based programming interface lets a user assemble operators

      ---

      to define a Dragology drag spec for a simple three-state interface.

      ---

      So, to be clear, this is an interface made with Dragology, for composing Dragology behaviors. Would you believe us if we told you we were computer scientists?
    `,
    content: (
      <Rails id="drag-spec-designer">
        <DemoSlide
          width={600}
          height={400}
          overlayTitle="Drag-Spec Designer"
          demoId="drag-spec-designer"
        >
          <dragSpecDesignerDemo.Component />
        </DemoSlide>
      </Rails>
    ),
  },
  // Study (from the submission video, 3:59–4:26)
  {
    transition: "fade-white",
    steps: 5,
    notes: `
      We ran a study where thirteen participants got hands-on experience using Dragology.

      ---

      // drag in the green notes
      They found it produced concise code, made polished interactions by default, and enabled playful design exploration.

      ---

      // drag in the orange note
      The study also revealed some learnability challenges related to state-space reasoning.

      ---

      // drag in the blue notes
      But despite this challenge, participants across diverse domains saw Dragology as a way to bring their abstractions to life.

      ---

      // scripted: the notes chain up and are dragged off to the right
    `,
    content: (
      <Rails id="study" script={{ 4: studyExit }}>
        <StudySlide />
      </Rails>
    ),
  },

  { heading: "Since the paper" },
  {
    transition: "fade-white",
    steps: 4,
    notes: `
      Since writing our paper, we've incorporated declarative dragging into some existing projects.

      Most of my research is on Hazel, a programming environment where every edit keeps your code meaningful. Using declarative dragging, we've made Hazel's refactorings physical: code moves along meaning-preserving paths.

      // drag bluex in blend's parameters
      For example, I can reorder a function's parameters, and its call sites follow.

      ---

      // grab price * rate / 100 in checkout
      Or I can pull an expression out into its own variable,

      ---

      and if I keep pulling up,

      ---

      even extract it into a new helper function.

      To tell you about the other place declarative dragging has found a home, we need to go back to the year 2022.
    `,
    // In rails mode, once recorded: hazel-demo.mp4, a stop per step
    content: (
      <RailsVideo name="hazel-demo.mp4" stops={[0]}>
        <HazelSlide />
      </RailsVideo>
    ),
  },

  { heading: "Origins" },
  {
    transition: "fade-white",
    notes: `
      I had a prototype of a tangible math game. It had a lot to say for it, but the fundamental mechanic, based on selecting transformations from a menu, lacked the tactility I craved.
    `,
    content: <NoolClassicSlide />,
  },
  {
    transition: "fade",
    steps: 3,
    notes: `
      I eventually came up with a  scheme to make it draggable,

      ---

      but implementing it seemed daunting,

      ---

      so it sat on my whiteboard for the next two years, haunting me every time I went to make a sandwich.
    `,
    content: <WhiteboardSlide />,
  },
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      // Josh
      On a really nice walk in Seattle back in 2023,

      ---

      Andrew shared his draggy ideas with me.

      ---

      I kept thinking about them over the years, but didn't do anything about it.
    `,
    content: <WalkSlide />,
  },
  {
    transition: "fade",
    steps: 4,
    notes: `
      // Josh
      And then last year, it all came together.
      My buddy Elliot was playing with order-preserving maps between trees, like you saw earlier.

      ---

      I came up with a fun way to draw these structures,

      ---

      but I realized I didn't just want to draw them;

      ---

      I wanted to reach in and pull them around, and feel out their dynamics. That felt pretty tough, until I remembered Andrew's ideas. I got working on a library that, with Andrew's help, grew into the work we are presenting today.
    `,
    content: (
      <ElliotSlide
        live={
          <DemoSlide width={400} height={600} demoId="twisted-trees">
            <TwistedTrees7 />
          </DemoSlide>
        }
      />
    ),
  },
  {
    transition: "fade-white",
    // Supernool takes focus and keys once shown
    preload: false,
    notes: `
      // Space runs supernool's own beats; Escape, then → (or Ctrl+→) moves on
      Not long after we submitted the paper, I went back to my math game, rebuilding my last prototype using declarative dragging.

      Invigorated by the new physicality I quickly moved off the 2D canvas into a 3D world, in which innocent trees are possessed by mathematical ghosts.

      In this encounter, I drag to simplify expressions, which, now exorcised, return to the platonic realm.
    `,
    // In rails mode, once recorded: supernool-demo.mp4
    content: (
      <RailsVideo name="supernool-demo.mp4">
        <SupernoolSlide />
      </RailsVideo>
    ),
  },

  { heading: "Close" },
  {
    transition: "fade-white",
    steps: 3,
    notes: `
      In our own work, declarative dragging has helped us make the digital graspable without being bogged down by implementation details.

      ---

      Our study suggests people from diverse disciplines want the same thing: from educators, to game designers, to mathematicians, to creative tool builders.

      We hope declarative dragging will let them work in the semantic worlds they live in, helping them turn the rules of their worlds into rich tangible  interactions in ours.

      ---

      Without wrestling with tween states, transitions, and trigonometry... what might they build?
    `,
    content: <ClosingMontageSlide />,
  },
  {
    transition: "fade-white",
    notes: `
      If you give Dragology a try we'd love to here about it, or even just your ideas of what you dream about making.

      Thanks a bunch.
    `,
    content: <CallToActionSlide />,
  },
];

export const slides = outline.filter((s): s is Slide => !("heading" in s));

/** Each slide's index in `outline`, which counts headings too. */
export const outlineIndexOfSlide = outline.flatMap((item, k) =>
  "heading" in item ? [] : [k],
);

/** The outline, with each slide's number in the slideshow (from 1). */
export const numberedOutline: (Heading | { slide: Slide; num: number })[] =
  (() => {
    let num = 0;
    return outline.map((item) =>
      "heading" in item ? item : { slide: item, num: ++num },
    );
  })();
