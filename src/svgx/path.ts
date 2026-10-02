import {
  assertNoDragologyKeyOnComponent,
  findElement,
  FindElementResult,
  isComponentElement,
  Svgx,
  updateElement,
} from ".";
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
  // On a component element, `id` is the component's own prop (see
  // assertNoDragologyKeyOnComponent).
  const id = isComponentElement(element) ? undefined : element.props.id;

  assert(
    !id || !id.includes("/"),
    `Element id "${id}" contains a slash, which is not allowed.`,
  );

  const elementPath: string = id ? id + "/" : currentPath;

  assert(
    !(typeof element.key === "string" && !element.key.startsWith(".")),
    `Element with path "${elementPath}" has a key prop (${element.key}), which is not allowed.`,
  );

  const usedSteps = new Set<string>();
  let unkeyedIndex = 0;
  return updateElement(
    element,
    (child) => {
      assertNoDragologyKeyOnComponent(child);
      let step: string;
      const { dragologyKey } = child.props;
      if (dragologyKey !== undefined) {
        assert(
          !dragologyKey.includes("/"),
          `Element dragologyKey "${dragologyKey}" contains a slash, which is not allowed.`,
        );
        step = dragologyKey;
      } else {
        step = String(unkeyedIndex);
        unkeyedIndex++;
      }
      assert(
        !usedSteps.has(step),
        `Duplicate path step "${step}" among siblings of path "${elementPath}" (can happen when a dragologyKey collides with an unkeyed sibling's index).`,
      );
      usedSteps.add(step);
      return assignPathsRecursive(child, elementPath + step + "/");
    },
    {
      [pathPropName as any]: elementPath,
    },
  );
}

// TODO: actually follow paths rather than searching the whole tree
export function findByPath(path: string, node: Svgx): FindElementResult | null {
  return findElement(node, (el) => getPath(el) === path);
}
