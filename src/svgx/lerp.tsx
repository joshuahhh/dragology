import { prettyLog, PrettyPrint } from "@joshuahhh/pretty-print";
import { rgb } from "d3-color";
import * as d3Interpolate from "d3-interpolate";
import { interpolatePath } from "d3-interpolate-path";
import React, { cloneElement } from "react";
import { shouldRecurseIntoChildren, Svgx } from ".";
import { ErrorWithJSX } from "../ErrorBoundary";
import { lerp } from "../math/vec2";
import { objectKeys } from "../utils/js";
import { LayeredSvgx } from "./layers";
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

const NO_LERP_PROPS = new Set(["pointerEvents"]);

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
  } else if (typeof valA === "string" && typeof valB === "string") {
    // Try to parse both as numbers
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);

    if (!isNaN(numA) && !isNaN(numB)) {
      // Both are numeric strings - interpolate and return as string
      return String(lerp(numA, numB, t));
    }

    // Non-numeric strings - can't interpolate
    throw new Error(
      `Cannot lerp prop "${key}": different non-numeric values (${valA} vs ${valB})`,
    );
  } else {
    // Different non-numeric values
    throw new Error(
      `Cannot lerp prop "${key}": different non-numeric values (${valA} vs ${valB})`,
    );
  }
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
        {a.props.id === b.props.id && (
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

  const propsA = a.props;
  const propsB = b.props;

  // Lerp transform if present
  const transformA = propsA.transform || "";
  const transformB = propsB.transform || "";
  const lerpedTransform = lerpTransformString(transformA, transformB, t);

  // Lerp numeric props (x, y, width, height, etc.)
  const lerpedNumericProps: any = {};
  const allPropKeys = new Set([...objectKeys(propsA), ...objectKeys(propsB)]);

  for (const key of allPropKeys) {
    if (key === "children" || key === "transform") continue;
    // TODO: audit handling of data- props
    if (key.startsWith("data-")) continue;
    if (key.startsWith("dragology")) continue;
    if (/^on[A-Z]/.test(key)) continue;
    if (NO_LERP_PROPS.has(key)) continue;

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
        lerpedStyle[styleKey] = lerpValue(
          styleKey,
          styleA[styleKey],
          styleB[styleKey],
          t,
        );
      }

      lerpedNumericProps[key] = lerpedStyle;
    } else {
      lerpedNumericProps[key] = lerpValue(key, valA, valB, t);
    }
  }

  // Lerp children recursively (skip foreignObject children)
  const childrenA = React.Children.toArray(propsA.children) as Svgx[];
  const childrenB = React.Children.toArray(propsB.children) as Svgx[];

  let lerpedChildren: Svgx[] = [];

  if (!shouldRecurseIntoChildren(a)) {
    // For foreignObject, just use children from A
    lerpedChildren = childrenA;
  } else if (childrenA.length === childrenB.length) {
    lerpedChildren = childrenA.map((childA, i) => {
      const childB = childrenB[i];
      if (React.isValidElement(childA) && React.isValidElement(childB)) {
        return lerpSvgx(childA, childB, t);
      }
      // For text nodes or other non-element children, just use A
      return childA;
    });
  } else {
    // Children counts differ
    prettyLog(childrenA, { label: "Children A" });
    prettyLog(childrenB, { label: "Children B" });
    throw new ErrorWithJSX(
      `Cannot lerp children: different child counts (${childrenA.length} vs ${childrenB.length})`,
      <div>
        <PrettyPrint value={a} />
        <div style={{ marginTop: 16, marginBottom: 16 }}>vs</div>
        <PrettyPrint value={b} />
      </div>,
    );
  }

  return React.cloneElement(a, {
    ...lerpedNumericProps,
    ...(lerpedTransform ? { transform: lerpedTransform } : {}),
    children: lerpedChildren.length === 0 ? undefined : lerpedChildren,
  });
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
  target: Map<string, Svgx>,
  source: Map<string, Svgx>,
  origins: Map<string, Svgx>,
) {
  for (const [key, val] of source) {
    if (!target.has(key)) {
      const emergeFromId = val.props.dragologyEmergeFrom;
      if (emergeFromId && typeof emergeFromId === "string") {
        const originElement = origins.get(emergeFromId);
        if (originElement) {
          target.set(key, createSyntheticBefore(val, originElement));
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
  const result = new Map<string, Svgx>();
  const allKeys = new Set([...augmentedA.keys(), ...augmentedB.keys()]);

  for (const key of allKeys) {
    const aVal = augmentedA.get(key);
    const bVal = augmentedB.get(key);

    if (aVal && bVal) {
      result.set(key, lerpSvgx(aVal, bVal, t));
    } else if (aVal) {
      const opacity = +(aVal.props.opacity ?? 1) * (1 - t);
      if (opacity > 1e-3) result.set(key, cloneElement(aVal, { opacity }));
    } else if (bVal) {
      const opacity = +(bVal.props.opacity ?? 1) * t;
      if (opacity > 1e-3) result.set(key, cloneElement(bVal, { opacity }));
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
