import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import {
  INITIAL_PERMS,
  INITIAL_VIEW,
  permutationLab,
  wordFromPerm,
  type State,
} from "./permutation-lab";

// # Permutation Lab, talk version
//
// The permutation lab packed into a 16:9 canvas for a slide: the
// permutohedron fills the right half, the notations and the wiring
// diagram stack on the left, and the instructions are gone (the speaker
// gives them). n = 4, solid permutohedron, adjacent-transposition tile
// drags.

export const PERM_TALK_WIDTH = 960;
export const PERM_TALK_HEIGHT = 540;

function heading(
  text: string,
  pos: Vec2,
  anchor: "start" | "middle" = "start",
) {
  return (
    <text
      transform={translate(pos)}
      textAnchor={anchor}
      fontSize={13}
      fontWeight={600}
      fill="#6b7280"
      fontFamily="system-ui, sans-serif"
      letterSpacing={1}
    >
      {text.toUpperCase()}
    </text>
  );
}

const draggable = permutationLab({
  width: PERM_TALK_WIDTH,
  height: PERM_TALK_HEIGHT,
  twoLine: { origin: Vec2(42, 52), ts: 48 },
  cycle: { origin: Vec2(16, 266), scale: 1.35 },
  matrix: { origin: Vec2(310, 52), cs: 32 },
  ph: { center: Vec2(722, 282), r: 236, marks: 1.6 },
  word: { origin: Vec2(236, 276), fontSize: 26, maxWidth: 205 },
  stats: null,
  wiring: {
    origin: Vec2(52, 384),
    width: 412,
    rs: 42,
    scale: 1.4,
    minCols: 10,
  },
  annotations: ({ wiringFull }) => (
    <g>
      {heading("two-line notation", Vec2(16, 24))}
      {heading("permutation matrix", Vec2(300, 24))}
      {heading("cycle diagram", Vec2(16, 202))}
      {heading(
        wiringFull ? "wiring diagram (full)" : "wiring diagram",
        Vec2(16, 352),
      )}
      {heading("permutohedron", Vec2(722, 24), "middle")}
    </g>
  ),
});

const initialState: State = {
  n: 4,
  word: wordFromPerm(INITIAL_PERMS[4]),
  mode: "adjacent",
  phStyle: "solid",
  view: INITIAL_VIEW,
};

export function PermutationLabTalk() {
  return (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={PERM_TALK_WIDTH}
      height={PERM_TALK_HEIGHT}
    />
  );
}

export default demo(PermutationLabTalk, {
  tags: ["d.between", "d.closest", "d.vary", "spec.withSnapRadius [chain]"],
});
