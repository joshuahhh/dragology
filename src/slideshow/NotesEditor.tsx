import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { ExternalChange } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";

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

/**
 * A plain-text Markdown editor that shows the text formatted, with the markup
 * left in place (CodeMirror). ⌘↵ or ⌘S calls `onSave`; Escape calls `onCancel`
 * and leaves the editor. Typing * _ ` or ~ over a selection wraps it.
 */
export function NotesEditor({
  value,
  editable,
  readOnly,
  placeholder,
  onChange,
  onBlur,
  onSave,
  onCancel,
}: {
  value: string;
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

  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(highlightStyle),
      EditorView.lineWrapping,
      wrapSelection,
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
