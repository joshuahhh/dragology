import { useEffect, useRef } from "react";
import { STAGE_H, STAGE_W, useSlideActive } from "./slide";

/**
 * Keys that, pressed inside an embed, go to the slideshow rather than the
 * embedded app: a presentation clicker's keys. Escape also hands the keys
 * back, by taking focus out of the embed.
 */
const SLIDESHOW_KEYS = ["PageDown", "PageUp"];

/** The arrow keys, which the slideshow uses and some embedded apps don't. */
const ARROW_KEYS = ["ArrowRight", "ArrowLeft"];

/**
 * Another web app on the stage, in an iframe: a static build of it in
 * public/embeds (see d2-talk/framework-changes.md), so that it's on our
 * origin, which lets us reach into it to style it and catch keys.
 *
 * While the embed has focus, keys go to it, except those in SLIDESHOW_KEYS,
 * the arrow keys if `arrows` is "slideshow", and Escape, which takes focus out
 * of the embed so that all keys go to the slideshow again.
 */
export function EmbedSlide({
  src,
  width = STAGE_W,
  height = STAGE_H,
  zoom = 1,
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
  const active = useSlideActive();

  useEffect(() => {
    if (active && focusOnShow) iframeRef.current?.focus();
  }, [active, focusOnShow]);

  // Every load of the embedded page: style it and catch the slideshow's keys
  useEffect(() => {
    const iframe = iframeRef.current!;
    const forwarded = [
      ...SLIDESHOW_KEYS,
      ...(arrows === "slideshow" ? ARROW_KEYS : []),
    ];
    const onLoad = () => {
      const win = iframe.contentWindow!;
      const doc = iframe.contentDocument!;
      if (css) {
        const style = doc.createElement("style");
        style.textContent = css;
        doc.head.appendChild(style);
      }
      win.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") {
            iframe.blur();
            window.focus();
          } else if (forwarded.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }));
          }
        },
        // Before the app sees it
        { capture: true },
      );
    };
    iframe.addEventListener("load", onLoad);
    // In case it loaded before we got here
    const doc = iframe.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") onLoad();
    return () => iframe.removeEventListener("load", onLoad);
  }, [css, arrows]);

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
    </div>
  );
}
