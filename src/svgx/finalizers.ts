import { findElement, Svgx } from ".";
import { Vec2, Vec2able } from "../math/vec2";
import { assert, assertDefined } from "../utils/assert";
import { localToGlobal } from "./transform";

/**
 * A reference to a point in an element's local coordinate system.
 * The point will be resolved to global coordinates after the tree is built.
 */
export type PointRef = {
  elementId: string;
  localPos: Vec2;
};

type Finalizer = (resolve: (ref: PointRef) => Vec2) => Svgx;

/**
 * Collects deferred rendering functions that need to run after the SVG tree is assembled.
 * Finalizers receive the completed tree and can resolve point references to draw
 * connecting lines, paths, etc.
 */
export class Finalizers {
  private fns: Finalizer[] = [];

  push(fn: Finalizer) {
    this.fns.push(fn);
  }

  run(tree: Svgx): Svgx[] {
    const resolve = (ref: PointRef) =>
      resolvePointRef(assertDefined(ref), tree);
    return this.fns.map((fn) => fn(resolve));
  }
}

/**
 * Creates a reference to a point in an element's local coordinate system.
 */
export function pointRef(elementId: string, localPos: Vec2able): PointRef {
  return {
    elementId,
    localPos: Vec2(localPos),
  };
}

/**
 * Resolves a point reference to global coordinates by:
 * 1. Finding the element with the given ID in the tree
 * 2. Reading its accumulated transform
 * 3. Converting the local point to global coordinates
 */
export function resolvePointRef(ref: PointRef, tree: Svgx): Vec2 {
  assert(!!ref, "PointRef is undefined");

  const found = findElement(tree, (el) => el.props.id === ref.elementId);

  if (!found) {
    throw new Error(
      `Cannot resolve point ref: element with id "${ref.elementId}" not found`,
    );
  }

  return localToGlobal(found.accumulatedTransform, ref.localPos);
}
