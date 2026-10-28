import dedent from "dedent";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import {
  SAVE_NOTES_PATH,
  type SaveNotesRequest,
  type SaveNotesResponse,
} from "./notesApi";
import { NotesEditor } from "./NotesEditor";
import {
  type Heading,
  notesFirstLine,
  type Slide,
  SlideActiveContext,
  slideFileUrl,
  SlideStepContext,
  slideSteps,
  STAGE_H,
  STAGE_W,
} from "./slide";
import { numberedOutline, outline, slides } from "./slides";
import { SlideThumb, useSlideSnapshots } from "./SlideThumb";

const FADE_MS = 300;
const FADE_WHITE_MS = 200;

/** Every video file the slides play clips from, each kept loaded throughout. */
const videoFiles = [
  ...new Set(slides.flatMap((s) => ("video" in s ? [s.video.file] : []))),
];

/** Where the slideshow is: a slide, and a step of it (both from 0). */
type SlidePos = { slide: number; step: number };

/**
 * The URL's slide number, from 1, with ".N" for step N of a slide with steps
 * (e.g. "12.3").
 */
function parseSlidePos(slideNum: string | undefined): SlidePos {
  if (!slideNum) return { slide: 0, step: 0 };
  const [s, t] = slideNum.split(".");
  const slide = clamp(parseInt(s, 10) - 1, 0, slides.length - 1);
  const step = t
    ? clamp(parseInt(t, 10) - 1, 0, slideSteps(slides[slide]) - 1)
    : 0;
  return { slide, step };
}

function formatSlidePos({ slide, step }: SlidePos): string {
  return slideSteps(slides[slide]) > 1
    ? `${slide + 1}.${step + 1}`
    : `${slide + 1}`;
}

function clamp(x: number, lo: number, hi: number) {
  return Number.isNaN(x) ? lo : Math.max(lo, Math.min(x, hi));
}

/** Is this key going into a text field, rather than to the page? */
function isTyping(e: KeyboardEvent) {
  return (
    e.target instanceof HTMLElement &&
    !!e.target.closest("input, textarea, [contenteditable]")
  );
}

/**
 * Windows at least this wide for their height get the wide layout. (Narrower
 * ones, like half a screen, keep everything in one column.)
 */
const WIDE_MIN_ASPECT = 1.2;
/** In the wide layout, the room the stage leaves for the outline, at least */
const OUTLINE_MIN_W = 320;
/** In the wide layout, the room the stage leaves for the notes, at least */
const NOTES_MIN_H = 200;

/**
 * The stage's zoom, and whether the window gets the wide layout. If it does,
 * the outline goes to the stage's left, and the notes below it, the stage
 * shrinking to leave them room. If not, the stage fills the window's width,
 * with the notes and the outline in whatever room it leaves below.
 */
function useStageLayout() {
  const compute = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const wide = w / h >= WIDE_MIN_ASPECT;
    const zoom = wide
      ? Math.min((w - OUTLINE_MIN_W) / STAGE_W, (h - NOTES_MIN_H) / STAGE_H)
      : Math.min(w / STAGE_W, h / STAGE_H);
    return { zoom, wide };
  };
  const [layout, setLayout] = useState(compute);
  useLayoutEffect(() => {
    const update = () => setLayout(compute());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return layout;
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
      const video = videoEls.current.get(slide.video.file);
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

/** Each slide's index in `outline`, which counts headings too. */
const outlineIndexOfSlide = outline.flatMap((item, k) =>
  "heading" in item ? [] : [k],
);

/**
 * The current slide's speaker notes, below the stage. In the narrow layout,
 * they're between the stage and the outline, and shrink (and scroll) before
 * the stage does, so the stage stays as big as the window allows. In the wide
 * layout, they fill the room below the stage.
 *
 * During dev they're an editor, saving to slides.tsx on blur, ⌘↵ or ⌘S
 * (vite-plugin-slide-notes.ts); Escape undoes the edit. A save that fails
 * keeps its draft, with the error, until ⌘↵ or ⌘S saves it over whatever is there.
 */
function SlideNotes({
  slideIdx,
  step,
  wide,
  onUnsavedChange,
}: {
  slideIdx: number;
  step: number;
  wide: boolean;
  /** Whether there are edits that would be lost by leaving the page */
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const notes = slides[slideIdx].notes;
  const steps = slideSteps(slides[slideIdx]);
  const editable = !!import.meta.hot;
  // At most one slide's notes are being edited (or saved) at a time
  const [draft, setDraftState] = useState<Draft | null>(null);
  // For handlers that run before a re-render, like a blur right after Escape
  const draftRef = useRef(draft);
  const setDraft = (d: Draft | null) => {
    draftRef.current = d;
    setDraftState(d);
  };

  // A saved draft is done once slides.tsx has it, or once we've moved on.
  // (Until then, it stands in for the notes.)
  const current = draft?.slideIdx === slideIdx ? draft : null;
  if (
    draft?.status === "saved" &&
    (draft.old !== slides[draft.slideIdx].notes || !current)
  ) {
    setDraft(null);
  }

  // Sent saves aren't at risk: the dev server writes them regardless
  const unsaved =
    !!draft &&
    ((draft.status === "editing" && draft.text !== draft.initial) ||
      draft.status === "failed");
  useEffect(() => onUnsavedChange(unsaved), [unsaved, onUnsavedChange]);

  const saved = notes ? dedent(notes) : "";
  const otherFailed =
    draft?.status === "failed" && !current ? draft.slideIdx + 1 : null;
  const readOnly =
    !editable ||
    current?.status === "saving" ||
    current?.status === "saved" ||
    // Don't start a draft that would replace one that failed to save
    otherFailed !== null;

  const onChange = (text: string) => {
    const d = draftRef.current;
    setDraft(
      d?.slideIdx === slideIdx &&
        (d.status === "editing" || d.status === "failed")
        ? { ...d, text }
        : { slideIdx, old: notes, initial: saved, text, status: "editing" },
    );
  };

  const save = ({ retry }: { retry: boolean }) => {
    const d = draftRef.current;
    if (!d || d.slideIdx !== slideIdx) return;
    if (d.status !== "editing" && d.status !== "failed") return;
    // Retrying a failed save, which may overwrite someone else's edit, takes
    // ⌘↵ or ⌘S, not just a blur
    if (d.status === "failed" && !retry) return;
    if (d.status === "editing" && d.text.trim() === d.initial.trim()) {
      setDraft(null);
      return;
    }
    // Saving again after a failure means "these notes, over what's there now"
    const old = d.status === "failed" ? notes : d.old;
    setDraft({ ...d, old, status: "saving", error: undefined });
    const req: SaveNotesRequest = {
      index: outlineIndexOfSlide[slideIdx],
      old,
      notes: d.text,
    };
    void fetch(SAVE_NOTES_PATH, { method: "POST", body: JSON.stringify(req) })
      .then((res) => res.json() as Promise<SaveNotesResponse>)
      .catch((e): SaveNotesResponse => ({ error: String(e) }))
      .then(({ error, changed }) => {
        const d = draftRef.current;
        if (d?.status !== "saving" || d.slideIdx !== slideIdx) return;
        setDraft(
          error
            ? { ...d, status: "failed", error }
            : // An unchanged file sends no update to wait for
              changed
              ? { ...d, status: "saved" }
              : null,
        );
      });
  };

  if (!editable && !saved) return null;
  return (
    <div
      className={`self-stretch min-h-0 overflow-y-auto px-4 py-3 ${
        wide ? "" : "max-h-[40vh] border-b border-gray-800"
      }`}
      style={{ flex: wide ? "1 1 0" : "0 1 auto", position: "relative" }}
    >
      {otherFailed && (
        <div className="text-red-400 text-sm mb-1">
          Slide {otherFailed}’s notes weren’t saved; go back to it to try again.
        </div>
      )}
      {current?.error && (
        <div className="text-red-400 text-sm mb-1">
          Not saved: {current.error}. ⌘S to save yours over it.
        </div>
      )}
      {current && (unsaved || current.status === "saving") && (
        <div
          className={`absolute top-2 right-3 text-xs font-semibold ${
            current.status === "saving" ? "text-gray-500" : "text-amber-400"
          }`}
        >
          {current.status === "saving" ? "Saving…" : "Unsaved"}
        </div>
      )}
      <div className={unsaved ? "border-l-2 border-amber-400 pl-2" : ""}>
        <NotesEditor
          value={current ? current.text : saved}
          stages={steps > 1 ? { current: step, count: steps } : null}
          editable={editable}
          readOnly={readOnly}
          placeholder="Add speaker notes…"
          onChange={onChange}
          onBlur={() => save({ retry: false })}
          onSave={() => save({ retry: true })}
          onCancel={() => {
            const d = draftRef.current;
            if (d?.slideIdx === slideIdx && d.status === "editing") {
              setDraft(null);
            }
          }}
        />
      </div>
    </div>
  );
}

type Draft = {
  slideIdx: number;
  /** The notes in slides.tsx the edit started from */
  old: string | undefined;
  /** The notes as the edit started */
  initial: string;
  text: string;
  status: "editing" | "saving" | "saved" | "failed";
  error?: string;
};

/**
 * While `unsaved`, asks before leaving the page: closing or reloading it, or
 * following a link out of it. (HashRouter can't block navigation itself, so
 * other ways out of the page should check `confirmLeave` themselves.)
 */
function useConfirmLeave(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const link =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (link && !confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);
}

function confirmLeave() {
  return window.confirm(
    "Your speaker notes have unsaved changes. Leave anyway?",
  );
}

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

/**
 * Every slide's snapshot, with the outline's headings in the gutters, for the
 * space the stage leaves below it (or, in the wide layout, to its left): click
 * one to go there. It's for whoever is at the window, not the audience, so
 * it's sized in window pixels, not stage pixels.
 */
function SlideOutline({
  current,
  wide,
  onSelect,
}: {
  current: number;
  wide: boolean;
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
      className={`self-stretch flex-1 min-h-0 min-w-0 overflow-y-auto ${
        wide ? "border-r border-gray-800" : ""
      }`}
      style={{ position: "relative", order: wide ? -1 : undefined }}
    >
      <div className="grid gap-x-3 gap-y-7 px-3 pt-7 pb-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {outlineSlides.map(({ slide, num, headings }) => {
          const i = num - 1;
          const notes = notesFirstLine(slide.notes);
          return (
            <div key={i} data-slide={i} style={{ position: "relative" }}>
              {/* The section's headings, in the gutter above its first slide */}
              {headings.length > 0 && (
                <div className="absolute bottom-full mb-1 whitespace-nowrap text-sm">
                  {headings.map((h, j) => (
                    <span
                      key={j}
                      className={
                        h.level !== 2
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
                  className={`flex gap-1.5 text-xs ${
                    i === current ? "text-white" : "text-gray-500"
                  }`}
                >
                  <span
                    className={`tabular-nums ${i === current ? "font-semibold" : ""}`}
                  >
                    {num}
                  </span>
                  {notes && (
                    <span
                      className={`truncate ${i === current ? "text-gray-300" : ""}`}
                    >
                      {notes}
                    </span>
                  )}
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

  const [pos, setPos] = useState(() => parseSlidePos(slideNum));
  const currentSlide = pos.slide;
  const currentStep = pos.step;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navigate(
      `/slideshow/${formatSlidePos({ slide: currentSlide, step: currentStep })}`,
      {
        replace: true,
      },
    );
  }, [currentSlide, currentStep, navigate]);

  /**
   * The step to show a slide at: a slide other than the current one is
   * shown, while it fades in or out, at the step it was left at.
   */
  const stepOf = (slideIdx: number) =>
    slideIdx === currentSlide
      ? currentStep
      : slideIdx < currentSlide
        ? slideSteps(slides[slideIdx]) - 1
        : 0;

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
  const [seekedFiles, setSeekedFiles] = useState<ReadonlySet<string>>(
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
        ? videoEls.current.get(targetSlide.video.file)
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

  const [notesUnsaved, setNotesUnsaved] = useState(false);
  const notesUnsavedRef = useRef(notesUnsaved);
  notesUnsavedRef.current = notesUnsaved;
  useConfirmLeave(notesUnsaved);

  const goNext = useCallback(() => {
    setPos(({ slide, step }) =>
      step < slideSteps(slides[slide]) - 1
        ? { slide, step: step + 1 }
        : slide < slides.length - 1
          ? { slide: slide + 1, step: 0 }
          : { slide, step },
    );
  }, []);

  // Going back to a slide with steps lands on its last step
  const goPrev = useCallback(() => {
    setPos(({ slide, step }) =>
      step > 0
        ? { slide, step: step - 1 }
        : slide > 0
          ? { slide: slide - 1, step: slideSteps(slides[slide - 1]) - 1 }
          : { slide, step },
    );
  }, []);

  const goToSlide = useCallback((slide: number) => {
    setPos({ slide, step: 0 });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      // PageDown and PageUp are what presentation clickers send
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "o") {
        if (notesUnsavedRef.current && !confirmLeave()) return;
        navigate("/slideshow-outline");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, navigate]);

  const { zoom: stageZoom, wide } = useStageLayout();

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
    if (!("video" in s) || !seekedFiles.has(s.video.file)) continue;
    const op = transitioning ? layerOpacity[i] : i === activeLayer ? 1 : 0;
    const prev = videoOpacity.get(s.video.file) ?? 0;
    videoOpacity.set(s.video.file, Math.max(prev, op));
  }

  // The slides on the stage, each with its opacity: those the layers show,
  // and, hidden, the one after the current one, so that its images and videos
  // have loaded by the time we go on to it. Each is keyed by its index, not by
  // layer, so a preloaded slide isn't remounted when a layer comes to show it.
  // (Nor when we've gone on to it but the layers haven't caught up, so the
  // current slide is on the stage too.) They go in order of index, so that
  // React never moves a mounted one, which would pause its videos.
  const stageSlideOpacity = new Map<number, number>();
  for (const i of [0, 1] as const) {
    const op = transitioning ? layerOpacity[i] : i === activeLayer ? 1 : 0;
    const prev = stageSlideOpacity.get(layerSlides[i]) ?? 0;
    stageSlideOpacity.set(layerSlides[i], Math.max(prev, op));
  }
  for (const i of [currentSlide, currentSlide + 1]) {
    const s = slides[i];
    if (
      s &&
      "content" in s &&
      s.preload !== false &&
      !stageSlideOpacity.has(i)
    ) {
      stageSlideOpacity.set(i, 0);
    }
  }
  const stageSlides = _.sortBy([...stageSlideOpacity.keys()]);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 flex ${wide ? "flex-row" : "flex-col"} items-center select-none`}
      style={{ overflow: "hidden", background: "#111" }}
    >
      {/* The stage and the notes: a column of their own in the wide layout,
          and in the narrow one, part of the page's column. (Either way, the
          stage keeps its place in the tree, so it isn't remounted when the
          layout changes.) */}
      <div
        className="flex-col items-center self-stretch"
        style={{
          display: wide ? "flex" : "contents",
          width: STAGE_W * stageZoom,
          flexShrink: 0,
        }}
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
          {videoFiles.map((file) => {
            const opacity = videoOpacity.get(file) ?? 0;
            return (
              <video
                key={file}
                ref={(el) => {
                  if (el) videoEls.current.set(file, el);
                }}
                src={slideFileUrl(file)}
                preload="auto"
                muted
                playsInline
                onSeeked={() =>
                  setSeekedFiles((prev) =>
                    prev.has(file) ? prev : new Set(prev).add(file),
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

          {/* Main slide area — slides stacked via CSS grid so all get identical layout */}
          <div
            className="flex-1 min-h-0"
            style={{ display: "grid", isolation: "isolate" }}
          >
            {stageSlides.map((slideIdx) => {
              const s = slides[slideIdx];
              const isActive = slideIdx === displaySlide;
              const opacity = stageSlideOpacity.get(slideIdx)!;
              const visible = opacity > 0 || isActive;
              return (
                <div
                  key={slideIdx}
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
                  {"content" in s && (
                    <SlideActiveContext.Provider value={isActive}>
                      <SlideStepContext.Provider value={stepOf(slideIdx)}>
                        {s.content}
                      </SlideStepContext.Provider>
                    </SlideActiveContext.Provider>
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
            {slideSteps(slides[currentSlide]) > 1 &&
              ` (${currentStep + 1}/${slideSteps(slides[currentSlide])})`}
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

        <SlideNotes
          slideIdx={currentSlide}
          step={currentStep}
          wide={wide}
          onUnsavedChange={setNotesUnsaved}
        />
      </div>
      <SlideOutline current={currentSlide} wide={wide} onSelect={goToSlide} />
    </div>
  );
}
