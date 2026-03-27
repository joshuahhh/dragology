import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = {
  slideIdx: number;
};

const initialState: State = { slideIdx: 0 };

const SLIDES = [
  { title: "Slide 0", color: "#f0f9ff", textColor: "#0369a1" },
  { title: "Slide 1", color: "#fef3c7", textColor: "#92400e" },
  { title: "Slide 2", color: "#f0fdf4", textColor: "#166534" },
  { title: "Slide 3", color: "#fce7f3", textColor: "#9f1239" },
];

const WIDTH = 400;
const HEIGHT = 250;
const DOT_RADIUS = 6;
const DOT_SPACING = 20;

const draggable: Draggable<State> = ({ state, d, setState }) => (
  <g>
    {/* Main carousel container */}
    <rect
      id="background-rect"
      dragologyZIndex={-1}
      x={0}
      y={0}
      width={WIDTH}
      height={HEIGHT}
      fill="white"
      stroke="#e5e7eb"
      strokeWidth={2}
      rx={12}
    />

    {/* All slides - positioned horizontally */}
    {SLIDES.map((slide, idx) => {
      const xOffset = (idx - state.slideIdx) * WIDTH;

      return (
        <g
          id={`slide-${idx}`}
          transform={translate(xOffset, 0)}
          dragologyOnDrag={() => {
            const specs = [];
            if (state.slideIdx > 0)
              specs.push(d.between([state, { slideIdx: state.slideIdx - 1 }]));
            if (state.slideIdx < SLIDES.length - 1)
              specs.push(d.between([state, { slideIdx: state.slideIdx + 1 }]));
            return d.closest(specs);
          }}
          opacity={idx === state.slideIdx ? 1 : 0}
          pointerEvents={idx === state.slideIdx ? "auto" : "none"}
        >
          <rect
            x={10}
            y={10}
            width={WIDTH - 20}
            height={HEIGHT - 60}
            fill={slide.color}
            rx={8}
          />
          <text
            x={WIDTH / 2}
            y={HEIGHT / 2 - 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={32}
            fontWeight="600"
            fill={slide.textColor}
          >
            {slide.title}
          </text>
        </g>
      );
    })}

    {/* Previous arrow */}
    {state.slideIdx > 0 && (
      <g
        id="prev-arrow"
        transform={translate(30, HEIGHT - 30)}
        onClick={() => setState({ slideIdx: state.slideIdx - 1 })}
        style={{ cursor: "pointer" }}
        opacity={0.5}
      >
        <circle r={15} />
        <path d="M -3 0 L 3 -5 L 3 5 Z" fill="white" />
      </g>
    )}

    {/* Navigation dots */}
    <g transform={translate(WIDTH / 2, HEIGHT - 30)}>
      {SLIDES.map((_, idx) => {
        const isActive = idx === state.slideIdx;
        return (
          <circle
            id={`dot-${idx}`}
            transform={translate(
              (idx - (SLIDES.length - 1) / 2) * DOT_SPACING,
              0,
            )}
            r={isActive ? DOT_RADIUS : DOT_RADIUS - 2}
            fill={isActive ? "#3b82f6" : "#d1d5db"}
            {...(!isActive && {
              onClick: () => setState({ slideIdx: idx }),
              style: { cursor: "pointer" },
            })}
          />
        );
      })}
      <circle
        id="drag-dot"
        transform={translate(
          (state.slideIdx - (SLIDES.length - 1) / 2) * DOT_SPACING,
          0,
        )}
        r={DOT_RADIUS}
        fill="transparent"
        dragologyOnDrag={() =>
          d.between(SLIDES.map((_, idx) => ({ slideIdx: idx })))
        }
      />
    </g>

    {/* Next arrow */}
    {state.slideIdx < SLIDES.length - 1 && (
      <g
        id="next-arrow"
        transform={translate(WIDTH - 30, HEIGHT - 30)}
        onClick={() => setState({ slideIdx: state.slideIdx + 1 })}
        style={{ cursor: "pointer" }}
        opacity={0.5}
      >
        <circle r={15} />
        <path d="M 3 0 L -3 -5 L -3 5 Z" fill="white" />
      </g>
    )}
  </g>
);

export default demo(
  () => (
    <div>
      <DemoNotes>
        Partially-AI-generated carousel with swipe navigation, interactive dots,
        and arrow buttons. Ought to use clipPaths but those don't work yet.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={450}
        height={300}
      />
    </div>
  ),
  { tags: ["setState", "d.between"] },
);
