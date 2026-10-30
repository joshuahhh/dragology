import { useEffect } from "react";
import { type Slide, slideFileUrl } from "./slide";

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
        src={`${slideFileUrl(slide.video.file)}#t=${slide.video.start}`}
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

/** A wash and a label over a slide's thumbnail, for a slide not presented */
export function SkipBadge() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gray-900/45"
      title="Not presented: going forward or back passes over this slide"
    >
      <span className="rounded bg-gray-900/80 px-1.5 py-0.5 text-xs font-semibold text-white">
        not presented
      </span>
    </div>
  );
}

/** A corner folded down on a slide's thumbnail, for a slide with a TODO */
export function TodoCorner() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 18 18"
      className="absolute top-0 right-0"
    >
      <title>This slide has a TODO</title>
      <path d="M0 0H18V18Z" fill="#f97316" />
    </svg>
  );
}

/** Tells the dev server to keep the snapshots current. */
export function useSlideSnapshots() {
  useEffect(() => {
    import.meta.hot?.send("slide-snapshots:open");
  }, []);
}
