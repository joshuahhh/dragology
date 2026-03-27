import {
  Align,
  Background,
  Circle,
  createName,
  Group,
  Rect,
  Ref,
  StackH,
  StackV,
  Text,
} from "bluefish-js";
import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../../amb";
import { demo } from "../../demo";
import { DemoDraggable, DemoNotes } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { bluefishWithAttach } from "./bluefish";

type State = {
  rows: {
    id: string;
    items: { id: string; label: string; w: number; h: number }[];
    color: string;
  }[];
};

const initialState: State = {
  rows: [
    {
      id: "row1",
      items: [
        { id: "A1", label: "A1", w: 108, h: 100 },
        { id: "B1", label: "B1", w: 50, h: 50 },
        { id: "C1", label: "C1", w: 50, h: 50 },
      ],
      color: "#f0f4ff",
    },
    {
      id: "row2",
      items: [
        { id: "A2", label: "A2", w: 50, h: 50 },
        { id: "B2", label: "B2", w: 108, h: 50 },
        { id: "C2", label: "C2", w: 50, h: 50 },
      ],
      color: "#fff4f0",
    },
    {
      id: "row3",
      items: [
        { id: "A3", label: "A3", w: 50, h: 50 },
        { id: "B3", label: "B3", w: 50, h: 50 },
        { id: "C3", label: "C3", w: 50, h: 108 },
      ],
      color: "#f0fff4",
    },
  ],
};

const TILE_GAP = 8;
const ROW_GAP = 10;

const draggable: Draggable<State> = ({ state, d }) =>
  bluefishWithAttach((attach) =>
    StackV({ spacing: ROW_GAP, alignment: "left" }, [
      ...state.rows.map((row, rowIdx) => {
        const rowBgName = createName("rowBg");

        attach(`row-${row.id}`, {
          dragologyOnDrag: () => {
            const stateWithout = produce(state, (draft) => {
              draft.rows.splice(rowIdx, 1);
            });
            const statesWith = _.range(state.rows.length).map((newIdx) =>
              produce(stateWithout, (draft) => {
                draft.rows.splice(newIdx, 0, row);
              }),
            );
            return d.closest(statesWith).whenFar(stateWithout).withFloating();
          },
        });

        return Group({ id: `row-${row.id}` }, [
          Background(
            {
              name: rowBgName,
              padding: 8,
              fill: row.color,
              stroke: "#aaa",
              "stroke-width": 1.5,
              rx: 6,
            },
            StackH({ spacing: TILE_GAP, alignment: "centerY" }, [
              // Grip dots (2x3 grid)
              Group({ opacity: 0.35 }, [
                StackV({ spacing: 4 }, [
                  ...[0, 1, 2].map(() =>
                    StackH({ spacing: 4 }, [
                      ...[0, 1].map(() =>
                        Circle({
                          r: 1.5,
                          fill: "#333",
                        }),
                      ),
                    ]),
                  ),
                ]),
              ]),
              StackH(
                { spacing: TILE_GAP, alignment: "top" },
                row.items.map((p, idx) => {
                  const boxName = createName("box");
                  const labelName = createName("label");

                  attach(p.id, {
                    dragologyZIndex: 1,
                    dragologyOnDrag: () => {
                      const stateWithout = produce(state, (draft) => {
                        draft.rows[rowIdx].items.splice(idx, 1);
                      });
                      const statesWith = produceAmb(stateWithout, (draft) => {
                        const newRow = amb(draft.rows);
                        const newColIdx = amb(_.range(newRow.items.length + 1));
                        newRow.items.splice(newColIdx, 0, p);
                      });
                      return d
                        .closest(statesWith)
                        .whenFar(stateWithout)
                        .withFloating();
                    },
                  });

                  return Group({ id: p.id }, [
                    Rect({
                      name: boxName,
                      width: p.w,
                      height: p.h,
                      stroke: "#aaa",
                      "stroke-width": 1.5,
                      fill: "white",
                      rx: 4,
                    }),
                    Text(
                      {
                        name: labelName,
                        "font-size": "18px",
                        "font-weight": "500",
                        fill: "#555",
                      },
                      p.label,
                    ),
                    Align({ alignment: "center" }, [
                      Ref({ select: labelName }),
                      Ref({ select: boxName }),
                    ]),
                  ]);
                }),
              ),
            ]),
          ),
        ]);
      }),
    ]),
  );

export default demo(
  () => (
    <div>
      <DemoNotes>
        Like list-of-lists-sizes, but with Bluefish handling layout.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={450}
      />
    </div>
  ),
  {
    tags: ["d.closest", "spec.withFloating", "spec.whenFar"],
  },
);
