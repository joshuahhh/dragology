import { useMemo, useState } from "react";
import { allMorphs7, draggableFactory } from "../demos/twisted-trees";
import { tree7 } from "../demos/twisted-trees/trees";
import { StudioDraggable } from "./StudioDraggable";
import { Section } from "./StudioPage";

const defaultConfig = {
  oneNodeAtATime: false,
  showTradRep: false,
  interpolation: "natural-neighbor" as const,
};

export function TwistedTreesSection() {
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const draggable = useMemo(
    () => draggableFactory(tree7, tree7, allMorphs7, defaultConfig, 500),
    [],
  );
  const videoDraggable = useMemo(
    () => draggableFactory(tree7, tree7, allMorphs7, defaultConfig, 500, 350),
    [],
  );
  return (
    <>
      <Section title="Twisted Trees">
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
        </div>
        <StudioDraggable
          draggable={draggable}
          initialState={{ morph: allMorphs7[3681] }}
          width={460}
          height={400}
          zoom={1.5}
          filenamePrefix="twisted-trees"
          demoSettings={{ showDebugOverlay }}
          hackSettings={{ overlayHideDistances: true }}
        />
      </Section>
      <Section title="Twisted Trees Video">
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
        </div>
        <StudioDraggable
          draggable={videoDraggable}
          initialState={{ morph: allMorphs7[3681] }}
          width={700}
          height={500}
          zoom={1.5}
          filenamePrefix="twisted-trees"
          demoSettings={{ showDebugOverlay }}
          hackSettings={{ overlayHideDistances: true }}
        />
      </Section>
    </>
  );
}
