import { Child, render } from "bluefish-js";
import parse from "html-react-parser";
import React, { ReactNode, SVGAttributes } from "react";
import { Svgx } from "../../svgx";
import { assert } from "../../utils/assert";

function parseViewBox(viewBox: string | null): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} | null {
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/\s+/);
  if (parts.length !== 4) return null;
  return {
    minX: parseFloat(parts[0]),
    minY: parseFloat(parts[1]),
    width: parseFloat(parts[2]),
    height: parseFloat(parts[3]),
  };
}

function calculateViewBoxTransform(svg: SVGSVGElement): string {
  const width = parseFloat(svg.getAttribute("width") || "0");
  const height = parseFloat(svg.getAttribute("height") || "0");
  const viewBox = parseViewBox(svg.getAttribute("viewBox"));

  if (!viewBox || !width || !height) {
    return "";
  }

  const scaleX = width / viewBox.width;
  const scaleY = height / viewBox.height;
  const translateX = -viewBox.minX;
  const translateY = -viewBox.minY;

  return `translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})`;
}

function extractSvgContentsAsJsx(container: HTMLElement): Svgx {
  const svg = container.querySelector("svg");
  assert(!!svg, "No SVG element found in container");

  const transform = calculateViewBoxTransform(svg);
  const svgContent = svg.innerHTML;
  const parsed = parse(svgContent);

  return React.createElement("g", transform ? { transform } : {}, parsed);
}

function applyAttributesById(
  element: ReactNode,
  attribsById: Record<string, SVGAttributes<SVGElement>>,
  foundIds: Set<string>,
): ReactNode {
  if (!React.isValidElement(element)) {
    return element;
  }

  const props = element.props as { id?: string; children?: ReactNode };
  let newProps = props;

  if (props.children) {
    const childrenArray = React.Children.toArray(props.children);
    let someChildChanged = false;
    const newChildren = childrenArray.map((child) => {
      const updated = applyAttributesById(child, attribsById, foundIds);
      if (updated !== child) someChildChanged = true;
      return updated;
    });
    if (someChildChanged) {
      newProps = { ...newProps, children: newChildren };
    }
  }

  if (props.id && props.id in attribsById) {
    foundIds.add(props.id);
    newProps = {
      ...newProps,
      ...attribsById[props.id],
    };
  }

  return newProps === props ? element : React.cloneElement(element, newProps);
}

export function bluefish(
  spec: Child | Child[],
  attribsById?: Record<string, SVGAttributes<SVGElement>>,
): Svgx {
  const container = document.createElement("div");
  render(() => spec, container);
  let jsx = extractSvgContentsAsJsx(container);

  if (attribsById) {
    const foundIds = new Set<string>();
    jsx = applyAttributesById(jsx, attribsById, foundIds) as Svgx;
    const missingIds = Object.keys(attribsById).filter(
      (id) => !foundIds.has(id),
    );
    if (missingIds.length > 0) {
      throw new Error(
        `Missing elements with ids: ${missingIds.join(", ")}. ` +
          `These ids were specified in attribsById but not found in the Bluefish diagram.`,
      );
    }
  }

  return jsx;
}

export function bluefishWithAttach(
  specFunc: (
    attach: (id: string, attribs?: SVGAttributes<SVGElement>) => string,
  ) => Child | Child[],
): Svgx {
  const attribsById: Record<string, SVGAttributes<SVGElement>> = {};
  const spec = specFunc((id, attribs) => {
    attribsById[id] = attribs || {};
    return id;
  });
  return bluefish(spec, attribsById);
}
