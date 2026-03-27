import { produce } from "immer";
import { templateLiteralTagOrNot } from "../../utils";
import { assert } from "../../utils/assert";
import { hasKey } from "../../utils/js";
import * as PeggyPattern from "./peggy/pattern";

export type Tree = {
  id: string;
  label: string;
  children: Tree[];
  /** Variadic nodes accept any number of children; fixed-arity nodes have sockets */
  variadic?: boolean;
  /** For new nodes created by expanding rewrites, the ID of the element they emerge from */
  emergeFrom?: string;
  /** Controls emerge animation style: "clone" for split/merge, undefined for default fade */
  emergeMode?: "clone";
};

export function isOp(node: Tree): boolean {
  return node.label === "+" || node.label === "×";
}

export function isBinaryOp(node: Tree): boolean {
  return isOp(node) && node.children.length === 2;
}

// # rewrites

/**
 * A pattern is like a tree, but can have wildcards. A pattern
 * matches a tree if there is a way to substitute subtrees for the
 * wildcards to get the tree. Also, we are often interested in
 * matching a pattern in response to a node being "triggered" (by a
 * drag). A pattern can mark any number of nodes as "trigger" nodes,
 * meaning that at least one of those nodes must correspond to the
 * triggered node in order for the match to succeed.
 */
export type Pattern = { id: string; isTrigger?: boolean } & (
  | {
      type: "op";
      label: string;
      children: Pattern[];
    }
  | {
      type: "wildcard";
    }
);

export function isWildcard(
  node: Pattern,
): node is Pattern & { type: "wildcard" } {
  return hasKey(node, "type") && node.type === "wildcard";
}

// # microlang

export const pattern = templateLiteralTagOrNot((s: string): Pattern => {
  return processPattern(PeggyPattern.parse(s));
});

function processPattern(node: PeggyPattern.Pattern): Pattern {
  const isTrigger = node[0] === "#";

  const contents = node[2];
  if (typeof contents === "string") {
    return {
      type: "wildcard",
      id: contents,
      isTrigger,
    };
  } else {
    const op = contents[2];
    const children = contents[4];
    return {
      type: "op",
      label: op[0],
      id: op[0] + (op[1] ?? ""),
      children: children.map(processPattern),
      isTrigger,
    };
  }
}

// # rewrites

export type Rewrite = {
  from: Pattern;
  to: Pattern;
};

export function rewr(from: string, to: string): Rewrite {
  return {
    from: pattern(from),
    to: pattern(to),
  };
}

export type Match = {
  wildcards: Map<string, Tree>;
  ops: Map<string, Tree>;
};

/**
 * Check if two trees have the same shape (same labels and children
 * structure), ignoring IDs. Used to verify that repeated wildcards
 * in a pattern match compatible subtrees.
 */
function structurallyEqual(a: Tree, b: Tree): boolean {
  if (a.label !== b.label) return false;
  if (a.children.length !== b.children.length) return false;
  return a.children.every((c, i) => structurallyEqual(c, b.children[i]));
}

/**
 * Attempt to match a pattern against a tree. If successful, returns
 * a Match with wildcard bindings and op node mappings. If not
 * successful, returns null.
 */
function match(pattern: Pattern, tree: Tree, triggerId: string): Match | null {
  const result = matchHelper(pattern, tree, triggerId);
  if (result === null || !result.isTriggered) {
    return null;
  } else {
    return result.match;
  }
}

function matchHelper(
  pattern: Pattern,
  tree: Tree,
  triggerId: string,
): { match: Match; isTriggered: boolean } | null {
  let result: { match: Match; isTriggered: boolean } = {
    match: { wildcards: new Map(), ops: new Map() },
    isTriggered: !!(pattern.isTrigger && tree.id === triggerId),
  };
  if (isWildcard(pattern)) {
    const existing = result.match.wildcards.get(pattern.id);
    if (existing !== undefined) {
      if (!structurallyEqual(existing, tree)) return null;
    } else {
      result.match.wildcards.set(pattern.id, tree);
    }
    return result;
  } else {
    if (pattern.label !== tree.label) {
      return null;
    }
    if (pattern.children.length !== tree.children.length) {
      return null;
    }
    for (let i = 0; i < pattern.children.length; i++) {
      const childPattern = pattern.children[i];
      const childTree = tree.children[i];
      const childResult = matchHelper(childPattern, childTree, triggerId);
      if (childResult === null) {
        return null;
      }
      // Merge wildcard bindings (repeated wildcards must be structurally equal)
      for (const [key, value] of childResult.match.wildcards.entries()) {
        const existing = result.match.wildcards.get(key);
        if (existing !== undefined) {
          if (!structurallyEqual(existing, value)) return null;
          // Prefer the triggered copy so the dragged node's ID survives in output
          if (value.id === triggerId) {
            result.match.wildcards.set(key, value);
          }
        } else {
          result.match.wildcards.set(key, value);
        }
      }
      // Merge op bindings (repeated ops just keep first match)
      for (const [key, value] of childResult.match.ops.entries()) {
        if (!result.match.ops.has(key)) {
          result.match.ops.set(key, value);
        }
      }
      result.isTriggered = result.isTriggered || childResult.isTriggered;
    }
    result.match.ops.set(pattern.id, tree);
    return result;
  }
}

// Global counter for generating unique IDs in expanding rewrites
let globalIdCounter = 0;

/**
 * If a tree has matched the LHS of a rewrite, resulting in a match,
 * this function applies the rewrite to produce a new tree.
 *
 * For "expanding" rewrites where the RHS has operators that don't exist
 * in the LHS (e.g., `A → (+ (0) A)`), new IDs are generated based on
 * the triggerId. New nodes "emerge from" the trigger conceptually.
 *
 * When a wildcard or op appears multiple times in the RHS (e.g.,
 * distributivity: `(× A (+ B C)) → (+ (× A B) (× A C))`), the first
 * use gets the original IDs, and subsequent uses are cloned with fresh
 * IDs and emergeFrom pointing to the originals.
 */
export function applyRewrite(
  match: Match,
  rewriteTo: Pattern,
  triggerId: string,
): Tree {
  function generateId(patternId: string): string {
    globalIdCounter++;
    return `${triggerId}-${patternId}-${globalIdCounter}`;
  }

  /** Clone a subtree with fresh IDs, each node emerging from its original. */
  function cloneWithEmerge(tree: Tree): Tree {
    return {
      id: generateId(tree.id),
      label: tree.label,
      children: tree.children.map(cloneWithEmerge),
      emergeFrom: tree.id,
      emergeMode: "clone",
    };
  }

  const consumed = new Set<string>();

  function build(pattern: Pattern): Tree {
    if (isWildcard(pattern)) {
      const subtree = match.wildcards.get(pattern.id);
      assert(subtree !== undefined);
      if (consumed.has(pattern.id)) {
        return cloneWithEmerge(subtree);
      }
      consumed.add(pattern.id);
      return subtree;
    }
    const matchedOp = match.ops.get(pattern.id);
    if (matchedOp !== undefined) {
      if (consumed.has("op:" + pattern.id)) {
        // Second use of this op — new ID, emerging from original
        return {
          id: generateId(pattern.id),
          label: pattern.label,
          children: pattern.children.map(build),
          emergeFrom: matchedOp.id,
        };
      }
      consumed.add("op:" + pattern.id);
      return {
        id: matchedOp.id,
        label: pattern.label,
        children: pattern.children.map(build),
      };
    } else {
      // Op not in match — expanding rewrite, emerge from trigger
      return {
        id: generateId(pattern.id),
        label: pattern.label,
        children: pattern.children.map(build),
        emergeFrom: triggerId,
      };
    }
  }

  return build(rewriteTo);
}

/**
 * Given a tree and a set of rewrites, return all possible trees
 * resulting from applying rewrites at any depth in the tree,
 * triggered by the node with triggerId.
 */
export function allPossibleRewrites(
  tree: Tree,
  rewrites: Rewrite[],
  triggerId: string,
): Tree[] {
  const results: Tree[] = [];

  for (const rewrite of rewrites) {
    const matchResult = match(rewrite.from, tree, triggerId);
    if (matchResult !== null) {
      results.push(applyRewrite(matchResult, rewrite.to, triggerId));
    }
  }

  for (const [i, child] of tree.children.entries()) {
    const childRewrites = allPossibleRewrites(child, rewrites, triggerId);
    for (const newChild of childRewrites) {
      results.push(
        produce(tree, (draft) => {
          draft.children[i] = newChild;
        }),
      );
    }
  }

  return results;
}
