import { SVGProps } from "react";
import { PathIn } from "./paths";
import {
  Transition,
  TransitionLike,
  resolveTransitionLike,
} from "./transition";
import { Many, assert, manyToArray } from "./utils";

// # DragSpecData

export type DragSpecData<T> =
  | DragSpecFixed<T>
  | DragSpecWithFloating<T>
  | DragSpecClosest<T>
  | DragSpecWithBackground<T>
  | DragSpecAndThen<T>
  | DragSpecVary<T>
  | DragSpecWithDistance<T>
  | DragSpecWithSnapRadius<T>
  | DragSpecWithDropTransition<T>
  | DragSpecBetween<T>
  | DragSpecSwitchToStateAndFollow<T>
  | DragSpecDropTarget<T>
  | DragSpecWithBranchTransition<T>
  | DragSpecWithChaining<T>
  | DragSpecDuring<T>;

export type DragSpecFixed<T> = {
  type: "fixed";
  state: T;
};

export type FloatingOptions = {
  ghost?: SVGProps<SVGElement> | true;
  tether?: (dist: number) => number;
};

export type DragSpecWithFloating<T> = {
  type: "with-floating";
  spec: DragSpecData<T>;
  ghost: SVGProps<SVGElement> | undefined;
  tether: ((dist: number) => number) | undefined;
};

export type DragSpecClosest<T> = {
  type: "closest";
  specs: DragSpecData<T>[];
};

export type DragSpecWithBackground<T> = {
  type: "with-background";
  foreground: DragSpecData<T>;
  background: DragSpecData<T>;
  radius: number;
};

export type DragSpecWithSnapRadius<T> = {
  type: "with-snap-radius";
  spec: DragSpecData<T>;
  radius: number;
  transition: Transition | false;
  chain: boolean;
};

export type DragSpecWithDropTransition<T> = {
  type: "with-drop-transition";
  spec: DragSpecData<T>;
  transition: Transition | false;
};

export type DragSpecWithBranchTransition<T> = {
  type: "with-branch-transition";
  spec: DragSpecData<T>;
  transition: Transition | false;
};

export type DragSpecAndThen<T> = {
  type: "and-then";
  spec: DragSpecData<T>;
  andThenState: T | ((previewState: T) => T);
};

export type DragSpecVary<T> = {
  type: "vary";
  state: T;
  paramPaths: PathIn<T, number>[];
  constraint?(state: T): Many<number>;
  constrainByRender?: boolean;
};

export type DragSpecWithDistance<T> = {
  type: "with-distance";
  spec: DragSpecData<T>;
  f: (distance: number) => number;
};

export type DragSpecBetween<T> = {
  type: "between";
  states: T[];
};

export type DragSpecSwitchToStateAndFollow<T> = {
  type: "switch-to-state-and-follow";
  state: T;
  draggedId: string;
  followSpec?: DragSpec<T>;
};

export type DragSpecDropTarget<T> = {
  type: "drop-target";
  state: T;
  targetId: string;
};

export type DragSpecWithChaining<T> = {
  type: "with-chaining";
  spec: DragSpecData<T>;
  chaining: Chaining<T>;
};

export type DragSpecDuring<T> = {
  type: "during";
  spec: DragSpecData<T>;
  duringFn: (state: T) => T;
};

/**
 * This is a drag behavior's way of saying "immediately switch to
 * dropState and continue the drag".
 * - `draggedId` is the id of the element to continue dragging; if
 *   omitted, the current dragged element is used
 * - `followSpec` is a DragSpec to follow after switching states; if
 *   omitted, the dragology behavior of the newly rendered state
 *   is consulted as usual
 */
export type Chaining<T> = {
  draggedId?: string;
  followSpec?: DragSpec<T>;
};

// # DragSpec

// Full API, including methods and a brand.
export type DragSpec<T> = DragSpecData<T> & DragSpecMethods<T> & DragSpecBrand;

// Brand marker so jsx.d.ts can reference DragSpec without a generic parameter.
declare const _dragSpecBrand: unique symbol;
export type DragSpecBrand = { readonly [_dragSpecBrand]: true };

// Fluent methods available on every DragSpec value.
export interface DragSpecMethods<T> {
  /**
   * Set a new drop state for the behavior – the drag preview will be
   * the same as before, but dropping will transition into the given
   * state.
   */
  andThen(state: T | ((previewState: T) => T)): DragSpec<T>;

  /**
   * Augment the behavior with a "background" behavior that it will
   * switch to when the pointer gets more than a certain distance
   * away. This distance is 50 pixels by default, but can be
   * configured via the `radius` option.
   */
  withBackground(
    background: DragSpec<T>,
    opts?: { radius?: number },
  ): DragSpec<T>;

  /**
   * Set a "snap radius" for the behavior. If the dragged element
   * gets within this distance of where the rendered drop state would
   * place it, the preview will go straight to the rendered drop
   * state. (This changes the drag preview but not the drop state.)
   */
  withSnapRadius(
    radius: number,
    options?: { transition?: TransitionLike; chain?: boolean },
  ): DragSpec<T>;

  /**
   * Set a transition to be used when dropping an element. By default
   * this is 200ms cubic-out.
   */
  withDropTransition(transition?: TransitionLike): DragSpec<T>;

  /**
   * Set a transition to be used when switching between branches of a
   * behavior. "Branches" isn't yet a very well-established concept,
   * but this includes, e.g., switching between behaviors in a
   * `closest`, or switching between the "foreground" and
   * "background" in a `withBackground`.
   *
   * NOTE: There is currently no way to say, e.g., "do transition X
   * when switching between branches of a `closest` but do transition
   * Y when switching between the `closest` and its background" –
   * every application of `withBranchTransition` applies to all
   * branch switches within the behavior.
   */
  withBranchTransition(transition: TransitionLike): DragSpec<T>;

  /**
   * Advanced: Change the behavior's reported "distance" measurement
   * via the provided function. Use this, e.g., to "reweight" the
   * behavior's drop target in a `closest`.
   */
  withDistance(f: (distance: number) => number): DragSpec<T>;

  /**
   * Wrap this behavior with floating: on each frame, the inner
   * behavior's rendered output is used as a dynamic backdrop (with
   * the dragged element extracted), and the original dragged element
   * floats freely on top. Optionally provide a ghost and/or a tether
   * function to limit how far the float deviates from the inner
   * behavior's element position.
   */
  withFloating(opts?: FloatingOptions): DragSpec<T>;

  /**
   * When the drop state changes, immediately chain into a new drag
   * from that state (re-evaluating dragology on the dragged
   * element). Options can optionally be provided to fine-tune the
   * behavior of the chaining.
   */
  withChaining(chaining?: Chaining<T>): DragSpec<T>;

  /**
   * Transform the state on every frame — both the rendered preview
   * and the drop state are re-rendered from the transformed state.
   * Like `andThen`, but the function's output is actually displayed.
   */
  during(fn: (state: T) => T): DragSpec<T>;
}

const dragSpecMethods: DragSpecMethods<any> & ThisType<DragSpec<any>> = {
  andThen(state) {
    return attachMethods({ type: "and-then", spec: this, andThenState: state });
  },
  withBackground(bg, { radius = 50 } = {}) {
    return attachMethods({
      type: "with-background",
      foreground: this,
      background: bg,
      radius,
    });
  },
  withSnapRadius(radius, { transition = false, chain = false } = {}) {
    return attachMethods({
      type: "with-snap-radius",
      spec: this,
      radius,
      transition: resolveTransitionLike(transition) ?? false,
      chain,
    });
  },
  withDropTransition(transition = true) {
    return attachMethods({
      type: "with-drop-transition",
      spec: this,
      transition: resolveTransitionLike(transition),
    });
  },
  withBranchTransition(transition) {
    return attachMethods({
      type: "with-branch-transition",
      spec: this,
      transition: resolveTransitionLike(transition) ?? false,
    });
  },
  withDistance(f) {
    return attachMethods({ type: "with-distance", spec: this, f });
  },
  withFloating({ ghost, tether } = {}) {
    return attachMethods({
      type: "with-floating",
      spec: this,
      ghost: ghost === true ? { opacity: 0.5 } : ghost,
      tether,
    });
  },
  withChaining(chaining = {}) {
    return attachMethods({ type: "with-chaining", spec: this, chaining });
  },
  during(fn) {
    return attachMethods({ type: "during", spec: this, duringFn: fn });
  },
};

function attachMethods<T>(data: DragSpecData<T>): DragSpec<T> {
  return Object.assign(Object.create(dragSpecMethods), data);
}

// # DragSpecBuilder

export class DragSpecBuilder<T> {
  /**
   * This drag behavior simply shows a static view of the given
   * state.
   */
  fixed(states: T[]): DragSpec<T>[];
  fixed(state: T): DragSpec<T>;
  fixed(stateOrStates: T | T[]): DragSpec<T> | DragSpec<T>[] {
    if (Array.isArray(stateOrStates))
      return stateOrStates.map((s) => this.fixed(s));
    return attachMethods({ type: "fixed", state: stateOrStates });
  }

  /**
   * This drag behavior "detaches" a dragged element from its
   * original position and lets it be dragged freely. Optionally, a
   * "ghost" element can be rendered at the original position while
   * dragging. Often used with `closest`.
   *
   * Note: This is actually the same as d.fixed(state).withFloating()!
   */
  floating(states: T[], opts?: FloatingOptions): DragSpec<T>[];
  floating(state: T, opts?: FloatingOptions): DragSpec<T>;
  floating(
    stateOrStates: T | T[],
    opts?: FloatingOptions,
  ): DragSpec<T> | DragSpec<T>[] {
    if (Array.isArray(stateOrStates))
      return stateOrStates.map((s) => this.floating(s, opts));
    return this.fixed(stateOrStates).withFloating(opts);
  }

  /**
   * This drag behavior lets you interpolate smoothly between states
   * by dragging inside their convex hull.
   */
  between(...states: Many<T>[]): DragSpec<T> {
    assert(states.length > 0, "between requires at least one state");
    return attachMethods({ type: "between", states: manyToArray(states) });
  }

  /**
   * This drag behavior combines multiple behaviors. During the drag,
   * it continuously switches to the behavior that gets the dragged
   * element closest to the pointer.
   */
  closest(...specs: Many<DragSpec<T>>[]): DragSpec<T> {
    return attachMethods({ type: "closest", specs: manyToArray(specs) });
  }

  /**
   * This drag behavior allows you to vary numbers in a state
   * continuously by dragging. Provide a starting state and paths to
   * the parameters you want to vary. An optional final parameter can
   * configure constraints.
   *
   * Note: `vary` starts running immediately – the values of
   * controlled parameters provided in the initial state will be used
   * to initialize numerical optimization, but won't ever be shown
   * directly. You can usually feel free to set them to an arbitrary
   * value.
   */
  vary(
    state: T,
    paramPaths: PathIn<T, number>[],
    options?: VaryOptions<T>,
  ): DragSpec<T> {
    return attachMethods({ type: "vary", state, paramPaths, ...options });
  }

  /**
   * This drag behavior renders a state and checks whether the
   * pointer is inside the bounds of a target element (identified by
   * ID). Distance is 0 when inside, Infinity when outside.
   */
  dropTarget(state: T, targetId: string): DragSpec<T> {
    return attachMethods({ type: "drop-target", state, targetId });
  }

  /**
   * This drag behavior immediately transitions into a new state,
   * then continues the drag from a different element in that state,
   * identified by ID. If followSpec is provided, it will be used to
   * continue the drag; otherwise, the spec attached to the new
   * element (via dragology) will be used.
   */
  switchToStateAndFollow(
    state: T,
    draggedId: string,
    followSpec?: DragSpec<T>,
  ): DragSpec<T> {
    return attachMethods({
      type: "switch-to-state-and-follow",
      state,
      draggedId,
      followSpec,
    });
  }
}

export type VaryOptions<T> = {
  /**
   * A constraint function returns one or more numbers, all of which
   * will be constrained to be negative. You can use `lessThan(a, b)`
   * to express a < b constraints.
   */
  constraint?: (state: T) => Many<number>;
  /**
   * For use alongside `constraint`. By default, the constraint
   * pullback uses parameter-space distance, which is fast and works
   * well when the varied parameters are cartesian coordinates. Set
   * this to `true` to use screen-space (render) distance instead,
   * which is more accurate when the varied parameters are angles or
   * other non-cartesian values.
   */
  constrainByRender?: boolean;
};

/** Constraint helper: returns a - b, so a < b when result ≤ 0 */
export function lessThan(a: number, b: number): number {
  return a - b;
}

/** Constraint helper: returns b - a, so a > b when result ≤ 0 */
export function moreThan(a: number, b: number): number {
  return b - a;
}

/** Constraint helper: combine multiple numeric constraints */
export function and(...constraints: number[]): number[] {
  return constraints;
}
