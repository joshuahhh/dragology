// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FuzzTarget, isDemo } from "../demo";
import { demoModules, shouldSkipDemo } from "../demo/testModules";
import { collectDraggables } from "../demo/ui";
import {
  describeFuzzAction,
  expectNoFuzzErrors,
  fuzzDraggable,
  FuzzOptions,
} from "./fuzzDraggable";

// Breadth-first exploration of every demo. Each target is explored
// from its initial state: every clickable is clicked, every draggable
// is dragged to every id'd element's center (and a few nudges),
// previews and interpolations are exercised, and reached states are
// explored in turn. Any thrown error fails the test.
//
// Targets come from the demo's `fuzz` option if it provides one;
// otherwise we mount the demo's component and collect whatever it
// mounts DemoDraggable with (i.e. its default configuration). A demo
// that yields no targets either way fails, unless it opts out with
// `fuzz: false`.
//
// This file only runs via `pnpm fuzz` (see vite.config.ts). Each
// target prints a one-line report of what was explored.
//
//   pnpm fuzz                                   # every demo (minutes)
//   pnpm fuzz -t "^fuzz perm$"                  # one demo
//   pnpm fuzz -t "^fuzz perm$" --watch
//
// Each target gets a time budget (default 1s), so run time is
// predictable but the amount explored depends on the machine. Raise
// it for a deeper one-off search:
//
//   FUZZ_SECONDS=30 pnpm fuzz -t "^fuzz perm$"
//
// FUZZ_STATES and FUZZ_ACTIONS add count limits on top, if wanted.

afterEach(cleanup);

const envInt = (name: string) => {
  const v = (globalThis as any).process?.env?.[name] as string | undefined;
  return v ? parseInt(v, 10) : undefined;
};

const envSeconds = envInt("FUZZ_SECONDS");
const envStates = envInt("FUZZ_STATES");
const envActions = envInt("FUZZ_ACTIONS");

// Time is the budget; the count limits are off unless asked for.
const defaultOptions: FuzzOptions<any> = {
  maxTimeMs: 1000,
  maxStates: Infinity,
  maxActions: Infinity,
};

// Env overrides beat per-target options.
const envOptions: FuzzOptions<any> = {
  ...(envSeconds !== undefined && { maxTimeMs: envSeconds * 1000 }),
  ...(envStates !== undefined && { maxStates: envStates }),
  ...(envActions !== undefined && { maxActions: envActions }),
};

const stopReasonText = {
  exhaustive: "exhaustive",
  states: "hit state limit",
  actions: "hit action limit",
  errors: "hit error limit",
  time: "hit time limit",
};

function collectTargetsByMounting(
  Component: React.ComponentType,
): FuzzTarget[] {
  const stop = collectDraggables();
  // Mount errors are the demos test's business; here we just want the
  // draggables, so silence React's console noise.
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
  } finally {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    cleanup();
  }
  return stop().map((c, i) => ({ ...c, name: i === 0 ? undefined : `#${i}` }));
}

describe("fuzz", () => {
  for (const { id, load } of demoModules) {
    if (shouldSkipDemo(id)) continue;

    it(id, { timeout: 300_000 }, async (ctx) => {
      const mod = await load();
      if (!isDemo(mod.default)) return ctx.skip();
      const demoInfo = mod.default;
      if (demoInfo.fuzz === false) return ctx.skip();
      const targets =
        demoInfo.fuzz ?? collectTargetsByMounting(demoInfo.Component);
      if (targets.length === 0) {
        throw new Error(
          `${id} yielded no fuzz targets. Give its demo(...) options ` +
            "explicit `fuzz` targets, or `fuzz: false` to opt out.",
        );
      }
      for (const target of targets) {
        const label = `${id}${target.name ? ` / ${target.name}` : ""}`;
        const report = fuzzDraggable(target.draggable, target.initialState, {
          ...defaultOptions,
          ...target.options,
          ...envOptions,
        });
        console.log(
          `${label}: ${report.statesVisited} states visited ` +
            `to depth ${report.maxDepthVisited} ` +
            `(${report.statesQueued} reached), ${report.actionsTried} actions, ` +
            `${report.errors.length} errors, ` +
            `${(report.elapsedMs / 1000).toFixed(1)}s ` +
            `[${stopReasonText[report.stopReason]}]; ` +
            `initial state offers ${report.initialStateActions} actions` +
            (report.slowestAction
              ? `; slowest ${report.slowestAction.ms.toFixed(0)}ms ` +
                `(${describeFuzzAction(report.slowestAction.action)})`
              : ""),
        );
        expectNoFuzzErrors(report, label);
        expect(report.statesVisited).toBeGreaterThan(0);
      }
    });
  }
});
