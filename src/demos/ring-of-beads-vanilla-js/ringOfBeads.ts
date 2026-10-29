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
function svgPoint(svg: SVGSVGElement, e: PointerEvent): Pt {
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

function isGliding(glide: Glide, now: number): boolean {
  return now - glide.start < GLIDE_MS && dist(glide.from, glide.to) > 0;
}

// --- DOM ---

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  return el;
}

/** Builds the ring in `container`; returns a function that takes it down */
export function mountRingOfBeads(container: HTMLElement): () => void {
  let beads = initialBeads;
  let drag: Drag | null = null;
  const glides = new Map<string, Glide>();
  let raf = 0;

  const svg = svgEl("svg", { width: SIZE, height: SIZE });
  svg.style.touchAction = "none";
  svg.append(
    svgEl("circle", {
      cx: CENTER,
      cy: CENTER,
      r: RADIUS,
      fill: "none",
      stroke: "#e4e4e7",
      "stroke-width": 15,
    }),
  );

  const beadEls = new Map<string, SVGGElement>();
  for (const bead of beads) {
    const g = svgEl("g", {});
    g.style.cursor = "grab";
    const text = svgEl("text", {
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": 32,
      "font-weight": 800,
      fill: INK[bead],
    });
    text.style.pointerEvents = "none";
    text.style.userSelect = "none";
    text.textContent = bead;
    g.append(
      svgEl("circle", {
        r: BEAD_R,
        fill: FILL[bead],
        stroke: EDGE[bead],
        "stroke-width": 2,
      }),
      text,
    );
    g.addEventListener("pointerdown", (e) => startDrag(e, bead));
    svg.append(g);
    beadEls.set(bead, g);
  }
  container.append(svg);

  /**
   * Gives each bead its target for the current state: the dragged one jumps
   * to the pointer, and the rest glide from wherever they're shown
   */
  function retarget() {
    const now = performance.now();
    const n = beads.length;
    const order = drag ? previewOrder(beads, drag) : beads;
    order.forEach((bead, i) => {
      const dragged = drag?.bead === bead;
      const to = dragged ? dragCenter(drag!) : slotPos(i, n);
      const glide = glides.get(bead);
      if (glide && glide.to.x === to.x && glide.to.y === to.y) return;
      const from = dragged || !glide ? to : glideAt(glide, now);
      glides.set(bead, { from, to, start: now });
    });
    draw();
  }

  /** Moves each bead to where its glide has it now, and again next frame
   * if anything's still gliding */
  function draw() {
    const now = performance.now();
    let gliding = false;
    for (const [bead, glide] of glides) {
      const p = glideAt(glide, now);
      beadEls.get(bead)!.setAttribute("transform", `translate(${p.x}, ${p.y})`);
      gliding ||= isGliding(glide, now);
    }
    cancelAnimationFrame(raf);
    raf = gliding ? requestAnimationFrame(draw) : 0;
  }

  function startDrag(e: PointerEvent, bead: string) {
    if (drag) return;
    // On the SVG, not the bead, whose element moves when it's lifted
    svg.setPointerCapture(e.pointerId);
    const pointer = svgPoint(svg, e);
    const shown = glideAt(glides.get(bead)!, performance.now());
    drag = {
      bead,
      pointerId: e.pointerId,
      grabOffset: sub(pointer, shown),
      pointer,
    };
    // Lift it on top, where it stays as it glides into place on drop
    const g = beadEls.get(bead)!;
    svg.append(g);
    g.style.cursor = "grabbing";
    retarget();
  }

  function endDrag(e: PointerEvent, drop: boolean) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drop) beads = previewOrder(beads, drag);
    beadEls.get(drag.bead)!.style.cursor = "grab";
    drag = null;
    retarget();
  }

  svg.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.pointer = svgPoint(svg, e);
    retarget();
  });
  svg.addEventListener("pointerup", (e) => endDrag(e, true));
  svg.addEventListener("pointercancel", (e) => endDrag(e, false));

  retarget();

  return () => {
    cancelAnimationFrame(raf);
    svg.remove();
  };
}
