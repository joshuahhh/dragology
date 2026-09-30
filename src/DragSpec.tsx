import type {
  DragBehavior,
  DragFrame,
  DragInitContext,
  DragResult,
} from "./DragBehavior";
import { PathIn, ValueAtPath, getAtPath } from "./paths";
import type { Svgx, SvgxProps } from "./svgx";
import {
  Transition,
  TransitionLike,
  resolveTransitionLike,
} from "./transition";
import { assert } from "./utils/assert";
import { Many, ManyReader, Reader, manyToArray } from "./utils/flexible-types";

// # DragSpecData

export type DragSpecData<T extends object> = {
  traceInfo?: unknown;
} & (
  | { type: "fixed"; state: T }
  | {
      type: "with-floating";
      inner: DragSpecData<T>;
      ghost: SvgxProps | undefined;
      tether: ((dist: number) => number) | undefined;
    }
  | { type: "closest"; specs: DragSpecData<T>[]; stickiness: number }
  | {
      type: "when-far";
      foreground: DragSpecData<T>;
      background: DragSpecData<T>;
      gapIn: number;
      gapOut: number;
    }
  | {
      type: "on-drop";
      inner: DragSpecData<T>;
      onDropState: T | ((previewState: T) => T);
    }
  | {
      type: "vary";
      state: T;
      paramPaths: PathIn<T, number>[];
      options: VaryOptions<T>;
    }
  | {
      type: "vary-func";
      initParams: number[];
      stateFromParams: (params: number[]) => T;
      options: VaryOptions<T>;
    }
  | {
      type: "change-frame";
      inner: DragSpecData<T>;
      f: Reader<Partial<DragFrame>, DragFrame>;
    }
  | {
      type: "change-result";
      inner: DragSpecData<T>;
      f: Reader<Partial<DragResult<T>>, DragResult<T>>;
    }
  | {
      type: "change-gap";
      inner: DragSpecData<T>;
      f: (gap: number) => number;
    }
  | {
      type: "with-snap-radius";
      inner: DragSpecData<T>;
      radius: number;
      transition: Transition | false;
      chain: boolean;
    }
  | {
      type: "with-drop-transition";
      inner: DragSpecData<T>;
      transition: Transition | false;
    }
  | { type: "with-overlay"; inner: DragSpecData<T>; overlay: Svgx }
  | {
      type: "between";
      specs: DragSpecData<T>[];
      interpolation?: BetweenInterpolation;
      sharpness?: number;
    }
  | {
      type: "switch-to-state-and-follow";
      state: T;
      draggedId: string;
      followSpec?: DragSpec<T>;
    }
  | {
      type: "drop-target";
      state: T;
      targetId: string;
      /**
       * State to render for computing the target's bounds. Defaults
       * to `state`. Useful when the target element moves or vanishes
       * in `state` (e.g. because dropping there rewrites it).
       */
      boundsState?: T;
    }
  | {
      type: "with-branch-transition";
      inner: DragSpecData<T>;
      transition: Transition | false;
    }
  | {
      type: "with-chaining";
      inner: DragSpecData<T>;
      chaining: Chaining<T>;
    }
  | {
      type: "during";
      inner: DragSpecData<T>;
      duringFn: (state: T) => T;
    }
  | {
      type: "substate";
      state: T;
      path: (string | number)[];
      /** This is really a DragSpecData<T[path]> */
      innerSpec: DragSpecData<object>;
    }
  | {
      type: "react-to";
      getter: () => unknown;
      callback: (value: any) => DragSpec<T>;
    }
  | {
      type: "with-init-context";
      inner: DragSpecData<T>;
      f: Reader<Partial<DragInitContext<T>>, DragInitContext<T>>;
    }
  | {
      type: "custom";
      fn: (ctx: DragInitContext<T>) => DragBehavior<T>;
    }
);

export type WhenFarOptions =
  | { gap?: number; gapIn?: never; gapOut?: never }
  | { gap?: never; gapIn?: number; gapOut?: number };

export type FloatingOptions = {
  ghost?: SvgxProps | true;
  tether?: (dist: number) => number;
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
export type Chaining<T extends object> = {
  draggedId?: string;
  followSpec?: DragSpec<T>;
  transition: Transition | false;
};

export type BetweenInterpolation = "delaunay" | "natural-neighbor";

// # DragSpec

// Full API, including methods and a brand.
export type DragSpec<T extends object> = DragSpecData<T> &
  DragSpecMethods<T> &
  DragSpecBrand;

/** Either a DragSpec or a bare state (coerced via d.fixed). */
export type DragSpecLike<T extends object> = DragSpec<T> | T;

// Brand marker so jsx.d.ts can reference DragSpec without a generic parameter.
declare const _dragSpecBrand: unique symbol;
export type DragSpecBrand = { readonly [_dragSpecBrand]: true };

// Fluent methods available on every DragSpec value.
export class DragSpecMethods<T extends object> {
  /**
   * Set a new drop state for the behavior – the drag preview will be
   * the same as before, but dropping will transition into the given
   * state.
   */
  onDrop(this: DragSpec<T>, state: T | ((previewState: T) => T)): DragSpec<T> {
    return attachMethods({
      type: "on-drop",
      inner: this,
      onDropState: state,
    });
  }

  /**
   * Switch to an alternate behavior when the pointer gets more than
   * a certain distance ("gap") away. This distance is 50 pixels by
   * default, but can be configured via the `gap` option.
   */
  whenFar(
    this: DragSpec<T>,
    background: DragSpecLike<T>,
    opts: WhenFarOptions = {},
  ): DragSpec<T> {
    const gap = opts.gap ?? 50;
    const gapIn = opts.gapIn ?? gap;
    const gapOut = opts.gapOut ?? gap;
    assert(
      gapIn <= gapOut,
      `whenFar: gapIn (${gapIn}) must be <= gapOut (${gapOut}), otherwise the behavior oscillates`,
    );
    return attachMethods({
      type: "when-far",
      foreground: this,
      background: resolveDragSpecLike(background),
      gapIn,
      gapOut,
    });
  }

  /**
   * Set a "snap radius" for the behavior. If the dragged element
   * gets within this distance of where the rendered drop state would
   * place it, the preview will go straight to the rendered drop
   * state. (This changes the drag preview but not the drop state.)
   */
  withSnapRadius(
    this: DragSpec<T>,
    radius: number,
    {
      transition = false,
      chain = false,
    }: { transition?: TransitionLike; chain?: boolean } = {},
  ): DragSpec<T> {
    return attachMethods({
      type: "with-snap-radius",
      inner: this,
      radius,
      transition: resolveTransitionLike(transition),
      chain,
    });
  }

  /**
   * Set a transition to be used when dropping an element. You don't
   * need to call this to get a drop transition – by default you get
   * a 200ms cubic-out. This is for customization.
   */
  withDropTransition(
    this: DragSpec<T>,
    transition: TransitionLike,
  ): DragSpec<T> {
    return attachMethods({
      type: "with-drop-transition",
      inner: this,
      transition: resolveTransitionLike(transition),
    });
  }

  /**
   * Draw extra SVG on top of the drag preview while this behavior is
   * active, e.g. marks at drop targets. It's in canvas coordinates,
   * drawn above everything else, and goes away on drop (the dropped
   * state doesn't draw it). On a branch of a `closest`, it shows only
   * while that branch is the active one.
   */
  withOverlay(this: DragSpec<T>, overlay: Svgx): DragSpec<T> {
    return attachMethods({ type: "with-overlay", inner: this, overlay });
  }

  /**
   * Set a transition to be used when switching between branches of a
   * behavior. "Branches" isn't yet a very well-established concept,
   * but this includes, e.g., switching between behaviors in a
   * `closest`, or switching between the "foreground" and
   * "background" in a `whenFar`. You don't need to call this to get
   * a branch transition – by default you get a 200ms cubic-out. This
   * is for customization.
   *
   * NOTE: There is currently no way to say, e.g., "do transition X
   * when switching between branches of a `closest` but do transition
   * Y when switching between the `closest` and its background" –
   * every application of `withBranchTransition` applies to all
   * branch switches within the behavior.
   */
  withBranchTransition(
    this: DragSpec<T>,
    transition: TransitionLike,
  ): DragSpec<T> {
    return attachMethods({
      type: "with-branch-transition",
      inner: this,
      transition: resolveTransitionLike(transition),
    });
  }

  /**
   * Advanced: Transform the frame (input) before it reaches the inner
   * behavior. Use this, e.g., to remap the pointer position.
   */
  changeFrame(
    this: DragSpec<T>,
    f: Reader<Partial<DragFrame>, DragFrame>,
  ): DragSpec<T> {
    return attachMethods({ type: "change-frame", inner: this, f });
  }

  /**
   * Advanced: Transform the behavior's entire result on each frame.
   * This is the most general wrapper — you can change any field of
   * the DragResult (preview, drop state, gap, etc.).
   */
  changeResult(
    this: DragSpec<T>,
    f: Reader<Partial<DragResult<T>>, DragResult<T>>,
  ): DragSpec<T> {
    return attachMethods({ type: "change-result", inner: this, f });
  }

  /**
   * Advanced: Change the behavior's reported "gap" measurement via
   * the provided function. Use this, e.g., to "reweight" the
   * behavior's drop target in a `closest`.
   */
  changeGap(this: DragSpec<T>, f: (gap: number) => number): DragSpec<T> {
    return attachMethods({ type: "change-gap", inner: this, f });
  }

  /**
   * Wrap this behavior with floating: on each frame, the inner
   * behavior's preview is used as a dynamic backdrop (with the
   * dragged element extracted), and the original dragged element
   * floats freely on top. Optionally provide a ghost and/or a tether
   * function to limit how far the float deviates from the inner
   * behavior's element position.
   */
  withFloating(
    this: DragSpec<T>,
    { ghost, tether }: FloatingOptions = {},
  ): DragSpec<T> {
    return attachMethods({
      type: "with-floating",
      inner: this,
      ghost: ghost === true ? { opacity: 0.5 } : ghost,
      tether,
    });
  }

  /**
   * When the drop state changes, immediately chain into a new drag
   * from that state (re-evaluating dragology on the dragged
   * element). Options can optionally be provided to fine-tune the
   * behavior of the chaining.
   */
  withChaining(
    this: DragSpec<T>,
    {
      transition: transitionLike = true,
      ...rest
    }: {
      draggedId?: string;
      followSpec?: DragSpec<T>;
      transition?: TransitionLike;
    } = {},
  ): DragSpec<T> {
    const transition = resolveTransitionLike(transitionLike);
    return attachMethods({
      type: "with-chaining",
      inner: this,
      chaining: { ...rest, transition },
    });
  }

  /**
   * Transform the state on every frame, rendering it as a preview.
   * (Same drop behavior as `onDrop`, but that doesn't change the
   * preview.)
   */
  during(this: DragSpec<T>, fn: (state: T) => T): DragSpec<T> {
    return attachMethods({ type: "during", inner: this, duringFn: fn });
  }

  /**
   * Transform the DragInitContext before the inner spec is
   * initialized. Use this to override things like `anchorPos` or
   * `draggedPath` for child behaviors.
   */
  withInitContext(
    this: DragSpec<T>,
    f: Reader<Partial<DragInitContext<T>>, DragInitContext<T>>,
  ): DragSpec<T> {
    return attachMethods({ type: "with-init-context", inner: this, f });
  }
}

function attachMethods<T extends object>(data: DragSpecData<T>): DragSpec<T> {
  return Object.assign(Object.create(DragSpecMethods.prototype), data);
}

function isDragSpec<T extends object>(
  value: DragSpecLike<T>,
): value is DragSpec<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === DragSpecMethods.prototype
  );
}

export function resolveDragSpecLike<T extends object>(
  specLike: DragSpecLike<T>,
): DragSpec<T> {
  if (isDragSpec(specLike)) return specLike;
  return attachMethods({ type: "fixed", state: specLike });
}

// # DragSpecBuilder

export class DragSpecBuilder<T extends object> {
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
   * This drag behavior lets you interpolate smoothly between states
   * by dragging inside their convex hull.
   */
  between(
    specs: Many<DragSpecLike<T>>,
    options?: {
      /**
       * Specifies how to distribute weight to different targets,
       * based on where everything is in space. Two options:
       * "delaunay" (look up where pointer is in a triangulation of
       * targets and give weight to the vertices of its triangle) and
       * "natural-neighbor" (something fancier & smoother). */
      interpolation?: BetweenInterpolation;
      /**
       * A way to create a magnetic attraction between the dragged
       * object and its targets. 1 is the default (no attraction) and
       * as you go higher, the object preferentially goes towards the
       * targets it is closest to, limiting to d.closest at infinity.
       */
      sharpness?: number;
    },
  ): DragSpec<T> {
    const resolved = manyToArray(specs).map(resolveDragSpecLike);
    assert(resolved.length > 0, "between requires at least one state");
    return attachMethods({
      type: "between",
      specs: resolved,
      interpolation: options?.interpolation,
      sharpness: options?.sharpness,
    });
  }

  /**
   * This drag behavior combines multiple behaviors. During the drag,
   * it continuously switches to the behavior that gets the dragged
   * element closest to the pointer (lowest "gap").
   */
  closest(
    specs: Many<DragSpecLike<T>>,
    options?: {
      /**
       * Stickiness tells `d.closest` to stay on the current option
       * until its gap is `stickiness` pixels bigger than the
       * next-best option.
       */
      stickiness?: number;
    },
  ): DragSpec<T> {
    return attachMethods({
      type: "closest",
      specs: manyToArray(specs).map(resolveDragSpecLike),
      stickiness: options?.stickiness ?? 0,
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
  vary<S extends T>(
    state: S,
    paramPaths: Many<VaryPath<S>>,
    options?: VaryOptions<S>,
  ): DragSpec<T> {
    return attachMethods({
      type: "vary",
      state,
      paramPaths: manyToArray(paramPaths).map(resolveVaryPath) as PathIn<
        T,
        number
      >[],
      options: (options ?? {}) as VaryOptions<T>,
    });
  }

  /**
   * Like `vary`, but instead of extracting parameters from paths in
   * the state, you provide initial parameter values and a function
   * that builds a state from parameters. Useful when multiple
   * parameters in state need to change in concert.
   */
  varyFunc(
    initParams: number[],
    stateFromParams: (params: number[]) => T,
    options?: VaryOptions<T>,
  ): DragSpec<T> {
    return attachMethods({
      type: "vary-func",
      initParams,
      stateFromParams,
      options: (options ?? {}) as VaryOptions<T>,
    });
  }

  /**
   * Escape hatch: define a drag behavior from scratch.
   */
  custom(fn: (ctx: DragInitContext<T>) => DragBehavior<T>): DragSpec<T> {
    return attachMethods({ type: "custom", fn });
  }

  /**
   * This drag behavior renders a state and checks whether the
   * pointer is inside the bounds of a target element (identified by
   * ID). Gap is 0 when inside, Infinity when outside.
   *
   * By default, the target's bounds are computed by rendering
   * `state`. Pass `options.boundsState` to compute bounds from a
   * different state (e.g. the current one), which is useful when
   * the target element moves or vanishes in `state`.
   */
  dropTarget(
    targetId: string,
    state: T,
    options?: { boundsState?: T },
  ): DragSpec<T> {
    return attachMethods({
      type: "drop-target",
      state,
      targetId,
      boundsState: options?.boundsState,
    });
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
      innerSpec: innerSpec as DragSpecData<object>,
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

  /**
   * This drag behavior calls an getter on every frame. When the
   * getter's value changes, a child behavior is re-initialized with
   * the new value.
   */
  reactTo<V>(
    getter: () => V,
    callback: (value: V) => DragSpec<T>,
  ): DragSpec<T> {
    return attachMethods({ type: "react-to", getter, callback });
  }
}

export type VaryOptions<T> = {
  /**
   * A constraint function returns one or more numbers, all of which
   * will be constrained to be negative. Consider using helpers like
   * `lessThan`, `inOrder`, and `equal` to make your constrait
   * readable.
   */
  constraint?: ManyReader<number, [T]>;
  /**
   * A pin function returns one or more numbers that will be
   * constrained to remain constant throughout the drag. (This is a
   * convenience built on top of `constraint`.)
   */
  pin?: ManyReader<number, [T]>;
};

export { and, equal, inOrder, lessThan, moreThan } from "./math/optimization";

// # VaryPath

const VARY_PATH = Symbol("VaryPath");

export type VaryPath<T> = { [VARY_PATH]: PathIn<T, number> };

export function param<T>(...segments: PathIn<T, number>): VaryPath<T> {
  return { [VARY_PATH]: segments };
}

export function resolveVaryPath<T>(p: VaryPath<T>): PathIn<T, number> {
  return p[VARY_PATH];
}
