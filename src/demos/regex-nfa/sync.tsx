// Regex ↔ NFA synchronized editor.
//
// The regex is shown as a draggable AST (nested boxes). Every drag on the
// AST re-derives a Thompson-construction NFA laid out left to right; since
// NFA states and edges get ids derived from AST node ids, the NFA fragments
// slide and re-wire as you drag. Below that: the set of short strings the
// regex matches, and (optionally) the DFA from subset construction.

import { produce } from "immer";
import { arrowhead } from "../../arrows";
import { demo } from "../../demo";
import { DemoDraggable, DemoNotes } from "../../demo/ui";
import { Draggable, OnDragCallback } from "../../draggable";
import { DragSpecBuilder } from "../../DragSpec";
import { Vec2 } from "../../math/vec2";
import { Svgx } from "../../svgx";
import { path, translate } from "../../svgx/helpers";
import {
  allStrings,
  alt,
  buildDfa,
  buildNfa,
  cat,
  chr,
  DFA_R,
  findNode,
  freshId,
  Nfa,
  NFA_R,
  NfaEdge,
  nfaMatches,
  Node,
  placementTargets,
  regexToString,
  removeNode,
  star,
  starrableNodes,
  subtreeIds,
  unwrapStar,
  wrapInStar,
} from "./regex";

// # State

type Brush = { key: string; kind: "char" | "star"; char?: string };

type State = {
  root: Node | null;
  brushes: Brush[];
  voided?: Node; // node being dragged into the trash (rendered hidden there)
  voidedStar?: string; // id of a star whose badge is being dragged into the trash
  showDfa: boolean;
};

const ALPHABET = ["a", "b"];
const MAX_TEST_LEN = 4;

const initialState: State = {
  root: cat(
    "n-root",
    star("n-star", alt("n-alt", chr("n-a1", "a"), chr("n-b1", "b"))),
    chr("n-a2", "a"),
    chr("n-b2", "b"),
  ),
  brushes: [
    { key: "brush-a", kind: "char", char: "a" },
    { key: "brush-b", kind: "char", char: "b" },
    { key: "brush-star", kind: "star" },
  ],
  showDfa: false,
};

// # Layout constants

const PALETTE_X = 14;
const AST_X = 72;
const TOP_Y = 44;
const CH = 26; // char box size
const PAD = 5;
const GAP = 5;
const ALT_LABEL_W = 12;
const STAR_BADGE_W = 14;
const STAR_BADGE_H = 16;
const BRUSH_STEP = 38;
const TRASH_R = 15;
const NFA_X = 64;
const HEAD_LEN = 8;

const HIGHLIGHT = "#f59e0b";

// # AST rendering

type RenderOpts = {
  rootTransform?: string;
  rootDragology?: OnDragCallback<State>;
  interactive: boolean; // attach drags to nodes and star badges
  isRoot?: boolean;
  depth?: number;
  opacity?: number;
};

function starBadge(
  id: string,
  opts: {
    transform?: string;
    onDrag?: OnDragCallback<State>;
    highlighted?: boolean;
    opacity?: number;
  },
): Svgx {
  return (
    <g
      id={id}
      transform={opts.transform}
      dragologyOnDrag={opts.onDrag}
      opacity={opts.opacity}
      style={{ cursor: opts.onDrag ? "grab" : undefined }}
    >
      <rect
        width={STAR_BADGE_W}
        height={STAR_BADGE_H}
        rx={4}
        fill={opts.highlighted ? HIGHLIGHT : "#fed7aa"}
        stroke={opts.highlighted ? "#b45309" : "#fdba74"}
      />
      <text
        transform={translate(STAR_BADGE_W / 2, STAR_BADGE_H / 2 + 3)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={17}
        fontWeight="bold"
        fill={opts.highlighted ? "white" : "#c2410c"}
        pointerEvents="none"
      >
        *
      </text>
    </g>
  );
}

function makeRenderer(
  state: State,
  d: DragSpecBuilder<State>,
  highlight: Set<string>,
) {
  function makeMoveDrag(node: Node): OnDragCallback<State> {
    return () => {
      const without: State = {
        ...state,
        root: removeNode(state.root, node.id),
        voided: undefined,
        voidedStar: undefined,
      };
      const ids = { concat: freshId("g"), alt: freshId("g") };
      const targets = placementTargets(without.root, node, ids).map(
        (root): State => ({ ...without, root }),
      );
      const erase: State = { ...without, voided: node };
      return d
        .closest([
          d.closest([state, ...targets]).withFloating(),
          d.fixed(erase).withFloating().onDrop(without),
        ])
        .whenFar(d.fixed(without).withFloating().onDrop(state));
    };
  }

  function makeStarBadgeDrag(starNode: Node): OnDragCallback<State> {
    return () => {
      const child = starNode.children[0];
      const unwrapped: State = {
        ...state,
        root: unwrapStar(state.root, starNode.id),
        voided: undefined,
        voidedStar: undefined,
      };
      const targets = starrableNodes(unwrapped.root)
        .filter((y) => y.id !== child.id)
        .map(
          (y): State => ({
            ...unwrapped,
            root: wrapInStar(unwrapped.root, y.id, starNode.id),
          }),
        );
      const erase: State = { ...unwrapped, voidedStar: starNode.id };
      return d
        .closest([
          d.closest([state, ...targets]).withFloating(),
          d.fixed(erase).withFloating().onDrop(unwrapped),
        ])
        .whenFar(d.fixed(unwrapped).withFloating().onDrop(state));
    };
  }

  function renderNode(
    node: Node,
    opts: RenderOpts,
  ): { element: Svgx; w: number; h: number } {
    const depth = opts.depth ?? 0;
    const childOpts: RenderOpts = {
      interactive: opts.interactive,
      depth: depth + 1,
    };
    const hl = highlight.has(node.id);
    const canDrag = opts.interactive && !opts.isRoot;
    const onDrag =
      opts.rootDragology ?? (canDrag ? makeMoveDrag(node) : undefined);

    let w: number;
    let h: number;
    let body: Svgx[];

    switch (node.kind) {
      case "char": {
        w = CH;
        h = CH;
        body = [
          <rect
            width={w}
            height={h}
            rx={6}
            fill={hl ? "#fef3c7" : "white"}
            stroke={hl ? HIGHLIGHT : "#94a3b8"}
          />,
          <text
            transform={translate(w / 2, h / 2)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fontFamily="ui-monospace, monospace"
            fill="#1e293b"
            pointerEvents="none"
          >
            {node.char}
          </text>,
        ];
        break;
      }
      case "concat": {
        const kids = node.children.map((c) => renderNode(c, childOpts));
        const maxH = Math.max(...kids.map((k) => k.h));
        w =
          PAD * 2 + kids.reduce((a, k) => a + k.w, 0) + GAP * (kids.length - 1);
        h = PAD * 2 + maxH;
        let x = PAD;
        const placed = kids.map((k) => {
          const el = (
            <g transform={translate(x, PAD + (maxH - k.h) / 2)}>{k.element}</g>
          );
          x += k.w + GAP;
          return el;
        });
        body = [
          <rect
            width={w}
            height={h}
            rx={8}
            fill={hl ? "rgba(245,158,11,0.08)" : "rgba(100,116,139,0.05)"}
            stroke={hl ? HIGHLIGHT : "#cbd5e1"}
          />,
          ...placed,
        ];
        break;
      }
      case "alt": {
        const kids = node.children.map((c) => renderNode(c, childOpts));
        const maxW = Math.max(...kids.map((k) => k.w));
        w = PAD * 2 + ALT_LABEL_W + GAP + maxW;
        h =
          PAD * 2 + kids.reduce((a, k) => a + k.h, 0) + GAP * (kids.length - 1);
        let y = PAD;
        const placed = kids.map((k) => {
          const el = (
            <g
              transform={translate(
                PAD + ALT_LABEL_W + GAP + (maxW - k.w) / 2,
                y,
              )}
            >
              {k.element}
            </g>
          );
          y += k.h + GAP;
          return el;
        });
        body = [
          <rect
            width={w}
            height={h}
            rx={8}
            fill={hl ? "rgba(245,158,11,0.08)" : "rgba(167,139,250,0.10)"}
            stroke={hl ? HIGHLIGHT : "#a78bfa"}
          />,
          <text
            transform={translate(PAD + ALT_LABEL_W / 2, h / 2)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fontWeight="bold"
            fill="#7c3aed"
            pointerEvents="none"
          >
            |
          </text>,
          ...placed,
        ];
        break;
      }
      case "star": {
        const kid = renderNode(node.children[0], childOpts);
        w = PAD * 2 + kid.w + GAP + STAR_BADGE_W;
        h = PAD * 2 + kid.h;
        body = [
          <rect
            width={w}
            height={h}
            rx={8}
            fill={hl ? "rgba(245,158,11,0.08)" : "rgba(251,146,60,0.08)"}
            stroke={hl ? HIGHLIGHT : "#fdba74"}
          />,
          <g transform={translate(PAD, PAD)}>{kid.element}</g>,
          starBadge(`${node.id}-star`, {
            transform: translate(PAD + kid.w + GAP, PAD),
            onDrag: opts.interactive ? makeStarBadgeDrag(node) : undefined,
            highlighted: hl,
          }),
        ];
        break;
      }
    }

    const element = (
      <g
        id={node.id}
        transform={opts.rootTransform}
        dragologyOnDrag={onDrag}
        dragologyZIndex={depth}
        opacity={opts.opacity}
        style={{ cursor: onDrag ? "grab" : undefined }}
      >
        {body}
      </g>
    );
    return { element, w, h };
  }

  return renderNode;
}

// # NFA edge geometry

function edgeGeometry(e: NfaEdge, p: Vec2, q: Vec2, originY: number) {
  const R = NFA_R;
  if (e.kind === "straight") {
    const dir = q.sub(p).norm();
    const start = p.add(dir.mul(R));
    const tip = q.sub(dir.mul(R));
    const end = tip.sub(dir.mul(HEAD_LEN));
    return {
      d: path("M", start, "L", end),
      tip,
      dir,
      labelPos: p.mid(q).add(Vec2(0, e.label ? -9 : -7)),
    };
  } else if (e.kind === "curve") {
    const start = p.add(Vec2(R, 0));
    const tip = q.sub(Vec2(R, 0));
    const end = tip.sub(Vec2(HEAD_LEN, 0));
    const mx = (start.x + end.x) / 2;
    return {
      d: path("M", start, "C", Vec2(mx, start.y), Vec2(mx, end.y), end),
      tip,
      dir: Vec2(1, 0),
      labelPos: Vec2(mx, (start.y + end.y) / 2 - 6),
    };
  } else {
    const b = e.bulge! + originY;
    const sign = b < p.y ? -1 : 1;
    const start = p.add(Vec2(0, sign * R));
    const tip = q.add(Vec2(0, sign * R));
    const end = tip.add(Vec2(0, sign * HEAD_LEN));
    const c1 = Vec2(p.x, b);
    const c2 = Vec2(q.x, b);
    const apexY = (start.y + 3 * b + 3 * b + end.y) / 8;
    return {
      d: path("M", start, "C", c1, c2, end),
      tip,
      dir: Vec2(0, -sign),
      labelPos: Vec2((p.x + q.x) / 2, apexY + sign * 7),
    };
  }
}

function renderNfa(
  nfa: Nfa,
  origin: Vec2,
  highlight: Set<string>,
  draggedId: string | null,
): Svgx {
  const pos = new Map(
    nfa.states.map((s) => [s.id, origin.add(Vec2(s.x, s.y))]),
  );
  const startPos = pos.get(nfa.start)!;
  return (
    <g>
      {/* start arrow */}
      <g id="nfa-start" transform={translate(startPos)}>
        <line
          x1={-NFA_R - 24}
          y1={0}
          x2={-NFA_R - HEAD_LEN}
          y2={0}
          stroke="#475569"
          strokeWidth={1.2}
        />
        {arrowhead({
          tip: Vec2(-NFA_R, 0),
          direction: Vec2(1, 0),
          headLength: HEAD_LEN,
          headAngleRad: Math.PI / 3.5,
          fill: "#475569",
        })}
      </g>
      {nfa.edges.map((e) => {
        const p = pos.get(e.from)!;
        const q = pos.get(e.to)!;
        const geo = edgeGeometry(e, p, q, origin.y);
        const hl = highlight.has(e.owner);
        const isChar = e.label !== null;
        const color = hl ? HIGHLIGHT : isChar ? "#1e293b" : "#94a3b8";
        return (
          <g id={e.id} dragologyZIndex={hl ? 2 : 0}>
            <path
              d={geo.d}
              fill="none"
              stroke={color}
              strokeWidth={hl ? 2 : isChar ? 1.5 : 1}
              strokeDasharray={isChar ? undefined : "3 3"}
            />
            {arrowhead({
              tip: geo.tip,
              direction: geo.dir,
              headLength: HEAD_LEN,
              headAngleRad: Math.PI / 3.5,
              fill: color,
            })}
            <text
              transform={translate(geo.labelPos)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={isChar ? 13 : 10}
              fontFamily="ui-monospace, monospace"
              fontWeight={isChar ? "bold" : "normal"}
              fill={hl ? "#b45309" : isChar ? "#1e293b" : "#94a3b8"}
              stroke="white"
              strokeWidth={3}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {isChar ? e.label : "ε"}
            </text>
          </g>
        );
      })}
      {nfa.states.map((s) => {
        const hl = highlight.has(s.owner);
        const isAccept = s.id === nfa.accept;
        return (
          <g
            id={s.id}
            transform={translate(pos.get(s.id)!)}
            dragologyZIndex={hl ? 3 : 1}
          >
            <circle
              r={NFA_R}
              fill={hl ? "#fef3c7" : "white"}
              stroke={hl ? HIGHLIGHT : "#475569"}
              strokeWidth={1.5}
            />
            <circle
              r={NFA_R - 3}
              fill="none"
              stroke={hl ? HIGHLIGHT : "#475569"}
              strokeWidth={1.5}
              opacity={isAccept ? 1 : 0}
            />
          </g>
        );
      })}
      {draggedId === null ? null : null}
    </g>
  );
}

// # Match set

const TEST_STRINGS = allStrings(ALPHABET, MAX_TEST_LEN);

function renderMatchSet(nfa: Nfa, origin: Vec2): { element: Svgx; h: number } {
  const CHIP_H = 20;
  const ROW_GAP = 6;
  const CHIP_GAP = 5;
  const rows = TEST_STRINGS.map((strs, len) => {
    const chipW = Math.max(20, 8 * len + 8);
    const y = len * (CHIP_H + ROW_GAP);
    return strs.map((s, i) => {
      const ok = nfaMatches(nfa, s);
      return (
        <g
          id={`match-${s || "empty"}`}
          transform={translate(origin.add(Vec2(i * (chipW + CHIP_GAP), y)))}
        >
          <rect
            width={chipW}
            height={CHIP_H}
            rx={5}
            fill={ok ? "#bbf7d0" : "#f1f5f9"}
            stroke={ok ? "#22c55e" : "#e2e8f0"}
          />
          <text
            transform={translate(chipW / 2, CHIP_H / 2)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontFamily="ui-monospace, monospace"
            fill={ok ? "#166534" : "#cbd5e1"}
            pointerEvents="none"
          >
            {s || "ε"}
          </text>
        </g>
      );
    });
  });
  return {
    element: <g>{rows.flat()}</g>,
    h: TEST_STRINGS.length * (CHIP_H + ROW_GAP) - ROW_GAP,
  };
}

// # DFA

function renderDfa(nfa: Nfa, origin: Vec2): { element: Svgx; h: number } {
  const dfa = buildDfa(nfa, ALPHABET);
  const pos = new Map(
    dfa.states.map((s) => [s.id, origin.add(Vec2(s.x, s.y))]),
  );
  const startPos = pos.get(dfa.start)!;
  return {
    h: dfa.h,
    element: (
      <g>
        <g id="dfa-start-arrow" transform={translate(startPos)}>
          <line
            x1={-DFA_R - 24}
            y1={0}
            x2={-DFA_R - HEAD_LEN}
            y2={0}
            stroke="#475569"
            strokeWidth={1.2}
          />
          {arrowhead({
            tip: Vec2(-DFA_R, 0),
            direction: Vec2(1, 0),
            headLength: HEAD_LEN,
            headAngleRad: Math.PI / 3.5,
            fill: "#475569",
          })}
        </g>
        {dfa.edges.map((e) => {
          const p = pos.get(e.from)!;
          const q = pos.get(e.to)!;
          let dPath: string;
          let tip: Vec2;
          let dir: Vec2;
          let labelPos: Vec2;
          if (e.from === e.to) {
            // self loop above the state
            const start = p.add(Vec2(-5, -DFA_R + 1));
            tip = p.add(Vec2(5, -DFA_R + 1));
            dir = Vec2(0.4, 1).norm();
            const end = tip.sub(dir.mul(HEAD_LEN));
            dPath = path(
              "M",
              start,
              "C",
              p.add(Vec2(-22, -DFA_R - 30)),
              p.add(Vec2(22, -DFA_R - 30)),
              end,
            );
            labelPos = p.add(Vec2(0, -DFA_R - 30));
          } else {
            const backward = q.x < p.x;
            const d0 = q.sub(p);
            const dist = d0.len();
            const dirPQ = d0.norm();
            // bow backward edges (and edges between vertically aligned states) so they don't overlap
            const bow = backward ? -0.35 * dist : 0;
            const normal = Vec2(-dirPQ.y, dirPQ.x);
            const ctrl = p.mid(q).add(normal.mul(bow));
            const start = p.add(ctrl.sub(p).norm().mul(DFA_R));
            tip = q.add(ctrl.sub(q).norm().mul(DFA_R));
            dir = tip.sub(ctrl).norm();
            const end = tip.sub(dir.mul(HEAD_LEN));
            dPath = path("M", start, "Q", ctrl, end);
            // quadratic midpoint
            const mid = start.mul(0.25).add(ctrl.mul(0.5)).add(end.mul(0.25));
            labelPos = mid.add(normal.mul(backward ? -8 : 8));
          }
          return (
            <g id={e.id}>
              <path d={dPath} fill="none" stroke="#1e293b" strokeWidth={1.5} />
              {arrowhead({
                tip,
                direction: dir,
                headLength: HEAD_LEN,
                headAngleRad: Math.PI / 3.5,
                fill: "#1e293b",
              })}
              <text
                transform={translate(labelPos)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
                fill="#1e293b"
                stroke="white"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {e.labels.join(",")}
              </text>
            </g>
          );
        })}
        {dfa.states.map((s) => (
          <g
            id={s.id}
            transform={translate(pos.get(s.id)!)}
            dragologyZIndex={1}
          >
            <circle r={DFA_R} fill="white" stroke="#475569" strokeWidth={1.5} />
            <circle
              r={DFA_R - 3}
              fill="none"
              stroke="#475569"
              strokeWidth={1.5}
              opacity={s.accept ? 1 : 0}
            />
          </g>
        ))}
      </g>
    ),
  };
}

// # Section label

function sectionLabel(id: string, text: string, pos: Vec2, extra?: Svgx): Svgx {
  return (
    <g id={id} transform={translate(pos)}>
      <text
        fontSize={11}
        fontWeight="bold"
        letterSpacing={1}
        fill="#94a3b8"
        dominantBaseline="central"
      >
        {text}
      </text>
      {extra}
    </g>
  );
}

// # Draggable

const draggable: Draggable<State> = ({ state, d, draggedId, setState }) => {
  // Highlight the AST subtree (and its NFA fragment) being dragged.
  const draggedNodeId = draggedId?.endsWith("-star")
    ? draggedId.slice(0, -"-star".length)
    : draggedId;
  const highlight = draggedNodeId
    ? subtreeIds(findNode(state.root, draggedNodeId) ?? null)
    : new Set<string>();

  const renderNode = makeRenderer(state, d, highlight);

  // -- Palette --
  const brushElements: Svgx[] = [];
  state.brushes.forEach((brush, i) => {
    const y = TOP_Y + i * BRUSH_STEP;
    if (brush.kind === "char") {
      const node = chr(brush.key, brush.char!);
      const onDrag: OnDragCallback<State> = () => {
        const without = produce(state, (draft) => {
          draft.brushes[i].key = freshId("brush");
          delete draft.voided;
          delete draft.voidedStar;
        });
        const ids = { concat: freshId("g"), alt: freshId("g") };
        const targets = placementTargets(state.root, node, ids).map(
          (root): State => ({ ...without, root }),
        );
        return d
          .closest(targets)
          .withFloating()
          .whenFar(d.fixed(state).withFloating());
      };
      brushElements.push(
        renderNode(node, {
          rootTransform: translate(PALETTE_X, y),
          rootDragology: onDrag,
          interactive: false,
        }).element,
      );
    } else {
      const onDrag: OnDragCallback<State> = () => {
        const without = produce(state, (draft) => {
          draft.brushes[i].key = freshId("brush");
          delete draft.voided;
          delete draft.voidedStar;
        });
        const targets = starrableNodes(state.root).map(
          (y): State => ({
            ...without,
            root: wrapInStar(state.root, y.id, brush.key),
          }),
        );
        return d
          .closest(targets)
          .withFloating()
          .whenFar(d.fixed(state).withFloating());
      };
      brushElements.push(
        starBadge(`${brush.key}-star`, {
          transform: translate(
            PALETTE_X + (CH - STAR_BADGE_W) / 2,
            y + (CH - STAR_BADGE_H) / 2,
          ),
          onDrag,
        }),
      );
    }
  });

  // -- Trash --
  const trashCenter = Vec2(
    PALETTE_X + CH / 2,
    TOP_Y + state.brushes.length * BRUSH_STEP + 14,
  );
  const trashActive =
    state.voided !== undefined || state.voidedStar !== undefined;

  // -- AST --
  const ast = state.root
    ? renderNode(state.root, {
        rootTransform: translate(AST_X, TOP_Y),
        interactive: true,
        isRoot: true,
      })
    : { element: <g />, w: 0, h: 0 };

  // -- NFA --
  const nfa = buildNfa(state.root);
  const paletteBottom = trashCenter.y + TRASH_R;
  const nfaLabelY = Math.max(TOP_Y + ast.h, paletteBottom) + 28;
  const nfaOrigin = Vec2(NFA_X, nfaLabelY + 16 + nfa.above);

  // -- Match set --
  const matchLabelY = nfaOrigin.y + nfa.below + 30;
  const matchSet = renderMatchSet(nfa, Vec2(PALETTE_X, matchLabelY + 16));

  // -- DFA --
  const dfaLabelY = matchLabelY + 16 + matchSet.h + 30;
  const dfa = state.showDfa
    ? renderDfa(nfa, Vec2(NFA_X, dfaLabelY + 56))
    : null;

  return (
    <g>
      <style>{`.regex-toggle { cursor: pointer; } .regex-toggle:hover text { fill: #475569; }`}</style>

      {/* Regex as text */}
      <text
        id="regex-text"
        transform={translate(PALETTE_X, 18)}
        fontSize={18}
        fontFamily="ui-monospace, monospace"
        fill="#0f172a"
        dominantBaseline="central"
      >
        {regexToString(state.root)}
      </text>

      {/* Palette */}
      {brushElements}

      {/* Trash */}
      <g id="trash" transform={translate(trashCenter)} dragologyZIndex={-1}>
        <circle
          r={TRASH_R}
          fill={trashActive ? "#fecaca" : "#f8fafc"}
          stroke={trashActive ? "#ef4444" : "#e2e8f0"}
          strokeDasharray={trashActive ? undefined : "3 2"}
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          pointerEvents="none"
          fill="#94a3b8"
        >
          🗑
        </text>
        {/* Hidden copies so the dragged element still exists in the "erase" preview */}
        {state.voided &&
          renderNode(state.voided, { interactive: false, opacity: 0 }).element}
        {state.voidedStar &&
          starBadge(`${state.voidedStar}-star`, { opacity: 0 })}
      </g>

      {/* AST */}
      {ast.element}

      {/* NFA */}
      {sectionLabel("nfa-label", "NFA (THOMPSON)", Vec2(PALETTE_X, nfaLabelY))}
      {renderNfa(nfa, nfaOrigin, highlight, draggedId)}

      {/* Match set */}
      {sectionLabel(
        "match-label",
        `MATCHES (STRINGS OVER {${ALPHABET.join(",")}} UP TO LENGTH ${MAX_TEST_LEN})`,
        Vec2(PALETTE_X, matchLabelY),
      )}
      {matchSet.element}

      {/* DFA toggle + DFA */}
      <g
        id="dfa-toggle"
        className="regex-toggle"
        transform={translate(PALETTE_X, dfaLabelY)}
        onClick={() =>
          setState({ ...state, showDfa: !state.showDfa }, { transition: 200 })
        }
      >
        <text
          fontSize={11}
          fontWeight="bold"
          letterSpacing={1}
          fill="#94a3b8"
          dominantBaseline="central"
        >
          {state.showDfa
            ? "▾ DFA (SUBSET CONSTRUCTION)"
            : "▸ DFA (SUBSET CONSTRUCTION)"}
        </text>
      </g>
      {dfa && dfa.element}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Drag AST boxes to reorder them or move them into/out of groups; drag
        letters and <b>*</b> from the palette onto the tree; drag a <b>*</b>{" "}
        badge to another box to move the star, or to the trash to unwrap. The
        NFA below is re-derived from the tree on every drag.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={820}
        height={820}
      />
    </div>
  ),
  {
    tags: [
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
      "spec.onDrop",
      "setState",
    ],
  },
);
