import { useState } from "react";
import { draggable, initialState } from "../demos/lists-in-lists";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import { DragSpecTreeView } from "../DragSpecTreeView";
import { StudioDraggable } from "./StudioDraggable";
import { Lens, Section } from "./StudioPage";

type State = typeof initialState;

const myInitialState: State = {
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

function ListsInListsWithTree() {
  const [showTree, setShowTree] = useState(true);
  const [dragStatus, setDragStatus] = useState<DragStatus<State> | null>(null);

  const draggingStatus = dragStatus?.type === "dragging" ? dragStatus : null;

  const WIDTH = 350;
  const HEIGHT = 170;

  return (
    <>
      <label className="inline-flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showTree}
          onChange={(e) => setShowTree(e.target.checked)}
        />
        <span>spec tree</span>
      </label>
      <Lens zoom={1} filenamePrefix="lists-in-lists">
        <div style={{ display: "flex", gap: 16, padding: 10 }}>
          <DraggableRenderer
            draggable={draggable}
            initialState={myInitialState}
            width={WIDTH}
            height={HEIGHT}
            onDragStatus={setDragStatus}
          />
          <div
            style={{ width: 370, height: 500, zoom: 0.7, overflow: "hidden" }}
          >
            {showTree && draggingStatus && (
              <DragSpecTreeView
                spec={draggingStatus.result.tracedSpec}
                activePath={draggingStatus.result.activePath}
                colorMap={null}
                svgWidth={WIDTH}
                svgHeight={HEIGHT}
                thumbArea={2000}
                nodeProps={{
                  "when-far/bg/": {
                    width: 80,
                    // height: 90,
                  },
                }}
              />
            )}
          </div>
        </div>
      </Lens>
    </>
  );
}

export function ListsInListsSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [showDropZones, setShowDropZones] = useState(false);

  return (
    <Section title="Lists in Lists">
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
      </div>
      <StudioDraggable
        draggable={draggable}
        initialState={myInitialState}
        width={350}
        height={170}
        zoom={2}
        filenamePrefix="lists-in-lists"
        padding={10}
        demoSettings={{ showDebugOverlay, showDropZones }}
      />
      <div style={{ height: 200 }} />
      <ListsInListsWithTree />
    </Section>
  );
}
