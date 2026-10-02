import { produce } from "immer";
import { ReactNode, useDeferredValue, useState } from "react";
import { demo } from "../../demo";
import { DemoDraggable, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { DragSpec, inOrder, param } from "../../DragSpec";
import { Vec2 } from "../../math/vec2";
import { path, rotateDeg, translate } from "../../svgx/helpers";
import { makeId } from "../../utils";
import {
  cursorIndex,
  deleteStock,
  End,
  equations,
  factor,
  factorText,
  fit,
  flowFormula,
  fmt,
  freshLabel,
  freshSymbol,
  isCloud,
  Link,
  Model,
  niceCeil,
  parseModel,
  Point,
  Run,
  Shape,
  SHAPE_PARAMS,
  SHAPES,
  simulate,
  STEPS,
  Stock,
  sweep,
  TAIL,
  tidy,
} from "./model";
import { COLORS, presets } from "./presets";

const W = 680;
const H = 640;
const DIAGRAM_W = 450;
const DIAGRAM_H = 320;
const SW = 104; // stock box
const SH = 50;
const CLOUD_R = 13;
const HEAD = 9; // flow arrowhead length
const PANEL_X = 470;
const CHART_TOP = 366;
const CHART_BOTTOM = 590;
const TX0 = 48; // time chart
const TX1 = 318;
const SX0 = 394; // long-run chart (drawn outside the draggable)
const SX1 = 664;
const T_SLIDER_Y = 624;

const INK = "#334155";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, monospace";
const HOVER = "#d97706";
const HOVER_BG = "#fef3c7";

// # Text

/**
 * `_x` and `^x` become sub- and superscripts. Each script gets a key
 * (a `dragologyKey`, or a React `key` outside the draggable) so that
 * interpolating between two labels pairs subscripts with subscripts.
 */
function rich(s: string, fontSize: number, keyProp = "dragologyKey") {
  const out: ReactNode[] = [];
  const re = /([_^])([A-Za-z0-9]+)/g;
  const count = { _: 0, "^": 0 };
  let last = 0;
  let match;
  while ((match = re.exec(s))) {
    if (match.index > last) out.push(s.slice(last, match.index));
    const kind = match[1] as "_" | "^";
    out.push(
      <tspan
        {...{ [keyProp]: `${kind}${count[kind]++}` }}
        baselineShift={kind === "_" ? "sub" : "super"}
        fontSize={0.75 * fontSize}
        fontStyle="normal"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {match[2]}
      </tspan>,
    );
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// # Geometry

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Where the ray from a stock's center toward `toward` leaves its box. */
function boundary(s: Point, toward: Vec2, pad = 0): Vec2 {
  const c = Vec2(s);
  const dv = toward.sub(c);
  if (dv.len() < 1e-6) return c;
  const t = Math.min(
    (SW / 2 + pad) / Math.max(Math.abs(dv.x), 1e-9),
    (SH / 2 + pad) / Math.max(Math.abs(dv.y), 1e-9),
  );
  return c.add(dv.mul(Math.min(t, 1)));
}

/** `v` scaled to length `len`, or zero if `v` is. */
const withLen = (v: Vec2, len: number) =>
  v.len() > 1e-6 ? v.withLen(len) : Vec2(0, 0);

const endCenter = (m: Model, e: End) => Vec2(isCloud(e) ? e : m.stocks[e]);

function flowGeom(m: Model, fid: string) {
  const f = m.flows[fid];
  const A = endCenter(m, f.from);
  const B = endCenter(m, f.to);
  const dir = B.dist(A) > 1e-6 ? B.sub(A).norm() : Vec2(1, 0);
  const P = isCloud(f.from)
    ? A.add(dir.mul(CLOUD_R))
    : boundary(m.stocks[f.from], B);
  const Q = isCloud(f.to)
    ? B.sub(dir.mul(CLOUD_R + 2))
    : boundary(m.stocks[f.to], A, 2);
  return {
    dir,
    P,
    Q,
    // valves sit out toward a cloud, where fanned-out pipes have spread
    M: P.lerp(
      Q,
      isCloud(f.from) === isCloud(f.to) ? 0.5 : isCloud(f.to) ? 0.6 : 0.4,
    ),
    /** where each end's handle sits */
    ends: { from: isCloud(f.from) ? A : P, to: isCloud(f.to) ? B : Q },
  };
}

function linkGeom(m: Model, lid: string) {
  const l = m.links[lid];
  const attached = typeof l.to === "string";
  const target = typeof l.to === "string" ? flowGeom(m, l.to).M : Vec2(l.to);
  const start = boundary(m.stocks[l.from], target);
  const chord = target.sub(start);
  // A link into a flow out of (or into) its own stock would run along
  // the pipe, so it arcs up (or left, for a steep pipe) and clear of it.
  const flow = typeof l.to === "string" ? m.flows[l.to] : null;
  const own = flow && (flow.from === l.from || flow.to === l.from);
  let side = chord.len() > 1e-6 ? chord.perp().norm() : Vec2(0, -1);
  if (own) {
    const steep = Math.abs(chord.y) > Math.abs(chord.x);
    if (steep ? side.x > 0 : side.y > 0) side = side.mul(-1);
  }
  // parallel links (same stock, same flow) bow out progressively more
  const twin = Object.entries(m.links)
    .filter(([, o]) => o.from === l.from && o.to === l.to)
    .findIndex(([id]) => id === lid);
  const bow = 1 + Math.max(twin, 0);
  const ctrl = start
    .mid(target)
    .add(
      own
        ? side.mul(bow * Math.max(30, 0.45 * chord.len()))
        : side.mul(-0.3 * bow * chord.len()),
    );
  const end = attached ? target.sub(withLen(target.sub(ctrl), 13)) : target;
  return {
    start,
    ctrl,
    end,
    dir: end.sub(ctrl),
    mid: start.mul(0.25).add(ctrl.mul(0.5), end.mul(0.25)),
  };
}

type Row = { sid: string; top: number; bottom: number };

function chartRows(m: Model): Row[] {
  const ids = Object.keys(m.stocks);
  const gap = 8;
  const h = (CHART_BOTTOM - CHART_TOP - gap * (ids.length - 1)) / ids.length;
  return ids.map((sid, i) => ({
    sid,
    top: CHART_TOP + i * (h + gap),
    bottom: CHART_TOP + i * (h + gap) + h,
  }));
}

/** Curves are clipped to their row; draggable handles pass `clipped = false` (see `sliderX`). */
function yOf(s: Stock, row: Row, v: number, clipped = true): number {
  const [lo, hi] = s.scale;
  let f = (v - lo) / (hi - lo);
  if (clipped) f = clamp(f, -0.03, 1.03);
  return row.bottom - f * (row.bottom - row.top);
}

const xOfT = (i: number) => TX0 + (i / STEPS) * (TX1 - TX0);

// (Not clamped: a knob dragged past the end of its track should keep
// moving with its value, or the optimizer, seeing no movement there,
// gets stuck at the end.)
function sliderX(v: number, min: number, max: number, x0: number, x1: number) {
  return x0 + (max > min ? (v - min) / (max - min) : 0) * (x1 - x0);
}

/** Params in the order the panel lists them. */
function paramOrder(m: Model): string[] {
  const out: string[] = [];
  const add = (p?: string) => {
    if (p && m.params[p] && !out.includes(p)) out.push(p);
  };
  for (const s of Object.values(m.stocks)) {
    add(s.init);
    add(s.volume);
  }
  for (const [fid, f] of Object.entries(m.flows)) {
    add(f.rate);
    for (const l of Object.values(m.links))
      if (l.to === fid) l.params.forEach(add);
  }
  Object.keys(m.params).forEach(add);
  return out;
}

function addParam(
  m: Model,
  label: string,
  value: number,
  min: number,
  max: number,
): string {
  const id = makeId();
  m.params[id] = { label, value, min, max };
  return id;
}

/** A glyph of each shape's response curve, in a 20×12 box. */
const GLYPH_PARAMS: Record<Shape, [number[], number]> = {
  // [params, scale] for x in [0, 1]
  linear: [[], 1],
  threshold: [[0.4], 0.6],
  gap: [[0.6], 1],
  saturating: [[0.15], 1],
  crowding: [[0.8], 1],
  repression: [[0.4, 3], 1],
};
const shapeGlyph = Object.fromEntries(
  SHAPES.map((shape) => {
    const [p, scale] = GLYPH_PARAMS[shape];
    const pts = Array.from({ length: 21 }, (_, i) => {
      const y = factor(shape, i / 20, p) / scale;
      return Vec2(-10 + i, 6 - 12 * clamp(y, -0.4, 1));
    });
    return [
      shape,
      path("M", ...pts.flatMap((pt, i) => (i ? ["L", pt] : [pt]))),
    ];
  }),
) as Record<Shape, string>;

const SHAPE_BLURBS: Record<Shape, string> = {
  linear: "grows in proportion to {x}",
  threshold: "zero until {x} passes {a}, then grows in proportion",
  gap: "positive below {a}, negative above it (the flow reverses)",
  saturating: "grows with {x} but levels off at 1; halfway there at {x} = {a}",
  crowding: "1 when {x} is 0, falling to 0 as {x} reaches {a}",
  repression:
    "1 while {x} is low, falling toward 0 once {x} passes {a}; more steeply for larger {b}",
};

function shapeTooltip(m: Model, l: Link): string {
  const names: Record<string, string> = {
    x: m.stocks[l.from]?.symbol ?? "?",
    a: m.params[l.params[0]]?.label ?? "",
    b: m.params[l.params[1]]?.label ?? "",
  };
  // (a tooltip is plain text: Q_L reads as QL, but x^n keeps its caret)
  const plain = (t: string) => t.replace(/_/g, "");
  const blurb = SHAPE_BLURBS[l.shape].replace(/\{(\w)\}/g, (_, k) =>
    plain(names[k]),
  );
  return `${l.shape}: ${plain(factorText(m, l))}\n${blurb}\n(click for the next shape, shift-click for the previous)`;
}

const cloudPath =
  "M-9,6 A5,5 0 0 1 -10,-2 A6,6 0 0 1 -2,-8 A6,6 0 0 1 8,-5 A5,5 0 0 1 9,6 Z";

// # The draggable

const NO_RUN: Run = { values: {}, rates: {}, diverged: false };

const draggable: Draggable<Model> = ({
  state: m,
  d,
  draggedId,
  setState,
  isTracking,
}) => {
  // The optimizer renders many candidate states per frame just to see
  // where the dragged element lands. Those renders skip the simulation
  // (it doesn't move anything draggable), and draw just the dragged
  // element's item when it's one of those below.
  const run = isTracking ? NO_RUN : simulate(m);
  const ci = cursorIndex(m, run);
  const valueAt = (sid: string) => {
    const vs = run.values[sid] ?? [0];
    return vs[Math.min(ci, vs.length - 1)];
  };
  const rows = chartRows(m);

  // ## Specs

  const trashing = /^(stock|valve|end)-/.test(draggedId ?? "");

  const deleteFlow = (fid: string) =>
    tidy(
      produce(m, (draft) => {
        delete draft.flows[fid];
      }),
    );

  const moveStock = (sid: string) =>
    d.dropTarget("trash", deleteStock(m, sid)).whenFar(
      d.vary(m, [param("stocks", sid, "x"), param("stocks", sid, "y")], {
        constraint: (s) => [
          inOrder([SW / 2, s.stocks[sid].x, DIAGRAM_W - SW / 2]),
          inOrder([SH / 2, s.stocks[sid].y, DIAGRAM_H - SH / 2]),
        ],
      }),
    );

  /** Drag a flow's end onto a stock, leave it in a cloud, or drop it in the trash. */
  const moveEnd = (fid: string, which: "from" | "to"): DragSpec<Model> => {
    const f = m.flows[fid];
    const other = which === "from" ? f.to : f.from;
    const setEnd = (e: End) =>
      produce(m, (draft) => {
        draft.flows[fid][which] = e;
      });
    const p = flowGeom(m, fid).ends[which];
    const free = d.varyFunc([p.x, p.y], ([x, y]) => setEnd({ x, y }));
    const targets = Object.keys(m.stocks)
      .filter((s) => s !== other)
      .map((s) => d.dropTarget(`stock-body-${s}`, setEnd(s)));
    return d
      .closest([...targets, d.dropTarget("trash", deleteFlow(fid))])
      .whenFar(free, { gap: 4 });
  };

  /** Drag a valve to the trash, or move whichever ends are clouds. */
  const moveValve = (fid: string) => {
    const f = m.flows[fid];
    const clouds = (["from", "to"] as const).filter((w) => isCloud(f[w]));
    const move = clouds.length
      ? d.varyFunc([0, 0], ([dx, dy]) =>
          produce(m, (draft) => {
            for (const w of clouds) {
              const e = f[w] as Point;
              draft.flows[fid][w] = { x: e.x + dx, y: e.y + dy };
            }
          }),
        )
      : d.fixed(m);
    return d.dropTarget("trash", deleteFlow(fid)).whenFar(move);
  };

  /** Drag a link's head onto a valve; dropped anywhere else, it's gone. */
  const moveLinkHead = (lid: string): DragSpec<Model> => {
    const setTo = (to: string | Point) =>
      produce(m, (draft) => {
        draft.links[lid].to = to;
      });
    const p = linkGeom(m, lid).end;
    const free = d.varyFunc([p.x, p.y], ([x, y]) => setTo({ x, y }));
    const targets = Object.keys(m.flows).map((fid) =>
      d.dropTarget(`valve-hit-${fid}`, setTo(fid)),
    );
    return (
      targets.length ? d.closest(targets).whenFar(free, { gap: 4 }) : free
    ).onDrop(tidy);
  };

  const newFlow = (sid: string, dir: "in" | "out") => {
    const s = m.stocks[sid];
    const fid = makeId();
    const pos = { x: s.x + (dir === "out" ? SW / 2 : -SW / 2), y: s.y };
    const next = produce(m, (draft) => {
      const vol = s.volume ? m.params[s.volume].value : 1;
      // out: drains the stock over about a third of the run;
      // in: fills it about that fast
      const k = (3 / m.T) * vol * (dir === "out" ? 1 : s.scale[1] / 2) || 1;
      const rate = addParam(
        draft,
        freshLabel(draft, "k"),
        k,
        0,
        niceCeil(4 * k),
      );
      if (dir === "out") {
        draft.flows[fid] = { name: "outflow", from: sid, to: pos, rate };
        draft.links[makeId()] = {
          from: sid,
          to: fid,
          shape: "linear",
          params: [],
        };
      } else {
        draft.flows[fid] = { name: "inflow", from: pos, to: sid, rate };
      }
    });
    // (the new end sits right under the pointer)
    return d
      .switchToStateAndFollow(
        next,
        `end-${fid}-${dir === "out" ? "to" : "from"}`,
      )
      .withInitContext({ anchorPos: Vec2(0) });
  };

  const newLink = (sid: string) => {
    const s = m.stocks[sid];
    const lid = makeId();
    const next = produce(m, (draft) => {
      draft.links[lid] = {
        from: sid,
        to: { x: s.x, y: s.y - SH / 2 - 10 },
        shape: "linear",
        params: [],
      };
    });
    return d
      .switchToStateAndFollow(next, `link-head-${lid}`)
      .withInitContext({ anchorPos: Vec2(0) });
  };

  const newStock = () => {
    const sid = makeId();
    const next = produce(m, (draft) => {
      const symbol = freshSymbol(m);
      draft.stocks[sid] = {
        name: `Stock ${symbol}`,
        symbol,
        x: SW / 2 + 8,
        y: SH / 2 + 8,
        color: COLORS[Object.keys(m.stocks).length % COLORS.length],
        init: addParam(draft, `${symbol}_0`, 1, 0, 2),
        scale: [0, 2],
      };
    });
    return d
      .switchToStateAndFollow(next, `stock-${sid}`)
      .withInitContext({ anchorPos: Vec2(0) });
  };

  /** Cycle a link's shape, giving it fresh params for the new shape. */
  const cycleShape = (lid: string, step: number) =>
    setState(
      produce(m, (draft) => {
        const l = draft.links[lid];
        const shape =
          SHAPES[
            (SHAPES.indexOf(l.shape) + step + SHAPES.length) % SHAPES.length
          ];
        const shared = (p: string) =>
          Object.entries(m.links).some(
            ([id, other]) => id !== lid && other.params.includes(p),
          );
        for (const p of l.params) if (!shared(p)) delete draft.params[p];
        const v = Math.abs(valueAt(l.from)) || m.stocks[l.from].scale[1] / 2;
        l.shape = shape;
        l.params = SHAPE_PARAMS[shape].map((base) =>
          base === "n"
            ? addParam(draft, freshLabel(draft, "n"), 2, 1, 6)
            : addParam(draft, freshLabel(draft, base), v, 0, niceCeil(2 * v)),
        );
      }),
    );

  const rename = (
    current: string,
    apply: (draft: Model, v: string) => void,
  ) => {
    const v = window.prompt("Rename", current);
    if (v && v !== current) setState(produce(m, (draft) => apply(draft, v)));
  };

  const setParamByPrompt = (pid: string) => {
    const p = m.params[pid];
    const v = Number(window.prompt(`${p.label} =`, String(p.value)));
    if (!Number.isFinite(v)) return;
    setState(
      produce(m, (draft) => {
        const q = draft.params[pid];
        q.value = v;
        q.min = Math.min(q.min, v);
        q.max = Math.max(q.max, v);
      }),
    );
  };

  // ## Drawing

  const drawFlow = (fid: string) => {
    const f = m.flows[fid];
    const { dir, P, Q, M, ends } = flowGeom(m, fid);
    const angle = dir.angleDeg();
    const butt = Q.sub(dir.mul(HEAD));
    const pipe = path("M", P, "L", butt);
    const horizontal = Math.abs(dir.x) >= 0.6 * Math.abs(dir.y);
    const formula = flowFormula(m, fid);
    // (text anchors can't be interpolated, so labels beside a steep pipe
    // are centered on a guess at their width)
    const nameW = f.name.length * 5.2;
    const formulaW = formula.replace(/[_^]/g, "").length * 6;
    const rates = run.rates[fid];
    const rate = rates?.[Math.min(ci, rates.length - 1)];
    return (
      // (`data-flow` marks the flow's parts, including its layers, for
      // hover highlighting; see StockAndFlowDemo)
      <g id={`flow-${fid}`} data-flow={fid}>
        <path
          className="sf-pipe"
          d={pipe}
          stroke={MUTED}
          strokeWidth={7}
          fill="none"
        />
        <path d={pipe} stroke="white" strokeWidth={3.5} fill="none" />
        <polygon
          className="sf-head"
          transform={translate(Q) + rotateDeg(angle)}
          points={`0,0 ${-HEAD},${-6} ${-HEAD},6`}
          fill={MUTED}
        />
        <g
          id={`valve-${fid}`}
          data-flow={fid}
          transform={translate(M) + rotateDeg(angle)}
          dragologyZIndex={draggedId === `valve-${fid}` ? "/1" : 1}
          style={{ cursor: "grab" }}
          dragologyOnDrag={() => moveValve(fid)}
        >
          <circle r={11} fill="transparent" />
          <path
            className="sf-valve"
            d="M-6,-9 L6,-9 L-6,9 L6,9 Z"
            fill="white"
            stroke={INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <circle
            id={`valve-hit-${fid}`}
            r={18}
            fill="transparent"
            style={{ pointerEvents: "none" }}
          />
        </g>
        <g
          transform={translate(
            horizontal ? M.add(Vec2(0, 32)) : M.add(Vec2(14 + nameW / 2, 9)),
          )}
          style={{ pointerEvents: "none" }}
        >
          <text
            textAnchor="middle"
            fontSize={9.5}
            fill={MUTED}
            style={{ pointerEvents: "auto", cursor: "text" }}
            onDoubleClick={() =>
              rename(f.name, (draft, v) => {
                draft.flows[fid].name = v;
              })
            }
          >
            {f.name}
          </text>
        </g>
        <g
          transform={translate(
            horizontal
              ? M.add(Vec2(0, 21))
              : M.add(Vec2(14 + formulaW / 2, -4)),
          )}
          style={{ pointerEvents: "none" }}
        >
          <text
            className="sf-formula"
            textAnchor="middle"
            fontSize={11.5}
            fontFamily={SERIF}
            fontStyle="italic"
            fill={INK}
            style={{ pointerEvents: "auto" }}
          >
            {rich(formula, 11.5)}
            <tspan
              dragologyKey="rate"
              fontSize={9}
              fontFamily={MONO}
              fontStyle="normal"
              fill={FAINT}
            >
              {" "}
              {rate !== undefined ? fmt(rate) : ""}
            </tspan>
          </text>
        </g>
        {(["from", "to"] as const).map((which) => {
          const e = f[which];
          return (
            <g
              id={`end-${fid}-${which}`}
              data-flow={fid}
              transform={translate(ends[which])}
              dragologyZIndex={draggedId === `end-${fid}-${which}` ? "/1" : 1}
              style={{ cursor: "grab" }}
              dragologyOnDrag={() => moveEnd(fid, which)}
            >
              <path
                d={cloudPath}
                fill="white"
                stroke={FAINT}
                strokeWidth={1.5}
                opacity={isCloud(e) ? 1 : 0}
              />
              <circle
                className={isCloud(e) ? undefined : "sf-end"}
                r={7}
                fill={MUTED}
                opacity={isCloud(e) ? 0 : undefined}
              />
            </g>
          );
        })}
      </g>
    );
  };

  const drawLink = (lid: string) => {
    const l = m.links[lid];
    const s = m.stocks[l.from];
    const { start, ctrl, end, dir, mid } = linkGeom(m, lid);
    return (
      <g id={`link-${lid}`} dragologyZIndex={1}>
        <path
          d={path("M", start, "Q", ctrl, end.sub(withLen(dir, 5)))}
          fill="none"
          stroke={s.color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.8}
        />
        <g
          id={`link-head-${lid}`}
          transform={translate(end) + rotateDeg(dir.angleDeg())}
          dragologyZIndex={draggedId === `link-head-${lid}` ? "/1" : 1}
          style={{ cursor: "grab" }}
          dragologyOnDrag={() => moveLinkHead(lid)}
        >
          <circle r={7} fill="transparent" />
          <polygon points="0,0 -7,-4 -7,4" fill={s.color} />
        </g>
        {typeof l.to === "string" && (
          <g
            id={`chip-${lid}`}
            transform={translate(mid)}
            style={{ cursor: "pointer" }}
            onClick={(e) => cycleShape(lid, e.shiftKey ? -1 : 1)}
          >
            <rect
              x={-13}
              y={-9}
              width={26}
              height={18}
              rx={4}
              fill="white"
              stroke={s.color}
              strokeWidth={1}
            />
            <path
              d={shapeGlyph[l.shape]}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <title>{shapeTooltip(m, l)}</title>
          </g>
        )}
      </g>
    );
  };

  const drawStock = (sid: string) => {
    const s = m.stocks[sid];
    const v = valueAt(sid);
    const [lo, hi] = s.scale;
    const level = clamp((v - lo) / (hi - lo), 0, 1) * (SH - 4);
    const port = (
      at: Vec2,
      onDrag: () => DragSpec<Model>,
      glyph: ReactNode,
    ) => (
      <g
        className="sf-port"
        transform={translate(at)}
        style={{ cursor: "crosshair" }}
        dragologyOnDrag={onDrag}
      >
        {glyph}
      </g>
    );
    const arrowPort = (
      <g>
        <circle r={7} fill="white" stroke={MUTED} strokeWidth={1.2} />
        <path
          d="M-3.5,0 L3.5,0 M0.5,-3 L3.5,0 L0.5,3"
          fill="none"
          stroke={MUTED}
          strokeWidth={1.3}
        />
      </g>
    );
    return (
      <g
        id={`stock-${sid}`}
        className="sf-stock"
        transform={translate(s.x, s.y)}
        dragologyZIndex={draggedId === `stock-${sid}` ? "/1" : 2}
        style={{ cursor: "grab" }}
        dragologyOnDrag={() => moveStock(sid)}
        // Dragology only holds off a drag (so clicks can land) when the
        // dragged element itself or an ancestor handles them, so the
        // handler is here, and the texts say which one to rename.
        onDoubleClick={(e) => {
          const which = (e.target as Element)
            .closest("[data-rename]")
            ?.getAttribute("data-rename");
          if (which === "name")
            rename(s.name, (draft, v) => {
              draft.stocks[sid].name = v;
            });
          else if (which === "symbol")
            rename(s.symbol, (draft, v) => {
              draft.stocks[sid].symbol = v;
            });
        }}
      >
        <rect
          x={-SW / 2}
          y={-SH / 2}
          width={SW}
          height={SH}
          rx={4}
          fill="white"
          stroke={s.color}
          strokeWidth={2}
        />
        {/* (a path, since animating to an empty tank can overshoot to a
            negative height, which a rect won't take) */}
        <path
          d={`M${-SW / 2 + 2},${SH / 2 - 2} h${SW - 4} v${-level} h${-(SW - 4)} Z`}
          fill={s.color}
          opacity={0.15}
        />
        <g transform={translate(0, -7)}>
          <text
            textAnchor="middle"
            fontSize={11}
            fill={INK}
            style={{ cursor: "text" }}
            data-rename="name"
          >
            {s.name}
          </text>
        </g>
        <g transform={translate(0, 13)}>
          <text
            textAnchor="middle"
            fontSize={12}
            fill={s.color}
            style={{ cursor: "text" }}
            data-rename="symbol"
          >
            <tspan fontFamily={SERIF} fontStyle="italic" fontSize={14}>
              {rich(s.symbol, 14)}
            </tspan>
            <tspan fontFamily={MONO}> = {fmt(v)}</tspan>
          </text>
        </g>
        {port(Vec2(-SW / 2, 0), () => newFlow(sid, "in"), arrowPort)}
        {port(Vec2(SW / 2, 0), () => newFlow(sid, "out"), arrowPort)}
        {port(
          Vec2(0, -SH / 2),
          () => newLink(sid),
          <g>
            <circle
              r={6}
              fill="white"
              stroke={s.color}
              strokeWidth={1.2}
              strokeDasharray="2 1.5"
            />
            <circle r={1.8} fill={s.color} />
          </g>,
        )}
        {/* (an element with an id is a layer of its own, which takes
            pointer events away from the stock, so this one takes none) */}
        <rect
          id={`stock-body-${sid}`}
          x={-SW / 2}
          y={-SH / 2}
          width={SW}
          height={SH}
          fill="transparent"
          style={{ pointerEvents: "none" }}
        />
      </g>
    );
  };

  // ### Parameter panel

  const order = paramOrder(m);
  const rowH = Math.min(22, (DIAGRAM_H - 40) / Math.max(order.length, 1));
  const TRACK0 = PANEL_X + 46;
  const TRACK1 = PANEL_X + 146;
  const initOf = new Map(
    Object.values(m.stocks).map((s) => [s.init, s.color] as const),
  );

  const drawParamRow = (pid: string, i: number) => {
    const p = m.params[pid];
    const y = 44 + i * rowH;
    const selected = m.sweep === pid;
    return (
      <g id={`prow-${pid}`} transform={translate(PANEL_X, y)}>
        <rect
          x={-6}
          y={-rowH / 2}
          width={W - PANEL_X + 2}
          height={rowH}
          rx={4}
          fill="#fef3c7"
          opacity={selected ? 1 : 0}
        />
        <g
          style={{ cursor: "pointer" }}
          onClick={() => setState({ ...m, sweep: selected ? null : pid })}
          onDoubleClick={() =>
            rename(p.label, (draft, v) => {
              draft.params[pid].label = v;
            })
          }
        >
          <rect
            x={-4}
            y={-rowH / 2}
            width={46}
            height={rowH}
            fill="transparent"
          />
          <text
            dominantBaseline="central"
            fontSize={13}
            fontFamily={SERIF}
            fontStyle="italic"
            fill={initOf.get(pid) ?? INK}
            textDecoration={selected ? "underline" : undefined}
          >
            {rich(p.label, 13)}
          </text>
        </g>
        <line
          x1={TRACK0 - PANEL_X}
          x2={TRACK1 - PANEL_X}
          stroke="#cbd5e1"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle
          id={`knob-${pid}`}
          transform={translate(
            sliderX(p.value, p.min, p.max, TRACK0, TRACK1) - PANEL_X,
            0,
          )}
          r={5.5}
          fill="white"
          stroke={initOf.get(pid) ?? INK}
          strokeWidth={1.5}
          style={{ cursor: "ew-resize" }}
          dragologyOnDrag={() =>
            d.vary(m, param("params", pid, "value"), {
              constraint: (s) => inOrder([p.min, s.params[pid].value, p.max]),
            })
          }
        />
        <g transform={translate(TRACK1 - PANEL_X + 10, 0)}>
          <text
            dominantBaseline="central"
            fontSize={10.5}
            fontFamily={MONO}
            fill={INK}
            style={{ cursor: "text" }}
            onDoubleClick={() => setParamByPrompt(pid)}
          >
            {fmt(p.value)}
          </text>
        </g>
      </g>
    );
  };

  // ### Time chart

  const cursorX = TX0 + m.cursor * (TX1 - TX0);
  const tAtCursor = m.cursor * m.T;
  const unit = m.timeUnit ? ` ${m.timeUnit}` : "";

  const drawRow = (row: Row) => {
    const s = m.stocks[row.sid];
    const vs = run.values[row.sid] ?? [];
    const pts: Vec2[] = [];
    for (let i = 0; i < vs.length; i += 4)
      pts.push(Vec2(xOfT(i), yOf(s, row, vs[i])));
    const lastI = vs.length - 1;
    if (lastI % 4) pts.push(Vec2(xOfT(lastI), yOf(s, row, vs[lastI])));
    const [lo, hi] = s.scale;
    const init = m.params[s.init];
    return (
      <g id={`row-${row.sid}`}>
        <rect
          x={TX0}
          y={row.top}
          width={TX1 - TX0}
          height={row.bottom - row.top}
          fill="#f8fafc"
        />
        <line
          x1={TX0}
          x2={TX1}
          y1={yOf(s, row, 0)}
          y2={yOf(s, row, 0)}
          stroke="#e2e8f0"
          opacity={lo < 0 ? 1 : 0}
        />
        <g transform={translate(TX0 - 4, row.top + 8)}>
          <text textAnchor="end" fontSize={9} fill={FAINT} fontFamily={MONO}>
            {fmt(hi)}
          </text>
        </g>
        <g transform={translate(TX0 - 4, row.bottom)}>
          <text textAnchor="end" fontSize={9} fill={FAINT} fontFamily={MONO}>
            {fmt(lo)}
          </text>
        </g>
        <g transform={translate(4, (row.top + row.bottom) / 2 + 5)}>
          <text
            fontSize={15}
            fontFamily={SERIF}
            fontStyle="italic"
            fill={s.color}
          >
            {rich(s.symbol, 15)}
          </text>
        </g>
        <g transform={translate(TX1 - 4, row.top + 11)}>
          <text textAnchor="end" fontSize={9} fill={FAINT}>
            {s.unit ?? ""}
          </text>
        </g>
        <path
          d={
            pts.length
              ? path("M", ...pts.flatMap((pt, i) => (i ? ["L", pt] : [pt])))
              : ""
          }
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <g transform={translate(TX1 - 4, row.bottom - 5)}>
          <text textAnchor="end" fontSize={9} fill="#dc2626">
            {run.diverged ? "diverged" : ""}
          </text>
        </g>
        <circle
          transform={translate(cursorX, yOf(s, row, valueAt(row.sid)))}
          r={3}
          fill={s.color}
          style={{ pointerEvents: "none" }}
        />
        <circle
          id={`init-${row.sid}`}
          transform={translate(TX0, yOf(s, row, init.value, false))}
          r={5}
          fill="white"
          stroke={s.color}
          strokeWidth={2}
          style={{ cursor: "ns-resize" }}
          dragologyOnDrag={() =>
            d.vary(m, param("params", s.init, "value"), {
              constraint: (st) =>
                inOrder([init.min, st.params[s.init].value, init.max]),
            })
          }
        />
      </g>
    );
  };

  const [Tlo, Thi] = m.Trange;
  const TK0 = TX0 + 52;
  const TK1 = TX1 - 74;
  const Tx = TK0 + (Math.log(m.T / Tlo) / Math.log(Thi / Tlo)) * (TK1 - TK0);

  if (isTracking && draggedId) {
    const [, kind, id] =
      draggedId.match(
        /^(knob|init|stock|valve|end|link-head)-(.+?)(-from|-to)?$/,
      ) ?? [];
    const item =
      kind === "knob"
        ? drawParamRow(id, order.indexOf(id))
        : kind === "init"
          ? drawRow(rows.find((r) => r.sid === id)!)
          : kind === "stock"
            ? drawStock(id)
            : kind === "valve" || kind === "end"
              ? drawFlow(id)
              : kind === "link-head"
                ? drawLink(id)
                : null;
    if (item) return <g>{item}</g>;
  }

  return (
    <g>
      <style>{`
        .sf-port { opacity: 0.3; transition: opacity 0.15s; }
        .sf-stock:hover .sf-port { opacity: 0.8; }
        .sf-port:hover { opacity: 1 !important; }
        .sf-end { opacity: 0; }
        .sf-end:hover { opacity: 0.5; }
      `}</style>

      <rect
        width={DIAGRAM_W}
        height={DIAGRAM_H}
        rx={6}
        fill="#fcfcfd"
        stroke="#e5e7eb"
      />

      {/* palette */}
      <g
        id="palette-stock"
        transform={translate(8, 8)}
        style={{ cursor: "grab" }}
        dragologyOnDrag={newStock}
      >
        <rect
          width={64}
          height={24}
          rx={4}
          fill="white"
          stroke={FAINT}
          strokeDasharray="3 2"
        />
        <g transform={translate(32, 16)}>
          <text textAnchor="middle" fontSize={11} fill={MUTED}>
            + stock
          </text>
        </g>
      </g>
      <g id="trash" transform={translate(78, 4)}>
        <rect
          width={32}
          height={32}
          rx={5}
          fill={trashing ? "#fee2e2" : "white"}
          stroke={trashing ? "#ef4444" : "#e2e8f0"}
        />
        <path
          d="M9,10 L23,10 M13,10 L13,7.5 L19,7.5 L19,10 M10.5,10 L11.5,25 L20.5,25 L21.5,10 M14,13.5 L14,22 M18,13.5 L18,22"
          fill="none"
          stroke={trashing ? "#ef4444" : FAINT}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {Object.keys(m.flows).map(drawFlow)}
      {Object.keys(m.links).map(drawLink)}
      {Object.keys(m.stocks).map(drawStock)}

      {/* parameters */}
      <g transform={translate(PANEL_X, 18)}>
        <text fontSize={11} fontWeight={600} fill={MUTED}>
          PARAMETERS
        </text>
      </g>
      {order.map(drawParamRow)}

      {/* time chart */}
      <g transform={translate(TX0, CHART_TOP - 30)}>
        <text fontSize={11} fontWeight={600} fill={MUTED}>
          OVER TIME
        </text>
      </g>
      {rows.map(drawRow)}
      <g transform={translate(TX0, CHART_BOTTOM + 13)}>
        <text fontSize={9} fill={FAINT} fontFamily={MONO}>
          0
        </text>
      </g>
      <g transform={translate(TX1, CHART_BOTTOM + 13)}>
        <text textAnchor="end" fontSize={9} fill={FAINT} fontFamily={MONO}>
          {fmt(m.T) + unit}
        </text>
      </g>
      <g
        id="cursor"
        opacity={rows.length ? 1 : 0}
        transform={translate(cursorX, 0)}
        style={{ cursor: "ew-resize" }}
        dragologyOnDrag={() =>
          d.vary(m, param("cursor"), {
            constraint: (s) => inOrder([0, s.cursor, 1]),
          })
        }
      >
        <rect
          x={-5}
          y={CHART_TOP - 10}
          width={10}
          height={CHART_BOTTOM - CHART_TOP + 10}
          fill="transparent"
        />
        <line
          y1={CHART_TOP - 4}
          y2={CHART_BOTTOM}
          stroke={INK}
          strokeWidth={1}
          opacity={0.5}
        />
        <path
          d={`M-5,${CHART_TOP - 10} L5,${CHART_TOP - 10} L0,${CHART_TOP - 3} Z`}
          fill={INK}
        />
        <g
          transform={translate(
            clamp(cursorX, TX0 + 30, TX1 - 30) - cursorX,
            CHART_TOP - 13,
          )}
        >
          <text textAnchor="middle" fontSize={9.5} fontFamily={MONO} fill={INK}>
            t = {fmt(tAtCursor)}
            {unit}
          </text>
        </g>
      </g>

      {/* run length */}
      <g transform={translate(TX0, T_SLIDER_Y + 4)}>
        <text fontSize={10} fill={MUTED}>
          run for
        </text>
      </g>
      <line
        x1={TK0}
        x2={TK1}
        y1={T_SLIDER_Y}
        y2={T_SLIDER_Y}
        stroke="#cbd5e1"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle
        id="t-knob"
        transform={translate(Tx, T_SLIDER_Y)}
        r={5.5}
        fill="white"
        stroke={INK}
        strokeWidth={1.5}
        style={{ cursor: "ew-resize" }}
        dragologyOnDrag={() =>
          d.vary(m, param("T"), {
            constraint: (s) => inOrder([Tlo, s.T, Thi]),
          })
        }
      />
      <g transform={translate(TK1 + 10, T_SLIDER_Y + 4)}>
        <text fontSize={10.5} fontFamily={MONO} fill={INK}>
          {fmt(m.T) + unit}
        </text>
      </g>
    </g>
  );
};

// # The long-run chart
//
// Each point of this chart is a whole run, so it's too slow to draw
// inside the draggable, where the optimizer renders many candidate
// states per frame. It's drawn alongside instead, from the live state.

function LongRunChart({
  m,
  onPick,
}: {
  m: Model;
  onPick: (pid: string, value: number) => void;
}) {
  const rows = chartRows(m);
  const pid = m.sweep;
  const p = pid ? m.params[pid] : null;
  const sw = pid && p ? sweep(m, pid) : null;
  const run = simulate(m);
  const xOf = (v: number) => sliderX(v, p!.min, p!.max, SX0, SX1);

  return (
    <svg
      width={W}
      height={H}
      className="absolute left-0 top-0"
      style={{ pointerEvents: "none" }}
    >
      <text
        x={SX0}
        y={CHART_TOP - 30}
        fontSize={11}
        fontWeight={600}
        fill={MUTED}
      >
        IN THE LONG RUN{p && " VS "}
        {p && (
          <tspan
            fontFamily={SERIF}
            fontStyle="italic"
            fontSize={13}
            fontWeight={400}
            fill={INK}
          >
            {rich(p.label, 13, "key")}
          </tspan>
        )}
      </text>
      {rows.map((row) => {
        const s = m.stocks[row.sid];
        const bands = sw?.bands[row.sid] ?? [];
        // runs of samples that didn't diverge
        const runs: [number, [number, number]][][] = [[]];
        bands.forEach((b, i) => {
          if (b) runs[runs.length - 1].push([sw!.xs[i], b]);
          else if (runs[runs.length - 1].length) runs.push([]);
        });
        const vs = run.values[row.sid];
        const tail = vs.slice(Math.floor(vs.length * (1 - TAIL)));
        return (
          <g key={row.sid}>
            <rect
              x={SX0}
              y={row.top}
              width={SX1 - SX0}
              height={row.bottom - row.top}
              fill="#f8fafc"
            />
            {runs
              .filter((r) => r.length > 1)
              .map((r, k) => {
                const hiPts = r.map(
                  ([x, [, hi]]) => `${xOf(x)},${yOf(s, row, hi)}`,
                );
                const loPts = r.map(
                  ([x, [lo]]) => `${xOf(x)},${yOf(s, row, lo)}`,
                );
                return (
                  <g key={k}>
                    <polygon
                      points={[...hiPts, ...loPts.reverse()].join(" ")}
                      fill={s.color}
                      opacity={0.2}
                    />
                    <polyline
                      points={hiPts.join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.5}
                    />
                    <polyline
                      points={loPts.reverse().join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}
            {p && !run.diverged && (
              <g>
                <line
                  x1={xOf(p.value)}
                  x2={xOf(p.value)}
                  y1={yOf(s, row, Math.min(...tail))}
                  y2={yOf(s, row, Math.max(...tail))}
                  stroke={s.color}
                  strokeWidth={3}
                />
                <circle
                  cx={xOf(p.value)}
                  cy={yOf(s, row, Math.min(...tail))}
                  r={3}
                  fill={s.color}
                />
                <circle
                  cx={xOf(p.value)}
                  cy={yOf(s, row, Math.max(...tail))}
                  r={3}
                  fill={s.color}
                />
              </g>
            )}
          </g>
        );
      })}
      {p ? (
        <g>
          <line
            x1={xOf(p.value)}
            x2={xOf(p.value)}
            y1={CHART_TOP - 4}
            y2={CHART_BOTTOM}
            stroke={INK}
            strokeDasharray="2 2"
            opacity={0.5}
          />
          <text
            x={SX0}
            y={CHART_BOTTOM + 13}
            fontSize={9}
            fill={FAINT}
            fontFamily={MONO}
          >
            {fmt(p.min)}
          </text>
          <text
            x={SX1}
            y={CHART_BOTTOM + 13}
            textAnchor="end"
            fontSize={9}
            fill={FAINT}
            fontFamily={MONO}
          >
            {fmt(p.max)}
          </text>
          <rect
            x={SX0}
            y={CHART_TOP}
            width={SX1 - SX0}
            height={CHART_BOTTOM - CHART_TOP}
            fill="transparent"
            style={{ pointerEvents: "auto", cursor: "pointer" }}
            onClick={(e) => {
              const x =
                e.clientX - e.currentTarget.getBoundingClientRect().left;
              onPick(pid!, p.min + (x / (SX1 - SX0)) * (p.max - p.min));
            }}
          />
          <text
            x={(SX0 + SX1) / 2}
            y={T_SLIDER_Y + 4}
            textAnchor="middle"
            fontSize={10}
            fill={FAINT}
          >
            range of the last {TAIL * 100}% of each run
          </text>
        </g>
      ) : (
        rows.length > 0 && (
          <text
            x={(SX0 + SX1) / 2}
            y={(CHART_TOP + CHART_BOTTOM) / 2}
            textAnchor="middle"
            fontSize={11}
            fill={FAINT}
          >
            <tspan x={(SX0 + SX1) / 2}>Click a parameter&rsquo;s name</tspan>
            <tspan x={(SX0 + SX1) / 2} dy={15}>
              to see how the long run depends on it.
            </tspan>
          </text>
        )
      )}
    </svg>
  );
}

// # The equations

/** `rich`, for HTML. */
function richHtml(s: string): ReactNode[] {
  return s
    .split(/([_^][A-Za-z0-9]+)/)
    .map((part, i) =>
      part[0] === "_" ? (
        <sub key={i}>{part.slice(1)}</sub>
      ) : part[0] === "^" ? (
        <sup key={i}>{part.slice(1)}</sup>
      ) : (
        part
      ),
    );
}

function Equations({ m }: { m: Model }) {
  const math = { fontFamily: SERIF, fontStyle: "italic" } as const;
  return (
    <div className="mt-3" style={{ maxWidth: W }}>
      <div
        className="text-[11px] font-semibold tracking-wide mb-1"
        style={{ color: MUTED }}
      >
        EQUATIONS
      </div>
      <div className="flex flex-col gap-1.5 text-[15px]" style={{ color: INK }}>
        {equations(m).map((eq) => {
          const s = m.stocks[eq.stock];
          return (
            <div key={eq.stock} className="flex items-center flex-wrap gap-x-1">
              {eq.volume && (
                <span style={math}>{richHtml(eq.volume)}&thinsp;·</span>
              )}
              <span
                className="inline-flex flex-col items-center leading-none mx-0.5"
                style={math}
              >
                <span className="px-0.5 pb-0.5">
                  d<span style={{ color: s.color }}>{richHtml(s.symbol)}</span>
                </span>
                <span
                  className="px-0.5 pt-0.5 w-full text-center"
                  style={{ borderTop: `1px solid ${INK}` }}
                >
                  dt
                </span>
              </span>
              <span className="mx-1">=</span>
              {eq.terms.length === 0 && <span>0</span>}
              {eq.terms.map((t, i) => (
                <span key={i} title={m.flows[t.flow].name} data-flow={t.flow}>
                  {(i > 0 || t.sign < 0) && (
                    <span className="mx-1" style={{ fontStyle: "normal" }}>
                      {t.sign > 0 ? "+" : "−"}
                    </span>
                  )}
                  <span className="sf-term rounded px-0.5" style={math}>
                    {t.formula.split(/⟦([^⟧]*)⟧/).map((part, j) =>
                      // odd parts are stock ids
                      j % 2 ? (
                        <span key={j} style={{ color: m.stocks[part]?.color }}>
                          {richHtml(m.stocks[part]?.symbol ?? "?")}
                        </span>
                      ) : (
                        <span key={j}>{richHtml(part)}</span>
                      ),
                    )}
                  </span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// # The demo

const HISTORY = 100;

function StockAndFlowDemo() {
  const [model, setModel] = useState(() => presets[0].make());
  const [past, setPast] = useState<Model[]>([]);
  const [live, setLive] = useState<Model | null>(null);
  const shown = useDeferredValue(live ?? model);

  const change = (next: Model) => {
    const fitted = fit(tidy(next));
    setLive(null);
    if (JSON.stringify(fitted) === JSON.stringify(model)) return;
    setPast([...past, model].slice(-HISTORY));
    setModel(fitted);
  };
  const undo = () => {
    setModel(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };

  const save = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stock-and-flow.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // A flow hovered in the diagram or in the equations lights up in both.
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverCss = hovered
    ? (() => {
        const f = `[data-flow="${CSS.escape(hovered)}"]`;
        return `
          ${f} .sf-pipe { stroke: ${HOVER}; }
          ${f} .sf-head { fill: ${HOVER}; }
          ${f} .sf-valve { stroke: ${HOVER}; fill: ${HOVER_BG}; }
          ${f} .sf-formula { fill: ${HOVER}; }
          ${f} .sf-term { background: ${HOVER_BG}; }
        `;
      })()
    : "";

  const [dropping, setDropping] = useState(false);
  const isFileDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files");
  const load = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      change(parseModel(JSON.parse(await file.text())));
    } catch (err) {
      window.alert(`Couldn't load ${file.name}: ${(err as Error).message}`);
    }
  };

  const buttonClass =
    "px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100";
  return (
    <div
      onMouseOver={(e) =>
        setHovered(
          (e.target as Element)
            .closest("[data-flow]")
            ?.getAttribute("data-flow") ?? null,
        )
      }
      onMouseLeave={() => setHovered(null)}
    >
      <style>{hoverCss}</style>
      <div className="flex flex-wrap gap-1.5 mb-2" style={{ maxWidth: W }}>
        <button className={buttonClass} onClick={undo} disabled={!past.length}>
          ↶ undo
        </button>
        <button
          className={buttonClass}
          onClick={save}
          title="Download this model as JSON. Drop a JSON file on the demo to load one."
        >
          ⤓ save
        </button>
        <span className="w-2" />
        {presets.map((preset) => (
          <button
            key={preset.label}
            className={buttonClass}
            onClick={() => change(preset.make())}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div
        className="relative"
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDropping(false);
        }}
        onDrop={load}
      >
        <DemoDraggable
          draggable={draggable}
          state={model}
          onDropState={change}
          onDragState={setLive}
          width={W}
          height={H}
        />
        <LongRunChart
          m={shown}
          onPick={(pid, value) =>
            change(
              produce(model, (draft) => {
                draft.params[pid].value = value;
              }),
            )
          }
        />
        {dropping && (
          <div
            className="absolute left-0 top-0 flex items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-50/80 text-sm text-sky-700 pointer-events-none"
            style={{ width: W, height: H }}
          >
            Drop a model&rsquo;s JSON to load it
          </div>
        )}
      </div>
      <Equations m={shown} />
    </div>
  );
}

export default demo(
  () => (
    <div>
      <DemoNotes>
        <p>
          A <b>stock-and-flow</b> editor. Stocks (boxes) accumulate; flows
          (pipes) fill and drain them, from and to clouds outside the model or
          between stocks; dashed links say what a flow&rsquo;s rate depends on.
          A rate is its constant times one factor per link, and each
          link&rsquo;s chip says which shape that factor has (click it to cycle:
          linear, threshold, gap, saturating, crowding, repression).
        </p>
        <p className="mt-2">
          Drag a stock&rsquo;s side arrows to pull out a flow, its top dot to
          pull out a link onto a valve; drag a flow&rsquo;s ends onto stocks or
          off into clouds; drag things to the trash to delete them. Drag
          sliders, the starting points of the curves, and the time cursor. Click
          a parameter&rsquo;s name to see how the long-run behavior depends on
          it. Double-click names and values to edit them.
        </p>
      </DemoNotes>
      <StockAndFlowDemo />
    </div>
  ),
  {
    tags: [
      "d.vary",
      "d.varyFunc",
      "d.closest",
      "d.dropTarget",
      "d.switchToStateAndFollow",
      "spec.whenFar",
      "spec.onDrop",
      "math",
    ],
    fuzz: presets.map((p) => ({
      name: p.label,
      draggable,
      initialState: p.make(),
    })),
  },
);
