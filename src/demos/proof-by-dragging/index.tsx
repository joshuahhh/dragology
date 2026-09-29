import _ from "lodash";
import { useMemo, useState } from "react";
import { demo } from "../../demo";
import {
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoLink,
  DemoNotes,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  casesHypOr,
  childPrec,
  Formula,
  Goal,
  introGoalImp,
  isBinary,
  link,
  linkTargets,
  Loc,
  locFormula,
  needsParens,
  sequent,
  show,
  splitGoalAnd,
  splitHypAnd,
  State,
  undo,
} from "./logic";

// # Problems

const problems: { name: string; make: () => Goal[] }[] = [
  {
    name: "Modus ponens: p, p → q ⊢ q",
    make: () => [sequent(["p", "p -> q"], "q")],
  },
  {
    name: "Commutativity: p ∧ q ⊢ q ∧ p",
    make: () => [sequent(["p & q"], "q & p")],
  },
  {
    name: "Cases: p ∨ q, p → r, q → r ⊢ r",
    make: () => [sequent(["p | q", "p -> r", "q -> r"], "r")],
  },
  {
    name: "Distributivity: p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)",
    make: () => [sequent(["p & (q | r)"], "(p & q) | (p & r)")],
  },
  {
    name: "Currying: (p ∧ q → r) ⊢ p → q → r",
    make: () => [sequent(["p & q -> r"], "p -> q -> r")],
  },
  {
    name: "Composition: ⊢ (p → q) → (q → r) → p → r",
    make: () => [sequent([], "(p -> q) -> (q -> r) -> p -> r")],
  },
  {
    name: "Peirce-ish (not provable!): ⊢ ((p → q) → p) → p",
    make: () => [sequent([], "((p -> q) -> p) -> p")],
  },
];

// # Layout constants

const FONT = 22;
const H = 32; // formula row height
const ROW = 52; // sequent row height
const TOP = 44; // space for header / buttons
const PAD_X = 20;
const WIDTH = 660;

const W_ATOM = 15;
const W_OP: Record<string, number> = { and: 30, or: 30, imp: 36 };
const W_CONST = 18;
const W_PAREN = 9;
const W_COMMA = 16;
const W_TURNSTILE = 40;

const OP_TEXT: Record<string, string> = { and: "∧", or: "∨", imp: "→" };

const serif = "'STIX Two Text', 'Cambria Math', 'Times New Roman', serif";

// # Rendering

type Ctx = {
  state: State;
  goal: Goal;
  hypIndex: number | null;
  draggedId: string | null;
  d: Parameters<Draggable<State>>[0]["d"];
  setState: Parameters<Draggable<State>>[0]["setState"];
};

/**
 * Render a formula node. Returns the element (positioned at the
 * origin; the caller translates it) and its width.
 */
function renderFormula(
  f: Formula,
  ctx: Ctx,
  path: Loc["path"],
  prec: number,
  depth: number,
): { element: Svgx; w: number } {
  const { state, goal, hypIndex, draggedId } = ctx;
  const loc: Loc = { goalId: goal.id, hypIndex, path };
  const isRoot = path.length === 0;
  const parens = needsParens(f, prec);
  const isDragged = draggedId === f.id;
  const highlighted = state.highlight?.includes(f.id) ?? false;

  // Build children left-to-right. The child structure must be the
  // same across states for a given node (non-id elements are matched
  // by index when interpolating), so parens are always emitted as a
  // slot, empty when not needed.
  const parts: Svgx[] = [];
  let x = 2;
  const paren = (ch: string) => {
    parts.push(
      <g transform={translate(x + W_PAREN / 2, 0)}>
        {parens && (
          <text {...textProps} fill="#9a9a94">
            {ch}
          </text>
        )}
      </g>,
    );
    if (parens) x += W_PAREN;
  };
  paren("(");
  if (isBinary(f)) {
    const left = renderFormula(
      f.left,
      ctx,
      [...path, "left"],
      childPrec(f, "left"),
      depth + 1,
    );
    parts.push(<g transform={translate(x, 0)}>{left.element}</g>);
    x += left.w;

    // The connective. Root connectives with a click action get a
    // little pill.
    const opW = W_OP[f.kind];
    const action = rootAction(f, ctx);
    parts.push(
      <g
        id={`${f.id}-op`}
        transform={translate(x + opW / 2, 0)}
        onClick={
          action
            ? (e) => {
                e.stopPropagation();
                action();
              }
            : undefined
        }
        style={action ? { cursor: "pointer" } : undefined}
      >
        <rect
          x={-opW / 2 + 3}
          y={-H / 2 + 5}
          width={opW - 6}
          height={H - 10}
          rx={6}
          fill={action ? "#e8e6ff" : "transparent"}
          stroke={action ? "#b9b4f5" : "none"}
          strokeWidth={1}
        />
        <text
          {...textProps}
          fill={action ? "#4f46e5" : "#5c5b57"}
          pointerEvents="none"
        >
          {OP_TEXT[f.kind]}
        </text>
      </g>,
    );
    x += opW;

    const right = renderFormula(
      f.right,
      ctx,
      [...path, "right"],
      childPrec(f, "right"),
      depth + 1,
    );
    parts.push(<g transform={translate(x, 0)}>{right.element}</g>);
    x += right.w;
  } else {
    const w = f.kind === "atom" ? W_ATOM + (f.name.length - 1) * 11 : W_CONST;
    parts.push(
      <text
        transform={translate(x + w / 2, 0)}
        {...textProps}
        fontStyle={f.kind === "atom" ? "italic" : "normal"}
        fill={
          f.kind === "atom"
            ? "#1f2937"
            : f.kind === "top"
              ? "#16a34a"
              : "#dc2626"
        }
      >
        {f.kind === "atom" ? f.name : f.kind === "top" ? "⊤" : "⊥"}
      </text>,
    );
    x += w;
  }
  paren(")");
  const w = x + 2;

  const element = (
    <g
      id={f.id}
      dragologyZIndex={isDragged ? "/1" : depth}
      dragologyEmergeFrom={f.emergeFrom}
      dragologyOnDrag={() => dragSpec(ctx, loc)}
    >
      <rect
        x={0}
        y={-H / 2}
        width={w}
        height={H}
        rx={7}
        fill={
          isDragged
            ? "#fef3c7"
            : highlighted
              ? "#bae6fd"
              : isRoot
                ? "#ffffff"
                : "transparent"
        }
        stroke={
          isDragged
            ? "#f59e0b"
            : highlighted
              ? "#0ea5e9"
              : isRoot
                ? "#d6d3d1"
                : "none"
        }
        strokeWidth={isDragged || highlighted ? 1.5 : 1}
        className="hover:fill-stone-200"
        style={{ cursor: "grab" }}
      />
      {parts}
    </g>
  );
  return { element, w };
}

const textProps = {
  textAnchor: "middle",
  dominantBaseline: "central",
  fontSize: FONT,
  fontFamily: serif,
  pointerEvents: "none",
} as const;

function rootAction(f: Formula, ctx: Ctx): (() => void) | null {
  const { state, goal, hypIndex, setState } = ctx;
  const isRootOf = (root: Formula) => root === f;
  const root = hypIndex === null ? goal.goal : goal.hyps[hypIndex];
  if (!isRootOf(root)) return null;
  let next: State | null = null;
  const compute = (): State | null => {
    if (hypIndex === null) {
      if (f.kind === "and") return splitGoalAnd(state, goal.id);
      if (f.kind === "imp") return introGoalImp(state, goal.id);
    } else {
      if (f.kind === "and") return splitHypAnd(state, goal.id, hypIndex);
      if (f.kind === "or") return casesHypOr(state, goal.id, hypIndex);
    }
    return null;
  };
  // Only offer actions that exist for this connective/position.
  const offered =
    hypIndex === null
      ? f.kind === "and" || f.kind === "imp"
      : f.kind === "and" || f.kind === "or";
  if (!offered) return null;
  return () => {
    next = compute();
    if (next) setState(next, { transition: 400 });
  };
}

function dragSpec(ctx: Ctx, source: Loc) {
  const { state, d, goal } = ctx;
  // Innermost targets first, so that when nested targets overlap the
  // pointer, the innermost wins.
  const targets = _.sortBy(linkTargets(state, source), (t) => -t.path.length);
  const specs = targets.flatMap((t) => {
    const newState = link(state, source, t);
    if (!newState) return [];
    return [
      d.dropTarget(locFormula(goal, t).id, newState, { boundsState: state }),
    ];
  });
  const highlighted: State = {
    ...state,
    highlight: targets.map((t) => locFormula(goal, t).id),
  };
  const far = d.fixed(highlighted).onDrop(state);
  if (specs.length === 0) return far.withFloating();
  return d.closest(specs).withBranchTransition(200).whenFar(far).withFloating();
}

function renderSequent(goal: Goal, ctx: Omit<Ctx, "goal" | "hypIndex">) {
  const parts: Svgx[] = [];
  let x = 0;
  goal.hyps.forEach((h, i) => {
    if (i > 0) {
      parts.push(
        <text
          id={`${h.id}-comma`}
          transform={translate(x + W_COMMA / 2, 4)}
          {...textProps}
          fill="#78716c"
        >
          ,
        </text>,
      );
      x += W_COMMA;
    }
    const r = renderFormula(h, { ...ctx, goal, hypIndex: i }, [], 0, 0);
    parts.push(<g transform={translate(x, 0)}>{r.element}</g>);
    x += r.w;
  });
  parts.push(
    <text
      id={`${goal.id}-turnstile`}
      transform={translate(x + W_TURNSTILE / 2, 0)}
      {...textProps}
      fill="#44403c"
    >
      ⊢
    </text>,
  );
  x += W_TURNSTILE;
  const g = renderFormula(
    goal.goal,
    { ...ctx, goal, hypIndex: null },
    [],
    0,
    0,
  );
  parts.push(<g transform={translate(x, 0)}>{g.element}</g>);
  x += g.w;
  return { element: <g>{parts}</g>, w: x };
}

const draggable: Draggable<State> = ({ state, d, draggedId, setState }) => {
  const ctx = { state, d, draggedId, setState };
  const canUndo = state.history.length > 0;
  return (
    <g>
      {/* Header: undo */}
      <g
        id="undo-button"
        transform={translate(WIDTH - PAD_X - 40, TOP / 2)}
        onClick={() => canUndo && setState(undo(state), { transition: 400 })}
        style={{ cursor: canUndo ? "pointer" : "default" }}
      >
        <rect
          x={-36}
          y={-13}
          width={72}
          height={26}
          rx={13}
          fill={canUndo ? "#f5f5f4" : "#fafaf9"}
          stroke={canUndo ? "#d6d3d1" : "#e7e5e4"}
        />
        <text
          {...textProps}
          fontSize={14}
          fontFamily="sans-serif"
          fill={canUndo ? "#44403c" : "#c4c0bb"}
        >
          ↶ undo
        </text>
      </g>

      {/* Sequents */}
      {state.goals.map((goal, i) => {
        const r = renderSequent(goal, ctx);
        return (
          <g
            id={goal.id}
            transform={translate(PAD_X, TOP + ROW * (i + 0.5))}
            dragologyEmergeFrom={i > 0 ? state.goals[i - 1].id : undefined}
          >
            <rect
              x={-10}
              y={-ROW / 2 + 3}
              width={Math.max(r.w + 20, 0)}
              height={ROW - 6}
              rx={10}
              fill="#f5f5f4"
            />
            {r.element}
          </g>
        );
      })}

      {state.goals.length === 0 && (
        <g id="qed" transform={translate(PAD_X, TOP + ROW / 2)}>
          <text {...textProps} textAnchor="start" fontSize={24} fill="#16a34a">
            ∎ Proved!
          </text>
        </g>
      )}
    </g>
  );
};

// # Demo

export default demo(
  () => {
    const [problem, setProblem] = useState(problems[0]);
    const initialState = useMemo<State>(
      () => ({ goals: problem.make(), history: [] }),
      [problem],
    );
    return (
      <div>
        <DemoNotes>
          Proof by dragging, after{" "}
          <DemoLink href="https://www.actema.xyz/">Actema</DemoLink> and
          Chaudhuri's <em>subformula linking</em>. Each row is a sequent:
          hypotheses ⊢ goal.{" "}
          <b>
            Drag any subformula onto a matching subformula of opposite polarity
          </b>{" "}
          (targets light up blue) to link them: the goal (or hypothesis)
          rewrites, and any new obligations emerge in place. Dropping a
          hypothesis's disjunct case-splits. Click a highlighted root connective
          to split a conjunction, introduce an implication, or case on a
          disjunction. The proof is done when no sequents remain.
        </DemoNotes>
        <div className="flex flex-col gap-4 items-start">
          <ConfigPanel>
            <ConfigSelect
              label="Problem"
              value={problem}
              onChange={setProblem}
              options={problems}
              stringifyOption={(p) => p.name}
            />
          </ConfigPanel>
          <DemoDraggable
            key={problem.name}
            draggable={draggable}
            initialState={initialState}
            width={WIDTH}
            height={TOP + ROW * 6}
          />
        </div>
      </div>
    );
  },
  {
    fuzz: problems.map((p) => ({
      name: p.name,
      draggable,
      initialState: { goals: p.make(), history: [] } as State,
      options: {
        // ids and history are incidental; dedupe by what's displayed
        stateKey: (s: State) =>
          s.goals
            .map(
              (g) =>
                `${g.hyps.map((h) => show(h)).join(", ")} ⊢ ${show(g.goal)}`,
            )
            .join(" | "),
      },
    })),
    tags: [
      "d.closest",
      "d.dropTarget",
      "d.fixed",
      "spec.whenFar",
      "spec.withFloating",
      "spec.withBranchTransition",
      "spec.onDrop",
      "dragologyEmergeFrom",
      "dragologyZIndex",
      "setState",
    ],
  },
);
