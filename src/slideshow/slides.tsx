import { ComponentType, useMemo, useState } from "react";
import { DemoDraggable, DemoSettingsProvider } from "../demo/ui";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import {
  DragSpecTreeView,
  type DragSpecTreeViewNodeProps,
} from "../DragSpecTreeView";
import { StudioHackContext } from "../studio/StudioHackContext";

type ImageSlide = {
  type: "image";
  image: string;
  title: string;
  subtitles?: string;
};

type DemoSlide = {
  type: "demo";
  Component: ComponentType;
  title: string;
  subtitles?: string;
  width?: string | number;
  height?: string | number;
};

export type Slide = ImageSlide | DemoSlide;

function demoSlide(
  title: string,
  Component: ComponentType,
  opts?: {
    subtitles?: string;
    width?: string | number;
    height?: string | number;
  },
): DemoSlide {
  return { type: "demo", title, Component, ...opts };
}

function imageSlide(
  image: string,
  title: string,
  subtitles?: string,
): ImageSlide {
  return { type: "image", image, title, subtitles };
}

// Wrapper to provide demo settings context
function withSettings(Component: ComponentType): ComponentType {
  return function WrappedDemo() {
    return (
      <DemoSettingsProvider>
        <Component />
      </DemoSettingsProvider>
    );
  };
}

// ── Demo wrappers ──

// We lazily import the demo components to keep the main bundle lean.
// Each demo module's default export is a `demo(Component, opts)` object.

import {
  draggableFactory as algebraDraggableFactory,
  initialState as algebraInitialState,
  rewriteSets,
} from "../demos/animate-algebra/tree";
import braidDemo from "../demos/braid";
import cardPilesDemo from "../demos/card-piles";
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
import {
  draggable as snapToIslandsDraggable,
  initialState as snapToIslandsInitialState,
} from "../demos/snap-to-islands";
import tactileTessellationsDemo from "../demos/tactile-tessellations";
import twistedTreesDemo, {
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
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={draggable}
        initialState={beadsInitialState}
        width={300}
        height={300}
      />
    </DemoSettingsProvider>
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
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={draggable}
        initialState={beadsInitialState}
        width={300}
        height={300}
      />
    </DemoSettingsProvider>
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
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState7}
        width={400}
        height={600}
      />
    </DemoSettingsProvider>
  );
}

// Snap to islands — no DemoNotes
function SnapToIslandsClean() {
  return (
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={snapToIslandsDraggable}
        initialState={snapToIslandsInitialState}
        width={400}
        height={300}
      />
    </DemoSettingsProvider>
  );
}

// Lists in lists — no DemoNotes
function ListsInListsClean() {
  return (
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={listsInListsDraggable}
        initialState={listsInListsInitialState}
        width={400}
        height={400}
      />
    </DemoSettingsProvider>
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
    <DemoSettingsProvider>
      <DemoDraggable
        draggable={draggable}
        initialState={algebraInitialState}
        width={300}
        height={350}
      />
    </DemoSettingsProvider>
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
  }),
  demoSlide("Opening — Nodes & Noodles", wrapDemo(nodesAndNoodlesDemo), {
    subtitles: "Or like this?",
    width: 500,
    height: 200,
  }),
  demoSlide("Opening — Twisted Trees", TwistedTrees7, {
    subtitles:
      "It takes a lot of work to make high quality, bespoke drag-and-drop interactions.",
    width: 400,
    height: 600,
  }),

  // === Title slide (13-25s) ===
  imageSlide(
    "slide-04.jpg",
    "Declarative Dragging — Model-Driven",
    "Declarative dragging is our new approach, combining two new pieces: model-driven dragging…",
  ),
  imageSlide(
    "slide-05.jpg",
    "Declarative Dragging — Both Pillars",
    "…which lets drags be defined from semantic transformations rather than low-level logic, and composable dragging, which lets complex drag-and-drop behaviors be built up from simpler ones.",
  ),

  // === Ring of beads intro (25-35s) ===
  demoSlide("Ring of Beads", BeadsWhenFar, {
    subtitles:
      "Here's a simple drag-and-drop interface for reordering beads in a ring.",
    width: 300,
    height: 300,
  }),

  // === Model state → View explanation (35-55s) ===
  imageSlide(
    "slide-07.jpg",
    "Model State → View",
    "First, the interface developer represents this diagram as a function from model state to view tree, like in React.",
  ),
  imageSlide(
    "slide-08.jpg",
    "Speculative Rendering",
    "Next, they specify, for each draggable element, a set of new model states the drag should be able to access.",
  ),
  imageSlide(
    "slide-09.jpg",
    "Target Positions",
    "When a drag starts, we speculatively render each of these states to view trees, and we extract possible target locations of the dragged element.",
  ),
  imageSlide(
    "slide-10.jpg",
    "Drag Synthesis",
    "This gives us enough information to synthesize a high-quality animated drag drop interaction.",
  ),
  imageSlide("slide-11.jpg", "Live Drag", ""),

  // === Dragology title (65-70s) ===
  imageSlide(
    "slide-12.jpg",
    "Dragology",
    "Here's how an interface developer builds this with our prototype library, Dragology.",
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
  }),

  // === withFloating demo (100-110s) ===
  demoSlide("withFloating — Ring of Beads", BeadsWithFloatingLabeled, {
    subtitles:
      'The "withFloating" modifier detaches the dragged element, letting it follow the cursor immediately.',
    width: 960,
    height: 540,
  }),

  // === whenFar demo (110-120s) ===
  demoSlide("whenFar — Ring of Beads", BeadsWhenFarLabeled, {
    subtitles:
      'The "whenFar" modifier allows us to switch to a new behavior when the cursor is far from any target.',
    width: 960,
    height: 540,
  }),

  // === Composable recap (120-130s) ===
  imageSlide(
    "slide-18.jpg",
    "Composable Dragging",
    "We call this approach composable dragging, and it lets us build up sophisticated interactions from model-driven primitives.",
  ),

  // === More examples section (130+) ===

  // Scheduler (130-155s)
  demoSlide("Scheduler", wrapDemo(schedulerDemo), {
    subtitles:
      "This diagram of a scheduling problem uses a discrete drag to move meetings between rooms, and a continuous drag to change start and end times.",
    width: 800,
    height: 600,
  }),

  // Snap to islands with vary (155s)
  demoSlide("Snap to Islands", SnapToIslandsClean, {
    subtitles:
      "This interface uses vary inside whenFar to combine a continuous drag on the canvas with a drag into discrete snapping points.",
    width: 400,
    height: 300,
  }),

  // Lists in Lists (160-175s)
  demoSlide("Lists in Lists", ListsInListsClean, {
    subtitles:
      "Dragology extends past repositioning drags to support complex nested structures.",
    width: 400,
    height: 400,
  }),

  // Tactile Tessellations (175-185s)
  demoSlide("Tactile Tessellations", wrapDemo(tactileTessellationsDemo), {
    subtitles:
      "Dragology extends past repositioning drags to support drags that create and destroy objects, like these tessellated shapes.",
    width: 900,
    height: 600,
  }),

  // Nodes and Noodles (185-195s)
  demoSlide("Nodes & Noodles", wrapDemo(nodesAndNoodlesDemo), {
    subtitles:
      "In this mock nodes and wires programming interface, edges are created by dragging between ports and they can be destroyed by detachment.",
    width: 500,
    height: 200,
  }),

  // Animate Algebra (195-215s)
  demoSlide("Animate Algebra", AnimateAlgebraClean, {
    subtitles:
      "This interface shows an algebraic expression and makes the commutative and associative laws into drags.",
    width: 300,
    height: 350,
  }),

  // Between / interpolation (215-225s)
  demoSlide("2D Interpolation — Twisted Trees", TwistedTrees7, {
    subtitles:
      "The way these tracks interpolate between previews as you drag can be extended into two dimensions.",
    width: 400,
    height: 600,
  }),

  // Twisted Trees (225s)
  demoSlide("Twisted Trees", wrapDemo(twistedTreesDemo), {
    subtitles:
      "This diagram of an order-preserving map between trees lets the black dots be dragged freely between gray dots.",
    width: 700,
    height: 700,
  }),

  // Drag-Spec Designer (225-235s)
  demoSlide("Drag-Spec Designer", wrapDemo(dragSpecDesignerDemo), {
    subtitles:
      "And as a recursive finale, this block-based programming interface lets a user assemble operators to define a Dragology drag spec.",
    width: 1000,
    height: 700,
  }),

  // === Study section (235-260s) ===
  imageSlide(
    "slide-29.jpg",
    "User Study",
    "We ran a study where thirteen participants got hands-on experience using Dragology.",
  ),
  imageSlide(
    "slide-30.jpg",
    "Study Themes",
    "They found it produced concise code, made polished interactions by default, and enabled playful design exploration.",
  ),
  imageSlide(
    "slide-31.jpg",
    "Learnability",
    "The study also revealed some learnability challenges related to state-space reasoning.",
  ),

  // === Closing examples & statement ===
  demoSlide("Braid", wrapDemo(braidDemo), {
    subtitles:
      "But despite this challenge, participants across diverse domains saw Dragology as a way to bring their abstractions to life.",
    width: 500,
    height: 700,
  }),

  imageSlide(
    "slide-33.jpg",
    "3D Scene",
    "Drag-and-drop makes the digital graspable.",
  ),

  demoSlide("Card Piles", wrapDemo(cardPilesDemo), {
    subtitles:
      "But building satisfying drag-and-drop is hard enough that many people often don't bother.",
    width: 700,
    height: 600,
  }),

  imageSlide(
    "slide-35.jpg",
    "Closing",
    "Without wrestling with tween states, transitions, and trigonometry… what might they build?",
  ),
];
