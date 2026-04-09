import { useState } from "react";
import { draggable, initialState } from "../demos/nodes-and-noodles";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

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

export function NodesAndNoodlesSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  return (
    <Section title="Nodes and Noodles">
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
        width={300}
        height={120}
        zoom={4}
        cursorScale={2}
        filenamePrefix="nodes-and-noodles"
        demoSettings={{ showDebugOverlay }}
      />
    </Section>
  );
}
