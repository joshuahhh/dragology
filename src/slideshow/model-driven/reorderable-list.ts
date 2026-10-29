import {
  initialState,
  makeDraggable,
} from "../../demos/study-reorderable-list";
import type { CodeLine, ExplainerSubject } from "./ModelDrivenScene";

type ListState = typeof initialState;

const draggedId = "Apples";

/** `{ items: [ Apples, Bananas, ... ]}`, two to a line */
function formatState(state: ListState): CodeLine[] {
  const pairs = [state.items.slice(0, 2), state.items.slice(2)];
  return [
    [{ text: "{ items: [" }],
    ...pairs.map(
      (pair, p): CodeLine => [
        { text: "  " },
        ...pair.flatMap((item, i) => [
          ...(i > 0 ? [{ text: " " }] : []),
          { text: item, mark: item === draggedId },
          ...(p === 0 || i < pair.length - 1 ? [{ text: "," }] : []),
        ]),
      ],
    ),
    [{ text: "]}" }],
  ];
}

/**
 * The reorderable list from the study (`d.between` over every order), with
 * Apples dragged down the list and partway back.
 */
export const reorderableListSubject: ExplainerSubject<ListState> = {
  draggable: makeDraggable(false, false),
  width: 220,
  height: 230,
  state: initialState,
  draggedId,
  formatState,
  // Apples starts centered at (100, 40); each slot is 48 further down
  track: [
    [23.2, 100, 40],
    [24.2, 100, 40],
    [25.2, 104, 112],
    [26.0, 102, 184],
    [26.4, 101, 186],
    [27.2, 100, 110],
    [27.7, 100, 104],
  ],
};
