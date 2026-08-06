import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import { slides } from "./slides";

export function SlideshowPage() {
  useTitle("Dragology — Slideshow");
  const { slideNum } = useParams();
  const navigate = useNavigate();

  const initialSlide = slideNum
    ? Math.max(0, Math.min(parseInt(slideNum, 10) - 1, slides.length - 1))
    : 0;
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navigate(`/slideshow/${currentSlide + 1}`, { replace: true });
  }, [currentSlide, navigate]);

  const slide = slides[currentSlide];

  const goNext = useCallback(() => {
    setCurrentSlide((i) => Math.min(i + 1, slides.length - 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentSlide((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  const subtitle = useMemo(() => {
    if (!slide.subtitles) return null;
    return slide.subtitles;
  }, [slide]);

  const slideAreaRef = useRef<HTMLDivElement>(null);
  const [demoZoom, setDemoZoom] = useState(1);

  useLayoutEffect(() => {
    if (slide.type !== "demo" || !slideAreaRef.current) return;
    const el = slideAreaRef.current;
    const update = () => {
      const demoW = (slide.width as number) || 400;
      const demoH = (slide.height as number) || 400;
      const padX = 64;
      const padY = 64;
      const scaleX = (el.clientWidth - padX) / demoW;
      const scaleY = (el.clientHeight - padY) / demoH;
      setDemoZoom(Math.min(scaleX, scaleY, 3));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [slide]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-white flex flex-col select-none"
      style={{ overflow: "hidden" }}
    >
      {/* Main slide area */}
      <div
        ref={slideAreaRef}
        className="flex-1 relative flex items-center justify-center min-h-0"
      >
        {slide.type === "image" ? (
          <img
            src={`${import.meta.env.BASE_URL}slides/${slide.image}`}
            alt=""
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ zoom: demoZoom }}
          >
            <slide.Component />
          </div>
        )}
      </div>

      {/* Subtitle bar */}
      {subtitle && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-2xl px-6 py-3 bg-black/75 text-white text-lg text-center rounded-lg pointer-events-none">
          {subtitle}
        </div>
      )}

      {/* Bottom bar */}
      <div className="h-12 flex items-center justify-between px-4 bg-gray-100 border-t border-gray-200 text-sm text-gray-600 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            disabled={currentSlide === 0}
            className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            ←
          </button>
          <span>
            {currentSlide + 1} / {slides.length}
          </span>
          <button
            onClick={goNext}
            disabled={currentSlide === slides.length - 1}
            className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <div className="text-xs text-gray-400">
          {slide.title}
          {slide.type === "demo" && (
            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Slide dots / scrubber */}
          <div className="flex gap-0.5">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className="p-0 border-0 bg-transparent cursor-pointer"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === currentSlide
                      ? "bg-blue-500"
                      : s.type === "demo"
                        ? "bg-blue-200"
                        : "bg-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
