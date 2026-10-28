import _ from "lodash";
import {
  type ReactNode,
  useCallback,
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
import {
  CallToActionSlide,
  CodeCallout,
  ElliotSlide,
  HazelSlide,
  Hl,
  NoolClassicSlide,
  StepToggles,
  SupernoolSlide,
  ThanksSlide,
  WalkSlide,
  WhiteboardSlide,
} from "./back-half";
import { MontageSlide } from "./montage/MontageCanvas";
import { Rails } from "./rails";
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
    <div
      className="flex flex-col items-center"
      style={{
        width: 480,
        gap: 32,
        padding: "48px 64px",
        boxSizing: "content-box",
      }}
    >
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

/** The insets, one per step */
const introInsets: ReactNode[] = [
  <div
    style={{
      fontFamily: sourceSans,
      fontSize: 96,
      whiteSpace: "nowrap",
      padding: "48px 64px",
    }}
  >
    Declarative Dragging
  </div>,
  <ImageInset src="model-driven.png" />,
  <ImageInset src="composable.png" />,
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
            style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.35)" }}
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
        (
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
        ),
      </Rails>
    ),
  },
  // Lists in Lists (155-170s)
  {
    title: "Lists in Lists",
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
        (
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
        ),
      </Rails>
    ),
  },
  // Tactile Tessellations (170-180s)
  {
    title: "Tactile Tessellations",
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
        (
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
        ),
      </Rails>
    ),
  },
  // Nodes and Noodles (180-190s)
  {
    title: "Nodes & Noodles",
    transition: "fade-white",
    content: (
      <Rails id="nodes-and-noodles">
        (
        <DemoSlide
          width={500}
          height={200}
          overlayTitle="Nodes and Noodles"
          demoId="nodes-and-noodles"
        >
          <nodesAndNoodlesDemo.Component />
        </DemoSlide>
        ),
      </Rails>
    ),
  },
  // Animate Algebra (190-210s)
  {
    title: "Animate Algebra",
    transition: "fade-white",
    steps: 3,
    notes: `
      These drags are created with three operators.
      First, the "between" operator makes tracks to the destination states.

      ---

      The "closest", which we've seen before, reappears to combine these tracks together.

      ---

      And finally, Dragology's "chaining" feature lets you drag through multiple model states in a single gesture, instead of having to drop and drag again in intermediate states.
    `,
    content: (
      <Rails id="animate-algebra">
        (
        <>
          <DemoSlide
            width={300}
            height={350}
            overlayTitle="Animate Algebra"
            demoId="animate-algebra-tree"
          >
            <AnimateAlgebraClean />
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
        ),
      </Rails>
    ),
  },
  // Twisted Trees (210-230s) — single slide combining both
  {
    title: "Twisted Trees",
    transition: "fade-white",
    steps: 3,
    notes: `
      The way these tracks interpolate between previews as you drag can be extended into two dimensions. This diagram of an order-preserving map between trees lets the black dots be dragged freely between the gray bubbles. As the user drags a dot, bubbles get larger, anticipating the dot's arrival.

      ---

      // purple overlay comes on
      "Between" produces this interpolation

      ---

      by tracking the dot's position in a triangulation of target positions.
    `,
    content: (
      <Rails id="twisted-trees">
        (
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
        ),
      </Rails>
    ),
  },
  // Permutation Playground
  {
    title: "Permutation Playground",
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
        (
        <DemoSlide
          width={PERM_TALK_WIDTH}
          height={PERM_TALK_HEIGHT}
          overlayTitle="Permutation Playground"
          demoId="permutation-lab-talk"
        >
          <PermutationLabTalk />
        </DemoSlide>
        ),
      </Rails>
    ),
  },
  // Drag-Spec Designer (230-240s)
  {
    title: "Drag-Spec Designer",
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
        (
        <DemoSlide
          width={600}
          height={400}
          overlayTitle="Drag-Spec Designer"
          demoId="drag-spec-designer"
        >
          <dragSpecDesignerDemo.Component />
        </DemoSlide>
        ),
      </Rails>
    ),
  },

  { heading: "Since the paper" },
  {
    title: "Hazel",
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
    content: <HazelSlide />,
  },

  { heading: "Origins" },
  {
    title: "Nool classic",
    transition: "fade-white",
    steps: 3,
    notes: `
      I had a prototype of a tangible math game. It had a lot to say for it,

      ---

      but the fundamental mechanic, based on selecting transformations from a menu,

      ---

      lacked the tactility I craved.
    `,
    content: <NoolClassicSlide />,
  },
  {
    title: "The whiteboard",
    transition: "fade",
    steps: 3,
    notes: `
      I eventually came up with a compelling scheme to make it draggable,

      ---

      but implementing it seemed daunting,

      ---

      so it sat on my whiteboard for the next two years, haunting me every time I went to make a sandwich.
    `,
    content: <WhiteboardSlide />,
  },
  {
    title: "A walk in Seattle",
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
    title: "Trees, all together",
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
    title: "Nool, full circle",
    transition: "fade-white",
    // Supernool takes focus and keys once shown
    preload: false,
    notes: `
      // Space runs supernool's own beats; the clicker (or Escape, then →) moves on
      Not long after we submitted the paper, I went back to my math game, rebuilding my last prototype using declarative dragging.

      Invigorated by the new physicality I quickly moved off the 2D canvas into a 3D world, in which innocent trees are possessed by mathematical ghosts.

      In this encounter, I drag to simplify expressions, which, now exorcised, return to the platonic realm.
    `,
    content: <SupernoolSlide />,
  },

  { heading: "Close" },
  {
    title: "What might they build?",
    transition: "fade-white",
    steps: 3,
    notes: `
      In our own work, declarative dragging has helped us make the digital graspable without being bogged down by implementation details.

      ---

      Our study suggests people from diverse disciplines want the same thing: from educators, to game designers, to mathematicians, to creative tool builders.

      We hope declarative dragging, and infrastructures like it, will let them work in the semantic worlds they inhabit, helping them turn the rules of their worlds into rich tactile interactions in ours.

      ---

      Without wrestling with tween states, transitions, and trigonometry... what might they build?
    `,
    content: <MontageSlide />,
  },
  {
    title: "Call to action",
    transition: "fade-white",
    notes: `
      We'd love to hear about your experiences working with Dragology, or even just ideas about what you dream of making.
    `,
    content: <CallToActionSlide />,
  },
  {
    title: "Thanks",
    transition: "fade",
    notes: `
      Thanks a bunch.
    `,
    content: <ThanksSlide />,
  },
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
