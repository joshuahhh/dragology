type Entries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

/** Better-typed Object.entries */
export function objectEntries<T extends object>(obj: T): Entries<T> {
  return Object.entries(obj) as Entries<T>;
}

type FromEntries<T> =
  T extends ReadonlyArray<
    readonly [infer K extends string | number | symbol, infer _V]
  >
    ? { [key in K]: Extract<T[number], readonly [key, any]>[1] }
    : never;

/** Better-typed Object.fromEntries */
export function objectFromEntries<
  T extends ReadonlyArray<readonly [PropertyKey, any]>,
>(entries: T): FromEntries<T> {
  return Object.fromEntries(entries) as FromEntries<T>;
}

/** Better-typed Object.keys */
export function objectKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

/** Better-typed Array.isArray */
export function isArray<T>(x: T | readonly T[] | T[]): x is readonly T[] | T[] {
  return Array.isArray(x);
}

export function defined<T>(x: T | undefined | null): x is T {
  return x !== undefined && x !== null;
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function hasKey<K extends string | number | symbol>(
  x: unknown,
  key: K,
): x is Record<K, unknown> {
  return isObject(x) && key in x;
}
