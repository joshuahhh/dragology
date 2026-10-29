import { ensureSyntaxTree } from "@codemirror/language";
import {
  Annotation,
  EditorSelection,
  EditorState,
  Range,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

// An excerpt view of the code: everything but one JSX attribute (the
// drag spec) is hidden, though it's all still there, compiled and
// type-checked as usual. The cursor stays inside the excerpt.

/** The JSX attribute the excerpt shows. */
const EXCERPT_ATTR = "dragologyOnDrag";

/** Turns the excerpt on or off. */
export const setExcerpt = StateEffect.define<boolean>();

/**
 * Marks a transaction that reformats the doc. The excerpt is found
 * afresh after one, rather than mapped through it: a reformat is one
 * change spanning everything that moved, which mapping would blur.
 */
export const reformat = Annotation.define<boolean>();

type Excerpt = {
  on: boolean;
  range: { from: number; to: number } | null;
  decorations: DecorationSet;
};

function findAttr(state: EditorState): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  if (!tree) return null;
  let found: SyntaxNode | null = null;
  tree.iterate({
    enter(node) {
      if (found) return false;
      if (node.name !== "JSXAttribute") return;
      const name = node.node.firstChild;
      if (name && state.sliceDoc(name.from, name.to) === EXCERPT_ATTR) {
        found = node.node;
      }
    },
  });
  return found;
}

/** Where the excerpt's attribute is, whether or not the excerpt is on. */
export function excerptAttrRange(
  state: EditorState,
): { from: number; to: number } | null {
  const attr = findAttr(state);
  return attr && { from: attr.from, to: attr.to };
}

const indentOf = (text: string) => /^[ \t]*/.exec(text)![0].length;

/**
 * How far the excerpt is indented once its tag's attributes are broken
 * over lines (one past the tag's own line, at tab width 1). Formatting
 * to the excerpt's width needs it: the hidden indentation counts toward
 * Prettier's print width.
 */
export function excerptIndent(state: EditorState): number {
  const tag = findAttr(state)?.parent;
  return tag ? indentOf(state.doc.lineAt(tag.from).text) + 1 : 0;
}

/** Hides everything outside `range`, and the indentation within it. */
function excerptDecorations(
  state: EditorState,
  range: { from: number; to: number },
): DecorationSet {
  const hide = Decoration.replace({});
  const decos: Range<Decoration>[] = [];
  if (range.from > 0) decos.push(hide.range(0, range.from));
  const first = state.doc.lineAt(range.from);
  const indent = indentOf(first.text);
  const last = state.doc.lineAt(range.to).number;
  for (let n = first.number + 1; n <= last; n++) {
    const line = state.doc.line(n);
    const strip = Math.min(indent, indentOf(line.text));
    if (strip > 0) decos.push(hide.range(line.from, line.from + strip));
  }
  if (range.to < state.doc.length) {
    decos.push(hide.range(range.to, state.doc.length));
  }
  return Decoration.set(decos, true);
}

export const excerptField = StateField.define<Excerpt>({
  create: () => ({ on: false, range: null, decorations: Decoration.none }),
  update(value, tr) {
    let { on, range } = value;
    let find = false;
    for (const e of tr.effects) {
      if (e.is(setExcerpt) && e.value !== on) {
        on = e.value;
        find = on;
      }
    }
    if (!on) {
      return value.on
        ? { on, range: null, decorations: Decoration.none }
        : value;
    }
    if (tr.docChanged) {
      if (tr.annotation(reformat)) {
        find = true;
      } else if (range) {
        // Typing at either edge extends the excerpt.
        range = {
          from: tr.changes.mapPos(range.from, -1),
          to: tr.changes.mapPos(range.to, 1),
        };
      }
    }
    if (find) {
      const attr = findAttr(tr.state);
      range = attr && { from: attr.from, to: attr.to };
    } else if (!tr.docChanged) {
      return value;
    }
    return {
      on,
      range,
      decorations: range
        ? excerptDecorations(tr.state, range)
        : Decoration.none,
    };
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(f).decorations),
    EditorView.editorAttributes.from(f, (v) =>
      v.on && v.range
        ? { class: "cm-excerpt" }
        : ({} as Record<string, string>),
    ),
  ],
});

/** Keeps the selection inside the excerpt. */
const clampToExcerpt = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;
  const { range } = tr.state.field(excerptField);
  if (!range) return tr;
  const clamp = (pos: number) => Math.min(Math.max(pos, range.from), range.to);
  const sel = tr.state.selection;
  if (
    sel.ranges.every(
      (r) => clamp(r.anchor) === r.anchor && clamp(r.head) === r.head,
    )
  ) {
    return tr;
  }
  return [
    tr,
    {
      selection: EditorSelection.create(
        sel.ranges.map((r) =>
          EditorSelection.range(clamp(r.anchor), clamp(r.head)),
        ),
        sel.mainIndex,
      ),
      sequential: true,
    },
  ];
});

/** How long `setFade` takes to fade the code out. */
export const EXCERPT_FADE_MS = 300;

/**
 * Fades out everything outside a range (the excerpt to come), or with
 * null, stops fading.
 */
export const setFade = StateEffect.define<{
  from: number;
  to: number;
} | null>();

const fadeField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFade)) continue;
      const range = e.value;
      const fade = Decoration.mark({ class: "cm-fadingOut" });
      const length = tr.state.doc.length;
      value = Decoration.set(
        range
          ? [
              ...(range.from > 0 ? [fade.range(0, range.from)] : []),
              ...(range.to < length ? [fade.range(range.to, length)] : []),
            ]
          : [],
      );
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const excerpting = [excerptField, clampToExcerpt, fadeField];

/**
 * If no tag has the excerpt's attribute yet, a change adding it, set to
 * `handler`, to the first tag with an `id` (which a dragged element
 * needs).
 */
export function addExcerptAttr(
  state: EditorState,
  handler: string,
): TransactionSpec | null {
  if (findAttr(state)) return null;
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  if (!tree) return null;
  let at: number | null = null;
  tree.iterate({
    enter(node) {
      if (at !== null) return false;
      if (node.name !== "JSXOpenTag" && node.name !== "JSXSelfClosingTag") {
        return;
      }
      let lastAttr: SyntaxNode | null = null;
      let hasId = false;
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "JSXAttribute") continue;
        lastAttr = child;
        const name = child.firstChild;
        if (name && state.sliceDoc(name.from, name.to) === "id") hasId = true;
      }
      if (hasId && lastAttr) at = lastAttr.to;
    },
  });
  return at === null
    ? null
    : { changes: { from: at, insert: ` ${EXCERPT_ATTR}={${handler}}` } };
}

/**
 * Where to put the cursor on entering the excerpt: at the end of the
 * spec, which is the handler's last `return` value, or its whole body.
 */
export function excerptCursor(state: EditorState): number | null {
  const { range } = state.field(excerptField);
  if (!range) return null;
  const value = lastReturn(state, range)?.firstChild?.nextSibling;
  return value && value.name !== ";" ? value.to : range.to - 1;
}

/**
 * Where the spec starts in the excerpt: at its handler's last `return`,
 * or, for a handler without one, at the start.
 */
export function excerptSpecFrom(state: EditorState): number | null {
  const { range } = state.field(excerptField);
  if (!range) return null;
  return lastReturn(state, range)?.from ?? range.from;
}

function lastReturn(
  state: EditorState,
  range: { from: number; to: number },
): SyntaxNode | null {
  let returned: SyntaxNode | null = null;
  ensureSyntaxTree(state, state.doc.length, 1000)?.iterate({
    from: range.from,
    to: range.to,
    enter(node) {
      if (node.name === "ReturnStatement") returned = node.node;
    },
  });
  return returned;
}
