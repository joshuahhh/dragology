import { memo, ReactNode } from "react";

// it's too easy to call clamp with arguments in the wrong order, so
// this one is symmetric
export function clamp(a: number, b: number, c: number): number {
  return a + b + c - Math.max(a, b, c) - Math.min(a, b, c);
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
