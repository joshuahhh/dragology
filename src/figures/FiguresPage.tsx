import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { demosById } from "../demo/registry";
import {
  DemoCard,
  DemoDraggable,
  DemoSettingsBar,
  DemoSettingsProvider,
} from "../demo/ui";
import { listOfListsSimple } from "../studio/list-of-lists-simple";

const REPO = "https://github.com/declarative-dragging/declarative-dragging.github.io/blob/main";

// ---------------------------------------------------------------------------
// Figure 1: Teaser
// ---------------------------------------------------------------------------

function Figure1Teaser() {
  return (
    <FigureSection id="figure-1" number={1} title="Teaser">
      <Caption>
        Dragology enables <em>model-driven dragging</em>. A developer writes a
        render function that turns a model state into a view tree. They specify,
        for each draggable element, a set of target model states. When a drag
        starts, Dragology speculatively renders these target states to view
        trees. By extracting the location of the dragged element in each
        speculative rendering, Dragology synthesizes a responsive drag-and-drop
        interaction featuring high-quality transition animations — all from just
        the developer-provided list of model states.
      </Caption>
      <div className="bg-white rounded-lg p-5 shadow-sm">
        <DemoDraggable
          draggable={listOfListsSimple.draggable}
          initialState={listOfListsSimple.initialState}
          width={240}
          height={190}
        />
      </div>
      <Hint>
        Try dragging a tile. Use the{" "}
        <SettingRef>Spec tree</SettingRef> visualizer (in the
        toolbar at the bottom of the page) to see how Dragology speculatively
        renders target states, and the <SettingRef>Overlay</SettingRef>{" "}
        visualizer to see the drop zones derived from those renderings.
      </Hint>
    </FigureSection>
  );
}

// ---------------------------------------------------------------------------
// Figure 2: Gallery (A–H)
// ---------------------------------------------------------------------------

function Figure2Gallery() {
  return (
    <FigureSection id="figure-2" number={2} title="Gallery">
      <Caption>
        Gallery of interfaces built with Dragology. A–B are introduced through
        scenarios of use. C–F are discussed in the Demonstrations section. G–H
        are described in the appendix.
      </Caption>
      <div className="flex flex-col gap-8">
        <GalleryEntry id="ring-of-beads" label="A. Alex's Ring of Beads">
          Colored beads on a ring can be dragged into different orders.
          Demonstrates <Op>closest</Op> and <Op>withFloating</Op>.
        </GalleryEntry>
        <GalleryEntry id="interval-graph" label="B. Alex's Scheduler">
          Meetings on tracks can be dragged between rooms (discrete,
          using <Op>between</Op>) and resized by dragging endpoints (continuous,
          using <Op>vary</Op> with constraints). A synchronized interval-graph
          representation makes the mathematics tangible.
        </GalleryEntry>
        <GalleryEntry id="canvas-of-lists-nested" label="C. Lists in Lists">
          Tiles sorted into nested lists on a freely-positioned canvas. Combines
          structured snapping (<Op>closest</Op> with <Op>withFloating</Op>) and
          free-form positioning (<Op>vary</Op>), joined
          with <Op>whenFar</Op>.
        </GalleryEntry>
        <GalleryEntry id="tessellation" label="D. Tactile Tessellations">
          Shapes snap together into tilings. Free positioning with edge-to-edge
          snapping, plus a toolbar for creating shapes
          (<Op>switchToStateAndFollow</Op>) and a trash bin for removing them
          (<Op>dropTarget</Op>).
        </GalleryEntry>
        <GalleryEntry id="nool-tree" label="E. Animate Algebra">
          Algebraic expressions in tree form. Dragging a node rewrites the
          expression according to algebraic laws (commutativity, associativity).
          Uses <Op>between</Op> for linear tracks
          and <Op>withSnapRadius</Op> with chaining to string rewrites together
          in a single drag.
        </GalleryEntry>
        <GalleryEntry id="order-preserving" label="F. Twisted Trees">
          An order-preserving function between trees. Any node can be dragged to
          any position; other nodes are pulled along by the ordering constraint.
          Uses <Op>between</Op> with all targets in a single interpolation,
          allowing free-form 2D motion with fluid feedforward.
        </GalleryEntry>
        <GalleryEntry id="node-wires" label="G. Nodes and Noodles">
          A toy node-based programming interface. Nodes can be moved on a canvas
          and wires created by dragging from ports. Uses <Op>onDrop</Op> to
          remove wires that end up with no attached endpoints.
        </GalleryEntry>
        <GalleryEntry id="spec-workshop" label="H. Drag-Spec Designer">
          A programming environment for assembling Dragology drag-specs, built
          with Dragology. Blocks representing operators and states can be dragged
          into ports to compose a drag spec, which runs live in a preview.
        </GalleryEntry>
      </div>
    </FigureSection>
  );
}

function GalleryEntry({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const demo = demosById.get(id);
  if (!demo) throw new Error(`Figure demo "${id}" not found`);
  return (
    <div id={id}>
      <h3 className="text-base font-medium text-gray-600 mb-1">{label}</h3>
      <p className="text-sm text-gray-400 mb-2 leading-relaxed">{children}</p>
      <DemoCard demo={demo} linkTitle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Figure 3: Visualizers
// ---------------------------------------------------------------------------

function Figure3Visualizers() {
  const ringDemo = demosById.get("ring-of-beads");
  if (!ringDemo) throw new Error('Demo "ring-of-beads" not found');

  return (
    <FigureSection id="figure-3" number={3} title="Visualizers">
      <Caption>
        Three visualizers available to Dragology developers, shown here in the
        context of Alex's Ring of Beads. The paper figure depicts the{" "}
        <Op>d.closest</Op>{" "}+{" "}<Op>withFloating</Op> version (the
        second option in the Options panel below the demo). You can also try
        the other options — <Op>d.closest</Op>,{" "}
        <Op>d.closest.whenFar.withFloating</Op>, and <Op>d.between</Op> — to
        see how different operators change the interaction.
      </Caption>
      <DemoCard demo={ringDemo} linkTitle />
      <div className="text-sm text-gray-500 mt-4 leading-relaxed space-y-2">
        <p>
          Start a drag on one of the beads, then toggle these in the toolbar at
          the bottom of the page:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            <SettingRef>Overlay</SettingRef> — shows the
            pointer-target distances that <Op>closest</Op> consults to pick the
            active branch.
          </li>
          <li>
            <SettingRef>Drop zones</SettingRef> — shows which
            sub-behavior is triggered by different pointer positions (sampled in
            a grid).
          </li>
          <li>
            <SettingRef>Spec tree</SettingRef> — shows how each
            operator in a drag spec contributes to the observed behavior,
            including how <Op>closest</Op> picks the closest state and{" "}
            <Op>withFloating</Op> detaches the dragged element.
          </li>
        </ol>
      </div>
    </FigureSection>
  );
}

// ---------------------------------------------------------------------------
// Figure 4: Operators
// ---------------------------------------------------------------------------

const operators = {
  primitives: [
    {
      name: "state",
      signature: "state",
      description: "Use a state as a static drag-spec.",
    },
    {
      name: "vary",
      signature: "d.vary(state, paths, opts?)",
      description:
        "Pull dragged element to pointer by varying numbers at paths in state.",
    },
    {
      name: "dropTarget",
      signature: "d.dropTarget(targetId, state)",
      description:
        "Transition to a new state when dropped over a specified element.",
    },
  ],
  combinators: [
    {
      name: "closest",
      signature: "d.closest([spec1, spec2, ...], opts?)",
      description:
        "Pick the behavior resulting in the smallest pointer-target distance.",
    },
    {
      name: "between",
      signature: "d.between([spec1, spec2, ...], opts?)",
      description:
        "Interpolate smoothly between behaviors inside their convex hull.",
    },
    {
      name: "whenFar",
      signature: "spec.whenFar(specFar, opts?)",
      description:
        "Switch from spec to specFar when pointer is far from spec's targets.",
    },
    {
      name: "switchToStateAndFollow",
      signature: "d.switchToStateAndFollow(state, id, spec?)",
      description:
        "Immediately switch to a new state and follow a new element.",
    },
  ],
  modifiers: [
    {
      name: "withFloating",
      signature: "spec.withFloating(opts?)",
      description: "Detach dragged element and make it follow pointer.",
    },
    {
      name: "withSnapRadius",
      signature: "spec.withSnapRadius(radius, opts?)",
      description:
        "Pull the preview towards the drop state when close enough.",
    },
    {
      name: "onDrop",
      signature: "spec.onDrop(func)",
      description: "Transform the drop state using a provided function.",
    },
  ],
};

function Figure4Operators() {
  return (
    <FigureSection id="figure-4" number={4} title="Drag-Spec Operators">
      <Caption>
        Dragology drag-spec operators discussed in the paper. Optional arguments
        are marked with <code className="text-xs">?</code>.
      </Caption>
      <div className="bg-white rounded-lg shadow-sm p-5 text-sm space-y-5">
        <OperatorGroup title="Primitives — produce base behaviors" ops={operators.primitives} />
        <OperatorGroup title="Combinators — compose behaviors" ops={operators.combinators} />
        <OperatorGroup title="Modifiers — layer on additional features" ops={operators.modifiers} />
      </div>
    </FigureSection>
  );
}

function OperatorGroup({
  title,
  ops,
}: {
  title: string;
  ops: { name: string; signature: string; description: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 pb-1 border-b border-gray-100">
        {title}
      </div>
      <div className="space-y-2">
        {ops.map((op) => (
          <div key={op.name}>
            <OpSignature sig={op.signature} />
            <div className="text-gray-500 ml-4">{op.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders an operator signature with operator names highlighted */
function OpSignature({ sig }: { sig: string }) {
  // Highlight known operator names within the signature
  const opNames = [
    "switchToStateAndFollow", "withSnapRadius", "withFloating",
    "dropTarget", "closest", "between", "whenFar", "onDrop", "vary",
  ];
  const parts: { text: string; isOp: boolean }[] = [];
  let remaining = sig;
  while (remaining.length > 0) {
    let earliest = -1;
    let earliestName = "";
    for (const name of opNames) {
      const idx = remaining.indexOf(name);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestName = name;
      }
    }
    if (earliest === -1) {
      parts.push({ text: remaining, isOp: false });
      break;
    }
    if (earliest > 0) {
      parts.push({ text: remaining.slice(0, earliest), isOp: false });
    }
    parts.push({ text: earliestName, isOp: true });
    remaining = remaining.slice(earliest + earliestName.length);
  }
  return (
    <code className="text-[13px]">
      {parts.map((p, i) =>
        p.isOp ? (
          <span
            key={i}
            className="font-semibold italic px-0.5 rounded"
            style={{ color: "#008f88", backgroundColor: "#ecf6f2" }}
          >
            {p.text}
          </span>
        ) : (
          <span key={i} className="text-gray-800">{p.text}</span>
        ),
      )}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Figure 7: Study Examples
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Figure 5: Types
// ---------------------------------------------------------------------------

function srcLink(path: string) {
  return `${REPO}/${path}`;
}

const typeLinks: Record<string, string> = {
  Draggable: srcLink("src/draggable.tsx") + "#L10",
  DraggableProps: srcLink("src/draggable.tsx") + "#L12",
  DragSpecBuilder: srcLink("src/DragSpec.tsx") + "#L343",
  DragBehavior: srcLink("src/DragBehavior.tsx") + "#L58",
  DragFrame: srcLink("src/DragBehavior.tsx") + "#L66",
  DragResult: srcLink("src/DragBehavior.tsx") + "#L74",
  DragSpec: srcLink("src/DragSpec.tsx") + "#L140",
  DragInitContext: srcLink("src/DragBehavior.tsx") + "#L92",
  Vec2: srcLink("src/math/vec2.ts") + "#L5",
};

function Figure5Types() {
  return (
    <FigureSection id="figure-5" number={5} title="Core Types">
      <Caption>
        Core type definitions for Dragology's component and drag behavior
        system ({" "}
        <SrcLink href={REPO}>source</SrcLink>
        {" "}). The main developer-facing entry point is
        the <T>Draggable</T> component type, a pure function
        from <T>DraggableProps</T> (which includes model state)
        to a view. <FnName>dragSpecToBehavior</FnName> compiles
        a <T>DragSpec</T> together with
        a <T>DragInitContext</T> to produce
        a <T>DragBehavior</T>.
      </Caption>
      <div className="bg-white rounded-lg shadow-sm p-5 text-sm font-mono leading-relaxed space-y-3">
        <TypeDef>
          <T>Draggable</T> = <T>DraggableProps</T> &rarr; <TypeName>View</TypeName>
        </TypeDef>
        <TypeDef>
          <T>DraggableProps</T> =<br />
          <Fields>
            <Field>state: <TypeName>ModelState</TypeName></Field>
            <Field>d: <T>DragSpecBuilder</T></Field>
            <Field>draggedId: string | null</Field>
            <Field>setState: <TypeName>ModelState</TypeName> &rarr; void</Field>
            <Field>&hellip;</Field>
          </Fields>
        </TypeDef>
        <TypeDef>
          <T>DragBehavior</T> = <T>DragFrame</T> &rarr; <T>DragResult</T>
        </TypeDef>
        <TypeDef>
          <T>DragFrame</T> = {"{"} pointer: <T>Vec2</T> {"}"}
        </TypeDef>
        <TypeDef>
          <T>DragResult</T> =<br />
          <Fields>
            <Field>preview: <TypeName>View</TypeName></Field>
            <Field>dropState: <TypeName>ModelState</TypeName></Field>
            <Field>gap: number</Field>
            <Field>&hellip;</Field>
          </Fields>
        </TypeDef>
        <TypeDef>
          <T>DragSpec</T> =<br />
          <div className="ml-4">
            {"{"} type: "fixed", state: <TypeName>ModelState</TypeName> {"}"}<br />
            | {"{"} type: "closest", specs: <T>DragSpec</T>[] {"}"}<br />
            | &hellip;
          </div>
        </TypeDef>
        <TypeDef>
          <FnName>dragSpecToBehavior</FnName>: <T>DragSpec</T>{" "}
          &times; <T>DragInitContext</T> &rarr; <T>DragBehavior</T>
        </TypeDef>
        <TypeDef>
          <T>DragInitContext</T> =<br />
          <Fields>
            <Field>draggable: <T>Draggable</T></Field>
            <Field>draggedPath: string</Field>
            <Field>draggedId: string | null</Field>
            <Field>anchorPos: <T>Vec2</T></Field>
            <Field>pointerStart: <T>Vec2</T></Field>
            <Field>startState: <TypeName>ModelState</TypeName></Field>
          </Fields>
        </TypeDef>
      </div>
    </FigureSection>
  );
}

function TypeDef({ children }: { children: React.ReactNode }) {
  return <div className="pl-2 border-l-2 border-gray-100">{children}</div>;
}

function Fields({ children }: { children: React.ReactNode }) {
  return <div className="ml-4">{"{"}<div className="ml-4">{children}</div>{"}"}</div>;
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

/** Concrete type name — linked to source if available */
function T({ children }: { children: string }) {
  const href = typeLinks[children];
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-gray-700 underline decoration-gray-300 hover:decoration-gray-500 hover:text-gray-900"
      >
        {children}
      </a>
    );
  }
  return <TypeName>{children}</TypeName>;
}

/** Abstract / generic type name — not linked */
function TypeName({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-gray-700">{children}</span>;
}

/** Plain function name — monospace, no operator styling */
function FnName({ children }: { children: React.ReactNode }) {
  return <code className="font-semibold text-gray-700 text-[13px]">{children}</code>;
}

function SrcLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-500 hover:text-gray-700 underline"
    >
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Figure 6: Framework Comparison
// ---------------------------------------------------------------------------

function Figure6Agents() {
  return (
    <FigureSection id="figure-6" number={6} title="Framework Comparison">
      <p className="text-sm text-gray-400 italic">
        Omitted — see the paper for details.
      </p>
    </FigureSection>
  );
}

// ---------------------------------------------------------------------------
// Figure 7: Study Examples
// ---------------------------------------------------------------------------

function Figure7Study() {
  return (
    <FigureSection id="figure-7" number={7} title="Study Examples">
      <Caption>
        The six example interfaces used in our study. Participants worked
        through these in order during a pair-coded tutorial session. The{" "}
        <Link to="/study" className="text-green-600 hover:text-green-700 underline">
          study tasks page
        </Link>{" "}
        shows the interfaces as participants saw them (some with interactions
        left for the participant to implement). Below are the finished versions.
      </Caption>
      <div className="flex flex-col gap-8">
        <StudyEntry id="study-switch" label="A. Switch">
          A minimal introduction to Dragology. The switch has two states and
          uses <Op>between</Op> to slide between them, with the background
          transitioning from grey to green.
        </StudyEntry>
        <StudyEntry id="study-three-way-switch" label="B. Three-Way Switch">
          Three distinct states in a triangle. Using <Op>between</Op>, the knob
          can move anywhere in the triangle, interpolating colors as it goes.
        </StudyEntry>
        <StudyEntry id="study-reorderable-list" label="C. Reorderable List">
          Participants' first encounter with state-space reasoning — computing
          the set of reachable list orderings from a single element's
          perspective.
        </StudyEntry>
        <StudyEntry id="study-slider" label="D. Slider">
          A minimal example of continuous dragging with <Op>vary</Op>. Often
          sparked experiments with more complex knob paths.
        </StudyEntry>
        <StudyEntry id="study-rotary-dial" label="E. Rotary Dial">
          A variation of the slider demonstrating the versatility
          of <Op>vary</Op> — the same operator handles polar coordinates without
          explicit angle mapping.
        </StudyEntry>
        <StudyEntry id="study-timeline" label="F. Timeline">
          A multi-track audio/video editor where clips can be moved along tracks
          (continuous, via <Op>vary</Op>) and between tracks (discrete).
          Requires composing operators more deeply, constructing
          a <Op>vary</Op> for each track and joining them
          with <Op>closest</Op>.
        </StudyEntry>
      </div>
    </FigureSection>
  );
}

function StudyEntry({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const demo = demosById.get(id);
  if (!demo) throw new Error(`Study demo "${id}" not found`);
  return (
    <div id={id}>
      <h3 className="text-base font-medium text-gray-600 mb-1">{label}</h3>
      <p className="text-sm text-gray-400 mb-2 leading-relaxed">{children}</p>
      <DemoCard demo={demo} linkTitle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function FigureSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-lg font-medium text-gray-700 mb-3">
        Figure {number}<span className="text-gray-400 font-normal">: {title}</span>
      </h2>
      {children}
    </section>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-500 leading-relaxed mb-4">{children}</p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-400 mt-3 leading-relaxed">{children}</p>
  );
}

/** Inline reference to a setting in the toolbar */
function SettingRef({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-gray-600">{children}</span>
  );
}

/** Operator name styled like the paper's blue-green treatment */
function Op({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="font-semibold italic text-[13px] px-1 py-0.5 rounded"
      style={{ color: "#008f88", backgroundColor: "#ecf6f2" }}
    >
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FiguresPage() {
  useTitle("Declarative Dragging: Explorable Supplement");
  return (
    <DemoSettingsProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Hero / Introduction */}
        <div className="py-16 px-5 max-w-3xl mx-auto w-full text-center">
          <h1 className="text-4xl font-normal text-gray-800 mb-4">
            Declarative Dragging
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            Explorable Supplement
          </p>
          <p className="text-sm text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
            This site accompanies the paper with interactive versions of all
            figures, runnable study tasks, and a gallery of demos built with
            Dragology. Source code is available on{" "}
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 underline"
            >
              GitHub
            </a>.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => document.getElementById("paper-figures")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium cursor-pointer"
            >
              Paper Figures
            </button>
            <Link
              to="/demos"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors no-underline font-medium"
            >
              Demo Gallery
            </Link>
          </div>
        </div>

        {/* Paper Figures */}
        <div id="paper-figures" className="px-5 max-w-3xl mx-auto w-full scroll-mt-8">
          <h2 className="text-2xl font-normal text-gray-700 mb-2">
            Paper Figures
          </h2>
          <p className="text-sm text-gray-400 mb-10">
            Interactive versions of figures from the paper.
          </p>
        </div>

        <div className="flex flex-col gap-16 px-5 pb-5 max-w-3xl mx-auto flex-1 w-full">
          <Figure1Teaser />
          <Figure2Gallery />
          <Figure3Visualizers />
          <Figure4Operators />
          <Figure5Types />
          <Figure6Agents />
          <Figure7Study />

          {/* Demo Gallery callout */}
          <section id="demo-gallery" className="scroll-mt-8">
            <h2 className="text-2xl font-normal text-gray-700 mb-2">
              Demo Gallery
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Beyond the paper figures, Dragology ships with a larger gallery of
              demos exploring reorderable lists, puzzles, mathematical
              structures, 3D scenes, and more. Each demo includes its source
              code and the drag-spec operators it uses.
            </p>
            <Link
              to="/demos"
              className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors no-underline font-medium"
            >
              Browse the Demo Gallery
            </Link>
          </section>
        </div>

        <div className="pb-14" />
        <DemoSettingsBar />
      </div>
    </DemoSettingsProvider>
  );
}
