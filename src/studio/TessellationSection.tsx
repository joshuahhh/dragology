import { useState } from "react";
import { draggable, State } from "../demos/tessellation";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

const initialState: State = {
  shapes: [
    { id: "imj403zq", kind: { n: 4 }, x: 121.5, y: 247.83, rotDeg: 0 },
    { id: "e40wqbw9", kind: { n: 6 }, x: 189.8, y: 247.83, rotDeg: 330 },
    { id: "sbz04j7d", kind: { n: 3 }, x: 121.5, y: 287.27, rotDeg: 300 },
    { id: "za8jo88z", kind: { n: 4 }, x: 155.65, y: 306.99, rotDeg: 30 },
    { id: "c34ahnjn", kind: { n: 4 }, x: 235, y: 336.83, rotDeg: 0 },
  ],
};

export function TessellationSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  return (
    <Section title="Tessellation">
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
        initialState={initialState}
        width={600}
        height={450}
        zoom={2}
        filenamePrefix="tessellation"
        padding={15}
        demoSettings={{ showDebugOverlay }}
      />
    </Section>
  );
}
