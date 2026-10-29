import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { DraggableRenderer, DragStatus } from "../DraggableRenderer";
import { DragSpecTreeView } from "../DragSpecTreeView";
import { ErrorBoundary } from "../ErrorBoundary";
import type { Operator } from "../op";
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
import { EXCERPT_FADE_MS } from "./excerpt";
import {
  diagramHighlightCss,
  HALO_FILL_FILTER_ID,
  HALO_FILTER_ID,
  HIGHLIGHT_COLOR,
  highlightColors,
  highlightStyles,
} from "./highlightStyles";
import { type Snippet, snippets as pageSnippets } from "./snippets";
import { syntaxThemes } from "./syntaxThemes";
import { TREE_LAYOUT, TreeViewLayout } from "./TreeViewLayout";

/*
Shortcuts are all Option/Alt plus a key; ⌥/ (or the ? in the corner)
opens a panel listing them, where each one is also a control. The list
is SHORTCUTS in ControlsPanel.tsx.
*/

const COMPILE_DELAY_MS = 250;
/** How the width splits between the code and the diagram. */
export const CODE_FLEX = 3;
export const DIAGRAM_FLEX = 2;
/** How much of its pane the diagram fills, in whichever dimension is tighter */
export const DIAGRAM_FILL = 0.85;
/** How long the ? stays up after the page loads. */
const HELP_INTRO_MS = 4000;
/** How close (px, from each edge) the pointer must come to the
 * bottom-right corner to show the ?. */
const HELP_CORNER_PX = 140;

/** The excerpt's width in `TreeViewLayout` units: wide enough for the
 * handler's lines not to wrap, which takes it under the tree's left edge.
 * (It runs from the top-left corner down to the diagram.) */
const EXCERPT_W = 600;
const EXCERPT_FONT_SIZE = 22;
/** How long the code and the diagram take to glide into the excerpt
 * layout. */
const GLIDE_MS = 700;

/** The tree's thumbnail size, by how deeply its ops nest: as on the
 * studio's tree-view slides for closest (2), with floating (3), and
 * with whenFar (4). */
function treeThumbArea(op: Operator<object>): number {
  const depth = (op: Operator<object>): number =>
    1 + Math.max(0, ...op.children.map((c) => depth(c.op)));
  const d = depth(op);
  return d <= 2 ? 25000 : d === 3 ? 18000 : 9000;
}

/**
 * Fonts for text in the diagram, applied by CSS so the code doesn't
 * mention them. All are local (system fonts on macOS, or bundled), so
 * nothing needs the network at the venue.
 */
export const letterFonts: { name: string; family: string }[] = [
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

/** The live editor as a page of its own; the snippet is in the URL. */
export function LiveCodePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const snippetIdx = clampSnippetIdx(Number(searchParams.get("s") ?? 0));
  return (
    <div style={{ height: "100vh" }}>
      <LiveCode
        snippets={pageSnippets}
        snippetIdx={snippetIdx}
        onSnippetIdx={(idx) => setSearchParams({ s: String(idx) })}
      />
    </div>
  );
}

export function clampSnippetIdx(idx: number) {
  return Math.min(Math.max(idx || 0, 0), pageSnippets.length - 1);
}

/**
 * The live editor: code on the left, the diagram it draws on the right.
 * It fills its container, and its toasts and help button pin to the
 * nearest `contain: paint` ancestor (or the window, failing that). With
 * one snippet, there's no snippet navigation.
 */
export function LiveCode({
  snippets,
  snippetIdx = 0,
  onSnippetIdx,
  highlight,
  excerpt = false,
}: {
  snippets: Snippet[];
  snippetIdx?: number;
  onSnippetIdx?: (idx: number) => void;
  /** Turns highlighting on or off whenever it changes (⌥O still toggles
   * it in between). */
  highlight?: boolean;
  /** Show just the drag spec, beside the spec tree, in the studio's
   * layout (`TreeViewLayout`). */
  excerpt?: boolean;
}) {
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
  // Off while typing, on (⌥O) while moving around the code.
  const [highlightOn, setHighlightOn] = useState(highlight ?? false);
  useEffect(() => {
    if (highlight !== undefined) setHighlightOn(highlight);
  }, [highlight]);
  const [foldStyling, setFoldStyling] = useState(true);
  const [styleIdx, setStyleIdx] = useState(0);
  const [syntaxIdx, setSyntaxIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [fontIdx, setFontIdx] = useState(0);
  const [showState, setShowState] = useState(!!snippet.showState);
  const [showDebug, setShowDebug] = useState(false);
  const [fontSize, setFontSize] = useState(32);
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
  const codeBoxRef = useRef<HTMLDivElement>(null);

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
    snippets,
    snippetIdx,
    highlightOn,
    foldStyling,
    styleIdx,
    syntaxIdx,
    colorIdx,
    fontIdx,
    bright,
    showState,
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
        if (cur.snippets.length < 2) return;
        const next = Math.min(
          Math.max(cur.snippetIdx + step, 0),
          cur.snippets.length - 1,
        );
        cur.snippetIdx = next;
        onSnippetIdx?.(next);
        showToast(cur.snippets[next].title);
      };
      const actions: Record<string, () => void> = {
        BracketLeft: () => go(-1),
        BracketRight: () => go(1),
        KeyP: () => {
          const settings = {
            snippet: cur.snippets[cur.snippetIdx].title,
            look: cur.bright ? "bright" : "original",
            highlighting: cur.highlightOn,
            highlightStyle: highlightStyles[cur.styleIdx].name,
            highlightColor: highlightColors[cur.colorIdx].name,
            syntaxColors: syntaxThemes[cur.syntaxIdx].name,
            letterFont: letterFonts[cur.fontIdx].name,
            foldStyling: cur.foldStyling,
            showState: cur.showState,
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
    [onSnippetIdx, showToast],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  // The controls panel, and the corner button that opens it.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // A hidden instance (the slideshow keeps the previous slide mounted
      // out of sight) shouldn't take keys from a visible one.
      if (rootRef.current && !rootRef.current.checkVisibility()) return;
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
    const onMove = (e: globalThis.PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setNearCorner(
        rect.right - e.clientX < HELP_CORNER_PX &&
          rect.bottom - e.clientY < HELP_CORNER_PX,
      );
    };
    const onLeave = () => setNearCorner(false);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Highlighting follows the editor cursor.
  const style = highlightStyles[styleIdx];
  const activeLoc = highlightOn ? cursorLoc : null;
  const highlightedLocs = useMemo(() => {
    if (!good || activeLoc === null) return [];
    const outer = good.locs[activeLoc];
    if (!outer) return [];
    return good.locs.flatMap((loc, i) =>
      loc.from >= outer.from && loc.to <= outer.to ? [i] : [],
    );
  }, [good, activeLoc]);

  // Diagram sizing.
  const [paneRef, paneSize] = useElementSize<HTMLDivElement>();
  const scale = Math.max(
    0.1,
    Math.min(
      (paneSize.width * DIAGRAM_FILL) / snippet.width,
      (paneSize.height * DIAGRAM_FILL) / snippet.height,
    ),
  );

  // In the excerpt, the studio layout is zoomed to fit (as `DemoSlide`
  // fits it), with the code over its top left, in our own pixels.
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = rootRef.current!;
    const observer = new ResizeObserver(() =>
      setRootSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const zoom = Math.max(
    0.01,
    Math.min(
      (rootSize.width - 64) / TREE_LAYOUT.width,
      (rootSize.height - 64) / TREE_LAYOUT.height,
      3,
    ),
  );
  const layoutLeft = (rootSize.width - TREE_LAYOUT.width * zoom) / 2;
  const layoutTop = (rootSize.height - TREE_LAYOUT.height * zoom) / 2;
  const excerptTop = layoutTop + TREE_LAYOUT.pad * zoom;
  const excerptHeight =
    TREE_LAYOUT.height -
    TREE_LAYOUT.pad -
    snippet.height * TREE_LAYOUT.diagramZoom;

  // Into the excerpt, the code it hides fades out, and then the layout
  // switches, with the code and the diagram gliding from where they were.
  // (Out of it, the layout switches at once.)
  const [inExcerpt, setInExcerpt] = useState(excerpt);
  const inExcerptRef = useRef(inExcerpt);
  inExcerptRef.current = inExcerpt;
  const glideFromRef = useRef<{
    code: { x: number; y: number } | null;
    diagram: DOMRect | null;
  } | null>(null);
  const codeHostRef = useRef<HTMLDivElement>(null);
  const diagramBoxRef = useRef<HTMLDivElement>(null);
  const excerptFontSize = EXCERPT_FONT_SIZE * zoom;
  const excerptBox = useMemo(
    () => ({ width: EXCERPT_W * zoom, fontSize: excerptFontSize }),
    [zoom, excerptFontSize],
  );
  useEffect(() => {
    if (excerpt === inExcerptRef.current) return;
    const api = editorApiRef.current;
    if (!excerpt || !api) {
      setInExcerpt(excerpt);
      return;
    }
    let done = false;
    void Promise.all([
      api.prepareExcerpt(),
      new Promise((resolve) => setTimeout(resolve, EXCERPT_FADE_MS)),
    ]).then(() => {
      if (done) return;
      done = true;
      glideFromRef.current = {
        code: api.excerptOrigin(),
        diagram: diagramBoxRef.current?.getBoundingClientRect() ?? null,
      };
      setInExcerpt(true);
    });
    return () => {
      if (!done) api.cancelExcerpt();
      done = true;
    };
  }, [excerpt]);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  useLayoutEffect(() => {
    const from = glideFromRef.current;
    glideFromRef.current = null;
    if (!from || !inExcerpt) return;
    const box = diagramBoxRef.current;
    if (box && from.diagram) {
      const to = box.getBoundingClientRect();
      // Screen pixels per pixel of the box's own (zoomed) coordinates
      const k = to.width / box.offsetWidth;
      glide(
        box,
        (from.diagram.left - to.left) / k,
        (from.diagram.top - to.top) / k,
        from.diagram.width / to.width,
        "0 0",
      );
    }
    const host = codeHostRef.current;
    const to = editorApiRef.current?.excerptOrigin();
    if (host && from.code && to) {
      const rect = host.getBoundingClientRect();
      const k = rect.width / host.offsetWidth;
      glide(
        host,
        (from.code.x - to.x) / k,
        (from.code.y - to.y) / k,
        fontSizeRef.current / excerptFontSize,
        `${(to.x - rect.left) / k}px ${(to.y - rect.top) / k}px`,
      );
    }
    // Only when the layout switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inExcerpt]);

  const dragging = dragStatus?.type === "dragging" ? dragStatus : null;

  // The tree stays clear of the spec's lines of code (the rest it may
  // cover), measured in layout units as a drag starts (when it appears).
  const layoutRef = useRef<HTMLDivElement>(null);
  const [specLineEnds, setSpecLineEnds] = useState<
    { right: number; bottom: number }[]
  >([]);
  const isDragging = dragging !== null;
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!isDragging || !layout) return;
    const rect = layout.getBoundingClientRect();
    // Screen pixels per layout unit
    const k = rect.width / TREE_LAYOUT.width;
    setSpecLineEnds(
      (editorApiRef.current?.specLineEnds() ?? []).map((end) => ({
        right: (end.right - rect.left) / k,
        bottom: (end.bottom - rect.top) / k,
      })),
    );
  }, [isDragging]);
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
      KeyD: showDebug,
      KeyH: highlightStyles[styleIdx].name,
      KeyC: syntaxThemes[syntaxIdx].name,
      KeyL: letterFonts[fontIdx].name,
      Minus: fontSize,
    },
  };

  const renderer = good && state && (
    <ErrorBoundary
      resetOnChange={good}
      fallback={(err) => (
        <div style={{ color: "#cf222e", fontSize: 12 }}>{err.message}</div>
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
  );

  // The editor keeps its place in the tree in both layouts, so it stays
  // mounted (with its cursor, focus, and undo history) through a switch.
  return (
    <div
      ref={rootRef}
      data-talk-root
      onPointerDown={() => panelOpen && setPanelOpen(false)}
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        background: "white",
        color: "#24292f",
        overflow: "hidden",
      }}
    >
      <style>
        {`[data-talk-root] { --talk-hl: ${highlightColors[colorIdx].color}; }
[data-talk-diagram] text[data-loc] { font-family: ${letterFonts[fontIdx].family}; }
${diagramHighlightCss("[data-talk-diagram]", highlightedLocs, style.diagram)}`}
      </style>
      <HaloFilter />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          ...(inExcerpt
            ? {
                position: "absolute",
                left: layoutLeft + TREE_LAYOUT.pad * zoom,
                top: excerptTop,
                width: EXCERPT_W * zoom,
                height: excerptHeight * zoom,
                fontSize: EXCERPT_FONT_SIZE * zoom,
              }
            : { flex: CODE_FLEX, minWidth: 0, fontSize }),
        }}
      >
        {/* The code wraps to this box, but the editor runs on beyond it
            (under the diagram), so a line too long to wrap (initialState)
            overflows rather than being cut off. */}
        <div
          ref={codeBoxRef}
          style={{ flex: 1, minHeight: 0, position: "relative" }}
        >
          <div
            ref={codeHostRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              ...(inExcerpt
                ? {
                    width:
                      (TREE_LAYOUT.width -
                        TREE_LAYOUT.pad -
                        TREE_LAYOUT.treePad) *
                      zoom,
                    height: (TREE_LAYOUT.height - TREE_LAYOUT.pad) * zoom,
                  }
                : {
                    bottom: 0,
                    right: `calc(-100% * ${DIAGRAM_FLEX} / ${CODE_FLEX})`,
                  }),
            }}
          >
            <CodeEditor
              doc={snippet.code}
              docKey={docKey}
              prelude={snippet.prelude}
              onDocChange={setSource}
              onCursorLoc={setCursorLoc}
              locs={good?.locs ?? []}
              locsDoc={good?.source ?? ""}
              active={activeLoc}
              style={style.code}
              syntaxTheme={syntaxIdx}
              foldStyling={foldStyling}
              fontSize={inExcerpt ? EXCERPT_FONT_SIZE * zoom : fontSize}
              formatWidthRef={codeBoxRef}
              excerpt={inExcerpt}
              excerptHandler={snippet.excerptHandler}
              excerptBox={excerptBox}
              apiRef={editorApiRef}
            />
          </div>
        </div>
        <div
          style={{
            minHeight: "1.5em",
            fontSize: 14,
            fontFamily: "ui-monospace, Menlo, monospace",
            color: "#cf222e",
            opacity: error ? 1 : 0,
            transition: "opacity 300ms",
            ...(inExcerpt
              ? {
                  // Below the layout
                  position: "absolute",
                  left: 0,
                  top: layoutTop + TREE_LAYOUT.height * zoom - excerptTop + 4,
                  whiteSpace: "nowrap",
                }
              : { padding: "0 24px 12px 48px" }),
          }}
        >
          {error}
        </div>
      </div>

      {inExcerpt ? (
        // Over the editor, which runs on underneath it, but letting
        // pointer events through to it everywhere but the diagram.
        <div
          ref={layoutRef}
          style={{
            position: "absolute",
            left: layoutLeft,
            top: layoutTop,
            zoom,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <TreeViewLayout
            label={<div />}
            avoid={specLineEnds}
            diagram={
              <div
                ref={diagramBoxRef}
                data-talk-diagram
                style={{
                  width: snippet.width,
                  height: snippet.height,
                  pointerEvents: "auto",
                }}
              >
                {renderer}
              </div>
            }
            tree={
              dragging && (
                <DragSpecTreeView
                  op={dragging.result.op}
                  activePath={dragging.result.activePath}
                  colorMap={null}
                  svgWidth={snippet.width}
                  svgHeight={snippet.height}
                  thumbArea={treeThumbArea(dragging.result.op)}
                  nodeProps={{ "withFloating/whenFar/bg/": { width: 150 } }}
                />
              )
            }
          />
        </div>
      ) : (
        <div
          style={{
            flex: DIAGRAM_FLEX,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            // Above the editor, which runs on underneath it
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            ref={paneRef}
            data-talk-diagram
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {renderer && (
              <div
                ref={diagramBoxRef}
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
                  {renderer}
                </div>
              </div>
            )}
          </div>

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
      )}
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
 * The fill variant instead lays the grown silhouette over the element,
 * translucent. Units are the diagram's own (before it's scaled up to fit
 * the pane).
 */
function HaloFilter() {
  const GAP = 5;
  const WIDTH = 1.5;
  const FILL_OPACITY = 0.3;
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <filter id={HALO_FILTER_ID} x="-50%" y="-50%" width="200%" height="200%">
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
      <filter
        id={HALO_FILL_FILTER_ID}
        x="-50%"
        y="-50%"
        width="200%"
        height="200%"
      >
        <feMorphology
          in="SourceAlpha"
          operator="dilate"
          radius={GAP}
          result="grown"
        />
        <feFlood
          style={{ floodColor: HIGHLIGHT_COLOR, floodOpacity: FILL_OPACITY }}
          result="color"
        />
        <feComposite in="color" in2="grown" operator="in" result="fill" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="fill" />
        </feMerge>
      </filter>
    </svg>
  );
}

/**
 * Animates an element from where a transform (translate, then scale
 * about `origin`) puts it, back to where it is.
 */
function glide(
  el: HTMLElement,
  dx: number,
  dy: number,
  scale: number,
  origin: string,
) {
  el.style.transition = "none";
  el.style.transformOrigin = origin;
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  el.getBoundingClientRect(); // so the start takes effect before the transition
  el.style.transition = `transform ${GLIDE_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`;
  el.style.transform = "";
  el.addEventListener(
    "transitionend",
    () => {
      el.style.transition = "";
      el.style.transformOrigin = "";
    },
    { once: true },
  );
}

/** A callback ref, and the size of the element it's on (or was last). */
function useElementSize<E extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((el: E | null) => {
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
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
