import { produce } from "immer";
import { useMemo, useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { initialState, makeDraggable } from "../demos/ring-of-beads";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const versions = [
  { label: "Version 1", stage: "d.closest()" },
  { label: "Version 2", stage: "d.closest().withFloating()" },
] as const;

export function RingOfBeadsSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [versionIdx, setVersionIdx] = useState(0);
  const stateRef = useRef(null);
  const draggable = useMemo(
    () => makeDraggable(versions[versionIdx].stage),
    [versionIdx],
  );
  return (
    <Section title="Section 2">
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
          <CopyStateButton stateRef={stateRef} />
        </div>
        <Lens zoom={3}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <DemoDraggable
              draggable={draggable}
              initialState={initialState}
              width={300}
              height={300}
              stateRef={stateRef}
            />
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
