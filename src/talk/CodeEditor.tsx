import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  codeFolding,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  Compartment,
  EditorState,
  Prec,
  Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  drawSelection,
  EditorView,
  keymap,
} from "@codemirror/view";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { SourceLoc } from "./compile";
import { setStylingFolds, stylingFolding } from "./folds";
import { formatCode, minimalChange } from "./format";
import { CodeHighlightStyle, HIGHLIGHT_COLOR } from "./highlightStyles";
import { syntaxThemes } from "./syntaxThemes";
import { tsCompletions, tsLinter, tsSync } from "./tsExtensions";

// # Highlight state

type LocState = {
  locs: SourceLoc[];
  active: number | null;
  style: CodeHighlightStyle;
  decorations: DecorationSet;
};

const setLocs = StateEffect.define<SourceLoc[]>();
const setActive = StateEffect.define<{
  active: number | null;
  style: CodeHighlightStyle;
}>();

const locField = StateField.define<LocState>({
  create: () => ({
    locs: [],
    active: null,
    style: "bar",
    decorations: Decoration.none,
  }),
  update(value, tr) {
    let { locs, active, style } = value;
    if (tr.docChanged) {
      locs = locs.map((loc) => ({
        from: tr.changes.mapPos(loc.from, 1),
        to: tr.changes.mapPos(loc.to, -1),
        tags: loc.tags.map((tag) => ({
          from: tr.changes.mapPos(tag.from, 1),
          to: tr.changes.mapPos(tag.to, -1),
        })),
      }));
    }
    for (const e of tr.effects) {
      if (e.is(setLocs)) locs = e.value;
      if (e.is(setActive)) ({ active, style } = e.value);
    }
    if (
      locs === value.locs &&
      active === value.active &&
      style === value.style
    ) {
      return value;
    }
    const loc = active !== null ? locs[active] : undefined;
    return {
      locs,
      active,
      style,
      decorations: loc
        ? buildDecorations(tr.state, loc, style)
        : Decoration.none,
    };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

function buildDecorations(
  state: EditorState,
  loc: SourceLoc,
  style: CodeHighlightStyle,
): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const mark = (from: number, to: number, cls: string) => {
    if (to > from) decos.push(Decoration.mark({ class: cls }).range(from, to));
  };
  if (style === "dim") {
    mark(0, loc.from, "cm-loc-dim");
    mark(loc.to, state.doc.length, "cm-loc-dim");
  } else {
    const first = state.doc.lineAt(loc.from).number;
    const last = state.doc.lineAt(loc.to).number;
    for (let n = first; n <= last; n++) {
      decos.push(
        Decoration.line({ class: `cm-loc-line-${style}` }).range(
          state.doc.line(n).from,
        ),
      );
    }
  }
  for (const tag of loc.tags) mark(tag.from, tag.to, "cm-loc-tag");
  return Decoration.set(decos, true);
}

/** The innermost loc containing `pos`. */
function locAt(locs: SourceLoc[], pos: number): number | null {
  let best: number | null = null;
  locs.forEach((loc, i) => {
    if (loc.from <= pos && pos <= loc.to) {
      if (best === null || loc.to - loc.from < locs[best].to - locs[best].from)
        best = i;
    }
  });
  return best;
}

// # Theme

const theme = EditorView.theme({
  "&": { fontSize: "inherit", height: "100%", background: "transparent" },
  "&.cm-focused": { outline: "none" },
  // No scrollbars: the editor can run on under the diagram (see
  // `formatWidthRef`), so its scrollbar would land on the diagram's far
  // edge. It still scrolls, by wheel and with the cursor.
  ".cm-scroller": {
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
    lineHeight: "1.45",
    scrollbarWidth: "none",
  },
  ".cm-content": { caretColor: "#333", padding: "40px 24px 40px 8px" },
  // The fold-marker gutter sits in the left margin, invisible but for its
  // markers (which show only on hover).
  ".cm-gutters": {
    background: "transparent",
    border: "none",
    paddingLeft: "24px",
  },
  ".cm-stylingFoldGutter .cm-gutterElement": {
    color: "#a1a1aa",
    cursor: "pointer",
    fontSize: "0.75em",
    padding: "0 2px",
    display: "flex",
    alignItems: "center",
  },
  ".cm-stylingFoldGutter .cm-gutterElement:hover": { color: "#52525b" },
  ".cm-cursor": { borderLeftWidth: "2px" },
  ".cm-loc-tag": {
    color: `${HIGHLIGHT_COLOR} !important`,
    "& *": { color: `${HIGHLIGHT_COLOR} !important` },
  },
  ".cm-loc-line-bar": {
    boxShadow: `inset 3px 0 0 ${HIGHLIGHT_COLOR}`,
  },
  ".cm-loc-line-tint": {
    background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} 8%, transparent)`,
  },
  ".cm-loc-dim": { opacity: 0.3 },
  ".cm-tooltip-autocomplete": { fontSize: "0.8em" },
  ".cm-completionInfo": { fontSize: "0.8em", maxWidth: "40em" },
  ".cm-ts-signature": { margin: 0, whiteSpace: "pre-wrap" },
  ".cm-foldPlaceholder": {
    background: "#f4f4f5",
    border: "none",
    borderRadius: "4px",
    color: "#a1a1aa",
    margin: "0 2px",
    padding: "0 4px",
  },
});

// # Formatting

const FORMAT_DELAY_MS = 150;

/**
 * How many characters fit across `box` (by default, the editor). Lines
 * don't wrap, so this measures the box rather than the content, which
 * can be wider. (We measure the character
 * width ourselves; CodeMirror's `defaultCharacterWidth` can still be a
 * placeholder before its first measurement.)
 */
function availableColumns(
  view: EditorView,
  box: HTMLElement | null = view.scrollDOM,
): number {
  const horizontalPadding = (el: Element) => {
    const style = getComputedStyle(el);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  };
  const padding =
    horizontalPadding(view.contentDOM) +
    horizontalPadding(view.contentDOM.querySelector(".cm-line")!);
  const gutters =
    view.dom.querySelector<HTMLElement>(".cm-gutters")?.offsetWidth ?? 0;
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = getComputedStyle(view.contentDOM).font;
  const charWidth = ctx.measureText("0".repeat(100)).width / 100;
  const width = (box ?? view.scrollDOM).clientWidth - gutters - padding;
  return Math.floor(width / charWidth - 1);
}

async function formatToWidth(view: EditorView, printWidth: number) {
  const text = view.state.doc.toString();
  let result;
  try {
    result = await formatCode(text, view.state.selection.main.head, printWidth);
  } catch {
    return; // e.g. a syntax error mid-edit
  }
  if (view.state.doc.toString() !== text || result.formatted === text) return;
  view.dispatch({
    changes: minimalChange(text, result.formatted),
    selection: { anchor: result.cursorOffset },
  });
}

export type CodeEditorApi = { format(): void };

// # Component

export function CodeEditor({
  doc,
  docKey,
  prelude,
  onDocChange,
  onCursorLoc,
  locs,
  locsDoc,
  active,
  style,
  syntaxTheme,
  foldStyling,
  fontSize,
  formatWidthRef,
  apiRef,
}: {
  /** The contents for `docKey`; swapped in whenever `docKey` changes. */
  doc: string;
  docKey: string;
  /** Hidden code that runs before `doc`; completion sees its names. */
  prelude: string;
  onDocChange: (doc: string) => void;
  onCursorLoc: (loc: number | null) => void;
  /** Locs from the last successful compile of `locsDoc`. */
  locs: SourceLoc[];
  locsDoc: string;
  active: number | null;
  style: CodeHighlightStyle;
  /** Index into `syntaxThemes`. */
  syntaxTheme: number;
  /** Collapse styling attributes (see `stylingFoldRanges`). */
  foldStyling: boolean;
  /** The code is reformatted to fit when this or the width changes. */
  fontSize: number;
  /** The box the code is formatted to fit, if not the editor itself
   * (which may run on beyond it). */
  formatWidthRef?: RefObject<HTMLElement | null>;
  apiRef?: RefObject<CodeEditorApi | null>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onDocChange, onCursorLoc });
  callbacksRef.current = { onDocChange, onCursorLoc };
  const syntaxCompartment = useRef(new Compartment()).current;
  const preludeRef = useRef(prelude);
  preludeRef.current = prelude;
  const syntaxThemeRef = useRef(syntaxTheme);
  syntaxThemeRef.current = syntaxTheme;

  const foldStylingRef = useRef(foldStyling);
  foldStylingRef.current = foldStyling;
  const activeRef = useRef({ active, style });
  activeRef.current = { active, style };

  // The first doc stays hidden until it's formatted, so unformatted code
  // doesn't flash on screen. Later docs are formatted before they replace
  // the current one, so the editor never goes blank.
  const [revealed, setRevealed] = useState(false);

  // Reformat when the number of columns that fit changes.
  const formattedWidthRef = useRef<number | null>(null);
  const formatWidthRefRef = useRef(formatWidthRef);
  formatWidthRefRef.current = formatWidthRef;
  const formatTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scheduleFormat = useCallback((force: boolean) => {
    clearTimeout(formatTimerRef.current);
    formatTimerRef.current = setTimeout(() => {
      const view = viewRef.current;
      if (!view) return;
      const width = availableColumns(view, formatWidthRefRef.current?.current);
      if (!force && width === formattedWidthRef.current) return;
      formattedWidthRef.current = width;
      void formatToWidth(view, width).then(() => {
        // Reformatting moves the attributes around; fold them afresh.
        if (foldStylingRef.current) setStylingFolds(view, true);
        setRevealed(true);
      });
    }, FORMAT_DELAY_MS);
  }, []);

  const makeState = useCallback(
    (text: string) => {
      const reportCursor = (view: EditorView) => {
        const { locs } = view.state.field(locField);
        callbacksRef.current.onCursorLoc(
          view.hasFocus ? locAt(locs, view.state.selection.main.head) : null,
        );
      };
      return EditorState.create({
        doc: text,
        extensions: [
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({
            activateOnTypingDelay: 0,
            icons: false,
            override: [tsCompletions],
          }),
          // Tab accepts a completion, even inside a snippet's field (whose
          // own Tab binding moves to the next field).
          Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
          tsSync(() => preludeRef.current),
          tsLinter,
          javascript({ jsx: true, typescript: true }),
          syntaxCompartment.of(
            syntaxHighlighting(syntaxThemes[syntaxThemeRef.current].style),
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          indentUnit.of(" "),
          codeFolding({ placeholderText: "…" }),
          stylingFolding,
          locField,
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onDocChange(update.state.doc.toString());
            }
            if (
              update.docChanged ||
              update.selectionSet ||
              update.focusChanged ||
              update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(setLocs)),
              )
            ) {
              reportCursor(update.view);
            }
            if (update.geometryChanged) scheduleFormat(false);
          }),
        ],
      });
    },
    [syntaxCompartment, scheduleFormat],
  );

  useEffect(() => {
    const view = new EditorView({
      parent: parentRef.current!,
      state: makeState(doc),
    });
    viewRef.current = view;
    view.focus();
    scheduleFormat(true);
    const revealTimer = setTimeout(() => setRevealed(true), 1500);
    return () => {
      clearTimeout(formatTimerRef.current);
      clearTimeout(revealTimer);
      view.destroy();
    };
    // Created once; later docs are swapped in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap in a new doc, formatted first, keeping the scroll position.
  const loadedKeyRef = useRef(docKey);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || loadedKeyRef.current === docKey) return;
    loadedKeyRef.current = docKey;
    let cancelled = false;
    const width =
      formattedWidthRef.current ??
      availableColumns(view, formatWidthRef?.current);
    void formatCode(doc, 0, width)
      .then(
        (result) => result.formatted,
        () => doc,
      )
      .then((text) => {
        if (cancelled) return;
        const scrollTop = view.scrollDOM.scrollTop;
        view.setState(makeState(text));
        // Restore after CodeMirror's own measurement, which would otherwise
        // nudge the position.
        view.scrollDOM.scrollTop = scrollTop;
        view.requestMeasure({
          read: () => null,
          write: () => {
            view.scrollDOM.scrollTop = scrollTop;
          },
        });
        view.dispatch({ effects: setActive.of(activeRef.current) });
        if (foldStylingRef.current) setStylingFolds(view, true);
        view.focus();
        callbacksRef.current.onDocChange(text);
      });
    return () => {
      cancelled = true;
    };
    // `doc` is the contents for `docKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, makeState]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) setStylingFolds(view, foldStyling);
  }, [foldStyling]);

  useEffect(() => {
    viewRef.current?.requestMeasure();
    scheduleFormat(false);
  }, [fontSize, scheduleFormat]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { format: () => scheduleFormat(true) };
  }, [apiRef, scheduleFormat]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: syntaxCompartment.reconfigure(
        syntaxHighlighting(syntaxThemes[syntaxTheme].style),
      ),
    });
  }, [syntaxTheme, syntaxCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() !== locsDoc) return;
    view.dispatch({ effects: setLocs.of(locs) });
  }, [locs, locsDoc]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setActive.of({ active, style }) });
  }, [active, style]);

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        userSelect: "text",
        WebkitUserSelect: "text",
        opacity: revealed ? 1 : 0,
      }}
    />
  );
}
