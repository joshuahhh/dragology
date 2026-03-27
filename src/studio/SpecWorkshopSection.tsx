import { produce } from "immer";
import { useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import {
  CANVAS_H,
  CANVAS_W,
  draggable,
  initialState,
} from "../demos/spec-workshop";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const myInitialState: typeof initialState = {
  nodes: {
    "active-spec": {
      expr: {
        type: "activeSpec",
        childId: "bfklm1ng",
      },
      x: 0,
      y: 52,
    },
    bfklm1ng: {
      expr: {
        type: "closest",
        childIds: ["1pggqcdg"],
      },
      x: 210,
      y: 33,
    },
    "1pggqcdg": {
      expr: {
        type: "between",
        childIds: ["qkdygxiu", "zkf47ngo"],
      },
      x: 142,
      y: 33,
    },
    qkdygxiu: {
      expr: {
        type: "state",
        label: "A",
      },
      x: 20,
      y: 33,
    },
    zkf47ngo: {
      expr: {
        type: "state",
        label: "B",
      },
      x: 52,
      y: 33,
    },
    rhg56unc: {
      expr: {
        type: "state",
        label: "C",
      },
      x: 237.00088579143605,
      y: 182.24958965045928,
    },
    wd3fht5z: {
      expr: {
        type: "between",
        childIds: ["smbaggyf", "rhg56unc"],
      },
      x: 191.50069813075447,
      y: 169.24929725558866,
    },
    smbaggyf: {
      expr: {
        type: "state",
        label: "A",
      },
      x: 239.5010777575578,
      y: 274.24992547972755,
    },
  },
  previewDot: "A",
};

export function SpecWorkshopSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const stateRef = useRef(null);
  return (
    <Section title="Spec Workshop">
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
        <Lens zoom={2}>
          <StudioHackContext.Provider
            value={{
              overlayFullOpacity: true,
              overlayHideDistances: true,
            }}
          >
            <div style={{ padding: 15 }}>
              <DemoDraggable
                draggable={draggable}
                initialState={myInitialState}
                width={CANVAS_W}
                height={CANVAS_H}
                stateRef={stateRef}
              />
            </div>
          </StudioHackContext.Provider>
        </Lens>
      </DemoContext.Provider>
    </Section>
  );
}
