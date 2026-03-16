// Public API entry point for the draggable-diagrams library.

// Augment React's SVGAttributes with the `dragology` prop.
import "./jsx.d";

// Core component
export { DraggableRenderer } from "./DraggableRenderer";
export type {
  DragStatus,
  DraggableRendererBaseProps,
  DraggableRendererProps,
} from "./DraggableRenderer";

// Draggable type & helpers
export type { Draggable, DraggableProps, SetState } from "./draggable";

// DragSpec & builder
export { and, inOrder, lessThan, moreThan, param } from "./DragSpec";
export type {
  DragSpec,
  DragSpecBuilder,
  DragSpecMethods,
  FloatingOptions,
  VaryOptions,
} from "./DragSpec";

// Transitions
export type { Transition, TransitionLike } from "./transition";

// SVG helpers
export type { Svgx } from "./svgx";
export { path, rotateDeg, rotateRad, scale, translate } from "./svgx/helpers";

// Math
export { Vec2 } from "./math/vec2";
export type { Vec2able } from "./math/vec2";

// Amb (nondeterministic computation)
export { amb, fail, produceAmb, require, runAmb } from "./amb";

// Paths (for vary, substate, etc.)
export type { PathIn } from "./paths";

// Utility types
export type { Many } from "./utils";
