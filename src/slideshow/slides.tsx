import { useMemo, useState } from "react";
import { DemoDraggable } from "../demo/ui";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import {
  DragSpecTreeView,
  type DragSpecTreeViewNodeProps,
} from "../DragSpecTreeView";
import { StudioHackContext } from "../studio/StudioHackContext";
import { DemoSlide, type Heading, ImageSlide, type Slide } from "./slide";

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
    content: <ImageSlide src="model-driven.jpg" />,
    notes: `
      [Design concept: endless array of animated demos scrolls right to left in background, as we show insets: “Declarative Dragging”, “Model-Driven”, and “Composable”, “Dragology”]

      So we’d like to share **Declarative Dragging**, a new approach which makes it possible to build higher quality drag-and-drop interfaces with less work.

      Declarative Dragging combines two ideas.

      The first is defining drags in terms of semantic transformations, rather than low-level logic.
      We call that **model-driven dragging**.

      To make it possible for model-driven dragging to express different drag-and-drop styles, we extend it with a powerful DSL of behaviors. We call that **composable dragging**.

      The demos we’ve been giving you a taste of in the background here were made with a library called **Dragology**, based on these two ideas.

      Let’s dive in and look at how these ideas work.
    `,
  },
  {
    title: "Opening — Tessellations",
    subtitles: "How would you make a drag-and-drop interface like this?",
    content: (
      <DemoSlide width={900} height={600} demoId="tactile-tessellations">
        <tactileTessellationsDemo.Component />
      </DemoSlide>
    ),
  },
  {
    title: "Opening — Nodes & Noodles",
    subtitles: "Or like this?",
    content: (
      <DemoSlide width={500} height={200} demoId="nodes-and-noodles">
        <nodesAndNoodlesDemo.Component />
      </DemoSlide>
    ),
  },
  {
    title: "Opening — Twisted Trees",
    subtitles:
      "It takes a lot of work to make high quality, bespoke drag-and-drop interactions.",
    content: (
      <DemoSlide width={400} height={600} demoId="twisted-trees">
        <TwistedTrees7 />
      </DemoSlide>
    ),
  },
  {
    title: "Declarative Dragging — Model-Driven",
    subtitles:
      "Declarative dragging is our new approach, combining two new pieces: model-driven dragging…",
    transition: "fade-white",
    content: <ImageSlide src="slide-04.jpg" />,
  },
  {
    title: "Declarative Dragging — Both Pillars",
    subtitles:
      "…which lets drags be defined from semantic transformations rather than low-level logic, and composable dragging, which lets complex drag-and-drop behaviors be built up from simpler ones.",
    transition: "fade",
    content: <ImageSlide src="slide-05.jpg" />,
  },

  { heading: "Model-driven dragging" },
  {
    title: "Ring of Beads",
    subtitles:
      "Here's a simple drag-and-drop interface for reordering beads in a ring.",
    transition: "fade-white",
    content: (
      <DemoSlide width={300} height={300} demoId="ring-of-beads">
        <BeadsWhenFar />
      </DemoSlide>
    ),
  },
  {
    subtitles:
      "Traditionally you would make this manually, by adding listeners to pointer events. Model-driven dragging works at a higher level.",
    transition: "fade-white",
    content: <ImageSlide src="slide-04.jpg" />,
  },
  {
    title: "Model State → View",
    subtitles:
      "First, the interface developer represents this diagram as a function from model state to view tree, like in React.",
    transition: "fade-white",
    content: <ImageSlide src="slide-07.jpg" />,
  },
  {
    title: "Speculative Rendering",
    subtitles:
      "Next, they specify, for each draggable element, a set of new model states the drag should be able to access.",
    video: { file: "model-driven-full.mp4", start: 7.5, end: 9 },
  },
  {
    title: "Target Positions",
    subtitles:
      "When a drag starts, we speculatively render each of these states to view trees, and we extract possible target locations of the dragged element.",
    video: { file: "model-driven-full.mp4", start: 14.7, end: 17.2 },
  },
  {
    title: "Drag Synthesis",
    subtitles:
      "This gives us enough information to synthesize a high-quality animated drag drop interaction.",
    video: { file: "model-driven-full.mp4", start: 17.5, end: 23 },
  },
  {
    title: "Live Drag",
    video: { file: "model-driven-full.mp4", start: 23, end: 27.7 },
  },

  { heading: "Live-coding, composable dragging" },
  {
    title: "Dragology",
    subtitles:
      "Here's how an interface developer builds this with our prototype library, Dragology.",
    transition: "fade-white",
    content: <ImageSlide src="slide-12.jpg" />,
  },
  {
    title: "Code — Static View",
    subtitles:
      "They start with a function that maps a model state to a static view. Here's the code that draws the beads.",
    transition: "fade",
    content: <ImageSlide src="slide-13.jpg" />,
  },
  {
    title: "Code — dragologyOnDrag",
    subtitles:
      "To make them draggable, the developer adds a Dragology onDrag handler.",
    content: <ImageSlide src="slide-14.jpg" />,
  },
  {
    title: "d.closest — Ring of Beads",
    subtitles:
      'The "closest" combinator snaps the dragged element to the closest target position to the cursor.',
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540} demoId="ring-of-beads">
        <BeadsClosestLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "withFloating — Ring of Beads",
    subtitles:
      'The "withFloating" modifier detaches the dragged element, letting it follow the cursor immediately.',
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540}>
        <BeadsWithFloatingLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "whenFar — Ring of Beads",
    subtitles:
      'The "whenFar" modifier allows us to switch to a new behavior when the cursor is far from any target.',
    transition: "fade",
    content: (
      <DemoSlide width={960} height={540}>
        <BeadsWhenFarLabeled />
      </DemoSlide>
    ),
  },
  {
    title: "Composable Dragging",
    subtitles:
      "We call this approach composable dragging, and it lets us build up sophisticated interactions from model-driven primitives.",
    transition: "fade-white",
    content: <ImageSlide src="slide-18.jpg" />,
  },

  { heading: "Demos" },
  // Scheduler (130-155s)
  {
    title: "Scheduler",
    subtitles:
      "This diagram of a scheduling problem uses a discrete drag to move meetings between rooms, and a continuous drag to change start and end times.",
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
    subtitles:
      "Vary can be combined freely with other behaviors using Dragology’s DSL.",
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
    subtitles:
      "Dragology extends past repositioning drags to support drags that create and destroy objects, like these tessellated shapes.",
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
    subtitles:
      "In this mock nodes and wires programming interface, edges are created by dragging between ports and they can be destroyed by detachment.",
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
    subtitles:
      "This interface shows an algebraic expression and makes the commutative and associative laws into drags.",
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
    subtitles:
      "The way these tracks interpolate between previews as you drag can be extended into two dimensions.",
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
    subtitles:
      "And as a recursive finale, this block-based programming interface lets a user assemble operators to define a Dragology drag spec.",
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
