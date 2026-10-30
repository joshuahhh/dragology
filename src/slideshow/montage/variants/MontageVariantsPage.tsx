import { useEffect, useRef, useState } from "react";
import { STAGE_H, STAGE_W } from "../../slide";
import { CLOSING_MONTAGE, CLOSING_MONTAGE_GROUPS } from "../closing";
import { MontagePlayer } from "../MontageCanvas";
import { TAKES, VARIANT_IDS, VARIANT_INFO, type VariantId } from "./motion";
import { VariantMontagePlayer, variantPlan } from "./VariantMontage";

// #/montage-variants: the closing montage's variants side by side with the
// grid it has now, each stepped through the slide's plan. 1–9 pick, ← → step,
// r replays. A variant that plays as one take (motion.ts's TAKES) does
// so here as on the slide, its clock starting when it's picked or replayed.
// `?v=<variant>` picks one; `&bare` shows just the stage, filling the window;
// `&groups=0` starts with the groups not lighting up.

type Choice = "grid" | VariantId;
const CHOICES: Choice[] = ["grid", ...VARIANT_IDS];

const btn =
  "px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100";

const query = () => new URLSearchParams(window.location.hash.split("?")[1]);

export function MontageVariantsPage() {
  const [choice, setChoice] = useState<Choice>(() => {
    const q = query().get("v");
    return CHOICES.includes(q as Choice) ? (q as Choice) : "flow-pan";
  });
  const [bare] = useState(() => query().has("bare"));
  const [groups, setGroups] = useState(() =>
    query().has("groups")
      ? query().get("groups") !== "0"
      : CLOSING_MONTAGE_GROUPS,
  );
  const [step, setStep] = useState(0);
  const [debug, setDebug] = useState(false);
  const [cta, setCta] = useState(false);
  // bumped to start a take over
  const [run, setRun] = useState(0);
  const plan = variantPlan(groups);
  const take = choice !== "grid" && !!TAKES[choice] && !cta;
  const pick = (c: Choice) => {
    setChoice(c);
    setStep(0);
    setRun((r) => r + 1);
  };

  const areaRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setZoom(Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ")
        setStep((s) => Math.min(plan.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      else if (/^[1-9]$/.test(e.key) && CHOICES[+e.key - 1])
        pick(CHOICES[+e.key - 1]);
      else if (e.key === "d") setDebug((d) => !d);
      else if (e.key === "r") pick(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan.length, choice]);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `#/montage-variants?v=${choice}${bare ? "&bare" : ""}${groups ? "" : "&groups=0"}`,
    );
  }, [choice, bare, groups]);

  const blurb =
    choice === "grid"
      ? "What the slide shows now: white cards edge to edge on dark."
      : VARIANT_INFO[choice].blurb;

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-900 text-sm">
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 border-b"
        style={{ display: bare ? "none" : undefined }}
      >
        {CHOICES.map((c, i) => (
          <button
            key={c}
            className={`${btn} ${c === choice ? "!bg-gray-800 text-white" : ""}`}
            onClick={() => pick(c)}
          >
            <span className="opacity-50 mr-1">{i + 1}</span>
            {c === "grid" ? "Grid (now)" : VARIANT_INFO[c].label}
            {c === CLOSING_MONTAGE && " ★"}
          </button>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        step
        {plan.map((_, i) => (
          <button
            key={i}
            className={`${btn} ${i === step ? "!bg-gray-800 text-white" : ""}`}
            onClick={() => setStep(i)}
          >
            {i + 1}
          </button>
        ))}
        {take && (
          <>
            <button className={btn} onClick={() => pick(choice)}>
              replay (r)
            </button>
            <TakeClock run={run} />
          </>
        )}
        <label className="flex items-center gap-1 ml-2">
          <input
            type="checkbox"
            checked={groups}
            onChange={(e) => setGroups(e.target.checked)}
          />
          groups light up (step 2)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={cta}
            onChange={(e) => setCta(e.target.checked)}
          />
          under the last slide's card
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={debug}
            onChange={(e) => setDebug(e.target.checked)}
          />
          bodies (d)
        </label>
        <span className="text-gray-400 ml-auto">
          1–9 pick · ← → step · ★ the slide's
        </span>
        <div className="basis-full text-gray-600">{blurb}</div>
      </div>
      <div
        ref={areaRef}
        className="flex-1 min-h-0 flex items-center justify-center"
      >
        {/* Laid out at stage size and zoomed, as the slideshow does */}
        <div
          style={{
            position: "relative",
            width: STAGE_W,
            height: STAGE_H,
            zoom,
          }}
        >
          {choice === "grid" ? (
            <MontagePlayer plan={plan} step={cta ? plan.length - 1 : step} />
          ) : (
            <VariantMontagePlayer
              key={`${choice} ${run} ${take}`}
              variant={choice}
              plan={plan}
              step={cta ? plan.length - 1 : step}
              debug={debug}
              take={take}
            />
          )}
          {cta && <CardStandIn />}
        </div>
      </div>
    </div>
  );
}

/** Seconds since the take started, against the slide's timing (7 + 18 + 3 s) */
function TakeClock({ run }: { run: number }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    setSecs(0);
    const timer = setInterval(
      () => setSecs((performance.now() - start) / 1000),
      250,
    );
    return () => clearInterval(timer);
  }, [run]);
  return (
    <span className="tabular-nums text-gray-500 w-12">{secs.toFixed(0)} s</span>
  );
}

/** The last slide's veil and card, roughly, to judge the montage behind them */
function CardStandIn() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: "rgba(15, 23, 42, 0.55)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="bg-white"
          style={{
            width: 360,
            height: 520,
            boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          }}
        />
      </div>
    </>
  );
}
