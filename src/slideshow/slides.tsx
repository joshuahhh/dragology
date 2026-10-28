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
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import {
  DragSpecTreeView,
  type DragSpecTreeViewNodeProps,
} from "../DragSpecTreeView";
import { StudioHackContext } from "../studio/StudioHackContext";
import { clampSnippetIdx, LiveCode } from "../talk/LiveCodePage";
import { robotoMono } from "./roboto-mono";
import {
  DemoSlide,
  type Heading,
  ImageSlide,
  type Slide,
  slideFileUrl,
  STAGE_W,
  useSlideCurrent,
  useSlideShown,
  useSlideStep,
} from "./slide";
import { sourceSans } from "./source-sans";

/**
 * The live editor (#/talk/livecode) on the stage. The snippet index
 * lives here rather than in the URL, which the slideshow owns.
 */
function LiveCodeSlide({ snippet = 0 }: { snippet?: number }) {
  const [snippetIdx, setSnippetIdx] = useState(clampSnippetIdx(snippet));
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <LiveCode snippetIdx={snippetIdx} onSnippetIdx={setSnippetIdx} />
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
import nodesAndNoodlesDemo from "../demos/nodes-and-noodles";
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

function BeadsWhenFar() {
  const draggable = useMemo(
    () => makeDraggable("d.closest().whenFar().withFloating()"),
    [],
  );
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

// Labeled beads with spec tree inspector (slides 15-17)
// Layout follows studio/RingOfBeadsSection

const BEADS_W = 300;
const BEADS_H = 300;
const SLIDE_W = 960;
const SLIDE_H = 540;

type BeadsState = typeof beadsInitialState;

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ backgroundColor: "#d5e5a3", padding: "0 4px" }}>
      {children}
    </span>
  );
}

function BeadsWithTreeView({
  stage,
  label,
  thumbArea,
  treeWidth = 500,
  nodeProps,
  simulateDrag = false,
}: {
  stage: Parameters<typeof makeDraggable>[0];
  label: React.ReactNode;
  thumbArea: number;
  treeWidth?: number;
  nodeProps?: Record<string, DragSpecTreeViewNodeProps>;
  simulateDrag?: boolean;
}) {
  const draggable = useMemo(() => makeDraggable(stage), [stage]);
  const [dragStatus, setDragStatus] = useState<DragStatus<BeadsState> | null>(
    null,
  );
  const draggingStatus = dragStatus?.type === "dragging" ? dragStatus : null;

  return (
    <StudioHackContext.Provider value={{ tightFixed: true }}>
      <div
        style={{
          display: "flex",
          width: SLIDE_W,
          height: SLIDE_H,
        }}
      >
        {/* Left column: code label on top, beads on bottom */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "20px 0 0 20px",
            flexShrink: 0,
          }}
        >
          <pre
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              fontWeight: "bold",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {label}
          </pre>
          <div style={{ zoom: 1.2 }}>
            <DraggableRenderer
              key={simulateDrag ? "simulating" : "not-simulating"}
              draggable={draggable}
              initialState={beadsInitialState}
              width={BEADS_W}
              height={BEADS_H}
              onDragStatus={setDragStatus}
              simulateDrag={simulateDrag ? { id: "A" } : undefined}
            />
          </div>
        </div>
        {/* Right column: spec tree inspector */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            overflow: "hidden",
            padding: "10px 10px 10px 0",
          }}
        >
          {draggingStatus && (
            <div style={{ width: treeWidth, overflow: "hidden" }}>
              <DragSpecTreeView
                op={draggingStatus.result.op}
                activePath={draggingStatus.result.activePath}
                colorMap={null}
                svgWidth={BEADS_W}
                svgHeight={BEADS_H}
                thumbArea={thumbArea}
                nodeProps={nodeProps}
              />
            </div>
          )}
        </div>
      </div>
    </StudioHackContext.Provider>
  );
}

function BeadsClosestLabeled() {
  return (
    <BeadsWithTreeView
      stage="d.closest()"
      thumbArea={25000}
      label={
        <>
          d.<Highlight>closest</Highlight>(newStates)
        </>
      }
    />
  );
}

function BeadsWithFloatingLabeled() {
  return (
    <BeadsWithTreeView
      stage="d.closest().withFloating()"
      thumbArea={18000}
      label={
        <>
          {"d.closest(newStates)\n"} <Highlight>.withFloating()</Highlight>
        </>
      }
    />
  );
}

function BeadsWhenFarLabeled() {
  return (
    <BeadsWithTreeView
      stage="d.closest().whenFar().withFloating()"
      thumbArea={9000}
      nodeProps={{
        "with-floating/when-far/bg/": { width: 150 },
      }}
      label={
        <>
          {"d.closest(newStates)\n"}{" "}
          <Highlight>.whenFar(removedState)</Highlight>
          {"\n .withFloating()"}
        </>
      }
    />
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
        activeRewriteSets: rewriteSets.map((rs) => rs.defaultEnabled ?? false),
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
      Interfaces can show you worlds of information, worlds of imagination, structures, patterns, simulation.

      And unlike photographs, interfaces let us reach into these worlds, tug things around, and see how they respond.

      ---
      Often, we do this with drag and drop, which give us virtual hands to act in virtual worlds

      But drag-and-drop interactions are difficult to make, or at least difficult to make **well**. It takes complex, cross-cutting choreography to build interactions with the fluidity and tangibility of the physical world.

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
    title: "Ring of Beads",
    transition: "fade-white",
    notes: `
      We’ll start with a simple drag-and-drop interface for reordering beads in a ring.
      Traditionally you would make this manually, by adding listeners to pointer events, and managing ephemeral state during the drag.
    `,
    content: (
      <DemoSlide width={300} height={300} demoId="ring-of-beads">
        <BeadsWhenFar />
      </DemoSlide>
    ),
  },
  {
    transition: "fade-white",
    notes: `
      **Model-driven dragging** works at a higher level.
    `,
    content: <ImageSlide src="slide-04.jpg" />,
  },
  {
    title: "Model State → View",
    transition: "fade-white",
    notes: `
      First, the interface developer implements a static version of the interface as a function from a model state to a view tree, like in React.
    `,
    content: <ImageSlide src="slide-07.jpg" />,
  },
  {
    title: "Speculative Rendering",
    notes: `
      Next, they specify, for each draggable element, a set of new model states the user should be able to access by dragging that element.

      [TODO: these are states that take the dragged element out of the list, and reinsert it in each other position]

      [TODO: add more labels on screen]
    `,
    video: { file: "model-driven-full.mp4", start: 7.5, end: 9 },
  },
  {
    title: "Target Positions",
    notes: `
      When a drag starts, an engine speculatively renders each of these states to a view...
    `,
    video: { file: "model-driven-full.mp4", start: 14.7, end: 17.2 },
  },
  {
    title: "Drag Synthesis",
    notes: `
      ... and examines where the dragged element ends up in each of these hypothetical future worlds.
    `,
    video: { file: "model-driven-full.mp4", start: 17.5, end: 23 },
  },
  {
    title: "Live Drag",
    notes: `
      These views and positions provide the engine with enough information to synthesize a high-quality animated drag-and-drop interaction.

      That’s the core idea of model-driven dragging: an interface developer provides future model states to an engine, which speculatively renders them to create an interaction.

      // Consider: introduce repositional drags
    `,
    video: { file: "model-driven-full.mp4", start: 23, end: 27.7 },
  },

  { heading: "Live-coding, composable dragging" },
  {
    title: "Dragology",
    transition: "fade-white",
    notes: `
      To show you how this works in practice, and introduce you to the complementary concept of composable dragging, we’ll do some live coding with our library Dragology.
    `,
    content: <ImageSlide src="slide-12.jpg" />,
  },
  {
    title: "Live Code",
    transition: "fade",
    // Its editor takes focus and keys on mount
    preload: false,
    content: <LiveCodeSlide />,
  },
  {
    title: "d.closest — Ring of Beads",
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540} demoId="ring-of-beads">
        <BeadsClosestLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "withFloating — Ring of Beads",
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540}>
        <BeadsWithFloatingLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "whenFar — Ring of Beads",
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540}>
        <BeadsWhenFarLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "Composable Dragging",
    transition: "fade-white",
    content: <ImageSlide src="slide-18.jpg" />,
  },

  { heading: "Demos" },
  // Scheduler (130-155s)
  {
    title: "Scheduler",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={560}
        height={212}
        overlayTitle="Alex’s Scheduler"
        demoId="scheduler"
      >
        <schedulerDemo.Component />
      </DemoSlide>
    ),
  },
  // Lists in Lists (155-170s)
  {
    title: "Lists in Lists",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={400}
        height={400}
        overlayTitle="Lists in Lists"
        demoId="lists-in-lists"
      >
        <ListsInListsClean />
      </DemoSlide>
    ),
  },
  // Tactile Tessellations (170-180s)
  {
    title: "Tactile Tessellations",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={900}
        height={600}
        overlayTitle="Tactile Tessellations"
        demoId="tactile-tessellations"
      >
        <tactileTessellationsDemo.Component />
      </DemoSlide>
    ),
  },
  // Nodes and Noodles (180-190s)
  {
    title: "Nodes & Noodles",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={500}
        height={200}
        overlayTitle="Nodes and Noodles"
        demoId="nodes-and-noodles"
      >
        <nodesAndNoodlesDemo.Component />
      </DemoSlide>
    ),
  },
  // Animate Algebra (190-210s)
  {
    title: "Animate Algebra",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={300}
        height={350}
        overlayTitle="Animate Algebra"
        demoId="animate-algebra-tree"
      >
        <AnimateAlgebraClean />
      </DemoSlide>
    ),
  },
  // Twisted Trees (210-230s) — single slide combining both
  {
    title: "Twisted Trees",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={400}
        height={600}
        overlayTitle="Twisted Trees"
        demoId="twisted-trees"
      >
        <TwistedTrees7 />
      </DemoSlide>
    ),
  },
  // Drag-Spec Designer (230-240s)
  {
    title: "Drag-Spec Designer",
    transition: "fade-white",
    content: (
      <DemoSlide
        width={600}
        height={400}
        overlayTitle="Drag-Spec Designer"
        demoId="drag-spec-designer"
      >
        <dragSpecDesignerDemo.Component />
      </DemoSlide>
    ),
  },

  { heading: "..." },
];

export const slides = outline.filter((s): s is Slide => !("heading" in s));

/** The outline, with each slide's number in the slideshow (from 1). */
export const numberedOutline: (Heading | { slide: Slide; num: number })[] =
  (() => {
    let num = 0;
    return outline.map((item) =>
      "heading" in item ? item : { slide: item, num: ++num },
    );
  })();
