import { useEffect, useRef, useState } from "react";
import { demo } from "../demo";
import { DemoNotes } from "../demo/ui";

type Pt = { x: number; y: number };

const SIZE = 300;
const CENTER = 150;
const RADIUS = 100;
const BEAD_R = 27;
const GLIDE_MS = 200;

// Tailwind 300 / 600 / 700 shades: fill, edge, ink (the talk's bright look)
const FILL: Record<string, string> = {
  A: "#fca5a5",
  B: "#93c5fd",
  C: "#fde047",
  D: "#86efac",
  E: "#c4b5fd",
};
const EDGE: Record<string, string> = {
  A: "#dc2626",
  B: "#2563eb",
  C: "#ca8a04",
  D: "#16a34a",
  E: "#7c3aed",
};
const INK: Record<string, string> = {
  A: "#b91c1c",
  B: "#1d4ed8",
  C: "#a16207",
  D: "#15803d",
  E: "#6d28d9",
};

const initialBeads = ["A", "B", "C", "D", "E"];

// --- Geometry ---

function slotPos(idx: number, n: number): Pt {
  const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + RADIUS * Math.cos(angle),
    y: CENTER + RADIUS * Math.sin(angle),
  };
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const easeCubicOut = (t: number) => 1 - (1 - t) ** 3;

/** The pointer's position in the SVG's own coordinates, however it's scaled */
function svgPoint(svg: SVGSVGElement, e: React.PointerEvent): Pt {
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (SIZE / rect.width),
    y: (e.clientY - rect.top) * (SIZE / rect.height),
  };
}

// --- Reordering ---

function moveBead(beads: string[], from: number, to: number): string[] {
  const next = [...beads];
  const [bead] = next.splice(from, 1);
  next.splice(to, 0, bead);
  return next;
}

type Drag = {
  bead: string;
  pointerId: number;
  /** From the bead's center to where it was grabbed */
  grabOffset: Pt;
  pointer: Pt;
};

/** Where the dragged bead's center is: under the pointer, as grabbed */
function dragCenter(drag: Drag): Pt {
  return sub(drag.pointer, drag.grabOffset);
}

/**
 * The order to preview, and to drop into: the dragged bead moved to
 * whichever slot is nearest its center
 */
function previewOrder(beads: string[], drag: Drag): string[] {
  const n = beads.length;
  const from = beads.indexOf(drag.bead);
  const center = dragCenter(drag);
  let best = from;
  for (let to = 0; to < n; to++) {
    if (dist(center, slotPos(to, n)) < dist(center, slotPos(best, n))) {
      best = to;
    }
  }
  return moveBead(beads, from, best);
}

// --- Animation ---

type Glide = { from: Pt; to: Pt; start: number };

function glideAt(glide: Glide, now: number): Pt {
  const t = Math.min(1, (now - glide.start) / GLIDE_MS);
  return lerp(glide.from, glide.to, easeCubicOut(t));
}

/**
 * Positions that glide to each new target they're given, from wherever they
 * were shown, except the `pinned` one, which jumps straight to its target
 */
function useGlidingPositions(
  targets: Map<string, Pt>,
  pinned: string | null,
): { shown: Map<string, Pt>; moving: Set<string> } {
  const glides = useRef(new Map<string, Glide>());
  const [, setFrame] = useState(0);
  const now = performance.now();
  const shown = new Map<string, Pt>();
  const moving = new Set<string>();
  for (const [id, to] of targets) {
    const glide = glides.current.get(id);
    if (!glide || glide.to.x !== to.x || glide.to.y !== to.y) {
      const from = id === pinned || !glide ? to : glideAt(glide, now);
      glides.current.set(id, { from, to, start: now });
    }
    const current = glides.current.get(id)!;
    shown.set(id, glideAt(current, now));
    if (now - current.start < GLIDE_MS && dist(current.from, current.to) > 0) {
      moving.add(id);
    }
  }

  // Keep rendering while anything's gliding
  const animating = moving.size > 0;
  useEffect(() => {
    if (!animating) return;
    const raf = requestAnimationFrame(() => setFrame((f) => f + 1));
    return () => cancelAnimationFrame(raf);
  });

  return { shown, moving };
}

// --- Component ---

const RingOfBeadsVanilla = () => {
  const [beads, setBeads] = useState(initialBeads);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lastDropped, setLastDropped] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = beads.length;
  const order = drag ? previewOrder(beads, drag) : beads;
  const targets = new Map(order.map((bead, i) => [bead, slotPos(i, n)]));
  if (drag) targets.set(drag.bead, dragCenter(drag));
  const { shown, moving } = useGlidingPositions(targets, drag?.bead ?? null);

  // The dragged bead goes on top, and stays there as it glides into place
  const lifted =
    drag?.bead ?? (lastDropped && moving.has(lastDropped) ? lastDropped : null);
  const paintOrder = beads.filter((b) => b !== lifted);
  if (lifted) paintOrder.push(lifted);

  const startDrag = (e: React.PointerEvent, bead: string) => {
    const svg = svgRef.current;
    if (drag || !svg) return;
    // On the SVG, not the bead, whose element moves when it's lifted
    svg.setPointerCapture(e.pointerId);
    const pointer = svgPoint(svg, e);
    setDrag({
      bead,
      pointerId: e.pointerId,
      // From where the bead's shown, even mid-glide
      grabOffset: sub(pointer, shown.get(bead)!),
      pointer,
    });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId || !svgRef.current) return;
    setDrag({ ...drag, pointer: svgPoint(svgRef.current, e) });
  };

  const endDrag = (e: React.PointerEvent, drop: boolean) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drop) setBeads(previewOrder(beads, drag));
    setLastDropped(drag.bead);
    setDrag(null);
  };

  return (
    <div>
      <DemoNotes>
        From-scratch React reimplementation of ring-of-beads, floating (as
        live-coded in the talk), <b>without using Dragology</b>.
      </DemoNotes>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        style={{ touchAction: "none" }}
        onPointerMove={moveDrag}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth={15}
        />
        {paintOrder.map((bead) => {
          const p = shown.get(bead)!;
          return (
            <g
              key={bead}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ cursor: drag?.bead === bead ? "grabbing" : "grab" }}
              onPointerDown={(e) => startDrag(e, bead)}
            >
              <circle
                r={BEAD_R}
                fill={FILL[bead]}
                stroke={EDGE[bead]}
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={32}
                fontWeight={800}
                fill={INK[bead]}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {bead}
              </text>
            </g>
          );
        })}
      </svg>
      <DemoNotes>
        <i>Claude reports...</i> Matches the library version's defaults: the
        dragged bead keeps its grab offset under the pointer, the others glide
        (200ms, cubic-out) to preview the nearest order, and the dropped bead
        glides into its slot. One difference: there's no drag threshold, so a
        press starts a drag at once (the library waits for 2px of movement).
      </DemoNotes>
    </div>
  );
};

export default demo(RingOfBeadsVanilla, {
  tags: ["vanilla"],
  hideByDefault: true,
  fuzz: false,
});
