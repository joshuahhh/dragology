import { expectTypeOf, test } from "vitest";

function Widget(_props: { value: number }) {
  return null;
}

test("dragologyLerpProps is allowed on component elements only", () => {
  expectTypeOf(
    <Widget value={1} dragologyLerpProps={["value"]} />,
  ).toBeObject();
  // @ts-expect-error not a prop of intrinsic elements
  expectTypeOf(<circle dragologyLerpProps={["r"]} />).toBeObject();
});

test("dragologyKey is allowed on intrinsic elements only", () => {
  expectTypeOf(<circle dragologyKey="c" />).toBeObject();
  // @ts-expect-error wrap the component in a <g dragologyKey> instead
  expectTypeOf(<Widget value={1} dragologyKey="w" />).toBeObject();
});
