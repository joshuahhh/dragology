import { assert } from "../../utils/assert";

// # Terms

type Common = {
  id: string;
  /** For nodes created by a rewrite: the ID of the element they emerge from */
  emergeFrom?: string;
  /** "clone" for split/merge animation, undefined for default fade */
  emergeMode?: "clone";
};

export type Term = Common &
  (
    | { type: "var"; name: string }
    | { type: "lam"; param: string; body: Term }
    | { type: "app"; fn: Term; arg: Term }
    /** An empty slot reserving the space of `of`; only used in mid-drag states */
    | { type: "hole"; of: Term }
  );

export function newId(): string {
  return "n-" + Math.random().toString(36).slice(2, 10);
}

// # Parsing
//
// Grammar:
//   term := 'λ' name+ '.' term | atom+
//   atom := name | '(' term ')'
// A backslash works as λ too. Multi-arg λ is sugar for nested λs.

export function parseTerm(src: string, idPrefix = "t"): Term {
  let pos = 0;
  let counter = 0;
  const id = () => `${idPrefix}${counter++}`;

  const skipWs = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };
  const peek = () => {
    skipWs();
    return src[pos];
  };
  const isNameChar = (c: string | undefined) =>
    c !== undefined && /[A-Za-z0-9_']/.test(c);
  const parseName = (): string => {
    skipWs();
    const start = pos;
    while (isNameChar(src[pos])) pos++;
    assert(
      pos > start,
      `expected a name at ${start} in ${JSON.stringify(src)}`,
    );
    return src.slice(start, pos);
  };

  const parseTermInner = (): Term => {
    const c = peek();
    if (c === "λ" || c === "\\") {
      pos++;
      const params: string[] = [];
      while (peek() !== ".") params.push(parseName());
      pos++; // '.'
      const body = parseTermInner();
      // Nested λs: outer ids first so ids read top-down
      const ids = params.map(() => id());
      return params.reduceRight<Term>(
        (acc, param, i) => ({ type: "lam", id: ids[i], param, body: acc }),
        body,
      );
    }
    let result: Term | null = null;
    for (;;) {
      const c = peek();
      let atom: Term;
      if (c === "(") {
        pos++;
        atom = parseTermInner();
        assert(peek() === ")", `expected ')' at ${pos}`);
        pos++;
      } else if (isNameChar(c)) {
        atom = { type: "var", id: id(), name: parseName() };
      } else {
        break;
      }
      result = result ? { type: "app", id: id(), fn: result, arg: atom } : atom;
    }
    assert(result !== null, `expected a term at ${pos}`);
    return result;
  };

  const result = parseTermInner();
  skipWs();
  assert(
    pos === src.length,
    `unexpected ${JSON.stringify(src[pos])} at ${pos}`,
  );
  return result;
}

export function printTerm(t: Term): string {
  switch (t.type) {
    case "var":
      return t.name;
    case "hole":
      return "_";
    case "lam": {
      // collapse nested λs
      const params = [t.param];
      let body = t.body;
      while (body.type === "lam") {
        params.push(body.param);
        body = body.body;
      }
      return `λ${params.join(" ")}. ${printTerm(body)}`;
    }
    case "app": {
      const fn = t.fn.type === "lam" ? `(${printTerm(t.fn)})` : printTerm(t.fn);
      const arg =
        t.arg.type === "var" || t.arg.type === "hole"
          ? printTerm(t.arg)
          : `(${printTerm(t.arg)})`;
      return `${fn} ${arg}`;
    }
  }
}

// # Traversal helpers

export function children(t: Term): Term[] {
  switch (t.type) {
    case "var":
    case "hole":
      return [];
    case "lam":
      return [t.body];
    case "app":
      return [t.fn, t.arg];
  }
}

export function allNodes(t: Term): Term[] {
  return [t, ...children(t).flatMap(allNodes)];
}

export function findById(t: Term, id: string): Term | null {
  return allNodes(t).find((n) => n.id === id) ?? null;
}

/** Path from root to the node with the given id (inclusive), or null. */
export function pathTo(t: Term, id: string): Term[] | null {
  if (t.id === id) return [t];
  for (const c of children(t)) {
    const p = pathTo(c, id);
    if (p) return [t, ...p];
  }
  return null;
}

export function replaceById(t: Term, id: string, replacement: Term): Term {
  if (t.id === id) return replacement;
  switch (t.type) {
    case "var":
    case "hole":
      return t;
    case "lam": {
      const body = replaceById(t.body, id, replacement);
      return body === t.body ? t : { ...t, body };
    }
    case "app": {
      const fn = replaceById(t.fn, id, replacement);
      const arg = replaceById(t.arg, id, replacement);
      return fn === t.fn && arg === t.arg ? t : { ...t, fn, arg };
    }
  }
}

export function freeVars(t: Term): Set<string> {
  switch (t.type) {
    case "var":
      return new Set([t.name]);
    case "hole":
      return new Set();
    case "lam": {
      const fv = freeVars(t.body);
      fv.delete(t.param);
      return fv;
    }
    case "app":
      return new Set([...freeVars(t.fn), ...freeVars(t.arg)]);
  }
}

export function allNames(t: Term): Set<string> {
  const names = new Set<string>();
  for (const n of allNodes(t)) {
    if (n.type === "var") names.add(n.name);
    if (n.type === "lam") names.add(n.param);
  }
  return names;
}

const FRESH_CANDIDATES = ["x", "y", "z", "w", "u", "v", "s", "t"];

export function freshName(avoid: Set<string>, hint?: string): string {
  if (hint !== undefined) {
    let name = hint;
    while (avoid.has(name)) name += "'";
    return name;
  }
  for (const c of FRESH_CANDIDATES) if (!avoid.has(c)) return c;
  return freshName(avoid, "x");
}

/** Structural equality, ignoring ids and emerge annotations. */
export function structurallyEqual(a: Term, b: Term): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "var":
      return a.name === (b as typeof a).name;
    case "hole":
      return false;
    case "lam": {
      const bb = b as typeof a;
      return a.param === bb.param && structurallyEqual(a.body, bb.body);
    }
    case "app": {
      const bb = b as typeof a;
      return structurallyEqual(a.fn, bb.fn) && structurallyEqual(a.arg, bb.arg);
    }
  }
}

/** Remove emerge annotations everywhere (used to start each drag clean). */
export function stripEmerge(t: Term): Term {
  const { emergeFrom: _e, emergeMode: _m, ...rest } = t;
  const base = rest as Term;
  switch (base.type) {
    case "var":
    case "hole":
      return base;
    case "lam":
      return { ...base, body: stripEmerge(base.body) };
    case "app":
      return { ...base, fn: stripEmerge(base.fn), arg: stripEmerge(base.arg) };
  }
}

/** Clone a subtree with fresh IDs, each node emerging (clone-style) from its original. */
export function cloneWithEmerge(t: Term): Term {
  const common = {
    id: newId(),
    emergeFrom: t.id,
    emergeMode: "clone" as const,
  };
  switch (t.type) {
    case "var":
      return { ...common, type: "var", name: t.name };
    case "hole":
      return { ...common, type: "hole", of: t.of };
    case "lam":
      return {
        ...common,
        type: "lam",
        param: t.param,
        body: cloneWithEmerge(t.body),
      };
    case "app":
      return {
        ...common,
        type: "app",
        fn: cloneWithEmerge(t.fn),
        arg: cloneWithEmerge(t.arg),
      };
  }
}

/** Rename free occurrences of `from` to `to` (which must be fresh), keeping ids. */
function rename(t: Term, from: string, to: string): Term {
  switch (t.type) {
    case "var":
      return t.name === from ? { ...t, name: to } : t;
    case "hole":
      return t;
    case "lam":
      if (t.param === from) return t;
      return { ...t, body: rename(t.body, from, to) };
    case "app":
      return { ...t, fn: rename(t.fn, from, to), arg: rename(t.arg, from, to) };
  }
}

// # Substitution

/**
 * Capture-avoiding substitution body[x := arg]. The occurrence of x with
 * index `targetIndex` (in left-to-right order) receives `arg` itself
 * (keeping its ids); the other occurrences receive clones that emerge from
 * `arg`. Returns the number of occurrences replaced.
 */
export function substitute(
  body: Term,
  x: string,
  arg: Term,
  targetIndex = 0,
): { term: Term; count: number } {
  const fvArg = freeVars(arg);
  let count = 0;

  function go(t: Term): Term {
    switch (t.type) {
      case "hole":
        return t;
      case "var":
        if (t.name !== x) return t;
        count++;
        return count - 1 === targetIndex ? arg : cloneWithEmerge(arg);
      case "lam": {
        if (t.param === x) return t; // shadowed
        if (fvArg.has(t.param) && freeVars(t.body).has(x)) {
          // would capture: α-rename this binder first
          const avoid = new Set([...fvArg, ...allNames(t.body), x]);
          const fresh = freshName(avoid, t.param);
          return {
            ...t,
            param: fresh,
            body: go(rename(t.body, t.param, fresh)),
          };
        }
        return { ...t, body: go(t.body) };
      }
      case "app":
        return { ...t, fn: go(t.fn), arg: go(t.arg) };
    }
  }

  const term = go(body);
  return { term, count };
}

// # Rewrites triggered by dragging a node

export type RewriteKind = "beta" | "abstract" | "eta-expand" | "eta-reduce";

export type Candidate = {
  kind: RewriteKind;
  /** Rewrite starts here; renders identically to the input term. */
  base: Term;
  /**
   * Optional drag target standing in for `result`: the dragged node has
   * been moved to its destination, but the surrounding structure hasn't
   * collapsed yet. Dropping here completes the rewrite.
   */
  mid?: Term;
  result: Term;
  description: string;
};

export type RewriteOptions = {
  beta: boolean;
  abstract: boolean;
  abstractAllOccurrences: boolean;
  etaExpand: boolean;
  etaReduce: boolean;
};

/** Binder names on the path strictly below `top` down to (not including) `node`. */
function bindersBetween(path: Term[]): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const t = path[i];
    if (t.type === "lam") result.add(t.param);
  }
  return result;
}

/**
 * All rewrites of `term` in which the node `draggedId` is the thing being
 * dragged. The dragged node survives (with its id) in every result, so
 * `d.between` can track it.
 */
export function candidates(
  term: Term,
  draggedId: string,
  opts: RewriteOptions,
): Candidate[] {
  const base = stripEmerge(term);
  const path = pathTo(base, draggedId);
  if (!path) return [];
  const dragged = path[path.length - 1];
  const parent = path.length >= 2 ? path[path.length - 2] : null;
  const grandparent = path.length >= 3 ? path[path.length - 3] : null;
  const results: Candidate[] = [];
  const names = allNames(base);

  // β-reduction: dragged is the argument of an application to a λ
  if (
    opts.beta &&
    parent?.type === "app" &&
    parent.arg.id === dragged.id &&
    parent.fn.type === "lam"
  ) {
    const lam = parent.fn;
    // One candidate per occurrence: the dragged argument lands on that
    // occurrence (keeping its ids) and clones split off for the others.
    const { count } = substitute(lam.body, lam.param, dragged);
    for (let i = 0; i < count; i++) {
      const { term: reduced } = substitute(lam.body, lam.param, dragged, i);
      // Waypoint: every occurrence already replaced (so the clones emerge
      // during the drag), but the app/λ boxes still intact and a hole
      // marking where the argument came from. The same `reduced` subtree is
      // used in both, so the drop animation only has to collapse the boxes.
      const mid = replaceById(base, parent.id, {
        ...parent,
        fn: { ...lam, body: reduced },
        arg: { type: "hole", id: newId(), of: dragged },
      });
      results.push({
        kind: "beta",
        base,
        mid,
        result: replaceById(base, parent.id, reduced),
        description: `β: substitute ${printTerm(dragged)} for ${lam.param} (occurrence ${i + 1} of ${count})`,
      });
    }
  }

  // Abstraction (reverse β): pull dragged out of an ancestor A, giving
  // (λx. A[x]) dragged.
  if (opts.abstract) {
    const fvDragged = freeVars(dragged);
    for (let i = path.length - 2; i >= 0; i--) {
      const ancestor = path[i];
      const subPath = path.slice(i);
      const binders = bindersBetween(subPath);
      if ([...binders].some((b) => fvDragged.has(b))) break; // would change binding
      const x = freshName(names);
      let body = ancestor;
      let mergeBase = base;
      if (opts.abstractAllOccurrences) {
        for (const occ of allNodes(ancestor)) {
          if (occ.id === dragged.id) continue;
          if (!structurallyEqual(occ, dragged)) continue;
          const occPath = pathTo(ancestor, occ.id)!;
          if ([...bindersBetween(occPath)].some((b) => fvDragged.has(b)))
            continue;
          if (!findById(body, occ.id)) continue; // inside an already-replaced occurrence
          body = replaceById(body, occ.id, {
            type: "var",
            id: newId(),
            name: x,
            emergeFrom: occ.id,
          });
          // Annotate the disappearing copy so it merges into the dragged node
          mergeBase = replaceById(
            mergeBase,
            occ.id,
            annotateMerge(occ, dragged),
          );
        }
      }
      body = replaceById(body, dragged.id, {
        type: "var",
        id: newId(),
        name: x,
        emergeFrom: dragged.id,
      });
      const lam: Term = {
        type: "lam",
        id: newId(),
        param: x,
        body,
        emergeFrom: ancestor.id,
      };
      const app: Term = {
        type: "app",
        id: newId(),
        fn: lam,
        arg: dragged,
        emergeFrom: ancestor.id,
      };
      results.push({
        kind: "abstract",
        base: mergeBase,
        result: replaceById(base, ancestor.id, app),
        description: `abstract ${printTerm(dragged)} out of ${printTerm(ancestor)}`,
      });
    }
  }

  // η-expansion: dragged → λx. dragged x
  if (opts.etaExpand) {
    const x = freshName(names);
    const lam: Term = {
      type: "lam",
      id: newId(),
      param: x,
      emergeFrom: dragged.id,
      body: {
        type: "app",
        id: newId(),
        emergeFrom: dragged.id,
        fn: dragged,
        arg: { type: "var", id: newId(), name: x, emergeFrom: dragged.id },
      },
    };
    results.push({
      kind: "eta-expand",
      base,
      result: replaceById(base, dragged.id, lam),
      description: `η-expand ${printTerm(dragged)}`,
    });
  }

  // η-reduction: λx. dragged x → dragged (x not free in dragged)
  if (
    opts.etaReduce &&
    parent?.type === "app" &&
    parent.fn.id === dragged.id &&
    parent.arg.type === "var" &&
    grandparent?.type === "lam" &&
    grandparent.param === parent.arg.name &&
    !freeVars(dragged).has(parent.arg.name)
  ) {
    results.push({
      kind: "eta-reduce",
      base,
      result: replaceById(base, grandparent.id, dragged),
      description: `η-reduce λ${parent.arg.name}. ${printTerm(dragged)} ${parent.arg.name}`,
    });
  }

  return results;
}

/** Mark each node of `copy` as emerging (clone-style) from the corresponding node of `original`. */
function annotateMerge(copy: Term, original: Term): Term {
  const common = { emergeFrom: original.id, emergeMode: "clone" as const };
  switch (copy.type) {
    case "var":
    case "hole":
      return { ...copy, ...common };
    case "lam":
      assert(original.type === "lam");
      return {
        ...copy,
        ...common,
        body: annotateMerge(copy.body, original.body),
      };
    case "app":
      assert(original.type === "app");
      return {
        ...copy,
        ...common,
        fn: annotateMerge(copy.fn, original.fn),
        arg: annotateMerge(copy.arg, original.arg),
      };
  }
}
