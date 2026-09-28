import {
  DragResult,
  dragSpecToBehavior,
  setupPivotTableBenchmark,
} from "#dragology-built";
import { BenchCompareOptions, test } from "vitest";

type SetupResult = ReturnType<typeof setupPivotTableBenchmark>;
type State = SetupResult["ctx"]["startState"];

const benchCompareOptions: BenchCompareOptions = {
  time: 1,
  warmup: false,
  iterations: 5,
};

// Many elements, few candidate states. Compares dragging different chips
// from the initial state: dimensions ("region", "quarter") have ~8
// candidate states; the measure "units" has 3.
const FIELDS = ["region", "quarter", "units"];

test("pivot-table: dragologyOnDrag callback", async ({ bench }) => {
  await bench.compare(
    ...FIELDS.map((field) => {
      const { callback } = setupPivotTableBenchmark(field);
      return bench(field, () => {
        callback();
      });
    }),
    benchCompareOptions,
  );
});

test("pivot-table: dragSpecToBehavior", async ({ bench }) => {
  await bench.compare(
    ...FIELDS.map((field) => {
      const { callback, ctx } = setupPivotTableBenchmark(field);
      const dragSpec = callback();
      return bench(field, () => {
        dragSpecToBehavior(dragSpec, ctx);
      });
    }),
    benchCompareOptions,
  );
});

test("pivot-table: behavior", async ({ bench }) => {
  await bench.compare(
    ...FIELDS.map((field) => {
      const { callback, ctx, pointer } = setupPivotTableBenchmark(field);
      const dragSpec = callback();
      const behavior = dragSpecToBehavior(dragSpec, ctx);
      return bench(field, () => {
        behavior({ pointer });
      });
    }),
    benchCompareOptions,
  );
});

test("pivot-table: preview", async ({ bench }) => {
  await bench.compare(
    ...FIELDS.map((field) => {
      const { callback, ctx, pointer } = setupPivotTableBenchmark(field);
      const dragSpec = callback();
      let result: DragResult<State>;
      return bench(
        field,
        {
          beforeEach: () => {
            const behavior = dragSpecToBehavior(dragSpec, ctx);
            result = behavior({ pointer });
          },
        },
        () => {
          result!.preview();
        },
      );
    }),
    benchCompareOptions,
  );
});
