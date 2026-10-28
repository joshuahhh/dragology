import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  NEXT_KEYS,
  PREV_KEYS,
  STAGE_H,
  STAGE_W,
  useSlideCurrent,
} from "./slide";

/** The arrow keys, which the slideshow uses and some embedded apps don't.
 * Up and down are left to the app (they move through Hazel's code, say),
 * except with Ctrl. */
const ARROW_KEYS = ["ArrowRight", "ArrowLeft"];
const CTRL_ARROW_KEYS = [...NEXT_KEYS, ...PREV_KEYS];

/** Embedded windows whose keys already go through their slide */
const bridged = new WeakSet<Window>();

/**
 * Another web app on the stage, in an iframe: a static build of it in
 * public/embeds (see d2-talk/framework-changes.md), so that it's on our
 * origin, which lets us reach into it to style it and catch keys.
 *
 * While the embed has focus, keys go to it, except the arrow keys if `arrows`
 * is "slideshow" (and with Ctrl either way), and Escape, which takes focus
 * out of the embed so that all keys go to the slideshow again. A ring around the
 * embed shows when it has focus. On the dev server, vite-plugin-embed-keys.ts
 * has the embedded page tell us its window exists before the app's scripts
 * run, so we see keys before the app does, whatever the app does with them.
 *
 * On its slide, ⌘+, ⌘− and ⌘0 zoom the embed rather than the whole page; the
 * zoom is remembered, per embedded app, in localStorage.
 */
export function EmbedSlide({
  src,
  width = STAGE_W,
  height = STAGE_H,
  zoom: defaultZoom = 1,
  css,
  arrows = "slideshow",
  focusOnShow = false,
}: {
  /** The page to show, relative to public/embeds, e.g. "hazel/index.html" */
  src: string;
  /** The embed's size on the stage, in stage pixels */
  width?: number;
  height?: number;
  /**
   * How much bigger to draw the app than it would draw itself: the iframe is
   * laid out at `width / zoom` × `height / zoom` and scaled up.
   */
  zoom?: number;
  /** CSS to add to the embedded page, e.g. to hide parts of it */
  css?: string;
  /** Whether the arrow keys go to the slideshow or to the embedded app */
  arrows?: "slideshow" | "app";
  /** Whether to give the embed focus when its slide is shown */
  focusOnShow?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const active = useSlideCurrent();
  const zoomKey = `embed-zoom:${src.split("/")[0]}`;
  const [zoom, setZoom] = useState(() => {
    try {
      return Number(localStorage.getItem(zoomKey)) || defaultZoom;
    } catch {
      return defaultZoom;
    }
  });
  const [focused, setFocused] = useState(false);

  /** Handles ⌘+, ⌘− and ⌘0; returns whether it did. */
  const onZoomKey = useCallback(
    (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return false;
      const by = { "=": 1.1, "+": 1.1, "-": 1 / 1.1, "0": 0 }[e.key];
      if (by === undefined) return false;
      e.preventDefault();
      setZoom((z) => {
        const next = by === 0 ? defaultZoom : Math.round(z * by * 100) / 100;
        try {
          if (by === 0) localStorage.removeItem(zoomKey);
          else localStorage.setItem(zoomKey, String(next));
        } catch {}
        return next;
      });
      return true;
    },
    [defaultZoom, zoomKey],
  );

  // Zoom keys pressed while the slideshow has the keys
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onZoomKey);
    return () => window.removeEventListener("keydown", onZoomKey);
  }, [active, onZoomKey]);

  // Whether the embed has focus: the page loses it to the iframe
  useEffect(() => {
    const update = () =>
      setFocused(document.activeElement === iframeRef.current);
    // activeElement only changes after the blur event
    const onBlur = () => setTimeout(update);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", update);
    };
  }, []);

  useEffect(() => {
    if (active && focusOnShow) iframeRef.current?.focus();
  }, [active, focusOnShow]);

  // The embedded window's keys, each pressed before the app sees it
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const forwarded = arrows === "slideshow" ? ARROW_KEYS : [];
    onKey.current = (e) => {
      if (onZoomKey(e)) {
        e.stopImmediatePropagation();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        iframeRef.current?.blur();
        window.focus();
      } else if (
        forwarded.includes(e.key) ||
        // Ctrl(+Shift)+arrows, which always navigate
        (e.ctrlKey && CTRL_ARROW_KEYS.includes(e.key)) ||
        // The slideshow's Ctrl+Shift+<letter> hotkeys, which work everywhere
        (e.ctrlKey && e.shiftKey && e.code.startsWith("Key"))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            code,
            ctrlKey,
            shiftKey,
            altKey,
            metaKey,
          }),
        );
      }
    };
  }, [arrows, onZoomKey]);

  // Catch the embedded window's keys: as soon as it exists if the page says
  // so (see vite-plugin-embed-keys.ts), else once it has loaded. Listeners in
  // the same phase run in the order they were added, so the earlier the
  // better.
  const bridge = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || bridged.has(win)) return;
    bridged.add(win);
    win.addEventListener("keydown", (e) => onKey.current(e), {
      capture: true,
    });
  }, []);
  // A layout effect, to be listening before the page starts loading
  useLayoutEffect(() => {
    const iframe = iframeRef.current!;
    iframe.addEventListener("embed-window", bridge);
    return () => iframe.removeEventListener("embed-window", bridge);
  }, [bridge]);

  // Every load of the embedded page: style it and catch its keys
  useEffect(() => {
    const iframe = iframeRef.current!;
    const onLoad = () => {
      if (css) {
        const doc = iframe.contentDocument!;
        const style = doc.createElement("style");
        style.textContent = css;
        doc.head.appendChild(style);
      }
      bridge();
    };
    iframe.addEventListener("load", onLoad);
    // In case it loaded before we got here
    const doc = iframe.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") onLoad();
    return () => iframe.removeEventListener("load", onLoad);
  }, [css, bridge]);

  return (
    <div
      style={{
        width,
        height,
        overflow: "hidden",
        position: "relative",
        background: "white",
      }}
    >
      <iframe
        ref={iframeRef}
        src={`${import.meta.env.BASE_URL}embeds/${src}`}
        style={{
          border: "none",
          width: width / zoom,
          height: height / zoom,
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      />
      {focused && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            boxShadow: "inset 0 0 0 4px rgba(59, 130, 246, 0.55)",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 12,
              bottom: 10,
              fontSize: 16,
              color: "rgba(59, 130, 246, 0.9)",
            }}
          >
            Esc to give the keys back
          </div>
        </div>
      )}
    </div>
  );
}
