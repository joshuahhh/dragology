import { produce } from "immer";
import { useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { listOfListsSimple } from "./list-of-lists-simple";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

export function TeaserSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  return (
    <Section title="Teaser">
      <DemoContext.Provider
        value={produce(defaultDemoContext, (draft) => {
          draft.settings.showDebugOverlay = showDebugOverlay;
        })}
      >
        <div className="mb-6 text-sm text-gray-500 space-y-2">
          <p>Record with cursor off.</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>
              Turn on{" "}
              <label className="inline-flex items-center gap-1 cursor-pointer select-none align-baseline">
                <input
                  type="checkbox"
                  checked={showDebugOverlay}
                  onChange={(e) => setShowDebugOverlay(e.target.checked)}
                  className="accent-fuchsia-500"
                />
                <span className="text-fuchsia-600 font-medium">
                  debug overlay
                </span>
              </label>
              , and press bottom-right of A. Turn it off.
            </li>
            <li>Put A solidly into every possible position.</li>
            <li>Bring A back to start.</li>
            <li>Drag a bit left, then down.</li>
          </ol>
        </div>
        <Lens zoom={3}>
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
    </Section>
  );
}
