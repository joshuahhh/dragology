import { produce } from "immer";
import { useRef, useState } from "react";
import { defaultDemoContext, DemoContext, DemoDraggable } from "../demo/ui";
import {
  CANVAS_H,
  CANVAS_W,
  draggable,
  initialState,
} from "../demos/interval-graph";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext } from "./StudioHackContext";
import { Lens, Section } from "./StudioPage";

const myInitialState: typeof initialState = {
  meetings: [
    {
      start: 20,
      end: 100,
      room: 0,
    },
    {
      start: 60,
      end: 160,
      room: 1,
    },
    {
      start: 10,
      end: 70,
      room: 3,
    },
    {
      start: 120,
      end: 200,
      room: 0,
    },
    {
      start: 80,
      end: 140,
      room: 2,
    },
  ],
};

export function IntervalGraphSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const stateRef = useRef(null);
  return (
    <Section title="Interval Graph">
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
