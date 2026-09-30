# Working in the Dragology repo

This repo is the Dragology library (public API: `src/lib.ts`) plus a site of demos built with it.

**How to use the library** (the `Draggable` model, drag specs, ids and layers, gotchas) is in [docs/AGENTS.md](docs/AGENTS.md), which also ships in the npm package. It's imported at the end of this file; follow it when writing or changing a demo, or anything else that renders through a `Draggable`.

## Commands

| What | Command |
|---|---|
| Typecheck | `pnpm typecheck` |
| Unit tests (plus type tests in `*.test-d.ts`) | `pnpm test` |
| Lint | `pnpm lint` |
| All three | `pnpm check` |
| Format `src` | `pnpm prettier` |
| Fuzz every demo (takes minutes) | `pnpm fuzz` |
| Fuzz one demo | `pnpm fuzz -t "^fuzz <demo-id>$"` |
| Benchmarks | `pnpm bench` |
| Build the library | `pnpm build:lib` |

Use the `package.json` scripts; don't improvise your own versions of them. `tsc --noEmit` is wrong!

## Layout

- `src/lib.ts`: everything the library exports.
- `src/DragSpec.tsx`: drag spec data and the `d.*` builder. `src/DragBehavior.tsx`: what each spec type does during a drag. `src/DraggableRenderer.tsx`: the React component (pointer handling, animation). `src/svgx/`: SVG tree utilities (layers, interpolation, transforms, bounds).
- `src/demos/`: one demo per file (or per folder with an `index.tsx`). A demo's id is its path with `/` turned into `-`, e.g. `animate-algebra/tree-macro.tsx` → `animate-algebra-tree-macro`. `src/demo/list.ts` orders the demos page.
- `src/demo/`: demo infrastructure (`demo()`, `DemoDraggable`, config panels).
- `src/study/`: the study pages. `src/studio/`: the studio sections.
- `src/fuzz/`: the fuzzer.

## Demos

- A demo file default-exports `demo(Component, options)`. Add its id to `src/demo/list.ts` to show it on the demos page.
- Mount draggables with `DemoDraggable`. That's how `src/demo/demos.test.tsx` (which mounts every demo) and the fuzzer find them.
- The fuzzer starts from whatever `DemoDraggable` is mounted with by default. If a demo's interesting states are only reachable some other way (a config panel, another tab, a held modifier key), give it `fuzz` targets in its `demo()` options. `fuzz: false` opts out.

## Library code

- No `className` (Tailwind) in library code, so that consumers don't need Tailwind; use inline styles. Lint enforces this. Demos, studio and study pages may use Tailwind.
- Comment intelligently -- don't just use comments to explain changes you made to the user.

## Using the library

@docs/AGENTS.md
