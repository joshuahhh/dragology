import _ from "lodash";
import { Fragment, ReactNode, useMemo, useState } from "react";
import { demo } from "../../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  allPossibleRewrites,
  isWildcard,
  Pattern,
  rewr,
  Rewrite,
  Tree,
} from "./asts";

// # State & initial states

type State = Tree;

export const initialState: State = {
  id: "root",
  label: "+",
  children: [
    {
      id: "root-1",
      label: "+",
      children: [
        {
          id: "root-1-1",
          label: "+",
          children: [
            { id: "root-1-1-1", label: "⛅", children: [] },
            {
              id: "root-1-1-2",
              label: "-",
              children: [{ id: "root-1-1-2-1", label: "🍄", children: [] }],
            },
          ],
        },
        { id: "root-1-2", label: "🍄", children: [] },
      ],
    },
    {
      id: "root-2",
      label: "+",
      children: [
        {
          id: "root-2-1",
          label: "×",
          children: [
            { id: "root-2-1-1", label: "🎲", children: [] },
            { id: "root-2-1-2", label: "🦠", children: [] },
          ],
        },
        {
          id: "root-2-2",
          label: "×",
          children: [
            { id: "root-2-2-1", label: "🎲", children: [] },
            { id: "root-2-2-2", label: "🐝", children: [] },
          ],
        },
      ],
    },
  ],
};

// # Rewrite rules

type RewriteSet = {
  rewrites: Rewrite[];
  title: ReactNode;
  subtitle?: ReactNode;
  defaultEnabled?: boolean;
};

export const rewriteSets: RewriteSet[] = [
  {
    title: <>Identity</>,
    rewrites: [rewr("(+ (0) #A)", "A"), rewr("(+ #A (0))", "A")],
    defaultEnabled: true,
  },
  {
    title: <>Identity (reverse)</>,
    rewrites: [rewr("#A", "(+ (0) A)")],
    defaultEnabled: true,
  },
  {
    title: <>Commutativity</>,
    rewrites: [rewr("(+ #A #B)", "(+ B A)"), rewr("(× #A #B)", "(× B A)")],
    defaultEnabled: true,
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull up op</>,
    rewrites: [
      rewr("(+2 #(+1 A B) C)", "(+1 A (+2 B C))"),
      rewr("(+1 A #(+2 B C))", "(+2 (+1 A B) C)"),
      rewr("(×2 #(×1 A B) C)", "(×1 A (×2 B C))"),
      rewr("(×1 A #(×2 B C))", "(×2 (×1 A B) C)"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull down op</>,
    rewrites: [
      rewr("#(+1 A (+2 B C))", "(+2 (+1 A B) C)"),
      rewr("#(+2 (+1 A B) C)", "(+1 A (+2 B C))"),
      rewr("#(×1 A (×2 B C))", "(×2 (×1 A B) C)"),
      rewr("#(×2 (×1 A B) C)", "(×1 A (×2 B C))"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull up operand</>,
    rewrites: [
      rewr("(+2 (+1 #A B) C)", "(+1 A (+2 B C))"),
      rewr("(+1 A (+2 B #C))", "(+2 (+1 A B) C)"),
      rewr("(×2 (×1 #A B) C)", "(×1 A (×2 B C))"),
      rewr("(×1 A (×2 B #C))", "(×2 (×1 A B) C)"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: <>Pull down operand</>,
    rewrites: [
      rewr("(+1 #A (+2 B C))", "(+2 (+1 A B) C)"),
      rewr("(+2 (+1 A B) #C)", "(+1 A (+2 B C))"),
      rewr("(×1 #A (×2 B C))", "(×2 (×1 A B) C)"),
      rewr("(×2 (×1 A B) #C)", "(×1 A (×2 B C))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Distribute (drag +)</>,
    rewrites: [
      rewr("(× A #(+ B C))", "(+ (× A B) (× A C))"),
      rewr("(× #(+ B C) A)", "(+ (× B A) (× C A))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Distribute (drag operand)</>,
    rewrites: [
      rewr("(× #A (+ B C))", "(+ (× A B) (× A C))"),
      rewr("(× (+ B C) #A)", "(+ (× B A) (× C A))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Factor (drag +)</>,
    rewrites: [
      rewr("#(+ (× A B) (× A C))", "(× A (+ B C))"),
      rewr("#(+ (× B A) (× C A))", "(× A (+ B C))"),
    ],
  },
  {
    title: <>Distributivity</>,
    subtitle: <>Factor (drag operand)</>,
    rewrites: [
      rewr("(+ (× #A B) (× A C))", "(× A (+ B C))"),
      rewr("(+ (× A B) (× #A C))", "(× A (+ B C))"),
      rewr("(+ (× B #A) (× C A))", "(× A (+ B C))"),
      rewr("(+ (× B A) (× C #A))", "(× A (+ B C))"),
    ],
  },
  {
    title: <>Associativity</>,
    subtitle: (
      <>
        Pull op sideways
        <br />
        <span className="italic text-red-500">
          (Conflicts with commutativity!)
        </span>
      </>
    ),
    rewrites: [
      rewr("(+2 #(+1 A B) C)", "(+2 A #(+1 B C))"),
      rewr("(+1 A #(+2 B C))", "(+1 #(+2 A B) C)"),
      rewr("(×2 #(×1 A B) C)", "(×2 A #(×1 B C))"),
      rewr("(×1 A #(×2 B C))", "(×1 #(×2 A B) C)"),
    ],
  },
];

const defaultActiveRewriteSets = rewriteSets.map(
  (rs) => rs.defaultEnabled ?? false,
);

// # Tree rendering

export type Config = {
  activeRewriteSets: boolean[];
  enableEmergeAnimation: boolean;
  forceTransformScale: boolean;
};

export function draggableFactory(config: Config): Draggable<State> {
  const activeRewrites = _.zip(rewriteSets, config.activeRewriteSets).flatMap(
    ([set, enabled]) => (enabled ? set!.rewrites : []),
  );
  return ({ state, d, draggedId }) =>
    renderTree(state, state, d, activeRewrites, config, 0, draggedId, false)
      .element;
}

function renderTree(
  state: State,
  tree: Tree,
  d: DragSpecBuilder<State>,
  activeRewrites: Rewrite[],
  config: Config,
  depth: number,
  draggedId: string | null,
  isDragged: boolean,
): {
  element: Svgx;
  w: number;
  h: number;
  id: string;
} {
  isDragged = isDragged || tree.id === draggedId;

  const GAP = 10;
  const PADDING = 5;
  const LABEL_WIDTH = 20;
  const LABEL_MIN_HEIGHT = 20;

  const renderedChildren = tree.children.map((child) =>
    renderTree(
      state,
      child,
      d,
      activeRewrites,
      config,
      depth + 1,
      draggedId,
      isDragged,
    ),
  );

  const renderedChildrenElements: Svgx[] = [];
  let childY = 0;
  for (const childR of renderedChildren) {
    renderedChildrenElements.push(
      <g transform={translate(0, childY)}>{childR.element}</g>,
    );
    childY += childR.h + GAP;
  }

  const innerW =
    LABEL_WIDTH +
    (renderedChildren.length > 0
      ? GAP + _.max(renderedChildren.map((c) => c.w))!
      : 0);
  const innerH =
    renderedChildren.length > 0
      ? _.sumBy(renderedChildren, (c) => c.h) +
        GAP * (renderedChildren.length - 1)
      : LABEL_MIN_HEIGHT;

  const w = innerW + PADDING * 2;
  const h = innerH + PADDING * 2;
  const rx = Math.min(14, 0.3 * Math.min(w, h));

  // Subtle warm fill that deepens with nesting
  const alpha = Math.min(0.02 + depth * 0.03, 0.15);
  const fill = `rgba(180, 170, 150, ${alpha})`;
  const strokeAlpha = Math.min(0.25 + depth * 0.08, 0.5);
  const stroke = `rgba(140, 130, 115, ${strokeAlpha})`;

  const element = (
    <g
      id={tree.id}
      dragologyOnDrag={() => dragTargets(d, state, tree.id, activeRewrites)}
      dragologyZIndex={depth + (isDragged ? 1000 : 0)}
      dragologyEmergeFrom={
        config.enableEmergeAnimation ? tree.emergeFrom : undefined
      }
      dragologyEmergeMode={
        tree.emergeMode ?? (config.forceTransformScale ? "scale" : undefined)
      }
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        stroke={stroke}
        strokeWidth={0.75}
        fill={fill}
        // fill="transparent"
      />
      <text
        x={PADDING + LABEL_WIDTH / 2}
        y={PADDING + innerH / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={18}
        fill="#3a3a38"
      >
        {tree.label}
      </text>
      {renderedChildren.length > 0 && (
        <g transform={translate(PADDING + LABEL_WIDTH + GAP, PADDING)}>
          {renderedChildrenElements}
        </g>
      )}
    </g>
  );

  return { element, w, h, id: tree.id };
}

function dragTargets(
  d: DragSpecBuilder<State>,
  state: State,
  draggedKey: string,
  activeRewrites: Rewrite[],
) {
  const newTrees = allPossibleRewrites(state, activeRewrites, draggedKey);
  if (newTrees.length === 0) return d.between([state]);
  return d
    .closest(newTrees.map((newTree) => d.between([state, newTree])))
    .withSnapRadius(1, { chain: true });
}

// # Rewrite rule display

const drawRewrite = (rewrite: Rewrite) => {
  function findFirstTriggerId(pattern: Pattern): string | null {
    if (pattern.isTrigger) {
      return pattern.id;
    }
    if (!isWildcard(pattern)) {
      for (const child of pattern.children) {
        const result = findFirstTriggerId(child);
        if (result !== null) {
          return result;
        }
      }
    }
    return null;
  }
  const firstTriggerId = findFirstTriggerId(rewrite.from);
  return (
    <>
      {drawPattern(rewrite.from, true, firstTriggerId)} →{" "}
      {drawPattern(rewrite.to, true, firstTriggerId)}
    </>
  );
};

const drawPattern = (
  pattern: Pattern,
  topLevel: boolean,
  firstTriggerId: string | null,
): ReactNode => {
  let contents;
  if (isWildcard(pattern)) {
    contents = pattern.id;
  } else if (pattern.id === "0") {
    contents = <span className="text-blue-600 font-bold">0</span>;
  } else {
    const opById: Record<string, ReactNode> = {
      "+": <span className="text-red-600 font-bold">+</span>,
      "+1": <span className="text-red-600 font-bold">+</span>,
      "+2": <span className="text-green-600 font-bold">+</span>,
      "×": <span className="text-purple-600 font-bold">×</span>,
      "×1": <span className="text-purple-600 font-bold">×</span>,
      "×2": <span className="text-orange-600 font-bold">×</span>,
    };
    contents = (
      <>
        {topLevel ? "" : "("}
        {pattern.children.length > 0 &&
          pattern.children.map((child, i) => (
            <Fragment key={i}>
              {i > 0 && <> {opById[pattern.id]} </>}
              {drawPattern(child, false, firstTriggerId)}
            </Fragment>
          ))}
        {topLevel ? "" : ")"}
      </>
    );
  }

  if (pattern.id === firstTriggerId) {
    return <span className="bg-amber-200 rounded-sm p-0.5">{contents}</span>;
  } else {
    return contents;
  }
};

// # Config panels

function RewriteRuleCheckboxes({
  activeRewriteSets,
  setActiveRewriteSets,
}: {
  activeRewriteSets: boolean[];
  setActiveRewriteSets: (v: boolean[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {rewriteSets.map((rewriteSet, i) => (
        <ConfigCheckbox
          key={i}
          value={activeRewriteSets[i]}
          onChange={(v) => {
            const newActive = [...activeRewriteSets];
            newActive[i] = v;
            setActiveRewriteSets(newActive);
          }}
        >
          <b>{rewriteSet.title}</b>
          {rewriteSet.subtitle && (
            <>
              <br />
              {rewriteSet.subtitle}
            </>
          )}
          <br />
          {rewriteSet.rewrites.length > 0 &&
            drawRewrite(rewriteSet.rewrites[0])}
        </ConfigCheckbox>
      ))}
    </div>
  );
}

// # Component

export default demo(
  () => {
    const [activeRewriteSets, setActiveRewriteSets] = useState(
      defaultActiveRewriteSets,
    );
    const [enableEmergeAnimation, setEnableEmergeAnimation] = useState(true);
    const [forceTransformScale, setForceTransformScale] = useState(false);

    const config: Config = useMemo(
      () => ({ activeRewriteSets, enableEmergeAnimation, forceTransformScale }),
      [activeRewriteSets, enableEmergeAnimation, forceTransformScale],
    );

    const draggable = useMemo(() => draggableFactory(config), [config]);

    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={300}
          height={350}
        />
        <div className="flex flex-col gap-4">
          <ConfigPanel title="Rewrite rules">
            <RewriteRuleCheckboxes
              activeRewriteSets={activeRewriteSets}
              setActiveRewriteSets={setActiveRewriteSets}
            />
          </ConfigPanel>
          <ConfigPanel title="Animation">
            <ConfigCheckbox
              value={enableEmergeAnimation}
              onChange={setEnableEmergeAnimation}
            >
              Enable emerge animation for new nodes
            </ConfigCheckbox>
            <ConfigCheckbox
              value={forceTransformScale}
              onChange={setForceTransformScale}
            >
              Force <span className="font-mono">transform: scale()</span> for
              emerge
            </ConfigCheckbox>
          </ConfigPanel>
        </div>
      </DemoWithConfig>
    );
  },
  { tags: ["d.between", "spec.withSnapRadius [chain]", "dragologyEmergeFrom"] },
);
