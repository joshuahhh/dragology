import { useCallback, useState } from "react";
import { demo } from "../demo";
import { DemoNotes } from "../demo/ui";
import {
  Draggable,
  DraggableRenderer,
  inOrder,
  param,
  translate,
} from "../lib";

type SwitchState = {
  value: boolean;
};

type SliderState = {
  t: number;
};

const SQUARE_SIZE = 40;
const TRACK_LENGTH = 60;

const switchDraggable: Draggable<SwitchState> = ({ state, d }) => (
  <g>
    <line
      x1={SQUARE_SIZE / 2}
      y1={SQUARE_SIZE / 2}
      x2={TRACK_LENGTH + SQUARE_SIZE / 2}
      y2={SQUARE_SIZE / 2}
      stroke="#cbd5e1"
      strokeWidth={6}
      strokeLinecap="round"
    />
    <rect
      id="switch"
      transform={translate(state.value ? TRACK_LENGTH : 0, 0)}
      width={SQUARE_SIZE}
      height={SQUARE_SIZE}
      rx={4}
      dragologyOnDrag={() =>
        d
          .between([{ value: true }, { value: false }])
          .withSnapRadius(10)
          .withDropTransition("elastic-out")
      }
    />
  </g>
);

const sliderDraggable: Draggable<SliderState> = ({ state, d }) => (
  <g>
    <line
      x1={0}
      y1={10}
      x2={100}
      y2={10}
      stroke="#cbd5e1"
      strokeWidth={4}
      strokeLinecap="round"
    />
    <circle
      id="knob"
      transform={translate(state.t * 100, 10)}
      r={8}
      dragologyOnDrag={() =>
        d.vary(state, param("t"), {
          constraint: (s) => inOrder(0, s.t, 1),
        })
      }
    />
  </g>
);

type DemoProps = { handlerName: "onDropState" | "onDragState" };

const SimpleDemo = ({ handlerName }: DemoProps) => {
  const [state, setState] = useState<SwitchState>({ value: false });

  return (
    <>
      <h3 className="text-md font-medium italic mt-6 mb-1">simple</h3>
      <DemoNotes>
        A normal use-case – the parent accepts changes from the draggable, but
        also makes its own changes.
      </DemoNotes>
      <div className="mb-2 text-sm text-slate-500">
        value: {String(state.value)}
      </div>
      <div className="mb-2">
        <button
          className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
          onClick={() => setState({ value: !state.value })}
        >
          Toggle externally
        </button>
      </div>
      <div className="mb-2">
        <DraggableRenderer
          draggable={switchDraggable}
          state={state}
          {...{ [handlerName]: setState }}
          width={150}
          height={40}
        />
      </div>
    </>
  );
};

const DoubleSwitchDemo = ({ handlerName }: DemoProps) => {
  const [state, setState] = useState<SwitchState>({ value: false });

  return (
    <>
      <h3 className="text-md font-medium italic mt-6 mb-1">double switch</h3>
      <DemoNotes>
        Two draggable components controlled by the same state.
      </DemoNotes>
      <div className="mb-2">
        <DraggableRenderer
          draggable={switchDraggable}
          state={state}
          {...{ [handlerName]: setState }}
          width={150}
          height={40}
        />
      </div>
      <div className="mb-2">
        <DraggableRenderer
          draggable={switchDraggable}
          state={state}
          {...{ [handlerName]: setState }}
          width={150}
          height={40}
        />
      </div>
    </>
  );
};

const RejectionDemo = ({ handlerName }: DemoProps) => {
  const [state, setState] = useState<SwitchState>({ value: false });

  const onDropState = useCallback((newState: SwitchState) => {
    if (newState.value === true) {
      setState(newState);
    }
  }, []);

  return (
    <>
      <h3 className="text-md font-medium italic mt-6 mb-1">rejection</h3>
      <DemoNotes>Here the parent only accepts changes to "true".</DemoNotes>
      <DraggableRenderer
        draggable={switchDraggable}
        state={state}
        {...{ [handlerName]: onDropState }}
        width={150}
        height={40}
      />
    </>
  );
};

const OverrideDemo = ({ handlerName }: DemoProps) => {
  const [state, setState] = useState<SwitchState>({ value: false });

  const onDropState = useCallback((newState: SwitchState) => {
    setState({ value: !newState.value });
  }, []);

  return (
    <>
      <h3 className="text-md font-medium italic mt-6 mb-1">override</h3>
      <DemoNotes>
        Here the parent interprets all changes as the opposite of what the
        draggable asks for.
      </DemoNotes>
      <DraggableRenderer
        draggable={switchDraggable}
        state={state}
        {...{ [handlerName]: onDropState }}
        width={150}
        height={40}
      />
    </>
  );
};

const DoubleSliderDemo = ({ handlerName }: DemoProps) => {
  const [state, setState] = useState<SliderState>({ t: 0.5 });

  return (
    <>
      <h3 className="text-md font-medium italic mt-6 mb-1">double slider</h3>
      <DemoNotes>
        Two draggable components controlled by the same state.
      </DemoNotes>
      <div className="mb-2">
        <DraggableRenderer
          draggable={sliderDraggable}
          state={state}
          {...{ [handlerName]: setState }}
          width={150}
          height={16}
        />
      </div>
      <div className="mb-2">
        <DraggableRenderer
          draggable={sliderDraggable}
          state={state}
          {...{ [handlerName]: setState }}
          width={150}
          height={16}
        />
      </div>
    </>
  );
};

const EMPTY_STATE = {};

const ExternalControlDemo = () => {
  const [x, setX] = useState(100);

  return (
    <>
      <h3 className="text-xl font-medium mt-6 mb-1">external control</h3>
      <DemoNotes>
        An HTML slider controls the draggable's definition. The draggable itself
        has no state – it changes because a new draggable is passed in. The
        draggable should update without a transition.
      </DemoNotes>
      <div className="mb-2">
        <input
          type="range"
          min={0}
          max={200}
          value={x}
          onChange={(e) => setX(Number(e.target.value))}
        />
      </div>
      <DraggableRenderer
        draggable={() => <circle cx={x} cy={30} r={12} fill="#6366f1" />}
        state={EMPTY_STATE}
        width={200}
        height={60}
      />
    </>
  );
};

export default demo(
  () => {
    return (
      <div>
        <DemoNotes>
          A few simple tests of using <code>{"<DraggableRenderer>"}</code> as a{" "}
          <i>controlled component</i> – its React parent ultimately controls its
          state. (Also, as a lightweight check, this file imports dependencies
          from <code>lib.ts</code>.)
        </DemoNotes>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-medium mt-6 mb-1">using onDropState</h3>
            <SimpleDemo handlerName="onDropState" />
            <DoubleSwitchDemo handlerName="onDropState" />
            <RejectionDemo handlerName="onDropState" />
            <OverrideDemo handlerName="onDropState" />
            <DoubleSliderDemo handlerName="onDropState" />
          </div>

          <div>
            <h3 className="text-xl font-medium mt-6 mb-1">using onDragState</h3>
            <SimpleDemo handlerName="onDragState" />
            <DoubleSwitchDemo handlerName="onDragState" />
            <RejectionDemo handlerName="onDragState" />
            <OverrideDemo handlerName="onDragState" />
            <DoubleSliderDemo handlerName="onDragState" />
          </div>
        </div>

        <ExternalControlDemo />
      </div>
    );
  },
  { tags: ["controlled"] },
);
