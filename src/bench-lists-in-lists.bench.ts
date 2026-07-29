import {
  DragResult,
  dragSpecToBehavior,
  setupListsInListsBenchmark,
} from "#dragology-built";
import { BenchCompareOptions, test } from "vitest";

function powersOfTwoUpTo(max: number) {
  const result = [];
  for (let n = 2; n <= max; n *= 2) result.push(n);
  return result;
}

type SetupResult = ReturnType<typeof setupListsInListsBenchmark>;
type State = SetupResult["ctx"]["startState"];

const benchCompareOptions: BenchCompareOptions = {
  time: 1,
  warmup: false,
  iterations: 5,
};

test("lists-in-lists: dragologyOnDrag callback", async ({ bench }) => {
  await bench.compare(
    ...powersOfTwoUpTo(512).map((n) => {
      const { callback } = setupListsInListsBenchmark(n);
      return bench(`singleRowState(${n})`, () => {
        callback();
      });
    }),
    benchCompareOptions,
  );
});

test("lists-in-lists: dragSpecToBehavior", async ({ bench }) => {
  await bench.compare(
    ...powersOfTwoUpTo(512).map((n) => {
      const { callback, ctx } = setupListsInListsBenchmark(n);
      const dragSpec = callback();
      return bench(`singleRowState(${n})`, () => {
        dragSpecToBehavior(dragSpec, ctx);
      });
    }),
    benchCompareOptions,
  );
});

test("lists-in-lists: behavior", async ({ bench }) => {
  await bench.compare(
    ...powersOfTwoUpTo(1024).map((n) => {
      const { callback, ctx, pointer } = setupListsInListsBenchmark(n);
      const dragSpec = callback();
      const behavior = dragSpecToBehavior(dragSpec, ctx);
      return bench(`singleRowState(${n})`, () => {
        behavior({ pointer });
      });
    }),
    benchCompareOptions,
  );
});

test("lists-in-lists: preview", async ({ bench }) => {
  await bench.compare(
    ...powersOfTwoUpTo(512).map((n) => {
      const { callback, ctx, pointer } = setupListsInListsBenchmark(n);
      const dragSpec = callback();
      let result: DragResult<State>;
      return bench(
        `singleRowState(${n})`,
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
