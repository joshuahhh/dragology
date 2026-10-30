import { Draggable } from "../../draggable";
import { Vec2 } from "../../math/vec2";
import { compileLiveCode } from "../../talk/compile";
import { snippets } from "../../talk/snippets";
import type { CodeLine, ExplainerSubject } from "./ModelDrivenScene";

type BeadsState = { beads: string[] };

// The ring of beads as live-coded in the talk, in the look the live-code
// slide shows by default, with floating but before whenFar
const snippet = snippets.find((s) => s.title === "ring of beads: floating")!;
const live = compileLiveCode(
  snippet.bright?.code ?? snippet.code,
  snippet.bright?.prelude ?? snippet.prelude,
);

const draggedId = "A";

/** The bright beads' ink colors, as their letters are drawn */
export const BEAD_INK: Record<string, string> = {
  A: "#b91c1c",
  B: "#1d4ed8",
  C: "#a16207",
  D: "#15803d",
  E: "#6d28d9",
};

/**
 * `{ beads: [ A, B, C, D, E ]}`, over three lines, each bead in its color and
 * the dragged one marked
 */
function formatState(state: BeadsState): CodeLine[] {
  const beads: CodeLine = state.beads.flatMap((bead, i) => [
    ...(i > 0 ? [{ text: ", " }] : []),
    {
      text: bead,
      mark: bead === draggedId,
      color: BEAD_INK[bead],
      bold: bead === draggedId,
    },
  ]);
  return [
    [{ text: "{ beads: [" }],
    [{ text: "  " }, ...beads],
    [{ text: "]}" }],
  ];
}

/**
 * The live-coded ring of beads, with bead A dragged along the path it took in
 * model-driven-full.mp4 (measured off the video), round and round.
 */
export const beadsSubject: ExplainerSubject<BeadsState> = {
  draggable: live.draggable as Draggable<BeadsState>,
  width: snippet.width,
  height: snippet.height,
  state: live.initialState as BeadsState,
  draggedId,
  formatState,
  track: [
    [23.2, 150.0, 50.0],
    [23.44, 150.0, 50.0],
    [24.24, 151.0, 51.0],
    [24.32, 154.6, 53.1],
    [24.4, 161.8, 58.2],
    [24.48, 176.7, 67.9],
    [24.56, 192.1, 78.7],
    [24.64, 202.3, 87.9],
    [24.72, 210.0, 94.1],
    [24.8, 215.6, 98.7],
    [24.88, 219.7, 103.3],
    [24.96, 222.3, 105.9],
    [25.04, 223.3, 107.4],
    [25.12, 227.9, 116.7],
    [25.2, 234.1, 134.6],
    [25.28, 235.1, 150.5],
    [25.36, 232.6, 161.3],
    [25.44, 230.5, 169.0],
    [25.52, 227.4, 175.1],
    [25.6, 223.8, 183.3],
    [25.68, 219.7, 192.1],
    [25.76, 215.1, 199.7],
    [25.84, 210.5, 206.9],
    [25.92, 207.4, 212.1],
    [26.0, 204.9, 213.6],
    [26.08, 197.2, 212.6],
    [26.16, 180.8, 206.9],
    [26.24, 165.9, 198.7],
    [26.32, 152.6, 189.5],
    [26.4, 136.2, 177.7],
    [26.48, 121.3, 167.4],
    [26.56, 110.0, 158.2],
    [26.64, 100.8, 148.5],
    [26.72, 96.2, 141.3],
    [26.8, 91.5, 133.1],
    [26.88, 86.9, 123.3],
    [26.96, 85.4, 113.6],
    [27.04, 85.9, 106.4],
    [27.12, 87.9, 101.8],
    [27.2, 91.5, 97.2],
    [27.28, 96.2, 92.1],
    [27.36, 100.3, 86.9],
    [27.44, 104.9, 82.3],
    [27.52, 110.0, 78.2],
    [27.6, 114.6, 75.1],
    [27.68, 119.2, 71.5],
    [27.76, 123.3, 69.5],
    [27.84, 126.9, 67.4],
    [27.92, 126.9, 64.9],
  ],
  // From a pause at the top, before setting off
  loopFrom: 23.6,
};

// ── Reorders ──

/** Where a bead sits in slot `slot`, counting clockwise from the top */
function slotPos(slot: number): Vec2 {
  return Vec2(150, 150).add(Vec2.polarDeg(100, (slot / 5) * 360 - 90));
}

/** Minimum jerk: how a hand speeds up and slows down along a reach */
const minJerk = (u: number) => u * u * u * (10 - 15 * u + 6 * u * u);

/**
 * Writes a track as a hand would make it: reaches that bow a little and
 * sometimes overshoot, pauses, presses and releases, all with a slight
 * tremor.
 */
class Hand {
  readonly track: [number, number, number, boolean][] = [];
  private t = 0;
  private down = false;

  constructor(private at: Vec2) {
    this.sample();
  }

  private sample() {
    // A slow wander and a faint tremor, so the hand is never quite still
    const t = this.t;
    const wobble = Vec2(
      0.9 * Math.sin(1.3 * t + 1) + 0.3 * Math.sin(7.1 * t),
      0.9 * Math.sin(1.1 * t + 4) + 0.3 * Math.sin(6.3 * t + 2),
    );
    const p = this.at.add(wobble);
    this.track.push([t, p.x, p.y, this.down]);
  }

  wait(seconds: number) {
    const n = Math.ceil(seconds * 30);
    for (let k = 0; k < n; k++) {
      this.t += seconds / n;
      this.sample();
    }
    return this;
  }

  /**
   * Reaches `to` in `seconds`, bowing to one side by `bow` (a fraction of
   * the distance, negative for the other side), and first past it by
   * `overshoot` if given, coming back to it after
   */
  move(to: Vec2, seconds: number, bow = 0, overshoot = 0) {
    const from = this.at;
    const dir = to.sub(from).norm();
    const end = overshoot > 0 ? to.add(dir.mul(overshoot)) : to;
    const main = overshoot > 0 ? seconds * 0.8 : seconds;
    const control = from.mid(end).add(dir.perp().mul(bow * from.dist(end)));
    const n = Math.ceil(main * 60);
    for (let k = 1; k <= n; k++) {
      const u = minJerk(k / n);
      this.at = from
        .mul((1 - u) ** 2)
        .add(control.mul(2 * (1 - u) * u), end.mul(u * u));
      this.t += main / n;
      this.sample();
    }
    if (overshoot > 0) {
      const back = this.at;
      const m = Math.ceil((seconds - main) * 60);
      for (let k = 1; k <= m; k++) {
        this.at = back.lerp(to, minJerk(k / m));
        this.t += (seconds - main) / m;
        this.sample();
      }
    }
    return this;
  }

  press() {
    this.down = true;
    this.t += 0.01;
    this.sample();
    return this;
  }

  release() {
    this.down = false;
    this.t += 0.01;
    this.sample();
    return this;
  }
}

/**
 * Four reorders, the hand ending where it starts, so they go round and round.
 * Each takes whatever bead is in a slot, and a lap leaves the beads in a new
 * order, so each lap moves different beads: it takes five to get back to the
 * first order. Carries cut across the ring, as people drag, and some linger
 * over one place before settling on another, so the others make way and then
 * make way again. Beads are grabbed off-center, and some are let go short of
 * their places, to settle into them.
 *
 * The comments say which beads move in the first lap.
 */
function reorderTrack(): ExplainerSubject<BeadsState>["track"] {
  // Grabbed up and to the right of its middle
  const grasp0 = Vec2(7, -6);
  const start = slotPos(0).add(grasp0);
  const hand = new Hand(start).wait(0.7).press().wait(0.14);

  // The top bead into the ring, over toward slot 1, then down toward slot 2,
  // let go inside the ring. ABCDE → BCADE
  hand
    .move(Vec2(176, 128), 0.42, 0.12)
    .wait(0.16)
    .move(slotPos(1).add(grasp0, Vec2(-14, 8)), 0.48, -0.1)
    .wait(0.55)
    .move(slotPos(2).add(grasp0, Vec2(-26, -20)), 0.55, 0.18)
    .wait(0.14)
    .release()
    .wait(0.3);

  // Slot 4's, low on its left: a hop down a slot. BCADE → BCAED
  const grasp4 = Vec2(-9, 8);
  hand
    .move(slotPos(4).add(grasp4), 0.75, 0.22)
    .wait(0.45)
    .press()
    .wait(0.09)
    .move(slotPos(3).add(grasp4), 0.62, -0.08, 4)
    .wait(0.08)
    .release()
    .wait(1.1);

  // Slot 4's again (the next bead along), near its top: across the middle, a
  // look at slot 3, then on to slot 2. BCAED → BCDAE
  const grasp4b = Vec2(2, -11);
  hand
    .move(slotPos(4).add(grasp4b), 0.5, -0.15)
    .wait(0.3)
    .press()
    .wait(0.18)
    .move(Vec2(118, 178).add(grasp4b), 0.4, 0.06)
    .move(slotPos(3).add(grasp4b, Vec2(10, -14)), 0.34, 0.2)
    .wait(0.42)
    .move(slotPos(2).add(grasp4b), 0.58, -0.14, 5)
    .wait(0.12)
    .release()
    .wait(0.5);

  // Slot 1's, low on its left: across under the top, a look at the top, then
  // let go short of slot 4. BCDAE → BDAEC
  const grasp1 = Vec2(-6, 9);
  hand
    .move(slotPos(1).add(grasp1), 0.58, 0.15)
    .wait(0.3)
    .press()
    .wait(0.15)
    .move(Vec2(150, 96).add(grasp1), 0.5, -0.12)
    .wait(0.45)
    .move(slotPos(4).add(grasp1, Vec2(22, 14)), 0.5, 0.1)
    .wait(0.1)
    .release()
    .wait(0.6)
    // Back over to the top, to go again
    .move(start, 0.55, 0.15)
    .wait(0.4);
  return hand.track;
}

/** The ring of beads, reordered again and again by drags that drop */
export const beadsReorderSubject: ExplainerSubject<BeadsState> = {
  ...beadsSubject,
  track: reorderTrack(),
  loopFrom: 0,
};
