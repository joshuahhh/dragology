import { useMemo, useState } from "react";
import { initialState, makeDraggable } from "../demos/ring-of-beads";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

const versions: {
  label: string;
  stage: Parameters<typeof makeDraggable>[0];
}[] = [
  { label: "Version 1", stage: "d.closest()" },
  { label: "Version 2", stage: "d.closest().withFloating()" },
  { label: "Video version", stage: "d.closest().whenFar().withFloating()" },
];

export function RingOfBeadsSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [versionIdx, setVersionIdx] = useState(0);
  const draggable = useMemo(
    () => makeDraggable(versions[versionIdx].stage),
    [versionIdx],
  );
  return (
    <Section title="Section 2">
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
      </div>
      <StudioDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={300}
        zoom={3}
        filenamePrefix="ring-of-beads"
        demoSettings={{ showDebugOverlay }}
      />
    </Section>
  );
}
