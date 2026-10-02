import { useState } from "react";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type Preset = "calm" | "busy" | "wild";

type State = { preset: Preset };

const initialState: State = { preset: "calm" };

const PRESETS: Record<Preset, { data: number[]; color: string; x: number }> = {
  calm: { data: [20, 25, 22, 28, 24, 26], color: "#3b82f6", x: 0 },
  busy: { data: [60, 35, 75, 50, 80, 45], color: "#f59e0b", x: 120 },
  wild: { data: [95, 10, 85, 5, 100, 30], color: "#ef4444", x: 240 },
};

const CHART_H = 110;
const BAR_W = 18;
const BAR_GAP = 6;

// A component's insides belong to React, so `key` is fine here.
function BarChart({
  data,
  color,
  label,
}: {
  data: number[];
  color: string;
  label: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <g>
      <text x={0} y={-10} fontSize={13} fill="#374151">
        {label}
      </text>
      <line
        x1={0}
        x2={data.length * (BAR_W + BAR_GAP)}
        y1={CHART_H}
        y2={CHART_H}
        stroke="#9ca3af"
      />
      {data.map((v, i) => (
        <rect
          key={i}
          x={i * (BAR_W + BAR_GAP)}
          y={CHART_H - v}
          width={BAR_W}
          height={Math.max(0, v)}
          fill={i === selected ? "#111827" : color}
          style={{ cursor: "pointer" }}
          onClick={() => setSelected(i === selected ? null : i)}
        />
      ))}
    </g>
  );
}

const draggable: Draggable<State> = ({ state, d }) => {
  const preset = PRESETS[state.preset];
  return (
    <g>
      <g transform={translate(20, 30)}>
        <BarChart
          data={preset.data}
          color={preset.color}
          label="dragologyLerpProps"
          dragologyLerpProps={["data", "color"]}
        />
      </g>
      <g transform={translate(200, 30)}>
        <BarChart data={preset.data} color={preset.color} label="no lerp" />
      </g>

      <g transform={translate(40, 190)}>
        <line x1={0} x2={240} stroke="#d1d5db" strokeWidth={6} />
        {(Object.keys(PRESETS) as Preset[]).map((name) => (
          <text
            x={PRESETS[name].x}
            y={30}
            textAnchor="middle"
            fontSize={12}
            fill="#6b7280"
          >
            {name}
          </text>
        ))}
        <circle
          transform={translate(preset.x, 0)}
          r={12}
          fill={preset.color}
          dragologyOnDrag={() =>
            d
              .between([
                { preset: "calm" },
                { preset: "busy" },
                { preset: "wild" },
              ])
              .withDropTransition("elastic-out")
          }
        />
      </g>
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        <p>
          Both charts are the same React component,{" "}
          <code>&lt;BarChart&gt;</code>, with its own state: click a bar to
          select it. Drag the knob. Mid-drag, Dragology draws a blend of states,
          and the left chart has{" "}
          <code>dragologyLerpProps={'{["data", "color"]}'}</code>, so its props
          are blended too. The right chart isn't blended: it shows the nearest
          preset. On drop, the knob and the left chart's bars overshoot and
          settle.
        </p>
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={360}
        height={240}
      />
    </div>
  ),
  {
    tags: [
      "d.between",
      "spec.withDropTransition",
      "component elements [dragologyLerpProps]",
    ],
  },
);
