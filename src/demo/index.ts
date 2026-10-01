import { ComponentType } from "react";
import { Draggable } from "../draggable";
import { FuzzOptions } from "../fuzz/fuzzDraggable";

/**
 * A draggable + initial state that the fuzz tests (see
 * src/fuzz/demos.fuzz.test.ts) should explore breadth-first.
 */
export type FuzzTarget<T extends object = any> = {
  name?: string;
  draggable: Draggable<T>;
  initialState: T;
  options?: FuzzOptions<T>;
};

export type DemoOptions = {
  tags?: string[];
  cardClassName?: string;
  hideByDefault?: boolean;
  /**
   * Targets for breadth-first fuzz testing (src/fuzz). If omitted,
   * the test mounts the demo and fuzzes whatever it mounts
   * DemoDraggable with. `false` opts out entirely. A demo that
   * renders DraggableRenderer itself must list its targets here (or
   * opt out); the fuzz test fails on a demo that yields none.
   */
  fuzz?: FuzzTarget[] | false;
};

export type DemoInfo = {
  Component: ComponentType;
} & DemoOptions;

const DEMO_SYMBOL = Symbol("demo");

export type DemoMarked = DemoInfo & { [DEMO_SYMBOL]: true };

export function demo(
  Component: ComponentType,
  options?: DemoOptions,
): DemoMarked {
  return { Component, ...options, [DEMO_SYMBOL]: true };
}

export function isDemo(value: unknown): value is DemoMarked {
  return typeof value === "object" && value !== null && DEMO_SYMBOL in value;
}
