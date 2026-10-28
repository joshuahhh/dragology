import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Slide } from "./slide";
import { numberedOutline } from "./slides";
import { SlideThumb, useSlideSnapshots } from "./SlideThumb";

export function SlideshowOutlinePage() {
  useTitle("Dragology — Slideshow outline");
  useSlideSnapshots();
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(360px,1fr))]">
        {numberedOutline.map((item, i) =>
          "heading" in item ? (
            <h2
              key={i}
              className={
                item.level !== 2
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
                <SlideThumb slide={item.slide} num={item.num} />
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
    </div>
  );
}
