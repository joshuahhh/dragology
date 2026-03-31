import { curveCardinal, line } from "d3-shape";
import _ from "lodash";
import { useMemo, useState } from "react";
import { arrowhead } from "../../arrows";
import { demo } from "../../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  ConfigSelect,
  DemoDraggable,
  DemoLink,
  DemoNotes,
  DemoWithConfig,
} from "../../demo/ui";
import { Draggable } from "../../draggable";
import {
  type BetweenInterpolation,
  type DragSpecBuilder,
} from "../../DragSpec";
import { Vec2 } from "../../math/vec2";
import { Svgx } from "../../svgx";
import { Finalizers, pointRef, PointRef } from "../../svgx/finalizers";
import { path, translate } from "../../svgx/helpers";
import { overlapIntervals } from "./layout";
import {
  getAllMorphs,
  getNodeById,
  tree3,
  tree7,
  TreeMorph,
  TreeNode,
} from "./trees";

// returns the path from `node` to another node `n` such that `pred(n)==true`.
function traverseUntilPred<T>(
  node: T,
  next: (n: T) => T[],
  pred: (n: T) => boolean,
) {
  const visited = new Set([node]);
  const todo: [T, T[]][] = [[node, []]];
  while (todo.length > 0) {
    const [cur, path] = todo.pop()!;
    if (pred(cur)) return path;

    for (const nxt of next(cur)) {
      if (!visited.has(nxt)) {
        todo.push([nxt, [...path, nxt]]);
        visited.add(nxt);
      }
    }
  }
}

const nodeDist = (a: TreeNode, b: TreeNode) =>
  traverseUntilPred(
    a,
    (n) => (n ? [...n.children, ...(n.parent ? [n.parent] : [])] : []),
    (n) => n === b,
  )!.length;

type Config = {
  oneNodeAtATime: boolean;
  showTradRep: boolean;
  interpolation: BetweenInterpolation;
};

const defaultConfig: Config = {
  oneNodeAtATime: false,
  showTradRep: false,
  interpolation: "natural-neighbor",
};

type State = {
  morph: TreeMorph;
};

// Pre-compute allMorphs at module level
const allMorphs3 = getAllMorphs(tree3, tree3);
export const allMorphs7 = getAllMorphs(tree7, tree7);

const initialState3: State = { morph: allMorphs3[0] };
const initialState7: State = { morph: allMorphs7[0] };

export function draggableFactory(
  domainTree: TreeNode,
  codomainTree: TreeNode,
  allMorphs: TreeMorph[],
  config: Config,
  yForTradRep: number,
): Draggable<State> {
  return ({ state, d }) => {
    const finalizers = new Finalizers();
    const ctx: Ctx = {
      finalizers,
      morph: state.morph,
      d,
      allMorphs,
      codomainTree,
      domainTree,
      config,
      yForTradRep,
    };

    const elements: Svgx[] = [];
    const r = drawBgTree(codomainTree, domainTree, ctx);
    elements.push(r.element);

    if (config.showTradRep) {
      elements.push(...drawTradRep(ctx));
    }

    const mainTree = <g>{elements}</g>;
    return <g>{[mainTree, ...finalizers.run(mainTree)]}</g>;
  };
}

type Ctx = {
  finalizers: Finalizers;
  morph: TreeMorph;
  d: DragSpecBuilder<State>;
  allMorphs: TreeMorph[];
  codomainTree: TreeNode;
  domainTree: TreeNode;
  config: Config;
  yForTradRep: number;
};

// # Drag spec

function dragSpec(draggedNodeId: string, ctx: Ctx) {
  const domainIds = Object.keys(ctx.morph);

  let newMorphs;

  if (ctx.config.oneNodeAtATime) {
    newMorphs = ctx.allMorphs.filter((newMorph) =>
      domainIds.every(
        (nodeId) =>
          nodeId === draggedNodeId || ctx.morph[nodeId] === newMorph[nodeId],
      ),
    );
  } else {
    // Group morphisms by where they send draggedNodeId
    const morphsByDragTarget = _.groupBy(
      ctx.allMorphs,
      (targetMorph) => targetMorph[draggedNodeId],
    );

    // For each group, pick the morphism with minimum total movement
    newMorphs = Object.values(morphsByDragTarget).map(
      (morphsWithDragTarget) =>
        _.minBy(morphsWithDragTarget, (newMorph) =>
          _.sum(
            domainIds.map((nodeId) =>
              nodeDist(
                getNodeById(ctx.codomainTree, ctx.morph[nodeId])!,
                getNodeById(ctx.codomainTree, newMorph[nodeId])!,
              ),
            ),
          ),
        )!,
    );
  }

  return ctx.d
    .between(
      newMorphs.map((morph) => ({ morph })),
      {
        interpolation: ctx.config.interpolation,
      },
    )
    .withSnapRadius(20, { transition: true });
}

// # Drawing constants

const BG_NODE_PADDING = 10;
const BG_NODE_GAP = 40;
const FG_NODE_SIZE = 40;
const FG_NODE_GAP = 20;

// # Main drawing functions

function drawBgTree(
  bgNode: TreeNode,
  fgNode: TreeNode,
  ctx: Ctx,
): { element: Svgx; w: number; h: number } {
  const result = drawBgSubtree(bgNode, [fgNode], ctx);
  return {
    element: result.element,
    w: result.w,
    h: result.h,
  };
}

function drawBgSubtree(
  bgNode: TreeNode,
  fgNodes: TreeNode[],
  ctx: Ctx,
): {
  element: Svgx;
  w: number;
  h: number;
  rootCenter: PointRef;
} {
  const elements: Svgx[] = [];

  const [fgNodesHere, fgNodesBelow] = _.partition(
    fgNodes,
    (n) => ctx.morph[n.id] === bgNode.id,
  );

  const bgNodeR = drawBgNodeWithFgNodesInside(bgNode, fgNodesHere, ctx);

  fgNodesBelow.push(...bgNodeR.fgNodesBelow);

  if (bgNode.children.length === 0) {
    return {
      element: bgNodeR.element,
      w: bgNodeR.w,
      h: bgNodeR.h,
      rootCenter: bgNodeR.rootCenter,
    };
  }

  const childRs = bgNode.children.map((child) =>
    drawBgSubtree(child, fgNodesBelow, ctx),
  );

  const childrenWidth =
    _.sumBy(childRs, (r) => r.w) + BG_NODE_GAP * (childRs.length - 1);

  const params = {
    aLength: bgNodeR.w,
    aAnchor: bgNodeR.w / 2,
    bLength: childrenWidth,
    bAnchor: childrenWidth / 2,
  };
  const { aOffset, bOffset, length: width } = overlapIntervals(params);

  elements.push(
    <g id={`bg-node-group-${bgNode.id}`} transform={translate(aOffset, 0)}>
      {bgNodeR.element}
    </g>,
  );

  let x = bOffset;
  const y = bgNodeR.h + BG_NODE_GAP;
  let maxY = bgNodeR.h;

  for (const [i, childR] of childRs.entries()) {
    const child = bgNode.children[i];
    const childOffset = Vec2(x, y);
    elements.push(
      <g
        id={`bg-child-group-${bgNode.id}-${child.id}`}
        transform={translate(childOffset)}
      >
        {childR.element}
      </g>,
    );

    x += childR.w + BG_NODE_GAP;
    maxY = Math.max(maxY, y + childR.h);

    const bgRootCenter = bgNodeR.rootCenter;
    const childRootCenter = childR.rootCenter;

    ctx.finalizers.push((resolve) => {
      const from = resolve(bgRootCenter);
      const to = resolve(childRootCenter);
      return (
        <line
          id={`bg-edge-${bgNode.id}-${child.id}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="lightgray"
          strokeWidth={12}
          dragologyZIndex="/-2"
        />
      );
    });
  }

  return {
    element: <g>{elements}</g>,
    w: width,
    h: maxY,
    rootCenter: bgNodeR.rootCenter,
  };
}

function drawBgNodeWithFgNodesInside(
  bgNode: TreeNode,
  fgNodesHere: TreeNode[],
  ctx: Ctx,
): {
  element: Svgx;
  w: number;
  h: number;
  fgNodesBelow: TreeNode[];
  rootCenter: PointRef;
} {
  const elementsInRect: Svgx[] = [];

  let x = BG_NODE_PADDING;
  let y = BG_NODE_PADDING;
  let maxX = x + 10;
  let maxY = y + 10;
  const fgNodesBelow: TreeNode[] = [];

  for (const fgNode of fgNodesHere) {
    const r = drawFgSubtreeInBgNode(fgNode, bgNode.id, ctx);
    elementsInRect.push(
      <g id={`fg-in-bg-${bgNode.id}-${fgNode.id}`} transform={translate(x, y)}>
        {r.element}
      </g>,
    );

    x += r.w + FG_NODE_GAP;
    maxX = Math.max(maxX, x - FG_NODE_GAP);
    maxY = Math.max(maxY, y + r.h);

    fgNodesBelow.push(...r.fgNodesBelow);
  }

  maxX += BG_NODE_PADDING;
  maxY += BG_NODE_PADDING;

  const nodeCenterInRect = Vec2(maxX / 2, maxY / 2);
  const circleRadius = nodeCenterInRect.len();
  const nodeCenterInCircle = Vec2(circleRadius);
  const offset = nodeCenterInCircle.sub(nodeCenterInRect);

  const circleId = `bg-circle-${bgNode.id}`;

  return {
    element: (
      <g>
        <circle
          id={circleId}
          cx={nodeCenterInCircle.x}
          cy={nodeCenterInCircle.y}
          r={circleRadius}
          fill="lightgray"
          dragologyZIndex="/-1"
        />
        <g transform={translate(offset)}>{elementsInRect}</g>
      </g>
    ),
    w: 2 * circleRadius,
    h: 2 * circleRadius,
    fgNodesBelow,
    rootCenter: pointRef(circleId, nodeCenterInCircle),
  };
}

function drawFgSubtreeInBgNode(
  fgNode: TreeNode,
  bgNodeId: string,
  ctx: Ctx,
): {
  element: Svgx;
  fgNodesBelow: TreeNode[];
  w: number;
  h: number;
} {
  const childrenElements: Svgx[] = [];
  const childrenId = `fg-children-${fgNode.id}`;
  const fgNodesBelow: TreeNode[] = [];
  let childrenX = 0;
  let childrenMaxH = 0;

  for (const [i, child] of fgNode.children.entries()) {
    if (i > 0) {
      childrenX += FG_NODE_GAP;
    }

    const edgeId = `fg-edge-${fgNode.id}-${child.id}`;

    if (ctx.morph[child.id] === bgNodeId) {
      const r = drawFgSubtreeInBgNode(child, bgNodeId, ctx);
      childrenElements.push(
        <g
          id={`fg-child-${fgNode.id}-${child.id}`}
          transform={translate(childrenX, 0)}
        >
          {r.element}
        </g>,
      );
      fgNodesBelow.push(...r.fgNodesBelow);
      childrenX += r.w;
      childrenMaxH = Math.max(childrenMaxH, r.h);

      ctx.finalizers.push((resolve) => {
        const from = resolve(pointRef(fgNode.id, Vec2(0)));
        const to = resolve(pointRef(child.id, Vec2(0)));
        return (
          <path
            id={edgeId}
            d={
              line().curve(curveCardinal)([
                [from.x, from.y],
                [from.x, from.y],
                [to.x, to.y],
              ])!
            }
            fill="none"
            stroke="black"
            strokeWidth={2}
            dragologyZIndex="/-1"
          />
        );
      });
    } else {
      fgNodesBelow.push(child);

      const intermediateRef = pointRef(childrenId, Vec2(childrenX, 0));
      ctx.finalizers.push((resolve) => {
        const myCenter = resolve(pointRef(fgNode.id, Vec2(0)));
        const intermediate = resolve(intermediateRef);
        const childCenter = resolve(pointRef(child.id, Vec2(0)));
        return (
          <path
            id={edgeId}
            d={
              line().curve(curveCardinal)([
                myCenter.arr(),
                intermediate.arr(),
                childCenter.arr(),
              ])!
            }
            fill="none"
            stroke="black"
            strokeWidth={2}
          />
        );
      });
    }
  }

  let nodeX;
  let childrenTransform;
  if (childrenX < FG_NODE_SIZE) {
    nodeX = FG_NODE_SIZE / 2;
    childrenTransform = translate(
      (FG_NODE_SIZE - childrenX) / 2,
      FG_NODE_SIZE + FG_NODE_GAP,
    );
  } else {
    nodeX = childrenX / 2;
    childrenTransform = translate(0, FG_NODE_SIZE + FG_NODE_GAP);
  }

  const childrenContainer = (
    <g id={childrenId} transform={childrenTransform}>
      {childrenElements}
    </g>
  );

  const nodeCenter = Vec2(nodeX, FG_NODE_SIZE / 2);

  return {
    element: (
      <g>
        <circle
          id={fgNode.id}
          transform={translate(nodeCenter)}
          cx={0}
          cy={0}
          r={FG_NODE_SIZE / 2}
          fill="black"
          dragologyOnDrag={() => dragSpec(fgNode.id, ctx)}
        />
        {childrenContainer}
      </g>
    ),
    fgNodesBelow,
    w: Math.max(childrenX, FG_NODE_SIZE),
    h: FG_NODE_SIZE + (childrenMaxH > 0 ? FG_NODE_GAP + childrenMaxH : 0),
  };
}

// # Traditional representation

function nodeSvgId(nodeId: string, prefix: string): string {
  return `${prefix}-${nodeId}`;
}

function drawTradRep(ctx: Ctx): Svgx[] {
  const elements: Svgx[] = [];

  const domR = drawTree(ctx.domainTree, "domain", "fg", ctx.finalizers);
  elements.push(
    <g transform={translate(0, ctx.yForTradRep)}>{domR.element}</g>,
  );

  const codR = drawTree(ctx.codomainTree, "codomain", "bg", ctx.finalizers);
  elements.push(
    <g transform={translate(domR.w + 40, ctx.yForTradRep)}>{codR.element}</g>,
  );

  for (const [domElem, codElem] of Object.entries(ctx.morph)) {
    ctx.finalizers.push((resolve) => {
      const from = resolve(pointRef(nodeSvgId(domElem, "domain"), Vec2(0)));
      const to = resolve(pointRef(nodeSvgId(codElem, "codomain"), Vec2(0)));
      const mid = from.lerp(to, 0.5).add(Vec2(0, -from.dist(to) / 6));
      const fromAdjusted = from.towards(mid, FG_NODE_SIZE / 2);
      const toAdjusted = to.towards(mid, FG_NODE_SIZE / 2);

      return (
        <g id={`morphism-arrow-${domElem}`}>
          <path
            d={path("M", fromAdjusted, "Q", mid, toAdjusted.towards(mid, 5))}
            fill="none"
            stroke="#4287f5"
            strokeWidth={2}
          />
          {arrowhead({
            tip: toAdjusted,
            headAngleRad: Math.PI / 10,
            direction: to.sub(mid),
            headLength: 15,
            fill: "#4287f5",
            dragologyOnDrag: () => dragSpec(domElem, ctx),
          })}
        </g>
      );
    });
  }

  return elements;
}

function drawTree(
  node: TreeNode,
  idPrefix: string,
  style: "fg" | "bg",
  finalizers: Finalizers,
): {
  element: Svgx;
  w: number;
  h: number;
} {
  const r = drawSubtree(node, idPrefix, style, finalizers);
  return {
    element: r.element,
    w: r.w,
    h: r.h,
  };
}

function drawSubtree(
  node: TreeNode,
  idPrefix: string,
  style: "fg" | "bg",
  finalizers: Finalizers,
): {
  element: Svgx;
  w: number;
  h: number;
} {
  const childrenElements: Svgx[] = [];
  let childrenX = 0;
  let childrenMaxH = 0;

  for (const [i, child] of node.children.entries()) {
    if (i > 0) {
      childrenX += FG_NODE_GAP;
    }
    const r = drawSubtree(child, idPrefix, style, finalizers);
    childrenElements.push(
      <g
        id={`${idPrefix}-child-${node.id}-${child.id}`}
        transform={translate(childrenX, 0)}
      >
        {r.element}
      </g>,
    );
    childrenX += r.w;
    childrenMaxH = Math.max(childrenMaxH, r.h);

    finalizers.push((resolve) => {
      const from = resolve(pointRef(nodeSvgId(node.id, idPrefix), Vec2(0)));
      const to = resolve(pointRef(nodeSvgId(child.id, idPrefix), Vec2(0)));
      return (
        <line
          id={`${idPrefix}-edge-${node.id}-${child.id}`}
          {...from.xy1()}
          {...to.xy2()}
          stroke={style === "fg" ? "black" : "lightgray"}
          strokeWidth={style === "fg" ? 2 : 12}
        />
      );
    });
  }

  let nodeX;
  const childrenContainer =
    childrenElements.length > 0 ? (
      <g transform={translate(0, FG_NODE_SIZE + FG_NODE_GAP)}>
        {childrenElements}
      </g>
    ) : null;

  if (childrenX < FG_NODE_SIZE) {
    nodeX = FG_NODE_SIZE / 2;
  } else {
    nodeX = childrenX / 2;
  }

  const nodeCenter = Vec2(nodeX, FG_NODE_SIZE / 2);

  return {
    element: (
      <g>
        <circle
          id={nodeSvgId(node.id, idPrefix)}
          transform={translate(nodeCenter)}
          cx={0}
          cy={0}
          r={FG_NODE_SIZE / 2}
          fill={style === "fg" ? "black" : "lightgray"}
        />
        {childrenContainer}
      </g>
    ),
    w: Math.max(childrenX, FG_NODE_SIZE),
    h: FG_NODE_SIZE + (childrenMaxH > 0 ? FG_NODE_GAP + childrenMaxH : 0),
  };
}

// # Component

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);

    const draggable3 = useMemo(
      () => draggableFactory(tree3, tree3, allMorphs3, config, 300),
      [config],
    );
    const draggable7 = useMemo(
      () => draggableFactory(tree7, tree7, allMorphs7, config, 500),
      [config],
    );

    return (
      <div>
        <DemoNotes>
          Featuring multi-drag from{" "}
          <DemoLink href="https://elliot.website/">Elliot Evans</DemoLink>.
        </DemoNotes>
        <DemoWithConfig>
          <div>
            <h3 className="text-md font-medium italic mt-6 mb-1">3→3</h3>
            <DemoDraggable
              draggable={draggable3}
              initialState={initialState3}
              width={300}
              height={config.showTradRep ? 700 : 400}
            />
            <h3 className="text-md font-medium italic mt-6 mb-1">7→7</h3>
            <DemoDraggable
              draggable={draggable7}
              initialState={initialState7}
              width={config.showTradRep ? 600 : 400}
              height={config.showTradRep ? 1100 : 600}
            />
          </div>
          <ConfigPanel>
            <ConfigCheckbox
              value={config.oneNodeAtATime}
              onChange={(v) => setConfig((c) => ({ ...c, oneNodeAtATime: v }))}
            >
              Only drag one node at a time
            </ConfigCheckbox>
            <ConfigCheckbox
              value={config.showTradRep}
              onChange={(v) => setConfig((c) => ({ ...c, showTradRep: v }))}
            >
              Show traditional representation
            </ConfigCheckbox>
            <ConfigSelect
              label="Interpolation"
              value={config.interpolation}
              onChange={(v) => setConfig((c) => ({ ...c, interpolation: v }))}
              options={["natural-neighbor", "delaunay"] as const}
            />
          </ConfigPanel>
        </DemoWithConfig>
      </div>
    );
  },
  { tags: ["d.between", "math", "fancy", "reordering"] },
);
