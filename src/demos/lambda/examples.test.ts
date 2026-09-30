import { describe, expect, it } from "vitest";
import { ExampleName, examples } from "./examples";
import { allNodes, candidates, parseTerm, printTerm, Term } from "./terms";

const betaOnly = {
  beta: true,
  abstract: false,
  abstractAllOccurrences: false,
  etaExpand: false,
  etaReduce: false,
};

/**
 * One leftmost-outermost β-step, done the way the demo does it: by
 * "dragging" the redex's argument and taking the first β candidate.
 * Returns null at normal form; throws if a redex exists but the demo
 * can't offer it (argument would vanish).
 */
function step(t: Term): Term | null {
  const redex = allNodes(t).find(
    (n) => n.type === "app" && n.fn.type === "lam",
  ) as (Term & { type: "app" }) | undefined;
  if (!redex) return null;
  const beta = candidates(t, redex.arg.id, betaOnly).find(
    (c) => c.kind === "beta",
  );
  if (!beta) throw new Error(`stuck on ${printTerm(redex)} in ${printTerm(t)}`);
  return beta.result;
}

/** de Bruijn rendering, for comparing terms up to α-equivalence */
function db(t: Term, env: string[] = []): string {
  switch (t.type) {
    case "var": {
      const i = env.indexOf(t.name);
      return i === -1 ? t.name : `#${i}`;
    }
    case "lam":
      return `(λ ${db(t.body, [t.param, ...env])})`;
    case "app":
      return `(${db(t.fn, env)} ${db(t.arg, env)})`;
    case "hole":
      return "_";
  }
}

const alphaEq = (a: Term, b: Term) => db(a) === db(b);

function load(name: ExampleName): Term {
  return parseTerm(examples[name].src);
}

function normalize(t: Term, maxSteps = 50): { term: Term; steps: number } {
  for (let steps = 0; steps < maxSteps; steps++) {
    const next = step(t);
    if (!next) return { term: t, steps };
    t = next;
  }
  throw new Error(`no normal form within ${maxSteps} steps`);
}

describe("examples", () => {
  it("all parse", () => {
    for (const { src } of Object.values(examples)) parseTerm(src);
  });

  it.each([
    ["duplicate", "y y"],
    ["flip", "b a"],
    ["nested", "z"],
    ["K", "a"],
    ["if true", "a"],
    ["succ 2", "λf x. f (f (f x))"],
    ["1 + 2", "λf x. f (f (f x))"],
    ["2 × 2", "λf x. f (f (f (f x)))"],
    ["eta", "λx. f x"],
  ] as const)("%s normalizes to %s", (name, expected) => {
    const { term } = normalize(load(name));
    expect(db(term)).toBe(db(parseTerm(expected)));
  });

  it("Ω reduces to itself", () => {
    const t = load("Ω");
    const next = step(t)!;
    expect(alphaEq(next, t)).toBe(true);
    expect(alphaEq(step(next)!, t)).toBe(true);
  });

  it("Ω₃ grows at every step", () => {
    let t = load("Ω₃");
    let size = allNodes(t).length;
    for (let i = 0; i < 3; i++) {
      t = step(t)!;
      const newSize = allNodes(t).length;
      expect(newSize).toBeGreaterThan(size);
      size = newSize;
    }
  });

  it("Y g unrolls into g (g (… ))", () => {
    let t = step(load("Y g"))!; // Y g → Y′ g, the self-applying core
    const core = t;
    for (let depth = 1; depth <= 3; depth++) {
      t = step(t)!;
      // t = g (g (… (core)))
      let inner = t;
      for (let i = 0; i < depth; i++) {
        expect(inner.type).toBe("app");
        const app = inner as Term & { type: "app" };
        expect(printTerm(app.fn)).toBe("g");
        inner = app.arg;
      }
      expect(alphaEq(inner, core)).toBe(true);
    }
  });
});
