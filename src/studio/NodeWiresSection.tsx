import { produce } from "immer";
import { useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { draggable, initialState } from "../demos/node-wires";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const myInitialState: typeof initialState = {
  nodes: {
    A: {
      type: "mix",
      x: 162.12605679491335,
      y: 10.210290707356368,
    },
    B: {
      type: "filter",
      x: 17.376399491653597,
      y: 49.251599985397256,
    },
  },
  wires: {
    w0: {
      from: {
        type: "on-port",
        nodeId: "A",
        port: "out",
      },
      to: {
        type: "free",
        x: 285.3769502249134,
        y: 95.00117136715184,
      },
    },
  },
};

export function NodeWiresSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const stateRef = useRef(null);
  return (
    <Section title="Nodes and Wires">
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
        <Lens zoom={4}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <DemoDraggable
              draggable={draggable}
              initialState={myInitialState}
              width={300}
              height={120}
              stateRef={stateRef}
            />
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
