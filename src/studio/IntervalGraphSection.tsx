import { useState } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  draggable,
  initialState,
} from "../demos/interval-graph";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

const myInitialState: typeof initialState = {
  meetings: [
    {
      start: 20,
      end: 100,
      room: 0,
    },
    {
      start: 60,
      end: 160,
      room: 1,
    },
    {
      start: 10,
      end: 70,
      room: 3,
    },
    {
      start: 120,
      end: 200,
      room: 0,
    },
    {
      start: 80,
      end: 140,
      room: 2,
    },
  ],
};

export function IntervalGraphSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [showVaryVisualizer, setShowVaryVisualizer] = useState(false);
  return (
    <Section title="Interval Graph">
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
        <label className="inline-flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVaryVisualizer}
            onChange={(e) => setShowVaryVisualizer(e.target.checked)}
            className="accent-orange-500"
          />
          <span className="text-orange-600 font-medium">vary visualizer</span>
        </label>
      </div>
      <StudioDraggable
        draggable={draggable}
        initialState={myInitialState}
        width={CANVAS_W}
        height={CANVAS_H}
        zoom={2}
        filenamePrefix="interval-graph"
        padding={15}
        demoSettings={{ showDebugOverlay, showVaryVisualizer }}
      />
    </Section>
  );
}
