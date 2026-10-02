import { End, fit, Link, Model, Shape } from "./model";

export const COLORS = [
  "#ea580c",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#ca8a04",
];

/** A little language for writing models by hand. */
function model(
  opts: { T: number; Trange: [number, number]; timeUnit: string },
  build: (b: {
    param: (label: string, value: number, min: number, max: number) => string;
    stock: (
      id: string,
      s: {
        name: string;
        symbol: string;
        unit?: string;
        at: [number, number];
        init: [number, number, number];
        volume?: string;
      },
    ) => void;
    flow: (
      id: string,
      name: string,
      from: End | [number, number],
      to: End | [number, number],
      rate?: string,
    ) => void;
    link: (
      from: string,
      to: string,
      shape?: Shape,
      ...params: string[]
    ) => void;
  }) => void,
): Model {
  const m: Model = {
    stocks: {},
    flows: {},
    links: {},
    params: {},
    ...opts,
    cursor: 1,
    sweep: null,
  };
  let n = 0;
  const param = (label: string, value: number, min: number, max: number) => {
    const id = `p${n++}`;
    m.params[id] = { label, value, min, max };
    return id;
  };
  const end = (e: End | [number, number]): End =>
    Array.isArray(e) ? { x: e[0], y: e[1] } : e;
  build({
    param,
    stock: (id, s) => {
      m.stocks[id] = {
        name: s.name,
        symbol: s.symbol,
        unit: s.unit,
        x: s.at[0],
        y: s.at[1],
        color: COLORS[Object.keys(m.stocks).length % COLORS.length],
        init: param(s.symbol + "_0", ...s.init),
        volume: s.volume,
        scale: [0, 1],
      };
    },
    flow: (id, name, from, to, rate) => {
      m.flows[id] = { name, from: end(from), to: end(to), rate };
    },
    link: (from, to, shape = "linear", ...params) => {
      const l: Link = { from, to, shape, params };
      m.links[`l${Object.keys(m.links).length}`] = l;
    },
  });
  return fit(m);
}

// Stolwijk & Hardy (1974), as presented in Khoo, Physiological Control
// Systems, §3.6. Glucose x in mg/mL, insulin y in mU/mL, time in hours.
// Each compartment is ~15 L of blood and interstitial fluid.
const glucose = () =>
  model({ T: 12, Trange: [1, 72], timeUnit: "h" }, (b) => {
    const QL = b.param("Q_L", 8400, 0, 20000);
    const lambda = b.param("λ", 2470, 0, 6000);
    const nu = b.param("ν", 139000, 0, 300000);
    const mu = b.param("μ", 7200, 0, 15000);
    const theta = b.param("θ", 2.5, 0, 5);
    const beta = b.param("β", 1430, 0, 3000);
    const phi = b.param("φ", 0.51, 0, 1.5);
    const alpha = b.param("α", 7600, 0, 15000);
    const CG = b.param("C_G", 15000, 1000, 30000);
    const CI = b.param("C_I", 15000, 1000, 30000);
    b.stock("G", {
      name: "Plasma glucose",
      symbol: "x",
      unit: "mg/mL",
      at: [175, 100],
      init: [1.5, 0, 4],
      volume: CG,
    });
    b.stock("I", {
      name: "Plasma insulin",
      symbol: "y",
      unit: "mU/mL",
      at: [175, 250],
      init: [0.02, 0, 0.3],
      volume: CI,
    });
    b.flow("input", "glucose input", [40, 100], "G", QL);
    b.flow("renal", "renal loss", "G", [420, 22], mu);
    b.link("G", "renal", "threshold", theta);
    b.flow("indep", "insulin-indep. uptake", "G", [420, 100], lambda);
    b.link("G", "indep");
    b.flow("dep", "insulin-dep. uptake", "G", [420, 178], nu);
    b.link("G", "dep");
    b.link("I", "dep");
    b.flow("prod", "insulin production", [40, 250], "I", beta);
    b.link("G", "prod", "threshold", phi);
    b.flow("destr", "insulin destruction", "I", [420, 250], alpha);
    b.link("I", "destr");
  });

const lotkaVolterra = () =>
  model({ T: 40, Trange: [5, 200], timeUnit: "yr" }, (b) => {
    const a = b.param("a", 1, 0, 3);
    const bb = b.param("b", 0.1, 0, 0.3);
    const delta = b.param("δ", 0.075, 0, 0.2);
    const gamma = b.param("γ", 1.5, 0, 3);
    b.stock("prey", {
      name: "Hares",
      symbol: "x",
      at: [215, 95],
      init: [10, 0, 40],
    });
    b.stock("pred", {
      name: "Lynx",
      symbol: "y",
      at: [215, 235],
      init: [5, 0, 20],
    });
    b.flow("births", "hare births", [70, 95], "prey", a);
    b.link("prey", "births");
    b.flow("eaten", "predation", "prey", [400, 95], bb);
    b.link("prey", "eaten");
    b.link("pred", "eaten");
    b.flow("pbirths", "lynx births", [70, 235], "pred", delta);
    b.link("prey", "pbirths");
    b.link("pred", "pbirths");
    b.flow("pdeaths", "lynx deaths", "pred", [400, 235], gamma);
    b.link("pred", "pdeaths");
  });

// Logistic prey and a predator that gets full: past a critical carrying
// capacity, the equilibrium gives way to a cycle ("the paradox of
// enrichment").
const rosenzweigMacArthur = () =>
  model({ T: 200, Trange: [20, 1000], timeUnit: "" }, (b) => {
    const r = b.param("r", 1, 0, 2);
    const K = b.param("K", 3, 0, 6);
    const a = b.param("a", 1, 0, 2);
    const h = b.param("h", 1, 0.05, 3);
    const e = b.param("e", 0.5, 0, 1);
    const mort = b.param("m", 0.2, 0, 1);
    b.stock("prey", {
      name: "Prey",
      symbol: "x",
      at: [215, 95],
      init: [1, 0, 5],
    });
    b.stock("pred", {
      name: "Predators",
      symbol: "y",
      at: [215, 235],
      init: [0.5, 0, 3],
    });
    b.flow("growth", "prey growth", [70, 95], "prey", r);
    b.link("prey", "growth");
    b.link("prey", "growth", "crowding", K);
    b.flow("eaten", "predation", "prey", [400, 95], a);
    b.link("prey", "eaten", "saturating", h);
    b.link("pred", "eaten");
    b.flow("pgrowth", "predator growth", [70, 235], "pred", e);
    b.link("prey", "pgrowth", "saturating", h);
    b.link("pred", "pgrowth");
    b.flow("pdeaths", "predator deaths", "pred", [400, 235], mort);
    b.link("pred", "pdeaths");
  });

const sir = () =>
  model({ T: 160, Trange: [10, 1000], timeUnit: "days" }, (b) => {
    const beta = b.param("β", 0.3, 0, 1);
    const gamma = b.param("γ", 0.1, 0, 0.5);
    b.stock("S", {
      name: "Susceptible",
      symbol: "S",
      at: [70, 70],
      init: [0.99, 0, 1],
    });
    b.stock("I", {
      name: "Infected",
      symbol: "I",
      at: [225, 250],
      init: [0.01, 0, 0.2],
    });
    b.stock("R", {
      name: "Recovered",
      symbol: "R",
      at: [380, 70],
      init: [0, 0, 1],
    });
    b.flow("infection", "infection", "S", "I", beta);
    b.link("S", "infection");
    b.link("I", "infection");
    b.flow("recovery", "recovery", "I", "R", gamma);
    b.link("I", "recovery");
  });

// Logistic growth against a harvest that saturates: push the harvest
// past what the stock can sustain and it collapses.
const fishery = () =>
  model({ T: 100, Trange: [10, 500], timeUnit: "yr" }, (b) => {
    const r = b.param("r", 0.5, 0, 1);
    const K = b.param("K", 100, 0, 200);
    const H = b.param("H", 8, 0, 20);
    const c = b.param("c", 5, 0.1, 50);
    b.stock("fish", {
      name: "Fish",
      symbol: "N",
      at: [225, 250],
      init: [80, 0, 200],
    });
    b.flow("growth", "growth", [75, 140], "fish", r);
    b.link("fish", "growth");
    b.link("fish", "growth", "crowding", K);
    b.flow("catch", "catch", "fish", [380, 140], H);
    b.link("fish", "catch", "saturating", c);
  });

// Two genes that repress each other: whichever starts ahead wins.
const toggle = () =>
  model({ T: 20, Trange: [2, 100], timeUnit: "" }, (b) => {
    const alpha = b.param("α", 10, 0, 20);
    const K = b.param("K", 1, 0.1, 5);
    const n = b.param("n", 2, 1, 5);
    const delta = b.param("δ", 1, 0, 3);
    b.stock("u", {
      name: "Repressor U",
      symbol: "u",
      at: [215, 90],
      init: [2, 0, 4],
    });
    b.stock("v", {
      name: "Repressor V",
      symbol: "v",
      at: [215, 240],
      init: [1, 0, 4],
    });
    b.flow("pu", "make U", [70, 90], "u", alpha);
    b.link("v", "pu", "repression", K, n);
    b.flow("du", "decay", "u", [380, 90], delta);
    b.link("u", "du");
    b.flow("pv", "make V", [70, 240], "v", alpha);
    b.link("u", "pv", "repression", K, n);
    b.flow("dv", "decay", "v", [380, 240], delta);
    b.link("v", "dv");
  });

// Elowitz & Leibler's ring of three repressors (proteins only).
const repressilator = () =>
  model({ T: 60, Trange: [5, 300], timeUnit: "" }, (b) => {
    const alpha = b.param("α", 10, 0, 20);
    const K = b.param("K", 1, 0.1, 5);
    const n = b.param("n", 3, 1, 6);
    const delta = b.param("δ", 1, 0, 3);
    // [id, symbol, position, its source cloud, its sink cloud]
    const genes: [string, string, ...[number, number][]][] = [
      ["A", "a", [240, 60], [50, 60], [420, 60]],
      ["B", "b", [240, 165], [50, 165], [420, 165]],
      ["C", "c", [240, 270], [50, 270], [420, 270]],
    ];
    genes.forEach(([id, symbol, at], i) => {
      b.stock(id, {
        name: `Repressor ${id}`,
        symbol,
        at,
        init: [1 + i / 2, 0, 5],
      });
    });
    genes.forEach(([id, , , source, sink], i) => {
      const prev = genes[(i + 2) % 3][0];
      b.flow(`p${id}`, `make ${id}`, source, id, alpha);
      b.link(prev, `p${id}`, "repression", K, n);
      b.flow(`d${id}`, "decay", id, sink, delta);
      b.link(id, `d${id}`);
    });
  });

// x′ = v, v′ = −k·x − c·v. Flows can run backwards: "motion" carries
// velocity into position, whatever its sign.
const spring = () =>
  model({ T: 40, Trange: [5, 200], timeUnit: "s" }, (b) => {
    const k = b.param("k", 1, 0, 4);
    const c = b.param("c", 0.2, 0, 2);
    b.stock("x", {
      name: "Position",
      symbol: "x",
      unit: "m",
      at: [215, 95],
      init: [1, -2, 2],
    });
    b.stock("v", {
      name: "Velocity",
      symbol: "v",
      unit: "m/s",
      at: [215, 235],
      init: [0, -2, 2],
    });
    b.flow("motion", "motion", [70, 95], "x");
    b.link("v", "motion");
    b.flow("spring", "spring force", "v", [410, 175], k);
    b.link("x", "spring");
    b.flow("friction", "friction", "v", [410, 290], c);
    b.link("v", "friction");
  });

const empty = () => model({ T: 10, Trange: [1, 100], timeUnit: "" }, () => {});

export const presets: { label: string; make: () => Model }[] = [
  { label: "glucose–insulin", make: glucose },
  { label: "Lotka–Volterra", make: lotkaVolterra },
  { label: "predator–prey (enrichment)", make: rosenzweigMacArthur },
  { label: "SIR epidemic", make: sir },
  { label: "fishery", make: fishery },
  { label: "toggle switch", make: toggle },
  { label: "repressilator", make: repressilator },
  { label: "damped spring", make: spring },
  { label: "empty", make: empty },
];
