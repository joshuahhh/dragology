import { ComponentType, useMemo, useState } from "react";
import { DemoDraggable } from "../demo/ui";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import {
  DragSpecTreeView,
  type DragSpecTreeViewNodeProps,
} from "../DragSpecTreeView";
import { StudioHackContext } from "../studio/StudioHackContext";

type Transition = "fade-white" | "fade";

type ImageSlide = {
  type: "image";
  image: string;
  title: string;
  subtitles?: string;
  transition?: Transition;
};

type DemoSlide = {
  type: "demo";
  Component: ComponentType;
  title: string;
  subtitles?: string;
  width?: string | number;
  height?: string | number;
  overlayTitle?: string;
  demoId?: string;
  transition?: Transition;
};

type VideoSlide = {
  type: "video";
  video: string;
  startTime: number;
  endTime: number;
  title: string;
  subtitles?: string;
  transition?: Transition;
};

export type Slide = ImageSlide | DemoSlide | VideoSlide;

function demoSlide(
  title: string,
  Component: ComponentType,
  opts?: {
    subtitles?: string;
    width?: string | number;
    height?: string | number;
    overlayTitle?: string;
    demoId?: string;
    transition?: Transition;
  },
): DemoSlide {
  return { type: "demo", title, Component, ...opts };
}

function imageSlide(
  image: string,
  title: string,
  subtitles?: string,
  opts?: { transition?: Transition },
): ImageSlide {
  return { type: "image", image, title, subtitles, ...opts };
}

function videoSlide(
  title: string,
  startTime: number,
  endTime: number,
  subtitles?: string,
  opts?: { transition?: Transition },
): VideoSlide {
  return {
    type: "video",
    video: "model-driven-full.mp4",
    startTime,
    endTime,
    title,
    subtitles,
    ...opts,
  };
}

// Wrapper to provide demo settings context
function withSettings(Component: ComponentType): ComponentType {
  return Component;
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
              trace
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
                spec={draggingStatus.result.tracedSpec}
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

// Generic wrapper to render a demo's Component
function wrapDemo(demoObj: { Component: ComponentType }): ComponentType {
  const Wrapped = withSettings(demoObj.Component);
  return Wrapped;
}

// ── Slide sequence ──

export const slides: Slide[] = [
  // === Opening (0-13s): demo montage ===
  demoSlide("Opening — Tessellations", wrapDemo(tactileTessellationsDemo), {
    subtitles: "How would you make a drag-and-drop interface like this?",
    width: 900,
    height: 600,
    demoId: "tactile-tessellations",
  }),
  demoSlide("Opening — Nodes & Noodles", wrapDemo(nodesAndNoodlesDemo), {
    subtitles: "Or like this?",
    width: 500,
    height: 200,
    transition: "fade",
    demoId: "nodes-and-noodles",
  }),
  demoSlide("Opening — Twisted Trees", TwistedTrees7, {
    subtitles:
      "It takes a lot of work to make high quality, bespoke drag-and-drop interactions.",
    width: 400,
    height: 600,
    transition: "fade",
    demoId: "twisted-trees",
  }),

  // === Title slide (13-25s) ===
  imageSlide(
    "slide-04.jpg",
    "Declarative Dragging — Model-Driven",
    "Declarative dragging is our new approach, combining two new pieces: model-driven dragging…",
    { transition: "fade-white" },
  ),
  imageSlide(
    "slide-05.jpg",
    "Declarative Dragging — Both Pillars",
    "…which lets drags be defined from semantic transformations rather than low-level logic, and composable dragging, which lets complex drag-and-drop behaviors be built up from simpler ones.",
    { transition: "fade" },
  ),

  // === Ring of beads intro (25-35s) ===
  demoSlide("Ring of Beads", BeadsWhenFar, {
    subtitles:
      "Here's a simple drag-and-drop interface for reordering beads in a ring.",
    width: 300,
    height: 300,
    transition: "fade-white",
    demoId: "ring-of-beads",
  }),

  // === Model state → View explanation (35-65s) ===
  imageSlide(
    "slide-07.jpg",
    "Model State → View",
    "First, the interface developer represents this diagram as a function from model state to view tree, like in React.",
    { transition: "fade-white" },
  ),
  videoSlide(
    "Speculative Rendering",
    7.5,
    13.5,
    "Next, they specify, for each draggable element, a set of new model states the drag should be able to access.",
  ),
  videoSlide(
    "Target Positions",
    14.7,
    17.2,
    "When a drag starts, we speculatively render each of these states to view trees, and we extract possible target locations of the dragged element.",
  ),
  videoSlide(
    "Drag Synthesis",
    17.5,
    23,
    "This gives us enough information to synthesize a high-quality animated drag drop interaction.",
  ),
  videoSlide("Live Drag", 23, 27.7, ""),

  // === Dragology title (65-70s) ===
  imageSlide(
    "slide-12.jpg",
    "Dragology",
    "Here's how an interface developer builds this with our prototype library, Dragology.",
    { transition: "fade-white" },
  ),

  // === Code walkthrough (70-90s) ===
  imageSlide(
    "slide-13.jpg",
    "Code — Static View",
    "They start with a function that maps a model state to a static view. Here's the code that draws the beads.",
  ),
  imageSlide(
    "slide-14.jpg",
    "Code — dragologyOnDrag",
    "To make them draggable, the developer adds a Dragology onDrag handler.",
  ),

  // === d.closest demo (90-100s) ===
  demoSlide("d.closest — Ring of Beads", BeadsClosestLabeled, {
    subtitles:
      'The "closest" combinator snaps the dragged element to the closest target position to the cursor.',
    width: 960,
    height: 540,
    transition: "fade",
    demoId: "ring-of-beads",
  }),

  // === withFloating demo (100-110s) ===
  demoSlide("withFloating — Ring of Beads", BeadsWithFloatingLabeled, {
    subtitles:
      'The "withFloating" modifier detaches the dragged element, letting it follow the cursor immediately.',
    width: 960,
    height: 540,
    transition: "fade",
  }),

  // === whenFar demo (110-120s) ===
  demoSlide("whenFar — Ring of Beads", BeadsWhenFarLabeled, {
    subtitles:
      'The "whenFar" modifier allows us to switch to a new behavior when the cursor is far from any target.',
    width: 960,
    height: 540,
    transition: "fade",
  }),

  // === Composable recap (120-130s) ===
  imageSlide(
    "slide-18.jpg",
    "Composable Dragging",
    "We call this approach composable dragging, and it lets us build up sophisticated interactions from model-driven primitives.",
    { transition: "fade-white" },
  ),

  // === More examples section (130+) ===

  // Scheduler (130-155s)
  demoSlide("Scheduler", wrapDemo(schedulerDemo), {
    subtitles:
      "This diagram of a scheduling problem uses a discrete drag to move meetings between rooms, and a continuous drag to change start and end times.",
    width: 560,
    height: 212,
    overlayTitle: "Alex’s Scheduler",
    demoId: "scheduler",
    transition: "fade-white",
  }),

  // Lists in Lists (155-170s)
  demoSlide("Lists in Lists", ListsInListsClean, {
    subtitles:
      "Vary can be combined freely with other behaviors using Dragology’s DSL.",
    width: 400,
    height: 400,
    overlayTitle: "Lists in Lists",
    demoId: "lists-in-lists",
    transition: "fade-white",
  }),

  // Tactile Tessellations (170-180s)
  demoSlide("Tactile Tessellations", wrapDemo(tactileTessellationsDemo), {
    subtitles:
      "Dragology extends past repositioning drags to support drags that create and destroy objects, like these tessellated shapes.",
    width: 900,
    height: 600,
    overlayTitle: "Tactile Tessellations",
    demoId: "tactile-tessellations",
    transition: "fade-white",
  }),

  // Nodes and Noodles (180-190s)
  demoSlide("Nodes & Noodles", wrapDemo(nodesAndNoodlesDemo), {
    subtitles:
      "In this mock nodes and wires programming interface, edges are created by dragging between ports and they can be destroyed by detachment.",
    width: 500,
    height: 200,
    overlayTitle: "Nodes and Noodles",
    demoId: "nodes-and-noodles",
    transition: "fade-white",
  }),

  // Animate Algebra (190-210s)
  demoSlide("Animate Algebra", AnimateAlgebraClean, {
    subtitles:
      "This interface shows an algebraic expression and makes the commutative and associative laws into drags.",
    width: 300,
    height: 350,
    overlayTitle: "Animate Algebra",
    demoId: "animate-algebra-tree",
    transition: "fade-white",
  }),

  // Twisted Trees (210-230s) — single slide combining both
  demoSlide("Twisted Trees", TwistedTrees7, {
    subtitles:
      "The way these tracks interpolate between previews as you drag can be extended into two dimensions.",
    width: 400,
    height: 600,
    overlayTitle: "Twisted Trees",
    demoId: "twisted-trees",
    transition: "fade-white",
  }),

  // Drag-Spec Designer (230-240s)
  demoSlide("Drag-Spec Designer", wrapDemo(dragSpecDesignerDemo), {
    subtitles:
      "And as a recursive finale, this block-based programming interface lets a user assemble operators to define a Dragology drag spec.",
    width: 600,
    height: 400,
    overlayTitle: "Drag-Spec Designer",
    demoId: "drag-spec-designer",
    transition: "fade-white",
  }),
];
