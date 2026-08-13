import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DemoSettingsBar, DemoSettingsProvider } from "../demo/ui";
import { useTitle } from "../useTitle";
import { slides } from "./slides";

function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endTimeRef = useRef<number>(0);
  const playingSlideRef = useRef<number>(-1);
  const rafIdRef = useRef<number>(0);

  const checkFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    if (video.currentTime >= endTimeRef.current) {
      video.pause();
      return;
    }
    rafIdRef.current = video.requestVideoFrameCallback(checkFrame);
  }, []);

  const playSlide = useCallback(
    (slideIdx: number) => {
      const video = videoRef.current;
      const slide = slides[slideIdx];
      if (!video || slide.type !== "video") return;
      if (playingSlideRef.current === slideIdx) return;
      playingSlideRef.current = slideIdx;
      video.currentTime = slide.startTime;
      endTimeRef.current = slide.endTime;
      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => {});
      rafIdRef.current = video.requestVideoFrameCallback(checkFrame);
    },
    [checkFrame],
  );

  const stop = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.cancelVideoFrameCallback(rafIdRef.current);
      video.pause();
    }
    playingSlideRef.current = -1;
  }, []);

  return { videoRef, playSlide, stop };
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

  // Video player — must be before transition effect so videoRef is available
  const { videoRef, playSlide, stop: stopVideo } = useVideoPlayer();
  const [videoSeekedSlide, setVideoSeekedSlide] = useState<number>(-1);

  useEffect(() => {
    if (currentSlide === prevSlideRef.current) return;
    const goingForward = currentSlide > prevSlideRef.current;
    const targetSlide = slides[currentSlide];
    const transition = goingForward ? targetSlide.transition : undefined;
    const layer = activeLayerRef.current;

    // Cancel any in-progress transition
    setTransitioning(false);

    // Pre-seek video if the target slide is a video
    if (targetSlide.type === "video" && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = targetSlide.startTime;
    }

    if (!transition) {
      if (targetSlide.type === "video" && videoRef.current) {
        // Don't swap layer content yet — keep showing the old slide
        // until the video has seeked to the correct frame
        const video = videoRef.current;
        const slideIdx = currentSlide;
        const onSeeked = () => {
          setVideoSeekedSlide(slideIdx);
          const next: [number, number] = [...layerSlidesRef.current] as [
            number,
            number,
          ];
          next[activeLayerRef.current] = currentSlide;
          setLayerSlides(next);
          video.removeEventListener("seeked", onSeeked);
        };
        video.addEventListener("seeked", onSeeked);
        prevSlideRef.current = currentSlide;
        return () => video.removeEventListener("seeked", onSeeked);
      }

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
  }, [currentSlide, videoRef]);

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

  // Mark video ready once seek completes (for transitions)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onSeeked = () => setVideoSeekedSlide(currentSlide);
    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  }, [videoRef, currentSlide]);

  // Start/stop video when active slide changes
  useEffect(() => {
    if (shownSlide.type === "video") {
      playSlide(displaySlide);
    } else {
      stopVideo();
    }
  }, [displaySlide, shownSlide, playSlide, stopVideo]);

  // Compute video visibility from both layers
  const videoSrc = slides.find((s) => s.type === "video")
    ? `${import.meta.env.BASE_URL}slides/model-driven-full.mp4`
    : null;

  // Video is visible if any layer has a video slide AND the video is seeked
  // to some video slide (not necessarily the target — so video→video cuts
  // keep showing the old frame until the new seek completes)
  const videoIsReady =
    videoSeekedSlide >= 0 && slides[videoSeekedSlide]?.type === "video";
  let videoOpacity = 0;
  let videoVisible = false;
  for (const i of [0, 1] as const) {
    if (slides[layerSlides[i]].type === "video") {
      const op = transitioning ? layerOpacity[i] : i === activeLayer ? 1 : 0;
      if (op > 0 && videoIsReady) {
        videoOpacity = op;
        videoVisible = true;
      }
    }
  }

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
            height: "100%",
            objectFit: "contain",
            background: "white",
            visibility: videoVisible ? "visible" : "hidden",
            opacity: videoOpacity,
            transition: transitioning ? "opacity 300ms ease" : "none",
            pointerEvents: videoVisible ? "auto" : "none",
            zIndex: 5,
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
                <DemoSettingsProvider persist={false}>
                  <div
                    className="flex items-center justify-center"
                    style={{
                      zoom: demoZooms[layerIdx],
                      marginTop: s.overlayTitle ? 40 : 0,
                    }}
                  >
                    <s.Component />
                  </div>
                  {isActive && <DemoSettingsBar compact />}
                </DemoSettingsProvider>
              )}
            </div>
          );
        })}
      </div>

      {/* Slide counter (minimal, bottom-left) */}
      <div
        className="fixed bottom-2 left-3 text-xs text-gray-300 select-none pointer-events-none"
        style={{ zIndex: 30 }}
      >
        {currentSlide + 1}/{slides.length}
      </div>
    </div>
  );
}
