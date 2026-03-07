# Claude Code Workspace Guide

## Rules

- NEVER say "Perfect!" or similar overly enthusiastic confirmations.
- NEVER use `any` as a lazy workaround for type errors. Only use `any` when truly called for. Ask first.
- NEVER run `npm run dev`. The user will start the dev server when needed.
- NEVER mention Claude in commit messages.

## 1. Working on the Library Codebase

### Development

```bash
npm install       # Install dependencies
npm test          # Run tests
npm run build     # Build
npm run typecheck # Type check
```

### Key Files

| File | Purpose |
|---|---|
| `src/draggable.tsx` | `Draggable<T>` type, `Drag`, `SetState`, `DragologyPropValue` |
| `src/DraggableRenderer.tsx` | Low-level component that runs a `Draggable` with drag handling, spring animation |
| `src/DragSpec.tsx` | `DragSpec<T>` union type + constructors (`between`, `fixed`, `floating`, `closest`, `vary`, `onDrop`, `withSnapRadius`, etc.) |
| `src/demo/ui.tsx` | `DemoDraggable` (wraps `DraggableRenderer` with debug UI), `DemoSettingsProvider`, `DemoSettingsBar`, `ConfigPanel`, `ConfigCheckbox`, `ConfigSelect`, `DemoNotes` |
| `src/demo/registry.tsx` | Demo registry — auto-discovers demos via `import.meta.glob` |
| `src/demo/list.ts` | Ordered list of demo IDs for the gallery |
| `src/demos/` | Individual demo implementations |
| `src/demo/DemoPage.tsx` | Gallery page showing all demos |
| `src/demo/SingleDemoPage.tsx` | Single demo page |
| `src/docs/LiveEditor.tsx` | Interactive code editor for docs (evaluates user code that exports `draggable` + `initialState`) |
| `src/svgx/` | SVG representation (`Svgx`, `LayeredSvgx`), transforms, interpolation |

### Architecture

```
Draggable<T>  (render function: state → SVG)
     ↓
DraggableRenderer  (low-level: drag state machine, spring animation, pointer handling)
     ↓
DemoDraggable  (wraps with debug overlays, spec tree, state viewer)
```

DragSpec data flow:
```
DragSpec (plain data) → dragSpecToBehavior() → DragBehavior (frame → DragResult) → DraggableRenderer renders result
```

### SVG Representation

- `Svgx` = `React.ReactElement<React.SVGProps<SVGElement>>`
- `LayeredSvgx` = `{ byId: Map<string, Svgx>, descendents: ... }` — elements with `id` get pulled to top-level
- Root goes in with key `""`

## 2. Making Draggables

### Structure

Each demo in `src/demos/` is a file (or subfolder with `index.tsx`) that default-exports via `demo()`. Demos are auto-discovered by `src/demo/registry.tsx` and ordered by `src/demo/list.ts`.

A draggable definition has four parts:

```typescript
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";

// 1. State type (must be an object)
type State = { value: boolean };

// 2. Initial state
const initialState: State = { value: false };

// 3. Draggable render function
const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    <rect
      id="my-element"
      dragology={() => d.between([{ value: true }, { value: false }])}
    />
  </g>
);

// 4. Default export via demo()
export default demo(() => (
  <DemoDraggable
    draggable={draggable}
    initialState={initialState}
    width={400}
    height={300}
  />
));
```

### Drag Spec Constructors

| Function | Use |
|---|---|
| `between([state1, state2, ...])` | Drag between discrete states (interpolated) |
| `fixed(state)` | Always resolve to this state |
| `vary(state, [["x"], ["y"]])` | Continuous numeric variation along paths |
| `floating(states, { backdrop })` | Float between states with a backdrop |
| `closest([spec1, spec2])` | Pick whichever spec is closest |
| `onDrop(spec, nextState)` | Override the drop state. `nextState` can be a `T` or `(previewState: T) => T` |
| `during(fn)` | Like `onDrop(fn)` but re-renders the transformed state live during drag |
| `withSnapRadius(spec, radius)` | Snap within radius |
| `withDropTransition(spec, easing)` | Custom transition on drop |

### How `vary` works

`vary` uses **numerical optimization**: it varies the specified params to minimize distance between the dragged element's rendered position and the pointer. Key implications:

- **Deep paths work**: `d.vary(state, ["nodes", key, "x"], ["nodes", key, "y"])` for `Record`-based state (see `src/demos/graph.tsx`)
- **The library tracks all SVG transforms**, including `rotate`. An element inside a `rotateDeg(angle)` group *does* change rendered position when `angle` changes — the library resolves the full transform chain. So you can put `dragology` with `d.vary` directly on elements inside rotated groups; no extra handle elements are needed.
- **Only params that affect the dragged element's rendered position will have an optimization effect.** If varying a param doesn't change where the dragged element renders, the optimizer ignores it. This means you can't naively vary N items' positions to move them as a group — only the extreme items (affecting the bounding box) would move.
- **For group movement**, vary a shared position (e.g. a pile's x/y) that all members offset from, rather than varying each member independently (see `src/demos/card-piles.tsx`)
- The `state` arg to `vary` is the starting state for optimization (not necessarily the current rendered state). The initial param values are used as the optimizer's starting point.
- **`during(fn)`** re-renders the transformed state each frame — use it when `vary` produces intermediate states that need cleanup (e.g. recomputing group membership as you drag). See `card-piles.tsx`.
- **`onDrop(fn)`** accepts a function `(previewState: T) => T` to compute the drop state dynamically at drop time, not just a fixed state.

### Reference demos for common patterns

| Pattern | Demo file | Key technique |
|---|---|---|
| Free-form 2D dragging | `src/demos/graph.tsx` | `d.vary(state, ["nodes", key, "x"], ["nodes", key, "y"])` |
| Drag-to-copy | `src/demos/drag-to-copy.tsx` | `d.switchToStateAndFollow` + `setState` for delete |
| Permutation / reorder | `src/demos/perm.tsx` | `d.between` over all possible permutations |
| Floating with ambiguity | `src/demos/perm-floating.tsx` | `produceAmb` + `d.closest(...).withFloating()` |
| Nested structures | `src/demos/canvas-of-lists-nested.tsx` | Recursive rendering with path-based state updates |
| Group movement + `during` | `src/demos/card-piles.tsx` | Vary pile position, `during(recomputePiles)` for live regrouping |

### Gotchas

- **Transform ordering**: SVG transforms are right-to-left. Put `translate()` first: `translate(x, y) + rotate(angle)`
- **No React keys**: Use `id` attributes for element tracking, never `key`
- **No slashes in IDs**: Use hyphens — `id="node-1-2"` not `id="node/1/2"`
- **Positioning**: Always use `transform={translate(x, y)}`, never `x`/`y` attributes directly
- **Layering**: Use `data-z-index={isDragged ? 2 : 1}` to control draw order
- **Conditional drag**: `dragology={condition && drag(...)}` to make things conditionally draggable
- **`data-transition={false}`**: Elements with this skip spring animation and track the cursor directly

### Registration

Demos are auto-discovered from `src/demos/**/*.tsx` via `import.meta.glob`. To add a new demo:

1. Create `src/demos/my-demo.tsx` (or `src/demos/my-demo/index.tsx` for a subfolder)
2. `export default demo(Component)` from the file
3. Add `"my-demo"` to the array in `src/demo/list.ts` to set its gallery position

### Config Panels

For demos with user-configurable options:

```typescript
import { ConfigCheckbox, ConfigPanel, DemoDraggable, DemoWithConfig } from "../demo/ui";

export const MyDemo = () => {
  const [showLabels, setShowLabels] = useState(true);
  const draggable = useMemo(() => makeDraggable(showLabels), [showLabels]);
  return (
    <DemoWithConfig>
      <DemoDraggable draggable={draggable} initialState={state} width={400} height={300} />
      <ConfigPanel>
        <ConfigCheckbox label="Show labels" value={showLabels} onChange={setShowLabels} />
      </ConfigPanel>
    </DemoWithConfig>
  );
};
```
