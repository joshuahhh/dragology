import { produce } from "immer";
import { useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { listOfListsSimple } from "./list-of-lists-simple";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

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
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <DemoDraggable
              draggable={listOfListsSimple.draggable}
              initialState={listOfListsSimple.initialState}
              width={240}
              height={190}
            />
          </StudioHackContext.Provider>
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
