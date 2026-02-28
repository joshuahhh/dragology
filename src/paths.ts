// Path utilities for type-safe nested object access

// PathIn<T, V> represents all valid paths through T that lead to a value of type V
// Uses a depth counter (Depth tuple) to prevent infinite recursion with recursive types
export type PathIn<T, V, Depth extends 0[] = []> = Depth["length"] extends 10
  ? [] // Stop recursion at depth 10
  : T extends V
    ? [] | DeeperPaths<T, V, Depth>
    : DeeperPaths<T, V, Depth>;

type DeeperPaths<T, V, Depth extends 0[]> = T extends object
  ? {
      [K in keyof T]-?: PathIn<T[K], V, [...Depth, 0]> extends infer P
        ? P extends []
          ? [K]
          : P extends [infer First, ...infer Rest]
            ? [K, First, ...Rest]
            : never
        : never;
    }[keyof T]
  : never;

// Get value at path with type safety
export function getAtPath<T, V>(obj: T, path: PathIn<T, V>): V {
  let cur: any = obj;
  for (const key of path) {
    cur = cur[key];
  }
  return cur;
}

// Set value at path immutably, preserving type structure
export function setAtPath<T, V>(obj: T, path: PathIn<T, V>, value: V): T {
  const [first, ...rest] = path as [any, ...any[]];

  if (rest.length === 0) {
    if (Array.isArray(obj)) {
      const newArr = obj.slice();
      newArr[first as number] = value;
      return newArr as T;
    }
    return objCloneAndSet(obj, first, value as any);
  }

  if (Array.isArray(obj)) {
    const newArr = obj.slice();
    newArr[first as number] = setAtPath(
      obj[first as number],
      rest as any,
      value,
    );
    return newArr as T;
  }

  return objCloneAndSet(
    obj,
    first,
    setAtPath((obj as any)[first], rest as any, value),
  );
}

function objCloneAndSet<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(obj)),
    obj,
  ) as T;
  clone[key] = value;
  return clone;
}

// Compute the value type at a given path through T
export type ValueAtPath<
  T,
  P extends readonly (string | number | symbol)[],
> = P extends readonly [infer K, ...infer Rest]
  ? K extends keyof T
    ? Rest extends readonly (string | number | symbol)[]
      ? ValueAtPath<T[K], Rest>
      : never
    : never
  : T;
