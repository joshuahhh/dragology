import { findElement, FindElementResult, Svgx, updateElement } from ".";
import { assert } from "../utils/assert";

const pathPropName = "data-path";

export function getPath(element: Svgx): string | undefined {
  const props = element.props as any;
  return props[pathPropName];
}

/**
 * Walks a JSX tree and assigns paths to every element using data-path.
 * - Root gets "/"
 * - By default uses numerical indices for children (0, 1, 2, ...)
 * - If id is present, uses that as the absolute path
 * - Paths are stored as strings in data-path
 */
export function assignPaths(element: Svgx): Svgx {
  return assignPathsRecursive(element, "/");
}

function assignPathsRecursive(element: Svgx, currentPath: string): Svgx {
  const { id } = element.props;

  assert(
    !id || !id.includes("/"),
    `Element id "${id}" contains a slash, which is not allowed.`,
  );

  const elementPath: string = id ? id + "/" : currentPath;

  assert(
    !(typeof element.key === "string" && !element.key.startsWith(".")),
    `Element with path "${elementPath}" has a key prop (${element.key}), which is not allowed.`,
  );

  return updateElement(
    element,
    (child, index) =>
      assignPathsRecursive(child, elementPath + String(index) + "/"),
    {
      [pathPropName as any]: elementPath,
    },
  );
}

// TODO: actually follow paths rather than searching the whole tree
export function findByPath(path: string, node: Svgx): FindElementResult | null {
  return findElement(node, (el) => getPath(el) === path);
}
