import React, { useMemo, useState } from "react";
import { demo } from "../../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  ConfigRadio,
  DemoDraggable,
  DemoNotes,
  DemoWithConfig,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  candidates,
  parseTerm,
  printTerm,
  RewriteOptions,
  Term,
} from "./terms";

// # State

type State = { term: Term };

const examples = {
  duplicate: "(λx. x x) y",
  flip: "(λx y. y x) a b",
  nested: "(λx. x) ((λy. y) z)",
  "succ 2": "(λn f x. f (n f x)) (λf x. f (f x))",
  Ω: "(λx. x x) (λx. x x)",
  eta: "λx. f x",
} as const;
type ExampleName = keyof typeof examples;

const initialStates: Record<ExampleName, State> = Object.fromEntries(
  Object.entries(examples).map(([name, src]) => [
    name,
    { term: parseTerm(src, `${name}-`) },
  ]),
) as Record<ExampleName, State>;

const exampleOptions = Object.fromEntries(
  Object.entries(examples).map(([name, src]) => [
    name,
    <span key={name}>
      <b>{name}</b> <span className="font-mono text-gray-500">{src}</span>
    </span>,
  ]),
) as Record<ExampleName, React.ReactNode>;

// # Config

type Config = RewriteOptions;

const defaultConfig: Config = {
  beta: true,
  abstract: true,
  abstractAllOccurrences: false,
  etaExpand: false,
  etaReduce: true,
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
      const innerH = Math.max(fn.h, arg.h);
      w = PAD + fn.w + GAP + arg.w + PAD;
      h = innerH + 2 * PAD;
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
          <g transform={translate(PAD, PAD + (innerH - fn.h) / 2)}>
            {fn.element}
          </g>
          <g
            transform={translate(PAD + fn.w + GAP, PAD + (innerH - arg.h) / 2)}
          >
            {arg.element}
          </g>
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
  return d
    .closest(
      cands.map((c) => d.between([{ term: c.base }, { term: c.result }])),
    )
    .withSnapRadius(1, { chain: true });
}

const WIDTH = 720;
const HEIGHT = 240;

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
        <g transform={translate(20, 20)}>{rendered.element}</g>
        <text
          transform={translate(20, HEIGHT - 16)}
          fontSize={13}
          fontFamily="ui-monospace, Menlo, monospace"
          fill="#6b7280"
        >
          {printTerm(state.term)}
        </text>
      </g>
    );
  };
}

// # Component

export default demo(
  () => {
    const [example, setExample] = useState<ExampleName>("duplicate");
    const [config, setConfig] = useState(defaultConfig);
    const draggable = useMemo(() => draggableFactory(config), [config]);
    const set = (patch: Partial<Config>) =>
      setConfig((c) => ({ ...c, ...patch }));

    return (
      <div>
        <DemoNotes>
          λ-terms as nested boxes. <b>β-reduce</b> by dragging an argument
          leftward into the λ it's applied to: it slides onto the first bound
          variable, and copies split off for the others. Drag a subterm{" "}
          <b>rightward out</b> of an enclosing box to abstract over it (the
          reverse). Once a reduction completes, keep dragging to chain into the
          next one.
        </DemoNotes>
        <DemoWithConfig>
          <DemoDraggable
            key={example}
            draggable={draggable}
            initialState={initialStates[example]}
            width={WIDTH}
            height={HEIGHT}
          />
          <div className="flex flex-col gap-4">
            <ConfigPanel title="Term">
              <ConfigRadio
                value={example}
                onChange={setExample}
                options={exampleOptions}
              />
            </ConfigPanel>
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
        </DemoWithConfig>
      </div>
    );
  },
  {
    tags: [
      "d.closest",
      "d.between",
      "spec.withSnapRadius [chain]",
      "dragologyEmergeFrom",
    ],
  },
);
