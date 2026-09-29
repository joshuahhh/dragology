/**
 * Shared helpers for tests that iterate over demo modules.
 *
 * The glob is lazy (no `eager: true`) so each module is only loaded
 * inside its own test body. We don't use ./registry here, because
 * that loads every demo at collection time and lets one demo's
 * module-level side effects (e.g. bluefish initializing a canvas)
 * crash the entire test file before any tests run.
 */

import { pathToId } from "./pathToId";

const modules = import.meta.glob<{ default: unknown }>("../demos/**/*.tsx");

export type DemoModuleEntry = {
  id: string;
  load: () => Promise<{ default: unknown }>;
};

/** Every demo module, by id, whether or not it's listed. */
export const demoModules: DemoModuleEntry[] = Object.entries(modules).map(
  ([path, load]) => ({ id: pathToId(path), load }),
);

export function findDemoModule(id: string): DemoModuleEntry | undefined {
  return demoModules.find((m) => m.id === id);
}

/** Demos that can't be loaded in the test environment. */
export function shouldSkipDemo(id: string): boolean {
  if (id.startsWith("bluefish-")) {
    // these require more browser-specific infra to run
    return true;
  }
  return false;
}
