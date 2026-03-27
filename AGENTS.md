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

## 2. Using Dragology (Building Draggables, Demos, etc.)

See [AGENTS-DRAGOLOGY.md](AGENTS-DRAGOLOGY.md) for the full guide on using the library: drag specs, composing behaviors, demos, gotchas, and examples.
