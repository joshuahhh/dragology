// A stock-and-flow model (as in system dynamics): stocks accumulate,
// flows move stuff between stocks or in from / out to "clouds" outside
// the model, and links say which stocks a flow's rate depends on.
//
// A flow's rate is its rate constant times one factor per link into
// it. Each link's shape says how the factor responds to its stock.

export type Param = { label: string; value: number; min: number; max: number };

export const SHAPES = [
  "linear",
  "threshold",
  "gap",
  "saturating",
  "crowding",
  "repression",
] as const;
export type Shape = (typeof SHAPES)[number];

/** Labels of the params each shape takes, in order. */
export const SHAPE_PARAMS: Record<Shape, string[]> = {
  linear: [],
  threshold: ["θ"],
  gap: ["θ"],
  saturating: ["K"],
  crowding: ["K"],
  repression: ["K", "n"],
};

export type Point = { x: number; y: number };

/** A flow end: a stock's id, or a cloud (a source or sink) at a point. */
export type End = string | Point;

export type Stock = {
  name: string;
  symbol: string;
  unit?: string;
  x: number;
  y: number;
  color: string;
  /** param id of the initial value */
  init: string;
  /**
   * param id of the stock's volume, if it has one: flows carry amounts,
   * and the stock's value is a concentration, amount / volume.
   */
  volume?: string;
  /** The value range its charts show. Refit by `fit` after each change. */
  scale: [number, number];
};

export type Flow = {
  name: string;
  from: End;
  to: End;
  /** param id of the rate constant; without one, the rate is just the product of the factors */
  rate?: string;
};

export type Link = {
  from: string;
  /** a flow's id, or a loose end while it's being dragged */
  to: string | Point;
  shape: Shape;
  params: string[];
};

export type Model = {
  stocks: Record<string, Stock>;
  flows: Record<string, Flow>;
  links: Record<string, Link>;
  params: Record<string, Param>;
  /** how long to run */
  T: number;
  Trange: [number, number];
  timeUnit: string;
  /** the time the diagram shows, as a fraction of T */
  cursor: number;
  /** the param whose long-run effect is charted */
  sweep: string | null;
};

export const isCloud = (end: End): end is Point => typeof end !== "string";

export function factor(shape: Shape, x: number, p: number[]): number {
  switch (shape) {
    case "linear":
      return x;
    case "threshold":
      return Math.max(0, x - p[0]);
    case "gap":
      return p[0] - x;
    case "saturating": {
      const xp = Math.max(0, x);
      return xp + p[0] > 0 ? xp / (p[0] + xp) : 0;
    }
    case "crowding":
      return p[0] > 0 ? Math.max(0, 1 - x / p[0]) : 0;
    case "repression": {
      const xp = Math.max(0, x);
      if (p[0] <= 0) return xp > 0 ? 0 : 1;
      return 1 / (1 + Math.pow(xp / p[0], p[1]));
    }
  }
}

// # Simulation

export const STEPS = 400;
/** The long-run behavior is the range over this last fraction of the run. */
export const TAIL = 0.2;

export type Run = {
  /** values[stock][i] at time i / STEPS * T; shorter if the run diverged */
  values: Record<string, number[]>;
  rates: Record<string, number[]>;
  diverged: boolean;
};

type Compiled = {
  stockIds: string[];
  flowIds: string[];
  x0: number[];
  vol: number[];
  flows: {
    from: number;
    to: number;
    k: number;
    factors: { s: number; shape: Shape; p: number[] }[];
  }[];
};

function compile(m: Model, override?: [string, number]): Compiled {
  const pv = (id: string) =>
    override && override[0] === id ? override[1] : m.params[id].value;
  const stockIds = Object.keys(m.stocks);
  const idx = new Map(stockIds.map((s, i) => [s, i]));
  const endIdx = (e: End) => (isCloud(e) ? -1 : (idx.get(e) ?? -1));
  const flowIds = Object.keys(m.flows);
  return {
    stockIds,
    flowIds,
    x0: stockIds.map((s) => pv(m.stocks[s].init)),
    vol: stockIds.map((s) => {
      const v = m.stocks[s].volume;
      return v ? pv(v) : 1;
    }),
    flows: flowIds.map((f) => {
      const flow = m.flows[f];
      return {
        from: endIdx(flow.from),
        to: endIdx(flow.to),
        k: flow.rate ? pv(flow.rate) : 1,
        factors: Object.values(m.links)
          .filter((l) => l.to === f && idx.has(l.from))
          .map((l) => ({
            s: idx.get(l.from)!,
            shape: l.shape,
            p: l.params.map(pv),
          })),
      };
    }),
  };
}

function flowRates(c: Compiled, xs: number[], out: number[]) {
  for (let i = 0; i < c.flows.length; i++) {
    const f = c.flows[i];
    let r = f.k;
    for (const fac of f.factors) r *= factor(fac.shape, xs[fac.s], fac.p);
    out[i] = r;
  }
}

function deriv(c: Compiled, xs: number[], rates: number[], out: number[]) {
  flowRates(c, xs, rates);
  out.fill(0);
  for (let i = 0; i < c.flows.length; i++) {
    const { from, to } = c.flows[i];
    if (from >= 0) out[from] -= rates[i] / c.vol[from];
    if (to >= 0) out[to] += rates[i] / c.vol[to];
  }
}

/** Fixed-step RK4. */
function integrate(c: Compiled, T: number): Run {
  const n = c.stockIds.length;
  const dt = T / STEPS;
  let xs = c.x0.slice();
  const values: number[][] = c.stockIds.map((_, i) => [xs[i]]);
  const rates: number[][] = c.flows.map(() => []);
  const r = new Array(c.flows.length).fill(0);
  const k1 = new Array(n).fill(0);
  const k2 = new Array(n).fill(0);
  const k3 = new Array(n).fill(0);
  const k4 = new Array(n).fill(0);
  const tmp = new Array(n).fill(0);
  let diverged = false;
  const recordRates = () => {
    flowRates(c, xs, r);
    r.forEach((v, i) => rates[i].push(v));
  };
  recordRates();
  for (let step = 0; step < STEPS; step++) {
    deriv(c, xs, r, k1);
    for (let i = 0; i < n; i++) tmp[i] = xs[i] + (dt / 2) * k1[i];
    deriv(c, tmp, r, k2);
    for (let i = 0; i < n; i++) tmp[i] = xs[i] + (dt / 2) * k2[i];
    deriv(c, tmp, r, k3);
    for (let i = 0; i < n; i++) tmp[i] = xs[i] + dt * k3[i];
    deriv(c, tmp, r, k4);
    const next = xs.map(
      (x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]),
    );
    if (next.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e12)) {
      diverged = true;
      break;
    }
    xs = next;
    xs.forEach((x, i) => values[i].push(x));
    recordRates();
  }
  return {
    values: Object.fromEntries(c.stockIds.map((s, i) => [s, values[i]])),
    rates: Object.fromEntries(c.flowIds.map((f, i) => [f, rates[i]])),
    diverged,
  };
}

/** Everything the dynamics depend on (not layout, names, or scales). */
function dynamicsKey(m: Model, omitParam?: string): string {
  return JSON.stringify([
    Object.entries(m.stocks).map(([id, s]) => [id, s.init, s.volume]),
    Object.entries(m.flows).map(([id, f]) => [
      id,
      isCloud(f.from) ? null : f.from,
      isCloud(f.to) ? null : f.to,
      f.rate,
    ]),
    Object.values(m.links).map((l) => [l.from, l.to, l.shape, l.params]),
    Object.entries(m.params).map(([id, p]) => [
      id,
      id === omitParam ? null : p.value,
    ]),
    m.T,
  ]);
}

function lru<V>(size: number) {
  const cache = new Map<string, V>();
  return (key: string, make: () => V): V => {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const v = make();
    cache.set(key, v);
    if (cache.size > size) cache.delete(cache.keys().next().value!);
    return v;
  };
}

const runCache = lru<Run>(64);

export function simulate(m: Model): Run {
  return runCache(dynamicsKey(m), () => integrate(compile(m), m.T));
}

export const SWEEP_N = 41;

export type Sweep = {
  param: string;
  /** the swept values */
  xs: number[];
  /** per stock, the [min, max] over the tail of each run, or null if it diverged */
  bands: Record<string, ([number, number] | null)[]>;
};

const sweepCache = lru<Sweep>(16);

/** Run the model across the swept param's range. */
export function sweep(m: Model, pid: string): Sweep {
  return sweepCache(pid + dynamicsKey(m, pid), () => {
    const { min, max } = m.params[pid];
    const xs = Array.from(
      { length: SWEEP_N },
      (_, i) => min + ((max - min) * i) / (SWEEP_N - 1),
    );
    const bands: Sweep["bands"] = Object.fromEntries(
      Object.keys(m.stocks).map((s) => [s, []]),
    );
    for (const x of xs) {
      const run = integrate(compile(m, [pid, x]), m.T);
      for (const [s, vs] of Object.entries(run.values)) {
        if (run.diverged) {
          bands[s].push(null);
          continue;
        }
        const tail = vs.slice(Math.floor(vs.length * (1 - TAIL)));
        bands[s].push([Math.min(...tail), Math.max(...tail)]);
      }
    }
    return { param: pid, xs, bands };
  });
}

/** The index into a run's arrays for the model's cursor. */
export function cursorIndex(m: Model, run: Run): number {
  const len = Object.values(run.values)[0]?.length ?? 1;
  return Math.min(len - 1, Math.round(m.cursor * STEPS));
}

// # Housekeeping

/** 1, 2, 2.5, 5 × 10ⁿ, at least v. */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 2, 2.5, 5, 10])
    if (s * mag >= v * (1 - 1e-9)) return s * mag;
  return 10 * mag;
}

/** Refit each stock's chart range to its run (and sweep, if any). */
export function fit(m: Model): Model {
  const run = simulate(m);
  const sw = m.sweep ? sweep(m, m.sweep) : null;
  const stocks = { ...m.stocks };
  for (const [id, s] of Object.entries(m.stocks)) {
    const vs = [...run.values[id]];
    for (const b of sw?.bands[id] ?? []) if (b) vs.push(b[0], b[1]);
    let lo = Math.min(0, ...vs);
    let hi = Math.max(0, ...vs);
    if (lo < 0) lo = -niceCeil(-lo);
    hi = niceCeil(hi);
    if (hi - lo < 1e-12) hi = lo + 1;
    stocks[id] = { ...s, scale: [lo, hi] };
  }
  return { ...m, stocks };
}

/**
 * Drop loose links and anything dangling (flows from or to a deleted
 * stock keep a cloud there instead), and clamp params to their ranges.
 */
export function tidy(m: Model): Model {
  const stocks = m.stocks;
  const flows: Model["flows"] = {};
  for (const [id, f] of Object.entries(m.flows)) {
    const fix = (e: End): End => (isCloud(e) || stocks[e] ? e : { x: 0, y: 0 });
    flows[id] = { ...f, from: fix(f.from), to: fix(f.to) };
  }
  const links: Model["links"] = {};
  for (const [id, l] of Object.entries(m.links)) {
    if (typeof l.to === "string" && flows[l.to] && stocks[l.from])
      links[id] = l;
  }
  const used = new Set<string>();
  for (const s of Object.values(stocks)) {
    used.add(s.init);
    if (s.volume) used.add(s.volume);
  }
  for (const f of Object.values(flows)) if (f.rate) used.add(f.rate);
  for (const l of Object.values(links)) l.params.forEach((p) => used.add(p));
  // (the optimizer's constraints are soft, so values can stray a hair)
  const params = Object.fromEntries(
    Object.entries(m.params)
      .filter(([id]) => used.has(id))
      .map(([id, p]) => [
        id,
        p.value < p.min || p.value > p.max
          ? { ...p, value: Math.min(p.max, Math.max(p.min, p.value)) }
          : p,
      ]),
  );
  return {
    ...m,
    flows,
    links,
    params,
    sweep: m.sweep && params[m.sweep] ? m.sweep : null,
  };
}

/**
 * Check that parsed JSON is a model (as saved by the demo), well enough
 * that simulating it won't crash. Throws with a reason if not.
 */
export function parseModel(json: unknown): Model {
  const fail = (why: string): never => {
    throw new Error(why);
  };
  const isRecord = (v: unknown): v is Record<string, any> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isRecord(json)) fail("not a JSON object");
  const m = json as Record<string, any>;
  for (const k of ["stocks", "flows", "links", "params"])
    if (!isRecord(m[k])) fail(`missing "${k}"`);
  if (typeof m.T !== "number") fail(`missing "T"`);
  const param = (id: unknown, where: string) => {
    const p = typeof id === "string" ? m.params[id] : undefined;
    if (!isRecord(p) || typeof p.value !== "number")
      fail(`${where} refers to a missing param`);
  };
  for (const [id, s] of Object.entries<any>(m.stocks)) {
    param(s?.init, `stock ${id}`);
    if (s.volume !== undefined) param(s.volume, `stock ${id}`);
  }
  for (const [id, f] of Object.entries<any>(m.flows))
    if (f?.rate !== undefined) param(f.rate, `flow ${id}`);
  for (const [id, l] of Object.entries<any>(m.links)) {
    if (!SHAPES.includes(l?.shape)) fail(`link ${id} has an unknown shape`);
    (l.params ?? []).forEach((p: unknown) => param(p, `link ${id}`));
  }
  return {
    Trange: [Math.min(1, m.T), Math.max(100, m.T)],
    timeUnit: "",
    ...m,
    cursor: typeof m.cursor === "number" ? m.cursor : 1,
    sweep: typeof m.sweep === "string" ? m.sweep : null,
  } as Model;
}

/** Delete a stock; its flows end in clouds where it was. */
export function deleteStock(m: Model, sid: string): Model {
  const s = m.stocks[sid];
  const { [sid]: _, ...stocks } = m.stocks;
  const flows: Model["flows"] = {};
  for (const [id, f] of Object.entries(m.flows)) {
    const fix = (e: End, dx: number): End =>
      e === sid ? { x: s.x + dx, y: s.y } : e;
    flows[id] = { ...f, from: fix(f.from, -20), to: fix(f.to, 20) };
  }
  return tidy({ ...m, stocks, flows });
}

// # Labels

/** `base` with the first subscript (`_1`, `_2`, …) not already used by a param. */
export function freshLabel(m: Model, base: string): string {
  const used = new Set(Object.values(m.params).map((p) => p.label));
  for (let i = 1; ; i++) {
    const label = `${base}_${i}`;
    if (!used.has(label)) return label;
  }
}

export function freshSymbol(m: Model): string {
  const used = new Set(Object.values(m.stocks).map((s) => s.symbol));
  for (const c of "xyzuvwpqrsabcdefgh") if (!used.has(c)) return c;
  for (let i = 1; ; i++) if (!used.has(`x_${i}`)) return `x_${i}`;
}

/** How a formula writes a stock: by default, its symbol. */
type WriteStock = (sid: string) => string;
const symbolOf =
  (m: Model): WriteStock =>
  (sid) =>
    m.stocks[sid]?.symbol ?? "?";

export function factorText(
  m: Model,
  l: Link,
  writeStock: WriteStock = symbolOf(m),
): string {
  const s = writeStock(l.from);
  const [a, b] = l.params.map((p) => m.params[p]?.label ?? "?");
  switch (l.shape) {
    case "linear":
      return s;
    case "threshold":
      return `(${s}−${a})⁺`;
    case "gap":
      return `(${a}−${s})`;
    case "saturating":
      return `${s}/(${a}+${s})`;
    case "crowding":
      return `(1−${s}/${a})`;
    case "repression":
      return `1/(1+(${s}/${a})^${b})`;
  }
}

export function flowFormula(
  m: Model,
  fid: string,
  writeStock: WriteStock = symbolOf(m),
): string {
  const f = m.flows[fid];
  const parts = [
    ...(f.rate ? [m.params[f.rate]?.label ?? "?"] : []),
    ...Object.values(m.links)
      .filter((l) => l.to === fid)
      .map((l) => factorText(m, l, writeStock)),
  ];
  if (!parts.length) return "1";
  // k·1/(…) reads better as k/(…)
  return parts.reduce((acc, part) =>
    part.startsWith("1/") ? acc + part.slice(1) : acc + "·" + part,
  );
}

export type Equation = {
  stock: string;
  /** the volume's label, if the stock has one (it multiplies d/dt) */
  volume?: string;
  /**
   * inflows (+) and outflows (−); a flow between two stocks is in both.
   * Stocks appear in formulas as `⟦id⟧`, so they can be styled.
   */
  terms: { sign: 1 | -1; formula: string; flow: string }[];
};

/** Each stock's mass balance. */
export function equations(m: Model): Equation[] {
  const formula = (fid: string) => flowFormula(m, fid, (sid) => `⟦${sid}⟧`);
  return Object.entries(m.stocks).map(([sid, s]) => ({
    stock: sid,
    volume: s.volume ? m.params[s.volume]?.label : undefined,
    terms: Object.entries(m.flows).flatMap(([fid, f]) => [
      ...(f.to === sid
        ? [{ sign: 1 as const, formula: formula(fid), flow: fid }]
        : []),
      ...(f.from === sid
        ? [{ sign: -1 as const, formula: formula(fid), flow: fid }]
        : []),
    ]),
  }));
}

export function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return v.toExponential(1).replace("e+", "e");
  if (a >= 100) return String(Math.round(v));
  return String(Number(v.toPrecision(3)));
}
