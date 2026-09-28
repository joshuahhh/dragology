/**
 * Propositional natural deduction via "subformula linking", after
 * Chaudhuri (2013) and the Actema drag-and-drop tactic (Donato,
 * Strub & Werner, 2022).
 *
 * A proof state is a list of open sequents (`Goal`s). Each sequent
 * has hypotheses and a goal formula. The main move is *linking*: the
 * user drags a subformula occurrence onto another occurrence of the
 * same formula with opposite polarity. The two formulas then interact
 * along the paths to the linked occurrences, rewriting the goal (for
 * hypothesis–goal links) or a hypothesis (for hypothesis–hypothesis
 * links).
 */

import { makeId } from "../../utils";

// # Formulas

export type Formula = { id: string; emergeFrom?: string } & (
  | { kind: "atom"; name: string }
  | { kind: "top" }
  | { kind: "bot" }
  | { kind: "and" | "or" | "imp"; left: Formula; right: Formula }
);

export type Binary = Formula & { kind: "and" | "or" | "imp" };

export type Side = "left" | "right";
export type Path = Side[];

export type Polarity = "pos" | "neg";

export type Goal = { id: string; hyps: Formula[]; goal: Formula };

export type State = {
  goals: Goal[];
  history: Goal[][];
  /** Ids of linkable drop targets, highlighted mid-drag. */
  highlight?: string[];
};

// ## Constructors

export const atom = (name: string): Formula => ({
  id: makeId(),
  kind: "atom",
  name,
});
export const top = (): Formula => ({ id: makeId(), kind: "top" });
export const bot = (): Formula => ({ id: makeId(), kind: "bot" });
export const and = (left: Formula, right: Formula): Formula => ({
  id: makeId(),
  kind: "and",
  left,
  right,
});
export const or = (left: Formula, right: Formula): Formula => ({
  id: makeId(),
  kind: "or",
  left,
  right,
});
export const imp = (left: Formula, right: Formula): Formula => ({
  id: makeId(),
  kind: "imp",
  left,
  right,
});

export function isBinary(f: Formula): f is Binary {
  return f.kind === "and" || f.kind === "or" || f.kind === "imp";
}

/** Structural equality, ignoring ids. */
export function equalFormulas(a: Formula, b: Formula): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "atom") return b.kind === "atom" && a.name === b.name;
  if (isBinary(a) && isBinary(b)) {
    return equalFormulas(a.left, b.left) && equalFormulas(a.right, b.right);
  }
  return true; // top/bot
}

export function subformulaAt(f: Formula, path: Path): Formula {
  let cur = f;
  for (const side of path) {
    if (!isBinary(cur)) throw new Error("bad path");
    cur = cur[side];
  }
  return cur;
}

export function polarityAt(root: Polarity, f: Formula, path: Path): Polarity {
  let pol = root;
  let cur = f;
  for (const side of path) {
    if (!isBinary(cur)) throw new Error("bad path");
    if (cur.kind === "imp" && side === "left") pol = flip(pol);
    cur = cur[side];
  }
  return pol;
}

export const flip = (p: Polarity): Polarity => (p === "pos" ? "neg" : "pos");

/** All subformula occurrences, with their paths. */
export function occurrences(f: Formula): { formula: Formula; path: Path }[] {
  const out: { formula: Formula; path: Path }[] = [];
  const go = (g: Formula, path: Path) => {
    out.push({ formula: g, path });
    if (isBinary(g)) {
      go(g.left, [...path, "left"]);
      go(g.right, [...path, "right"]);
    }
  };
  go(f, []);
  return out;
}

export function allIds(f: Formula, into: Set<string> = new Set()): Set<string> {
  into.add(f.id);
  if (isBinary(f)) {
    allIds(f.left, into);
    allIds(f.right, into);
  }
  return into;
}

/** Find the path to a node by id, or null. */
export function pathToId(f: Formula, id: string): Path | null {
  if (f.id === id) return [];
  if (isBinary(f)) {
    const l = pathToId(f.left, id);
    if (l) return ["left", ...l];
    const r = pathToId(f.right, id);
    if (r) return ["right", ...r];
  }
  return null;
}

/** Deep copy with fresh ids; each copy emerges from its original. */
export function cloneFresh(f: Formula): Formula {
  const base = { id: makeId(), emergeFrom: f.id };
  if (isBinary(f)) {
    return {
      ...base,
      kind: f.kind,
      left: cloneFresh(f.left),
      right: cloneFresh(f.right),
    };
  }
  if (f.kind === "atom") return { ...base, kind: "atom", name: f.name };
  return { ...base, kind: f.kind };
}

// # Linking

/**
 * Backward interaction `h ⊳ C`: `h` is a hypothesis (negative root),
 * `C` a goal (positive root). `ph`/`pC` are the paths to the linked
 * occurrences. Returns a new goal formula `C'` such that `h, C' ⊢ C`,
 * or null if the link is invalid.
 *
 * Rules are applied in order of invertibility (invertible rules
 * first), so the result is as general as possible. Nodes reused from
 * `h` or `C` keep their ids; the caller must freshen duplicates.
 */
export function back(
  h: Formula,
  ph: Path,
  C: Formula,
  pC: Path,
): Formula | null {
  // Invertible goal rules: ∧R, →R
  if (pC.length > 0 && isBinary(C) && C.kind !== "or") {
    const [side, ...rest] = pC;
    if (C.kind === "and") {
      const sub = back(h, ph, C[side], rest);
      return sub && replaceChild(C, side, sub);
    }
    // imp
    if (side === "right") {
      const sub = back(h, ph, C.right, rest);
      return sub && replaceChild(C, "right", sub);
    } else {
      // Link into the antecedent: it becomes a hypothesis alongside h.
      const sub = fwd(h, ph, C.left, rest);
      return sub && replaceChild(C, "left", sub);
    }
  }
  // Invertible hypothesis rules: ∧L, ∨L
  if (ph.length > 0 && isBinary(h) && h.kind !== "imp") {
    const [side, ...rest] = ph;
    if (h.kind === "and") {
      return back(h[side], rest, C, pC);
    }
    // or: case split. The linked case interacts; the other case
    // must prove C on its own.
    const other = side === "left" ? h.right : h.left;
    const sub = back(h[side], rest, C, pC);
    if (!sub) return null;
    const otherCase = imp(other, C);
    return side === "left" ? and(sub, otherCase) : and(otherCase, sub);
  }
  // Non-invertible goal rule: ∨R (keeping the other disjunct)
  if (pC.length > 0 && isBinary(C)) {
    const [side, ...rest] = pC;
    const sub = back(h, ph, C[side], rest);
    return sub && replaceChild(C, side, sub);
  }
  // Non-invertible hypothesis rule: →L
  if (ph.length > 0 && isBinary(h)) {
    const [side, ...rest] = ph;
    if (side === "right") {
      // To use A → B at B: prove A, and prove C using B.
      const sub = back(h.right, rest, C, pC);
      return sub && and(h.left, sub);
    }
    // Link into the antecedent of a hypothesis from a goal: both
    // positive, not linkable.
    return null;
  }
  // Both paths exhausted: identical formulas of opposite polarity.
  return equalFormulas(h, C) ? top() : null;
}

/**
 * Forward interaction `h ▷ X`: both are hypotheses. Returns a new
 * formula `X'` with `h, X ⊢ X'`, or null if the link is invalid.
 */
export function fwd(
  h: Formula,
  ph: Path,
  X: Formula,
  pX: Path,
): Formula | null {
  // Invertible: ∧, ∨ on either side (X first)
  if (pX.length > 0 && isBinary(X) && X.kind !== "imp") {
    const [side, ...rest] = pX;
    const sub = fwd(h, ph, X[side], rest);
    return sub && replaceChild(X, side, sub);
  }
  if (ph.length > 0 && isBinary(h) && h.kind !== "imp") {
    const [side, ...rest] = ph;
    const sub = fwd(h[side], rest, X, pX);
    if (!sub) return null;
    if (h.kind === "and") return sub;
    const other = side === "left" ? h.right : h.left;
    return side === "left" ? or(sub, other) : or(other, sub);
  }
  // Non-invertible: → on either side
  if (pX.length > 0 && isBinary(X)) {
    const [side, ...rest] = pX;
    if (side === "right") {
      const sub = fwd(h, ph, X.right, rest);
      return sub && replaceChild(X, "right", sub);
    } else {
      // h helps prove the antecedent.
      const sub = back(h, ph, X.left, rest);
      return sub && replaceChild(X, "left", sub);
    }
  }
  if (ph.length > 0 && isBinary(h)) {
    const [side, ...rest] = ph;
    if (side === "right") {
      const sub = fwd(h.right, rest, X, pX);
      return sub && imp(h.left, sub);
    } else {
      // X helps prove h's antecedent.
      const sub = back(X, pX, h.left, rest);
      return sub && imp(sub, h.right);
    }
  }
  // Two hypotheses of the same polarity: not linkable.
  return null;
}

function replaceChild(f: Binary, side: Side, child: Formula): Formula {
  return { ...f, [side]: child };
}

// # Simplification

/** Simplify ⊤/⊥ away, bottom-up. Keeps ids of surviving nodes. */
export function simplify(f: Formula): Formula {
  if (!isBinary(f)) return f;
  const l = simplify(f.left);
  const r = simplify(f.right);
  switch (f.kind) {
    case "and":
      if (l.kind === "top") return r;
      if (r.kind === "top") return l;
      if (l.kind === "bot") return l;
      if (r.kind === "bot") return r;
      break;
    case "or":
      if (l.kind === "top") return l;
      if (r.kind === "top") return r;
      if (l.kind === "bot") return r;
      if (r.kind === "bot") return l;
      break;
    case "imp":
      if (r.kind === "top") return r;
      if (l.kind === "top") return r;
      if (l.kind === "bot") return { id: f.id, kind: "top" };
      break;
  }
  if (l === f.left && r === f.right) return f;
  return { ...f, left: l, right: r };
}

/**
 * Give fresh ids to any node whose id is already taken (by `reserved`
 * or by an earlier node in this tree). Each renamed node emerges from
 * the original.
 */
export function freshenDuplicates(f: Formula, reserved: Set<string>): Formula {
  const seen = new Set(reserved);
  const go = (g: Formula): Formula => {
    let node = g;
    if (seen.has(g.id)) {
      node = { ...g, id: makeId(), emergeFrom: g.id };
    }
    seen.add(node.id);
    if (isBinary(node)) {
      const left = go(node.left);
      const right = go(node.right);
      if (left !== node.left || right !== node.right) {
        node = { ...node, left, right };
      }
    }
    return node;
  };
  return go(f);
}

/** Set `emergeFrom` on nodes that are new (not in `oldIds`) and lack one. */
export function setEmergeFrom(
  f: Formula,
  oldIds: Set<string>,
  origin: string,
): Formula {
  const go = (g: Formula): Formula => {
    let node = g;
    if (!oldIds.has(g.id) && g.emergeFrom === undefined) {
      node = { ...g, emergeFrom: origin };
    }
    if (isBinary(node)) {
      const left = go(node.left);
      const right = go(node.right);
      if (left !== node.left || right !== node.right) {
        node = { ...node, left, right };
      }
    }
    return node;
  };
  return go(f);
}

// # Proof states

export type Loc = { goalId: string; hypIndex: number | null; path: Path };

export function locRoot(goal: Goal, loc: Loc): Formula {
  return loc.hypIndex === null ? goal.goal : goal.hyps[loc.hypIndex];
}

export function locPolarity(goal: Goal, loc: Loc): Polarity {
  const root = locRoot(goal, loc);
  return polarityAt(loc.hypIndex === null ? "pos" : "neg", root, loc.path);
}

export function locFormula(goal: Goal, loc: Loc): Formula {
  return subformulaAt(locRoot(goal, loc), loc.path);
}

/** Locate a formula node by id anywhere in the state. */
export function findLoc(state: State, id: string): Loc | null {
  for (const goal of state.goals) {
    const gp = pathToId(goal.goal, id);
    if (gp) return { goalId: goal.id, hypIndex: null, path: gp };
    for (let i = 0; i < goal.hyps.length; i++) {
      const hp = pathToId(goal.hyps[i], id);
      if (hp) return { goalId: goal.id, hypIndex: i, path: hp };
    }
  }
  return null;
}

/**
 * All occurrences in the same sequent that `source` could be linked
 * with: structurally equal, opposite polarity, in a different formula.
 */
export function linkTargets(state: State, source: Loc): Loc[] {
  const goal = state.goals.find((g) => g.id === source.goalId);
  if (!goal) return [];
  const srcF = locFormula(goal, source);
  if (srcF.kind === "top" || srcF.kind === "bot") return [];
  const srcPol = locPolarity(goal, source);
  const out: Loc[] = [];
  const consider = (hypIndex: number | null) => {
    if (hypIndex === source.hypIndex) return;
    // goal-to-goal links aren't supported (handled by intro/split)
    if (hypIndex === null && source.hypIndex === null) return;
    const root = hypIndex === null ? goal.goal : goal.hyps[hypIndex];
    for (const occ of occurrences(root)) {
      if (!equalFormulas(occ.formula, srcF)) continue;
      const loc = { goalId: goal.id, hypIndex, path: occ.path };
      if (locPolarity(goal, loc) === srcPol) continue;
      out.push(loc);
    }
  };
  consider(null);
  goal.hyps.forEach((_, i) => consider(i));
  return out;
}

/** Everything that stays: ids of all formulas except `except`. */
function reservedIds(state: State, except: Formula | null): Set<string> {
  const ids = new Set<string>();
  for (const g of state.goals) {
    for (const f of [g.goal, ...g.hyps]) {
      if (f !== except) allIds(f, ids);
    }
  }
  return ids;
}

/**
 * Perform a link between `source` and `target`. Returns the new proof
 * state, or null if the link is invalid.
 */
export function link(state: State, source: Loc, target: Loc): State | null {
  const goal = state.goals.find((g) => g.id === source.goalId);
  if (!goal || target.goalId !== goal.id) return null;

  // Which formula gets replaced, and by what?
  let replaced: {
    hypIndex: number | null;
    formula: Formula;
    result: Formula;
    /** path within `formula` to the occurrence the drop landed on */
    dropPath: Path;
  };
  if (source.hypIndex === null || target.hypIndex === null) {
    // hypothesis–goal link (in either direction): rewrite the goal
    const hypLoc = source.hypIndex === null ? target : source;
    const goalLoc = source.hypIndex === null ? source : target;
    const h = goal.hyps[hypLoc.hypIndex!];
    const result = back(h, hypLoc.path, goal.goal, goalLoc.path);
    if (!result) return null;
    replaced = {
      hypIndex: null,
      formula: goal.goal,
      result,
      dropPath: goalLoc.path,
    };
  } else {
    // hypothesis–hypothesis link: rewrite the target hypothesis
    const h = goal.hyps[source.hypIndex];
    const X = goal.hyps[target.hypIndex];
    const result = fwd(h, source.path, X, target.path);
    if (!result) return null;
    replaced = {
      hypIndex: target.hypIndex,
      formula: X,
      result,
      dropPath: target.path,
    };
  }

  let result = simplify(replaced.result);
  const oldIds = allIds(replaced.formula);
  result = freshenDuplicates(result, reservedIds(state, replaced.formula));
  // New connective nodes emerge from the nearest surviving ancestor
  // of the drop target.
  const resultIds = allIds(result);
  let origin = goal.id;
  for (let i = replaced.dropPath.length; i >= 0; i--) {
    const anc = subformulaAt(replaced.formula, replaced.dropPath.slice(0, i));
    if (resultIds.has(anc.id)) {
      origin = anc.id;
      break;
    }
  }
  result = setEmergeFrom(result, oldIds, origin);

  const newGoal: Goal =
    replaced.hypIndex === null
      ? { ...goal, goal: result }
      : {
          ...goal,
          hyps: goal.hyps.map((h, i) => (i === replaced.hypIndex ? result : h)),
        };
  return commit(
    state,
    replaceGoal(state.goals, normalizeGoal(newGoal), goal.id),
  );
}

/** Remove trivial hypotheses; solve goals with ⊤ goal or ⊥ hypothesis. */
export function normalizeGoal(g: Goal): Goal | null {
  const hyps = g.hyps.filter((h) => h.kind !== "top");
  if (g.goal.kind === "top") return null;
  if (hyps.some((h) => h.kind === "bot")) return null;
  return { ...g, hyps };
}

function replaceGoal(goals: Goal[], newGoal: Goal | null, id: string) {
  const out: Goal[] = [];
  for (const g of goals) {
    if (g.id === id) {
      if (newGoal) out.push(newGoal);
    } else {
      out.push(g);
    }
  }
  return out;
}

export function commit(state: State, goals: Goal[]): State {
  return { goals, history: [...state.history, state.goals] };
}

export function undo(state: State): State {
  if (state.history.length === 0) return state;
  return {
    goals: state.history[state.history.length - 1],
    history: state.history.slice(0, -1),
  };
}

// ## Click actions on root connectives

/** Goal `A ∧ B` → two sequents. */
export function splitGoalAnd(state: State, goalId: string): State | null {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g || g.goal.kind !== "and") return null;
  const first: Goal = { ...g, goal: g.goal.left };
  const second: Goal = {
    id: makeId(),
    hyps: g.hyps.map(cloneFresh),
    goal: g.goal.right,
  };
  const goals = state.goals.flatMap((x) =>
    x.id === goalId ? [first, second] : [x],
  );
  return commit(state, goals);
}

/** Goal `A → B` → hypothesis A, goal B. */
export function introGoalImp(state: State, goalId: string): State | null {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g || g.goal.kind !== "imp") return null;
  const ng = normalizeGoal({
    ...g,
    hyps: [...g.hyps, g.goal.left],
    goal: g.goal.right,
  });
  return commit(state, replaceGoal(state.goals, ng, goalId));
}

/** Hypothesis `A ∧ B` → hypotheses A, B. */
export function splitHypAnd(
  state: State,
  goalId: string,
  hypIndex: number,
): State | null {
  const g = state.goals.find((x) => x.id === goalId);
  const h = g?.hyps[hypIndex];
  if (!g || !h || h.kind !== "and") return null;
  const hyps = [...g.hyps];
  hyps.splice(hypIndex, 1, h.left, h.right);
  return commit(state, replaceGoal(state.goals, { ...g, hyps }, goalId));
}

/** Hypothesis `A ∨ B` → two sequents, one per case. */
export function casesHypOr(
  state: State,
  goalId: string,
  hypIndex: number,
): State | null {
  const g = state.goals.find((x) => x.id === goalId);
  const h = g?.hyps[hypIndex];
  if (!g || !h || h.kind !== "or") return null;
  const first: Goal = {
    ...g,
    hyps: g.hyps.map((x, i) => (i === hypIndex ? h.left : x)),
  };
  const second: Goal = {
    id: makeId(),
    hyps: g.hyps.map((x, i) => (i === hypIndex ? h.right : cloneFresh(x))),
    goal: cloneFresh(g.goal),
  };
  const goals = state.goals.flatMap((x) =>
    x.id === goalId ? [first, second] : [x],
  );
  return commit(state, goals);
}

// # Parsing (for defining problems)

/**
 * Tiny parser: atoms are identifiers; `&` or `∧`, `|` or `∨`,
 * `->` or `→`, `T`/`⊤`, `F`/`⊥`; parens. Precedence: ∧ > ∨ > →
 * (→ right-associative).
 */
export function parse(src: string): Formula {
  const tokens =
    src.match(/->|→|∧|∨|&|\||\(|\)|⊤|⊥|[A-Za-z_][A-Za-z0-9_']*/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const parseImp = (): Formula => {
    const l = parseOr();
    if (peek() === "->" || peek() === "→") {
      next();
      return imp(l, parseImp());
    }
    return l;
  };
  const parseOr = (): Formula => {
    let l = parseAnd();
    while (peek() === "|" || peek() === "∨") {
      next();
      l = or(l, parseAnd());
    }
    return l;
  };
  const parseAnd = (): Formula => {
    let l = parseAtom();
    while (peek() === "&" || peek() === "∧") {
      next();
      l = and(l, parseAtom());
    }
    return l;
  };
  const parseAtom = (): Formula => {
    const t = next();
    if (t === "(") {
      const f = parseImp();
      if (next() !== ")") throw new Error("expected )");
      return f;
    }
    if (t === "T" || t === "⊤") return top();
    if (t === "F" || t === "⊥") return bot();
    if (t === undefined || !/^[A-Za-z_]/.test(t)) {
      throw new Error(`unexpected token ${t} in ${src}`);
    }
    return atom(t);
  };
  const f = parseImp();
  if (i !== tokens.length) throw new Error(`trailing tokens in ${src}`);
  return f;
}

export function sequent(hyps: string[], goal: string): Goal {
  return { id: makeId(), hyps: hyps.map(parse), goal: parse(goal) };
}

export function show(f: Formula, prec = 0): string {
  switch (f.kind) {
    case "atom":
      return f.name;
    case "top":
      return "⊤";
    case "bot":
      return "⊥";
    case "and": {
      const s = `${show(f.left, 3)} ∧ ${show(f.right, 3)}`;
      return prec > 2 ? `(${s})` : s;
    }
    case "or": {
      const s = `${show(f.left, 2)} ∨ ${show(f.right, 2)}`;
      return prec > 1 ? `(${s})` : s;
    }
    case "imp": {
      const s = `${show(f.left, 1)} → ${show(f.right, 0)}`;
      return prec > 0 ? `(${s})` : s;
    }
  }
}
