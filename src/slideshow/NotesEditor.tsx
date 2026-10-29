import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Range,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { ExternalChange } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSeconds } from "./timing";

// Markdown as plain text with its formatting applied: the # and * stay, dimmed
const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.4em", fontWeight: "bold", color: "white" },
  { tag: t.heading2, fontSize: "1.2em", fontWeight: "bold", color: "white" },
  { tag: t.heading, fontWeight: "bold", color: "white" },
  { tag: t.strong, fontWeight: "bold", color: "white" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, fontFamily: "ui-monospace, monospace", color: "#fde68a" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.url, color: "#6b7280" },
  { tag: t.quote, color: "#9ca3af", fontStyle: "italic" },
  // The markup itself: #, *, `, >, list bullets, link brackets
  { tag: t.processingInstruction, color: "#6b7280" },
]);

const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "#e5e7eb",
      fontSize: "16px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.4" },
    ".cm-content": { padding: 0, caretColor: "white" },
    ".cm-line": { padding: 0 },
    ".cm-cursor": { borderLeftColor: "white" },
    ".cm-placeholder": { color: "#4b5563" },
    ".cm-notes-comment, .cm-notes-comment *": { color: "#6b7280 !important" },
    ".cm-notes-inactive": { opacity: 0.35 },
    ".cm-notes-stage-label": {
      fontSize: "12px",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#6b7280",
    },
    "span.cm-notes-stage-label": { marginLeft: "8px" },
    ".cm-notes-stage-label-active": { color: "#7dd3fc" },
    ".cm-notes-stage-time": { fontWeight: "400", letterSpacing: "normal" },
    ".cm-notes-stage-label-extra": { color: "#f87171" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#374151",
    },
  },
  { dark: true },
);

// Typing one of these with text selected wraps the selection in it rather than
// replacing it, and selects the result, so typing * twice makes it **bold**.
const WRAP_MARKERS = ["*", "_", "`", "~"];

const wrapSelection = EditorView.inputHandler.of((view, _from, _to, text) => {
  const { state } = view;
  if (
    !WRAP_MARKERS.includes(text) ||
    state.selection.ranges.every((r) => r.empty)
  )
    return false;
  view.dispatch(
    state.update(
      state.changeByRange((range) => {
        if (range.empty) {
          return {
            changes: { from: range.from, insert: text },
            range: EditorSelection.cursor(range.from + text.length),
          };
        }
        return {
          changes: [
            { from: range.from, insert: text },
            { from: range.to, insert: text },
          ],
          range: EditorSelection.range(range.from, range.to + 2 * text.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input.type" },
    ),
  );
  return true;
});

// A // at the start of a line, or after a space, comments out the rest of the
// line. (Not one after a colon, so URLs aren't comments.)
const COMMENT = /(?<=^|\s)\/\/.*/g;

const commentMarks = new MatchDecorator({
  regexp: COMMENT,
  decoration: Decoration.mark({ class: "cm-notes-comment" }),
});

const dimComments = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = commentMarks.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = commentMarks.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// Markdown's own comment is <!-- -->; this makes ⌘/ (toggleComment, in the
// default keymap) toggle // on the selected lines instead.
const slashComments = Prec.highest(
  EditorState.languageData.of(() => [{ commentTokens: { line: "//" } }]),
);

/**
 * Where the slide is in its steps, which the notes have a stage for each of,
 * and the seconds each step took when last timed.
 */
export type NotesStages = { current: number; count: number; times?: number[] };

// A line that's just --- starts the notes for the slide's next step
const STAGE_BREAK = /^\s*---\s*$/;

const setStages = StateEffect.define<NotesStages | null>();

class StageLabel extends WidgetType {
  constructor(
    readonly stage: number,
    readonly stages: NotesStages,
    readonly block: boolean,
  ) {
    super();
  }
  eq(other: StageLabel) {
    return (
      other.stage === this.stage &&
      other.block === this.block &&
      other.stages.current === this.stages.current &&
      other.stages.count === this.stages.count &&
      other.stages.times?.[other.stage] === this.stages.times?.[this.stage]
    );
  }
  toDOM() {
    const { stage, stages } = this;
    const el = document.createElement(this.block ? "div" : "span");
    el.className = [
      "cm-notes-stage-label",
      stage === stages.current && "cm-notes-stage-label-active",
      stage >= stages.count && "cm-notes-stage-label-extra",
      // A label on a line of its own fades with its stage, as lines do
      this.block && stage !== stages.current && "cm-notes-inactive",
    ]
      .filter(Boolean)
      .join(" ");
    el.textContent =
      stage < stages.count
        ? `Stage ${stage + 1}`
        : `Stage ${stage + 1} (slide has ${stages.count})`;
    const time = stages.times?.[stage];
    if (time !== undefined) {
      const timeEl = document.createElement("span");
      timeEl.className = "cm-notes-stage-time";
      timeEl.textContent = ` · ${formatSeconds(time)}`;
      timeEl.title = "Time on this step when last timed";
      el.append(timeEl);
    }
    return el;
  }
}

const inactiveLine = Decoration.line({ class: "cm-notes-inactive" });

/**
 * A label at the top of each stage ("Stage 1" above the notes, the rest after
 * their --- lines), with the lines of the stages other than the current one
 * faded.
 */
function stageDecorations(doc: Text, stages: NotesStages | null) {
  if (!stages) return Decoration.none;
  const label = (stage: number, block: boolean) =>
    Decoration.widget({
      widget: new StageLabel(stage, stages, block),
      block,
      side: block ? -1 : 1,
    });
  const decos: Range<Decoration>[] = [label(0, true).range(0)];
  let stage = 0;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const isBreak = STAGE_BREAK.test(line.text);
    if (isBreak) stage++;
    if (stage !== stages.current) decos.push(inactiveLine.range(line.from));
    if (isBreak) decos.push(label(stage, false).range(line.to));
  }
  return Decoration.set(decos, true);
}

/** A stage's text, from its --- line to the line before the next. */
function stageRange(doc: Text, stage: number) {
  let from = stage === 0 ? 0 : null;
  let to = doc.length;
  let seen = 0;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (!STAGE_BREAK.test(line.text)) continue;
    seen++;
    if (seen === stage) from = line.from;
    if (seen === stage + 1) {
      to = Math.max(line.from - 1, 0);
      break;
    }
  }
  // Notes with fewer stages than the slide: the end of the notes
  return from === null ? { from: doc.length, to: doc.length } : { from, to };
}

/**
 * Scrolls whatever the editor scrolls in to show all of a range, or as much
 * of it as fits from the top. (Not `EditorView.scrollIntoView`, which can't
 * see the end of a range that's out of view, since CodeMirror doesn't draw
 * it; the height map knows where it is.)
 */
function revealRange(view: EditorView, from: number, to: number) {
  // Room for Stage 1's label, which sits above the text
  const marginTop = 24;
  const marginBottom = 8;
  view.requestMeasure({
    read(view) {
      const scroller = scrollParent(view.dom);
      if (!scroller) return null;
      const box = scroller.getBoundingClientRect();
      const top = view.documentTop + view.lineBlockAt(from).top - marginTop;
      const bottom =
        view.documentTop + view.lineBlockAt(to).bottom + marginBottom;
      const boxBottom = box.top + scroller.clientHeight;
      const delta =
        top < box.top
          ? top - box.top
          : bottom > boxBottom
            ? Math.min(bottom - boxBottom, top - box.top)
            : 0;
      return { scroller, delta };
    },
    write(m) {
      if (m?.delta) m.scroller.scrollBy({ top: m.delta, behavior: "smooth" });
    },
  });
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (
      /auto|scroll/.test(getComputedStyle(cur).overflowY) &&
      cur.scrollHeight > cur.clientHeight
    )
      return cur;
  }
  return null;
}

// (Block widgets can't come from a view plugin, so this is a state field.)
const stagesField = StateField.define<{
  stages: NotesStages | null;
  decorations: DecorationSet;
}>({
  create: () => ({ stages: null, decorations: Decoration.none }),
  update(value, tr) {
    let { stages } = value;
    for (const e of tr.effects) if (e.is(setStages)) stages = e.value;
    if (stages === value.stages && !tr.docChanged) return value;
    return { stages, decorations: stageDecorations(tr.state.doc, stages) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

/**
 * A plain-text Markdown editor that shows the text formatted, with the markup
 * left in place (CodeMirror). ⌘↵ or ⌘S calls `onSave`; Escape calls `onCancel`
 * and leaves the editor. Typing * _ ` or ~ over a selection wraps it. ⌘/
 * toggles a // comment on the selected lines, and comments are dimmed. With
 * `stages`, --- lines divide the notes into stages, which are labeled, and
 * those other than the current one are faded.
 */
export function NotesEditor({
  value,
  stages,
  editable,
  readOnly,
  placeholder,
  onChange,
  onBlur,
  onSave,
  onCancel,
}: {
  value: string;
  stages: NotesStages | null;
  /** If false, the notes are just text: no cursor, no focus */
  editable: boolean;
  /** Takes no edits for now, but keeps focus and the cursor (while saving) */
  readOnly: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // The keymap is made once, so it calls whatever handlers came last
  const handlers = useRef({ onSave, onCancel });
  handlers.current = { onSave, onCancel };

  // CodeMirror owns the text; we replace it whenever `value` disagrees.
  // (@uiw/react-codemirror's own syncing of `value` holds off for a moment
  // after typing, and can drop the update, so it only gets the first value.)
  const [initialValue] = useState(value);
  const [view, setView] = useState<EditorView | null>(null);
  useEffect(() => {
    if (!view) return;
    const doc = view.state.doc.toString();
    if (value !== doc) {
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: value },
        annotations: [ExternalChange.of(true)],
      });
    }
  }, [view, value]);

  const stagesCurrent = stages?.current;
  const stagesCount = stages?.count;
  const stagesTimes = stages?.times;
  useEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: setStages.of(
        stagesCurrent === undefined || stagesCount === undefined
          ? null
          : { current: stagesCurrent, count: stagesCount, times: stagesTimes },
      ),
    });
  }, [view, stagesCurrent, stagesCount, stagesTimes]);
  // A stage scrolls into view as it becomes current
  useEffect(() => {
    if (!view || stagesCurrent === undefined) return;
    const { from, to } = stageRange(view.state.doc, stagesCurrent);
    revealRange(view, from, to);
  }, [view, stagesCurrent, stagesCount]);

  const extensions = useMemo(
    () => [
      // No setext headings, so a --- under a line is a stage break rather
      // than making the line a heading
      markdown({ extensions: { remove: ["SetextHeading"] } }),
      syntaxHighlighting(highlightStyle),
      EditorView.lineWrapping,
      wrapSelection,
      dimComments,
      slashComments,
      stagesField,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              handlers.current.onSave();
              return true;
            },
          },
          {
            key: "Mod-s",
            run: () => {
              handlers.current.onSave();
              return true;
            },
          },
          {
            key: "Escape",
            run: (view) => {
              handlers.current.onCancel();
              view.contentDOM.blur();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      value={initialValue}
      onCreateEditor={setView}
      readOnly={readOnly}
      editable={editable}
      placeholder={placeholder}
      onChange={onChange}
      onBlur={onBlur}
      theme={theme}
      extensions={extensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        searchKeymap: false,
        closeBrackets: false,
        bracketMatching: false,
      }}
    />
  );
}
