import React from "react";
import { combineTransforms } from "./transform";

// SVGX is our slang for "messing around with SVG represented as
// React elements, generally provided by an author as JSX".

export type SvgxProps = React.SVGProps<SVGElement>;
export type Svgx = React.ReactElement<SvgxProps>;

/**
 * This doesn't actually check if it's SVG; it's just
 * React.isValidElement for situations where you know you're in a
 * SVGX tree but don't know if this is an element.
 */
export function isValidSvgx(element: unknown): element is Svgx {
  return React.isValidElement(element);
}

/**
 * Is this a component element (`<NoteWidget />`) rather than an
 * intrinsic one (`<g>`, `<div>`)? Dragology never calls components:
 * React mounts them once and DraggableRenderer keeps them mounted
 * (see svgx/componentHost.tsx).
 */
export function isComponentElement(element: Svgx): boolean {
  return typeof element.type !== "string" && element.type !== React.Fragment;
}

/**
 * On a component element, only `dragologyLerpProps` is Dragology's;
 * every other prop, `id` included, is the component's own. To give a
 * component an id or dragologyKey, wrap it in a <g>.
 */
export function assertNoDragologyKeyOnComponent(element: Svgx): void {
  if (isComponentElement(element) && element.props.dragologyKey !== undefined) {
    throw new Error(
      `<${elementName(element)}> has a dragologyKey, which only works on ` +
        `intrinsic elements. Wrap it in a <g dragologyKey=…> instead.`,
    );
  }
}

/**
 * Dragology owns SVG; HTML belongs to React. So a foreignObject may
 * only hold component elements, which render their HTML themselves.
 */
export function assertForeignObjectHoldsComponents(element: Svgx): void {
  if (element.type !== "foreignObject") return;
  for (const child of React.Children.toArray(element.props.children)) {
    if (React.isValidElement(child) && isComponentElement(child as Svgx)) {
      continue;
    }
    const what = React.isValidElement(child)
      ? `<${elementName(child as Svgx)}>`
      : JSON.stringify(child);
    throw new Error(
      `<foreignObject> contains ${what}, but it may only contain ` +
        `component elements. Move the HTML into a component.`,
    );
  }
}

/** "NoteWidget" for <NoteWidget />, "g" for <g>; for error messages. */
export function elementName(element: Svgx): string {
  const type = element.type as any;
  return typeof type === "string" ? type : (type.displayName ?? type.name);
}

/**
 * Determines if we should recurse into an element's children when
 * walking the tree. Returns false for stuff that shouldn't get
 * processed or layered.
 */
export function shouldRecurseIntoChildren(element: Svgx): boolean {
  return (
    !isComponentElement(element) &&
    element.type !== "defs" &&
    !element.props.dragologyOpaque
  );
}

type ChildNode = Exclude<React.ReactNode, boolean | null | undefined>;

/**
 * Like `React.Children.toArray` (flattens nested arrays, drops
 * nullish and boolean children, keys elements by position), except
 * that a key from an earlier call is kept unchanged. `toArray` adds a
 * prefix to existing keys on every call, so a tree rebuilt twice
 * would get different keys than one rebuilt once, and React would
 * remount everything whose key changed.
 *
 * Keys we assign start with "."; any other key came from the author,
 * which isn't allowed.
 */
export function childrenToArray(children: React.ReactNode): ChildNode[] {
  const out: ChildNode[] = [];
  const visit = (node: React.ReactNode, prefix: string) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) =>
        visit(child, prefix === "" ? `.${i}` : `${prefix}:${i}`),
      );
    } else if (node == null || typeof node === "boolean") {
      return;
    } else if (React.isValidElement(node) && node.key == null) {
      out.push(React.cloneElement(node, { key: prefix || ".0" }));
    } else if (React.isValidElement(node) && !node.key!.startsWith(".")) {
      throw new Error(
        `<${elementName(node as Svgx)}> has a key prop (${node.key}). ` +
          `Draggables match elements by id or dragologyKey, not key.`,
      );
    } else {
      out.push(node as ChildNode);
    }
  };
  visit(children, "");
  return out;
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
  newProps?: SvgxProps,
): Svgx {
  const { children } = element.props;

  if (childFn && children && shouldRecurseIntoChildren(element)) {
    const childrenArray = childrenToArray(children);
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
  /** Does not include element itself */
  ancestors: Svgx[];
};

export function findElement(
  element: Svgx,
  predicate: (el: Svgx) => boolean,
  accumulatedTransform: string = "",
  ancestors: Svgx[] = [],
): FindElementResult | null {
  const elementTransform = (element.props as any).transform || "";
  const newAccumulatedTransform = combineTransforms(
    accumulatedTransform,
    elementTransform,
  );

  if (predicate(element)) {
    return {
      element,
      accumulatedTransform: newAccumulatedTransform,
      ancestors,
    };
  }

  const childAncestors = [...ancestors, element];

  if (shouldRecurseIntoChildren(element)) {
    const children = React.Children.toArray(element.props.children);
    for (const child of children) {
      if (React.isValidElement(child)) {
        const found = findElement(
          child as Svgx,
          predicate,
          newAccumulatedTransform,
          childAncestors,
        );
        if (found) return found;
      }
    }
  }

  return null;
}

export function updatePropsDownTree(
  element: Svgx,
  mapFn: (el: Svgx) => SvgxProps | undefined,
): Svgx {
  return updateElement(
    element,
    (child) => updatePropsDownTree(child, mapFn),
    mapFn(element),
  );
}
