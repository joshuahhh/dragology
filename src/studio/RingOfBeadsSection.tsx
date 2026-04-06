import { useEffect, useMemo, useState } from "react";
import { initialState, makeDraggable } from "../demos/ring-of-beads";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import { DragSpecTreeView } from "../DragSpecTreeView";
import { Vec2 } from "../lib";
import { StudioDraggable } from "./StudioDraggable";
import { Lens, Section } from "./StudioPage";

const versions: {
  label: string;
  stage: Parameters<typeof makeDraggable>[0];
}[] = [
  { label: "Version 1", stage: "d.closest()" },
  { label: "Version 2", stage: "d.closest().withFloating()" },
  { label: "Video version", stage: "d.closest().whenFar().withFloating()" },
];

type State = typeof initialState;

function RingOfBeadsWithTree({ versionIdx }: { versionIdx: number }) {
  const draggable = useMemo(
    () => makeDraggable(versions[versionIdx].stage),
    [versionIdx],
  );
  const [showTree, setShowTree] = useState(true);
  const [dragStatus, setDragStatus] = useState<DragStatus<State> | null>(null);

  const draggingStatus = dragStatus?.type === "dragging" ? dragStatus : null;

  const WIDTH = 300;
  const HEIGHT = 300;

  const basicTreeProps = draggingStatus && {
    spec: draggingStatus.result.tracedSpec,
    activePath: draggingStatus.result.activePath,
    colorMap: null as Map<string, string> | null,
  };

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
      <Lens zoom={1} filenamePrefix="ring-of-beads">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            padding: 10,
            width: 960,
            height: 540,
          }}
        >
          <div style={{ alignSelf: "flex-end", zoom: 1.2 }}>
            <DraggableRenderer
              draggable={draggable}
              initialState={initialState}
              width={WIDTH}
              height={HEIGHT}
              onDragStatus={setDragStatus}
              simulateDrag={{ id: "A", offset: Vec2(0, -80) }}
              key={versionIdx}
            />
          </div>
          {showTree &&
            draggingStatus &&
            {
              "0": (
                <div
                  style={{
                    width: 500,
                    height: 500,
                    zoom: 1,
                    overflow: "hidden",
                  }}
                >
                  <DragSpecTreeView
                    {...basicTreeProps!}
                    svgWidth={WIDTH}
                    svgHeight={HEIGHT}
                    thumbArea={13000}
                  />
                </div>
              ),
              "1": (
                <div
                  style={{
                    width: 500,
                    height: 500,
                    zoom: 1,
                    overflow: "hidden",
                  }}
                >
                  <DragSpecTreeView
                    {...basicTreeProps!}
                    svgWidth={WIDTH}
                    svgHeight={HEIGHT}
                    thumbArea={12000}
                  />
                </div>
              ),
              "2": (
                <div
                  style={{
                    width: 500,
                    height: 500,
                    zoom: 1,
                    overflow: "hidden",
                  }}
                >
                  <DragSpecTreeView
                    {...basicTreeProps!}
                    svgWidth={WIDTH}
                    svgHeight={HEIGHT}
                    thumbArea={12000}
                  />
                </div>
              ),
            }[versionIdx]}
        </div>
      </Lens>
    </>
  );
}

export function RingOfBeadsSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [cleanOverlay, setCleanOverlay] = useState(false);
  const [versionIdx, setVersionIdx] = useState(2);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setShowDebugOverlay((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const draggable = useMemo(
    () => makeDraggable(versions[versionIdx].stage),
    [versionIdx],
  );
  return (
    <Section title="Section 2">
      <div
        className="text-sm text-gray-500 space-y-2"
        style={{
          position: "sticky",
          top: 16,
          zIndex: 50,
        }}
      >
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
            checked={cleanOverlay}
            onChange={(e) => setCleanOverlay(e.target.checked)}
            className="accent-emerald-500"
          />
          <span className="text-emerald-600 font-medium">clean overlay</span>
        </label>
        <select
          value={versionIdx}
          onChange={(e) => setVersionIdx(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          {versions.map((v, i) => (
            <option key={i} value={i}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <StudioDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={300}
        zoom={3}
        filenamePrefix="ring-of-beads"
        demoSettings={{ showDebugOverlay }}
        hackSettings={{
          overlayFullOpacity: cleanOverlay || undefined,
          overlayHideDistances: cleanOverlay || undefined,
        }}
      />
      <div style={{ height: 200 }} />
      <RingOfBeadsWithTree versionIdx={0} />
      <RingOfBeadsWithTree versionIdx={1} />
      <RingOfBeadsWithTree versionIdx={2} />
    </Section>
  );
}
