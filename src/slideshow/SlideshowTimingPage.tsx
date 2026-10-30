import _ from "lodash";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { notesFirstLine, type Slide, STAGE_BREAK } from "./slide";
import { numberedOutline } from "./slides";
import { SlideThumb } from "./SlideThumb";
import { formatSeconds } from "./timing";

type TimedSlide = {
  slide: Slide;
  num: number;
  steps: number[];
  total: number;
  /** The first line of each step's notes */
  stepNotes: (string | undefined)[];
};

type Section = {
  name: string;
  slides: TimedSlide[];
  total: number;
  /** Neighboring sections alternate tones, so their boundaries show */
  tone: 0 | 1;
};

/**
 * The presented slides with timings, grouped by the headings before them.
 * Slides before any heading go in an unnamed section.
 */
function timedSections(): Section[] {
  const sections: Omit<Section, "total" | "tone">[] = [];
  for (const item of numberedOutline) {
    if ("heading" in item) {
      sections.push({ name: item.heading, slides: [] });
      continue;
    }
    const { slide, num } = item;
    if (slide.skip || !slide.timing) continue;
    if (sections.length === 0) sections.push({ name: "", slides: [] });
    const stages = (slide.notes ?? "").split("\n").reduce<string[][]>(
      (acc, line) => {
        if (STAGE_BREAK.test(line)) acc.push([]);
        else acc[acc.length - 1].push(line);
        return acc;
      },
      [[]],
    );
    sections[sections.length - 1].slides.push({
      slide,
      num,
      steps: slide.timing,
      total: _.sum(slide.timing),
      stepNotes: slide.timing.map((_s, k) =>
        notesFirstLine(stages[k]?.join("\n")),
      ),
    });
  }
  return sections
    .filter((s) => s.slides.length > 0)
    .map((s, i) => ({
      ...s,
      total: _.sum(s.slides.map((sl) => sl.total)),
      tone: (i % 2) as 0 | 1,
    }));
}

const TONES = [
  {
    section: "bg-sky-400",
    slide: "bg-sky-400",
    step: "bg-sky-400",
    bar: "bg-sky-400",
    seg: "bg-sky-400 hover:bg-sky-500",
  },
  {
    section: "bg-sky-300",
    slide: "bg-sky-300",
    step: "bg-sky-300",
    bar: "bg-sky-300",
    seg: "bg-sky-300 hover:bg-sky-400",
  },
] as const;

const stepTitle = (sl: TimedSlide, k: number) =>
  `Slide ${sl.num}, step ${k + 1} of ${sl.steps.length}: ${sl.steps[k]}s` +
  (sl.stepNotes[k] ? `\n${sl.stepNotes[k]}` : "");

/**
 * Where the talk spends its time, from each slide's latest timing: the whole
 * talk as a strip (sections, slides, steps), then slide by slide.
 */
export function SlideshowTimingPage() {
  useTitle("Dragology — Slideshow timing");
  const sections = timedSections();
  const total = _.sum(sections.map((s) => s.total));
  const nSlides = _.sum(sections.map((s) => s.slides.length));
  const [order, setOrder] = useState<"talk" | "longest">("talk");

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-bold">Timing</h1>
          <span className="text-gray-600 tabular-nums">
            {formatSeconds(total)} over {nSlides} slides
          </span>
          <Link
            to="/slideshow"
            className="ml-auto text-sm text-gray-500 hover:text-gray-900"
          >
            ← Slideshow
          </Link>
        </div>
        {total > 0 && <Strip sections={sections} total={total} />}
        <div className="flex justify-end">
          <div className="inline-flex overflow-hidden rounded border border-gray-300 text-sm">
            {(
              [
                ["talk", "Talk order"],
                ["longest", "Longest first"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setOrder(value)}
                aria-pressed={order === value}
                className={`px-3 py-1 ${
                  order === value
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <SlideBySlide sections={sections} total={total} order={order} />
      </div>
    </div>
  );
}

/** The whole talk, start to finish: width is time. */
function Strip({ sections, total }: { sections: Section[]; total: number }) {
  const pct = (s: number) => `${(100 * s) / total}%`;
  // Each block is inset 1px on each side, for a 2px gap between neighbors
  const place = (start: number, dur: number) => ({
    left: `calc(${pct(start)} + 1px)`,
    width: `calc(${pct(dur)} - 2px)`,
  });
  const blocks: {
    sections: ReactNode[];
    slides: ReactNode[];
    steps: ReactNode[];
  } = { sections: [], slides: [], steps: [] };
  let t = 0;
  for (const sec of sections) {
    const tone = TONES[sec.tone];
    blocks.sections.push(
      <div
        key={sec.name + t}
        className={`absolute inset-y-0 truncate rounded px-1.5 text-[13px] leading-[30px] font-semibold ${tone.section}`}
        style={place(t, sec.total)}
        title={`${sec.name}: ${formatSeconds(sec.total)}, ${Math.round(
          (100 * sec.total) / total,
        )}% of the talk`}
      >
        {sec.name}
      </div>,
    );
    for (const sl of sec.slides) {
      blocks.slides.push(
        <Link
          key={sl.num}
          to={`/slideshow/${sl.num}`}
          className={`absolute inset-y-0 truncate rounded px-1.5 text-xs leading-[26px] text-gray-700 tabular-nums hover:ring-1 hover:ring-sky-500 ${tone.slide}`}
          style={place(t, sl.total)}
          title={`Slide ${sl.num}: ${formatSeconds(sl.total)}${
            sl.steps.length > 1 ? ` (${sl.steps.join(" + ")}s)` : ""
          }`}
        >
          {/* (too narrow a block shows a sliver of its number, so none) */}
          {sl.total / total >= 0.025 && sl.num}
        </Link>,
      );
      sl.steps.forEach((s, k) => {
        blocks.steps.push(
          <div
            key={`${sl.num}-${k}`}
            className={`absolute inset-y-0 rounded-sm ${tone.step}`}
            style={place(t, s)}
            title={stepTitle(sl, k)}
          />,
        );
        t += s;
      });
    }
  }
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200">
      <div className="relative">
        {_.range(0, Math.floor(total / 60) + 1).map((m) => (
          <div
            key={m}
            className="absolute top-0 bottom-0 border-l border-gray-200"
            style={{ left: pct(m * 60) }}
          />
        ))}
        <div className="relative flex flex-col gap-1">
          <div className="relative h-[30px]">{blocks.sections}</div>
          <div className="relative h-[26px]">{blocks.slides}</div>
          <div className="relative h-2.5">{blocks.steps}</div>
          <div className="relative h-4">
            {_.range(0, Math.floor(total / 60) + 1).map((m) => (
              <span
                key={m}
                className={`absolute top-0 font-mono text-[10px] text-gray-400 ${
                  m === 0 ? "" : "-translate-x-1/2"
                }`}
                style={{ left: pct(m * 60) }}
              >
                {m}:00
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every slide's steps, sections and slides all on one seconds scale */
function SlideBySlide({
  sections,
  total,
  order,
}: {
  sections: Section[];
  total: number;
  order: "talk" | "longest";
}) {
  const scale = Math.max(1, ...sections.map((s) => s.total));
  const row = "grid grid-cols-[minmax(0,22rem)_3.5rem_1fr] items-center gap-3";

  const slideRow = (sl: TimedSlide, sec: Section) => (
    <div key={sl.num} className={row}>
      <Link
        to={`/slideshow/${sl.num}`}
        className="flex min-w-0 items-center gap-2 text-sm text-gray-700 hover:text-gray-950"
      >
        <span className="relative block aspect-video w-16 shrink-0 bg-white ring-1 ring-gray-200">
          <SlideThumb slide={sl.slide} num={sl.num} />
        </span>
        <span className="w-6 shrink-0 text-right text-gray-400 tabular-nums">
          {sl.num}
        </span>
        <span className="truncate">{notesFirstLine(sl.slide.notes) ?? ""}</span>
      </Link>
      <span className="text-right font-mono text-[13px] tabular-nums">
        {formatSeconds(sl.total)}
      </span>
      <div className="flex h-5 min-w-0 gap-0.5">
        {sl.steps.map((s, k) => (
          <div
            key={k}
            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] font-mono text-[10px] text-gray-800 ${TONES[sec.tone].seg}`}
            style={{ width: `calc(${(100 * s) / scale}% - 2px)` }}
            title={stepTitle(sl, k)}
          >
            {s / scale >= 0.025 ? s : ""}
          </div>
        ))}
      </div>
    </div>
  );

  if (order === "longest") {
    const all = sections.flatMap((sec) =>
      sec.slides.map((sl) => ({ sl, sec })),
    );
    return (
      <div className="flex flex-col gap-1.5">
        {_.sortBy(all, ({ sl }) => -sl.total).map(({ sl, sec }) =>
          slideRow(sl, sec),
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {sections.map((sec, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className={`${row} border-b border-gray-300 pb-1`}>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-semibold">{sec.name}</span>
              <span className="font-mono text-xs text-gray-400">
                {Math.round((100 * sec.total) / total)}%
              </span>
            </span>
            <span className="text-right font-mono text-[13px] font-medium tabular-nums">
              {formatSeconds(sec.total)}
            </span>
            <div className="min-w-0">
              <div
                className={`h-2 rounded-sm ${TONES[sec.tone].bar}`}
                style={{ width: `${(100 * sec.total) / scale}%` }}
              />
            </div>
          </div>
          {sec.slides.map((sl) => slideRow(sl, sec))}
        </div>
      ))}
    </div>
  );
}
