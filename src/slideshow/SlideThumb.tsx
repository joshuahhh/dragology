import { useEffect } from "react";
import { type Slide } from "./slide";

// Content slides are too heavy to render live in a grid, so they're shown from
// snapshots taken by snapshot-slides.sh, which the dev server runs on changes
// to the slides once a page showing them tells it it's open
// (useSlideSnapshots). The script writes a manifest of content hashes
// alongside them; the hashes bust the browser's image cache, and since the
// manifest is a module, a new snapshot updates the page by HMR. (Globbed so
// that a missing manifest is fine.)
const manifest: Record<string, string> =
  Object.values(
    import.meta.glob<Record<string, string>>("./thumbs.json", {
      eager: true,
      import: "default",
    }),
  )[0] ?? {};

export function SlideThumb({ slide, num }: { slide: Slide; num: number }) {
  if ("video" in slide) {
    return (
      <video
        src={`${slide.video.src}#t=${slide.video.start}`}
        preload="metadata"
        muted
        playsInline
        className="w-full h-full object-contain"
      />
    );
  }
  const hash = manifest[num];
  if (!hash) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
        no snapshot yet
      </div>
    );
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}slides/thumbs/${num}.jpg?v=${hash}`}
      className="w-full h-full object-contain"
      draggable={false}
    />
  );
}

/** Tells the dev server to keep the snapshots current. */
export function useSlideSnapshots() {
  useEffect(() => {
    import.meta.hot?.send("slide-snapshots:open");
  }, []);
}
