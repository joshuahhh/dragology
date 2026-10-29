// A workbench for the model-driven-dragging explainer (#/model-driven): scrub
// or play its timeline.
//
// Keys: space plays and pauses, ← and → step a frame (shift: a second).
// #/model-driven?t=21.5 opens at that time; ?subject=list explains the
// study's reorderable list instead of the ring of beads.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STAGE_H, STAGE_W } from "../slide";
import { beadsSubject } from "./beads";
import { ModelDrivenScene } from "./ModelDrivenScene";
import { reorderableListSubject } from "./reorderable-list";

const DURATION = 30.5;
/** Where slides 6–10 start on the timeline */
const SLIDE_STARTS: [string, number][] = [
  ["6", 0],
  ["7", 7.5],
  ["8", 14.7],
  ["9", 17.5],
  ["10", 23],
];
const FRAME = 1 / 25;

export function ModelDrivenPage() {
  const [params] = useSearchParams();
  const showList = params.get("subject") === "list";
  const [t, setTState] = useState(() => Number(params.get("t")) || 0);
  const tRef = useRef(t);
  const setT = (next: number | ((prev: number) => number)) => {
    tRef.current = typeof next === "function" ? next(tRef.current) : next;
    setTState(tRef.current);
  };
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(0.5);

  useEffect(() => {
    const fit = () =>
      setZoom(
        Math.min(
          (window.innerWidth - 32) / STAGE_W,
          (window.innerHeight - 140) / STAGE_H,
        ),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Playing: advance in real time
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      tRef.current = Math.min(DURATION, tRef.current + dt);
      setT(tRef.current);
      if (tRef.current < DURATION) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") {
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step =
          (e.shiftKey ? 1 : FRAME) * (e.key === "ArrowLeft" ? -1 : 1);
        setPlaying(false);
        setT((prev) => Math.min(DURATION, Math.max(0, prev + step)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="p-4 flex flex-col gap-3"
      style={{ background: "#e5e7eb", minHeight: "100vh" }}
    >
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <button
          className="px-3 py-1 rounded bg-white border border-gray-300 w-20"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={DURATION}
          step={0.001}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          style={{ flex: 1, minWidth: 300 }}
        />
        <span className="font-mono w-16 text-right">{t.toFixed(2)}s</span>
        <span className="text-gray-500">slide</span>
        {SLIDE_STARTS.map(([label, start]) => (
          <button
            key={label}
            className="px-2 py-0.5 rounded bg-white border border-gray-300"
            onClick={() => {
              setT(start);
              setPlaying(true);
            }}
          >
            {label}
          </button>
        ))}
        <label className="flex items-center gap-1">
          speed
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-white border border-gray-300 rounded"
          >
            {[0.1, 0.25, 0.5, 1].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ width: STAGE_W * zoom, height: STAGE_H * zoom }}>
        <div
          style={{
            position: "relative",
            width: STAGE_W,
            height: STAGE_H,
            zoom,
            background: "white",
            isolation: "isolate",
          }}
        >
          {showList ? (
            <ModelDrivenScene subject={reorderableListSubject} t={t} drive />
          ) : (
            <ModelDrivenScene subject={beadsSubject} t={t} drive />
          )}
        </div>
      </div>
    </div>
  );
}
