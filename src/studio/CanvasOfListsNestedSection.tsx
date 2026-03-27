import { produce } from "immer";
import { useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { draggable, initialState } from "../demos/canvas-of-lists-nested";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const myInitialState: typeof initialState = {
  rows: [
    {
      type: "row",
      id: "row1",
      items: [
        { type: "tile", id: "A1", label: "B1" },
        { type: "tile", id: "B1", label: "B2" },
        {
          type: "row",
          id: "row1-1",
          items: [
            { type: "tile", id: "A1-1", label: "Y1" },
            { type: "tile", id: "B1-1", label: "Y2" },
          ],
          color: "#f5eac9",
        },
      ],
      color: "#c9e4f0",
      x: 0,
      y: 0,
    },
    {
      type: "row",
      id: "row2",
      items: [
        { type: "tile", id: "A2", label: "R1" },
        { type: "tile", id: "B2", label: "R2" },
        { type: "tile", id: "C2", label: "R3" },
      ],
      color: "#f5d5d8",
      x: 20,
      y: 100,
    },
  ],
};

export function CanvasOfListsNestedSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [showDropZones, setShowDropZones] = useState(false);
  const stateRef = useRef(null);
  return (
    <Section title="Nested Rows on Canvas">
      <DemoContext.Provider
        value={produce(defaultDemoContext, (draft) => {
          draft.settings.showDebugOverlay = showDebugOverlay;
          draft.settings.showDropZones = showDropZones;
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
          <label className="inline-flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDropZones}
              onChange={(e) => setShowDropZones(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-blue-600 font-medium">drop zones</span>
          </label>
          <CopyStateButton stateRef={stateRef} />
        </div>
        <Lens zoom={2}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <div style={{ padding: 10 }}>
              <DemoDraggable
                draggable={draggable}
                initialState={myInitialState}
                width={350}
                height={170}
                stateRef={stateRef}
              />
            </div>
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
