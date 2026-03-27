import _ from "lodash";
import { amb, produceAmb, require } from "../amb";
import { arrowhead } from "../arrows";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";

import { demo } from "../demo";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { uPairs } from "../utils";

type State = {
  nodes: { [key: string]: { x: number; y: number } };
  edges: { [key: string]: { from: string; to: string } };
};

const initialState: State = {
  nodes: {
    "1": { x: 20, y: 20 },
    "2": { x: 120, y: 20 },
    "3": { x: 120, y: 120 },
    "4": { x: 20, y: 120 },
  },
  edges: {
    "1": { from: "1", to: "2" },
    "2": { from: "2", to: "3" },
    "3": { from: "3", to: "4" },
    "4": { from: "4", to: "1" },
  },
};

function stateIsValid(state: State) {
  return (
    // No self-loops
    Object.values(state.edges).every((e) => e.from !== e.to) &&
    // No duplicate edges
    uPairs(Object.values(state.edges)).every(
      ([e1, e2]) => !(e1.from === e2.from && e1.to === e2.to),
    )
  );
}

const draggable: Draggable<State> = ({ state, d }) => {
  const NODE_R = 20;

  return (
    <g>
      {/* Render edges first so they're behind nodes */}
      {Object.entries(state.edges).map(([key, edge]) => {
        const fromCenter = Vec2(state.nodes[edge.from]);
        const toCenter = Vec2(state.nodes[edge.to]);
        const fromArrow = fromCenter.towards(toCenter, NODE_R + 5);
        const toArrow = toCenter.towards(fromCenter, NODE_R + 5);

        const arrowHeadLength = 20;

        // Is the opposite edge present?
        const oppositeEdgeKey = _.findKey(
          state.edges,
          (e) => e.from === edge.to && e.to === edge.from,
        );
        let offset = Vec2(0);
        if (oppositeEdgeKey) {
          // Offset arrow perpendicular to its direction
          const dir = toArrow.sub(fromArrow).norm();
          offset = dir.rotateDeg(90).mul(8);
        }

        const tailPos = fromArrow.towards(toArrow, 5).add(offset);
        const arrowPos = toArrow.add(offset);
        const lineEnd = toArrow
          .towards(fromArrow, arrowHeadLength / 2)
          .add(offset);

        const direction = toArrow.sub(fromArrow);

        return (
          <g id={`edge-${key}`}>
            <line
              {...fromArrow.add(offset).xy1()}
              {...lineEnd.xy2()}
              stroke="black"
              strokeWidth={2}
            />
            {arrowhead({
              tip: arrowPos,
              direction,
              headLength: arrowHeadLength,
              id: `head-${key}`,
              fill: "black",
              dragologyOnDrag: () =>
                d.between(
                  produceAmb(state, (draft) => {
                    draft.edges[key].to = amb(Object.keys(state.nodes));
                    require(stateIsValid(draft));
                  }),
                ),
              dragologyZIndex: 1,
            })}
            <circle
              id={`tail-${key}`}
              transform={translate(tailPos)}
              r={5}
              fill="black"
              dragologyOnDrag={() =>
                d.between(
                  produceAmb(state, (draft) => {
                    draft.edges[key].from = amb(Object.keys(state.nodes));
                    require(stateIsValid(draft));
                  }),
                )
              }
              dragologyZIndex={1}
            />
          </g>
        );
      })}

      {/* Render nodes */}
      {Object.entries(state.nodes).map(([key, node]) => (
        <circle
          id={`node-${key}`}
          transform={translate(node.x, node.y)}
          r={NODE_R}
          fill="black"
          dragologyOnDrag={() =>
            d.vary(state, [param("nodes", key, "x"), param("nodes", key, "y")])
          }
        />
      ))}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={200}
      height={200}
    />
  ),
  { tags: ["d.between", "d.vary"] },
);
