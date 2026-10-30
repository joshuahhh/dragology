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
  CallToActionCard,
  CallToActionSlide,
  CodeCallout,
  ElliotSlide,
  Hl,
  NoolClassicSlide,
  StagedVideo,
  StepToggles,
  studyExit,
  StudySlide,
  twistedTreesWander,
  WalkSlide,
  WhiteboardSlide,
} from "./back-half";
import { BehaviorDiagramSlide } from "./behavior-diagram";
import { beadsSubject } from "./model-driven/beads";
import {
  MacClosedHand,
  script as modelDrivenScript,
} from "./model-driven/ModelDrivenScene";
import {
  LiveDragLoop,
  ModelDrivenSlide,
} from "./model-driven/ModelDrivenSlide";
import { ClosingMontage } from "./montage/closing";
import { Rails } from "./rails";
import { robotoMono } from "./roboto-mono";
import { ART_CENTER_X, SideArt, STEP_EASE } from "./side-art";
import {
  DemoLink,
  DemoSlide,
  type Heading,
  type Slide,
  slideFileUrl,
  STAGE_H,
  STAGE_W,
  useArrivalGlide,
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
 * The ring of beads, live; on the second step it moves left and the drag code
 * you'd write by hand comes in on the right, then gives way to the
 * Model-Driven Dragging art. The explainer that follows glides the ring on
 * from where this leaves it.
 */
function VanillaDragSlide() {
  const step = useSlideStep();
  return (
    <div className="absolute inset-0 bg-white">
      <LiveDragLoop
        frame={{ x: STAGE_W / 2, y: STAGE_H / 2, scale: 3 }}
        aside={step >= 1}
      />
      <DemoLink demoId="ring-of-beads" />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: ART_CENTER_X,
          opacity: step === 1 ? 1 : 0,
          transform: `translate(-50%, -50%) translateX(${step === 0 ? 60 : 0}px)`,
          transition: `opacity ${STEP_EASE}, transform ${STEP_EASE}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}
        className="bg-white"
      >
        <VanillaDragCode />
      </div>
      <SideArt src="model-driven.png" shown={step >= 2} />
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
 * The opening slide: the photo of the mountains, with the talk's title and
 * authors in the bottom-left corner, over a shade that keeps them legible
 * against the rocks
 */
function OpeningSlide() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <img
        src={slideFileUrl("earth.jpg")}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 0% 100%, rgba(0,0,0,0.75), rgba(0,0,0,0.45) 45%, rgba(0,0,0,0))",
        }}
      />
      <div
        className="absolute text-white"
        style={{
          left: 80,
          bottom: 72,
          fontFamily: sourceSans,
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 600, lineHeight: 1.1 }}>
          Declarative Dragging
        </div>
        <div style={{ fontSize: 40, fontWeight: 400, marginTop: 16 }}>
          Joshua Horowitz, Andrew Blinn, Jeffrey Heer
        </div>
      </div>
    </div>
  );
}

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

const REEL_ROW_H = 480;
const REEL_GAP = 32;
/** How fast the rows scroll, in stage pixels per second */
const REEL_SPEED = 60;
/** How long a video's last frame takes to crossfade into its start */
const REEL_CROSSFADE_S = 0.5;

/**
 * The videos in each row, by name in public/slides/awe (without ".mp4").
 * Each row starts with its first video at the stage's left edge, the next
 * ones after it, so put favorites first.
 */
const reelRows: { names: string[]; direction: "left" | "right" }[] = [
  {
    direction: "left",
    names: [
      "nool-tree",
      "nodes-and-noodles",
      "gantt",
      "regex-nfa-sync",
      "lambda-beta",
      "braid",
      "spec-workshop",
      "two-types-of-tree",
    ],
  },
  {
    direction: "right",
    names: [
      "catalan-explorer",
      "interval-graph",
      // "lists-of-lists",
      "permutation-lab",
      "proof-by-dragging",
      "rotations-splay",
      "pivot-table",
      "tactile-tesselations",
      "order-preserving",
    ],
  },
];

{
  // Every video in public/slides/awe, found at build time (only the names)
  const inFolder = Object.keys(
    import.meta.glob("/public/slides/awe/*.mp4"),
  ).map((p) => p.replace("/public/slides/awe/", "").replace(/\.mp4$/, ""));
  const listed = reelRows.flatMap((row) => row.names);
  const missing = _.difference(listed, inFolder);
  const unlisted = _.difference(inFolder, listed);
  if (missing.length > 0)
    console.warn("Reel videos not in public/slides/awe:", missing);
  if (unlisted.length > 0)
    console.warn(
      "Videos in public/slides/awe not in either reel row:",
      unlisted,
    );
}

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

/**
 * A grabbing hand (the Mac's own, as the slides' cursors are) carrying a card
 * away from the dashed outline of where it was
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
      <g
        transform="translate(23.5 22.5) scale(1.5) translate(-16.3 -18)"
        strokeWidth={1}
      >
        <MacClosedHand />
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
  // The title reads fine over the reel at full strength; from the next step
  // on, the reel fades back, so the insets you have to read stand out
  const subdued = useSlideStep() > 0;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 flex flex-col justify-center"
        style={{
          gap: REEL_GAP,
          filter: `saturate(${subdued ? 0.35 : 1})`,
          transition: "filter 600ms ease",
        }}
      >
        {reelRows.map(({ names, direction }, i) => (
          <VideoReelRow
            key={i}
            files={names.map((name) => `awe/${name}.mp4`)}
            direction={direction}
            aspects={aspects}
            onAspect={onAspect}
          />
        ))}
      </div>
      <div
        className="absolute inset-0 bg-white"
        style={{
          opacity: subdued ? 0.45 : 0,
          transition: "opacity 600ms ease",
        }}
      />
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
    content: <OpeningSlide />,
    timing: [7],
    notes: `
      A photograph is a portal into another place on Earth.

      But graphical interfaces can be portals into other worlds.
    `,
  },
  {
    timing: [14, 22],
    notes: `
      // prob 38 sec total

      Interfaces can show us worlds of information, imagination, structures, patterns, and simulation.

      And unlike photographs, interfaces let us reach into these worlds, to tug things around, and see how they respond.

      ---
      Often, we do this with drag and drop, which gives us virtual hands to act in virtual worlds

      But drag-and-drop interactions are difficult to make, or at least difficult to make **well**. If you want interactions with the fluidity and tangibility of an imagined world, you need complex and cross-cutting choreography.

      We think interface inventors need better infrastructure.
    `,
    steps: 2,
    content: <MontageSlide />,
  },
  {
    steps: 4,
    transition: "fade-white",
    content: <DeclarativeDraggingIntro />,
    timing: [11, 9, 10, 10],
    notes: `
      So we’d like to share **Declarative Dragging**, a new approach which makes it possible to build higher quality drag-and-drop interfaces with less work.

      Declarative Dragging combines two new ideas.

      ---

      The first is defining drags in terms of semantic transformations, rather than low-level logic.
      We call that **model-driven dragging**.

      ---

      To make it possible for model-driven dragging to express *different* drag-and-drop styles, we extend it with a powerful DSL of behaviors. We call that **composable dragging**.

      ---

      The demos we’ve been teasing in the background here were made with a new library called **Dragology**, based on these two ideas.

      Let’s dive in and look at how these ideas work.
    `,
  },

  { heading: "Model-driven dragging" },
  {
    transition: "fade-white",
    // Then, beside the ring, the drag code you'd write without a library,
    // then the Model-Driven Dragging art
    steps: 3,
    timing: [5, 8, 4],
    notes: `
      We’ll start with a simple drag-and-drop interface for reordering beads in a ring.

      ---

      Traditionally you would make this manually, by adding listeners to pointer events, and managing ephemeral state during the drag.

      ---

      **Model-driven dragging** works at a higher level.
    `,
    content: <VanillaDragSlide />,
  },
  {
    // The ring glides on from beside the art
    transition: "fade",
    timing: [10],
    notes: `
      First, the interface developer implements a static version of the interface as a function from a model state to a view tree, like in React.
    `,
    content: (
      <ModelDrivenSlide from={0} arriveFrom={modelDrivenScript.bigAside} />
    ),
  },
  {
    timing: [14],
    notes: `
      Next, they specify, for each draggable element, a set of new model states the user should be able to **access** by dragging that element.

      In this case, that means states that move the dragged element to a new position in the array.
    `,
    content: <ModelDrivenSlide from={7.5} to={9} />,
  },
  {
    timing: [6],
    notes: `
      When a drag starts, an engine speculatively renders each of these states to a view...
    `,
    content: <ModelDrivenSlide from={14.7} to={17.2} />,
  },
  {
    // The dragged element singled out in each view; then the views line up
    // and send its positions down onto one ring
    steps: 2,
    timing: [7, 4],
    notes: `
      ... and examines where the dragged element ends up in each of these hypothetical future worlds.

      Putting all this information together...

      ---
      // keep going
    `,
    content: <ModelDrivenSlide from={17.5} stops={[20.6]} to={23} />,
  },
  {
    timing: [8, 10],
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
    timing: [9],
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
    timing: [20, 54, 29, 26, 31],
    notes: `
      This "draggable" is a function that, given a model state, returns a static view.
      Here’s the line that draws the background ring…
      And this SVG group renders each of the beads, in a loop.
      [next stage to turn off highlight]

      ---
      This interface isn't draggable yet. [demonstrate]
      We want to make each of these beads draggable.
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

      You may wonder, at this point: What are these structures we're building and returning from dragologyOnDrag? For that, I'll pass it to Andrew.
    `,
    content: <LiveCodeSlide />,
  },

  { heading: "Behaviors & operators" },
  {
    transition: "fade-white",
    steps: 3,
    timing: [18, 14, 12],
    notes: `
      So what is this thing we're building and returning from dragologyOnDrag? It's a **drag behavior**: a function that runs every frame during a drag, reading in a changing pointer position and producing a preview to be shown on screen and a state to be transitioned to on drop.

      ---
      As we apply operators like "whenFar" and "withFloating, we create new drag behaviors from old ones.
      This is composable dragging: incrementally building refined interactions atop the semantic simplicity of model-driven dragging.

      ---
      In Dragology, we've developed a core set of operators that you can combine to create a surprising variety of interactions.
      Andrew's going to share some examples of what these building blocks can do when you put them together.
    `,
    content: <BehaviorDiagramSlide />,
  },

  { heading: "Demos" },
  // Scheduler (130-155s)
  {
    transition: "fade-white",
    steps: 3,
    timing: [8, 8, 18],
    notes: `
      This diagram of a scheduling problem uses a discrete drag, like we've seen before, to move meetings between rooms.

      ---

      But it also has a continuous drag to change start and end times. A continuous drag has an infinite number of possible destination states, so you can't just list them.

      ---

      Instead, our DSL offers an operator called "vary" which controls one or more numeric parameters in the model.
      Behind the scenes, Dragology uses numerical optimization to search for the best parameter settings.
      Numerical optimization lets us extend model-driven dragging to continuous state spaces.
    `,
    content: (
      <Rails id="scheduler">
        <>
          <DemoSlide
            width={560}
            height={212}
            overlayTitle="Schedule Shuffler"
            demoId="scheduler"
          >
            <schedulerDemo.Component />
            <StepToggles
              byStep={[
                {},
                {},
                { showVaryVisualizer: true, showDebugOverlay: true },
              ]}
            />
          </DemoSlide>
          <CodeCallout from={2}>
            {"d."}
            <Hl at={[2]}>vary</Hl>
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
    timing: [7, 5, 3, 6],
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
    timing: [9, 3, 4],
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
    timing: [17, 6],
    notes: `
      Our next operator, called "between", interpolates between previews as you drag.
      In this diagram of an order-preserving map between trees, the black dots can be dragged freely between the gray bubbles.
      As you drag, bubbles grow, anticipating the arrival of the dot.

      ---

      // purple overlay comes on
      "Between" produces this interpolation by tracking the dot's location in a triangulation of target positions.
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
    timing: [4, 10, 10],
    notes: `
      In this draggable algebra expression tree, "between" is composed with two more operators.

      ---

      // tracks come on
      Each "between" makes a track to one destination state. The "closest" operator reappears to combine these tracks together.

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
            <Hl at={[0, 1]}>between</Hl>
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
    timing: [21],
    notes: `
      We found Dragology to be particularly suited to interfaces that combine parallel representations, where you see the same system from different perspectives.
      This is a playground for experimenting with permutations. Interacting with any of these representations
      fluidly updates the others, even halfway through a drag,
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
    timing: [21],
    notes: `
      // On Space, one continuous take: the spec is assembled, then its preview dragged
      And as a recursive finale, this block-based programming interface lets a user assemble operators
      to define a Dragology drag spec for a simple three-state interface.

      So, to be clear, this is an interface made with Dragology, for composing Dragology behaviors. If you saw this coming, you may just be a computer scientist.
    `,
    content: (
      // Its track is in the demo's own coordinates, so it can move
      <Rails id="drag-spec-designer" anchor="[data-demo-slide] svg">
        <DemoSlide
          width={600}
          height={400}
          overlayTitle="Drag-Spec Designer"
          demoId="drag-spec-designer"
          offsetY={120}
        >
          <dragSpecDesignerDemo.Component />
        </DemoSlide>
      </Rails>
    ),
  },

  { heading: "User study" },
  // Study (from the submission video, 3:59–4:26)
  {
    transition: "fade-white",
    steps: 4,
    timing: [6, 6, 9, 4],
    notes: `
      // drag in the yellow note
      We ran a study where thirteen participants got hands-on experience using Dragology.

      ---

      // drag in the green notes
      They found it produced concise code, made polished interactions by default, and enabled playful design exploration.

      ---

      // drag in the orange note, then the blue ones
      The study also revealed some learnability challenges related to state-space reasoning. But despite this challenge, participants across diverse domains

      ---

      // scripted: the notes chain up and are dragged off to the right
      saw Dragology as a way to bring their abstractions to life.
    `,
    content: (
      <Rails id="study" script={{ 3: studyExit }}>
        <StudySlide />
      </Rails>
    ),
  },

  { heading: "Since the paper" },
  {
    transition: "fade-white",
    timing: [19],
    notes: `
      // Video, on Space
      Since finishing the paper, we've incorporated declarative dragging into other existing projects.

      Most of my research is on Hazel, a programming environment where every edit keeps your code meaningful.
      Using declarative dragging, we've made Hazel's refactorings physical: code moves along meaning-preserving paths.
    `,
    // Andrew's recording of the live Hazel demo (Screen Recording 2026-10-29
    // at 10.39 PM, without its sound)
    content: <StagedVideo name="hazel-demo.mp4" />,
  },
  {
    transition: "fade-white",
    timing: [22],
    notes: `
      I also returned to a long-running side project,
      a math game where the idea for model-driven dragging originated.
      In this 3d landscape possessed by mathematical ghosts,
      declarative dragging powers algebraic exorcisms,
      letting me simplify expressions to return them to the platonic realm.
    `,
    // uist-nool-v2.mov (Andrew's Screenshots), cut and sped up by
    // d2-talk/video-cuts/supernool-cut.sh
    content: <StagedVideo name="supernool-demo.mp4" />,
  },

  { heading: "Origins" },
  // Origins, cut for time: kept for reference, passed over
  {
    skip: true,
    transition: "fade-white",
    timing: [17],
    notes: `
      I had a prototype of a tangible math game. It played okay, but the fundamental mechanic, based on selecting transformations from a menu, lacked the tactility I craved.
    `,
    content: <NoolClassicSlide />,
  },
  {
    skip: true,
    transition: "fade",
    steps: 3,
    timing: [5, 2, 4],
    notes: `
      Eventually I came up with a scheme to make it, and things like it, draggable,

      ---

      but implementing that seemed daunting,

      ---

      so it sat on my whiteboard for the next two years, haunting me every time I went to make a sandwich.
    `,
    content: <WhiteboardSlide />,
  },
  {
    skip: true,
    transition: "fade-white",
    timing: [12],
    notes: `
      // Josh
      On a really nice walk in Seattle back in 2023,
      Andrew shared his draggy ideas with me.

      I was intrigued, but it took two years for me to do anything about it.
    `,
    content: <WalkSlide />,
  },
  {
    skip: true,
    transition: "fade",
    steps: 4,
    timing: [6, 3, 2, 14],
    notes: `
      // Josh
      That's when my buddy Elliot was playing with order-preserving maps between trees, like you saw earlier.

      ---

      I came up with a fun way to draw these structures,

      ---

      but I realized I didn't just want to draw them;

      ---

      I wanted to reach in and pull them around, and feel out their dynamics. That felt pretty tough, until I remembered Andrew's ideas. I got working on a library that, with Andrew's help, grew into the work we are presenting today.
    `,
    content: (
      // The live demo drags itself around
      <Rails id="elliot" script={{ 3: twistedTreesWander() }} loop>
        <ElliotSlide
          live={
            <DemoSlide width={400} height={600} demoId="twisted-trees">
              <TwistedTrees7 />
            </DemoSlide>
          }
        />
      </Rails>
    ),
  },
  { heading: "Close" },
  {
    transition: "fade-white",
    steps: 4,
    timing: [7, 18, 3, 0],
    notes: `
      In our own work, declarative dragging has helped us make the digital graspable without being bogged down in implementation.

      ---

      Our study suggests people from diverse disciplines want the same thing: from educators, to game designers, to mathematicians, to creative tool builders.

      ---

      We hope declarative dragging will let them work in the semantic worlds they inhabit, helping them turn the rules of their worlds into rich tangible interactions in ours.

      ---

      Thanks!
    `,
    // The card comes in over the montage, still moving, on the last step
    content: (
      <div className="absolute inset-0">
        <ClosingMontage />
        <CallToActionCard fromStep={3} />
      </div>
    ),
  },
  {
    // Presented as the closing montage's last step instead (above)
    skip: true,
    transition: "fade-white",
    timing: [0],
    notes: `
      Thanks!
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
