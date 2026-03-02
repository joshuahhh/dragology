import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { moreThan } from "../DragSpec";
import { translate } from "../svgx/helpers";

type State = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const initialState: State = { x: 80, y: 60, w: 200, h: 140 };

const MIN_W = 40;
const MIN_H = 30;
const HANDLE_HIT = 14;
const CORNER_SIZE = 18;

const bigEnough = (s: State) => [moreThan(s.w, MIN_W), moreThan(s.h, MIN_H)];

const draggable: Draggable<State> = ({ state, d }) => {
  const { x, y, w, h } = state;
  return (
    <g>
      <defs>
        <style>{`
          .rect-demo-vis {
            opacity: 0;
            transition: opacity 0.15s;
            pointer-events: none;
          }
          .rect-demo-zone:hover .rect-demo-vis {
            opacity: 1;
          }
        `}</style>
      </defs>

      {/* Main rectangle body — drag to move */}
      <rect
        id="body"
        transform={translate(x, y)}
        width={w}
        height={h}
        fill="#5b9bf5"
        stroke="#3b82f6"
        strokeWidth={2}
        rx={6}
        style={{ cursor: "grab" }}
        dragology={() => d.vary(state, [["x"], ["y"]])}
      />

      {/* ---- Edges ---- */}

      {/* Top edge — resize by moving top */}
      <g className="rect-demo-zone">
        <rect
          id="handle-top"
          transform={translate(x + CORNER_SIZE, y - HANDLE_HIT / 2)}
          width={Math.max(0, w - 2 * CORNER_SIZE)}
          height={HANDLE_HIT}
          fill="transparent"
          style={{ cursor: "ns-resize" }}
          dragology={() =>
            d.vary(state, [["y"], ["h"]], {
              pin: (s) => s.y + s.h,
              constraint: bigEnough,
            })
          }
        />
        <line
          className="rect-demo-vis"
          x1={x + w * 0.3}
          y1={y}
          x2={x + w * 0.7}
          y2={y}
          stroke="#1d4ed8"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>

      {/* Bottom edge — resize height */}
      <g className="rect-demo-zone">
        <rect
          id="handle-bottom"
          transform={translate(x + CORNER_SIZE, y + h - HANDLE_HIT / 2)}
          width={Math.max(0, w - 2 * CORNER_SIZE)}
          height={HANDLE_HIT}
          fill="transparent"
          style={{ cursor: "ns-resize" }}
          dragology={() =>
            d.vary(state, [["h"]], {
              constraint: bigEnough,
            })
          }
        />
        <line
          className="rect-demo-vis"
          x1={x + w * 0.3}
          y1={y + h}
          x2={x + w * 0.7}
          y2={y + h}
          stroke="#1d4ed8"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>

      {/* Left edge — resize by moving left */}
      <g className="rect-demo-zone">
        <rect
          id="handle-left"
          transform={translate(x - HANDLE_HIT / 2, y + CORNER_SIZE)}
          width={HANDLE_HIT}
          height={Math.max(0, h - 2 * CORNER_SIZE)}
          fill="transparent"
          style={{ cursor: "ew-resize" }}
          dragology={() =>
            d.vary(state, [["x"], ["w"]], {
              pin: (s) => s.x + s.w,
              constraint: bigEnough,
            })
          }
        />
        <line
          className="rect-demo-vis"
          x1={x}
          y1={y + h * 0.3}
          x2={x}
          y2={y + h * 0.7}
          stroke="#1d4ed8"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>

      {/* Right edge — resize width */}
      <g className="rect-demo-zone">
        <rect
          id="handle-right"
          transform={translate(x + w - HANDLE_HIT / 2, y + CORNER_SIZE)}
          width={HANDLE_HIT}
          height={Math.max(0, h - 2 * CORNER_SIZE)}
          fill="transparent"
          style={{ cursor: "ew-resize" }}
          dragology={() =>
            d.vary(state, [["w"]], {
              constraint: bigEnough,
            })
          }
        />
        <line
          className="rect-demo-vis"
          x1={x + w}
          y1={y + h * 0.3}
          x2={x + w}
          y2={y + h * 0.7}
          stroke="#1d4ed8"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>

      {/* ---- Corners ---- */}

      {/* Top-left corner */}
      <g className="rect-demo-zone">
        <rect
          id="handle-tl"
          transform={translate(x - CORNER_SIZE / 2, y - CORNER_SIZE / 2)}
          width={CORNER_SIZE}
          height={CORNER_SIZE}
          fill="transparent"
          style={{ cursor: "nwse-resize" }}
          dragology={() =>
            d.vary(state, [["x"], ["y"], ["w"], ["h"]], {
              pin: (s) => [s.x + s.w, s.y + s.h],
              constraint: bigEnough,
            })
          }
        />
        <circle
          className="rect-demo-vis"
          transform={translate(x, y)}
          r={4}
          fill="#1d4ed8"
        />
      </g>

      {/* Top-right corner */}
      <g className="rect-demo-zone">
        <rect
          id="handle-tr"
          transform={translate(x + w - CORNER_SIZE / 2, y - CORNER_SIZE / 2)}
          width={CORNER_SIZE}
          height={CORNER_SIZE}
          fill="transparent"
          style={{ cursor: "nesw-resize" }}
          dragology={() =>
            d.vary(state, [["y"], ["w"], ["h"]], {
              pin: (s) => s.y + s.h,
              constraint: bigEnough,
            })
          }
        />
        <circle
          className="rect-demo-vis"
          transform={translate(x + w, y)}
          r={4}
          fill="#1d4ed8"
        />
      </g>

      {/* Bottom-left corner */}
      <g className="rect-demo-zone">
        <rect
          id="handle-bl"
          transform={translate(x - CORNER_SIZE / 2, y + h - CORNER_SIZE / 2)}
          width={CORNER_SIZE}
          height={CORNER_SIZE}
          fill="transparent"
          style={{ cursor: "nesw-resize" }}
          dragology={() =>
            d.vary(state, [["x"], ["w"], ["h"]], {
              pin: (s) => s.x + s.w,
              constraint: bigEnough,
            })
          }
        />
        <circle
          className="rect-demo-vis"
          transform={translate(x, y + h)}
          r={4}
          fill="#1d4ed8"
        />
      </g>

      {/* Bottom-right corner — resize width & height */}
      <g className="rect-demo-zone">
        <rect
          id="handle-br"
          transform={translate(
            x + w - CORNER_SIZE / 2,
            y + h - CORNER_SIZE / 2,
          )}
          width={CORNER_SIZE}
          height={CORNER_SIZE}
          fill="transparent"
          style={{ cursor: "nwse-resize" }}
          dragology={() =>
            d.vary(state, [["w"], ["h"]], {
              constraint: bigEnough,
            })
          }
        />
        <circle
          className="rect-demo-vis"
          transform={translate(x + w, y + h)}
          r={4}
          fill="#1d4ed8"
        />
      </g>
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={400}
      height={300}
    />
  ),
  { tags: ["d.vary [w/constraint] [w/pin]"] },
);
