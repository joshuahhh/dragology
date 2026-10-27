import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Slide } from "./slide";
import { outline } from "./slides";

// Content slides are too heavy to render live in a grid, so they're shown from
// snapshots taken by snapshot-slides.sh, which the dev server runs on changes
// to the slides once this page tells it it's open. The script writes a
// manifest of content hashes alongside them; the hashes bust the browser's
// image cache, and since the manifest is a module, a new snapshot updates this
// page by HMR. (Globbed so that a missing manifest is fine.)
const manifest: Record<string, string> =
  Object.values(
    import.meta.glob<Record<string, string>>("./thumbs.json", {
      eager: true,
      import: "default",
    }),
  )[0] ?? {};

function Thumb({ slide, num }: { slide: Slide; num: number }) {
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

// Each slide with its number in the slideshow, which skips headings.
const numbered = (() => {
  let num = 0;
  return outline.map((item) =>
    "heading" in item ? item : { slide: item, num: ++num },
  );
})();

export function SlideshowOutlinePage() {
  useTitle("Dragology — Slideshow outline");
  useEffect(() => {
    import.meta.hot?.send("slide-snapshots:open");
  }, []);
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(360px,1fr))]">
        {numbered.map((item, i) =>
          "heading" in item ? (
            <h2
              key={i}
              className={
                item.level === 1
                  ? "col-span-full text-2xl font-bold mt-4 first:mt-0 border-b border-gray-300 pb-1"
                  : "col-span-full text-lg font-semibold text-gray-600 -mb-2"
              }
            >
              {item.heading}
            </h2>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              <Link
                to={`/slideshow/${item.num}`}
                className="block bg-white aspect-video shadow-sm ring-1 ring-gray-200 hover:ring-2 hover:ring-blue-400"
              >
                <Thumb slide={item.slide} num={item.num} />
              </Link>
              <SlideInfo slide={item.slide} num={item.num} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SlideInfo({ slide, num }: { slide: Slide; num: number }) {
  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-gray-400 tabular-nums">{num}</span>
        <span className="font-semibold">{slide.title}</span>
        <span className="ml-auto text-xs text-gray-400">
          {"video" in slide && `video ${slide.video.start}–${slide.video.end}s`}
          {"video" in slide && slide.transition && " · "}
          {slide.transition}
        </span>
      </div>
      {slide.subtitles && (
        <div className="text-gray-600 mt-1">{slide.subtitles}</div>
      )}
    </div>
  );
}
