import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { translate } from "../svgx/helpers";

type State = { right: boolean };

const initialState: State = { right: false };

type Config = { snap: boolean };
const defaultConfig: Config = { snap: false };

function draggableFactory(config: Config): Draggable<State> {
  return ({ state, d }) => {
    let spec = d.between([{ right: false }, { right: true }]);
    if (config.snap) spec = spec.withSnapRadius(20);

    return (
      <g>
        {/* The main dot */}
        <g
          id="dot"
          transform={translate(state.right ? 200 : 100, 20)}
          dragologyOnDrag={() => spec}
        >
          <circle r={14} fill="#7cb3f0" stroke="#4a90d9" strokeWidth={2} />
        </g>

        {/* The emerging dot — only present in state 2 */}
        {state.right && (
          <g
            id="dot2"
            transform={translate(200, 100)}
            dragologyEmergeFrom="dot"
          >
            <circle r={14} fill="#f0a07c" stroke="#d9824a" strokeWidth={2} />
          </g>
        )}
      </g>
    );
  };
}

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);
    const draggable = useMemo(() => draggableFactory(config), [config]);

    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={300}
          height={200}
        />
        <ConfigPanel>
          <ConfigCheckbox
            value={config.snap}
            onChange={(v) => setConfig((c) => ({ ...c, snap: v }))}
          >
            Snap (20px)
          </ConfigCheckbox>
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["d.between", "spec.withSnapRadius", "dragologyEmergeFrom"] },
);
