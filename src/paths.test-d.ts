import { assertType, describe, it } from "vitest";
import { PathIn } from "./paths";

describe("PathIn type", () => {
  it("generates correct paths for values of specific types", () => {
    type TestObj = {
      a: number;
      b: {
        c: string;
        d: {
          e: boolean;
        };
      };
    };

    // Type tests - paths to number values
    assertType<PathIn<TestObj, number>>(["a"]);

    // Paths to string values
    assertType<PathIn<TestObj, string>>(["b", "c"]);

    // Paths to boolean values
    assertType<PathIn<TestObj, boolean>>(["b", "d", "e"]);

    // Paths to object values
    assertType<PathIn<TestObj, { c: string; d: { e: boolean } }>>(["b"]);
  });

  it("handles arrays", () => {
    type TestObj = {
      items: number[];
      nested: {
        values: string[];
      };
    };

    // Path to array
    assertType<PathIn<TestObj, number[]>>(["items"]);

    // Path to array element
    assertType<PathIn<TestObj, number>>(["items", 0]);
  });

  it.todo("rejects single-variant paths in discriminated unions", () => {
    type State =
      | { mode: "slider"; value: number }
      | { mode: "island"; id: string };

    // BUG: "value" only exists on the slider variant, so this should
    // be rejected — but PathIn distributes over the union and accepts
    // paths valid for ANY variant.

    // This line should be a single comment but https://github.com/vitest-dev/vitest/issues/9934
    // // @ts-expect-error — PathIn should reject this but doesn't (union distribution bug)
    assertType<PathIn<State, number>>(["value"]);
  });

  it("handles recursive tree types", () => {
    type Tree = {
      value: number;
      left?: Tree;
      right?: Tree;
    };

    assertType<PathIn<Tree, number>>(["value"]);
    assertType<PathIn<Tree, Tree | undefined>>(["left"]);
    assertType<PathIn<Tree, Tree | undefined>>(["right"]);

    // Note: PathIn allows paths through optional properties. These paths are
    // only valid at runtime if the optional properties are present.
    assertType<PathIn<Tree, number>>(["left", "value"]);
    assertType<PathIn<Tree, number>>(["right", "left", "value"]);
    assertType<PathIn<Tree, Tree | undefined>>(["left", "right", "left"]);
  });
});
