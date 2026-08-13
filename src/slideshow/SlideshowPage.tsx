import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Slide, slides } from "./slides";

function useVideoPlayer(shownSlide: Slide, displaySlide: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endTimeRef = useRef<number>(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || shownSlide.type !== "video") return;

    video.currentTime = shownSlide.startTime;
    endTimeRef.current = shownSlide.endTime;

    const playPromise = video.play();
    if (playPromise) playPromise.catch(() => {});

    const onTimeUpdate = () => {
      if (video.currentTime >= endTimeRef.current) {
        video.pause();
        video.currentTime = endTimeRef.current;
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.pause();
    };
  }, [displaySlide, shownSlide]);

  return videoRef;
}

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

  // ── Transition state ──
  // Two-layer system: layers[0] and layers[1] are always rendered in the same
  // flex layout. `activeLayer` says which one is visible. On crossfade we show
  // both briefly; on fade-white we use a white overlay.
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  const [layerSlides, setLayerSlides] = useState<[number, number]>([
    currentSlide,
    currentSlide,
  ]);
  const layerSlidesRef = useRef(layerSlides);
  layerSlidesRef.current = layerSlides;
  const [layerOpacity, setLayerOpacity] = useState<[number, number]>([1, 0]);
  const [transitioning, setTransitioning] = useState(false);
  const prevSlideRef = useRef(currentSlide);

  useEffect(() => {
    if (currentSlide === prevSlideRef.current) return;
    const targetSlide = slides[currentSlide];
    const transition = targetSlide.transition;
    const layer = activeLayerRef.current;

    // Cancel any in-progress transition
    setTransitioning(false);

    if (!transition) {
      const next: [number, number] = [...layerSlidesRef.current] as [
        number,
        number,
      ];
      next[layer] = currentSlide;
      setLayerSlides(next);
      prevSlideRef.current = currentSlide;
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (transition === "fade-white") {
      // Fade active layer out → swap content behind white → fade new content in
      setTransitioning(true);
      const outOpacity: [number, number] = [0, 0];
      outOpacity[layer] = 1;
      setLayerOpacity(outOpacity);

      requestAnimationFrame(() => {
        // Start fading the active layer to 0
        const fadeOut: [number, number] = [0, 0];
        setLayerOpacity(fadeOut);
      });
      timers.push(
        setTimeout(() => {
          // Content is now invisible — swap it
          const next: [number, number] = [...layerSlidesRef.current] as [
            number,
            number,
          ];
          next[layer] = currentSlide;
          setLayerSlides(next);
          // Now fade back in
          requestAnimationFrame(() => {
            const fadeIn: [number, number] = [0, 0];
            fadeIn[layer] = 1;
            setLayerOpacity(fadeIn);
          });
          timers.push(
            setTimeout(() => {
              setTransitioning(false);
            }, 300),
          );
        }, 350),
      );
    } else {
      // "fade" — true crossfade using two layers
      const incomingLayer = layer === 0 ? 1 : 0;
      const next: [number, number] = [...layerSlidesRef.current] as [
        number,
        number,
      ];
      next[incomingLayer] = currentSlide;
      setLayerSlides(next);
      // Old layer fully visible, new layer invisible
      const startOpacity: [number, number] = [0, 0];
      startOpacity[layer] = 1;
      startOpacity[incomingLayer] = 0;
      setLayerOpacity(startOpacity);
      setTransitioning(true);
      requestAnimationFrame(() => {
        // Fade: old layer out, new layer in
        const endOpacity: [number, number] = [0, 0];
        endOpacity[layer] = 0;
        endOpacity[incomingLayer] = 1;
        setLayerOpacity(endOpacity);
      });
      timers.push(
        setTimeout(() => {
          setActiveLayer(incomingLayer as 0 | 1);
          setTransitioning(false);
        }, 300),
      );
    }

    prevSlideRef.current = currentSlide;
    return () => timers.forEach(clearTimeout);
  }, [currentSlide]);

  const displaySlide = layerSlides[activeLayer];
  const shownSlide = slides[displaySlide];

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

  const slideAreaRef = useRef<HTMLDivElement>(null);
  const [demoZooms, setDemoZooms] = useState<[number, number]>([1, 1]);

  const layerSlide0 = layerSlides[0];
  const layerSlide1 = layerSlides[1];

  useLayoutEffect(() => {
    if (!slideAreaRef.current) return;
    const el = slideAreaRef.current;
    const update = () => {
      const next: [number, number] = [1, 1];
      for (const layerIdx of [0, 1] as const) {
        const s = slides[layerIdx === 0 ? layerSlide0 : layerSlide1];
        if (s.type !== "demo") continue;
        const demoW = (s.width as number) || 400;
        const demoH = (s.height as number) || 400;
        const padX = 64;
        const padY = s.overlayTitle ? 120 : 64;
        const scaleX = (el.clientWidth - padX) / demoW;
        const scaleY = (el.clientHeight - padY) / demoH;
        next[layerIdx] = Math.min(scaleX, scaleY, 3);
      }
      setDemoZooms(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layerSlide0, layerSlide1]);

  // Video player for video slides
  const videoRef = useVideoPlayer(shownSlide, displaySlide);

  // Find the video source (shared across all video slides)
  const videoSrc = slides.find((s) => s.type === "video")
    ? `${import.meta.env.BASE_URL}slides/model-driven-full.mp4`
    : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-white flex flex-col select-none"
      style={{ overflow: "hidden" }}
    >
      {/* Preloaded video element (hidden when not on a video slide) */}
      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          preload="auto"
          muted
          playsInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "calc(100% - 48px)",
            objectFit: "contain",
            background: "white",
            display: shownSlide.type === "video" ? "block" : "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Main slide area — two layers stacked via CSS grid so both get identical layout */}
      <div
        ref={slideAreaRef}
        className="flex-1 min-h-0"
        style={{ display: "grid" }}
      >
        {([0, 1] as const).map((layerIdx) => {
          const s = slides[layerSlides[layerIdx]];
          const isActive = layerIdx === activeLayer;
          const opacity = transitioning
            ? layerOpacity[layerIdx]
            : isActive
              ? 1
              : 0;
          const visible = opacity > 0 || isActive;
          return (
            <div
              key={layerIdx}
              style={{
                gridArea: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                opacity,
                transition: transitioning ? "opacity 300ms ease" : "none",
                pointerEvents: isActive ? "auto" : "none",
                visibility: visible ? "visible" : "hidden",
              }}
            >
              {/* Overlay title */}
              {s.type === "demo" && s.overlayTitle && (
                <div
                  style={{
                    position: "absolute",
                    top: 24,
                    left: 32,
                    fontSize: 42,
                    fontWeight: "bold",
                    fontStyle: "italic",
                    color: "#1a1a1a",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                >
                  {s.overlayTitle}
                </div>
              )}

              {/* Demo link icon */}
              {s.type === "demo" && s.demoId && isActive && (
                <a
                  href={`#/demos/${s.demoId}`}
                  style={{
                    position: "absolute",
                    bottom: 16,
                    right: 16,
                    zIndex: 10,
                    fontSize: 16,
                    color: "#9ca3af",
                    textDecoration: "none",
                    padding: "4px 6px",
                    borderRadius: 4,
                  }}
                  title="Open demo"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6.5 3.5H3.5C2.95 3.5 2.5 3.95 2.5 4.5V12.5C2.5 13.05 2.95 13.5 3.5 13.5H11.5C12.05 13.5 12.5 13.05 12.5 12.5V9.5" />
                    <path d="M9.5 2.5H13.5V6.5" />
                    <path d="M6.5 9.5L13.5 2.5" />
                  </svg>
                </a>
              )}

              {/* Slide content */}
              {s.type === "image" && (
                <img
                  src={`${import.meta.env.BASE_URL}slides/${s.image}`}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              )}
              {s.type === "demo" && (
                <div
                  className="flex items-center justify-center"
                  style={{
                    zoom: demoZooms[layerIdx],
                    marginTop: s.overlayTitle ? 40 : 0,
                  }}
                >
                  <s.Component />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Subtitle bar */}
      {shownSlide.subtitles && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-2xl px-6 py-3 bg-black/75 text-white text-lg text-center rounded-lg pointer-events-none">
          {shownSlide.subtitles}
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
          {slide.type === "video" && (
            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              VIDEO
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
                        : s.type === "video"
                          ? "bg-purple-200"
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
