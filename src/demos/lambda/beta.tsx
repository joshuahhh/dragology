import { useMemo, useState } from "react";
import { demo } from "../../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoNotes,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import { ExampleName, examples } from "./examples";
import {
  candidates,
  parseTerm,
  printTerm,
  RewriteOptions,
  Term,
} from "./terms";

// # State

type State = { term: Term };

const exampleNames = Object.keys(examples) as ExampleName[];

const initialStates: Record<ExampleName, State> = Object.fromEntries(
  Object.entries(examples).map(([name, example]) => [
    name,
    { term: parseTerm(example.src, `${name}-`) },
  ]),
) as Record<ExampleName, State>;

// # Config

type Config = RewriteOptions;

const defaultConfig: Config = {
  beta: true,
  abstract: true,
  abstractAllOccurrences: false,
  etaExpand: false,
  etaReduce: false,
};

// # Colors

const hueByName = new Map<string, number>();
const HUES = [205, 350, 130, 40, 275, 180, 20, 95];
function hueFor(name: string): number {
  let hue = hueByName.get(name);
  if (hue === undefined) {
    hue = HUES[hueByName.size % HUES.length];
    hueByName.set(name, hue);
  }
  return hue;
}

// # Layout

const PAD = 6;
const GAP = 6;
const FONT = 15;
const CHAR_W = 8.4;
const VAR_H = 24;
const VAR_PAD_X = 7;
/** Applications wider than this stack their argument under the function */
const MAX_ROW_W = 460;
const INDENT = 18;

type Rendered = { element: Svgx; w: number; h: number };

function renderTerm(
  state: State,
  term: Term,
  d: DragSpecBuilder<State>,
  config: Config,
  draggedId: string | null,
  bound: Set<string>,
): Rendered {
  const isDragged = term.id === draggedId;

  let w: number, h: number, contents: Svgx;

  switch (term.type) {
    case "hole": {
      const of = renderTerm(state, term.of, d, config, null, bound);
      w = of.w;
      h = of.h;
      contents = (
        <g>
          <rect
            width={w}
            height={h}
            rx={8}
            fill="none"
            stroke="rgba(120, 110, 100, 0.4)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </g>
      );
      break;
    }
    case "var": {
      w = term.name.length * CHAR_W + 2 * VAR_PAD_X;
      h = VAR_H;
      const free = !bound.has(term.name);
      const hue = hueFor(term.name);
      contents = (
        <g>
          <rect
            width={w}
            height={h}
            rx={h / 2}
            fill={free ? "#e5e7eb" : `hsl(${hue}, 75%, 82%)`}
            stroke={free ? "#9ca3af" : `hsl(${hue}, 50%, 55%)`}
            strokeWidth={1}
          />
          <text
            x={w / 2}
            y={h / 2}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={FONT}
            fontFamily="ui-monospace, Menlo, monospace"
            fontStyle="italic"
            fill="#1f2937"
          >
            {term.name}
          </text>
        </g>
      );
      break;
    }
    case "lam": {
      const label = `λ${term.param}.`;
      const labelW = label.length * CHAR_W;
      const body = renderTerm(
        state,
        term.body,
        d,
        config,
        draggedId,
        new Set([...bound, term.param]),
      );
      w = PAD + labelW + GAP + body.w + PAD;
      h = body.h + 2 * PAD;
      const hue = hueFor(term.param);
      contents = (
        <g>
          <rect
            width={w}
            height={h}
            rx={8}
            fill={`hsla(${hue}, 75%, 80%, 0.3)`}
            stroke={`hsl(${hue}, 45%, 62%)`}
            strokeWidth={1}
          />
          <text
            x={PAD + labelW / 2}
            y={h / 2}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={FONT}
            fontFamily="ui-monospace, Menlo, monospace"
            fill={`hsl(${hue}, 45%, 35%)`}
          >
            {label}
          </text>
          <g transform={translate(PAD + labelW + GAP, PAD)}>{body.element}</g>
        </g>
      );
      break;
    }
    case "app": {
      const fn = renderTerm(state, term.fn, d, config, draggedId, bound);
      const arg = renderTerm(state, term.arg, d, config, draggedId, bound);
      // Side by side if it fits, otherwise the argument goes under the
      // function, indented.
      const rowW = PAD + fn.w + GAP + arg.w + PAD;
      const stacked = rowW > MAX_ROW_W;
      const innerH = Math.max(fn.h, arg.h);
      w = stacked ? PAD + Math.max(fn.w, INDENT + arg.w) + PAD : rowW;
      h = stacked ? PAD + fn.h + GAP + arg.h + PAD : innerH + 2 * PAD;
      const fnPos = stacked
        ? translate(PAD, PAD)
        : translate(PAD, PAD + (innerH - fn.h) / 2);
      const argPos = stacked
        ? translate(PAD + INDENT, PAD + fn.h + GAP)
        : translate(PAD + fn.w + GAP, PAD + (innerH - arg.h) / 2);
      contents = (
        <g>
          <rect
            width={w}
            height={h}
            rx={8}
            fill="rgba(120, 110, 100, 0.06)"
            stroke="rgba(120, 110, 100, 0.35)"
            strokeWidth={1}
          />
          <g transform={fnPos}>{fn.element}</g>
          <g transform={argPos}>{arg.element}</g>
        </g>
      );
      break;
    }
  }

  // The layer's first <rect> and <text> children are what the emerge
  // animation interpolates, so keep them as direct children of the id'd <g>.
  const element = (
    <g
      id={term.id}
      style={{ cursor: "grab" }}
      dragologyZIndex={isDragged ? "/1" : false}
      dragologyEmergeFrom={term.emergeFrom}
      dragologyEmergeMode={term.emergeMode}
      dragologyOnDrag={() => dragSpec(d, state, term.id, config)}
    >
      {contents.props.children}
    </g>
  );

  return { element, w, h };
}

function dragSpec(
  d: DragSpecBuilder<State>,
  state: State,
  draggedId: string,
  config: Config,
) {
  const cands = candidates(state.term, draggedId, config);
  if (cands.length === 0) return d.between([state]);
  // Candidates with a waypoint (`mid`) use it as the drag target: dragging
  // there shows the dragged node in place, and dropping there completes the
  // rewrite, with the collapse as the drop animation.
  const midToResult = new Map<State, State>();
  const branches = cands.map((c) => {
    const base = { term: c.base };
    const result = { term: c.result };
    if (c.mid) {
      const mid = { term: c.mid };
      midToResult.set(mid, result);
      return d.between([base, mid]);
    }
    return d.between([base, result]);
  });
  // onDrop maps a waypoint to the completed rewrite.
  return d.closest(branches).onDrop((s) => midToResult.get(s) ?? s);
}

const WIDTH = 680;
const HEIGHT = 420;

function draggableFactory(config: Config): Draggable<State> {
  return ({ state, d, draggedId }) => {
    const rendered = renderTerm(
      state,
      state.term,
      d,
      config,
      draggedId,
      new Set(),
    );
    return (
      <g>
        <text
          transform={translate(20, 24)}
          fontSize={13}
          fontFamily="ui-monospace, Menlo, monospace"
          fill="#6b7280"
        >
          {printTerm(state.term)}
        </text>
        <g transform={translate(20, 44)}>{rendered.element}</g>
      </g>
    );
  };
}

// # Component

export default demo(
  () => {
    const [example, setExample] = useState<ExampleName>("duplicate");
    const [resets, setResets] = useState(0);
    const [config, setConfig] = useState(defaultConfig);
    const draggable = useMemo(() => draggableFactory(config), [config]);
    const set = (patch: Partial<Config>) =>
      setConfig((c) => ({ ...c, ...patch }));

    return (
      <div>
        <DemoNotes>
          λ-terms as nested boxes. <b>β-reduce</b> by dragging an argument onto
          a bound variable inside the λ it's applied to: copies split off for
          the other occurrences as you go, and when it lands the boxes collapse.
          Drag a subterm <b>rightward out</b> of an enclosing box to abstract
          over it (the reverse).
        </DemoNotes>
        <div className="flex flex-col gap-2 max-w-full">
          <div className="flex flex-wrap gap-1.5">
            {exampleNames.map((name) => (
              <button
                key={name}
                title={examples[name].src}
                onClick={() => {
                  setExample(name);
                  setResets((n) => n + 1);
                }}
                className={`text-xs px-2 py-1 rounded border ${
                  name === example
                    ? "bg-blue-50 border-blue-400 text-blue-800"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-600">
            {examples[example].blurb}{" "}
            <span className="text-gray-400">
              (Click the button again to reset.)
            </span>
          </div>
          <DemoDraggable
            key={`${example}-${resets}`}
            draggable={draggable}
            initialState={initialStates[example]}
            width={WIDTH}
            height={HEIGHT}
          />
          <ConfigPanel title="Rewrites">
            <ConfigCheckbox
              value={config.beta}
              onChange={(v) => set({ beta: v })}
            >
              <b>β-reduction</b>
              <br />
              drag an argument into its λ
            </ConfigCheckbox>
            <ConfigCheckbox
              value={config.abstract}
              onChange={(v) => set({ abstract: v })}
            >
              <b>Abstraction</b> (reverse β)
              <br />
              drag a subterm out of an enclosing box
            </ConfigCheckbox>
            <ConfigCheckbox
              value={config.abstractAllOccurrences}
              onChange={(v) => set({ abstractAllOccurrences: v })}
            >
              …abstracting over <i>all</i> identical occurrences
              <br />
              (copies merge back into the dragged one)
            </ConfigCheckbox>
            <ConfigCheckbox
              value={config.etaReduce}
              onChange={(v) => set({ etaReduce: v })}
            >
              <b>η-reduction</b>
              <br />
              drag <i>f</i> out of λx. f x
            </ConfigCheckbox>
            <ConfigCheckbox
              value={config.etaExpand}
              onChange={(v) => set({ etaExpand: v })}
            >
              <b>η-expansion</b>
              <br />
              drag any subterm slightly right
            </ConfigCheckbox>
          </ConfigPanel>
        </div>
      </div>
    );
  },
  {
    tags: ["d.closest", "d.between", "spec.onDrop", "dragologyEmergeFrom"],
  },
);
