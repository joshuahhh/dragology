import { Align, createName, Group, Rect, Ref, StackH, Text } from "bluefish-js";
import { produce } from "immer";
import { demo } from "../../demo";
import { DemoDraggable, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { bluefishWithAttach } from "./bluefish";

type State = {
  perm: string[];
};

const initialState: State = {
  perm: ["A", "B", "C", "D", "E"],
};

const TILE_SIZE = 50;

const draggable: Draggable<State> = ({ state, d, draggedId }) =>
  bluefishWithAttach((attach) =>
    StackH({ spacing: 0 }, [
      ...state.perm.map((p) => {
        const backgroundName = createName("background");
        const boxName = createName("box");
        const labelName = createName("label");

        attach(p, {
          dragologyOnDrag: () =>
            d.between(
              state.perm.map((_, idx) =>
                produce(state, (draft) => {
                  const draggedIdx = draft.perm.indexOf(p);
                  draft.perm.splice(draggedIdx, 1);
                  draft.perm.splice(idx, 0, p);
                }),
              ),
            ),
          dragologyZIndex: p === draggedId ? 1 : 0,
        });

        return Group({ id: p }, [
          Rect({
            name: backgroundName,
            width: TILE_SIZE,
            height: TILE_SIZE + 5,
            fill: "none",
          }),
          Rect({
            name: boxName,
            width: TILE_SIZE,
            height: TILE_SIZE,
            stroke: "black",
            "stroke-width": 2,
            fill: "white",
          }),
          Text(
            { name: labelName, "font-size": "20px", "font-weight": "normal" },
            p,
          ),
          Align({ alignment: "center" }, [
            Ref({ select: labelName }),
            Ref({ select: boxName }),
          ]),
          Align({ alignment: draggedId === p ? "topCenter" : "bottomCenter" }, [
            Ref({ select: labelName }),
            Ref({ select: backgroundName }),
          ]),
        ]);
      }),
    ]),
  );

export default demo(
  () => (
    <>
      <DemoNotes>This one is interactive!</DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={300}
        height={120}
      />
    </>
  ),
  { tags: ["d.between", "reordering"] },
);
