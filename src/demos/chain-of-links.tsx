import { useMemo, useState } from "react";
import {
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";

import { demo } from "../demo";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { assertNever } from "../utils/assert";

const NUM_DOTS = 10;
const LINK_LENGTH = 40;
const DOT_RADIUS = 8;

const MODES = [
  "Normal",
  "Forget to disable transitions on chain",
  "Forget to chain at all",
] as const;

type Dot = { x: number; y: number };
type State = { dots: Dot[]; config: { mode: (typeof MODES)[number] } };

function makeInitialState(): State {
  const totalWidth = (NUM_DOTS - 1) * LINK_LENGTH;
  const startX = 300 - totalWidth / 2;
  const dots: Dot[] = [];
  for (let i = 0; i < NUM_DOTS; i++) {
    dots.push({ x: startX + i * LINK_LENGTH, y: 200 });
  }
  return { dots, config: undefined as any };
}

const initialState = makeInitialState();

/**
 * Sequential: walk outward from the dragged dot, placing each neighbor
 * at exactly LINK_LENGTH along its current direction from the anchor.
 * Greedy — doesn't account for downstream dots.
 */
function enforceSequential(state: State, draggedIdx: number): State {
  const dots = state.dots.map((d) => ({ ...d }));

  // Walk left from dragged dot
  for (let i = draggedIdx - 1; i >= 0; i--) {
    const anchor = Vec2(dots[i + 1]);
    const current = Vec2(dots[i]);
    const dir = current.sub(anchor);
    const dist = dir.len();
    if (dist < 0.001) {
      dots[i] = { x: anchor.x - LINK_LENGTH, y: anchor.y };
    } else {
      const target = anchor.add(dir.mul(LINK_LENGTH / dist));
      dots[i] = { x: target.x, y: target.y };
    }
  }

  // Walk right from dragged dot
  for (let i = draggedIdx + 1; i < dots.length; i++) {
    const anchor = Vec2(dots[i - 1]);
    const current = Vec2(dots[i]);
    const dir = current.sub(anchor);
    const dist = dir.len();
    if (dist < 0.001) {
      dots[i] = { x: anchor.x + LINK_LENGTH, y: anchor.y };
    } else {
      const target = anchor.add(dir.mul(LINK_LENGTH / dist));
      dots[i] = { x: target.x, y: target.y };
    }
  }

  return { ...state, dots };
}

const chainOfLinks: Draggable<State> = ({ state, d, draggedId }) => (
  <g>
    {/* Links */}
    {state.dots.map((dot, i) => {
      if (i === 0) return null;
      const prev = state.dots[i - 1];
      return (
        <line
          id={`link-${i}`}
          x1={prev.x}
          y1={prev.y}
          x2={dot.x}
          y2={dot.y}
          stroke="#999"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      );
    })}

    {/* Dots */}
    {state.dots.map((dot, i) => {
      const isDragged = draggedId === `dot-${i}`;
      return (
        <circle
          id={`dot-${i}`}
          transform={translate(dot.x, dot.y)}
          r={DOT_RADIUS}
          fill="#555"
          stroke={isDragged ? "#333" : "#888"}
          strokeWidth={isDragged ? 2.5 : 1.5}
          dragologyZIndex={isDragged ? "/1" : false}
          dragologyOnDrag={() => {
            const spec = d
              .vary(state, [param("dots", i, "x"), param("dots", i, "y")])
              .during((s) => enforceSequential(s, i));
            const mode = state.config.mode;
            switch (mode) {
              case "Normal":
                return spec.withChaining({ transition: false });
              case "Forget to disable transitions on chain":
                return spec.withChaining();
              case "Forget to chain at all":
                return spec;
              default:
                assertNever(mode);
            }
          }}
        />
      );
    })}
  </g>
);

export default demo(
  () => {
    const [mode, setMode] = useState<(typeof MODES)[number]>("Normal");
    const stateOverride = useMemo(() => ({ config: { mode } }), [mode]);
    return (
      <>
        <DemoNotes>
          Uses <code>vary</code> to move the dragged dot, <code>during</code> to
          update the rest of the chain, and (subtle part!){" "}
          <code>withChaining</code> so that the result of the rest-of-chain
          update is fed back into the next frame. (If you don't do this, you're
          always simulating drags from the drag-start state; you need to bring
          in hysteresis somehow!)
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={chainOfLinks}
            initialState={initialState}
            width={600}
            height={400}
            stateOverride={stateOverride}
          />
          <ConfigPanel>
            <ConfigSelect
              label="Mode"
              value={mode}
              onChange={setMode}
              options={MODES}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </>
    );
  },
  {
    tags: [
      "spec.during",
      "d.vary",
      "spec.withChaining [transition]",
      "physics",
    ],
  },
);
