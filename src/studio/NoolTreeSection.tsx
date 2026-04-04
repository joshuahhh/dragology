import { useMemo, useState } from "react";
import {
  Config,
  draggableFactory,
  initialState,
  rewriteSets,
} from "../demos/nool/tree";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

// Enable only "Associativity: Pull up operand" (index 5) and "Pull down operand" (index 6)
const activeRewriteSets = rewriteSets.map(
  (_, i) => i === 2 || i === 5 || i === 6,
);

const config: Config = {
  activeRewriteSets,
  enableEmergeAnimation: true,
  forceTransformScale: false,
};

export const myInitialState: typeof initialState = {
  id: "root-1",
  label: "+",
  children: [
    {
      id: "root-1-1",
      label: "+",
      children: [
        {
          id: "root-1-1-2",
          label: "-",
          children: [{ id: "root-1-1-2-1", label: "\u{1F344}", children: [] }],
        },
        { id: "root-1-1-1", label: "\u26C5", children: [] },
      ],
    },
    { id: "root-1-2", label: "\u{1F344}", children: [] },
  ],
};

export function NoolTreeSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const draggable = useMemo(() => draggableFactory(config), []);
  return (
    <Section title="Nool Tree">
      <div className="mb-6 text-sm text-gray-500 space-y-2">
        <p>Record with cursor off.</p>
        <label className="inline-flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDebugOverlay}
            onChange={(e) => setShowDebugOverlay(e.target.checked)}
            className="accent-fuchsia-500"
          />
          <span className="text-fuchsia-600 font-medium">debug overlay</span>
        </label>
      </div>
      <StudioDraggable
        draggable={draggable}
        initialState={myInitialState}
        width={150}
        height={140}
        zoom={3}
        filenamePrefix="nool-tree"
        padding={15}
        demoSettings={{ showDebugOverlay }}
        hackSettings={{ overlayHideDistances: true }}
      />
    </Section>
  );
}
