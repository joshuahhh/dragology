import _ from "lodash";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { Vec2 } from "../math/vec2";
import { renderDraggableInert } from "../renderDraggable";

import { demo } from "../demo";
import { translate } from "../svgx/helpers";

type State = {
  posIndex: number;
};

const POSITIONS = [Vec2(10, 10), Vec2(100, 10), Vec2(55, 90)];
const STATES = POSITIONS.map((_pos, i) => ({ posIndex: i }));
const CENTER = Vec2(
  (POSITIONS[0].x + POSITIONS[1].x + POSITIONS[2].x) / 3,
  (POSITIONS[0].y + POSITIONS[1].y + POSITIONS[2].y) / 3,
);
const SQUARE_SIZE = 40;
const HALF_SQUARE = Vec2(SQUARE_SIZE / 2);

const initialState: State = { posIndex: 0 };

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    {/* background positions */}
    {POSITIONS.map((pos, i) => (
      <rect
        key={i}
        transform={translate(pos)}
        width={SQUARE_SIZE}
        height={SQUARE_SIZE}
        rx={4}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
    ))}
    {/* draggable square */}
    <rect
      id="switch"
      transform={translate(POSITIONS[state.posIndex])}
      width={SQUARE_SIZE}
      height={SQUARE_SIZE}
      rx={4}
      dragologyOnDrag={() =>
        d.custom((ctx) => (frame) => {
          const draggedPos = frame.pointer.sub(ctx.anchorPos);
          const [bestIndex] = _.minBy(
            Array.from(POSITIONS.entries()),
            ([, pos]) => draggedPos.dist(pos),
          )!;
          const bestState = STATES[bestIndex];
          return {
            preview: () =>
              renderDraggableInert(
                ctx.draggable,
                bestState,
                ctx.draggedId,
                false,
              ),
            dropState: bestState,
            gap: draggedPos.dist(POSITIONS[bestIndex]),
            activePath: `custom/${bestIndex}`,
            tracedSpec: { type: "custom", fn: null! },
          };
        })
      }
    />
    {/* extra line to see how background interpolates */}
    <line
      {...CENTER.add(HALF_SQUARE).xy1()}
      {...POSITIONS[state.posIndex].add(HALF_SQUARE).xy2()}
      stroke="#cbd5e1"
      strokeWidth={6}
      strokeLinecap="round"
    />
  </g>
);

export default demo(
  () => (
    <div>
      <DemoNotes>
        <p>
          Reproduces the <code>d.closest(states)</code> simple-triangle demo
          using only <code>d.custom</code>.
        </p>
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={200}
        height={150}
      />
    </div>
  ),
  { tags: ["d.custom"] },
);
