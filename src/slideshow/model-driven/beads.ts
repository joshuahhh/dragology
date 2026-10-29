import { Draggable } from "../../draggable";
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

/** `{ beads: [ A, B, C, D, E ]}`, over three lines, with the dragged bead marked */
function formatState(state: BeadsState): CodeLine[] {
  const beads: CodeLine = state.beads.flatMap((bead, i) => [
    ...(i > 0 ? [{ text: ", " }] : []),
    { text: bead, mark: bead === draggedId },
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
