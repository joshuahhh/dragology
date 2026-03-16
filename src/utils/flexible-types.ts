import { isArray } from "./js";

/**
 * Many<T> is convenient sugar for T[] which automatically flattens
 * nested arrays and turns undefined/null/false into [].
 *
 * (Note that this means T cannot overlap with array types!)
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
    } else if (isArray(a)) {
      a.forEach(helper);
    } else {
      result.push(a);
    }
  }
  helper(a);
  return result;
}

/**
 * Reader<T, S> is convenient sugar for (s: S) => T. It automatically
 * evaluates any functions that take an S input.
 *
 * (Note that this means T cannot overlap with function types!)
 */
export type Reader<T, S> = T | ((s: S) => Reader<T, S>);

/**
 * Turn a Reader<T, S> into a T, given the S value to read.
 */
export function readerToValue<T, S>(a: Reader<T, S>, s: S): T {
  if (typeof a === "function") {
    return readerToValue((a as (s: S) => Reader<T, S>)(s), s);
  } else {
    return a;
  }
}

/**
 * ManyReader<T, S> is convenient sugar for (s: S) => T[]. Like
 * Many<T>, it automatically flattens nested arrays and turns
 * undefined/null/false into []. It also evaluates any functions that
 * take an S input.
 *
 * (Note that this means T cannot overlap with array types or
 * function types!)
 */
export type ManyReader<T, S> = Many<T | ((s: S) => ManyReader<T, S>)>;

/**
 * Turn a ManyReader<T, S> into a T[], given the S value to read.
 */
export function manyReaderToArray<T, S>(a: ManyReader<T, S>, s: S): T[] {
  const result: T[] = [];
  function helper(a: ManyReader<T, S>) {
    for (const leaf of manyToArray(a)) {
      // Cast below corresponds to the assumption that T doesn't
      // overlap with function types
      if (typeof leaf === "function") {
        helper((leaf as (s: S) => ManyReader<T, S>)(s));
      } else {
        result.push(leaf);
      }
    }
  }
  helper(a);
  return result;
}
