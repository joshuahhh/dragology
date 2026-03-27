import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable, OnDragCallback } from "../draggable";
import { translate } from "../svgx/helpers";

type Tile = { key: string; label: string };

type State = {
  items: Tile[];
  store: Tile[];
  deleted?: Tile;
};

const initialState: State = {
  store: [
    { key: "D", label: "\u{1F34E}" },
    { key: "E", label: "\u{1F34C}" },
    { key: "F", label: "\u{1F347}" },
  ],
  items: [
    { key: "A", label: "\u{1F34E}" },
    { key: "B", label: "\u{1F34E}" },
    { key: "C", label: "\u{1F34C}" },
  ],
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;

  const drawTile = ({
    tile,
    transform,
    dragologyOnDrag,
  }: {
    tile: Tile;
    transform: string;
    dragologyOnDrag?: OnDragCallback<State>;
  }) => {
    const id = `tile-${tile.key}`;
    return (
      <g id={id} transform={transform} dragologyOnDrag={dragologyOnDrag}>
        <rect
          x={0}
          y={0}
          width={TILE_SIZE}
          height={TILE_SIZE}
          stroke="black"
          strokeWidth={2}
          fill="white"
        />
        <text
          x={TILE_SIZE / 2}
          y={TILE_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={20}
          pointerEvents="none"
        >
          {tile.label}
        </text>
      </g>
    );
  };

  const toolbarWidth = state.store.length * TILE_SIZE + 20;
  const toolbarHeight = TILE_SIZE + 10;

  return (
    <g>
      {/* Toolbar background */}
      <rect
        x={-5}
        y={-5}
        width={toolbarWidth}
        height={toolbarHeight}
        fill="#f5f5f5"
        stroke="#ccc"
        strokeWidth={1}
        rx={4}
        id="toolbar-bg"
        dragologyZIndex={-10}
      />

      {/* Store items */}
      {state.store.map((tile, idx) =>
        drawTile({
          tile,
          transform: translate(5 + idx * TILE_SIZE, 0),
          dragologyOnDrag: () => {
            const storeItem = tile;

            const stateWithout = produce(state, (draft) => {
              draft.store[idx].key += "-1";
            });

            const statesWith = produceAmb(stateWithout, (draft) => {
              const insertIdx = amb(_.range(state.items.length + 1));
              draft.items.splice(insertIdx, 0, storeItem);
            });

            return d.closest(statesWith).whenFar(stateWithout).withFloating();
          },
        }),
      )}

      {/* Items */}
      {state.items.map((tile, idx) =>
        drawTile({
          tile,
          transform: translate(idx * TILE_SIZE, toolbarHeight + 10),
          dragologyOnDrag: () => {
            const draggedItem = tile;

            const stateWithout = produce(state, (draft) => {
              draft.items.splice(idx, 1);
            });

            const rearrangeStates = produceAmb(stateWithout, (draft) => {
              const insertIdx = amb(_.range(draft.items.length + 1));
              draft.items.splice(insertIdx, 0, draggedItem);
            });

            const deleteState = produce(stateWithout, (draft) => {
              draft.items.splice(idx, 1);
              draft.deleted = draggedItem;
            });
            const postDeleteState = produce(deleteState, (draft) => {
              draft.deleted = undefined;
            });

            return d
              .closest([
                rearrangeStates,
                // This state needs "d.fixed" so we can call "onDrop"
                d.fixed(deleteState).onDrop(postDeleteState),
              ])
              .whenFar(stateWithout)
              .withFloating();
          },
        }),
      )}

      {/* Deleted bin */}
      <g transform={translate(230, 0)}>
        <g>
          <rect
            x={0}
            y={0}
            width={TILE_SIZE}
            height={TILE_SIZE}
            fill="#fee"
            stroke="#999"
            strokeWidth={2}
            strokeDasharray="4,4"
            rx={4}
          />
          <text
            x={TILE_SIZE / 2}
            y={TILE_SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={30}
            pointerEvents="none"
          >
            {"\u{1F5D1}"}
          </text>
        </g>
        {state.deleted &&
          drawTile({
            tile: state.deleted,
            transform: translate(0, 0),
          })}
      </g>
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        This shows how we originally supported creating and removing tiles: by
        representing pre-creation and post-deletion tiles in the state, It's
        more committed to "object permanence" than our newer approach, which is
        kinda interesting.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={200}
      />
    </div>
  ),
  {
    tags: [
      "spec.onDrop",
      "d.closest",
      "d.fixed",
      "spec.withFloating",
      "spec.whenFar",
    ],
  },
);
