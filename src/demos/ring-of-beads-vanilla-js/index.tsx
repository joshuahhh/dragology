import { useEffect, useRef } from "react";
import { demo } from "../../demo";
import { DemoNotes } from "../../demo/ui";
import { mountRingOfBeads } from "./ringOfBeads";

const RingOfBeadsVanillaJs = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => mountRingOfBeads(ref.current!), []);
  return (
    <div>
      <DemoNotes>
        From-scratch reimplementation of ring-of-beads, floating (as live-coded
        in the talk), <b>without Dragology or React</b>: plain DOM calls, in{" "}
        <code>ringOfBeads.ts</code>. This page only mounts it.
      </DemoNotes>
      <div ref={ref} />
      <DemoNotes>
        <i>Claude reports...</i> Behaves like ring-of-beads-vanilla: the dragged
        bead keeps its grab offset under the pointer, the others glide (200ms,
        cubic-out) to preview the nearest order, and the dropped bead glides
        into its slot. As there, there's no drag threshold.
      </DemoNotes>
    </div>
  );
};

export default demo(RingOfBeadsVanillaJs, {
  tags: ["vanilla"],
  hideByDefault: true,
  fuzz: false,
});
