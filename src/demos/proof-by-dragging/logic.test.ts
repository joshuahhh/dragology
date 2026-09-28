import { describe, expect, it } from "vitest";
import {
  allIds,
  casesHypOr,
  findLoc,
  introGoalImp,
  link,
  linkTargets,
  Loc,
  parse,
  sequent,
  show,
  splitGoalAnd,
  State,
} from "./logic";

const mk = (hyps: string[], goal: string): State => ({
  goals: [sequent(hyps, goal)],
  history: [],
});

// Find the loc of the nth occurrence of a subformula (by display) in a
// given formula of the first sequent.
function loc(state: State, hypIndex: number | null, sub: string, n = 0): Loc {
  const g = state.goals[0];
  const root = hypIndex === null ? g.goal : g.hyps[hypIndex];
  const target = show(parse(sub));
  const matches: Loc[] = [];
  const walk = (f: typeof root, path: Loc["path"]) => {
    if (show(f) === target) matches.push({ goalId: g.id, hypIndex, path });
    if (f.kind === "and" || f.kind === "or" || f.kind === "imp") {
      walk(f.left, [...path, "left"]);
      walk(f.right, [...path, "right"]);
    }
  };
  walk(root, []);
  return matches[n];
}

const showState = (s: State) =>
  s.goals.map(
    (g) => `${g.hyps.map((h) => show(h)).join(", ")} ⊢ ${show(g.goal)}`,
  );

describe("parse/show", () => {
  it("round-trips with precedence", () => {
    expect(show(parse("p & q | r -> s -> t"))).toBe("p ∧ q ∨ r → s → t");
    expect(show(parse("(p -> q) -> r"))).toBe("(p → q) → r");
    expect(show(parse("p & (q | r)"))).toBe("p ∧ (q ∨ r)");
  });
});

describe("linkTargets", () => {
  it("finds opposite-polarity occurrences only", () => {
    const s = mk(["p", "p -> q"], "p & q");
    // hyp p (neg) links with goal p (pos) and with p in `p -> q` (pos)
    const targets = linkTargets(s, loc(s, 0, "p"));
    expect(targets.map((t) => [t.hypIndex, t.path])).toEqual([
      [null, ["left"]],
      [1, ["left"]],
    ]);
    // goal q (pos) links with q in `p -> q` (neg)
    const t2 = linkTargets(s, loc(s, null, "q"));
    expect(t2.map((t) => [t.hypIndex, t.path])).toEqual([[1, ["right"]]]);
  });
});

describe("link", () => {
  it("closes an atomic goal from an atomic hypothesis", () => {
    const s = mk(["p"], "p");
    const r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    expect(r.goals).toEqual([]);
  });

  it("modus ponens (backward)", () => {
    const s = mk(["p", "p -> q"], "q");
    const r = link(s, loc(s, 1, "q"), loc(s, null, "q"))!;
    expect(showState(r)).toEqual(["p, p → q ⊢ p"]);
  });

  it("modus ponens (forward)", () => {
    const s = mk(["p", "p -> q"], "q");
    const r = link(s, loc(s, 0, "p"), loc(s, 1, "p"))!;
    expect(showState(r)).toEqual(["p, q ⊢ q"]);
  });

  it("uses a conjunct", () => {
    const s = mk(["p & q"], "q & p");
    const r = link(s, loc(s, 0, "q"), loc(s, null, "q"))!;
    expect(showState(r)).toEqual(["p ∧ q ⊢ p"]);
  });

  it("proves a disjunction", () => {
    const s = mk(["q"], "p | q");
    const r = link(s, loc(s, 0, "q"), loc(s, null, "q"))!;
    expect(r.goals).toEqual([]);
  });

  it("case-splits a disjunctive hypothesis", () => {
    const s = mk(["p | q"], "p");
    const r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    expect(showState(r)).toEqual(["p ∨ q ⊢ q → p"]);
  });

  it("case-splits before ∨R", () => {
    const s = mk(["p | q"], "p | s");
    const r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    expect(showState(r)).toEqual(["p ∨ q ⊢ q → p ∨ s"]);
  });

  it("does →R before →L", () => {
    const s = mk(["p -> q"], "s -> q");
    const r = link(s, loc(s, 0, "q"), loc(s, null, "q"))!;
    expect(showState(r)).toEqual(["p → q ⊢ s → p"]);
  });

  it("links into the antecedent of the goal", () => {
    const s = mk(["p -> q"], "p -> q");
    const r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    expect(showState(r)).toEqual(["p → q ⊢ q → q"]);
  });

  it("forward: disjunction elimination via implication", () => {
    const s = mk(["p | q", "p -> r"], "r");
    const r = link(s, loc(s, 0, "p"), loc(s, 1, "p"))!;
    expect(showState(r)).toEqual(["p ∨ q, r ∨ q ⊢ r"]);
  });

  it("works in either drag direction", () => {
    const s = mk(["p", "p -> q"], "q");
    const r = link(s, loc(s, null, "q"), loc(s, 1, "q"))!;
    expect(showState(r)).toEqual(["p, p → q ⊢ p"]);
  });

  it("links whole compound formulas", () => {
    const s = mk(["p & q"], "(p & q) | r");
    const r = link(s, loc(s, 0, "p & q"), loc(s, null, "p & q"))!;
    expect(r.goals).toEqual([]);
  });

  it("keeps ids globally unique", () => {
    const s = mk(["p | q", "p -> r"], "r & (p | q)");
    let r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    expect(showState(r)).toEqual(["p ∨ q, p → r ⊢ r ∧ (q → p ∨ q)"]);
    const ids = new Set<string>();
    let count = 0;
    for (const g of r.goals) {
      for (const f of [g.goal, ...g.hyps]) {
        const fi = allIds(f);
        count += fi.size;
        for (const id of fi) ids.add(id);
      }
    }
    expect(ids.size).toBe(count);
    r = link(r, loc(r, 0, "p"), loc(r, 1, "p"))!;
    expect(showState(r)).toEqual(["p ∨ q, r ∨ q ⊢ r ∧ (q → p ∨ q)"]);
  });

  it("assigns emergeFrom to new nodes", () => {
    const s = mk(["p | q"], "p");
    const r = link(s, loc(s, 0, "p"), loc(s, null, "p"))!;
    const g = r.goals[0].goal;
    expect(g.kind).toBe("imp");
    expect(g.emergeFrom).toBeDefined();
    // the cloned q emerges from the original q
    const origQ = s.goals[0].hyps[0];
    expect(origQ.kind === "or" && g.kind === "imp" && g.left.emergeFrom).toBe(
      origQ.kind === "or" ? origQ.right.id : undefined,
    );
  });

  it("returns null for same-polarity links", () => {
    const s = mk(["p"], "p -> q");
    expect(linkTargets(s, loc(s, 0, "p"))).toEqual([]);
    expect(link(s, loc(s, 0, "p"), loc(s, null, "p"))).toBeNull();
  });
});

describe("click actions", () => {
  it("splits goal conjunction into two sequents", () => {
    const s = mk(["p"], "p & q");
    const r = splitGoalAnd(s, s.goals[0].id)!;
    expect(showState(r)).toEqual(["p ⊢ p", "p ⊢ q"]);
    expect(r.goals[1].hyps[0].id).not.toBe(r.goals[0].hyps[0].id);
  });
  it("intros implication", () => {
    const s = mk([], "p -> q -> p");
    const r = introGoalImp(s, s.goals[0].id)!;
    expect(showState(r)).toEqual(["p ⊢ q → p"]);
    expect(
      findLoc(r, s.goals[0].goal.kind === "imp" ? s.goals[0].goal.left.id : ""),
    ).not.toBeNull();
  });
  it("cases on a disjunction", () => {
    const s = mk(["p | q", "r"], "s");
    const r = casesHypOr(s, s.goals[0].id, 0)!;
    expect(showState(r)).toEqual(["p, r ⊢ s", "q, r ⊢ s"]);
  });
});

describe("a full proof", () => {
  it("(p ∨ q) ∧ (p → r) ∧ (q → r) → r", () => {
    let s = mk(["p | q", "p -> r", "q -> r"], "r");
    s = link(s, loc(s, 1, "r"), loc(s, null, "r"))!; // goal: p
    expect(showState(s)).toEqual(["p ∨ q, p → r, q → r ⊢ p"]);
    s = link(s, loc(s, 0, "p"), loc(s, null, "p"))!; // goal: q → p ... stuck
    expect(showState(s)).toEqual(["p ∨ q, p → r, q → r ⊢ q → p"]);
    // better route: forward
    let t = mk(["p | q", "p -> r", "q -> r"], "r");
    t = link(t, loc(t, 0, "p"), loc(t, 1, "p"))!;
    expect(showState(t)).toEqual(["p ∨ q, r ∨ q, q → r ⊢ r"]);
    t = link(t, loc(t, 1, "q"), loc(t, 2, "q"))!;
    expect(showState(t)).toEqual(["p ∨ q, r ∨ q, r ∨ r ⊢ r"]);
    t = link(t, loc(t, 2, "r", 0), loc(t, null, "r"))!;
    expect(showState(t)).toEqual(["p ∨ q, r ∨ q, r ∨ r ⊢ r → r"]);
    t = introGoalImp(t, t.goals[0].id)!;
    t = link(t, loc(t, 3, "r"), loc(t, null, "r"))!;
    expect(t.goals).toEqual([]);
  });
});
