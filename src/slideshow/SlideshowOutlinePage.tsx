import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Slide } from "./slide";
import { slides } from "./slides";

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

export function SlideshowOutlinePage() {
  useTitle("Dragology — Slideshow outline");
  useEffect(() => {
    import.meta.hot?.send("slide-snapshots:open");
  }, []);
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(360px,1fr))]">
        {slides.map((slide, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Link
              to={`/slideshow/${i + 1}`}
              className="block bg-white aspect-video shadow-sm ring-1 ring-gray-200 hover:ring-2 hover:ring-blue-400"
            >
              <Thumb slide={slide} num={i + 1} />
            </Link>
            <div className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-gray-400 tabular-nums">{i + 1}</span>
                <span className="font-semibold">{slide.title}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {"video" in slide &&
                    `video ${slide.video.start}–${slide.video.end}s`}
                  {"video" in slide && slide.transition && " · "}
                  {slide.transition}
                </span>
              </div>
              {slide.subtitles && (
                <div className="text-gray-600 mt-1">{slide.subtitles}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
