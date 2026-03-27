import { produce } from "immer";
import { useMemo, useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import { allMorphs7, draggableFactory } from "../demos/order-preserving";
import { tree7 } from "../demos/order-preserving/trees";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const defaultConfig = {
  oneNodeAtATime: false,
  showTradRep: false,
  interpolation: "natural-neighbor" as const,
};

export function OrderPreservingSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const stateRef = useRef(null);
  const draggable = useMemo(
    () => draggableFactory(tree7, tree7, allMorphs7, defaultConfig, 500),
    [],
  );
  return (
    <Section title="Order-Preserving">
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
          <CopyStateButton stateRef={stateRef} />
        </div>
        <Lens zoom={1.5}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <DemoDraggable
              draggable={draggable}
              initialState={{ morph: allMorphs7[3681] }}
              width={460}
              height={400}
              stateRef={stateRef}
              // onDropState={(state) => {
              //   console.log(allMorphs7.indexOf(state.morph));
              // }}
            />
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
