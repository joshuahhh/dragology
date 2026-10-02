import { produce } from "immer";
import _ from "lodash";
import { createContext, useContext, useState } from "react";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

const AccentContext = createContext("#3b82f6");

const ACCENTS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

type State = {
  order: string[];
};

const initialState: State = {
  order: ["alpha", "beta", "gamma", "delta"],
};

const CARD_W = 340;
const CARD_H = 64;
const GAP = 10;
const GRIP_W = 28;

function NoteWidget({ name }: { name: string }) {
  const accent = useContext(AccentContext);
  const [count, setCount] = useState(0);
  const [note, setNote] = useState("");
  const [mountedAt] = useState(() => new Date().toLocaleTimeString());

  return (
    <div className="flex flex-col gap-1 h-full justify-center pr-2 text-sm">
      <div className="flex flex-row items-center gap-2">
        <span className="font-semibold w-12" style={{ color: accent }}>
          {name}
        </span>
        <button
          className="px-2 rounded text-white"
          style={{ background: accent }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCount((c) => c + 1)}
        >
          +1
        </button>
        <span className="w-6 tabular-nums">{count}</span>
        <input
          className="border border-gray-300 rounded px-1 flex-1 min-w-0"
          value={note}
          placeholder="type a note"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="text-xs text-gray-400">mounted at {mountedAt}</div>
    </div>
  );
}

const draggable: Draggable<State> = ({ state, d, draggedId }) => (
  <g>
    {state.order.map((name, idx) => (
      <g
        id={`card-${name}`}
        transform={translate(10, 10 + idx * (CARD_H + GAP))}
        dragologyZIndex={draggedId === `card-${name}` ? "/1" : false}
        dragologyOnDrag={() => {
          const without = produce(state, (draft) => {
            draft.order.splice(idx, 1);
          });
          const orders = _.range(state.order.length).map((i) =>
            produce(without, (draft) => {
              draft.order.splice(i, 0, name);
            }),
          );
          return d.closest(orders).whenFar(state).withFloating();
        }}
      >
        <rect
          width={CARD_W}
          height={CARD_H}
          rx={8}
          fill="white"
          stroke="#d1d5db"
          style={{ cursor: "grab" }}
        />
        <text
          x={GRIP_W / 2}
          y={CARD_H / 2}
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={18}
          fill="#9ca3af"
          style={{ cursor: "grab", userSelect: "none" }}
        >
          ⠿
        </text>
        <foreignObject x={GRIP_W} y={0} width={CARD_W - GRIP_W} height={CARD_H}>
          <NoteWidget name={name} />
        </foreignObject>
      </g>
    ))}
  </g>
);

export default demo(
  () => {
    const [accent, setAccent] = useState(ACCENTS[0]);
    return (
      <div className="flex flex-col gap-2">
        <DemoNotes>
          <p>
            Each card holds a real React component,{" "}
            <code>&lt;NoteWidget&gt;</code>, with its own hooks: a counter and a
            note in <code>useState</code>, and an accent color read with{" "}
            <code>useContext</code> from outside the draggable. Dragology never
            calls component elements themselves. It mounts them once and keeps
            them mounted, so component-element state survives dragging and
            reordering the cards.
          </p>
          <p className="mt-2">
            Pointer events in the widget bubble to the card's{" "}
            <code>dragologyOnDrag</code> as usual, so you can drag a card by its
            widget. The button and the input stop propagation, so they work as
            controls instead.
          </p>
        </DemoNotes>
        <div className="flex flex-row items-center gap-2 text-sm">
          Accent (React context from outside the draggable):
          {ACCENTS.map((c) => (
            <button
              key={c}
              className="w-5 h-5 rounded-full"
              style={{
                background: c,
                outline: c === accent ? "2px solid black" : undefined,
              }}
              onClick={() => setAccent(c)}
            />
          ))}
        </div>
        <AccentContext.Provider value={accent}>
          <DemoDraggable
            draggable={draggable}
            initialState={initialState}
            width={CARD_W + 20}
            height={10 + initialState.order.length * (CARD_H + GAP)}
          />
        </AccentContext.Provider>
      </div>
    );
  },
  {
    tags: [
      "d.closest",
      "spec.whenFar",
      "spec.withFloating",
      "component elements",
      "reordering",
    ],
  },
);
