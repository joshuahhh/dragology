import _ from "lodash";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { DemoDraggable } from "../demo/ui";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import {
  DragSpecTreeView,
  type DragSpecTreeViewNodeProps,
} from "../DragSpecTreeView";
import { StudioHackContext } from "../studio/StudioHackContext";
import { clampSnippetIdx, LiveCode } from "../talk/LiveCodePage";
import {
  DemoSlide,
  type Heading,
  ImageSlide,
  type Slide,
  slideFileUrl,
  STAGE_W,
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

/** A placeholder inset: an illustration to come, over a title */
function PlaceholderInset({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 480, gap: 32 }}>
      <div
        className="flex items-center justify-center text-3xl text-gray-400 border-2 border-dashed border-gray-300 rounded-xl"
        style={{ width: 400, height: 380 }}
      >
        illustration
      </div>
      <div className="text-6xl italic">{title}</div>
    </div>
  );
}

/** The insets, one per step */
const introInsets: ReactNode[] = [
  <div style={{ fontFamily: sourceSans, fontSize: 96, whiteSpace: "nowrap" }}>
    Declarative Dragging
  </div>,
  <PlaceholderInset title="Model-Driven" />,
  <PlaceholderInset title="Composable" />,
  <PlaceholderInset title="Dragology" />,
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
  // The track repeats the set of videos enough times to cover the stage and
  // then some, and slides by one set's width per loop, so the loop has no seam.
  const copies = files.length > 0 ? Math.ceil(STAGE_W / setW) + 1 : 0;
  return (
    <div style={{ height: REEL_ROW_H, overflow: "hidden" }}>
      <div
        style={
          {
            display: "flex",
            gap: REEL_GAP,
            width: "max-content",
            height: "100%",
            "--reel-set-w": `${setW}px`,
            animation: `reel-${direction} ${setW / REEL_SPEED}s linear infinite`,
          } as React.CSSProperties
        }
      >
        {_.range(copies).flatMap((c) =>
          files.map((file, i) => (
            <LoopingVideo
              key={`${c}-${file}`}
              file={file}
              width={widths[i]}
              onAspect={onAspect}
            />
          )),
        )}
      </div>
    </div>
  );
}

function DeclarativeDraggingIntro() {
  const step = useSlideStep();
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
      <style>{`
        @keyframes reel-left { from { transform: translateX(0) } to { transform: translateX(calc(-1 * var(--reel-set-w))) } }
        @keyframes reel-right { from { transform: translateX(calc(-1 * var(--reel-set-w))) } to { transform: translateX(0) } }
      `}</style>
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
      {introInsets.map((inset, i) => (
        <div
          key={i}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            opacity: i === step ? 1 : 0,
            transform: i === step ? "scale(1)" : "scale(0.94)",
            transition: "opacity 400ms ease, transform 400ms ease",
            pointerEvents: "none",
          }}
        >
          <div
            className="bg-white"
            style={{
              padding: "48px 64px",
              boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
            }}
          >
            {inset}
          </div>
        </div>
      ))}
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

      Often, we do this with drag and drop, which give us virtual hands to act in virtual worlds

      But drag-and-drop interactions are difficult to make, or at least difficult to make **well**. It takes complex, cross-cutting choreography to build interactions with the fluidity and tangibility of the physical world.

      We think interface inventors need better infrastructure.
    `,
    content: <div className="text-9xl">montage of drag+drop</div>,
  },
  {
    steps: 4,
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
    content: (
      <DemoSlide width={300} height={300} demoId="ring-of-beads">
        <BeadsWhenFar />
      </DemoSlide>
    ),
  },
  {
    transition: "fade-white",
    content: <ImageSlide src="slide-04.jpg" />,
  },
  {
    title: "Model State → View",
    transition: "fade-white",
    content: <ImageSlide src="slide-07.jpg" />,
  },
  {
    title: "Speculative Rendering",
    video: { file: "model-driven-full.mp4", start: 7.5, end: 9 },
  },
  {
    title: "Target Positions",
    video: { file: "model-driven-full.mp4", start: 14.7, end: 17.2 },
  },
  {
    title: "Drag Synthesis",
    video: { file: "model-driven-full.mp4", start: 17.5, end: 23 },
  },
  {
    title: "Live Drag",
    video: { file: "model-driven-full.mp4", start: 23, end: 27.7 },
  },

  { heading: "Live-coding, composable dragging" },
  {
    title: "Dragology",
    transition: "fade-white",
    content: <ImageSlide src="slide-12.jpg" />,
  },
  {
    title: "Code — Static View",
    transition: "fade",
    content: <ImageSlide src="slide-13.jpg" />,
  },
  {
    title: "Code — dragologyOnDrag",
    content: <ImageSlide src="slide-14.jpg" />,
  },
  {
    title: "Live Code",
    transition: "fade",
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
