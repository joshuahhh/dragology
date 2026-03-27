import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb, require } from "../amb";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type Card = {
  id: string;
  title: string;
};

type Column = {
  id: string;
  title: string;
  cards: Card[];
};

type State = {
  columns: Column[];
};

const initialState: State = {
  columns: [
    {
      id: "todo",
      title: "To Do",
      cards: [
        { id: "card-1", title: "Task A" },
        { id: "card-2", title: "Task B" },
      ],
    },
    {
      id: "doing",
      title: "Doing",
      cards: [{ id: "card-3", title: "Task C" }],
    },
    {
      id: "done",
      title: "Done",
      cards: [{ id: "card-4", title: "Task D" }],
    },
  ],
};

const COLUMN_WIDTH = 120;
const COLUMN_GAP = 10;
const CARD_HEIGHT = 30;
const CARD_GAP = 5;
const HEADER_HEIGHT = 25;
const COLUMN_PADDING = 5;

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  return (
    <g>
      {state.columns.map((column, colIdx) => {
        const colX = colIdx * (COLUMN_WIDTH + COLUMN_GAP);
        const columnHeight =
          HEADER_HEIGHT +
          COLUMN_PADDING * 2 +
          column.cards.length * (CARD_HEIGHT + CARD_GAP);

        // Generate states for reordering this column
        const columnReorderStates = produceAmb(state, (draft) => {
          const [removed] = draft.columns.splice(colIdx, 1);
          const targetIdx = amb(_.range(draft.columns.length + 1));
          draft.columns.splice(targetIdx, 0, removed);
          require(targetIdx !== colIdx);
        });

        return (
          <g
            id={`column-${column.id}`}
            transform={translate(colX, 0)}
            dragologyZIndex={draggedId === `column-${column.id}` ? 5 : 0}
            dragologyOnDrag={() =>
              d.between([state, ...columnReorderStates]).withSnapRadius(20, {
                transition: true,
              })
            }
          >
            {/* Column background */}
            <rect
              x={0}
              y={0}
              width={COLUMN_WIDTH}
              height={columnHeight}
              fill="#f0f0f0"
              stroke="#ccc"
              strokeWidth={1}
              rx={4}
            />
            {/* Column header */}
            <text
              x={COLUMN_WIDTH / 2}
              y={HEADER_HEIGHT / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight="bold"
              fill="#333"
            >
              {column.title}
            </text>

            {/* Cards */}
            {column.cards.map((card, cardIdx) => {
              const cardY =
                HEADER_HEIGHT +
                COLUMN_PADDING +
                cardIdx * (CARD_HEIGHT + CARD_GAP);
              const isDragged = draggedId === `card-${card.id}`;

              const stateWithout = produce(state, (draft) => {
                draft.columns[colIdx].cards.splice(cardIdx, 1);
              });
              const cardMoveStates = produceAmb(stateWithout, (draft) => {
                const targetCol = amb(draft.columns);
                const pos = amb(_.range(targetCol.cards.length + 1));
                targetCol.cards.splice(pos, 0, card);
              });

              return (
                <g
                  id={`card-${card.id}`}
                  transform={translate(COLUMN_PADDING, cardY)}
                  dragologyZIndex={
                    isDragged ? 10 : draggedId === `column-${column.id}` ? 6 : 1
                  }
                  dragologyOnDrag={() =>
                    d.closest(cardMoveStates).withFloating({
                      ghost: { opacity: 0.3 },
                    })
                  }
                >
                  <rect
                    x={0}
                    y={0}
                    width={COLUMN_WIDTH - COLUMN_PADDING * 2}
                    height={CARD_HEIGHT}
                    fill={isDragged ? "#e3f2fd" : "white"}
                    stroke={isDragged ? "#2196f3" : "#ddd"}
                    strokeWidth={1}
                    rx={3}
                  />
                  <text
                    x={(COLUMN_WIDTH - COLUMN_PADDING * 2) / 2}
                    y={CARD_HEIGHT / 2 + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#333"
                  >
                    {card.title}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={400}
      height={200}
    />
  ),
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withFloating [ghost]",
      "spec.withSnapRadius",
      "reordering",
    ],
  },
);
