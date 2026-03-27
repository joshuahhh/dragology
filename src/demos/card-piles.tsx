import _ from "lodash";
import { demo } from "../demo";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { translate } from "../svgx/helpers";

// --- Types ---

type Card = { dx: number; dy: number };
type Pile = { x: number; y: number; cards: Record<string, Card> };
type State = { piles: Record<string, Pile> };

// --- Constants ---

const CARD_W = 70;
const CARD_H = 100;
const CARD_RX = 6;
const PILE_PAD = 12;

// --- Helpers ---

function cardPos(pile: Pile, card: Card): { x: number; y: number } {
  return { x: pile.x + card.dx, y: pile.y + card.dy };
}

function allCards(
  state: State,
): { id: string; pileId: string; pos: { x: number; y: number } }[] {
  return Object.entries(state.piles).flatMap(([pileId, pile]) =>
    Object.entries(pile.cards).map(([id, card]) => ({
      id,
      pileId,
      pos: cardPos(pile, card),
    })),
  );
}

function cardsOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < CARD_H;
}

/** Recompute piles from scratch based on card overlap. */
function recomputePiles(state: State): State {
  const cards = allCards(state);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const c of cards) positions[c.id] = c.pos;

  // Union-Find for transitive overlap
  const ids = cards.map((c) => c.id);
  const parent: Record<string, string> = {};

  function find(x: string): string {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: string, b: string) {
    parent[find(a)] = find(b);
  }

  for (const id of ids) parent[id] = id;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (cardsOverlap(positions[ids[i]], positions[ids[j]])) {
        union(ids[i], ids[j]);
      }
    }
  }

  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const root = find(id);
    (groups[root] ??= []).push(id);
  }

  const newPiles: Record<string, Pile> = {};
  for (const members of Object.values(groups)) {
    const pileId = [...members].sort().join("-");
    const cx = _.mean(members.map((id) => positions[id].x));
    const cy = _.mean(members.map((id) => positions[id].y));
    const pileCards: Record<string, Card> = {};
    for (const id of members) {
      pileCards[id] = { dx: positions[id].x - cx, dy: positions[id].y - cy };
    }
    newPiles[pileId] = { x: cx, y: cy, cards: pileCards };
  }

  return { piles: newPiles };
}

function pileBounds(pile: Pile) {
  const positions = Object.values(pile.cards).map((c) => cardPos(pile, c));
  const minX = _.min(positions.map((p) => p.x))! - PILE_PAD;
  const minY = _.min(positions.map((p) => p.y))! - PILE_PAD;
  const maxX = _.max(positions.map((p) => p.x + CARD_W))! + PILE_PAD;
  const maxY = _.max(positions.map((p) => p.y + CARD_H))! + PILE_PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// --- Initial state ---

function makeInitialState(
  cards: Record<string, { x: number; y: number }>,
): State {
  return recomputePiles({
    piles: _.mapValues(cards, (pos, id) => ({
      x: pos.x,
      y: pos.y,
      cards: { [id]: { dx: 0, dy: 0 } },
    })),
  });
}

const initialState = makeInitialState({
  a: { x: 120, y: 120 },
  b: { x: 165, y: 150 },
  c: { x: 320, y: 110 },
  d: { x: 360, y: 140 },
  e: { x: 220, y: 300 },
  f: { x: 400, y: 300 },
});

// --- Draggable ---

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  return (
    <g>
      {/* Pile backgrounds (only for piles with 2+ cards) */}
      {Object.entries(state.piles)
        .filter(([, pile]) => Object.keys(pile.cards).length > 1)
        .map(([pileId, pile]) => {
          const bounds = pileBounds(pile);
          const isDragged = draggedId === `pile-${pileId}`;

          return (
            <rect
              id={`pile-${pileId}`}
              transform={translate(bounds)}
              width={bounds.w}
              height={bounds.h}
              rx={12}
              fill="#d1d5db"
              opacity={isDragged ? 0.7 : 0.4}
              dragologyZIndex={0}
              dragologyOnDrag={() =>
                d
                  .vary(state, [
                    param("piles", pileId, "x"),
                    param("piles", pileId, "y"),
                  ])
                  .during(recomputePiles)
              }
            />
          );
        })}

      {/* Cards */}
      {Object.entries(state.piles).flatMap(([pileId, pile]) =>
        Object.entries(pile.cards).map(([cardId, card]) => {
          const pos = cardPos(pile, card);
          const isDragged = draggedId === `card-${cardId}`;
          return (
            <rect
              id={`card-${cardId}`}
              transform={translate(pos)}
              width={CARD_W}
              height={CARD_H}
              rx={CARD_RX}
              fill="white"
              stroke="#9ca3af"
              strokeWidth={1.5}
              dragologyZIndex={isDragged ? 2 : 1}
              dragologyOnDrag={() =>
                d
                  .vary(state, [
                    param("piles", pileId, "cards", cardId, "dx"),
                    param("piles", pileId, "cards", cardId, "dy"),
                  ])
                  .during(recomputePiles)
              }
            />
          );
        }),
      )}
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        Drag cards to move them. Overlapping cards form piles. Drag the grey
        background to move a whole pile.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={500}
        height={400}
      />
    </>
  ),
  { tags: ["d.vary", "spec.during"] },
);
