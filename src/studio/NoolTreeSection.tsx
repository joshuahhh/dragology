import { produce } from "immer";
import { useMemo, useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import {
  Config,
  draggableFactory,
  initialState,
  rewriteSets,
} from "../demos/nool/tree";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

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
          children: [{ id: "root-1-1-2-1", label: "🍄", children: [] }],
        },
        { id: "root-1-1-1", label: "⛅", children: [] },
      ],
    },
    { id: "root-1-2", label: "🍄", children: [] },
  ],
};

export function NoolTreeSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const stateRef = useRef(null);
  const draggable = useMemo(() => draggableFactory(config), []);
  return (
    <Section title="Nool Tree">
      <DemoContext.Provider
        value={produce(defaultDemoContext, (draft) => {
          draft.settings.showDebugOverlay = showDebugOverlay;
        })}
      >
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
          <CopyStateButton stateRef={stateRef} />
        </div>
        <Lens zoom={3}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <div style={{ padding: 15 }}>
              <DemoDraggable
                draggable={draggable}
                initialState={myInitialState}
                width={150}
                height={140}
                stateRef={stateRef}
              />
            </div>
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
