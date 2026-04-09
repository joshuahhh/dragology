import { useRef } from "react";
import {
  defaultDemoContext,
  DemoContext,
  DemoDraggable,
  DemoSettings,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { CopyStateButton } from "./CopyStateButton";
import { StudioHackContext, StudioHackSettings } from "./StudioHackContext";
import { Lens } from "./StudioPage";

export function StudioDraggable<T extends object>({
  draggable,
  initialState,
  width,
  height,
  stateOverride,
  zoom,
  filenamePrefix,
  padding,
  hackSettings,
  demoSettings,
  cursorScale,
}: {
  draggable: Draggable<T>;
  initialState: T;
  width: number;
  height: number;
  stateOverride?: Partial<T>;
  zoom: number;
  filenamePrefix: string;
  padding?: number;
  hackSettings?: StudioHackSettings;
  demoSettings?: Partial<DemoSettings>;
  cursorScale?: number;
}) {
  const stateRef = useRef<T | null>(null);

  const demoContextValue = demoSettings
    ? {
        ...defaultDemoContext,
        settings: { ...defaultDemoContext.settings, ...demoSettings },
      }
    : defaultDemoContext;

  return (
    <DemoContext.Provider value={demoContextValue}>
      <StudioHackContext.Provider value={hackSettings ?? {}}>
        <Lens
          zoom={zoom}
          cursorScale={cursorScale}
          filenamePrefix={filenamePrefix}
          belowLeftQr={<CopyStateButton stateRef={stateRef} />}
        >
          <div style={{ padding: padding ?? 0 }}>
            <DemoDraggable
              draggable={draggable}
              initialState={initialState}
              width={width}
              height={height}
              stateRef={stateRef}
              stateOverride={stateOverride}
            />
          </div>
        </Lens>
      </StudioHackContext.Provider>
    </DemoContext.Provider>
  );
}
