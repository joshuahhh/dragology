import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import { type Heading, type Slide, STAGE_H, STAGE_W } from "./slide";
import { numberedOutline, slides } from "./slides";
import { SlideThumb, useSlideSnapshots } from "./SlideThumb";

const FADE_MS = 300;
const FADE_WHITE_MS = 200;

/** Every video file the slides play clips from, each kept loaded throughout. */
const videoSrcs = [
  ...new Set(slides.flatMap((s) => ("video" in s ? [s.video.src] : []))),
];

function useStageZoom() {
  const compute = () =>
    Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [zoom, setZoom] = useState(compute);
  useLayoutEffect(() => {
    const update = () => setZoom(compute());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return zoom;
}

function useVideoPlayer() {
  const videoEls = useRef(new Map<string, HTMLVideoElement>());
  const playingRef = useRef<{
    slideIdx: number;
    video: HTMLVideoElement;
    frameCallback: number;
  } | null>(null);

  const stop = useCallback(() => {
    const p = playingRef.current;
    if (p) p.video.cancelVideoFrameCallback(p.frameCallback);
    playingRef.current = null;
    for (const video of videoEls.current.values()) video.pause();
  }, []);

  const playSlide = useCallback(
    (slideIdx: number) => {
      const slide = slides[slideIdx];
      if (!("video" in slide)) return;
      if (playingRef.current?.slideIdx === slideIdx) return;
      stop();
      const video = videoEls.current.get(slide.video.src);
      if (!video) return;
      const { start, end } = slide.video;
      const playing = { slideIdx, video, frameCallback: 0 };
      const checkFrame = () => {
        if (video.paused) return;
        if (video.currentTime >= end) {
          video.pause();
          return;
        }
        playing.frameCallback = video.requestVideoFrameCallback(checkFrame);
      };
      playingRef.current = playing;
      video.currentTime = start;
      video.play()?.catch(() => {});
      playing.frameCallback = video.requestVideoFrameCallback(checkFrame);
    },
    [stop],
  );

  const [playing, setPlaying] = useState(false);
  const updatePlaying = useCallback(() => {
    setPlaying([...videoEls.current.values()].some((v) => !v.paused));
  }, []);

  return { videoEls, playSlide, stop, playing, updatePlaying };
}

/**
 * Every slide's snapshot, with the outline's headings in the gutters, for the
 * space the stage leaves below it: click one to go there. It's for whoever is at the window, not the audience, so it's sized
 * in window pixels, not stage pixels.
 */
/**
 * Each slide with the headings just before it, which start its section. (A
 * heading with no slide after it isn't shown.)
 */
const outlineSlides = (() => {
  const result: { slide: Slide; num: number; headings: Heading[] }[] = [];
  let headings: Heading[] = [];
  for (const item of numberedOutline) {
    if ("heading" in item) {
      headings.push(item);
    } else {
      result.push({ ...item, headings });
      headings = [];
    }
  }
  return result;
})();

function SlideOutline({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (i: number) => void;
}) {
  useSlideSnapshots();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the current slide in view. (Not scrollIntoView, which would also
  // scroll the page's overflow: hidden container.)
  useEffect(() => {
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-slide="${current}"]`,
    );
    if (!container || !el) return;
    const pad = 12;
    // Room for the headings in the gutter above
    const top = el.offsetTop - 28;
    const bottom = el.offsetTop + el.offsetHeight + pad;
    if (top < container.scrollTop) {
      container.scrollTo({ top, behavior: "smooth" });
    } else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({
        top: bottom - container.clientHeight,
        behavior: "smooth",
      });
    }
  }, [current]);

  return (
    <div
      ref={scrollRef}
      className="self-stretch flex-1 min-h-0 overflow-y-auto"
      style={{ position: "relative" }}
    >
      <div className="grid gap-x-3 gap-y-7 px-3 pt-7 pb-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {outlineSlides.map(({ slide, num, headings }) => {
          const i = num - 1;
          return (
            <div key={i} data-slide={i} style={{ position: "relative" }}>
              {/* The section's headings, in the gutter above its first slide */}
              {headings.length > 0 && (
                <div className="absolute bottom-full mb-1 whitespace-nowrap text-sm">
                  {headings.map((h, j) => (
                    <span
                      key={j}
                      className={
                        h.level === 1
                          ? "font-bold text-white"
                          : "font-semibold text-gray-400"
                      }
                    >
                      {j > 0 && <span className="text-gray-600"> · </span>}
                      {h.heading}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={`flex flex-col gap-1 cursor-pointer ${
                  i === current ? "" : "opacity-50 hover:opacity-100"
                }`}
                onClick={() => onSelect(i)}
              >
                <div
                  className={`bg-white aspect-video ${
                    i === current
                      ? "ring-4 ring-amber-400 ring-offset-2 ring-offset-[#111]"
                      : "ring-1 ring-gray-700"
                  }`}
                >
                  <SlideThumb slide={slide} num={num} />
                </div>
                <div
                  className={`text-xs tabular-nums ${
                    i === current ? "text-white font-semibold" : "text-gray-500"
                  }`}
                >
                  {num}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [transitioning, setTransitioning] = useState<
    false | "fade" | "fade-white"
  >(false);
  const prevSlideRef = useRef(currentSlide);

  // Video player — must be before transition effect so videoEls is available
  const {
    videoEls,
    playSlide,
    stop: stopVideo,
    playing: videoPlaying,
    updatePlaying,
  } = useVideoPlayer();
  // Video files that have finished a seek, so are showing a frame of some clip
  const [seekedSrcs, setSeekedSrcs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (currentSlide === prevSlideRef.current) return;
    const goingForward = currentSlide > prevSlideRef.current;
    const targetSlide = slides[currentSlide];
    const transition = goingForward ? targetSlide.transition : undefined;
    const layer = activeLayerRef.current;

    // Cancel any in-progress transition
    setTransitioning(false);

    // Pre-seek video if the target slide is a video
    const targetVideo =
      "video" in targetSlide
        ? videoEls.current.get(targetSlide.video.src)
        : undefined;
    if (targetVideo && "video" in targetSlide) {
      targetVideo.pause();
      targetVideo.currentTime = targetSlide.video.start;
    }

    if (!transition) {
      if (targetVideo) {
        // Don't swap layer content yet — keep showing the old slide
        // until the video has seeked to the correct frame
        const video = targetVideo;
        const onSeeked = () => {
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
      setTransitioning("fade-white");
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
            }, FADE_WHITE_MS),
          );
        }, FADE_WHITE_MS),
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
      setTransitioning("fade");
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
        }, FADE_MS),
      );
    }

    prevSlideRef.current = currentSlide;
    return () => timers.forEach(clearTimeout);
  }, [currentSlide, videoEls]);

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
      } else if (e.key === "o") {
        navigate("/slideshow-outline");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, navigate]);

  const stageZoom = useStageZoom();

  // Start/stop video when active slide changes
  useEffect(() => {
    if ("video" in shownSlide) {
      playSlide(displaySlide);
    } else {
      stopVideo();
    }
  }, [displaySlide, shownSlide, playSlide, stopVideo]);

  const transitionMs = transitioning === "fade-white" ? FADE_WHITE_MS : FADE_MS;

  // A video file is visible while a visible layer shows one of its clips,
  // once it has a clip's frame to show. (So a cut between clips of one file
  // keeps showing the old frame until the new seek completes.)
  const videoOpacity = new Map<string, number>();
  for (const i of [0, 1] as const) {
    const s = slides[layerSlides[i]];
    if (!("video" in s) || !seekedSrcs.has(s.video.src)) continue;
    const op = transitioning ? layerOpacity[i] : i === activeLayer ? 1 : 0;
    const prev = videoOpacity.get(s.video.src) ?? 0;
    videoOpacity.set(s.video.src, Math.max(prev, op));
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col items-center select-none"
      style={{ overflow: "hidden", background: "#111" }}
    >
      {/* The stage. Layout and paint containment make it the containing block
          for position: fixed descendants (e.g. DemoSettingsBar), so they stay
          inside the stage rather than pinning to the window. */}
      <div
        className="bg-white flex flex-col"
        style={{
          position: "relative",
          width: STAGE_W,
          height: STAGE_H,
          flexShrink: 0,
          zoom: stageZoom,
          contain: "layout paint",
        }}
      >
        {/* Preloaded video elements (hidden when not on a video slide) */}
        {videoSrcs.map((src) => {
          const opacity = videoOpacity.get(src) ?? 0;
          return (
            <video
              key={src}
              ref={(el) => {
                if (el) videoEls.current.set(src, el);
              }}
              src={src}
              preload="auto"
              muted
              playsInline
              onSeeked={() =>
                setSeekedSrcs((prev) =>
                  prev.has(src) ? prev : new Set(prev).add(src),
                )
              }
              onPlay={updatePlaying}
              onPause={updatePlaying}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "white",
                visibility: opacity > 0 ? "visible" : "hidden",
                opacity,
                transition: transitioning
                  ? `opacity ${transitionMs}ms linear`
                  : "none",
                pointerEvents: opacity > 0 ? "auto" : "none",
                zIndex: 5,
              }}
            />
          );
        })}

        {/* Main slide area — two layers stacked via CSS grid so both get identical layout */}
        <div
          className="flex-1 min-h-0"
          style={{ display: "grid", isolation: "isolate" }}
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
                  transition: transitioning
                    ? `opacity ${transitionMs}ms linear`
                    : "none",
                  mixBlendMode: "plus-lighter",
                  pointerEvents: isActive ? "auto" : "none",
                  visibility: visible ? "visible" : "hidden",
                }}
              >
                {"content" in s && s.content}
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
          <svg
            width="8"
            height="9"
            viewBox="0 0 8 9"
            fill="currentColor"
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginLeft: 4,
              opacity: videoPlaying ? 1 : 0,
            }}
          >
            <path d="M0 0.5L8 4.5L0 8.5Z" />
          </svg>
        </div>
      </div>

      <SlideOutline current={currentSlide} onSelect={setCurrentSlide} />
    </div>
  );
}
