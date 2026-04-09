import { produce } from "immer";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { translate } from "../svgx/helpers";
import { shantellSans } from "./shantell-sans";

const NOTE_W = 180;
const NOTE_H = 180;

const COLORS = {
  yellow: "rgb(252, 225, 156)",
  green: "rgb(152, 208, 138)",
  orange: "rgb(250, 164, 117)",
  blue: "rgb(155, 196, 253)",
};

type StickyNote = {
  id: string;
  x: number;
  y: number;
  destX: number;
  destY: number;
  content: string;
  color: keyof typeof COLORS;
};

type State = {
  notes: StickyNote[];
  showLinks: boolean;
};

export const initialState: State = {
  showLinks: false,
  notes: [
    {
      id: "note-1",
      x: 0 * 140,
      y: 600,
      destX: 24.50033207750538,
      destY: 155.0012219869991,
      content: "<div><strong>DnD is hard and often avoided</strong></div>",
      color: "yellow",
    },
    {
      id: "note-2",
      x: 1 * 140,
      y: 600,
      destX: 267.500300153848,
      destY: 43.75230243763769,
      content:
        "<div><strong>Ease of Use:</strong><br/>Concise code, less math</div>",
      color: "green",
    },
    {
      id: "note-3",
      x: 2 * 140,
      y: 600,
      destX: 172.0005107664613,
      destY: 343.7492288320923,
      content:
        "<div><strong>Quality:</strong><br/>Polished out of the box</div>",
      color: "green",
    },
    {
      id: "note-4",
      x: 3 * 140,
      y: 600,
      destX: 519.9999849792182,
      destY: 112.74936668633617,
      content:
        "<div><strong>Exploration:</strong><br/>Play and discovery</div>",
      color: "green",
    },
    {
      id: "note-5",
      x: 4 * 140,
      y: 600,
      destX: 379.75091011268046,
      destY: 274.0010067065286,
      content:
        "<div><strong>Learnability:</strong><br/>State space stresses</div>",
      color: "orange",
    },
    {
      id: "note-6",
      x: 5 * 140,
      y: 600,
      destX: 747.249760788392,
      destY: 129.99879331075806,
      content:
        "<div><strong>A niche:</strong><br/>Animating abstractions</div>",
      color: "blue",
    },
    {
      id: "note-7",
      x: 6 * 140,
      y: 600,
      destX: 654.9988199609638,
      destY: 332.5000642190833,
      content: "<div><strong>Dragology as language or paradigm</strong></div>",
      color: "blue",
    },
  ],
};

function enforceSequential(
  state: State,
  draggedIdx: number,
  linkLengths: number[],
): State {
  const notes = state.notes.map((n) => ({ ...n }));

  // Walk left from dragged note
  for (let i = draggedIdx - 1; i >= 0; i--) {
    const anchor = Vec2(
      notes[i + 1].x + NOTE_W / 2,
      notes[i + 1].y + NOTE_H / 2,
    );
    const current = Vec2(notes[i].x + NOTE_W / 2, notes[i].y + NOTE_H / 2);
    const dir = current.sub(anchor);
    const dist = dir.len();
    const len = linkLengths[i]; // linkLengths[i] = distance between note i and note i+1
    let target: { x: number; y: number };
    if (dist < 0.001) {
      target = { x: anchor.x - len, y: anchor.y };
    } else {
      target = anchor.add(dir.mul(len / dist));
    }
    notes[i] = {
      ...notes[i],
      x: target.x - NOTE_W / 2,
      y: target.y - NOTE_H / 2,
    };
  }

  // Walk right from dragged note
  for (let i = draggedIdx + 1; i < notes.length; i++) {
    const anchor = Vec2(
      notes[i - 1].x + NOTE_W / 2,
      notes[i - 1].y + NOTE_H / 2,
    );
    const current = Vec2(notes[i].x + NOTE_W / 2, notes[i].y + NOTE_H / 2);
    const dir = current.sub(anchor);
    const dist = dir.len();
    const len = linkLengths[i - 1];
    let target: { x: number; y: number };
    if (dist < 0.001) {
      target = { x: anchor.x + len, y: anchor.y };
    } else {
      target = anchor.add(dir.mul(len / dist));
    }
    notes[i] = {
      ...notes[i],
      x: target.x - NOTE_W / 2,
      y: target.y - NOTE_H / 2,
    };
  }

  return { ...state, notes };
}

function computeLinkLengths(notes: StickyNote[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < notes.length - 1; i++) {
    const a = Vec2(notes[i].x + NOTE_W / 2, notes[i].y + NOTE_H / 2);
    const b = Vec2(notes[i + 1].x + NOTE_W / 2, notes[i + 1].y + NOTE_H / 2);
    lengths.push(a.sub(b).len());
  }
  return lengths;
}

export const draggable: Draggable<State> = ({
  state,
  d,
  draggedId,
  setState,
}) => (
  <g>
    {state.showLinks && (
      <g id="links" dragologyZIndex={-1}>
        {state.notes.map((note, i) => {
          if (i === 0) return null;
          const prev = state.notes[i - 1];
          return (
            <line
              id={`link-${i}`}
              x1={prev.x + NOTE_W / 2}
              y1={prev.y + NOTE_H / 2}
              x2={note.x + NOTE_W / 2}
              y2={note.y + NOTE_H / 2}
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          );
        })}
      </g>
    )}
    {state.notes.map((note) =>
      draggedId === note.id ? (
        <g id={`${note.id}-ticks`} dragologyZIndex={-1}>
          <line
            x1={note.destX + NOTE_W / 2}
            y1={-16}
            x2={note.destX + NOTE_W / 2}
            y2={0}
            stroke={COLORS[note.color]}
            strokeWidth={3}
          />
          <line
            x1={note.destX + NOTE_W / 2}
            y1={540}
            x2={note.destX + NOTE_W / 2}
            y2={540 + 16}
            stroke={COLORS[note.color]}
            strokeWidth={3}
          />
          <line
            x1={-16}
            y1={note.destY + NOTE_H / 2}
            x2={0}
            y2={note.destY + NOTE_H / 2}
            stroke={COLORS[note.color]}
            strokeWidth={3}
          />
          <line
            x1={960}
            y1={note.destY + NOTE_H / 2}
            x2={960 + 16}
            y2={note.destY + NOTE_H / 2}
            stroke={COLORS[note.color]}
            strokeWidth={3}
          />
          {/* current position ticks */}
          <line
            x1={note.x + NOTE_W / 2}
            y1={-16}
            x2={note.x + NOTE_W / 2}
            y2={0}
            stroke="#94a3b8"
            strokeWidth={2}
          />
          <line
            x1={note.x + NOTE_W / 2}
            y1={540}
            x2={note.x + NOTE_W / 2}
            y2={540 + 16}
            stroke="#94a3b8"
            strokeWidth={2}
          />
          <line
            x1={-16}
            y1={note.y + NOTE_H / 2}
            x2={0}
            y2={note.y + NOTE_H / 2}
            stroke="#94a3b8"
            strokeWidth={2}
          />
          <line
            x1={960}
            y1={note.y + NOTE_H / 2}
            x2={960 + 16}
            y2={note.y + NOTE_H / 2}
            stroke="#94a3b8"
            strokeWidth={2}
          />
        </g>
      ) : null,
    )}
    {state.notes.map((note, i) => (
      <g
        id={note.id}
        transform={translate(note.x, note.y)}
        dragologyZIndex={draggedId === note.id ? "/1" : false}
        dragologyOnDrag={() => {
          const spec = d.vary(state, [
            param("notes", i, "x"),
            param("notes", i, "y"),
          ]);
          if (state.showLinks) {
            const linkLengths = computeLinkLengths(state.notes);
            const W = 960;
            return spec
              .during((s) => enforceSequential(s, i, linkLengths))
              .withChaining({ transition: false })
              .changeFrame(({ pointer }) =>
                pointer.x > W
                  ? {
                      pointer: Vec2(W + (pointer.x - W) * 5, pointer.y),
                    }
                  : {},
              );
          }
          const snappedState = produce(state, (draft) => {
            draft.notes[i] = {
              ...draft.notes[i],
              x: note.destX,
              y: note.destY,
            };
          });

          // return spec.withDropTransition(100);

          return d
            .fixed(snappedState)
            .whenFar(spec, { gap: 25 })
            .withBranchTransition(400)
            .withDropTransition(100);
        }}
      >
        <rect
          width={NOTE_W}
          height={NOTE_H}
          fill={COLORS[note.color]}
          style={{
            filter:
              draggedId === note.id
                ? "drop-shadow(0 4px 6px rgba(0,0,0,0.4))"
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
        />
        <foreignObject width={NOTE_W} height={NOTE_H}>
          <div
            style={{
              width: NOTE_W,
              height: NOTE_H,
              padding: 8,
              fontSize: 22,
              fontWeight: 600,
              fontFamily: `${shantellSans}, system-ui, sans-serif`,
              color: "#374151",
              overflow: "hidden",
              boxSizing: "border-box",
              pointerEvents: "none",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        </foreignObject>
      </g>
    ))}
    <foreignObject x={880} y={10} width={70} height={30}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontFamily: "system-ui, sans-serif",
          color: "#64748b",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={state.showLinks}
          onChange={() =>
            setState((prev) => ({ ...prev, showLinks: !prev.showLinks }))
          }
        />
        chaining
      </label>
    </foreignObject>
  </g>
);
