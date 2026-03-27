// Nool Tree with Macro Recorder: derive rewrite rules by demonstration
// Enter macro mode → freely rearrange the tree → exit → rule derived from diff

import { produce } from "immer";
import _ from "lodash";
import { useMemo, useState } from "react";
import { demo } from "../../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../../demo/ui";
import { Draggable, OnDragCallback } from "../../draggable";
import { DragSpecBuilder } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  allPossibleRewrites,
  isWildcard,
  Pattern,
  Rewrite,
  Tree,
} from "./asts";
import {
  allInsertionPoints,
  arityOk,
  findParentAndIndex,
  insertChild,
  isOp,
  removeNode,
  swapChildrenAtParent,
  T_EMPTY_CHILD_H,
  T_EMPTY_CHILD_W,
  T_GAP,
  T_LABEL_MIN_HEIGHT,
  T_LABEL_WIDTH,
  T_PADDING,
  treeSize,
} from "./nool-tree";

// # State

type ToolkitBlock = {
  key: string;
  label: string;
};

type State = {
  tree: Tree;
  toolkit: ToolkitBlock[];
  gutter: Tree[];
};

const BLOCK_DEFS: { label: string }[] = [
  { label: "+" },
  { label: "×" },
  { label: "-" },
  { label: "0" },
  { label: "⛅" },
  { label: "🍄" },
  { label: "🎲" },
  { label: "🦠" },
  { label: "🐝" },
];

const state1: State = {
  tree: {
    id: "root",
    label: "+",
    children: [
      {
        id: "root-1",
        label: "+",
        children: [
          { id: "root-1-1", label: "⛅", children: [] },
          { id: "root-1-2", label: "🍄", children: [] },
        ],
      },
      { id: "root-2", label: "🎲", children: [] },
    ],
  },
  toolkit: BLOCK_DEFS.map((def, i) => ({
    key: `tk-${i}`,
    label: def.label,
  })),
  gutter: [],
};

// # Tree helpers

function treeIsWellFormed(tree: Tree): boolean {
  if (!arityOk(tree)) return false;
  return tree.children.every(treeIsWellFormed);
}

function gutterInsertionTargets(baseState: State, subtree: Tree): State[] {
  return _.range(baseState.gutter.length + 1).map((insertIdx) =>
    produce(baseState, (draft) => {
      draft.gutter.splice(insertIdx, 0, subtree);
    }),
  );
}

// # Rule derivation from before/after tree diff

/**
 * Derive a rewrite rule from a before and after tree.
 *
 * A node is "stable" if it exists in both trees with the same label,
 * same children IDs in the same order, and all children are also stable.
 * Stable subtrees become wildcards; everything else becomes operators.
 */
function deriveRule(before: Tree, after: Tree): Rewrite | null {
  const beforeMap = new Map<string, Tree>();
  const afterMap = new Map<string, Tree>();
  function collectIds(tree: Tree, map: Map<string, Tree>) {
    map.set(tree.id, tree);
    for (const child of tree.children) collectIds(child, map);
  }
  collectIds(before, beforeMap);
  collectIds(after, afterMap);

  // Determine stability (bottom-up via recursive check)
  const stableIds = new Set<string>();
  function checkStable(nodeId: string): boolean {
    if (stableIds.has(nodeId)) return true;
    const bNode = beforeMap.get(nodeId);
    const aNode = afterMap.get(nodeId);
    if (!bNode || !aNode) return false;
    if (bNode.label !== aNode.label) return false;
    if (bNode.children.length !== aNode.children.length) return false;
    for (let i = 0; i < bNode.children.length; i++) {
      if (bNode.children[i].id !== aNode.children[i].id) return false;
      if (!checkStable(bNode.children[i].id)) return false;
    }
    stableIds.add(nodeId);
    return true;
  }
  for (const id of beforeMap.keys()) checkStable(id);

  // If root is stable, nothing changed
  if (stableIds.has(before.id)) return null;

  // Assign wildcard names to stable subtrees
  let nextWildcard = 0;
  const wildcardNames = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function getWildcardName(id: string): string {
    if (!wildcardNames.has(id)) {
      wildcardNames.set(id, letters[nextWildcard++] || `W${nextWildcard}`);
    }
    return wildcardNames.get(id)!;
  }

  // Build pattern from tree, converting stable subtrees to wildcards
  // Mark ALL nodes in the LHS as triggers so dragging any node
  // in the matching subtree activates the rule.
  // Op nodes use tree.id (not tree.label) to avoid collisions when
  // multiple ops share the same label (e.g. two "+" nodes in an
  // associativity rule). Tree IDs are unique and naturally establish
  // LHS↔RHS correspondence: applyRewrite looks up the pattern op ID
  // in its ops map, finds the matched tree node, and reuses its ID,
  // so the dragged element's ID persists through the rewrite.
  function buildLhsPattern(tree: Tree): Pattern {
    if (stableIds.has(tree.id)) {
      return {
        type: "wildcard",
        id: getWildcardName(tree.id),
        isTrigger: true,
      };
    }
    return {
      type: "op",
      label: tree.label,
      id: tree.id,
      children: tree.children.map(buildLhsPattern),
      isTrigger: true,
    };
  }

  function buildRhsPattern(tree: Tree): Pattern {
    if (stableIds.has(tree.id)) {
      return {
        type: "wildcard",
        id: getWildcardName(tree.id),
        isTrigger: false,
      };
    }
    return {
      type: "op",
      label: tree.label,
      id: tree.id,
      children: tree.children.map(buildRhsPattern),
      isTrigger: false,
    };
  }

  // Build LHS first (assigns wildcard names in LHS traversal order)
  const fromPattern = buildLhsPattern(before);
  const toPattern = buildRhsPattern(after);

  return { from: fromPattern, to: toPattern };
}

// # Module-level bridge for config↔state communication

let _currentTree: Tree | null = null;

// # Layout constants

const BLOCK_GAP = 8;
const TOOLKIT_PADDING = 8;
const ZONE_GAP = 15;
const GUTTER_MIN_WIDTH = 46;
const TRASH_SIZE = 30;

let nextPlaceholderId = 0;

// # Config

type Config = {
  macroMode: boolean;
  beforeTree: Tree | null;
  userRules: Rewrite[];
  enableEmergeAnimation: boolean;
};

const defaultConfig: Config = {
  macroMode: false,
  beforeTree: null,
  userRules: [],
  enableEmergeAnimation: true,
};

// # Draggable

function makeDraggable(config: Config): Draggable<State> {
  return ({ state, d }) => {
    // Bridge: expose current tree to the config panel
    _currentTree = state.tree;

    if (config.macroMode) {
      return renderMacroMode(state, d, config);
    } else {
      return renderNormalMode(state, d, config);
    }
  };
}

// # Normal mode rendering: rewrite rules

function renderNormalMode(
  state: State,
  d: DragSpecBuilder<State>,
  config: Config,
): Svgx {
  const activeRewrites = config.userRules;

  function dragTargets(draggedKey: string): OnDragCallback<State> {
    const newTrees = allPossibleRewrites(
      state.tree,
      activeRewrites,
      draggedKey,
    );
    return () =>
      d.closest([
        d.between([state]),
        ...newTrees.map((t) => d.fixed({ ...state, tree: t, gutter: [] })),
      ]);
  }

  return renderNormalTree(state.tree, d, dragTargets, config, 0).element;
}

function renderNormalTree(
  tree: Tree,
  d: DragSpecBuilder<State>,
  dragTargets: (id: string) => OnDragCallback<State>,
  config: Config,
  depth: number,
): { element: Svgx; w: number; h: number } {
  const renderedChildren = tree.children.map((child) =>
    renderNormalTree(child, d, dragTargets, config, depth + 1),
  );

  const renderedChildrenElements: Svgx[] = [];
  let childY = 0;
  for (const childR of renderedChildren) {
    renderedChildrenElements.push(
      <g transform={translate(0, childY)}>{childR.element}</g>,
    );
    childY += childR.h + T_GAP;
  }

  const innerW =
    T_LABEL_WIDTH +
    (renderedChildren.length > 0
      ? T_GAP + _.max(renderedChildren.map((c) => c.w))!
      : 0);
  const innerH =
    renderedChildren.length > 0
      ? _.sumBy(renderedChildren, (c) => c.h) +
        T_GAP * (renderedChildren.length - 1)
      : T_LABEL_MIN_HEIGHT;

  const w = innerW + T_PADDING * 2;
  const h = innerH + T_PADDING * 2;
  const rx = Math.min(14, 0.3 * Math.min(w, h));

  const element = (
    <g
      id={tree.id}
      dragologyOnDrag={dragTargets(tree.id)}
      dragologyZIndex={depth}
      dragologyEmergeFrom={
        config.enableEmergeAnimation ? tree.emergeFrom : undefined
      }
      dragologyEmergeMode={tree.emergeMode}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        stroke="gray"
        strokeWidth={1}
        fill="transparent"
      />
      <text
        x={T_PADDING + T_LABEL_WIDTH / 2}
        y={T_PADDING + innerH / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={20}
        fill="black"
      >
        {tree.label}
      </text>
      {renderedChildren.length > 0 && (
        <g transform={translate(T_PADDING + T_LABEL_WIDTH + T_GAP, T_PADDING)}>
          {renderedChildrenElements}
        </g>
      )}
    </g>
  );

  return { element, w, h };
}

// # Macro mode rendering: freeform editing with toolkit/gutter

function renderMacroTree(
  tree: Tree,
  d: DragSpecBuilder<State>,
  fullState: State,
  depth: number,
  opts?: {
    rootDragology?: OnDragCallback<State>;
    rootTransform?: string;
    pointerEventsNone?: boolean;
    opacity?: number;
    flatZIndex?: boolean;
  },
): { element: Svgx; w: number; h: number } {
  const isOpNode = isOp(tree.label);
  const valid = arityOk(tree);

  const renderedChildren: { element: Svgx; w: number; h: number }[] = [];
  let childY = 0;
  for (const child of tree.children) {
    const r = renderMacroTree(child, d, fullState, depth + 1, {
      rootTransform: translate(0, childY),
    });
    renderedChildren.push(r);
    childY += r.h + T_GAP;
  }
  const renderedChildrenElements = renderedChildren.map((r) => r.element);

  const hasChildArea = renderedChildren.length > 0 || isOpNode;
  const childAreaW =
    renderedChildren.length > 0
      ? _.max(renderedChildren.map((c) => c.w))!
      : isOpNode
        ? T_EMPTY_CHILD_W
        : 0;
  const childAreaH =
    renderedChildren.length > 0
      ? _.sumBy(renderedChildren, (c) => c.h) +
        T_GAP * (renderedChildren.length - 1)
      : isOpNode
        ? T_EMPTY_CHILD_H
        : T_LABEL_MIN_HEIGHT;

  const innerW = T_LABEL_WIDTH + (hasChildArea ? T_GAP + childAreaW : 0);
  const innerH = hasChildArea
    ? Math.max(childAreaH, T_LABEL_MIN_HEIGHT)
    : T_LABEL_MIN_HEIGHT;

  // Pick-up drag for freeform rearrangement
  const pickUpDrag: OnDragCallback<State> = () => {
    const nodeId = tree.id;
    const parentInfo = findParentAndIndex(fullState.tree, nodeId);

    // Root node: can't remove root, only offer gutter
    if (!parentInfo) {
      const phId = `placeholder-${nextPlaceholderId++}`;
      const stateWithout: State = {
        ...fullState,
        tree: { id: phId, label: "◯", children: [] },
      };
      const gutterTargets = gutterInsertionTargets(stateWithout, tree);
      return d
        .closest([gutterTargets, fullState])
        .whenFar(stateWithout)
        .withFloating();
    }

    // Remove from parent
    const stateWithout: State = {
      ...fullState,
      tree: removeNode(fullState.tree, nodeId),
    };

    // All possible insertion points (tree-macro uses isOp predicate)
    const insertionPoints = allInsertionPoints(stateWithout.tree, (t) =>
      isOp(t.label),
    );
    const insertTargets = insertionPoints.map(({ parentId, index }) => ({
      ...stateWithout,
      tree: insertChild(stateWithout.tree, parentId, index, tree),
    }));

    // Swap targets
    const swapTargets: State[] = [];
    if (parentInfo) {
      const { parent, index } = parentInfo;
      for (let i = 0; i < parent.children.length; i++) {
        if (i !== index) {
          swapTargets.push({
            ...fullState,
            tree: swapChildrenAtParent(fullState.tree, parent.id, index, i),
          });
        }
      }
    }

    // Gutter targets
    const gutterTargets = gutterInsertionTargets(stateWithout, tree);

    return d
      .closest([
        insertTargets,
        swapTargets,
        gutterTargets,
        fullState, // put back
      ])
      .whenFar(stateWithout)
      .withFloating();
  };

  const zIndex = opts?.flatZIndex ? 0 : depth;
  const strokeColor = !valid ? "#dd3333" : "gray";
  const labelColor = !valid ? "#dd3333" : "black";
  const w = innerW + T_PADDING * 2;
  const h = innerH + T_PADDING * 2;
  const rx = Math.min(14, 0.3 * Math.min(w, h));

  const element = (
    <g
      id={tree.id}
      transform={opts?.rootTransform}
      dragologyOnDrag={opts?.rootDragology || pickUpDrag}
      dragologyZIndex={zIndex}
      opacity={opts?.opacity}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        stroke={strokeColor}
        strokeWidth={1}
        fill="transparent"
      />
      <text
        x={T_PADDING + T_LABEL_WIDTH / 2}
        y={T_PADDING + innerH / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={20}
        fill={labelColor}
        pointerEvents={opts?.pointerEventsNone ? "none" : undefined}
      >
        {tree.label}
      </text>
      {hasChildArea && (
        <g transform={translate(T_PADDING + T_LABEL_WIDTH + T_GAP, T_PADDING)}>
          {renderedChildrenElements}
        </g>
      )}
    </g>
  );

  return { element, w, h };
}

function renderMacroMode(
  state: State,
  d: DragSpecBuilder<State>,
  _config: Config,
): Svgx {
  // Toolkit (from state, with mutable keys for clone-and-refresh)
  const toolkitItems = state.toolkit.map((block) => {
    const tree: Tree = {
      id: block.key,
      label: block.label,
      children: [],
    };
    return { block, tree, size: treeSize(tree) };
  });
  const maxToolkitW = _.max(toolkitItems.map((t) => t.size.w)) ?? 30;
  const toolkitWidth = maxToolkitW + TOOLKIT_PADDING * 2;

  let toolkitY = TOOLKIT_PADDING;
  const toolkitPositions = toolkitItems.map((item) => {
    const y = toolkitY;
    toolkitY += item.size.h + BLOCK_GAP;
    return y;
  });
  const toolkitHeight = toolkitY + TOOLKIT_PADDING - BLOCK_GAP;

  const insertionPoints = allInsertionPoints(state.tree, (t) => isOp(t.label));

  // Gutter
  const gutterItemData = state.gutter.map((block) => ({
    block,
    size: treeSize(block),
  }));
  const maxGutterW =
    gutterItemData.length > 0 ? _.max(gutterItemData.map((g) => g.size.w))! : 0;
  const gutterContentWidth = Math.max(
    GUTTER_MIN_WIDTH,
    maxGutterW + TOOLKIT_PADDING * 2,
  );

  let gutterY = TOOLKIT_PADDING;
  const gutterPositions = gutterItemData.map((item) => {
    const y = gutterY;
    gutterY += item.size.h + BLOCK_GAP;
    return y;
  });
  const gutterHeight = Math.max(
    gutterY + TOOLKIT_PADDING - BLOCK_GAP,
    TOOLKIT_PADDING * 2 + GUTTER_MIN_WIDTH,
  );

  const gutterOffsetX = toolkitWidth + ZONE_GAP;
  const treeOffsetX = gutterOffsetX + gutterContentWidth + ZONE_GAP;
  const treeR = renderMacroTree(state.tree, d, state, 0);

  const trashX = treeOffsetX + treeR.w + ZONE_GAP;
  const totalHeight = Math.max(toolkitHeight, gutterHeight, treeR.h);

  return (
    <g>
      {/* Recording indicator border */}
      <rect
        x={-8}
        y={-8}
        width={trashX + TRASH_SIZE + 16}
        height={totalHeight + 16}
        fill="none"
        stroke="#7c3aed"
        strokeWidth={3}
        strokeDasharray="8,4"
        rx={12}
        id="macro-border"
        dragologyZIndex={-20}
      />

      {/* Toolkit */}
      <rect
        x={0}
        y={0}
        width={toolkitWidth}
        height={toolkitHeight}
        fill="#f0f0f0"
        stroke="#ccc"
        strokeWidth={1}
        rx={Math.min(14, 0.3 * Math.min(toolkitWidth, toolkitHeight))}
        id="macro-toolkit-bg"
        dragologyZIndex={-10}
      />
      {toolkitItems.map(({ block, tree }, idx) => (
        <g transform={translate(TOOLKIT_PADDING, toolkitPositions[idx])}>
          {
            renderMacroTree(tree, d, state, 0, {
              pointerEventsNone: true,
              flatZIndex: true,
              opacity: insertionPoints.length > 0 ? undefined : 0.35,
              rootDragology: () => {
                // Clone-and-refresh: new node gets original key,
                // toolkit item gets refreshed key so the dragged
                // element (original key) isn't anchored to toolkit
                const stateWithout = produce(state, (draft) => {
                  draft.toolkit[idx].key += "-r";
                });
                const newNode: Tree = {
                  id: block.key,
                  label: block.label,
                  children: [],
                };
                const points = allInsertionPoints(stateWithout.tree, (t) =>
                  isOp(t.label),
                );
                const targetStates: State[] = points.map(
                  ({ parentId, index }) => ({
                    ...stateWithout,
                    tree: insertChild(
                      stateWithout.tree,
                      parentId,
                      index,
                      newNode,
                    ),
                  }),
                );
                return d
                  .closest(targetStates)
                  .whenFar(stateWithout)
                  .withFloating();
              },
            }).element
          }
        </g>
      ))}

      {/* Gutter */}
      <rect
        x={gutterOffsetX}
        y={0}
        width={gutterContentWidth}
        height={Math.max(gutterHeight, toolkitHeight)}
        fill="#f8f8f8"
        stroke="#ddd"
        strokeWidth={1}
        strokeDasharray="4,4"
        rx={Math.min(
          14,
          0.3 *
            Math.min(gutterContentWidth, Math.max(gutterHeight, toolkitHeight)),
        )}
        id="macro-gutter-bg"
        dragologyZIndex={-10}
      />
      {gutterItemData.map(
        ({ block }, idx) =>
          renderMacroTree(block, d, state, 0, {
            rootTransform: translate(
              gutterOffsetX + TOOLKIT_PADDING,
              gutterPositions[idx],
            ),
            flatZIndex: true,
            rootDragology: () => {
              const stateWithout = produce(state, (draft) => {
                draft.gutter.splice(idx, 1);
              });
              const placeTargets: State[] = [];
              const points = allInsertionPoints(stateWithout.tree, (t) =>
                isOp(t.label),
              );
              for (const { parentId, index } of points) {
                placeTargets.push({
                  ...stateWithout,
                  tree: insertChild(stateWithout.tree, parentId, index, block),
                });
              }
              const reorderTargets = gutterInsertionTargets(
                stateWithout,
                block,
              );
              return d
                .closest([placeTargets, reorderTargets])
                .whenFar(stateWithout)
                .withFloating();
            },
          }).element,
      )}

      {/* Trash zone */}
      <g transform={translate(trashX, 0)}>
        <rect
          x={0}
          y={0}
          width={TRASH_SIZE}
          height={TRASH_SIZE}
          fill="transparent"
          stroke="#ccc"
          strokeWidth={1}
          strokeDasharray="4,4"
          rx={4}
          id="macro-trash-bg"
        />
        <text
          x={TRASH_SIZE / 2}
          y={TRASH_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={16}
          fill="#ccc"
          pointerEvents="none"
        >
          🗑
        </text>
      </g>

      {/* Tree */}
      <g transform={translate(treeOffsetX, 0)}>{treeR.element}</g>
    </g>
  );
}

// # Panels

type ConfigPanelProps = { config: Config; setConfig: (c: Config) => void };

function MacroLeftPanel({ config, setConfig }: ConfigPanelProps) {
  if (config.macroMode) {
    return (
      <div className="text-xs">
        <div className="flex items-center gap-2 mb-2 text-purple-700 font-medium">
          <span className="inline-block w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
          Recording...
        </div>
        <p className="text-gray-500 mb-3">
          Freely rearrange the tree. Move nodes between operators, add from the
          toolkit, or park in the gutter. When done, stop recording to derive a
          rule.
        </p>
        <button
          className="w-full px-3 py-1.5 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-700"
          onClick={() => {
            // Read _currentTree at click time (not render time) to
            // avoid stale closure — the manipulable updates it each render
            // but this panel doesn't re-render on state changes.
            const now = _currentTree;
            if (!now || !config.beforeTree) return;
            if (!treeIsWellFormed(now)) return;
            // Derive both forward and reverse rules so the user can
            // immediately use the recorded transformation in both directions
            const forward = deriveRule(config.beforeTree, now);
            const reverse = deriveRule(now, config.beforeTree);
            const newRules = [...config.userRules];
            if (forward) newRules.push(forward);
            if (reverse) newRules.push(reverse);
            setConfig({
              ...config,
              macroMode: false,
              beforeTree: null,
              userRules: newRules,
            });
          }}
        >
          Stop Recording
        </button>
        <button
          className="w-full px-3 py-1.5 mt-2 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100"
          onClick={() => {
            setConfig({
              ...config,
              macroMode: false,
              beforeTree: null,
            });
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      {config.userRules.length > 0 && (
        <>
          <div className="border-t border-gray-300 my-1" />
          <div className="text-xs font-medium text-gray-700">
            Recorded rules ({config.userRules.length})
          </div>
          {config.userRules.map((rule, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-purple-700 font-mono">
                {patternToString(rule.from)} → {patternToString(rule.to)}
              </span>
              <button
                className="text-red-400 hover:text-red-600 ml-1"
                onClick={() => {
                  const newRules = [...config.userRules];
                  newRules.splice(i, 1);
                  setConfig({ ...config, userRules: newRules });
                }}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
      <div className="border-t border-gray-300 my-1" />
      <button
        className="w-full px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700"
        onClick={() => {
          setConfig({
            ...config,
            macroMode: true,
            beforeTree: _currentTree,
          });
        }}
      >
        Record Macro
      </button>
    </>
  );
}

function MacroConfigPanel({ config, setConfig }: ConfigPanelProps) {
  return (
    <ConfigCheckbox
      value={config.enableEmergeAnimation}
      onChange={(v) => setConfig({ ...config, enableEmergeAnimation: v })}
    >
      Enable emerge animation
    </ConfigCheckbox>
  );
}

// # Helpers

function patternToString(p: Pattern): string {
  if (isWildcard(p)) {
    return (p.isTrigger ? "#" : "") + p.id;
  }
  const trigger = p.isTrigger ? "#" : "";
  const children = p.children.map(patternToString).join(" ");
  return `${trigger}(${p.label} ${children})`;
}

// # Component export

export default demo(
  () => {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const draggable = useMemo(() => makeDraggable(config), [config]);
    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={state1}
          width={400}
          height={400}
        />
        <ConfigPanel>
          <MacroLeftPanel config={config} setConfig={setConfig} />
          <MacroConfigPanel config={config} setConfig={setConfig} />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
      "dragologyEmergeFrom",
    ],
  },
);
