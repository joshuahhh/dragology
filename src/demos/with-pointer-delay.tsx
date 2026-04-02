import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigPanel,
  ConfigSlider,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../demo/ui";
import { dragSpecToBehavior } from "../DragBehavior";
import { Draggable } from "../draggable";
import { DragSpec, DragSpecBuilder, param } from "../DragSpec";
import { translate, Vec2 } from "../lib";

function withPointerDelay<T extends object>(
  d: DragSpecBuilder<T>,
  inner: DragSpec<T>,
  delayMs: number,
): DragSpec<T> {
  return d.custom((ctx) => {
    const innerBehavior = dragSpecToBehavior(inner, ctx);
    const log: { time: number; pointer: Vec2 }[] = [];

    return (frame) => {
      const now = performance.now();
      log.push({ time: now, pointer: frame.pointer });

      const targetTime = now - delayMs;
      while (log.length > 1 && log[1].time <= targetTime) {
        log.shift();
      }

      return innerBehavior({ pointer: log[0].pointer });
    };
  });
}

type State = {
  x: number;
  y: number;
  config: {
    delayMs: number;
  };
};

const RADIUS = 15;
const initialState: State = { x: 200, y: 200, config: undefined as any };

const draggable: Draggable<State> = ({ state, d }) => {
  return (
    <circle
      transform={translate(state)}
      r={RADIUS}
      dragologyOnDrag={() =>
        withPointerDelay(
          d,
          d.vary(state, [param("x"), param("y")]),
          state.config.delayMs,
        )
      }
    />
  );
};

export default demo(
  () => {
    const [delayMs, setDelayMs] = useState(250);
    const stateOverride = useMemo(() => ({ config: { delayMs } }), [delayMs]);
    return (
      <div>
        <DemoNotes>
          <p>
            Demonstration of making a new operator (using <code>d.custom</code>
            ): <code>withPointerDelay</code> lags the pointer before feeding it
            to a nested behavior.
          </p>
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={400}
            height={400}
            stateOverride={stateOverride}
          />
          <ConfigPanel>
            <ConfigSlider
              label="Delay"
              value={delayMs}
              onChange={setDelayMs}
              min={0}
              max={1000}
              step={10}
              formatValue={(v) => `${v}ms`}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </div>
    );
  },
  { tags: ["d.custom", "d.vary"] },
);
