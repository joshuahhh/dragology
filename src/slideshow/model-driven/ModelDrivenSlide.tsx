import { useEffect, useState } from "react";
import { useSlideCurrent } from "../slide";
import { beadsSubject } from "./beads";
import { ModelDrivenScene } from "./ModelDrivenScene";

/**
 * The model-driven-dragging explainer, played from time `from` to `to` once
 * the slide comes up, then held there: a stretch of it, as the video slides
 * play a stretch of a clip. With no `to`, it just shows time `from`.
 */
export function ModelDrivenSlide({
  from,
  to = from,
}: {
  from: number;
  to?: number;
}) {
  const current = useSlideCurrent();
  const [t, setT] = useState(from);

  // Start over each time the slide comes up. (Leaving it holds the last
  // frame, for a transition out.)
  useEffect(() => {
    if (!current) return;
    const start = performance.now();
    setT(from);
    let raf = requestAnimationFrame(function tick() {
      const now = Math.min(to, from + (performance.now() - start) / 1000);
      setT(now);
      if (now < to) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [current, from, to]);

  return <ModelDrivenScene subject={beadsSubject} t={t} drive={current} />;
}
