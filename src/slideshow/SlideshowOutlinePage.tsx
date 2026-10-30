import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Slide, slideHasTodo, slideSteps } from "./slide";
import { numberedOutline } from "./slides";
import { SlideThumb, TodoCorner, useSlideSnapshots } from "./SlideThumb";
import { SlideTimeBadge } from "./timing";

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
                className="relative block bg-white aspect-video shadow-sm ring-1 ring-gray-200 hover:ring-2 hover:ring-blue-400"
              >
                <SlideThumb slide={item.slide} num={item.num} />
                {slideHasTodo(item.slide) && <TodoCorner />}
                <SlideTimeBadge
                  slide={item.slide}
                  slideIdx={item.num - 1}
                  run={null}
                />
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
        <span className="ml-auto text-xs text-gray-400">
          {[
            "video" in slide &&
              `video ${slide.video.start}–${slide.video.end}s`,
            slideSteps(slide) > 1 && `${slideSteps(slide)} steps`,
            slide.transition,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  );
}
