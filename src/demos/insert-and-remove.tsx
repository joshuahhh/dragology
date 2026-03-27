import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable, OnDragCallback } from "../draggable";
import { translate } from "../svgx/helpers";
import { makeId } from "../utils";

type Tile = { id: string; label: string };

type State = {
  items: Tile[];
};

const initialState: State = {
  items: [
    { id: "A", label: "\u{1F34E}" },
    { id: "B", label: "\u{1F34E}" },
    { id: "C", label: "\u{1F34C}" },
  ],
};

const STORE_ITEMS = ["\u{1F34E}", "\u{1F34C}", "\u{1F347}"];

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
    const id = `tile-${tile.id}`;
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

  const toolbarWidth = STORE_ITEMS.length * TILE_SIZE + 20;
  const toolbarHeight = TILE_SIZE + 10;

  const dropIntoListAndTrash = (state: State, tile: Tile) => {
    const rearrangeStates = produceAmb(state, (draft) => {
      const insertIdx = amb(_.range(draft.items.length + 1));
      draft.items.splice(insertIdx, 0, tile);
    });

    return d.closest([
      d.closest(rearrangeStates).withFloating(),
      // we leave "withFloating" off this part, so we see the tile
      // disappear
      d.dropTarget("delete-bin", state),
    ]);
  };

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
      {STORE_ITEMS.map((label, idx) =>
        drawTile({
          tile: { id: `store-${idx}`, label },
          transform: translate(5 + idx * TILE_SIZE, 0),
          dragologyOnDrag: () => {
            const newId = makeId();
            return d.switchToStateAndFollow(
              {
                items: [...state.items, { id: newId, label }],
              },
              `tile-${newId}`,
              // This is slightly different from dragging a tile
              // that's already on the list: if we drag it far away,
              // we want it to disappear, not "return" to the end of
              // the list.
              dropIntoListAndTrash(state, { id: newId, label }).whenFar(
                d.fixed(state).withFloating(),
              ),
            );
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

            return dropIntoListAndTrash(stateWithout, draggedItem).whenFar(
              d.fixed(state).withFloating(),
            );
          },
        }),
      )}

      {/* Deleted bin */}
      <g id="delete-bin" transform={translate(230, 0)}>
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
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoNotes>
        Here, we use d.switchToStateAndFollow for pulling tiles off the toolbar
        and d.dropTarget for dropping them into the trash.
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
      "d.switchToStateAndFollow",
      "d.closest",
      "spec.withFloating",
      "d.dropTarget",
      "spec.whenFar",
    ],
  },
);
