import { produce } from "immer";
import _ from "lodash";
import { amb, produceAmb } from "../amb";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { getAtPath, PathIn } from "../paths";
import { translate } from "../svgx/helpers";

type State = {
  boxes: (Box & { x: number; y: number })[];
};

type Box = {
  id: string;
  items: Box[];
  itemsBelow: Box[];
  color: string;
};

const colors = [
  "#c9e4f0", // soft blue
  "#f5d5d8", // soft pink
  "#d4edcf", // soft green
  "#f5eac9", // soft yellow
  "#e4d4e8", // soft purple
  "#f5dcc9", // soft peach
  "#c9f0ed", // soft aqua
  "#e8d4f0", // soft lavender
];

const box = (
  id: string,
  color: string,
  items: Box[] = [],
  itemsBelow: Box[] = [],
): Box => ({ id, items, itemsBelow, color });

const initialState: State = {
  boxes: [
    {
      id: "root",
      items: [box("A", colors[4]), box("B", colors[5])],
      itemsBelow: [
        {
          id: "left",
          items: [box("C", colors[6]), box("D", colors[7])],
          itemsBelow: [],
          color: colors[1],
        },
        {
          id: "right",
          items: [box("E", colors[4])],
          itemsBelow: [
            {
              id: "right-child",
              items: [box("F", colors[5]), box("G", colors[6])],
              itemsBelow: [],
              color: colors[3],
            },
          ],
          color: colors[2],
        },
      ],
      color: colors[0],
      x: 100,
      y: 20,
    },
  ],
};

const BELOW_GAP = 24;
const MIN_BOX_SIZE = 50;
const BOX_GAP = 8;
const BOX_PADDING = 8;
const GRIP_WIDTH = 16;
const GRIP_PADDING = 2;
const LABEL_HEIGHT = 16;

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  function allBoxes(box: Box): Box[] {
    return [
      box,
      ...box.items.flatMap(allBoxes),
      ...box.itemsBelow.flatMap(allBoxes),
    ];
  }

  function renderBox(
    box: Box,
    itemsPath: PathIn<State, Box[]>,
    idx: number,
    zIndexBase: number,
  ): { element: React.JSX.Element; width: number; height: number } {
    const isDragged = draggedId === box.id;

    const dragologyOnDrag = () => {
      const stateWithout = produce(state, (draft) => {
        const items = getAtPath<State, Box[]>(draft, itemsPath);
        items.splice(idx, 1);
      });

      const statesWith = produceAmb(stateWithout, (draft) => {
        const boxes = draft.boxes.flatMap(allBoxes);
        const target = amb(boxes);
        const list = amb([target.items, target.itemsBelow]);
        const insertIdx = amb(_.range(list.length + 1));
        list.splice(insertIdx, 0, box);
      });

      const stateWithTopBox = produce(stateWithout, (draft) => {
        draft.boxes.push({
          ...box,
          x: 0,
          y: 0,
        });
      });

      const varySpec = d.vary(stateWithTopBox, [
        param("boxes", stateWithTopBox.boxes.length - 1, "x"),
        param("boxes", stateWithTopBox.boxes.length - 1, "y"),
      ]);

      if (statesWith.length === 0) {
        return varySpec;
      }

      return d.closest(statesWith).withFloating().whenFar(varySpec);
    };

    const effectiveZIndex = isDragged ? zIndexBase + 10 : zIndexBase;
    const hasItems = box.items.length > 0;

    // Render horizontal children
    const children = box.items.map((child, childIdx) =>
      renderBox(
        child,
        [...itemsPath, idx, "items"] as PathIn<State, Box[]>,
        childIdx,
        effectiveZIndex + 1,
      ),
    );

    // Render below children
    const belowChildren = box.itemsBelow.map((child, childIdx) =>
      renderBox(
        child,
        [...itemsPath, idx, "itemsBelow"] as PathIn<State, Box[]>,
        childIdx,
        effectiveZIndex + 1,
      ),
    );

    // Box content dimensions
    const contentHeight = hasItems
      ? Math.max(MIN_BOX_SIZE, ...children.map((c) => c.height)) +
        BOX_PADDING * 2 +
        LABEL_HEIGHT
      : MIN_BOX_SIZE;
    const itemsWidth = hasItems
      ? _.sum(children.map((c) => c.width)) + BOX_GAP * (children.length - 1)
      : 0;
    const boxContentWidth = hasItems
      ? GRIP_WIDTH + GRIP_PADDING + itemsWidth + BOX_PADDING * 2
      : MIN_BOX_SIZE;

    // Below dimensions
    const belowTotalWidth =
      belowChildren.length > 0
        ? _.sum(belowChildren.map((c) => c.width)) +
          BOX_GAP * (belowChildren.length - 1)
        : 0;
    const belowMaxHeight =
      belowChildren.length > 0
        ? Math.max(...belowChildren.map((c) => c.height))
        : 0;

    const totalWidth = Math.max(boxContentWidth, belowTotalWidth);
    const totalHeight =
      contentHeight +
      (belowChildren.length > 0 ? BELOW_GAP + belowMaxHeight : 0);

    const boxX = (totalWidth - boxContentWidth) / 2;
    const belowX = (totalWidth - belowTotalWidth) / 2;

    let xOffset = GRIP_WIDTH + GRIP_PADDING + BOX_PADDING;
    let belowXOffset = 0;

    const element = (
      <g
        id={box.id}
        dragologyZIndex={effectiveZIndex}
        dragologyOnDrag={dragologyOnDrag}
      >
        {/* Box */}
        <g transform={translate(boxX, 0)}>
          <rect
            width={boxContentWidth}
            height={contentHeight}
            fill={box.color}
            stroke="#aaa"
            strokeWidth={1.5}
            rx={6}
          />
          {/* Label */}
          <text
            x={4}
            y={LABEL_HEIGHT - 3}
            fontSize={11}
            fontWeight="500"
            fill="#666"
          >
            {box.id}
          </text>
          {/* Grip dots */}
          {hasItems && (
            <g opacity={0.35} id={`${box.id}-grip`}>
              {[0, 1, 2].map((i) =>
                [0, 1].map((j) => (
                  <circle
                    cx={GRIP_WIDTH / 2 + 8 * j}
                    cy={contentHeight / 2 + (i - 1) * 8}
                    r={1.5}
                    fill="#333"
                  />
                )),
              )}
            </g>
          )}
          {/* Horizontal children */}
          {children.map((child, childIdx) => {
            const childX = xOffset;
            xOffset += child.width + BOX_GAP;
            return (
              <g
                id={`${box.id}-slot-${childIdx}`}
                transform={translate(childX, LABEL_HEIGHT + BOX_PADDING)}
              >
                {child.element}
              </g>
            );
          })}
        </g>
        {/* Connector lines */}
        {belowChildren.map((child, childIdx) => {
          const childCenterX = belowX + belowXOffset + child.width / 2;
          belowXOffset += child.width + BOX_GAP;
          return (
            <line
              id={`${box.id}-line-${childIdx}`}
              dragologyZIndex={effectiveZIndex + 1}
              x1={totalWidth / 2}
              y1={contentHeight}
              x2={childCenterX}
              y2={contentHeight + BELOW_GAP}
              stroke="#aaa"
              strokeWidth={1.5}
            />
          );
        })}
        {/* Below children */}
        {(() => {
          let bx = 0;
          return belowChildren.map((child, childIdx) => {
            const childX = belowX + bx;
            bx += child.width + BOX_GAP;
            return (
              <g
                id={`${box.id}-below-${childIdx}`}
                transform={translate(childX, contentHeight + BELOW_GAP)}
              >
                {child.element}
              </g>
            );
          });
        })()}
      </g>
    );
    return { width: totalWidth, height: totalHeight, element };
  }

  return (
    <g>
      {state.boxes.map((box, boxIdx) => (
        <g id={`box-slot-${boxIdx}`} transform={translate(box)}>
          {renderBox(box, ["boxes"], boxIdx, 0).element}
        </g>
      ))}
    </g>
  );
};

export default demo(
  () => (
    <div>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={600}
        height={400}
      />
    </div>
  ),
  {
    tags: ["d.closest", "spec.withFloating", "d.vary", "spec.whenFar"],
  },
);
