import { useState } from "react";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

const SQ = 56;
const W = SQ * 8;
const INFO_H = 44;
const H = SQ * 8 + INFO_H;

type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
type Color = "w" | "b";
type Piece = { type: PieceType; color: Color; row: number; col: number };
type BoardSnapshot = { pieces: Record<string, Piece>; turn: Color };
type State = BoardSnapshot & { history: BoardSnapshot[] };

const SYMBOLS: Record<Color, Record<PieceType, string>> = {
  w: {
    K: "♔\uFE0E",
    Q: "♕\uFE0E",
    R: "♖\uFE0E",
    B: "♗\uFE0E",
    N: "♘\uFE0E",
    P: "♙\uFE0E",
  },
  b: {
    K: "♚\uFE0E",
    Q: "♛\uFE0E",
    R: "♜\uFE0E",
    B: "♝\uFE0E",
    N: "♞\uFE0E",
    P: "♟\uFE0E",
  },
};

function renderPiece(type: PieceType, color: Color) {
  return (
    <g>
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={SQ * 0.75}
        fill="#1a1a1a"
        style={{
          userSelect: "none",
        }}
      >
        {SYMBOLS[color][type]}
      </text>
    </g>
  );
}

function makeInitialState(): State {
  const pieces: Record<string, Piece> = {};
  let id = 0;
  const add = (type: PieceType, color: Color, row: number, col: number) => {
    pieces[`p${id++}`] = { type, color, row, col };
  };
  const back: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    add(back[c], "b", 0, c);
    add("P", "b", 1, c);
    add("P", "w", 6, c);
    add(back[c], "w", 7, c);
  }
  return { pieces, turn: "w", history: [] };
}

const PIECE_TYPES = new Set<string>(["K", "Q", "R", "B", "N", "P"]);

function parseFEN(fen: string): State | null {
  try {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const rows = parts[0].split("/");
    if (rows.length !== 8) return null;
    const turn: Color = parts[1] === "b" ? "b" : "w";
    const pieces: Record<string, Piece> = {};
    let id = 0;
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          c += parseInt(ch);
        } else {
          const color: Color = ch === ch.toUpperCase() ? "w" : "b";
          const type = ch.toUpperCase();
          if (PIECE_TYPES.has(type)) {
            pieces[`p${id++}`] = {
              type: type as PieceType,
              color,
              row: r,
              col: c,
            };
          }
          c++;
        }
      }
    }
    return { pieces, turn, history: [] };
  } catch {
    return null;
  }
}

// Raw move targets — no check filtering
function getRawTargets(
  pieces: Record<string, Piece>,
  key: string,
): Array<[number, number]> {
  const piece = pieces[key];
  const occ = new Map<string, Color>();
  for (const p of Object.values(pieces)) occ.set(`${p.row},${p.col}`, p.color);
  const opp: Color = piece.color === "w" ? "b" : "w";
  const ok = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const free = (r: number, c: number) => !occ.has(`${r},${c}`);
  const enemy = (r: number, c: number) => occ.get(`${r},${c}`) === opp;
  const targets: Array<[number, number]> = [];

  const slide = (dirs: [number, number][], max = 8) => {
    for (const [dr, dc] of dirs) {
      for (let s = 1; s <= max; s++) {
        const r = piece.row + dr * s,
          c = piece.col + dc * s;
        if (!ok(r, c)) break;
        if (!free(r, c)) {
          if (enemy(r, c)) targets.push([r, c]);
          break;
        }
        targets.push([r, c]);
      }
    }
  };

  if (piece.type === "P") {
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    const r1 = piece.row + dir;
    if (ok(r1, piece.col) && free(r1, piece.col)) {
      targets.push([r1, piece.col]);
      if (piece.row === startRow && free(piece.row + 2 * dir, piece.col))
        targets.push([piece.row + 2 * dir, piece.col]);
    }
    for (const dc of [-1, 1] as const)
      if (ok(r1, piece.col + dc) && enemy(r1, piece.col + dc))
        targets.push([r1, piece.col + dc]);
  } else if (piece.type === "N") {
    for (const [dr, dc] of [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ] as [number, number][]) {
      const r = piece.row + dr,
        c = piece.col + dc;
      if (ok(r, c) && (free(r, c) || enemy(r, c))) targets.push([r, c]);
    }
  } else if (piece.type === "B") {
    slide([
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]);
  } else if (piece.type === "R") {
    slide([
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]);
  } else if (piece.type === "Q") {
    slide([
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]);
  } else if (piece.type === "K") {
    slide(
      [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ],
      1,
    );
  }
  return targets;
}

function applyPiecesMove(
  pieces: Record<string, Piece>,
  key: string,
  row: number,
  col: number,
): Record<string, Piece> {
  const piece = pieces[key];
  const next = Object.fromEntries(
    Object.entries(pieces).filter(
      ([k, p]) => k === key || !(p.row === row && p.col === col),
    ),
  ) as Record<string, Piece>;
  let moved: Piece = { ...piece, row, col };
  if (moved.type === "P" && (row === 0 || row === 7))
    moved = { ...moved, type: "Q" };
  next[key] = moved;
  return next;
}

function isInCheck(pieces: Record<string, Piece>, color: Color): boolean {
  const king = Object.values(pieces).find(
    (p) => p.type === "K" && p.color === color,
  );
  if (!king) return false; // no king in position (custom FEN) — not in check
  const opp = color === "w" ? "b" : "w";
  return Object.keys(pieces)
    .filter((k) => pieces[k].color === opp)
    .some((k) =>
      getRawTargets(pieces, k).some(
        ([r, c]) => r === king.row && c === king.col,
      ),
    );
}

function getLegalTargets(
  pieces: Record<string, Piece>,
  key: string,
): Array<[number, number]> {
  const piece = pieces[key];
  return getRawTargets(pieces, key).filter(
    ([r, c]) => !isInCheck(applyPiecesMove(pieces, key, r, c), piece.color),
  );
}

function applyMove(state: State, key: string, row: number, col: number): State {
  return {
    pieces: applyPiecesMove(state.pieces, key, row, col),
    turn: state.turn === "w" ? "b" : "w",
    history: [...state.history, { pieces: state.pieces, turn: state.turn }],
  };
}

type GameStatus = "playing" | "check" | "checkmate" | "stalemate";

function getGameStatus(state: State): GameStatus {
  const inCheck = isInCheck(state.pieces, state.turn);
  const hasAnyLegal = Object.keys(state.pieces)
    .filter((k) => state.pieces[k].color === state.turn)
    .some((k) => getLegalTargets(state.pieces, k).length > 0);
  if (!hasAnyLegal) return inCheck ? "checkmate" : "stalemate";
  return inCheck ? "check" : "playing";
}

function computeFEN(state: State): string {
  const grid = new Map<string, Piece>();
  for (const p of Object.values(state.pieces)) grid.set(`${p.row},${p.col}`, p);
  let pos = "";
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = grid.get(`${r},${c}`);
      if (p) {
        if (empty > 0) {
          pos += empty;
          empty = 0;
        }
        pos += p.color === "w" ? p.type : p.type.toLowerCase();
      } else empty++;
    }
    if (empty > 0) pos += empty;
    if (r < 7) pos += "/";
  }
  return `${pos} ${state.turn} - - 0 1`;
}

const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const boardY = SQ * 8;

const draggable: Draggable<State> = ({
  state,
  d,
  setState,
  draggedId,
  isTracking,
}) => {
  const canUndo = state.history.length > 0;
  const status = isTracking ? "playing" : getGameStatus(state);
  const gameOver = status === "checkmate" || status === "stalemate";

  const checkedKing =
    status === "check" || status === "checkmate"
      ? Object.values(state.pieces).find(
          (p) => p.type === "K" && p.color === state.turn,
        )
      : null;

  const draggedKey = draggedId?.startsWith("piece-")
    ? draggedId.slice(6)
    : null;
  // Only show hints in the pre-move state. In target states the turn has
  // flipped, so the dragged piece's color no longer matches state.turn.
  const showHints =
    !isTracking &&
    draggedKey != null &&
    state.pieces[draggedKey]?.color === state.turn;
  const hintTargets = showHints
    ? getLegalTargets(state.pieces, draggedKey)
    : [];
  const occupiedAt = new Map(
    Object.values(state.pieces).map((p) => [`${p.row},${p.col}`, p]),
  );

  const handleUndo = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!canUndo) return;
    const prev = state.history[state.history.length - 1];
    setState({ ...prev, history: state.history.slice(0, -1) });
  };

  return (
    <g>
      {/* Board squares — 64 fixed children, no ids */}
      {Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8),
          c = i % 8;
        return (
          <rect
            x={c * SQ}
            y={r * SQ}
            width={SQ}
            height={SQ}
            fill={(r + c) % 2 === 0 ? LIGHT : DARK}
          />
        );
      })}

      {/* Info bar — always 1 fixed child */}
      {!isTracking && (
        <g>
          <rect x={0} y={boardY} width={W} height={INFO_H} fill="#f9f5ec" />
          <text
            x={10}
            y={boardY + 17}
            fontSize={12}
            fontFamily="sans-serif"
            fill="#555"
          >
            {status === "checkmate"
              ? `Checkmate — ${state.turn === "w" ? "Black" : "White"} wins!`
              : status === "stalemate"
                ? "Stalemate — draw!"
                : status === "check"
                  ? `${state.turn === "w" ? "White" : "Black"} is in check`
                  : state.turn === "w"
                    ? "White to move"
                    : "Black to move"}
          </text>
          <text
            x={10}
            y={boardY + 35}
            fontSize={9.5}
            fontFamily="monospace"
            fill="#888"
          >
            {computeFEN(state)}
          </text>
          <g onPointerDown={handleUndo} opacity={canUndo ? 1 : 0.3}>
            <rect
              x={W - 70}
              y={boardY + 8}
              width={62}
              height={28}
              rx={4}
              fill={canUndo ? "#d8d0c0" : "#e8e4dc"}
            />
            <text
              x={W - 39}
              y={boardY + 26}
              textAnchor="middle"
              fontSize={12}
              fontFamily="sans-serif"
              fill="#444"
            >
              Undo
            </text>
          </g>
        </g>
      )}

      {/* Game-over overlay — covers the full SVG */}
      {!isTracking && gameOver && (
        <g id="game-over-overlay" data-z-index={2}>
          <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.55)" />
          <text
            x={W / 2}
            y={H / 2 - 16}
            textAnchor="middle"
            fontSize={36}
            fontWeight="bold"
            fontFamily="Georgia, serif"
            fill="white"
          >
            {status === "checkmate"
              ? `${state.turn === "w" ? "Black" : "White"} wins!`
              : "Draw"}
          </text>
          <text
            x={W / 2}
            y={H / 2 + 20}
            textAnchor="middle"
            fontSize={16}
            fontFamily="sans-serif"
            fill="rgba(255,255,255,0.75)"
          >
            {status === "checkmate" ? "Checkmate" : "Stalemate"}
          </text>
        </g>
      )}

      {/* Check highlight — id lets lerpLayered fade it in/out smoothly */}
      {checkedKing && (
        <rect
          id="check-highlight"
          x={checkedKing.col * SQ}
          y={checkedKing.row * SQ}
          width={SQ}
          height={SQ}
          fill="rgba(200,40,40,0.35)"
          data-z-index={0}
        />
      )}

      {/* Drop hints — ids let lerpLayered handle variable counts between lerped states */}
      {hintTargets.map(([r, c]) => {
        const isCapture = occupiedAt.has(`${r},${c}`);
        return isCapture ? (
          <circle
            id={`hint-${r}-${c}`}
            cx={(c + 0.5) * SQ}
            cy={(r + 0.5) * SQ}
            r={SQ * 0.41}
            fill="none"
            stroke="rgba(180,60,60,0.7)"
            strokeWidth={4}
            data-z-index={0}
          />
        ) : (
          <circle
            id={`hint-${r}-${c}`}
            cx={(c + 0.5) * SQ}
            cy={(r + 0.5) * SQ}
            r={SQ * 0.18}
            fill="rgba(80,80,80,0.35)"
            data-z-index={0}
          />
        );
      })}

      {/* Pieces — only the <g> gets an id; children must not */}
      {Object.entries(state.pieces).map(([key, piece]) => {
        const canDrag = !gameOver && piece.color === state.turn;
        return (
          <g
            id={`piece-${key}`}
            transform={translate(
              (piece.col + 0.5) * SQ,
              (piece.row + 0.5) * SQ,
            )}
            data-z-index={1}
            dragology={
              canDrag
                ? () => {
                    const targets = getLegalTargets(state.pieces, key);
                    return d.between([
                      state,
                      ...targets.map(([r, c]) => applyMove(state, key, r, c)),
                    ]);
                  }
                : undefined
            }
          >
            {renderPiece(piece.type, piece.color)}
          </g>
        );
      })}
    </g>
  );
};

const Chess = () => {
  const [fenInput, setFenInput] = useState("");
  const [startState, setStartState] = useState<State>(makeInitialState);
  const [resetKey, setResetKey] = useState(0);
  const [fenError, setFenError] = useState(false);

  const reset = (state: State) => {
    setStartState(state);
    setResetKey((k) => k + 1);
    setFenError(false);
  };

  const applyFen = () => {
    if (fenInput.trim() === "") {
      reset(makeInitialState());
      return;
    }
    const parsed = parseFEN(fenInput);
    if (parsed) {
      reset(parsed);
    } else {
      setFenError(true);
    }
  };

  return (
    <div className="flex flex-col gap-2 items-start">
      <DemoNotes>
        Includes check detection, checkmate, and stalemate.
        No castling or en passant. Pawn promotion auto-promotes to queen.
      </DemoNotes>
      <DemoDraggable
        key={resetKey}
        draggable={draggable}
        initialState={startState}
        width={W}
        height={H}
      />
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Paste FEN to set position…"
          value={fenInput}
          onChange={(e) => {
            setFenInput(e.target.value);
            setFenError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && applyFen()}
          className={`px-2 py-1 border rounded font-mono text-sm w-96 ${fenError ? "border-red-400" : "border-gray-300"}`}
        />
        <button
          onClick={applyFen}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
        >
          Set position
        </button>
        <button
          onClick={() => reset(makeInitialState())}
          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
        >
          Reset
        </button>
        {fenError && <span className="text-red-500 text-sm">Invalid FEN</span>}
      </div>
    </div>
  );
};

export default demo(() => <Chess />, { tags: ["d.between", "chess"] });
