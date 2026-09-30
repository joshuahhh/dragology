// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { isDemo } from ".";
import { listedDemoIds } from "./list";
import { findDemoModule, shouldSkipDemo } from "./testModules";

// These tests check that each demo component can be rendered without
// errors or warnings. They don't actually check dragging, because
// that requires a user interaction. That would be fun, wouldn't it?

afterEach(cleanup);

for (const id of listedDemoIds) {
  if (shouldSkipDemo(id)) continue;

  it(id, async () => {
    const entry = findDemoModule(id);
    if (!entry) throw new Error(`No module found for demo "${id}"`);

    const mod = await entry.load();
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
