import {
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { DraggableRenderer, DragStatus } from "../DraggableRenderer";
import { DragSpecTreeView } from "../DragSpecTreeView";
import { ErrorBoundary } from "../ErrorBoundary";
import { renderDraggableInert } from "../renderDraggable";
import "../studio/shantell-sans";
import { CodeEditor, CodeEditorApi } from "./CodeEditor";
import { Compiled, compileLiveCode } from "./compile";
import {
  ControlsPanel,
  ControlValues,
  HelpButton,
  PANEL_CODE,
} from "./ControlsPanel";
import {
  diagramHighlightCss,
  HALO_FILTER_ID,
  HIGHLIGHT_COLOR,
  highlightColors,
  highlightStyles,
} from "./highlightStyles";
import { snippets } from "./snippets";
import { syntaxThemes } from "./syntaxThemes";

/*
Shortcuts are all Option/Alt plus a key; ⌥/ (or the ? in the corner)
opens a panel listing them, where each one is also a control. The list
is SHORTCUTS in ControlsPanel.tsx.
*/

const COMPILE_DELAY_MS = 250;
/** How long the ? stays up after the page loads. */
const HELP_INTRO_MS = 4000;
/** How close (px, from each edge) the pointer must come to the
 * bottom-right corner to show the ?. */
const HELP_CORNER_PX = 140;

/**
 * Fonts for text in the diagram, applied by CSS so the code doesn't
 * mention them. All are local (system fonts on macOS, or bundled), so
 * nothing needs the network at the venue.
 */
const letterFonts: { name: string; family: string }[] = [
  { name: "arial rounded", family: '"Arial Rounded MT Bold", system-ui' },
  { name: "maru gothic", family: '"Hiragino Maru Gothic ProN", system-ui' },
  { name: "shantell", family: '"Shantell Sans", system-ui' },
  { name: "avenir", family: '"Avenir Next", Avenir, system-ui' },
  { name: "futura", family: "Futura, system-ui" },
  { name: "rockwell", family: "Rockwell, serif" },
  { name: "gill sans", family: '"Gill Sans", system-ui' },
  { name: "system", family: "system-ui, sans-serif" },
  { name: "georgia", family: "Georgia, serif" },
];

type Good = Compiled & { source: string };

function tryCompile(
  source: string,
  prelude: string,
  currentState: object | null,
): { ok: Good; state: object } | { error: string } {
  try {
    const compiled = compileLiveCode(source, prelude);
    // Keep the current state if the initial state is unchanged and the
    // new code can still render it.
    let state = compiled.initialState;
    if (
      currentState &&
      JSON.stringify(currentState) !== JSON.stringify(state)
    ) {
      try {
        renderDraggableInert(compiled.draggable, currentState, null, false);
        state = currentState;
      } catch {
        // fall back to initialState
      }
    }
    renderDraggableInert(compiled.draggable, state, null, false);
    return { ok: { ...compiled, source }, state };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function LiveCodePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const snippetIdx = Math.min(
    Math.max(Number(searchParams.get("s") ?? 0) || 0, 0),
    snippets.length - 1,
  );
  const [bright, setBright] = useState(true);
  const baseSnippet = snippets[snippetIdx];
  const snippet = useMemo(
    () =>
      bright && baseSnippet.bright
        ? { ...baseSnippet, ...baseSnippet.bright }
        : baseSnippet,
    [baseSnippet, bright],
  );

  const [source, setSource] = useState(snippet.code);
  const [good, setGood] = useState<Good | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<object | null>(null);
  const [lastInitialState, setLastInitialState] = useState<string | null>(null);

  const [cursorLoc, setCursorLoc] = useState<number | null>(null);
  const [hoverLoc, setHoverLoc] = useState<number | null>(null);
  const [highlightOn, setHighlightOn] = useState(true);
  const [foldStyling, setFoldStyling] = useState(true);
  const [styleIdx, setStyleIdx] = useState(0);
  const [syntaxIdx, setSyntaxIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [fontIdx, setFontIdx] = useState(0);
  const [showState, setShowState] = useState(!!snippet.showState);
  const [showTree, setShowTree] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(
    null,
  );
  const [dragStatus, setDragStatus] = useState<DragStatus<object> | null>(null);

  // The bundled font loads on first use, and text in it is invisible
  // until then; load it up front so switching to it is instant.
  useEffect(() => {
    void document.fonts.load('800 32px "Shantell Sans"');
  }, []);

  const docKey = `${snippetIdx}-${bright}`;
  const editorApiRef = useRef<CodeEditorApi | null>(null);

  // Load a snippet. The diagram state carries over if the new snippet
  // has the same initial state (e.g. between stages of one example).
  useEffect(() => {
    setSource(snippet.code);
    setGood(null);
    setShowState(!!snippet.showState);
  }, [snippet]);

  // Compile (debounced, except for the first compile of a snippet).
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const run = () => {
      const result = tryCompile(source, snippet.prelude, stateRef.current);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setGood(result.ok);
      const initial = JSON.stringify(result.ok.initialState);
      // Editing initialState resets the diagram.
      setState(
        initial !== lastInitialState ? result.ok.initialState : result.state,
      );
      setLastInitialState(initial);
    };
    if (good === null) {
      run();
      return;
    }
    const timer = setTimeout(run, COMPILE_DELAY_MS);
    return () => clearTimeout(timer);
    // `good` and `lastInitialState` are read, not reacted to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, snippet]);

  const showToast = useCallback((text: string) => {
    setToast({ text, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Shortcuts. Indices live in a ref that `perform` updates eagerly, so
  // key repeats don't read stale values between renders. The keyboard
  // and the controls panel both act through `perform`.
  const shortcutState = {
    snippetIdx,
    highlightOn,
    foldStyling,
    styleIdx,
    syntaxIdx,
    colorIdx,
    fontIdx,
    bright,
    showState,
    showTree,
    showDebug,
    fontSize,
    good,
  };
  const shortcutRef = useRef(shortcutState);
  shortcutRef.current = shortcutState;
  const perform = useCallback(
    (code: string, delta = 1) => {
      const cur = shortcutRef.current;
      const cycle = (idx: number, length: number) =>
        (((idx + delta) % length) + length) % length;
      const go = (step: number) => {
        const next = Math.min(
          Math.max(cur.snippetIdx + step, 0),
          snippets.length - 1,
        );
        cur.snippetIdx = next;
        setSearchParams({ s: String(next) });
        showToast(snippets[next].title);
      };
      const actions: Record<string, () => void> = {
        BracketLeft: () => go(-1),
        BracketRight: () => go(1),
        KeyP: () => {
          const settings = {
            snippet: snippets[cur.snippetIdx].title,
            look: cur.bright ? "bright" : "original",
            highlighting: cur.highlightOn,
            highlightStyle: highlightStyles[cur.styleIdx].name,
            highlightColor: highlightColors[cur.colorIdx].name,
            syntaxColors: syntaxThemes[cur.syntaxIdx].name,
            letterFont: letterFonts[cur.fontIdx].name,
            foldStyling: cur.foldStyling,
            showState: cur.showState,
            showTree: cur.showTree,
            showDebug: cur.showDebug,
            fontSize: cur.fontSize,
          };
          void navigator.clipboard
            .writeText(JSON.stringify(settings, null, 2))
            .then(
              () => showToast("settings copied to clipboard"),
              () => showToast("couldn't copy settings"),
            );
        },
        KeyZ: () => {
          cur.foldStyling = !cur.foldStyling;
          setFoldStyling(cur.foldStyling);
          showToast(`styling: ${cur.foldStyling ? "folded" : "shown"}`);
        },
        KeyO: () => {
          cur.highlightOn = !cur.highlightOn;
          setHighlightOn(cur.highlightOn);
          showToast(`highlighting: ${cur.highlightOn ? "on" : "off"}`);
        },
        KeyH: () => {
          const next = cycle(cur.styleIdx, highlightStyles.length);
          cur.styleIdx = next;
          setStyleIdx(next);
          showToast(`highlight: ${highlightStyles[next].name}`);
        },
        KeyC: () => {
          const next = cycle(cur.syntaxIdx, syntaxThemes.length);
          cur.syntaxIdx = next;
          setSyntaxIdx(next);
          showToast(`colors: ${syntaxThemes[next].name}`);
        },
        KeyK: () => {
          const next = cycle(cur.colorIdx, highlightColors.length);
          cur.colorIdx = next;
          setColorIdx(next);
          showToast(`highlight color: ${highlightColors[next].name}`);
        },
        KeyL: () => {
          const next = cycle(cur.fontIdx, letterFonts.length);
          cur.fontIdx = next;
          setFontIdx(next);
          showToast(`letter font: ${letterFonts[next].name}`);
        },
        KeyB: () => {
          cur.bright = !cur.bright;
          setBright(cur.bright);
          showToast(cur.bright ? "look: bright" : "look: original");
        },
        KeyF: () => editorApiRef.current?.format(),
        KeyR: () => {
          if (cur.good) setState(cur.good.initialState);
          showToast("reset");
        },
        KeyS: () => {
          cur.showState = !cur.showState;
          setShowState(cur.showState);
        },
        KeyT: () => {
          cur.showTree = !cur.showTree;
          setShowTree(cur.showTree);
          showToast(
            `spec tree: ${cur.showTree ? "on (while dragging)" : "off"}`,
          );
        },
        KeyD: () => {
          cur.showDebug = !cur.showDebug;
          setShowDebug(cur.showDebug);
          showToast(
            `debug overlay: ${cur.showDebug ? "on (while dragging)" : "off"}`,
          );
        },
        Minus: () => {
          cur.fontSize = Math.max(cur.fontSize - 2, 10);
          setFontSize(cur.fontSize);
        },
        Equal: () => {
          cur.fontSize = Math.min(cur.fontSize + 2, 48);
          setFontSize(cur.fontSize);
        },
      };
      const action = actions[code];
      if (!action) return false;
      action();
      return true;
    },
    [setSearchParams, showToast],
  );

  // The controls panel, and the corner button that opens it.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panelOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen(false);
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      // `code` is unaffected by Option on macOS; fall back to `key` for
      // synthetic events that lack one.
      const code = e.code || codeForKey(e.key);
      if (code === PANEL_CODE) {
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen((open) => !open);
        return;
      }
      if (!perform(code)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [perform]);

  // When the ? shows: for a few seconds after the page loads (so people
  // learn where it is), and after that only while the pointer is near
  // its corner or the panel is open. Never during a drag, so it can't
  // appear on stage mid-demo.
  const [introOver, setIntroOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIntroOver(true), HELP_INTRO_MS);
    return () => clearTimeout(timer);
  }, []);
  const [nearCorner, setNearCorner] = useState(false);
  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) =>
      setNearCorner(
        window.innerWidth - e.clientX < HELP_CORNER_PX &&
          window.innerHeight - e.clientY < HELP_CORNER_PX,
      );
    const onLeave = () => setNearCorner(false);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Highlighting: hover wins over the editor cursor.
  const style = highlightStyles[styleIdx];
  const activeLoc = highlightOn ? (hoverLoc ?? cursorLoc) : null;
  const highlightedLocs = useMemo(() => {
    if (!good || activeLoc === null) return [];
    const outer = good.locs[activeLoc];
    if (!outer) return [];
    return good.locs.flatMap((loc, i) =>
      loc.from >= outer.from && loc.to <= outer.to ? [i] : [],
    );
  }, [good, activeLoc]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons !== 0) {
      setHoverLoc(null);
      return;
    }
    const el = (e.target as Element).closest?.("[data-loc]");
    setHoverLoc(el ? Number(el.getAttribute("data-loc")) : null);
  }, []);

  // Diagram sizing.
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setPaneSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = Math.max(
    0.1,
    Math.min(
      (paneSize.width * 0.85) / snippet.width,
      (paneSize.height * 0.85) / snippet.height,
    ),
  );

  const dragging = dragStatus?.type === "dragging" ? dragStatus : null;
  const shownState = dragging ? dragging.result.dropState : state;

  const helpVisible = !dragging && (panelOpen || nearCorner || !introOver);
  const controlValues: ControlValues = {
    snippetTitle: baseSnippet.title,
    snippetIdx,
    snippetCount: snippets.length,
    swatches: highlightColors,
    swatchIdx: colorIdx,
    byCode: {
      KeyO: highlightOn,
      KeyB: baseSnippet.bright ? bright : null,
      KeyZ: foldStyling,
      KeyS: showState,
      KeyT: showTree,
      KeyD: showDebug,
      KeyH: highlightStyles[styleIdx].name,
      KeyC: syntaxThemes[syntaxIdx].name,
      KeyL: letterFonts[fontIdx].name,
      Minus: fontSize,
    },
  };

  return (
    <div
      data-talk-root
      onPointerDown={() => panelOpen && setPanelOpen(false)}
      style={{
        display: "flex",
        height: "100vh",
        background: "white",
        color: "#24292f",
        overflow: "hidden",
      }}
    >
      <style>
        {`[data-talk-root] { --talk-hl: ${highlightColors[colorIdx].color}; }
[data-talk-diagram] text[data-loc] { font-family: ${letterFonts[fontIdx].family}; }`}
      </style>
      <HaloFilter />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          fontSize,
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <CodeEditor
            doc={snippet.code}
            docKey={docKey}
            onDocChange={setSource}
            onCursorLoc={setCursorLoc}
            locs={good?.locs ?? []}
            locsDoc={good?.source ?? ""}
            active={activeLoc}
            style={style.code}
            syntaxTheme={syntaxIdx}
            foldStyling={foldStyling}
            fontSize={fontSize}
            apiRef={editorApiRef}
          />
        </div>
        <div
          style={{
            minHeight: "1.5em",
            padding: "0 24px 12px 48px",
            fontSize: 14,
            fontFamily: "ui-monospace, Menlo, monospace",
            color: "#cf222e",
            opacity: error ? 1 : 0,
            transition: "opacity 300ms",
          }}
        >
          {error}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid #eee",
        }}
      >
        <div
          ref={paneRef}
          data-talk-diagram
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverLoc(null)}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <style>
            {diagramHighlightCss(
              "[data-talk-diagram]",
              highlightedLocs,
              style.diagram,
            )}
          </style>
          {good && state && (
            <div
              style={{
                width: snippet.width * scale,
                height: snippet.height * scale,
              }}
            >
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <ErrorBoundary
                  resetOnChange={good}
                  fallback={(err) => (
                    <div style={{ color: "#cf222e", fontSize: 12 }}>
                      {err.message}
                    </div>
                  )}
                >
                  <DraggableRenderer
                    draggable={good.draggable}
                    state={state}
                    onDropState={setState}
                    onDragStatus={setDragStatus}
                    width={snippet.width}
                    height={snippet.height}
                    showDebugOverlay={showDebug}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>

        {showTree && dragging && (
          <div style={{ padding: "0 24px 16px", maxHeight: "40%" }}>
            <DragSpecTreeView
              op={dragging.result.op}
              activePath={dragging.result.activePath}
              colorMap={null}
              svgWidth={snippet.width}
              svgHeight={snippet.height}
              thumbArea={6000}
            />
          </div>
        )}

        {showState && shownState && (
          <pre
            style={{
              margin: 0,
              padding: "0 32px 32px",
              fontSize: Math.round(fontSize * 0.9),
              fontFamily:
                '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
              color: dragging ? HIGHLIGHT_COLOR : "#57606a",
              whiteSpace: "pre-wrap",
            }}
          >
            {formatValue(shownState)}
          </pre>
        )}
      </div>

      {toast && (
        <div
          key={toast.key}
          style={{
            position: "fixed",
            bottom: 22,
            right: 70,
            padding: "4px 10px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.65)",
            color: "white",
            fontSize: 13,
            fontFamily: "ui-monospace, Menlo, monospace",
            pointerEvents: "none",
          }}
        >
          {toast.text}
        </div>
      )}

      <div style={{ position: "fixed", right: 22, bottom: 22, zIndex: 10 }}>
        <HelpButton
          visible={helpVisible}
          open={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        />
      </div>
      {panelOpen && (
        <ControlsPanel
          values={controlValues}
          perform={perform}
          style={{ position: "fixed", right: 22, bottom: 68, zIndex: 10 }}
        />
      )}
    </div>
  );
}

/**
 * A thin ring around an element's silhouette, a little way out from it:
 * the shape's alpha grown by two amounts, one subtracted from the other.
 * Units are the diagram's own (before it's scaled up to fit the pane).
 */
function HaloFilter() {
  const GAP = 3;
  const WIDTH = 1;
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <filter id={HALO_FILTER_ID} x="-25%" y="-25%" width="150%" height="150%">
        <feMorphology
          in="SourceAlpha"
          operator="dilate"
          radius={GAP + WIDTH}
          result="outer"
        />
        <feMorphology
          in="SourceAlpha"
          operator="dilate"
          radius={GAP}
          result="inner"
        />
        <feComposite in="outer" in2="inner" operator="out" result="ring" />
        <feFlood style={{ floodColor: HIGHLIGHT_COLOR }} result="color" />
        <feComposite in="color" in2="ring" operator="in" result="halo" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="halo" />
        </feMerge>
      </filter>
    </svg>
  );
}

function codeForKey(key: string): string {
  const punctuation: Record<string, string> = {
    "[": "BracketLeft",
    "]": "BracketRight",
    "-": "Minus",
    "=": "Equal",
  };
  return punctuation[key] ?? `Key${key.toUpperCase()}`;
}

// # State formatting

const MAX_LINE = 48;

/** Formats a value as a JS literal, one line where it fits. */
function formatValue(value: unknown, indent = 0): string {
  const flat = formatFlat(value);
  if (flat.length + indent <= MAX_LINE) return flat;
  const pad = " ".repeat(indent + 2);
  if (Array.isArray(value)) {
    const items = value.map((v) => pad + formatValue(v, indent + 2));
    return `[\n${items.join(",\n")}\n${" ".repeat(indent)}]`;
  }
  if (value && typeof value === "object") {
    const items = Object.entries(value).map(
      ([k, v]) => `${pad}${formatKey(k)}: ${formatValue(v, indent + 2)}`,
    );
    return `{\n${items.join(",\n")}\n${" ".repeat(indent)}}`;
  }
  return flat;
}

function formatFlat(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatFlat).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${formatKey(k)}: ${formatFlat(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value) ?? String(value);
}

function formatKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
