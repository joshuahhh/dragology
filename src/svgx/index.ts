import React from "react";
import { combineTransforms } from "./transform";

// SVGX is our slang for "messing around with SVG represented as
// React elements, generally provided by an author as JSX".

export type Svgx = React.ReactElement<React.SVGProps<SVGElement>>;

/**
 * Determines if we should recurse into an element's children when
 * walking the tree. Returns false for stuff that shouldn't get
 * processed or layered.
 */
export function shouldRecurseIntoChildren(element: Svgx): boolean {
  return element.type !== "foreignObject" && element.type !== "defs";
}

/**
 * A helpful utility to map over an element's children and/or update
 * its props. Not inherently recursive – feel free to recurse in
 * childFn.
 *
 * One special feature: If any newProps values are undefined, the
 * keys will be entirely removed from the element's props.
 * (React.cloneElement doesn't do this.)
 */
export function updateElement(
  element: Svgx,
  childFn?: (el: Svgx, idx: number) => Svgx | null,
  newProps?: React.SVGProps<SVGElement>,
): Svgx {
  const { children } = element.props;

  if (childFn && children && shouldRecurseIntoChildren(element)) {
    const childrenArray = React.Children.toArray(children);
    let someChildChanged = false;
    const newChildren = childrenArray.map((child, index) => {
      if (React.isValidElement(child)) {
        const updated = childFn(child as Svgx, index);
        if (updated !== child) someChildChanged = true;
        return updated;
      } else {
        // Preserve non-element children (like text nodes)
        return child;
      }
    });
    if (someChildChanged) {
      newProps = { ...newProps, children: newChildren };
    }
  }

  if (!newProps) return element;

  // Rebuild rather than cloneElement so that undefined values
  // actually remove props (cloneElement would keep them).
  const merged = { ...element.props, ...newProps };
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) cleaned[k] = v;
  }

  if (element.key != null) cleaned.key = element.key;
  return React.createElement(element.type, cleaned);
}

export type FindElementResult = {
  element: Svgx;
  accumulatedTransform: string;
};

export function findElement(
  element: Svgx,
  predicate: (el: Svgx) => boolean,
  accumulatedTransform: string = "",
): FindElementResult | null {
  const elementTransform = (element.props as any).transform || "";
  const newAccumulatedTransform = combineTransforms(
    accumulatedTransform,
    elementTransform,
  );

  if (predicate(element)) {
    return { element, accumulatedTransform: newAccumulatedTransform };
  }

  if (shouldRecurseIntoChildren(element)) {
    const children = React.Children.toArray(element.props.children);
    for (const child of children) {
      if (React.isValidElement(child)) {
        const found = findElement(
          child as Svgx,
          predicate,
          newAccumulatedTransform,
        );
        if (found) return found;
      }
    }
  }

  return null;
}

export function updatePropsDownTree(
  element: Svgx,
  mapFn: (el: Svgx) => React.SVGProps<SVGElement> | undefined,
): Svgx {
  return updateElement(
    element,
    (child) => updatePropsDownTree(child, mapFn),
    mapFn(element),
  );
}
