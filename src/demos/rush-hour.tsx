import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type Car = {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: "h" | "v";
  color: string;
};

type State = {
  w: number;
  h: number;
  cars: Record<string, Car>;
};

const initialState: State = {
  w: 6,
  h: 6,
  cars: {
    A: { x: 0, y: 0, w: 2, h: 1, dir: "h", color: "lightgreen" },
    B: { x: 0, y: 1, w: 1, h: 3, dir: "v", color: "purple" },
    C: { x: 1, y: 2, w: 2, h: 1, dir: "h", color: "red" },
    D: { x: 0, y: 4, w: 1, h: 2, dir: "v", color: "orange" },
    E: { x: 3, y: 1, w: 1, h: 3, dir: "v", color: "blue" },
    F: { x: 5, y: 0, w: 1, h: 3, dir: "v", color: "yellow" },
    G: { x: 4, y: 4, w: 2, h: 1, dir: "h", color: "lightblue" },
    H: { x: 2, y: 5, w: 3, h: 1, dir: "h", color: "green" },
  },
};

const draggable: Draggable<State> = ({ state, d }) => {
  const TILE_SIZE = 50;
  const BORDER_WIDTH = 10;
  const redCarY = Object.values(state.cars).find((t) => t.color === "red")?.y;

  return (
    <g transform={translate(BORDER_WIDTH, BORDER_WIDTH)}>
      {/* Grid */}
      {_.range(state.w).map((x) =>
        _.range(state.h).map((y) => (
          <rect
            id={`grid-${x}-${y}`}
            x={x * TILE_SIZE}
            y={y * TILE_SIZE}
            width={TILE_SIZE}
            height={TILE_SIZE}
            stroke="gray"
            strokeWidth={1}
            fill="none"
            dragologyZIndex={-5}
          />
        )),
      )}

      {/* Cars */}
      {Object.entries(state.cars).map(([key, car]) => (
        <rect
          id={`car-${key}`}
          x={0}
          y={0}
          width={car.w * TILE_SIZE}
          height={car.h * TILE_SIZE}
          fill={car.color}
          stroke="black"
          strokeWidth={2}
          transform={translate(car.x * TILE_SIZE, car.y * TILE_SIZE)}
          dragologyZIndex={5}
          dragologyOnDrag={() => {
            const nextStates: State[] = [state];

            function tryMove(dx: number, dy: number) {
              let x = car.x + dx;
              let y = car.y + dy;
              while (true) {
                const rightBoundary =
                  car.color === "red" ? state.w + 2 : state.w;
                if (
                  x < 0 ||
                  x + car.w > rightBoundary ||
                  y < 0 ||
                  y + car.h > state.h
                )
                  break;
                if (
                  Object.entries(state.cars).some(([k, t]) => {
                    if (k === key) return false;
                    return !(
                      x + car.w <= t.x ||
                      x >= t.x + t.w ||
                      y + car.h <= t.y ||
                      y >= t.y + t.h
                    );
                  })
                ) {
                  break;
                }
                nextStates.push({
                  ...state,
                  cars: {
                    ...state.cars,
                    [key]: { ...car, x, y },
                  },
                });
                x += dx;
                y += dy;
              }
            }

            if (car.dir === "h") {
              tryMove(-1, 0);
              tryMove(1, 0);
            }
            if (car.dir === "v") {
              tryMove(0, -1);
              tryMove(0, 1);
            }

            return d.between(nextStates).withSnapRadius(10);
          }}
        />
      ))}

      {/* Border */}
      <rect
        x={-BORDER_WIDTH / 2}
        y={-BORDER_WIDTH / 2}
        width={state.w * TILE_SIZE + BORDER_WIDTH}
        height={state.h * TILE_SIZE + BORDER_WIDTH}
        stroke="gray"
        strokeWidth={BORDER_WIDTH}
        fill="none"
        dragologyZIndex={-10}
        id="border"
      />

      {/* Exit line for red car */}
      {redCarY !== undefined && (
        <line
          x1={state.w * TILE_SIZE + BORDER_WIDTH / 2}
          y1={redCarY * TILE_SIZE}
          x2={state.w * TILE_SIZE + BORDER_WIDTH / 2}
          y2={(redCarY + 1) * TILE_SIZE}
          stroke="white"
          strokeWidth={BORDER_WIDTH}
        />
      )}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={350}
      height={350}
    />
  ),
  { tags: ["d.between", "spec.withSnapRadius", "puzzle"] },
);
