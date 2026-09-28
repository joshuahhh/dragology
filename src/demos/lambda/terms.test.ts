import { describe, expect, it } from "vitest";
import {
  allNodes,
  candidates,
  findById,
  parseTerm,
  printTerm,
  RewriteOptions,
  substitute,
  Term,
} from "./terms";

const allOn: RewriteOptions = {
  beta: true,
  abstract: true,
  abstractAllOccurrences: false,
  etaExpand: true,
  etaReduce: true,
};

const off: RewriteOptions = {
  beta: false,
  abstract: false,
  abstractAllOccurrences: false,
  etaExpand: false,
  etaReduce: false,
};

function byName(t: Term, name: string): Term {
  const found = allNodes(t).find((n) => n.type === "var" && n.name === name);
  if (!found) throw new Error(`no var ${name}`);
  return found;
}

describe("parse/print", () => {
  it("round-trips", () => {
    for (const s of [
      "x",
      "x y",
      "x y z",
      "x (y z)",
      "λx. x",
      "λx y. x y",
      "(λx. x x) (λx. x x)",
      "λf x. f (f x)",
      "(λn f x. f (n f x)) (λf x. f (f x))",
    ]) {
      expect(printTerm(parseTerm(s))).toBe(s);
    }
  });

  it("accepts backslash", () => {
    expect(printTerm(parseTerm("\\x. x"))).toBe("λx. x");
  });

  it("assigns unique ids", () => {
    const t = parseTerm("(λx. x x) (λx. x x)");
    const ids = allNodes(t).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("substitute", () => {
  it("keeps the arg's ids for the first occurrence and clones the rest", () => {
    const body = parseTerm("x (y x)", "b");
    const arg = parseTerm("a b", "a");
    const { term, count } = substitute(body, "x", arg);
    expect(count).toBe(2);
    expect(printTerm(term)).toBe("a b (y (a b))");
    expect(findById(term, arg.id)).toBe(arg);
    const nodes = allNodes(term);
    const clones = nodes.filter((n) => n.emergeFrom !== undefined);
    expect(clones.map((n) => n.emergeFrom).sort()).toEqual(
      allNodes(arg)
        .map((n) => n.id)
        .sort(),
    );
    expect(clones.every((n) => n.emergeMode === "clone")).toBe(true);
  });

  it("skips shadowed occurrences in waypoints", () => {
    const t = parseTerm("(λx. x (λx. x) x) y");
    const cs = candidates(t, byName(t, "y").id, { ...off, beta: true });
    expect(cs.map((c) => printTerm(c.mid!))).toEqual([
      "(λx. y (λx. x) x) _",
      "(λx. x (λx. x) y) _",
    ]);
  });

  it("respects shadowing", () => {
    const body = parseTerm("x (λx. x)", "b");
    const { term, count } = substitute(body, "x", parseTerm("y", "a"));
    expect(count).toBe(1);
    expect(printTerm(term)).toBe("y (λx. x)");
  });

  it("avoids capture by α-renaming", () => {
    const body = parseTerm("λy. x y", "b");
    const { term } = substitute(body, "x", parseTerm("y", "a"));
    expect(printTerm(term)).toBe("λy'. y y'");
  });
});

describe("candidates", () => {
  it("β-reduces by dragging the argument", () => {
    const t = parseTerm("(λx. x x) y");
    const y = byName(t, "y");
    const cs = candidates(t, y.id, { ...off, beta: true });
    // one candidate per occurrence; the dragged y lands on a different one each time
    expect(cs.map((c) => printTerm(c.result))).toEqual(["y y", "y y"]);
    const roots = cs.map((c) => c.result as Term & { type: "app" });
    expect(roots[0].fn.id).toBe(y.id);
    expect(roots[1].arg.id).toBe(y.id);
    expect(roots[0].arg.emergeFrom).toBe(y.id);
    expect(roots[1].fn.emergeFrom).toBe(y.id);
    // waypoints: y sits on that occurrence, a hole where it came from
    expect(cs.map((c) => printTerm(c.mid!))).toEqual([
      "(λx. y x) _",
      "(λx. x y) _",
    ]);
    const mid1 = cs[1].mid as Term & { type: "app" };
    expect((mid1.fn as Term & { type: "lam" }).body).toMatchObject({
      type: "app",
      arg: { id: y.id },
    });
    expect(mid1.arg).toMatchObject({ type: "hole", of: { id: y.id } });
  });

  it("does not β-reduce when the argument would vanish", () => {
    const t = parseTerm("(λx. z) y");
    const cs = candidates(t, byName(t, "y").id, { ...off, beta: true });
    expect(cs).toEqual([]);
  });

  it("does not β-reduce when dragging the function", () => {
    const t = parseTerm("(λx. x) y");
    const lam = (t as Term & { type: "app" }).fn;
    expect(candidates(t, lam.id, { ...off, beta: true })).toEqual([]);
  });

  it("abstracts over each ancestor", () => {
    const t = parseTerm("f (g a)");
    const a = byName(t, "a");
    const cs = candidates(t, a.id, { ...off, abstract: true });
    expect(cs.map((c) => printTerm(c.result))).toEqual([
      "f ((λx. g x) a)",
      "(λx. f (g x)) a",
    ]);
    // the dragged node survives with its id in every result
    for (const c of cs) expect(findById(c.result, a.id)?.id).toBe(a.id);
  });

  it("does not abstract past a binder that would change binding", () => {
    const t = parseTerm("λy. f y");
    const y = byName(t, "y");
    const cs = candidates(t, y.id, { ...off, abstract: true });
    expect(cs.map((c) => printTerm(c.result))).toEqual(["λy. (λx. f x) y"]);
  });

  it("abstracts all identical occurrences, merging copies", () => {
    const t = parseTerm("f (g a) (g a)");
    const ga = allNodes(t).find(
      (n) => n.type === "app" && printTerm(n) === "g a",
    )!;
    const cs = candidates(t, ga.id, {
      ...off,
      abstract: true,
      abstractAllOccurrences: true,
    });
    expect(cs.map((c) => printTerm(c.result))).toEqual([
      "(λx. f x) (g a) (g a)",
      "(λx. f x x) (g a)",
    ]);
    // the other copy in `base` is annotated to merge into the dragged node
    const merging = allNodes(cs[1].base).filter((n) => n.emergeFrom);
    expect(merging.map((n) => n.emergeFrom).sort()).toEqual(
      allNodes(ga)
        .map((n) => n.id)
        .sort(),
    );
  });

  it("η-expands and η-reduces", () => {
    const t = parseTerm("f");
    const cs = candidates(t, t.id, { ...off, etaExpand: true });
    expect(cs.map((c) => printTerm(c.result))).toEqual(["λx. f x"]);

    const t2 = parseTerm("λx. f x");
    const f = byName(t2, "f");
    const cs2 = candidates(t2, f.id, { ...off, etaReduce: true });
    expect(cs2.map((c) => printTerm(c.result))).toEqual(["f"]);

    const t3 = parseTerm("λx. x x");
    const cs3 = candidates(t3, byName(t3, "x").id, { ...off, etaReduce: true });
    expect(cs3).toEqual([]);
  });

  it("strips stale emerge annotations from base", () => {
    const t = parseTerm("(λx. x x) y");
    const y = byName(t, "y");
    const reduced = candidates(t, y.id, allOn).find(
      (c) => c.kind === "beta",
    )!.result;
    expect(allNodes(reduced).some((n) => n.emergeFrom)).toBe(true);
    const next = candidates(reduced, y.id, allOn);
    for (const c of next) {
      if (c.kind !== "abstract") {
        expect(allNodes(c.base).some((n) => n.emergeFrom)).toBe(false);
      }
    }
  });
});
