import { memo, ReactNode } from "react";

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

export function objectEntries<T extends object>(obj: T): Entries<T> {
  return Object.entries(obj) as Entries<T>;
}

export function assertNever(_never: never, message?: string): never {
  throw new Error(
    message || `Reached unreachable code: unexpected value ${_never}`,
  );
}

export function assert(
  condition: boolean,
  msg?: string | (() => void),
): asserts condition {
  if (!condition) {
    if (typeof msg === "function") {
      console.group("Assertion failed; debug info:");
      msg();
      console.groupEnd();
      throw new Error("Assertion failed");
    } else {
      throw new Error(msg ?? "Assertion failed");
    }
  }
}

export function assertDefined<T>(
  x: T | undefined | null,
  msg?: string | (() => void),
): T {
  if (x === undefined || x === null) {
    if (typeof msg === "function") {
      console.group("Assertion failed; debug info:");
      msg();
      console.groupEnd();
      throw new Error("Assertion failed: value is undefined or null");
    } else {
      throw new Error(msg ?? "Assertion failed: value is undefined or null");
    }
  }
  return x;
}

export function assertWarning(
  condition: boolean,
  msg?: string | (() => void),
): void {
  if (!condition) {
    if (typeof msg === "function") {
      console.group("Warning assertion failed; debug info:");
      msg();
      console.groupEnd();
    } else {
      console.warn("Warning assertion failed:", msg || "");
    }
  }
}

// it's too easy to call clamp with arguments in the wrong order, so
// this one is symmetric
export function clamp(a: number, b: number, c: number): number {
  return a + b + c - Math.max(a, b, c) - Math.min(a, b, c);
}

export function defined<T>(x: T | undefined | null): x is T {
  return x !== undefined && x !== null;
}

export function pipe<T>(arg: T): T;
export function pipe<T1, T2>(arg: T1, fn1: (arg: T1) => T2): T2;
export function pipe<T1, T2, T3>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
): T3;
export function pipe<T1, T2, T3, T4>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
  fn3: (arg: T3) => T4,
): T4;
export function pipe<T1, T2, T3, T4, T5>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
  fn3: (arg: T3) => T4,
  fn4: (arg: T4) => T5,
): T5;
export function pipe<T1, T2, T3, T4, T5, T6>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
  fn3: (arg: T3) => T4,
  fn4: (arg: T4) => T5,
  fn5: (arg: T5) => T6,
): T6;
export function pipe<T1, T2, T3, T4, T5, T6, T7>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
  fn3: (arg: T3) => T4,
  fn4: (arg: T4) => T5,
  fn5: (arg: T5) => T6,
  fn6: (arg: T6) => T7,
): T7;
export function pipe<T1, T2, T3, T4, T5, T6, T7, T8>(
  arg: T1,
  fn1: (arg: T1) => T2,
  fn2: (arg: T2) => T3,
  fn3: (arg: T3) => T4,
  fn4: (arg: T4) => T5,
  fn5: (arg: T5) => T6,
  fn6: (arg: T6) => T7,
  fn7: (arg: T7) => T8,
): T8;
export function pipe(arg: unknown, ...fns: Array<(arg: unknown) => unknown>) {
  return fns.reduce((acc, fn) => fn(acc), arg);
}

/**
 * Many<T> is convenient sugar for T[] which automatically flattens
 * nested arrays and turns undefined/null/false into [].
 */
export type Many<T> = T | readonly Many<T>[] | undefined | null | false;

/**
 * Turn a Many<T> into a T[].
 */
export function manyToArray<T>(a: Many<T>): T[] {
  const result: T[] = [];
  function helper(a: Many<T>) {
    if (a === undefined || a === null || a === false) {
      return;
    } else if (Array.isArray(a)) {
      a.forEach(helper);
    } else {
      // This cast corresponds to the assumption that T doesn't
      // overlap with array types
      result.push(a as T);
    }
  }
  helper(a);
  return result;
}

/**
 * ManyReader<T, S> is convenient sugar for (s: S) => T[]. Like
 * Many<T>, it automatically flattens nested arrays and turns
 * undefined/null/false into []. It also evaluates any functions that
 * take an S input.
 *
 * (Note that this means T cannot overlap with function types!)
 */
export type ManyReader<T, S> = Many<T | ((s: S) => ManyReader<T, S>)>;

/**
 * Turn a ManyReader<T, S> into a T[], given the S value to read.
 */
export function manyReaderToArray<T, S>(a: ManyReader<T, S>, s: S): T[] {
  const result: T[] = [];
  function helper(a: ManyReader<T, S>) {
    for (const leaf of manyToArray(a)) {
      // Casts below correspond to the assumption that T doesn't
      // overlap with function types
      if (typeof leaf === "function") {
        helper((leaf as (s: S) => ManyReader<T, S>)(s));
      } else {
        result.push(leaf as T);
      }
    }
  }
  helper(a);
  return result;
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

export function emptyToUndefined<T>(arr: T[]): T[] | undefined {
  return arr.length === 0 ? undefined : arr;
}

export function throwError(): never {
  throw new Error("This function should not have been called");
}

/**
 * version of React.memo that works with generic components, maybe.
 */
export const memoGeneric = <C extends (...props: any) => ReactNode>(c: C) =>
  memo(c as any) as unknown as C;

export function uPairs<T>(l: T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < l.length; i++) {
    for (let j = i + 1; j < l.length; j++) {
      result.push([l[i], l[j]]);
    }
  }
  return result;
}

/**
 * Make a function that can be called either directly or as a template literal tag
 */
export function templateLiteralTagOrNot<R>(fn: (input: string) => R) {
  function wrapper(s: string): R;
  function wrapper(strings: TemplateStringsArray, ...values: unknown[]): R;
  function wrapper(a: any, ...rest: any[]): R {
    if (typeof a === "string") {
      return fn(a);
    } else {
      // Called as a template literal tag
      let out = a[0];
      for (let i = 0; i < rest.length; i++) {
        out += String(rest[i]) + a[i + 1];
      }
      return fn(out);
    }
  }
  return wrapper;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}
