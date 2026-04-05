import { produce } from "immer";
import { ReactNode, useRef } from "react";
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
}) {
  const stateRef = useRef<T | null>(null);

  const demoContextValue = demoSettings
    ? produce(defaultDemoContext, (draft) => {
        Object.assign(draft.settings, demoSettings);
      })
    : defaultDemoContext;

  let content: ReactNode = (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={width}
      height={height}
      stateRef={stateRef}
      stateOverride={stateOverride}
    />
  );

  if (padding != null) {
    content = <div style={{ padding }}>{content}</div>;
  }

  if (hackSettings) {
    content = (
      <StudioHackContext.Provider value={hackSettings}>
        {content}
      </StudioHackContext.Provider>
    );
  }

  return (
    <DemoContext.Provider value={demoContextValue}>
      <Lens
        zoom={zoom}
        filenamePrefix={filenamePrefix}
        belowLeftQr={<CopyStateButton stateRef={stateRef} />}
      >
        {content}
      </Lens>
    </DemoContext.Provider>
  );
}
