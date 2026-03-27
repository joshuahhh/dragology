// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { isDemo } from ".";
import { demoList } from "./list";
import { pathToId } from "./pathToId";

// These tests check that each demo component can be rendered without
// errors or warnings. They don't actually check dragging, because
// that requires a user interaction. That would be fun, wouldn't it?

afterEach(cleanup);

// Lazy glob (no `eager: true`) so each module is only loaded inside
// its own test body. We don't import from ./registry here, because
// that uses `eager: true`, which would load every demo at collection
// time and let one demo's module-level side effects (e.g. bluefish
// initializing a canvas) crash the entire test file before any tests
// run.
const modules = import.meta.glob<{ default: unknown }>("../demos/**/*.tsx");

function shouldSkip(id: string) {
  if (id.startsWith("bluefish-")) {
    // these require more browser-specific infra to run
    return true;
  }
  return false;
}

for (const id of demoList) {
  if (shouldSkip(id)) continue;

  it(id, async () => {
    const load = Object.entries(modules).find(
      ([path]) => pathToId(path) === id,
    )?.[1];
    if (!load) throw new Error(`No module found for demo "${id}"`);

    const mod = await load();
    if (!isDemo(mod.default)) throw new Error(`"${id}" is not a demo`);

    const { Component } = mod.default;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );

    const errors = errorSpy.mock.calls;
    const warnings = warnSpy.mock.calls;
    vi.restoreAllMocks();

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
}
