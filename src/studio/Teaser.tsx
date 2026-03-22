import { produce } from "immer";
import { useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { Lens, Section } from "./StudioPage";
import { listOfListsSimple } from "./list-of-lists-simple";

export function Teaser() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  return (
    <Section title="Teaser">
      <DemoContext.Provider
        value={produce(defaultDemoContext, (draft) => {
          draft.settings.showDebugOverlay = showDebugOverlay;
        })}
      >
        <Lens zoom={2}>
          <DemoDraggable
            draggable={listOfListsSimple.draggable}
            initialState={listOfListsSimple.initialState}
            width={240}
            height={190}
          />
        </Lens>
      </DemoContext.Provider>
      <label className="flex items-center gap-2 mt-4 text-sm text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showDebugOverlay}
          onChange={(e) => setShowDebugOverlay(e.target.checked)}
        />
        Debug overlay
      </label>
    </Section>
  );
}
