import { PrettyPrint } from "@joshuahhh/pretty-print";
import { color, rgb } from "d3-color";
import * as d3Interpolate from "d3-interpolate";
import { interpolatePath } from "d3-interpolate-path";
import React, { cloneElement } from "react";
import {
  childrenToArray,
  elementName,
  isComponentElement,
  isValidSvgx,
  shouldRecurseIntoChildren,
  Svgx,
  SvgxProps,
} from ".";
import { ErrorWithJSX } from "../ErrorBoundary";
import { lerp } from "../math/vec2";
import { objectKeys } from "../utils/js";
import { Layer, LayeredSvgx } from "./layers";
import { lerpTransformString } from "./transform";

// SVG properties that should be interpolated as colors
const COLOR_PROPS = new Set([
  "fill",
  "stroke",
  "color",
  "stop-color",
  "flood-color",
  "lighting-color",
  // CSS properties that can appear in style objects
  "backgroundColor",
  "borderColor",
  "outlineColor",
]);

// Color interpolator must be chosen carefully. When we do three-way
// interpolation (via `lerpLayeredWeights`), interpolators like
// `interpolateCubehelix` which do "shortest path between hues"
// behave erratically. `interpolateCubehelixLong` is ok, and keeps
// things vibrant, but it means you go through blue on the way from
// red to green. `interpolateLab` might be safest.
// - TODO: Someday this should be configurable!
const interpolateColor = d3Interpolate.interpolateLab;

const NO_LERP_PROPS = new Set(["pointerEvents", "cursor"]);

const DEFAULT_VALUE_FOR_KEY: { [key: string]: any } = {
  opacity: 1,
};

/**
 * Parses a points string (e.g., "0,0 10,5 20,10") into an array of [x, y] pairs.
 */
function parsePoints(pointsStr: string): number[][] {
  // Split on whitespace and/or commas, filter empty strings
  const tokens = pointsStr
    .trim()
    .split(/[\s,]+/)
    .filter((s) => s.length > 0)
    .map((s) => parseFloat(s));

  const points: number[][] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    points.push([tokens[i], tokens[i + 1]]);
  }
  return points;
}

/**
 * Serializes an array of [x, y] pairs back to a points string.
 */
function serializePoints(points: number[][]): string {
  return points.map((p) => `${p[0]},${p[1]}`).join(" ");
}

/**
 * Lerps between two points strings.
 */
function lerpPoints(pointsA: string, pointsB: string, t: number): string {
  const parsedA = parsePoints(pointsA);
  const parsedB = parsePoints(pointsB);

  if (parsedA.length !== parsedB.length) {
    throw new Error(
      `Cannot lerp points: different point counts (${parsedA.length} vs ${parsedB.length})`,
    );
  }

  const lerped = parsedA.map((pa, i) => {
    const pb = parsedB[i];
    return [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t)];
  });

  return serializePoints(lerped);
}

/**
 * Lerps a single value based on its type and property name.
 */
function lerpValue(key: string, valA: any, valB: any, t: number): any {
  // Check equality first before attempting interpolation
  if (valA === valB) {
    return valA;
  }

  valA ??= DEFAULT_VALUE_FOR_KEY[key];
  valB ??= DEFAULT_VALUE_FOR_KEY[key];

  if (valA !== undefined && valB === undefined) {
    return valA;
  } else if (valA === undefined && valB !== undefined) {
    return valB;
  } else if (typeof valA === "number" && typeof valB === "number") {
    return lerp(valA, valB, t);
  } else if (
    key === "points" &&
    typeof valA === "string" &&
    typeof valB === "string"
  ) {
    return lerpPoints(valA, valB, t);
  } else if (
    key === "d" &&
    typeof valA === "string" &&
    typeof valB === "string"
  ) {
    // Interpolate SVG path data using d3-interpolate-path
    const pathInterpolator = interpolatePath(valA, valB);
    return pathInterpolator(t);
  } else if (
    COLOR_PROPS.has(key) &&
    typeof valA === "string" &&
    typeof valB === "string"
  ) {
    // Handle "none" as transparent
    const isANone = valA === "none";
    const isBNone = valB === "none";

    if (isANone || isBNone) {
      // Get the actual color (the one that's not "none")
      const actualColor = isANone ? valB : valA;
      const colorRgb = rgb(actualColor);

      if (colorRgb === null) {
        // If color parsing failed, fall through to error
        throw new Error(
          `Cannot lerp prop "${key}": invalid color value (${actualColor})`,
        );
      }

      // Create transparent version of the color
      const transparentColor = rgb(colorRgb.r, colorRgb.g, colorRgb.b, 0);
      const opaqueColor = rgb(colorRgb.r, colorRgb.g, colorRgb.b, 1);

      // Interpolate between transparent and opaque
      const colorInterp = isANone
        ? interpolateColor(
            transparentColor.formatRgb(),
            opaqueColor.formatRgb(),
          )
        : interpolateColor(
            opaqueColor.formatRgb(),
            transparentColor.formatRgb(),
          );

      return colorInterp(t);
    }

    const colorInterp = interpolateColor(valA, valB);
    return colorInterp(t);
  } else if (
    (key === "filter" || key === "WebkitFilter") &&
    typeof valA === "string" &&
    typeof valB === "string"
  ) {
    const result = tryLerpFilter(valA, valB, t);
    if (result) return result;
    throw new Error(
      `Cannot lerp prop "${key}": unrecognized filter values (${valA} vs ${valB})`,
    );
  } else if (typeof valA === "string" && typeof valB === "string") {
    // Try to parse both as numbers
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);

    if (!isNaN(numA) && !isNaN(numB)) {
      // Both are numeric strings - interpolate and return as string
      return String(lerp(numA, numB, t));
    }

    // Non-numeric strings - can't interpolate
    // TODO: should we just take B?
    throw new Error(
      `Cannot lerp prop "${key}": different non-numeric values (${valA} vs ${valB})`,
    );
  } else {
    // Different non-numeric values
    // TODO: should we just take B?
    throw new Error(
      `Cannot lerp prop "${key}": different non-numeric values (${valA} vs ${valB})`,
    );
  }
}

/** Returns a clone of `element` with its opacity scaled by `factor`, or
 * `null` if the resulting opacity is below a small threshold. Used when an
 * element appears on only one side of a lerp. */
function fadeElement(element: Svgx, factor: number): Svgx | null {
  // A component's props are its own, so it can't take an opacity.
  if (isComponentElement(element)) return factor >= 0.5 ? element : null;
  const opacity = +(element.props.opacity ?? 1) * factor;
  if (opacity <= 1e-3) return null;
  return cloneElement(element, { opacity });
}

/**
 * Lerps between two SVG JSX nodes.
 * Interpolates transforms and recursively lerps children.
 */
export function lerpSvgx(a: Svgx, b: Svgx, t: number): Svgx {
  // Elements should be the same type
  if (a.type !== b.type) {
    throw new ErrorWithJSX(
      `Cannot lerp between different element types: ${String(
        a.type,
      )} and ${String(b.type)}`,
      <>
        <p style={{ marginBottom: 8 }}>
          During interpolation, I found elements of different types at the same
          path in the "before" and "after" SVG trees. I don't know how to
          interpolate between those, sorry.
        </p>
        {a.props.id !== undefined && a.props.id === b.props.id && (
          <p style={{ marginBottom: 8 }}>
            (FYI: These elements share the ID{" "}
            <span style={{ fontFamily: "monospace" }}>{a.props.id}</span>. I
            would guess that you are drawing this element in two different code
            paths, and they don't match up.)
          </p>
        )}
        <PrettyPrint value={a} />
        <div style={{ marginTop: 16, marginBottom: 16 }}>vs</div>
        <PrettyPrint value={b} />
      </>,
    );
  }

  if (isComponentElement(a)) return lerpComponentElement(a, b, t);

  const propsA = a.props;
  const propsB = b.props;

  // Lerp transform if present
  const transformA = propsA.transform || "";
  const transformB = propsB.transform || "";
  const lerpedTransform = lerpTransformString(transformA, transformB, t);

  // Lerp props
  const lerpedProps: SvgxProps = {};
  const allPropKeys = new Set([...objectKeys(propsA), ...objectKeys(propsB)]);

  for (const key of allPropKeys) {
    if (key === "children" || key === "transform") continue;
    // TODO: audit handling of data- props
    if (key.startsWith("data-")) continue;
    if (key.startsWith("dragology")) continue;
    if (/^on[A-Z]/.test(key)) continue;
    if (NO_LERP_PROPS.has(key)) {
      lerpedProps[key] = propsB[key] as any; // too hard to type
      continue;
    }

    const valA = propsA[key];
    const valB = propsB[key];

    // Special handling for style objects
    if (
      key === "style" &&
      typeof valA === "object" &&
      typeof valB === "object"
    ) {
      const styleA = valA || {};
      const styleB = valB || {};
      const lerpedStyle: any = {};
      const allStyleKeys = new Set([
        ...objectKeys(styleA),
        ...objectKeys(styleB),
      ]);

      for (const styleKey of allStyleKeys) {
        if (NO_LERP_PROPS.has(styleKey)) {
          lerpedStyle[styleKey] = styleB[styleKey];
          continue;
        }

        lerpedStyle[styleKey] = lerpValue(
          styleKey,
          styleA[styleKey],
          styleB[styleKey],
          t,
        );
      }

      lerpedProps[key] = lerpedStyle;
    } else {
      lerpedProps[key] = lerpValue(key, valA, valB, t);
    }
  }

  // For foreignObject and other opaque elements, just use children
  // from A, untouched.
  if (!shouldRecurseIntoChildren(a)) {
    return React.cloneElement(a, {
      ...lerpedProps,
      ...(lerpedTransform ? { transform: lerpedTransform } : {}),
    });
  }

  // Lerp children recursively. Besides elements, text content like
  // strings and numbers can appear (e.g. inside `<text>`/`<tspan>`).
  type ChildNode = ReturnType<typeof childrenToArray>[number];
  const childrenA = childrenToArray(propsA.children);
  const childrenB = childrenToArray(propsB.children);

  const lerpedChildren: ChildNode[] = [];

  // Pair up children into slots. A slot is identified by the same step
  // that `assignPaths` would use: `dragologyKey` when present, otherwise
  // the position among unkeyed siblings (as a string). Iteration order
  // follows A first, then B-only slots at the end — preserving A's tree
  // order when possible.
  type Slot = { a?: ChildNode; b?: ChildNode };
  const slots = new Map<string, Slot>();
  const addChildren = (children: ChildNode[], side: "a" | "b") => {
    let unkeyedIdx = 0;
    for (const child of children) {
      const dKey = isValidSvgx(child) ? child.props.dragologyKey : undefined;
      const slotKey = dKey !== undefined ? dKey : String(unkeyedIdx++);
      const slot = slots.get(slotKey) ?? {};
      slot[side] = child;
      slots.set(slotKey, slot);
    }
  };
  addChildren(childrenA, "a");
  addChildren(childrenB, "b");

  for (const { a: childA, b: childB } of slots.values()) {
    if (childA !== undefined && childB !== undefined) {
      if (isValidSvgx(childA) && isValidSvgx(childB)) {
        lerpedChildren.push(lerpSvgx(childA, childB, t));
      } else {
        // Non-element (e.g. text node) — just use A
        lerpedChildren.push(childA);
      }
    } else if (childA !== undefined && isValidSvgx(childA)) {
      const faded = fadeElement(childA, 1 - t);
      if (faded) lerpedChildren.push(faded);
    } else if (childB !== undefined && isValidSvgx(childB)) {
      const faded = fadeElement(childB, t);
      if (faded) lerpedChildren.push(faded);
    }
  }

  return React.cloneElement(a, {
    ...lerpedProps,
    ...(lerpedTransform ? { transform: lerpedTransform } : {}),
    children: lerpedChildren.length === 0 ? undefined : lerpedChildren,
  });
}

// # Component elements

/**
 * A component's props mean whatever the component says they mean, so
 * by default we take them all from the nearer side. Props named in
 * `dragologyLerpProps` (or all of them, for `true`) are blended with
 * `lerpData`.
 */
function lerpComponentElement(a: Svgx, b: Svgx, t: number): Svgx {
  const near = t < 0.5 ? a : b;
  const { dragologyLerpProps: lerpProps } =
    near.props as React.JSX.IntrinsicAttributes;
  if (!lerpProps) return near;

  const keys =
    lerpProps === true
      ? new Set([...objectKeys(a.props), ...objectKeys(b.props)])
      : lerpProps;
  if (lerpProps !== true) warnAboutUnknownLerpProps(near, keys, a, b);
  const lerped: Record<string, unknown> = {};
  for (const key of keys) {
    if (
      key === "children" ||
      key.startsWith("data-") ||
      key.startsWith("dragology") ||
      typeof a.props[key as keyof SvgxProps] === "function"
    ) {
      continue;
    }
    lerped[key] = lerpData(
      key,
      a.props[key as keyof SvgxProps],
      b.props[key as keyof SvgxProps],
      t,
    );
  }
  return cloneElement(near, lerped);
}

const warnedLerpProps = new Set<string>();

/** Catches typos in dragologyLerpProps. Warns once per component & prop. */
function warnAboutUnknownLerpProps(
  near: Svgx,
  keys: Iterable<string>,
  a: Svgx,
  b: Svgx,
): void {
  for (const key of keys) {
    if (key in a.props || key in b.props) continue;
    const id = `${elementName(near)}.${key}`;
    if (warnedLerpProps.has(id)) continue;
    warnedLerpProps.add(id);
    console.warn(
      `dragologyLerpProps on <${elementName(near)}> lists "${key}", ` +
        `but it has no prop by that name.`,
    );
  }
}

/**
 * Lerps plain data: numbers, colors, and anything `lerpValue` handles,
 * recursing into same-length arrays and same-keyed plain objects.
 * Anything else snaps to the nearer side rather than throwing.
 */
function lerpData(
  key: string,
  valA: unknown,
  valB: unknown,
  t: number,
): unknown {
  if (valA === valB) return valA;
  if (Array.isArray(valA) && Array.isArray(valB)) {
    if (valA.length !== valB.length) return t < 0.5 ? valA : valB;
    return valA.map((v, i) => lerpData(key, v, valB[i], t));
  }
  if (isPlainObject(valA) && isPlainObject(valB)) {
    const keysA = Object.keys(valA);
    const keysB = Object.keys(valB);
    if (
      keysA.length !== keysB.length ||
      !keysA.every((k) => Object.hasOwn(valB, k))
    ) {
      return t < 0.5 ? valA : valB;
    }
    return Object.fromEntries(
      keysA.map((k) => [k, lerpData(k, valA[k], valB[k], t)]),
    );
  }
  if (
    typeof valA === "string" &&
    typeof valB === "string" &&
    color(valA) &&
    color(valB)
  ) {
    return interpolateColor(valA, valB)(t);
  }
  try {
    return lerpValue(key, valA, valB, t);
  } catch {
    return t < 0.5 ? valA : valB;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// # CSS filter interpolation

type DropShadow = {
  offsetX: number;
  offsetY: number;
  blur: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

const DROP_SHADOW_RE =
  /^drop-shadow\(\s*([\d.+-]+)(?:px)?\s+([\d.+-]+)(?:px)?\s+([\d.+-]+)(?:px)?\s+rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*\)$/;

function parseDropShadow(s: string): DropShadow | null {
  const m = s.match(DROP_SHADOW_RE);
  if (!m) return null;
  return {
    offsetX: parseFloat(m[1]),
    offsetY: parseFloat(m[2]),
    blur: parseFloat(m[3]),
    r: parseFloat(m[4]),
    g: parseFloat(m[5]),
    b: parseFloat(m[6]),
    a: parseFloat(m[7]),
  };
}

function serializeDropShadow(ds: DropShadow): string {
  return `drop-shadow(${ds.offsetX}px ${ds.offsetY}px ${ds.blur}px rgba(${ds.r},${ds.g},${ds.b},${ds.a}))`;
}

function lerpDropShadow(a: DropShadow, b: DropShadow, t: number): string {
  return serializeDropShadow({
    offsetX: lerp(a.offsetX, b.offsetX, t),
    offsetY: lerp(a.offsetY, b.offsetY, t),
    blur: lerp(a.blur, b.blur, t),
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  });
}

function tryLerpFilter(a: string, b: string, t: number): string | null {
  const dsA = parseDropShadow(a);
  const dsB = parseDropShadow(b);
  if (dsA && dsB) return lerpDropShadow(dsA, dsB, t);
  return null;
}

// # Emerge animation support

type EmergeBounds = {
  rectWidth: number;
  rectHeight: number;
  textY: number | null;
};

/** Finds the first <rect>'s dimensions and first <text>'s y position (direct children only). */
function findEmergeBounds(element: Svgx): EmergeBounds | null {
  const children = React.Children.toArray(element.props.children) as Svgx[];

  let rectWidth: number | null = null;
  let rectHeight: number | null = null;
  let textY: number | null = null;

  for (const child of children) {
    if (React.isValidElement(child)) {
      // TODO: fix "as any" below
      if (child.type === "rect" && rectWidth === null) {
        const props = child.props as any;
        rectWidth = parseFloat(props.width);
        rectHeight = parseFloat(props.height);
      } else if (child.type === "text" && textY === null) {
        const props = child.props as any;
        textY = parseFloat(props.y);
      }
    }
  }

  if (
    rectWidth !== null &&
    rectHeight !== null &&
    !isNaN(rectWidth) &&
    !isNaN(rectHeight)
  ) {
    return {
      rectWidth,
      rectHeight,
      textY: textY !== null && !isNaN(textY) ? textY : null,
    };
  }
  return null;
}

/** Clone element with modified first <rect> dimensions and first <text> y. */
function cloneWithBounds(element: Svgx, bounds: EmergeBounds): Svgx {
  const props = element.props;
  const children = React.Children.toArray(props.children) as Svgx[];

  let foundRect = false;
  let foundText = false;
  const newChildren = children.map((child) => {
    if (React.isValidElement(child)) {
      if (!foundRect && child.type === "rect") {
        foundRect = true;
        return cloneElement(child, {
          width: bounds.rectWidth,
          height: bounds.rectHeight,
        });
      } else if (!foundText && child.type === "text" && bounds.textY !== null) {
        foundText = true;
        return cloneElement(child, { y: bounds.textY });
      }
    }
    return child;
  });

  return cloneElement(element, { children: newChildren });
}

/**
 * Creates a synthetic "before" version of an emerging element.
 *
 * Strategy:
 * 1. If dragologyEmergeMode="clone", position at origin with full opacity (split/merge)
 * 2. If both elements have rect+text structure, use bounds interpolation
 * 3. Otherwise, fall back to transform scale(0) + opacity 0
 */
function createSyntheticBefore(newElement: Svgx, originElement: Svgx): Svgx {
  const originTransform = originElement.props.transform || "";
  const emergeMode = newElement.props.dragologyEmergeMode;

  if (emergeMode === "clone") {
    const originBounds = findEmergeBounds(originElement);
    const newBounds = findEmergeBounds(newElement);
    if (originBounds && newBounds) {
      const synthetic = cloneWithBounds(newElement, originBounds);
      return cloneElement(synthetic, {
        transform: originTransform || undefined,
      });
    }
    return cloneElement(newElement, {
      transform: originTransform || undefined,
    });
  }

  // Try bounds-based interpolation (nicer for rect+text tree nodes)
  if (emergeMode !== "scale") {
    const originBounds = findEmergeBounds(originElement);
    const newBounds = findEmergeBounds(newElement);
    if (originBounds && newBounds) {
      const synthetic = cloneWithBounds(newElement, originBounds);
      return cloneElement(synthetic, {
        transform: originTransform || undefined,
        opacity: 0,
      });
    }
  }

  // Fallback: scale from 0 at origin's position
  return cloneElement(newElement, {
    transform: originTransform + " scale(0)",
    opacity: 0,
  });
}

/**
 * For each element in `source` that has a `dragologyEmergeFrom` attribute and is
 * missing from `target`, inject a synthetic "before" version into `target`
 * using the referenced origin element from `origins`.
 */
function augmentWithEmerging(
  target: Map<string, Layer>,
  source: Map<string, Layer>,
  origins: Map<string, Layer>,
) {
  for (const [key, val] of source) {
    if (!target.has(key)) {
      const emergeFromId = val.element.props.dragologyEmergeFrom;
      if (emergeFromId && typeof emergeFromId === "string") {
        const originLayer = origins.get(emergeFromId);
        if (originLayer) {
          target.set(key, {
            element: createSyntheticBefore(val.element, originLayer.element),
            stackingPath: val.stackingPath,
          });
        }
      }
    }
  }
}

export function lerpLayered(
  a: LayeredSvgx,
  b: LayeredSvgx,
  t: number,
): LayeredSvgx {
  // Preprocess: inject synthetic versions of emerging elements in BOTH directions.
  // Bidirectional handling is needed because Delaunay interpolation can flip direction.
  const augmentedA = new Map(a.byId);
  const augmentedB = new Map(b.byId);
  augmentWithEmerging(augmentedA, b.byId, a.byId);
  augmentWithEmerging(augmentedB, a.byId, b.byId);

  // Main lerp loop
  const result = new Map<string, Layer>();
  const allKeys = new Set([...augmentedA.keys(), ...augmentedB.keys()]);

  for (const key of allKeys) {
    const aVal = augmentedA.get(key);
    const bVal = augmentedB.get(key);

    if (aVal && bVal) {
      result.set(key, {
        element: lerpSvgx(aVal.element, bVal.element, t),
        stackingPath: aVal.stackingPath,
      });
    } else if (aVal) {
      const faded = fadeElement(aVal.element, 1 - t);
      if (faded)
        result.set(key, { element: faded, stackingPath: aVal.stackingPath });
    } else if (bVal) {
      const faded = fadeElement(bVal.element, t);
      if (faded)
        result.set(key, { element: faded, stackingPath: bVal.stackingPath });
    }
  }

  // Merge descendant maps from both inputs. Lerping preserves the
  // parent-child nesting structure, so the descendant info stays valid.
  let descendents: Map<string, Set<string>> | null = null;
  if (a.descendents && b.descendents) {
    descendents = new Map(a.descendents);
    for (const [key, bSet] of b.descendents) {
      const existing = descendents.get(key);
      if (existing) {
        for (const id of bSet) existing.add(id);
      } else {
        descendents.set(key, new Set(bSet));
      }
    }
  } else {
    descendents = a.descendents ?? b.descendents;
  }

  return {
    byId: result,
    descendents,
  };
}

/**
 * Weighted interpolation of N LayeredSvgx values.
 * `weights` maps index (into `items`) → weight; weights must sum to 1.
 */
export function lerpLayeredWeighted(
  items: LayeredSvgx[],
  weights: Map<number, number>,
): LayeredSvgx {
  // Sort entries so we fold deterministically.
  const entries = [...weights.entries()]
    .filter(([, w]) => w > 1e-10)
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) return items[0];
  if (entries.length === 1) return items[entries[0][0]];

  // Fold pairwise: accumulate = lerp(accumulate, next, next_weight / remaining_weight)
  let acc = items[entries[0][0]];
  let accWeight = entries[0][1];

  for (let i = 1; i < entries.length; i++) {
    const [idx, w] = entries[i];
    const t = w / (accWeight + w);
    acc = lerpLayered(acc, items[idx], t);
    accWeight += w;
  }

  return acc;
}
