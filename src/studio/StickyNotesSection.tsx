import { useState } from "react";
import { draggable, initialState } from "./sticky-notes";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

export function StickyNotesSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  return (
    <Section title="Sticky Notes">
      <div className="mb-6 text-sm text-gray-500 space-y-2">
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
        width={960}
        height={540}
        zoom={1}
        cursorScale={2}
        filenamePrefix="sticky-notes"
        demoSettings={{ showDebugOverlay }}
      />
    </Section>
  );
}
