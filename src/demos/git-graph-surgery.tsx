import { produce } from "immer";
import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { altKey } from "../modifierKeys";
import { translate } from "../svgx/helpers";
import { makeId } from "../utils";

// # State

type Commit = {
  id: string;
  parent: string | null;
  message: string;
  /**
   * Creation order; stands in for the commit timestamp. Drives row &
   * lane ordering in the layout, and salts the hash (so a rewritten
   * commit gets a fresh hash even if it lands back where it was).
   */
  seq: number;
  /** Content hash, git-style: derived from parent hash, message, seq. */
  hash: string;
  /**
   * Unreachable from any ref after a rewrite. Ghosts stay in the
   * graph (faded, in their old spot) until the next operation sweeps
   * them away.
   */
  ghost?: boolean;
};

type State = {
  commits: Record<string, Commit>;
  refs: Record<string, string>; // branch name -> commit id
  nextSeq: number;
};

// # Hashing

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 7);
}

/** Recompute hashes of all live commits from their content. Ghosts keep
 *  their frozen hashes. Idempotent for commits whose content didn't change. */
function rehash(commits: Record<string, Commit>) {
  const memo = new Map<string, string>();
  const hashOf = (id: string): string => {
    const c = commits[id];
    if (c.ghost) return c.hash;
    const memoized = memo.get(id);
    if (memoized !== undefined) return memoized;
    const parentHash = c.parent ? hashOf(c.parent) : "";
    const h = fnv1a(`${parentHash}\n${c.message}\n${c.seq}`);
    memo.set(id, h);
    c.hash = h;
    return h;
  };
  for (const id in commits) hashOf(id);
}

// # Graph queries

function childrenOf(state: State): Map<string | null, Commit[]> {
  const kids = new Map<string | null, Commit[]>();
  for (const c of Object.values(state.commits)) {
    if (c.ghost) continue;
    let list = kids.get(c.parent);
    if (!list) kids.set(c.parent, (list = []));
    list.push(c);
  }
  for (const list of kids.values()) list.sort((a, b) => a.seq - b.seq);
  return kids;
}

/** X and all its live descendants, parents before children. */
function descendants(state: State, x: string): string[] {
  const kids = childrenOf(state);
  const out: string[] = [];
  const queue = [x];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const k of kids.get(id) ?? []) queue.push(k.id);
  }
  return out;
}

/** The maximal linear chain (each commit having exactly one child)
 *  containing X, in parent-to-child order. */
function linearRun(state: State, x: string): string[] {
  const kids = childrenOf(state);
  const numKids = (id: string) => (kids.get(id) ?? []).length;
  let first = x;
  for (;;) {
    const p = state.commits[first].parent;
    if (p === null || numKids(p) !== 1) break;
    first = p;
  }
  const run = [first];
  let cur = first;
  while (numKids(cur) === 1) {
    cur = kids.get(cur)![0].id;
    run.push(cur);
  }
  return run;
}

// # Operations

/** Rehash, and ghost out any live commit no longer reachable from a ref. */
function finalize(draft: State) {
  rehash(draft.commits);
  const reachable = new Set<string>();
  for (const tip of Object.values(draft.refs)) {
    let cur: string | null = tip;
    while (cur !== null && !reachable.has(cur)) {
      reachable.add(cur);
      cur = draft.commits[cur].parent;
    }
  }
  for (const c of Object.values(draft.commits)) {
    if (!c.ghost && !reachable.has(c.id)) c.ghost = true;
  }
}

/** Sweep away ghosts left by the previous operation. */
function gc(state: State): State {
  return produce(state, (draft) => {
    for (const c of Object.values(draft.commits)) {
      if (c.ghost) delete draft.commits[c.id];
    }
  });
}

/**
 * Rebase: re-parent X (and everything downstream of it) onto C. The
 * moved commits keep their ids (so the library tracks them moving) but
 * get fresh seqs & hashes; ghost copies with the old hashes are left
 * behind under fresh ids.
 */
function reparent(
  base: State,
  x: string,
  c: string,
  subtree: string[],
  ghostIds: Record<string, string>,
): State {
  return produce(base, (draft) => {
    for (const id of subtree) {
      const s = draft.commits[id];
      const gid = ghostIds[id];
      draft.commits[gid] = {
        ...s,
        id: gid,
        parent: id === x ? s.parent : ghostIds[s.parent!],
        ghost: true,
      };
    }
    draft.commits[x].parent = c;
    for (const id of subtree) draft.commits[id].seq = draft.nextSeq++;
    finalize(draft);
  });
}

/** Interactive rebase: rewrite a linear run into a new order. */
function reorderRun(base: State, run: string[], newOrder: string[]): State {
  const kids = childrenOf(base);
  return produce(base, (draft) => {
    const baseParent = draft.commits[run[0]].parent;
    const tailKids = kids.get(run[run.length - 1]) ?? [];
    newOrder.forEach((id, i) => {
      draft.commits[id].parent = i === 0 ? baseParent : newOrder[i - 1];
    });
    for (const k of tailKids) {
      draft.commits[k.id].parent = newOrder[newOrder.length - 1];
    }
    finalize(draft);
  });
}

/**
 * Cherry-pick X onto the branch `refName`. The dragged element (id X)
 * becomes the pick, so the library tracks it moving; a copy under a
 * fresh id takes over X's old spot, children, and refs.
 */
function cherryPick(
  base: State,
  x: string,
  refName: string,
  copyId: string,
): State {
  const kids = childrenOf(base);
  return produce(base, (draft) => {
    const orig = draft.commits[x];
    draft.commits[copyId] = { ...orig, id: copyId };
    for (const k of kids.get(x) ?? []) draft.commits[k.id].parent = copyId;
    for (const [name, tip] of Object.entries(draft.refs)) {
      if (tip === x) draft.refs[name] = copyId;
    }
    orig.parent = base.refs[refName];
    orig.seq = draft.nextSeq++;
    draft.refs[refName] = x;
    finalize(draft);
  });
}

function moveRef(base: State, name: string, c: string): State {
  return produce(base, (draft) => {
    draft.refs[name] = c;
    finalize(draft);
  });
}

// # Initial state

function makeInitialState(): State {
  const state: State = { commits: {}, refs: {}, nextSeq: 0 };
  const add = (message: string, parent: string | null) => {
    const id = makeId();
    state.commits[id] = { id, parent, message, seq: state.nextSeq++, hash: "" };
    return id;
  };
  const root = add("Initial commit", null);
  const a = add("Add README", root);
  const b = add("Set up build", a);
  const c = add("Add CLI entry point", b);
  const d = add("Add login form", a);
  const e = add("Wire up auth", d);
  const f = add("Fix typo in login", e);
  const g = add("Bump version", c);
  state.refs = { main: c, feature: f, hotfix: g };
  rehash(state.commits);
  return state;
}

// # Layout
//
// git-log style: one commit per row, graph lanes on the left, hash &
// message in a text column on the right. Rows come from a depth-first
// walk (newest child first, so a freshly rebased chain lands right
// under its new base); lanes let the oldest child continue its
// parent's lane while newer siblings branch off to the right.

const TOP = 20;
const ROW_H = 26;
const GRAPH_X = 24;
const LANE_W = 22;
const TEXT_X = 160;
const HASH_W = 58;
const NODE_R = 5.5;
const WIDTH = 480;
const HEIGHT = 440;

const LANE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
];
const REF_COLORS: Record<string, string> = {
  main: "#1d4ed8",
  feature: "#15803d",
  hotfix: "#b45309",
};

type Pos = { row: number; lane: number };

function layout(state: State): Map<string, Pos> {
  const kids = new Map<string | null, Commit[]>();
  for (const c of Object.values(state.commits)) {
    let list = kids.get(c.parent);
    if (!list) kids.set(c.parent, (list = []));
    list.push(c);
  }
  for (const list of kids.values()) list.sort((a, b) => a.seq - b.seq);

  const widthMemo = new Map<string, number>();
  const width = (c: Commit): number => {
    let w = widthMemo.get(c.id);
    if (w === undefined) {
      w = Math.max(1, _.sumBy(kids.get(c.id) ?? [], width));
      widthMemo.set(c.id, w);
    }
    return w;
  };

  const out = new Map<string, Pos>();
  let row = 0;
  const visit = (c: Commit, lane: number) => {
    out.set(c.id, { row: row++, lane });
    const ks = kids.get(c.id) ?? [];
    let l = lane;
    const lanes = ks.map((k) => {
      const r = l;
      l += width(k);
      return r;
    });
    for (let i = ks.length - 1; i >= 0; i--) visit(ks[i], lanes[i]);
  };
  let l = 0;
  for (const root of kids.get(null) ?? []) {
    visit(root, l);
    l += width(root);
  }
  return out;
}

const nodeX = (lane: number) => GRAPH_X + lane * LANE_W;
const rowY = (row: number) => TOP + row * ROW_H;
const chipWidth = (name: string) => name.length * 6.2 + 10;

// # Draggable

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const pos = layout(state);
  const refsAt = new Map<string, string[]>();
  for (const [name, tip] of Object.entries(state.refs)) {
    refsAt.set(tip, [...(refsAt.get(tip) ?? []), name]);
  }
  const commits = _.sortBy(
    Object.values(state.commits),
    (c) => pos.get(c.id)!.row,
  );

  const commitDragSpec = (c: Commit) => () => {
    const base = gc(state);
    const x = c.id;
    const subtree = descendants(base, x);
    const inSubtree = new Set(subtree);
    const ghostIds = Object.fromEntries(subtree.map((id) => [id, makeId()]));
    const copyId = makeId();

    // Rebase: re-parent onto any commit that wouldn't make a cycle.
    const reparents = Object.values(base.commits)
      .filter((t) => !inSubtree.has(t.id) && t.id !== c.parent)
      .map((t) => reparent(base, x, t.id, subtree, ghostIds));

    // Interactive rebase: other positions within X's linear run.
    const run = linearRun(base, x);
    const rest = run.filter((id) => id !== x);
    const reorders = _.range(run.length)
      .filter((i) => i !== run.indexOf(x))
      .map((i) =>
        reorderRun(base, run, [...rest.slice(0, i), x, ...rest.slice(i)]),
      );

    // Cherry-pick (Alt): onto any branch not already at X.
    const picks = Object.keys(base.refs)
      .filter((name) => base.refs[name] !== x)
      .map((name) => cherryPick(base, x, name, copyId));

    return d.reactTo(altKey, (alt) =>
      d
        .closest(alt ? picks : [base, ...reparents, ...reorders], {
          stickiness: 4,
        })
        .withFloating({ ghost: { opacity: 0.3 } })
        .whenFar(base),
    );
  };

  const refDragSpec = (name: string) => () => {
    const base = gc(state);
    const targets = Object.values(base.commits)
      .filter((t) => t.id !== base.refs[name])
      .map((t) => moveRef(base, name, t.id));
    return d
      .closest([base, ...targets], { stickiness: 4 })
      .withFloating()
      .whenFar(base);
  };

  return (
    <g>
      <g id="edges">
        {commits.map((c) => {
          if (c.parent === null) return null;
          const me = pos.get(c.id)!;
          const p = pos.get(c.parent)!;
          const cx = nodeX(me.lane);
          const cy = rowY(me.row);
          const px = nodeX(p.lane);
          const py = rowY(p.row);
          const color = c.ghost ? "#d1d5db" : LANE_COLORS[me.lane % 6];
          return (
            <path
              id={`edge-${c.id}`}
              d={`M${cx} ${cy} L${cx} ${py + ROW_H} Q${cx} ${py} ${px} ${py}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray={c.ghost ? "3 3" : undefined}
            />
          );
        })}
      </g>

      {commits.map((c) => {
        const { row, lane } = pos.get(c.id)!;
        const x = nodeX(lane);
        const y = rowY(row);
        const color = c.ghost ? "#9ca3af" : LANE_COLORS[lane % 6];
        const rowId = `commit-${c.id}`;

        // Text column: hash, then ref chips, then message.
        let cursor = TEXT_X - x + HASH_W;
        const chips = (refsAt.get(c.id) ?? []).map((name) => {
          const w = chipWidth(name);
          const chipX = cursor;
          cursor += w + 5;
          return { name, chipX, w };
        });

        return (
          <g
            id={rowId}
            transform={translate(x, y)}
            opacity={c.ghost ? 0.35 : 1}
            dragologyZIndex={draggedId === rowId ? 2 : 1}
            dragologyOnDrag={!c.ghost && commitDragSpec(c)}
            style={{ cursor: c.ghost ? "default" : "grab" }}
          >
            <circle
              r={NODE_R}
              fill={c.ghost ? "white" : color}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={c.ghost ? "2 2" : undefined}
            />
            <text
              transform={translate(TEXT_X - x, 4)}
              fontFamily="ui-monospace, monospace"
              fontSize={11}
              fill="#9ca3af"
            >
              {c.hash}
            </text>
            {chips.map(({ name, chipX, w }) => (
              <g
                id={`ref-${name}`}
                transform={translate(chipX, 0)}
                dragologyZIndex={draggedId === `ref-${name}` ? 3 : 1}
                dragologyOnDrag={refDragSpec(name)}
              >
                <rect
                  transform={translate(0, -8)}
                  width={w}
                  height={16}
                  rx={4}
                  fill={REF_COLORS[name] ?? "#374151"}
                />
                <text
                  transform={translate(w / 2, 4)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill="white"
                >
                  {name}
                </text>
              </g>
            ))}
            <text
              transform={translate(cursor + 2, 4)}
              fontSize={12}
              fill={c.ghost ? "#9ca3af" : "#111827"}
              textDecoration={c.ghost ? "line-through" : undefined}
            >
              {c.message}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        A commit graph you can rewrite by dragging. <b>Drag a commit</b> onto
        another commit to rebase it (and everything downstream) there: the chain
        lifts, re-parents, and gets fresh hashes, while the old commits ghost
        out. Drag it up or down within its own chain to reorder (interactive
        rebase). Hold <b>Alt/Option</b> while dragging to cherry-pick a copy
        onto a branch instead. <b>Drag a branch label</b> to move the ref;
        commits it abandons ghost out. Ghosts are swept away by the next
        operation.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={makeInitialState()}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  ),
  {
    tags: [
      "d.closest",
      "d.reactTo",
      "spec.withFloating [ghost]",
      "spec.whenFar",
      "keyboard",
      "reordering",
      "graph",
    ],
  },
);
