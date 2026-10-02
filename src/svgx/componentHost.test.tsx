// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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

it("pointer events in a component bubble to the enclosing drag", () => {
  // jsdom has no SVG lengths; the pointer math reads this.
  Object.defineProperty(SVGSVGElement.prototype, "width", {
    configurable: true,
    get: () => ({ baseVal: { value: 0 } }),
  });

  function Widget() {
    return <div data-testid="widget">hi</div>;
  }
  const onDrag = vi.fn();
  const draggable: Draggable<{ n: number }> = ({ state, d }) => (
    <g>
      <foreignObject
        id="card"
        width={50}
        height={50}
        dragologyOnDrag={() => {
          onDrag();
          return d.fixed(state);
        }}
      >
        <Widget />
      </foreignObject>
    </g>
  );

  const { getByTestId } = render(
    <DraggableRenderer
      draggable={draggable}
      initialState={{ n: 0 }}
      width={100}
      height={100}
    />,
  );
  fireEvent.pointerDown(getByTestId("widget"));

  expect(onDrag).toHaveBeenCalledTimes(1);
});
