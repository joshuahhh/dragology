import { produce } from "immer";
import React from "react";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { DragSpec, DragSpecBuilder, inOrder, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { makeId } from "../utils";

// ─── Types ───

type StateExpr = { type: "state"; label: "A" | "B" | "C" };
type BetweenExpr = { type: "between"; childIds: string[] };
type WithSnapRadiusExpr = {
  type: "withSnapRadius";
  childId: string | null;
  radius: number;
};
type ClosestExpr = { type: "closest"; childIds: string[] };
type WithFloatingExpr = { type: "withFloating"; childId: string | null };
type FixedExpr = { type: "fixed"; childId: string | null };
type ActiveSpecExpr = { type: "activeSpec"; childId: string | null };
type Expr =
  | StateExpr
  | BetweenExpr
  | WithSnapRadiusExpr
  | ClosestExpr
  | WithFloatingExpr
  | FixedExpr
  | ActiveSpecExpr;

type CanvasNode = { expr: Expr; x: number; y: number };
type DotLabel = "A" | "B" | "C";
const ACTIVE_SPEC_ID = "active-spec";
export type State = {
  nodes: Record<string, CanvasNode>;
  previewDot: DotLabel;
};

type RenderResult = { w: number; content: React.ReactElement };

// ─── Constants ───

const DIAMOND_R = 14;
const BLK_HDR = 26;
const BLK_RX = 8;
const BODY_PAD = 18;
const NOTCH_D = 10;
const DEFAULT_NHW = 24;
const SLOT_PAD = 12;

const TOOLBAR_H = 52;
export const CANVAS_W = 600;
export const CANVAS_H = 400;

const PV_W = 160;
const PV_H = 140;
const PV_X = CANVAS_W - PV_W - 10;
const PV_Y = TOOLBAR_H + 10;
const PV_DOT_R = 12;
const PV_DOTS: Record<DotLabel, { x: number; y: number }> = {
  A: { x: PV_W / 2, y: 35 },
  B: { x: 35, y: PV_H - 30 },
  C: { x: PV_W - 35, y: PV_H - 30 },
};

const STATE_FILL: Record<string, string> = {
  A: "#f97316",
  B: "#3b82f6",
  C: "#22c55e",
};

type BlockStyle = { bg: string; stroke: string; text: string; fs: number };
const S: Record<string, BlockStyle> = {
  between: { bg: "#ede9fe", stroke: "#c4b5fd", text: "#7c3aed", fs: 11 },
  withFloating: { bg: "#ccfbf1", stroke: "#5eead4", text: "#0f766e", fs: 10 },
  fixed: { bg: "#fce7f3", stroke: "#f9a8d4", text: "#be185d", fs: 11 },
  closest: { bg: "#fef3c7", stroke: "#fcd34d", text: "#b45309", fs: 11 },
  wsr: { bg: "#e0f2fe", stroke: "#93c5fd", text: "#2563eb", fs: 10 },
  activeSpec: { bg: "#f1f5f9", stroke: "#94a3b8", text: "#475569", fs: 10 },
};

// ─── Path Segment Helpers ───

const R = BLK_RX;
const arc = (sweep: 0 | 1, x: number, y: number, cr = R) =>
  ` A ${cr},${cr} 0 0 ${sweep} ${x},${y}`;
const pRoundedTop = (w: number, h: number) =>
  `M ${R},0 H ${w - R}${arc(1, w, R)} V ${h - R}${arc(1, w - R, h)}`;
const pSquareTop = (w: number, h: number) =>
  `M 0,0 H ${w} V ${h - R}${arc(1, w - R, h)}`;
const pCloseRounded = (h: number) =>
  ` H ${R}${arc(1, 0, h - R)} V ${R}${arc(1, R, 0)} Z`;
const pCloseFlat = (h: number) => ` H ${R}${arc(1, 0, h - R)} Z`;

const pVNotch = (cx: number, hw: number, nd: number, h: number) =>
  ` H ${cx + hw} L ${cx},${h - nd} L ${cx - hw},${h}`;
const pVNotchCollapsed = (x: number, h: number) =>
  ` H ${x} L ${x},${h} L ${x},${h}`;

const pRectNotch = (cx: number, hw: number, nd: number, h: number) =>
  ` H ${cx + hw} V ${h - nd + R}${arc(0, cx + hw - R, h - nd)}` +
  ` H ${cx - hw + R}${arc(0, cx - hw, h - nd + R)} V ${h}`;
const pRectNotchCollapsed = (x: number, h: number) =>
  ` H ${x} V ${h}${arc(0, x, h, 0.01)} H ${x}${arc(0, x, h, 0.01)} V ${h}`;

// ─── Expr Helpers ───

function exprChildren(e: Expr): string[] {
  if ("childIds" in e) return e.childIds;
  if ("childId" in e && e.childId) return [e.childId];
  return [];
}

function exprSlotKind(e: Expr): "state" | "spec" | null {
  switch (e.type) {
    case "between":
    case "fixed":
      return "state";
    case "closest":
    case "withSnapRadius":
    case "withFloating":
    case "activeSpec":
      return "spec";
    default:
      return null;
  }
}

function exprOpenSlots(e: Expr): number[] {
  if ("childIds" in e) {
    return Array.from({ length: e.childIds.length + 1 }, (_, i) => i);
  }
  if ("childId" in e && e.childId === null) return [0];
  return [];
}

function insertChild(e: Expr, childId: string, idx: number): void {
  if ("childIds" in e) e.childIds.splice(idx, 0, childId);
  else if ("childId" in e) e.childId = childId;
}

function removeChild(e: Expr, idx: number): void {
  if ("childIds" in e) e.childIds.splice(idx, 1);
  else if ("childId" in e) e.childId = null;
}

// ─── State Helpers ───

function findParent(state: State, nodeId: string) {
  for (const [pid, pnode] of Object.entries(state.nodes)) {
    const children = exprChildren(pnode.expr);
    const idx = children.indexOf(nodeId);
    if (idx >= 0) return { parentId: pid, idx };
  }
  return null;
}

function detach(state: State, nodeId: string): State {
  return produce(state, (draft) => {
    const parent = findParent(state, nodeId);
    if (parent) {
      const pn = state.nodes[parent.parentId];
      draft.nodes[nodeId].x = pn.x;
      draft.nodes[nodeId].y = pn.y;
      removeChild(draft.nodes[parent.parentId].expr, parent.idx);
    }
  });
}

function collectDescendants(
  nodes: Record<string, CanvasNode>,
  nid: string,
): string[] {
  const result: string[] = [nid];
  const node = nodes[nid];
  if (!node) return result;
  for (const c of exprChildren(node.expr))
    result.push(...collectDescendants(nodes, c));
  return result;
}

// ─── Drag Builder ───

function nodeDrag(
  d: DragSpecBuilder<State>,
  base: State,
  nid: string,
): DragSpec<State> {
  const node = base.nodes[nid];

  const myKind = node.expr.type === "state" ? "state" : "spec";
  const targets: DragSpec<State>[] = [];

  for (const [sid, sn] of Object.entries(base.nodes)) {
    if (sid === nid) continue;
    const slotKind = exprSlotKind(sn.expr);
    if (slotKind === myKind) {
      for (const i of exprOpenSlots(sn.expr)) {
        targets.push(
          d
            .fixed(
              produce(base, (draft) => {
                insertChild(draft.nodes[sid].expr, nid, i);
              }),
            )
            .withFloating(),
        );
      }
    }
    // States can also snap into spec slots via an auto-created fixed adapter
    if (myKind === "state" && slotKind === "spec") {
      for (const i of exprOpenSlots(sn.expr)) {
        targets.push(
          d
            .fixed(
              produce(base, (draft) => {
                const fixedId = makeId();
                draft.nodes[fixedId] = {
                  expr: { type: "fixed", childId: nid },
                  x: sn.x,
                  y: sn.y,
                };
                insertChild(draft.nodes[sid].expr, fixedId, i);
              }),
            )
            .withFloating(),
        );
      }
    }
  }

  // Chain insertion: splice a single-child spec node between a parent and its
  // existing spec child (e.g. drag withFloating onto closest→between edge)
  if (
    myKind === "spec" &&
    "childId" in node.expr &&
    node.expr.childId === null
  ) {
    const draggedSlotKind = exprSlotKind(node.expr);
    for (const [sid, sn] of Object.entries(base.nodes)) {
      if (sid === nid || exprSlotKind(sn.expr) !== "spec") continue;
      const children = exprChildren(sn.expr);
      for (let i = 0; i < children.length; i++) {
        const cid = children[i];
        const childNode = base.nodes[cid];
        if (!childNode) continue;
        const childKind = childNode.expr.type === "state" ? "state" : "spec";
        if (childKind !== draggedSlotKind) continue;
        targets.push(
          d.fixed(
            produce(base, (draft) => {
              removeChild(draft.nodes[sid].expr, i);
              insertChild(draft.nodes[sid].expr, nid, i);
              (draft.nodes[nid].expr as { childId: string | null }).childId =
                cid;
            }),
          ),
        );
      }
    }
  }

  // Delete state: remove node and all its descendants
  const idsToDelete = collectDescendants(base.nodes, nid);
  const deleted = produce(base, (draft) => {
    for (const id of idsToDelete) delete draft.nodes[id];
  });
  targets.push(d.dropTarget("trash-bin", deleted));

  const free = d.vary(base, [
    param("nodes", nid, "x"),
    param("nodes", nid, "y"),
  ]);

  return d.closest(targets).whenFar(free, { gap: 40 });
}

// ─── Initial State ───

export const initialState: State = {
  nodes: {
    [ACTIVE_SPEC_ID]: {
      expr: { type: "activeSpec", childId: null },
      x: 0,
      y: TOOLBAR_H,
    },
  },
  previewDot: "A",
};

// ─── Rendering Helpers ───

function renderDiamond(label: string) {
  const r = DIAMOND_R;
  return (
    <g>
      <polygon
        points={`0,${-r} ${r},0 0,${r} ${-r},0`}
        fill={STATE_FILL[label]}
        strokeLinejoin="round"
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight="700"
        fill="white"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

function blockHeader(pathD: string, w: number, label: string, s: BlockStyle) {
  return (
    <g>
      <path
        d={pathD}
        fill={s.bg}
        stroke={s.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <text
        x={w / 2}
        y={BLK_HDR / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={s.fs}
        fontWeight="600"
        fill={s.text}
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

function tbPreview(label: string, s: BlockStyle, hw = 28, fs = 9) {
  const w = hw * 2;
  const h = 24;
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={6}
        fill={s.bg}
        stroke={s.stroke}
        strokeWidth={1.5}
      />
      <text
        x={w / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fs}
        fill={s.text}
        fontWeight="500"
      >
        {label}
      </text>
    </g>
  );
}

// ─── Compile Expr → DragSpec ───

function compileExpr(
  d: DragSpecBuilder<State>,
  state: State,
  nodeId: string,
): DragSpec<State> | null {
  const node = state.nodes[nodeId];
  if (!node) return null;
  const expr = node.expr;

  switch (expr.type) {
    case "between": {
      const childStates = expr.childIds
        .map((cid) => state.nodes[cid])
        .filter((n) => n && n.expr.type === "state")
        .map((n) => ({ ...state, previewDot: (n.expr as StateExpr).label }));
      if (childStates.length === 0) return null;
      return d.between(childStates);
    }
    case "withFloating": {
      if (!expr.childId) return null;
      const inner = compileExpr(d, state, expr.childId);
      if (!inner) return null;
      return inner.withFloating();
    }
    case "closest": {
      const childSpecs = expr.childIds
        .map((cid) => compileExpr(d, state, cid))
        .filter((s): s is DragSpec<State> => s !== null);
      if (childSpecs.length === 0) return null;
      return d.closest(childSpecs);
    }
    case "withSnapRadius": {
      if (!expr.childId) return null;
      const inner = compileExpr(d, state, expr.childId);
      if (!inner) return null;
      return inner.withSnapRadius(expr.radius);
    }
    case "fixed": {
      if (!expr.childId || !state.nodes[expr.childId]) return null;
      const cn = state.nodes[expr.childId];
      if (cn.expr.type !== "state") return null;
      return d.fixed({ ...state, previewDot: cn.expr.label });
    }
    case "activeSpec": {
      if (!expr.childId) return null;
      return compileExpr(d, state, expr.childId);
    }
    default:
      return null;
  }
}

// ─── Draggable ───

export const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  // Collect snapped IDs (children of other nodes + the permanent active-spec node)
  const snappedIds = new Set<string>([ACTIVE_SPEC_ID]);
  for (const n of Object.values(state.nodes))
    for (const cid of exprChildren(n.expr)) snappedIds.add(cid);

  // ── Toolbar defs ──

  type ToolbarItem = {
    label: string;
    group: string;
    hw: number; // half-width for layout
    makeExpr: () => Expr;
    preview: React.ReactElement;
  };

  const GROUP_GAP = 20;
  const LEFT_PAD = 10;

  const ITEM_GAP = 12;

  const toolbarItemGroups: {
    title: string;
    items: Omit<ToolbarItem, "group">[];
  }[] = [
    {
      title: "STATES",
      items: (["A", "B", "C"] as const).map((l) => ({
        label: l,
        hw: 10,
        makeExpr: (): Expr => ({ type: "state", label: l }),
        preview: (
          <g>
            <polygon
              points={`0,-10 10,0 0,10 -10,0`}
              fill={STATE_FILL[l]}
              strokeLinejoin="round"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8}
              fontWeight="700"
              fill="white"
              pointerEvents="none"
            >
              {l}
            </text>
          </g>
        ),
      })),
    },
    {
      title: "COMBINATORS",
      items: [
        {
          label: "between",
          hw: 28,
          makeExpr: (): Expr => ({ type: "between", childIds: [] }),
          preview: tbPreview("between", S.between),
        },
        {
          label: "closest",
          hw: 28,
          makeExpr: (): Expr => ({ type: "closest", childIds: [] }),
          preview: tbPreview("closest", S.closest),
        },
      ],
    },
    {
      title: "MODIFIERS",
      items: [
        {
          label: "fixed",
          hw: 28,
          makeExpr: (): Expr => ({ type: "fixed", childId: null }),
          preview: tbPreview("fixed", S.fixed),
        },
        {
          label: "withFloating",
          hw: 36,
          makeExpr: (): Expr => ({ type: "withFloating", childId: null }),
          preview: tbPreview("withFloating", S.withFloating, 36, 8),
        },
        {
          label: "wsr",
          hw: 42,
          makeExpr: (): Expr => ({
            type: "withSnapRadius",
            childId: null,
            radius: 15,
          }),
          preview: tbPreview("withSnapRadius", S.wsr, 42, 8),
        },
      ],
    },
  ];

  // Lay out items with even spacing within groups, and gaps between groups
  const toolbarDefs: (ToolbarItem & { x: number })[] = [];
  const toolbarGroupPositions: { title: string; x: number }[] = [];
  let x = LEFT_PAD;
  for (const group of toolbarItemGroups) {
    toolbarGroupPositions.push({ title: group.title, x });
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      x += item.hw; // advance to center
      toolbarDefs.push({ ...item, group: group.title, x });
      x += item.hw + ITEM_GAP; // advance past right edge + gap
    }
    x += GROUP_GAP - ITEM_GAP; // replace last item gap with group gap
  }

  // ── Render helpers (using closure over state, d, draggedId) ──

  function renderSnappedChild(
    childId: string,
    pos: { x: number; y: number },
    content: React.ReactElement | null,
  ) {
    if (!content) return null;
    return (
      <g
        id={`n-${childId}`}
        key={childId}
        transform={translate(pos)}
        dragologyZIndex={draggedId === `n-${childId}` ? 10 : 1}
        dragologyOnDrag={() => {
          const base = detach(state, childId);
          return nodeDrag(d, base, childId);
        }}
      >
        {content}
      </g>
    );
  }

  function renderSpecBlock(
    nodeId: string,
    node: CanvasNode,
  ): RenderResult | null {
    switch (node.expr.type) {
      case "between":
        return renderBetweenBlock(nodeId, node.expr);
      case "withSnapRadius":
        return renderWSRBlock(nodeId, node.expr);
      case "closest":
        return renderClosestBlock(nodeId, node.expr);
      case "withFloating":
        return renderWithFloatingBlock(nodeId, node.expr);
      case "fixed":
        return renderFixedBlock(nodeId, node.expr);
      default:
        return null;
    }
  }

  function renderBetweenBlock(
    _parentId: string,
    expr: BetweenExpr,
  ): RenderResult {
    const PAD = 14,
      SW = 38,
      MAX_SLOTS = 6;
    const slots = expr.childIds.length + 1;
    const w = PAD * 2 + slots * SW;
    const h = BLK_HDR + BODY_PAD;

    let p = pRoundedTop(w, h);
    for (let i = MAX_SLOTS - 1; i >= 0; i--)
      p +=
        i < slots
          ? pVNotch(PAD + i * SW + SW / 2, DIAMOND_R, DIAMOND_R, h)
          : pVNotchCollapsed(w - R, h);
    p += pCloseRounded(h);

    const content = (
      <g>
        {blockHeader(p, w, "between", S.between)}
        {expr.childIds.map((childId, i) => {
          const cn = state.nodes[childId];
          if (!cn || cn.expr.type !== "state") return null;
          return renderSnappedChild(
            childId,
            { x: PAD + i * SW + SW / 2, y: h },
            renderDiamond(cn.expr.label),
          );
        })}
      </g>
    );
    return { w, content };
  }

  function renderFixedBlock(_parentId: string, expr: FixedExpr): RenderResult {
    const w = 80;
    const h = BLK_HDR + BODY_PAD;
    const pathD =
      pRoundedTop(w, h) +
      pVNotch(w / 2, DIAMOND_R, DIAMOND_R, h) +
      pCloseRounded(h);

    const content = (
      <g>
        {blockHeader(pathD, w, "fixed", S.fixed)}
        {expr.childId &&
          state.nodes[expr.childId] &&
          (() => {
            const cn = state.nodes[expr.childId!];
            if (cn.expr.type !== "state") return null;
            return renderSnappedChild(
              expr.childId!,
              { x: w / 2, y: h },
              renderDiamond(cn.expr.label),
            );
          })()}
      </g>
    );
    return { w, content };
  }

  function renderWithFloatingBlock(
    _parentId: string,
    expr: WithFloatingExpr,
  ): RenderResult {
    const MIN_W = 100;
    const h = BLK_HDR + BODY_PAD;
    const child =
      expr.childId && state.nodes[expr.childId]
        ? renderSpecBlock(expr.childId, state.nodes[expr.childId])
        : null;
    const nhw = child ? child.w / 2 : DEFAULT_NHW;
    const w = Math.max(MIN_W, nhw * 2 + SLOT_PAD * 2);
    const pathD =
      pRoundedTop(w, h) + pRectNotch(w / 2, nhw, NOTCH_D, h) + pCloseRounded(h);

    const content = (
      <g>
        {blockHeader(pathD, w, "withFloating", S.withFloating)}
        {child &&
          renderSnappedChild(
            expr.childId!,
            { x: w / 2 - child.w / 2, y: h - NOTCH_D },
            child.content,
          )}
      </g>
    );
    return { w, content };
  }

  function renderWSRBlock(
    parentId: string,
    expr: WithSnapRadiusExpr,
  ): RenderResult {
    const SLIDER_H = 40,
      MIN_W = 160;
    const h = BLK_HDR + SLIDER_H;
    const child =
      expr.childId && state.nodes[expr.childId]
        ? renderSpecBlock(expr.childId, state.nodes[expr.childId])
        : null;
    const nhw = child ? child.w / 2 : DEFAULT_NHW;
    const w = Math.max(MIN_W, nhw * 2 + SLOT_PAD * 2);
    const pathD =
      pRoundedTop(w, h) + pRectNotch(w / 2, nhw, NOTCH_D, h) + pCloseRounded(h);
    const trackX = SLOT_PAD;
    const trackW = w - SLOT_PAD * 2;
    const sliderY = BLK_HDR + SLIDER_H / 2;
    const knobX = trackX + (expr.radius / 30) * trackW;
    const parentDragged = draggedId === `n-${parentId}`;

    const content = (
      <g>
        {blockHeader(pathD, w, "withSnapRadius", S.wsr)}
        <line
          x1={trackX}
          y1={sliderY}
          x2={trackX + trackW}
          y2={sliderY}
          stroke="#ddd"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle
          id={`slider-${parentId}`}
          transform={translate(knobX, sliderY)}
          r={7}
          fill="#2563eb"
          stroke="white"
          strokeWidth={2}
          style={{ cursor: "ew-resize" }}
          dragologyZIndex={parentDragged ? 11 : 2}
          dragologyOnDrag={() =>
            d.vary(state, param("nodes", parentId, "expr", "radius"), {
              constraint: (s: State) => {
                const expr = s.nodes[parentId].expr as WithSnapRadiusExpr;
                return inOrder(0, expr.radius, 30);
              },
            })
          }
        />
        <text
          x={knobX}
          y={sliderY - 12}
          textAnchor="middle"
          fontSize={9}
          fill="#2563eb"
          fontWeight="500"
          pointerEvents="none"
        >
          {Math.round(expr.radius)}
        </text>
        {child &&
          renderSnappedChild(
            expr.childId!,
            { x: w / 2 - child.w / 2, y: h - NOTCH_D },
            child.content,
          )}
      </g>
    );
    return { w, content };
  }

  function renderClosestBlock(
    _parentId: string,
    expr: ClosestExpr,
  ): RenderResult {
    const PAD = 14,
      GAP = 8,
      EMPTY_NHW = 30,
      MAX_SLOTS = 6;
    const h = BLK_HDR + BODY_PAD;

    const slots = expr.childIds.length + 1;
    const children = expr.childIds.map((cid) => {
      const cn = state.nodes[cid];
      return cn ? renderSpecBlock(cid, cn) : null;
    });

    // Compute slot half-widths and centers
    const nhws: number[] = [];
    for (let i = 0; i < slots; i++)
      nhws.push(
        i < children.length ? children[i]!.w / 2 : i > 0 ? 16 : EMPTY_NHW,
      );

    let w = PAD * 2 + GAP * Math.max(0, slots - 1);
    for (const nhw of nhws) w += 2 * nhw;

    const centers: number[] = [];
    let cx = PAD;
    for (let i = 0; i < slots; i++) {
      cx += nhws[i];
      centers.push(cx);
      cx += nhws[i] + GAP;
    }

    let p = pRoundedTop(w, h);
    for (let i = MAX_SLOTS - 1; i >= 0; i--)
      p +=
        i < slots
          ? pRectNotch(centers[i], nhws[i], NOTCH_D, h)
          : pRectNotchCollapsed(w - R, h);
    p += pCloseRounded(h);

    const content = (
      <g>
        {blockHeader(p, w, "closest", S.closest)}
        {children.map((child, i) => {
          if (!child) return null;
          return renderSnappedChild(
            expr.childIds[i],
            { x: centers[i] - child.w / 2, y: h - NOTCH_D },
            child.content,
          );
        })}
      </g>
    );
    return { w, content };
  }

  function renderNode(nodeId: string, node: CanvasNode) {
    const isDragged = draggedId === `n-${nodeId}`;
    const inner =
      node.expr.type === "state"
        ? renderDiamond(node.expr.label)
        : (renderSpecBlock(nodeId, node)?.content ?? null);

    return (
      <g
        id={`n-${nodeId}`}
        key={nodeId}
        transform={translate(node)}
        dragologyZIndex={isDragged ? 10 : 0}
        dragologyOnDrag={() => {
          const base = detach(state, nodeId);
          return nodeDrag(d, base, nodeId);
        }}
      >
        {inner}
      </g>
    );
  }

  const activeSpecNode = state.nodes[ACTIVE_SPEC_ID];
  const activeSpecExpr = activeSpecNode.expr as ActiveSpecExpr;
  const previewDragSpec =
    activeSpecExpr.childId !== null && compileExpr(d, state, ACTIVE_SPEC_ID);

  // ── Active spec slot ──

  const activeChild =
    activeSpecExpr.childId && state.nodes[activeSpecExpr.childId]
      ? renderSpecBlock(
          activeSpecExpr.childId,
          state.nodes[activeSpecExpr.childId],
        )
      : null;
  const asNHW = activeChild ? activeChild.w / 2 : DEFAULT_NHW;
  const asW = Math.max(120, asNHW * 2 + SLOT_PAD * 2);
  const asH = BLK_HDR + BODY_PAD;
  const asPathD =
    pSquareTop(asW, asH) +
    pRectNotch(asW / 2, asNHW, NOTCH_D, asH) +
    pCloseFlat(asH);

  // ── Main render ──

  return (
    <g>
      {/* toolbar background */}
      <rect
        id="toolbar-bg"
        x={0}
        y={0}
        width={CANVAS_W}
        height={TOOLBAR_H}
        fill="#f9fafb"
        stroke="#e5e7eb"
        rx={0}
        dragologyZIndex={-10}
      />
      <line
        x1={0}
        y1={TOOLBAR_H}
        x2={CANVAS_W}
        y2={TOOLBAR_H}
        stroke="#e5e7eb"
      />

      {/* toolbar group labels */}
      {toolbarGroupPositions.map((group) => (
        <text
          key={group.title}
          x={group.x}
          y={14}
          fontSize={9}
          fill="#aaa"
          fontWeight="500"
        >
          {group.title}
        </text>
      ))}

      {/* toolbar items */}
      {toolbarDefs.map((t) => (
        <g
          id={`tb-${t.label}`}
          key={t.label}
          transform={translate(
            Vec2(t.x, TOOLBAR_H / 2 + 7).add(
              t.makeExpr().type !== "state" ? Vec2(-t.hw, -12) : Vec2(0),
            ),
          )}
          dragologyOnDrag={() => {
            const nid = makeId();
            const ns = produce(state, (draft) => {
              draft.nodes[nid] = { expr: t.makeExpr(), x: 0, y: 0 };
            });
            return d.switchToStateAndFollow(
              ns,
              `n-${nid}`,
              nodeDrag(d, ns, nid),
            );
          }}
        >
          {t.preview}
        </g>
      ))}

      {/* trash bin */}
      <g
        id="trash-bin"
        transform={translate(CANVAS_W - LEFT_PAD - 16, TOOLBAR_H / 2)}
      >
        <rect
          x={-16}
          y={-16}
          width={32}
          height={32}
          rx={6}
          fill="#fee2e2"
          stroke="#fca5a5"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16}
          pointerEvents="none"
        >
          {"\u{1F5D1}"}
        </text>
      </g>

      {/* active spec slot */}
      <g transform={translate(0, TOOLBAR_H)}>
        {blockHeader(asPathD, asW, "active spec", S.activeSpec)}
        {activeChild &&
          renderSnappedChild(
            activeSpecExpr.childId!,
            { x: asW / 2 - activeChild.w / 2, y: asH - NOTCH_D },
            activeChild.content,
          )}
      </g>

      {/* preview box */}
      <g transform={translate(PV_X, PV_Y)}>
        <rect
          width={PV_W}
          height={PV_H}
          rx={8}
          fill="white"
          stroke="#e5e7eb"
          strokeWidth={1.5}
        />
        <text
          x={PV_W / 2}
          y={14}
          textAnchor="middle"
          fontSize={9}
          fill="#aaa"
          fontWeight="500"
        >
          PREVIEW
        </text>
        {(["A", "B", "C"] as const).map((l) => (
          <g key={l} transform={translate(PV_DOTS[l])}>
            <circle r={PV_DOT_R} fill={STATE_FILL[l]} opacity={0.25} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontWeight="700"
              fill={STATE_FILL[l]}
              pointerEvents="none"
            >
              {l}
            </text>
          </g>
        ))}
        <circle
          id="preview-dot"
          transform={translate(PV_DOTS[state.previewDot])}
          r={PV_DOT_R}
          fill={STATE_FILL[state.previewDot]}
          stroke="white"
          strokeWidth={2}
          dragologyOnDrag={previewDragSpec && (() => previewDragSpec)}
        />
      </g>

      {/* canvas nodes (only free / non-snapped ones) */}
      {Object.entries(state.nodes)
        .filter(([id]) => !snappedIds.has(id))
        .map(([id, node]) => renderNode(id, node))}
    </g>
  );
};

// ─── Export ───

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={CANVAS_W}
      height={CANVAS_H}
    />
  ),
  {
    tags: [
      "d.switchToStateAndFollow",
      "d.between",
      "d.vary [constraint]",
      "d.fixed",
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
      "d.dropTarget",
      "d.withSnapRadius",
    ],
  },
);
