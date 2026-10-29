import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { DragSpecBuilder, DragSpecMethods } from "../DragSpec";

/** Drag spec operators' names (`d.closest`, `.withFloating`, ...): the
 * builder's and specs' getters. */
const OP_NAMES = new Set(
  [DragSpecBuilder.prototype, DragSpecMethods.prototype].flatMap((proto) =>
    Object.getOwnPropertyNames(proto).filter(
      (name) => Object.getOwnPropertyDescriptor(proto, name)?.get,
    ),
  ),
);

const opMark = Decoration.mark({ class: "cm-op" });

function opDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (
          node.name === "PropertyName" &&
          node.node.parent?.name === "MemberExpression" &&
          OP_NAMES.has(view.state.sliceDoc(node.from, node.to))
        ) {
          builder.add(node.from, node.to, opMark);
        }
      },
    });
  }
  return builder.finish();
}

/** Marks operators' names in method calls with `cm-op`, for styling. */
export const opMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = opDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = opDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
