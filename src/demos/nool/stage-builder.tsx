// Unified Stage Builder: construct algebraic expressions with holes-based and/or variadic ops.
// Three toggleable buckets with draggable menu icons to reorder.
//
// TODO: Palette could behave as the same kind of list container as the stage
// (same rootTransform-based hoisting, same insertion targets). Currently palette
// items can be reordered and dragged to stage/holes/trash, but brush items can't
// be dragged directly into the palette. Consider unifying.
//
// TODO: "Spring" — when a user drops far below a column, the item should animate
// into the last slot. This already works via floating-drag proximity, but if the
// drop point is below the SVG viewport the user can't reach it. May need dynamic
// SVG height or scroll-into-view behavior.

import { produce } from "immer";
import _ from "lodash";
import { demo } from "../../demo";
import { DemoDraggable } from "../../demo/ui";
import { Draggable, OnDragCallback } from "../../draggable";
import { DragSpecBuilder } from "../../DragSpec";
import { altKey } from "../../modifierKeys";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import { Pattern, Rewrite, Tree } from "./asts";
import {
  allInsertionPointsInTrees,
  arityOk,
  cloneTreeWithFreshIds,
  findAllHoles,
  findAllHolesInTrees,
  findParentAndIndex,
  insertInTrees,
  isOp,
  isRewriteArrow,
  OP_DEFS,
  removeInTrees,
  replaceInTrees,
  swapChildrenAtParent,
  T_EMPTY_CHILD_H,
  T_EMPTY_CHILD_W,
  T_GAP,
  T_LABEL_MIN_HEIGHT,
  T_LABEL_WIDTH,
  T_PADDING,
  treeSize,
} from "./nool-tree";

// # Types

type Bucket = "atoms" | "holes" | "variadic";

type BrushBlock = {
  key: string;
  label: string;
  bucket: Bucket;
};

export type State = {
  trees: Tree[];
  brushes: BrushBlock[];
  palette: Tree[];
  paletteExpanded: boolean;
  voided?: Tree;
  voidStack: Tree[];
  showAtoms: boolean;
  showHolesOps: boolean;
  showVariadicOps: boolean;
  bucketOrder: Bucket[];
};

// # Bucket metadata

const BUCKET_ICONS: Record<Bucket, string> = {
  holes: "◯ →",
  variadic: "◎ →",
  atoms: "⊙ →",
};

const BUCKET_STATE_KEYS: Record<
  Bucket,
  "showHolesOps" | "showVariadicOps" | "showAtoms"
> = {
  holes: "showHolesOps",
  variadic: "showVariadicOps",
  atoms: "showAtoms",
};

// # Block definitions

const ATOM_LABELS = ["⛅", "🍄", "🎲", "🧊", "🪨", "🐝", "🌕", "🌘"];

// Brush rules for holes ops
const holePattern: Pattern = {
  type: "op",
  label: "◯",
  id: "◯",
  children: [],
  isTrigger: true,
};

function brushRule(label: string, arity: number): Rewrite {
  const children: Pattern[] = _.range(arity).map((i) => ({
    type: "op" as const,
    label: "◯",
    id: `◯-${label}-${i}`,
    children: [],
    isTrigger: false,
  }));
  return {
    from: holePattern,
    to: { type: "op", label, id: label, children, isTrigger: false },
  };
}

const BRUSH_RULES: Rewrite[] = OP_DEFS.map((d) => brushRule(d.label, d.arity));

// Full brushes: holes ops + variadic ops + atoms
const ALL_BRUSHES: BrushBlock[] = [
  ...OP_DEFS.map((d, i) => ({
    key: `tk-h-${i}`,
    label: d.label,
    bucket: "holes" as Bucket,
  })),
  ...OP_DEFS.map((d, i) => ({
    key: `tk-v-${i}`,
    label: d.label,
    bucket: "variadic" as Bucket,
  })),
  ...ATOM_LABELS.map((label, i) => ({
    key: `tk-a-${i}`,
    label,
    bucket: "atoms" as Bucket,
  })),
];

// # Stage-specific helpers

function makeExpansion(blockKey: string, blockLabel: string): Tree {
  const rule = BRUSH_RULES.find(
    (r) => r.to.type === "op" && r.to.label === blockLabel,
  );
  const arity = rule && rule.to.type === "op" ? rule.to.children.length : 0;
  return {
    id: blockKey,
    label: blockLabel,
    children: _.range(arity).map((i) => ({
      id: `${blockKey}-c${i}`,
      label: "◯",
      children: [],
    })),
  };
}

function makeNodeForItem(block: BrushBlock): Tree {
  if (block.bucket === "holes") return makeExpansion(block.key, block.label);
  if (block.bucket === "variadic")
    return {
      id: block.key,
      label: block.label,
      children: [],
      variadic: true,
    };
  return { id: block.key, label: block.label, children: [] };
}

function paletteInsertionTargets(baseState: State, subtree: Tree): State[] {
  return _.range(baseState.palette.length + 1).map((insertIdx) =>
    produce(baseState, (draft) => {
      draft.palette.splice(insertIdx, 0, subtree);
    }),
  );
}

// Place on stage only when empty (single-item stage).
function emptyStageTarget(baseState: State, tree: Tree): State[] {
  if (baseState.trees.length > 0) return [];
  return [{ ...baseState, trees: [tree] }];
}

// Remove bare root-level holes from the stage (leftover after node removal).
// Only removes trees whose root is a bare ◯ — not op nodes with hole children
// (like +(◯, ◯)) which represent real structure being built.
function removeStageHoles(s: State): State {
  const cleaned = s.trees.filter(
    (t) => !(t.label === "◯" && t.children.length === 0),
  );
  if (cleaned.length === s.trees.length) return s;
  return { ...s, trees: cleaned };
}

// # Initial state

export const state1: State = {
  trees: [],
  brushes: ALL_BRUSHES,
  palette: [],
  paletteExpanded: false,
  voidStack: [],
  showAtoms: true,
  showHolesOps: true,
  showVariadicOps: false,
  bucketOrder: ["holes", "variadic", "atoms"],
};

// # UI layout constants

const BLOCK_GAP = 8;
const LANE_PADDING = 8;
const COL_GAP = 12;
const SEP_INSET = 9;
const PALETTE_MIN_WIDTH = 46;
const STAGE_MIN_WIDTH = 46;
const VOID_SIZE = 30;
const BUCKET_GAP = 12;
const MENU_FONT_SIZE = 14;
const MENU_COL_WIDTH = 48;

let nextPickupId = 0;

// # Extracted drag handlers

function makePickupDrag(
  tree: Tree,
  d: DragSpecBuilder<State>,
  fullState: State,
  treeIdx: number,
): OnDragCallback<State> | undefined {
  const isHole = tree.label === "◯";
  if (isHole) return undefined;

  return () => {
    const nodeId = tree.id;
    const thisTree = fullState.trees[treeIdx];
    const parentInfo = findParentAndIndex(thisTree, nodeId);

    return d.reactTo(altKey, (altKey) => {
      if (altKey) {
        const clone = cloneTreeWithFreshIds(tree);
        const stateWithClone: State = {
          ...fullState,
          trees: replaceInTrees(fullState.trees, treeIdx, nodeId, clone),
        };
        const cloneHoles = new Set(findAllHoles(clone));
        const availableHoles = findAllHolesInTrees(stateWithClone.trees).filter(
          ({ holeId }) => !cloneHoles.has(holeId),
        );
        const holeTargets = availableHoles.map(({ treeIdx: ti, holeId }) =>
          removeStageHoles({
            ...stateWithClone,
            trees: replaceInTrees(stateWithClone.trees, ti, holeId, tree),
          }),
        );
        const insertTargets = allInsertionPointsInTrees(
          stateWithClone.trees,
        ).map(({ treeIdx: ti, parentId, index }) =>
          removeStageHoles({
            ...stateWithClone,
            trees: insertInTrees(
              stateWithClone.trees,
              ti,
              parentId,
              index,
              tree,
            ),
          }),
        );
        const paletteTargets = fullState.paletteExpanded
          ? paletteInsertionTargets(stateWithClone, tree).map(removeStageHoles)
          : [];
        const stageTargets = emptyStageTarget(stateWithClone, tree);
        return d
          .closest([
            holeTargets,
            insertTargets,
            paletteTargets,
            stageTargets,
            fullState,
          ])
          .withFloating()
          .whenFar(d.fixed(stateWithClone).withFloating());
      }

      // Backdrop: variadic parent → splice out, fixed parent → leave ◯ hole
      let stateWithout: State;
      let pickupHoleId: string | null = null;
      if (parentInfo && parentInfo.parent.variadic) {
        stateWithout = {
          ...fullState,
          trees: removeInTrees(
            fullState.trees,
            treeIdx,
            parentInfo.parent.id,
            parentInfo.index,
          ),
        };
      } else {
        pickupHoleId = `pickup-${nextPickupId++}`;
        const hole: Tree = { id: pickupHoleId, label: "◯", children: [] };
        stateWithout = {
          ...fullState,
          trees: replaceInTrees(fullState.trees, treeIdx, nodeId, hole),
        };
      }

      const allHoles = findAllHolesInTrees(stateWithout.trees).filter(
        ({ holeId }) => holeId !== pickupHoleId,
      );
      const holeTargets = allHoles.map(({ treeIdx: ti, holeId }) =>
        removeStageHoles({
          ...stateWithout,
          trees: replaceInTrees(stateWithout.trees, ti, holeId, tree),
        }),
      );

      const insertTargets = allInsertionPointsInTrees(stateWithout.trees).map(
        ({ treeIdx: ti, parentId, index }) =>
          removeStageHoles({
            ...stateWithout,
            trees: insertInTrees(stateWithout.trees, ti, parentId, index, tree),
          }),
      );

      const swapTargets: State[] = [];
      if (parentInfo) {
        const { parent, index } = parentInfo;
        for (let i = 0; i < parent.children.length; i++) {
          if (i !== index && parent.children[i].label !== "◯") {
            swapTargets.push({
              ...fullState,
              trees: fullState.trees.map((t, ti) =>
                ti === treeIdx
                  ? swapChildrenAtParent(t, parent.id, index, i)
                  : t,
              ),
            });
          }
        }
      }

      const paletteTargets = fullState.paletteExpanded
        ? paletteInsertionTargets(stateWithout, tree).map(removeStageHoles)
        : [];
      // Clean up bare pickup hole, offer "put back on stage" only if stage is now empty.
      const cleanedWithout = removeStageHoles(stateWithout);
      const stageTargets = emptyStageTarget(cleanedWithout, tree);
      const newVoidStack = [tree, ...fullState.voidStack].slice(0, 10);
      const eraseState: State = {
        ...stateWithout,
        voided: tree,
        voidStack: newVoidStack,
      };
      const cleanState: State = {
        ...stateWithout,
        voided: undefined,
        voidStack: newVoidStack,
      };

      return d
        .closest([
          d
            .closest([
              holeTargets,
              insertTargets,
              swapTargets,
              paletteTargets,
              stageTargets,
              fullState,
            ])
            .withFloating(),
          d
            .fixed(removeStageHoles(eraseState))
            .withFloating()
            .onDrop(removeStageHoles(cleanState)),
        ])
        .whenFar(
          d
            .fixed(cleanedWithout)
            .withFloating()
            .onDrop({
              ...cleanedWithout,
              voidStack: newVoidStack,
            }),
        );
    });
  };
}

function makeBrushDrag(
  state: State,
  d: DragSpecBuilder<State>,
  block: BrushBlock,
  brushIdx: number,
  allHoles: { treeIdx: number; holeId: string }[],
  allInsertPts: { treeIdx: number; parentId: string; index: number }[],
): OnDragCallback<State> {
  return () => {
    const stateWithout = produce(state, (draft) => {
      draft.brushes[brushIdx].key += "-r";
    });
    const node = makeNodeForItem(block);

    const holeTargets = allHoles.map(({ treeIdx, holeId }) =>
      removeStageHoles({
        ...stateWithout,
        trees: replaceInTrees(stateWithout.trees, treeIdx, holeId, node),
      }),
    );

    const insertTargets = allInsertPts.map(({ treeIdx, parentId, index }) =>
      removeStageHoles({
        ...stateWithout,
        trees: insertInTrees(
          stateWithout.trees,
          treeIdx,
          parentId,
          index,
          node,
        ),
      }),
    );

    const stageTargets = emptyStageTarget(stateWithout, node);

    const paletteTargets = state.paletteExpanded
      ? paletteInsertionTargets(stateWithout, node)
      : [];

    return d
      .closest([holeTargets, insertTargets, stageTargets, paletteTargets])
      .whenFar(stateWithout)
      .withFloating();
  };
}

function makePaletteDrag(
  state: State,
  d: DragSpecBuilder<State>,
  block: Tree,
  idx: number,
): OnDragCallback<State> {
  return () =>
    d.reactTo(altKey, (altKey) => {
      if (altKey) {
        const stateWithClone = produce(state, (draft) => {
          draft.palette[idx] = cloneTreeWithFreshIds(block);
        });
        const holes = findAllHolesInTrees(stateWithClone.trees);
        const placeTargets = holes.map(({ treeIdx: ti, holeId }) =>
          removeStageHoles({
            ...stateWithClone,
            trees: replaceInTrees(stateWithClone.trees, ti, holeId, block),
          }),
        );
        const insertTargets = allInsertionPointsInTrees(
          stateWithClone.trees,
        ).map(({ treeIdx: ti, parentId, index }) =>
          removeStageHoles({
            ...stateWithClone,
            trees: insertInTrees(
              stateWithClone.trees,
              ti,
              parentId,
              index,
              block,
            ),
          }),
        );
        const stageTargets = emptyStageTarget(stateWithClone, block);
        const palTargets = paletteInsertionTargets(stateWithClone, block);
        return d
          .closest([
            placeTargets,
            insertTargets,
            stageTargets,
            palTargets,
            state,
          ])
          .whenFar(stateWithClone)
          .withFloating();
      }

      const stateWithout = produce(state, (draft) => {
        draft.palette.splice(idx, 1);
      });
      const holes = findAllHolesInTrees(stateWithout.trees);
      const placeTargets = holes.map(({ treeIdx: ti, holeId }) =>
        removeStageHoles({
          ...stateWithout,
          trees: replaceInTrees(stateWithout.trees, ti, holeId, block),
        }),
      );
      const insertTargets = allInsertionPointsInTrees(stateWithout.trees).map(
        ({ treeIdx: ti, parentId, index }) =>
          removeStageHoles({
            ...stateWithout,
            trees: insertInTrees(
              stateWithout.trees,
              ti,
              parentId,
              index,
              block,
            ),
          }),
      );
      const stageTargets = emptyStageTarget(stateWithout, block);
      const reorderTargets = paletteInsertionTargets(stateWithout, block);
      const newVoidStack = [block, ...state.voidStack].slice(0, 10);
      const eraseState: State = {
        ...stateWithout,
        voided: block,
        voidStack: newVoidStack,
      };
      const cleanState: State = {
        ...stateWithout,
        voided: undefined,
        voidStack: newVoidStack,
      };
      return d
        .closest([
          d
            .closest([
              placeTargets,
              insertTargets,
              stageTargets,
              reorderTargets,
            ])
            .withFloating(),
          d
            .fixed(removeStageHoles(eraseState))
            .withFloating()
            .onDrop(removeStageHoles(cleanState)),
        ])
        .whenFar(
          d
            .fixed(stateWithout)
            .withFloating()
            .onDrop({
              ...stateWithout,
              voidStack: newVoidStack,
            }),
        );
    });
}

function makeVoidDrag(
  state: State,
  d: DragSpecBuilder<State>,
): OnDragCallback<State> | undefined {
  if (state.voidStack.length === 0) return undefined;
  const tree = state.voidStack[0];
  const stateWithout: State = {
    ...state,
    voidStack: state.voidStack.slice(1),
  };

  return () => {
    const holes = findAllHolesInTrees(stateWithout.trees);
    const holeTargets = holes.map(({ treeIdx, holeId }) =>
      removeStageHoles({
        ...stateWithout,
        trees: replaceInTrees(stateWithout.trees, treeIdx, holeId, tree),
      }),
    );
    const insertTargets = allInsertionPointsInTrees(stateWithout.trees).map(
      ({ treeIdx, parentId, index }) =>
        removeStageHoles({
          ...stateWithout,
          trees: insertInTrees(
            stateWithout.trees,
            treeIdx,
            parentId,
            index,
            tree,
          ),
        }),
    );
    const paletteTargets = state.paletteExpanded
      ? paletteInsertionTargets(stateWithout, tree)
      : [];
    const stageTargets = emptyStageTarget(stateWithout, tree);

    return d
      .closest([holeTargets, insertTargets, paletteTargets, stageTargets])
      .withFloating()
      .whenFar(d.fixed(stateWithout).withFloating().onDrop(state));
  };
}

// # Tree rendering

function renderTree(
  tree: Tree,
  opts?: {
    pickUp?: {
      d: DragSpecBuilder<State>;
      fullState: State;
      treeIdx: number;
    };
    pointerEventsNone?: boolean;
    rootDragology?: OnDragCallback<State>;
    rootTransform?: string;
    depth?: number;
    opacity?: number;
    flatZIndex?: boolean;
    insideArrow?: boolean;
  },
): { element: Svgx; w: number; h: number } {
  const isHole = tree.label === "◯";
  const isArrow = isRewriteArrow(tree.label);
  const isOpNode = isOp(tree.label);
  const depth = opts?.depth ?? 0;
  const valid = arityOk(tree);

  // Children use rootTransform for positioning (variadic-safe: no non-id wrapper)
  const baseChildOpts = opts
    ? {
        ...opts,
        rootDragology: undefined,
        rootTransform: undefined,
        depth: depth + 1,
        insideArrow: opts.insideArrow || isArrow,
      }
    : undefined;
  const renderedChildren: { element: Svgx; w: number; h: number }[] = [];
  let childY = 0;
  for (const child of tree.children) {
    const r = renderTree(
      child,
      baseChildOpts
        ? { ...baseChildOpts, rootTransform: translate(0, childY) }
        : undefined,
    );
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

  const w = innerW + T_PADDING * 2;
  const h = innerH + T_PADDING * 2;
  const rx = isHole ? (h - 6) / 2 : Math.min(14, 0.3 * Math.min(w, h));

  // Pick-up drag
  const pickUpDrag = opts?.pickUp
    ? makePickupDrag(
        tree,
        opts.pickUp.d,
        opts.pickUp.fullState,
        opts.pickUp.treeIdx,
      )
    : undefined;

  const zIndex = opts?.flatZIndex ? 0 : depth;

  // Arity-aware styling
  const strokeColor = isHole
    ? opts?.insideArrow
      ? "#c4b5fd"
      : "#bbb"
    : !valid
      ? "#dd3333"
      : isArrow
        ? "#7c3aed"
        : hasChildArea
          ? "gray"
          : "transparent";
  const labelColor = isHole
    ? "#999"
    : !valid
      ? "#dd3333"
      : isArrow
        ? "#7c3aed"
        : "black";

  const element = (
    <g
      id={tree.id}
      transform={opts?.rootTransform}
      dragologyOnDrag={opts?.rootDragology || pickUpDrag}
      dragologyZIndex={zIndex}
      opacity={opts?.opacity}
    >
      <rect
        x={isHole ? 3 : 0}
        y={isHole ? 3 : 0}
        width={isHole ? w - 6 : w}
        height={isHole ? h - 6 : h}
        rx={rx}
        stroke={strokeColor}
        strokeWidth={isArrow ? 2 : 1}
        fill={isHole ? (opts?.insideArrow ? "#ede9fe" : "#eee") : "transparent"}
      />
      <text
        x={T_PADDING + T_LABEL_WIDTH / 2}
        y={T_PADDING + innerH / 2}
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={isHole ? 0 : 24}
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

// # Layout computation

type StageLayout = {
  brushes: {
    itemData: {
      block: BrushBlock;
      displayTree: Tree;
      size: { w: number; h: number };
      bucketStart: boolean;
    }[];
    positions: number[];
    xOffsets: number[];
    width: number;
    height: number;
    dividers: { id: string; y: number }[];
  };
  palette: {
    items: { block: Tree; size: { w: number; h: number } }[];
    positions: number[];
    width: number;
    height: number;
  };
  stage: {
    rendered: { element: Svgx; w: number; h: number }[];
    positions: number[];
    width: number;
    height: number;
  };
  x: {
    menu: number;
    brushes: number;
    palette: number;
    stage: number;
    void: number;
    toggleSep: number;
  };
  separators: { x: number; h: number }[];
  menu: {
    defs: {
      id: string;
      icon: string;
      active: boolean;
      stateKey: "showHolesOps" | "showVariadicOps" | "showAtoms";
      bucket: Bucket;
      y: number;
    }[];
  };
  holes: { treeIdx: number; holeId: string }[];
  insertPts: { treeIdx: number; parentId: string; index: number }[];
};

function computeLayout(state: State, d: DragSpecBuilder<State>): StageLayout {
  // Filter brushes items by active buckets, ordered by bucketOrder
  const visibleItems = state.brushes.filter(
    (b) =>
      (b.bucket === "atoms" && state.showAtoms) ||
      (b.bucket === "holes" && state.showHolesOps) ||
      (b.bucket === "variadic" && state.showVariadicOps),
  );

  const bucketOrder = state.bucketOrder;
  const orderedItems: { block: BrushBlock; bucketStart: boolean }[] = [];
  let firstBucket = true;
  for (const sec of bucketOrder) {
    const items = visibleItems.filter((b) => b.bucket === sec);
    if (items.length > 0) {
      items.forEach((b, i) => {
        orderedItems.push({
          block: b,
          bucketStart: i === 0 && !firstBucket,
        });
      });
      firstBucket = false;
    }
  }

  // -- Brushes layout --
  const brushesItemData = orderedItems.map(({ block, bucketStart }) => {
    const displayTree = makeNodeForItem(block);
    return {
      block,
      displayTree,
      size: treeSize(displayTree),
      bucketStart,
    };
  });

  let brushesContentW =
    brushesItemData.length > 0
      ? _.max(brushesItemData.map((t) => t.size.w))!
      : 30;
  for (let i = 0; i < brushesItemData.length - 1; i++) {
    if (
      brushesItemData[i].block.bucket === "atoms" &&
      brushesItemData[i + 1].block.bucket === "atoms" &&
      !brushesItemData[i + 1].bucketStart
    ) {
      const pairW =
        brushesItemData[i].size.w + BLOCK_GAP + brushesItemData[i + 1].size.w;
      brushesContentW = Math.max(brushesContentW, pairW);
      i++;
    }
  }
  const brushesWidth = LANE_PADDING + brushesContentW + LANE_PADDING;

  let brushesY = LANE_PADDING;
  let atomCol = 0;
  const brushesPositions: number[] = [];
  const brushesXOffsets: number[] = [];

  brushesItemData.forEach((item, idx) => {
    if (item.bucketStart) {
      if (atomCol === 1) {
        brushesY += brushesItemData[idx - 1].size.h + BLOCK_GAP;
        atomCol = 0;
      }
      brushesY += BUCKET_GAP;
    }

    if (item.block.bucket === "atoms") {
      if (atomCol === 0) {
        brushesPositions.push(brushesY);
        brushesXOffsets.push(0);
        atomCol = 1;
      } else {
        brushesPositions.push(brushesPositions[brushesPositions.length - 1]);
        brushesXOffsets.push(brushesItemData[idx - 1].size.w + BLOCK_GAP);
        const rowH = Math.max(item.size.h, brushesItemData[idx - 1].size.h);
        brushesY += rowH + BLOCK_GAP;
        atomCol = 0;
      }
    } else {
      if (atomCol === 1) {
        brushesY += brushesItemData[idx - 1].size.h + BLOCK_GAP;
        atomCol = 0;
      }
      brushesPositions.push(brushesY);
      brushesXOffsets.push(0);
      brushesY += item.size.h + BLOCK_GAP;
    }
  });

  if (atomCol === 1) {
    brushesY += brushesItemData[brushesItemData.length - 1].size.h + BLOCK_GAP;
  }
  const brushesHeight = brushesY + LANE_PADDING - BLOCK_GAP;

  const bucketDividers: { id: string; y: number }[] = [];
  brushesItemData.forEach((item, idx) => {
    if (item.bucketStart) {
      bucketDividers.push({
        id: `brush-div-${bucketDividers.length}`,
        y: brushesPositions[idx] - (BLOCK_GAP + BUCKET_GAP) / 2,
      });
    }
  });

  const allHoles = findAllHolesInTrees(state.trees);
  const allInsertPts = allInsertionPointsInTrees(state.trees);

  // -- Palette layout --
  const paletteItems = state.palette.map((block) => ({
    block,
    size: treeSize(block),
  }));
  const paletteContentW =
    paletteItems.length > 0 ? _.max(paletteItems.map((p) => p.size.w))! : 0;
  const paletteWidth = Math.max(
    PALETTE_MIN_WIDTH,
    paletteContentW + LANE_PADDING * 2,
  );

  let paletteY = LANE_PADDING;
  const palettePositions = paletteItems.map((item) => {
    const y = paletteY;
    paletteY += item.size.h + BLOCK_GAP;
    return y;
  });
  const paletteHeight = Math.max(
    paletteY + LANE_PADDING - BLOCK_GAP,
    LANE_PADDING * 2 + PALETTE_MIN_WIDTH,
  );

  // -- Stage layout --
  const stageRendered = state.trees.map((tree, treeIdx) =>
    renderTree(tree, {
      pickUp: { d, fullState: state, treeIdx },
    }),
  );
  const stageContentW =
    stageRendered.length > 0
      ? _.max(stageRendered.map((r) => r.w))!
      : STAGE_MIN_WIDTH;
  const stageWidth = Math.max(
    STAGE_MIN_WIDTH,
    stageContentW + LANE_PADDING * 2,
  );

  let stageY = LANE_PADDING;
  const stagePositions = stageRendered.map((r) => {
    const y = stageY;
    stageY += r.h + BLOCK_GAP;
    return y;
  });
  const stageHeight = Math.max(
    stageY + LANE_PADDING - BLOCK_GAP,
    LANE_PADDING * 2 + STAGE_MIN_WIDTH,
  );

  // -- Horizontal positions --
  const menuX = 0;
  const brushesX = MENU_COL_WIDTH + COL_GAP;
  const paletteX = brushesX + brushesWidth + COL_GAP;
  const stageX = state.paletteExpanded
    ? paletteX + paletteWidth + COL_GAP
    : brushesX + brushesWidth + COL_GAP;
  const voidX = stageX + stageWidth + COL_GAP;
  const toggleSepX = brushesX + brushesWidth + COL_GAP / 2;

  // -- Separator data --
  const separators: { x: number; h: number }[] = [
    {
      x: MENU_COL_WIDTH + COL_GAP / 2,
      h: Math.max(
        brushesHeight,
        MENU_FONT_SIZE * 3 + BLOCK_GAP * 2 + LANE_PADDING * 2,
      ),
    },
  ];
  if (state.paletteExpanded) {
    separators.push({
      x: toggleSepX,
      h: Math.max(brushesHeight, paletteHeight),
    });
    separators.push({
      x: paletteX + paletteWidth + COL_GAP / 2,
      h: Math.max(paletteHeight, stageHeight),
    });
  } else {
    separators.push({
      x: toggleSepX,
      h: Math.max(brushesHeight, stageHeight),
    });
  }
  separators.push({
    x: stageX + stageWidth + COL_GAP / 2,
    h: Math.max(stageHeight, VOID_SIZE),
  });

  // -- Menu defs --
  const menuDefs = bucketOrder.map((bucket, idx) => {
    const stateKey = BUCKET_STATE_KEYS[bucket];
    return {
      id: `icon-${bucket}`,
      icon: BUCKET_ICONS[bucket],
      active: state[stateKey],
      stateKey,
      bucket,
      y: LANE_PADDING + idx * (MENU_FONT_SIZE + BLOCK_GAP) + MENU_FONT_SIZE / 2,
    };
  });

  return {
    brushes: {
      itemData: brushesItemData,
      positions: brushesPositions,
      xOffsets: brushesXOffsets,
      width: brushesWidth,
      height: brushesHeight,
      dividers: bucketDividers,
    },
    palette: {
      items: paletteItems,
      positions: palettePositions,
      width: paletteWidth,
      height: paletteHeight,
    },
    stage: {
      rendered: stageRendered,
      positions: stagePositions,
      width: stageWidth,
      height: stageHeight,
    },
    x: {
      menu: menuX,
      brushes: brushesX,
      palette: paletteX,
      stage: stageX,
      void: voidX,
      toggleSep: toggleSepX,
    },
    separators,
    menu: { defs: menuDefs },
    holes: allHoles,
    insertPts: allInsertPts,
  };
}

// # Draggable

export const draggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => {
  const layout = computeLayout(state, d);

  return (
    <g>
      {/* CSS for menu hover */}
      <defs>
        <style>{`
            [data-bucket-active], [data-bucket-inactive] {
              transition: fill 0.1s;
              cursor: pointer;
            }
            [data-bucket-active]:hover {
              fill: #111 !important;
            }
            [data-bucket-inactive]:hover {
              fill: #999 !important;
            }
            [data-palette-toggle] {
              transition: fill 0.1s;
              cursor: pointer;
            }
            [data-palette-toggle]:hover {
              fill: #333 !important;
            }
          `}</style>
      </defs>

      {/* Menu — click to toggle, drag to reorder (uses dragThreshold) */}
      {layout.menu.defs.map(({ id, icon, active, stateKey, bucket, y }) => (
        <g
          id={id}
          transform={translate(layout.x.menu + LANE_PADDING, y)}
          dragologyOnDrag={() => {
            const others = state.bucketOrder.filter((s) => s !== bucket);
            const targets = _.range(others.length + 1).map((pos) => ({
              ...state,
              bucketOrder: [
                ...others.slice(0, pos),
                bucket,
                ...others.slice(pos),
              ],
            }));
            return d.between(targets);
          }}
          dragologyZIndex={-5}
          onClick={() =>
            setState({ ...state, [stateKey]: !active }, { transition: 0 })
          }
        >
          <text
            textAnchor="start"
            dominantBaseline="middle"
            fontSize={MENU_FONT_SIZE}
            fill={active ? "#333" : "#ccc"}
            {...(active
              ? { "data-bucket-active": true }
              : { "data-bucket-inactive": true })}
          >
            {icon}
          </text>
        </g>
      ))}

      {/* Separator lines */}
      {layout.separators.map(({ x, h }, idx) => (
        <line
          x1={x}
          y1={SEP_INSET}
          x2={x}
          y2={h - SEP_INSET}
          stroke="#ddd"
          strokeWidth={1}
          strokeLinecap="round"
          id={`sep-${idx}`}
          dragologyZIndex={-10}
        />
      ))}

      {/* Palette toggle */}
      <circle
        id="palette-toggle"
        cx={layout.x.toggleSep}
        cy={SEP_INSET + 0}
        r={4}
        fill={state.paletteExpanded ? "#999" : "#ddd"}
        data-palette-toggle={true}
        dragologyZIndex={-5}
        onClick={() =>
          setState(
            { ...state, paletteExpanded: !state.paletteExpanded },
            { transition: 0 },
          )
        }
      />

      {/* Bucket dividers */}
      {layout.brushes.dividers.map(({ id, y }) => (
        <line
          id={id}
          x1={layout.x.brushes + LANE_PADDING}
          y1={y}
          x2={layout.x.brushes + layout.brushes.width - LANE_PADDING}
          y2={y}
          stroke="#ddd"
          strokeWidth={1}
          dragologyZIndex={-10}
        />
      ))}

      {/* Brushes */}
      {layout.brushes.itemData.map(({ block, displayTree }, idx) => {
        const brushIdx = state.brushes.indexOf(block);
        return (
          <g
            id={`brush-item-${block.key}`}
            transform={translate(
              layout.x.brushes + LANE_PADDING + layout.brushes.xOffsets[idx],
              layout.brushes.positions[idx],
            )}
          >
            {
              renderTree(displayTree, {
                pointerEventsNone: true,
                rootDragology: makeBrushDrag(
                  state,
                  d,
                  block,
                  brushIdx,
                  layout.holes,
                  layout.insertPts,
                ),
              }).element
            }
          </g>
        );
      })}

      {/* Palette items (only when expanded) */}
      {state.paletteExpanded &&
        layout.palette.items.map(
          ({ block }, idx) =>
            renderTree(block, {
              rootTransform: translate(
                layout.x.palette + LANE_PADDING,
                layout.palette.positions[idx],
              ),
              pointerEventsNone: true,
              flatZIndex: true,
              rootDragology: makePaletteDrag(state, d, block, idx),
            }).element,
        )}

      {/* Stage trees — using rootTransform so root elements are hoisted directly */}
      {layout.stage.rendered.map(
        (_, idx) =>
          renderTree(state.trees[idx], {
            pickUp: {
              d,
              fullState: state,
              treeIdx: idx,
            },
            rootTransform: translate(
              layout.x.stage + LANE_PADDING,
              layout.stage.positions[idx],
            ),
          }).element,
      )}

      {/* Void */}
      <g transform={translate(layout.x.void, 0)}>
        {/* Glow circle — fades in when dragging toward void */}
        <circle
          cx={VOID_SIZE / 2}
          cy={VOID_SIZE / 2}
          r={VOID_SIZE / 2}
          fill="#f5c6c6"
          opacity={state.voided ? 0.8 : 0}
          pointerEvents="none"
        />
        <text
          x={VOID_SIZE / 2}
          y={VOID_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={state.voided ? 18 : 16}
          fill={state.voidStack.length > 0 ? "#999" : "#ccc"}
          pointerEvents="none"
        >
          🗑
        </text>
        {/* Count badge */}
        <circle
          cx={VOID_SIZE / 2 + 12}
          cy={VOID_SIZE / 2 - 8}
          r={7}
          fill="#c53030"
          opacity={state.voidStack.length > 0 ? 1 : 0}
          pointerEvents="none"
        />
        <text
          x={VOID_SIZE / 2 + 12}
          y={VOID_SIZE / 2 - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight="bold"
          fill="white"
          pointerEvents="none"
          opacity={state.voidStack.length > 0 ? 1 : 0}
        >
          {state.voidStack.length || ""}
        </text>
        {/* Voided tree — hidden (opacity 0) but present for framework element lookup */}
        {state.voided &&
          renderTree(state.voided, { pointerEventsNone: true, opacity: 0 })
            .element}
      </g>

      {/* Top of void stack — invisible until dragged, overlaps trash icon for click target */}
      {!state.voided &&
        state.voidStack.length > 0 &&
        renderTree(state.voidStack[0], {
          rootTransform: translate(layout.x.void, 0),
          rootDragology: makeVoidDrag(state, d),
          opacity: draggedId === state.voidStack[0].id ? 1 : 0,
          flatZIndex: true,
        }).element}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={state1}
      width={600}
      height={800}
    />
  ),
  {
    tags: [
      "spec.onDrop",
      "setState",
      "d.between",
      "keyboard",
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
    ],
  },
);
