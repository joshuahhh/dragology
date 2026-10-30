// How each montage variant's canvas is shaped and how its tiles move: shared
// by the layout builder (layouts.ts, which packs the tiles and lets the
// moving variants settle) and the montage itself (VariantMontage.tsx, which
// carries on from there).

import type { Ellipse, Flow, SimParams, Torus } from "./physics";

export const VARIANT_IDS = [
  "flow-pan",
  "jostle-pan",
  "still-pan",
  "packed",
  "pan",
  "jostle",
  "drift",
  "vortex",
] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export const VARIANT_INFO: Record<VariantId, { label: string; blurb: string }> =
  {
    "flow-pan": {
      label: "Flow pan",
      blurb:
        "One take for the whole slide: the canvas flows in bands at different speeds, streaming across the screen as the camera pulls back from the start to the end; two arrangements of every clip, so nothing repeats in view.",
    },
    "jostle-pan": {
      label: "Jostle pan",
      blurb:
        "One take for the whole slide: the jostling canvas (clips that open up shoulder their neighbors aside) streams across the screen as the camera pulls back from the start to the end.",
    },
    "still-pan": {
      label: "Still pan",
      blurb:
        "One take for the whole slide, the clips fixed where they're packed: the canvas streams across the screen as the camera pulls back from the start to the end.",
    },
    packed: {
      label: "Packed",
      blurb:
        "Still. Clips packed by what they draw, a little askew, no cards or gutters; the canvas repeats, so pulled back there's more past the edges.",
    },
    pan: {
      label: "Pan",
      blurb:
        "The packed canvas, with the camera gliding over it the whole time, pulled back or not. It never runs out: the canvas repeats.",
    },
    jostle: {
      label: "Jostle",
      blurb:
        "Packed by what each clip draws most of the time; when one grows (the pivot table standing up tall), it shoulders its neighbors aside, and they spring back.",
    },
    drift: {
      label: "Drift",
      blurb:
        "The canvas flows past a still camera, some bands faster than others; a clip that catches up with a slower one eases around it.",
    },
    vortex: {
      label: "Vortex",
      blurb:
        "The clips turn about the middle like a slow galaxy, fastest at the core and barely moving at the rim, leaning with the spin; inner ones slide past outer ones without touching.",
    },
  };

export const BACKGROUND = "#ffffff";
/** Canvas units between neighbors' content */
export const GAP = 40;
/**
 * The repeating canvas, 16:9 (near enough to come out in whole 10-unit
 * cells, for nest.ts): one period is what the pulled-back view shows
 */
export const TORUS: Torus = { W: 5400, H: 3040 };
/** How much more than one period the pulled-back view shows */
export const ALL_OVERHANG = 1.06;

/**
 * The takes' canvas: two periods across, each with every clip, arranged
 * differently, so pulled back nothing shows twice
 */
export const TAKE_TORUS: Torus = { W: 2 * TORUS.W, H: TORUS.H };

/** The vortex's extent, squashed to 16:9 */
const VORTEX_A = 2700;
export const VORTEX_ELLIPSE: Ellipse = { A: VORTEX_A, B: (VORTEX_A * 9) / 16 };

/**
 * A Lamb–Oseen vortex squashed to 16:9: turning fastest in the middle,
 * slower and slower outward
 */
function vortexFlow(): Flow {
  const k = VORTEX_ELLIPSE.A / VORTEX_ELLIPSE.B;
  const r0 = 750;
  const omega0 = 0.16;
  return (x, y) => {
    const r = Math.hypot(x / k, y);
    const w = omega0 / (1 + (r / r0) ** 2);
    return [-w * k * y, (w / k) * x];
  };
}

/**
 * Everything flows right, at `speed` on average (canvas units/s), some bands
 * of the canvas faster than others
 */
function driftFlow(speed: number): Flow {
  const H = TORUS.H;
  return (_x, y) => [speed * (1 + 0.5 * Math.sin((2 * Math.PI * y) / H)), 0];
}

/** Spring-and-push settings shared by the moving variants */
const moving = {
  margin: GAP / 2,
  push: 6,
  live: true,
  // slow enough that a clip opening up eases its neighbors aside, not shoves
  ramp: 70,
  reach: 6,
  speedLimit: 90,
};

const jostling: SimParams = {
  ...moving,
  torus: TORUS,
  home: { w: 1.4, zeta: 0.9 },
  slip: 0,
  wander: { force: 18, period: 9 },
  tilt: { w: 2.2, zeta: 0.8, max: 0.07 },
};

const drifting = (speed: number, torus = TORUS): SimParams => ({
  ...moving,
  torus,
  flow: driftFlow(speed),
  flowGain: 0.8,
  lane: { kind: "y", w: 0.35 },
  slip: 18,
  tilt: { w: 1.8, zeta: 0.8, max: 0.08 },
});

/** How each variant's tiles move; null for not at all */
export const SIM: Record<VariantId, SimParams | null> = {
  "flow-pan": drifting(70, TAKE_TORUS),
  "jostle-pan": { ...jostling, torus: TAKE_TORUS },
  "still-pan": null,
  packed: null,
  pan: null,
  jostle: jostling,
  drift: drifting(42),
  vortex: {
    ...moving,
    torus: null,
    flow: vortexFlow(),
    flowGain: 0.7,
    lane: { kind: "radius", w: 0.3, ellipse: VORTEX_ELLIPSE },
    slip: 18,
    spin: 0.6,
    tilt: { w: 1.4, zeta: 0.8, max: 0.14 },
  },
};

/** The pan variant's camera glides at this velocity, always (canvas units/s) */
export const PAN_VELOCITY: Partial<Record<VariantId, [number, number]>> = {
  pan: [38, 12],
};

/**
 * The takes: variants that, as the closing slide, play as one take rather
 * than step by step (the steps only light up the groups, if asked). From
 * the opening view the camera pulls back to everything over `zoomMs`, from
 * the first frame, while the clips stream across the screen at `stream`
 * (pixels/s), easing to `slowTo` of that once it's all the way back, for a
 * calmer look at everything. So as it pulls back the camera glides faster
 * over the canvas (else the pulling back would stall the stream at one
 * side), and the canvas's own `flow` (its mean velocity, canvas units/s)
 * speeds up too, by the square root of the zoom.
 */
export type Take = {
  zoomMs: number;
  stream: [number, number];
  slowTo: number;
  flow: [number, number];
};

export const TAKES: Partial<Record<VariantId, Take>> = {
  "flow-pan": { zoomMs: 27000, stream: [130, -20], slowTo: 0.5, flow: [70, 0] },
  "jostle-pan": {
    zoomMs: 27000,
    stream: [-125, -30],
    slowTo: 0.5,
    flow: [0, 0],
  },
  "still-pan": {
    zoomMs: 27000,
    stream: [-125, -30],
    slowTo: 0.5,
    flow: [0, 0],
  },
};

/** Each variant's repeating canvas, if any */
export function torusOf(id: VariantId): Torus | null {
  return id === "vortex" ? null : TAKES[id] ? TAKE_TORUS : TORUS;
}
