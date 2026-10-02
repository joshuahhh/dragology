import { describe, expect, it } from "vitest";
import { Model, parseModel, simulate, sweep, tidy } from "./model";
import { presets } from "./presets";

const preset = (label: string) =>
  presets.find((p) => p.label === label)!.make();

const last = (m: Model, s: string) => {
  const vs = simulate(m).values[s];
  return vs[vs.length - 1];
};

/** Range over the last fifth of the run. */
const swing = (m: Model, s: string) => {
  const vs = simulate(m).values[s];
  const tail = vs.slice(Math.floor(vs.length * 0.8));
  return Math.max(...tail) - Math.min(...tail);
};

const withParam = (m: Model, label: string, value: number): Model => {
  const [id] = Object.entries(m.params).find(([, p]) => p.label === label)!;
  return { ...m, params: { ...m.params, [id]: { ...m.params[id], value } } };
};

describe("stock-and-flow presets", () => {
  it("glucose–insulin settles where the textbook's steady state is", () => {
    // Q_L = λx + νxy with y = β/α (x − φ), for x ≤ θ
    const m = { ...preset("glucose–insulin"), T: 48 };
    const x = last(m, "G");
    const y = last(m, "I");
    expect(y).toBeCloseTo((1430 / 7600) * (x - 0.51), 4);
    expect(2470 * x + 139000 * x * y).toBeCloseTo(8400, -1);
    expect(x).toBeCloseTo(0.81, 2);
  });

  it("without insulin, glucose spills into the urine", () => {
    const m = withParam({ ...preset("glucose–insulin"), T: 48 }, "β", 0);
    // Q_L = λx + μ(x − θ)
    expect(last(m, "G")).toBeCloseTo((8400 + 7200 * 2.5) / (2470 + 7200), 2);
  });

  it("predator–prey cycles past the critical carrying capacity", () => {
    const m = preset("predator–prey (enrichment)");
    expect(swing(withParam(m, "K", 1.8), "prey")).toBeLessThan(0.01);
    expect(swing(withParam(m, "K", 4), "prey")).toBeGreaterThan(0.5);
  });

  it("the repressilator oscillates", () => {
    expect(swing(preset("repressilator"), "A")).toBeGreaterThan(1);
  });

  it("the toggle switch remembers which gene started ahead", () => {
    const m = preset("toggle switch");
    expect(last(m, "u")).toBeGreaterThan(last(m, "v"));
    const flipped = withParam(m, "u_0", 0.5);
    expect(last(flipped, "u")).toBeLessThan(last(flipped, "v"));
  });

  it("SIR: no epidemic below R₀ = 1", () => {
    const m = preset("SIR epidemic");
    expect(last(withParam(m, "β", 0.05), "R")).toBeLessThan(0.05);
    expect(last(m, "R")).toBeGreaterThan(0.8);
  });

  it("the fishery collapses when overharvested", () => {
    const m = preset("fishery");
    expect(last(m, "fish")).toBeGreaterThan(50);
    expect(last(withParam(m, "H", 16), "fish")).toBeLessThan(5);
  });

  it("sweeps give one band per swept value", () => {
    const m = preset("glucose–insulin");
    const beta = Object.keys(m.params).find((p) => m.params[p].label === "β")!;
    const sw = sweep(m, beta);
    expect(sw.bands.G).toHaveLength(sw.xs.length);
    // more insulin production, less glucose
    const mids = sw.bands.G.map((b) => b![0]);
    expect(mids[mids.length - 1]).toBeLessThan(mids[5]);
  });

  it("every preset runs without diverging and is already tidy", () => {
    for (const p of presets) {
      const m = p.make();
      expect(simulate(m).diverged, p.label).toBe(false);
      expect(tidy(m), p.label).toEqual(m);
    }
  });

  it("saved models load back as they were", () => {
    for (const p of presets) {
      const m = p.make();
      expect(parseModel(JSON.parse(JSON.stringify(m))), p.label).toEqual(m);
    }
  });

  it("refuses JSON that isn't a model", () => {
    expect(() => parseModel([1, 2])).toThrow();
    expect(() => parseModel({ stocks: {} })).toThrow(/flows/);
    const m = JSON.parse(JSON.stringify(preset("SIR epidemic")));
    delete m.params[m.stocks.S.init];
    expect(() => parseModel(m)).toThrow(/stock S/);
  });
});
