import { SVGProps } from "react";
import { PathIn, ValueAtPath, getAtPath } from "./paths";
import {
  Transition,
  TransitionLike,
  resolveTransitionLike,
} from "./transition";
import { Many, ManyReader, assert, manyToArray } from "./utils";

// # DragSpecData

export type DragSpecData<T> = (
  | DragSpecFixed<T>
  | DragSpecWithFloating<T>
  | DragSpecClosest<T>
  | DragSpecWhenFar<T>
  | DragSpecOnDrop<T>
  | DragSpecVary<T>
  | DragSpecChangeDistance<T>
  | DragSpecWithSnapRadius<T>
  | DragSpecWithDropTransition<T>
  | DragSpecBetween<T>
  | DragSpecSwitchToStateAndFollow<T>
  | DragSpecDropTarget<T>
  | DragSpecWithBranchTransition<T>
  | DragSpecWithChaining<T>
  | DragSpecDuring<T>
  | DragSpecSubstate<T>
) & { traceInfo?: unknown };

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
  inner: DragSpecData<T>;
  ghost: SVGProps<SVGElement> | undefined;
  tether: ((dist: number) => number) | undefined;
};

export type DragSpecClosest<T> = {
  type: "closest";
  specs: DragSpecData<T>[];
};

export type DragSpecWhenFar<T> = {
  type: "when-far";
  foreground: DragSpecData<T>;
  background: DragSpecData<T>;
  distance: number;
};

export type DragSpecWithSnapRadius<T> = {
  type: "with-snap-radius";
  inner: DragSpecData<T>;
  radius: number;
  transition: Transition | false;
  chain: boolean;
};

export type DragSpecWithDropTransition<T> = {
  type: "with-drop-transition";
  inner: DragSpecData<T>;
  transition: Transition | false;
};

export type DragSpecWithBranchTransition<T> = {
  type: "with-branch-transition";
  inner: DragSpecData<T>;
  transition: Transition | false;
};

export type DragSpecOnDrop<T> = {
  type: "on-drop";
  inner: DragSpecData<T>;
  onDropState: T | ((previewState: T) => T);
};

export type DragSpecVary<T> = {
  type: "vary";
  state: T;
  paramPaths: PathIn<T, number>[];
  options: VaryOptions<T>;
};

export type DragSpecChangeDistance<T> = {
  type: "change-distance";
  inner: DragSpecData<T>;
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
  inner: DragSpecData<T>;
  chaining: Chaining<T>;
};

export type DragSpecDuring<T> = {
  type: "during";
  inner: DragSpecData<T>;
  duringFn: (state: T) => T;
};

export type DragSpecSubstate<T> = {
  type: "substate";
  state: T;
  path: (string | number)[];
  /** This is really a DragSpecData<T[path]> */
  innerSpec: DragSpecData<unknown>;
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

/** Either a DragSpec or a bare state (coerced via d.fixed). */
export type DragSpecLike<T> = DragSpec<T> | T;

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
  onDrop(state: T | ((previewState: T) => T)): DragSpec<T>;

  /**
   * Switch to an alternate behavior when the pointer gets more than
   * a certain distance away. This distance is 50 pixels by default,
   * but can be configured via the `distance` option.
   */
  whenFar(
    background: DragSpecLike<T>,
    opts?: { distance?: number },
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
   * "background" in a `whenFar`.
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
  changeDistance(f: (distance: number) => number): DragSpec<T>;

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
   * Like `onDrop`, but the function's output is actually displayed.
   */
  during(fn: (state: T) => T): DragSpec<T>;
}

const dragSpecMethods: DragSpecMethods<any> & ThisType<DragSpec<any>> = {
  onDrop(state) {
    return attachMethods({
      type: "on-drop",
      inner: this,
      onDropState: state,
    });
  },
  whenFar(bg, { distance = 50 } = {}) {
    return attachMethods({
      type: "when-far",
      foreground: this,
      background: resolveDragSpecLike(bg),
      distance,
    });
  },
  withSnapRadius(radius, { transition = false, chain = false } = {}) {
    return attachMethods({
      type: "with-snap-radius",
      inner: this,
      radius,
      transition: resolveTransitionLike(transition) ?? false,
      chain,
    });
  },
  withDropTransition(transition = true) {
    return attachMethods({
      type: "with-drop-transition",
      inner: this,
      transition: resolveTransitionLike(transition),
    });
  },
  withBranchTransition(transition) {
    return attachMethods({
      type: "with-branch-transition",
      inner: this,
      transition: resolveTransitionLike(transition) ?? false,
    });
  },
  changeDistance(f) {
    return attachMethods({ type: "change-distance", inner: this, f });
  },
  withFloating({ ghost, tether } = {}) {
    return attachMethods({
      type: "with-floating",
      inner: this,
      ghost: ghost === true ? { opacity: 0.5 } : ghost,
      tether,
    });
  },
  withChaining(chaining = {}) {
    return attachMethods({ type: "with-chaining", inner: this, chaining });
  },
  during(fn) {
    return attachMethods({ type: "during", inner: this, duringFn: fn });
  },
};

function attachMethods<T>(data: DragSpecData<T>): DragSpec<T> {
  return Object.assign(Object.create(dragSpecMethods), data);
}

function isDragSpec<T>(value: DragSpecLike<T>): value is DragSpec<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === dragSpecMethods
  );
}

export function resolveDragSpecLike<T>(specLike: DragSpecLike<T>): DragSpec<T> {
  if (isDragSpec(specLike)) return specLike;
  return attachMethods({ type: "fixed", state: specLike });
}

// # DragSpecBuilder

export class DragSpecBuilder<T> {
  readonly state: T;

  constructor(state: T) {
    this.state = state;
  }

  /**
   * This drag behavior simply shows a static view of the given
   * state.
   */
  fixed(state: T): DragSpec<T> {
    return attachMethods({ type: "fixed", state });
  }

  /**
   * Shortcut for d.fixed(state).withFloating(). If you have more
   * than one state, you'll want to use
   * d.closest(states).withFloating().
   */
  floating(state: T, opts?: FloatingOptions): DragSpec<T> {
    return this.fixed(state).withFloating(opts);
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
  closest(...specs: Many<DragSpecLike<T>>[]): DragSpec<T> {
    return attachMethods({
      type: "closest",
      specs: manyToArray(specs).map(resolveDragSpecLike),
    });
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
    return attachMethods({
      type: "vary",
      state,
      paramPaths,
      options: options ?? {},
    });
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
   * Focus on a sub-path of the state (a lens). The callback receives
   * a DragSpecBuilder for the substate type, and should return a
   * DragSpec for that substate.
   */
  substate<const P extends PathIn<T, any>>(
    state: T,
    path: P,
    fn: (d: DragSpecBuilder<ValueAtPath<T, P>>) => DragSpec<ValueAtPath<T, P>>,
  ): DragSpec<T> {
    const subState = getAtPath(state, path as any) as ValueAtPath<T, P>;
    const innerSpec = fn(new DragSpecBuilder(subState));
    return attachMethods({
      type: "substate",
      state,
      path: path as any,
      innerSpec: innerSpec as DragSpecData<unknown>,
    });
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
    followSpec?: DragSpecLike<T>,
  ): DragSpec<T> {
    return attachMethods({
      type: "switch-to-state-and-follow",
      state,
      draggedId,
      followSpec: followSpec && resolveDragSpecLike(followSpec),
    });
  }
}

export type VaryOptions<T> = {
  /**
   * A constraint function returns one or more numbers, all of which
   * will be constrained to be negative. You can use `lessThan(a, b)`
   * to express a < b constraints.
   */
  constraint?: ManyReader<number, T>;
  /**
   * A pin function returns one or more numbers that will be
   * constrained to remain constant throughout the drag. (This is a
   * convenience built on top of `constraint`.)
   */
  pin?: ManyReader<number, T>;
};

export { and, equal, lessThan, moreThan } from "./math/optimization";
