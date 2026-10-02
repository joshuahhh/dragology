// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Draggable } from "../draggable";
import { DraggableRenderer } from "../DraggableRenderer";

afterEach(cleanup);

it("a component element gets its own props, minus Dragology's", () => {
  let received: Record<string, unknown> | undefined;
  function Widget(props: { id: string; value: number }) {
    received = props;
    return null;
  }
  const draggable: Draggable<{ value: number }> = ({ state }) => (
    <g>
      <Widget id="x" value={state.value} dragologyLerpProps={["value"]} />
    </g>
  );

  render(
    <DraggableRenderer
      draggable={draggable}
      initialState={{ value: 1 }}
      width={100}
      height={100}
    />,
  );

  expect(received).toEqual({ id: "x", value: 1 });
});
