import {
  ensureSyntaxTree,
  foldedRanges,
  foldEffect,
  foldService,
  unfoldEffect,
} from "@codemirror/language";
import { EditorState, StateEffect, StateField, Text } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, ViewPlugin } from "@codemirror/view";

// Kept out of CodeEditor.tsx so that file only exports its component,
// which React Fast Refresh needs to hot-swap it without a full reload.

/** JSX attributes that carry structure rather than styling; never folded. */
const STRUCTURAL_ATTRS = new Set([
  "id",
  "transform",
  "dragologyOnDrag",
  "dragologyZIndex",
]);

/**
 * Ranges covering runs of styling attributes in JSX tags, from the end of
 * whatever precedes each run to the start of whatever follows it, so a
 * folded multi-line tag collapses onto one line: `<circle … />`.
 */
export function stylingFoldRanges(
  state: EditorState,
): { from: number; to: number }[] {
  const cached = rangesCache.get(state.doc);
  if (cached) return cached;
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  if (!tree) return [];
  const ranges: { from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "JSXOpenTag" && node.name !== "JSXSelfClosingTag") {
        return;
      }
      let runFrom: number | null = null;
      let prevEnd = node.from;
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        const nameNode =
          child.name === "JSXAttribute" ? child.firstChild : null;
        const styling =
          nameNode !== null &&
          !STRUCTURAL_ATTRS.has(state.sliceDoc(nameNode.from, nameNode.to));
        if (styling) {
          runFrom ??= prevEnd;
        } else if (runFrom !== null) {
          ranges.push({ from: runFrom, to: child.from });
          runFrom = null;
        }
        prevEnd = child.to;
      }
    },
  });
  rangesCache.set(state.doc, ranges);
  return ranges;
}

// Docs are immutable, and the gutter asks about every visible line on
// every update, so ranges are computed once per doc.
const rangesCache = new WeakMap<Text, { from: number; to: number }[]>();

/** The styling range starting on the given line, if any. */
function stylingFoldAt(state: EditorState, lineStart: number, lineEnd: number) {
  return (
    stylingFoldRanges(state).find(
      (r) => r.from >= lineStart && r.from <= lineEnd,
    ) ?? null
  );
}

/** A fold of any kind starting on the given line, if any. */
function foldAt(state: EditorState, lineStart: number, lineEnd: number) {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(lineStart, lineEnd, (from, to) => {
    if (from >= lineStart && from <= lineEnd) found ??= { from, to };
  });
  return found;
}

/** Folds (or unfolds) every styling-attribute run. */
export function setStylingFolds(view: EditorView, on: boolean) {
  const effects: StateEffect<unknown>[] = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    effects.push(unfoldEffect.of({ from, to }));
  });
  if (on) {
    for (const range of stylingFoldRanges(view.state)) {
      effects.push(foldEffect.of(range));
    }
  }
  if (effects.length > 0) view.dispatch({ effects });
}

// # Fold markers

// The line under the mouse (its start position), or null.
const setHoverLine = StateEffect.define<number | null>();
const hoverLine = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHoverLine)) value = e.value;
    return value;
  },
});

// Listens on the whole editor, gutter included, so the marker stays put
// while the mouse moves over to it.
const trackHoverLine = ViewPlugin.define((view) => {
  const set = (line: number | null) => {
    if (view.state.field(hoverLine) !== line) {
      view.dispatch({ effects: setHoverLine.of(line) });
    }
  };
  const onMove = (e: MouseEvent) =>
    set(view.lineBlockAtHeight(e.clientY - view.documentTop).from);
  const onLeave = () => set(null);
  view.dom.addEventListener("mousemove", onMove);
  view.dom.addEventListener("mouseleave", onLeave);
  return {
    destroy() {
      view.dom.removeEventListener("mousemove", onMove);
      view.dom.removeEventListener("mouseleave", onLeave);
    },
  };
});

class FoldMarker extends GutterMarker {
  constructor(readonly folded: boolean) {
    super();
  }
  eq(other: FoldMarker) {
    return other.folded === this.folded;
  }
  toDOM() {
    const el = document.createElement("span");
    el.textContent = this.folded ? "▸" : "▾";
    el.title = this.folded ? "Show styling" : "Hide styling";
    return el;
  }
}
const foldedMarker = new FoldMarker(true);
const unfoldedMarker = new FoldMarker(false);

/**
 * Styling folds as CodeMirror folds: registered as foldable (so the fold
 * commands find them), with a gutter marker to toggle each one that
 * appears only while its line is hovered.
 */
export const stylingFolding = [
  foldService.of(stylingFoldAt),
  hoverLine,
  trackHoverLine,
  gutter({
    class: "cm-stylingFoldGutter",
    lineMarker(view, line) {
      if (view.state.field(hoverLine) !== line.from) return null;
      if (foldAt(view.state, line.from, line.to)) return foldedMarker;
      if (stylingFoldAt(view.state, line.from, line.to)) return unfoldedMarker;
      return null;
    },
    lineMarkerChange: (update) =>
      update.docChanged ||
      update.transactions.some((tr) =>
        tr.effects.some(
          (e) => e.is(setHoverLine) || e.is(foldEffect) || e.is(unfoldEffect),
        ),
      ),
    initialSpacer: () => unfoldedMarker,
    domEventHandlers: {
      mousedown(view, line) {
        const folded = foldAt(view.state, line.from, line.to);
        const range = folded ?? stylingFoldAt(view.state, line.from, line.to);
        if (!range) return false;
        view.dispatch({
          effects: (folded ? unfoldEffect : foldEffect).of(range),
        });
        return true;
      },
    },
  }),
];
