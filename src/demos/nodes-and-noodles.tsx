import { produce } from "immer";
import { demo } from "../demo";
import { DemoDraggable } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";
import { Vec2 } from "../lib";
import { translate } from "../svgx/helpers";

const NODE_W = 90;
const NODE_HEADER = 20;
const PORT_SPACING = 22;
const PORT_R = 5;

type NodeType = { label: string; inputs: string[]; outputs: string[] };

const NODE_TYPES: Record<string, NodeType> = {
  mix: { label: "Mix", inputs: ["a", "b"], outputs: ["out"] },
  filter: { label: "Filter", inputs: ["in"], outputs: ["out"] },
  output: { label: "Output", inputs: ["in"], outputs: [] },
};

function nodeHeight(type: string) {
  const nt = NODE_TYPES[type];
  const maxPorts = Math.max(nt.inputs.length, nt.outputs.length, 1);
  return NODE_HEADER + maxPorts * PORT_SPACING + 6;
}

function portY(count: number, idx: number, h: number) {
  const startY =
    NODE_HEADER +
    (h - NODE_HEADER - count * PORT_SPACING) / 2 +
    PORT_SPACING / 2;
  return startY + idx * PORT_SPACING;
}

/** Port position relative to its node's origin. */
function localPortPos(type: string, port: string): [number, number] {
  const nt = NODE_TYPES[type];
  const h = nodeHeight(type);
  const outIdx = nt.outputs.indexOf(port);
  if (outIdx >= 0) return [NODE_W, portY(nt.outputs.length, outIdx, h)];
  const inIdx = nt.inputs.indexOf(port);
  return [0, portY(nt.inputs.length, inIdx, h)];
}

type WireEnd =
  | { type: "on-port"; nodeId: string; port: string }
  | { type: "free"; x: number; y: number };

type State = {
  nodes: Record<string, { type: string; x: number; y: number }>;
  wires: Record<string, { from: WireEnd; to: WireEnd }>;
};

/** Port position in global coordinates. */
function portPos(state: State, nodeId: string, port: string): [number, number] {
  const n = state.nodes[nodeId];
  const [lx, ly] = localPortPos(n.type, port);
  return [n.x + lx, n.y + ly];
}

function endPos(state: State, end: WireEnd): [number, number] {
  if (end.type === "on-port") return portPos(state, end.nodeId, end.port);
  return [end.x, end.y];
}

function nextWireId(state: State): string {
  let i = 0;
  while (`w${i}` in state.wires) i++;
  return `w${i}`;
}

function allPorts(state: State, side: "in" | "out") {
  const result: { nodeId: string; port: string }[] = [];
  for (const [nodeId, node] of Object.entries(state.nodes)) {
    const nt = NODE_TYPES[node.type];
    for (const p of side === "in" ? nt.inputs : nt.outputs) {
      result.push({ nodeId, port: p });
    }
  }
  return result;
}

export const initialState: State = {
  nodes: {
    A: { type: "mix", x: 20, y: 30 },
    B: { type: "filter", x: 200, y: 10 },
    C: { type: "output", x: 380, y: 40 },
  },
  wires: {
    w1: {
      from: { type: "on-port", nodeId: "A", port: "out" },
      to: { type: "on-port", nodeId: "B", port: "in" },
    },
    w2: {
      from: { type: "on-port", nodeId: "B", port: "out" },
      to: { type: "free", x: 340, y: 130 },
    },
  },
};

export const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  function endDragSpec(wireId: string, endKey: "from" | "to") {
    const side = endKey === "to" ? "in" : "out";
    const snapSpecs = allPorts(state, side).map(({ nodeId, port }) =>
      d.fixed(
        produce(state, (draft) => {
          draft.wires[wireId][endKey] = { type: "on-port", nodeId, port };
        }),
      ),
    );

    const [px, py] = endPos(state, state.wires[wireId][endKey]);
    const freeState = produce(state, (draft) => {
      draft.wires[wireId][endKey] = { type: "free", x: px, y: py };
    });
    let varySpec = d.vary(freeState, [
      param("wires", wireId, endKey, "x"),
      param("wires", wireId, endKey, "y"),
    ]);
    if (
      freeState.wires[wireId].from.type === "free" &&
      freeState.wires[wireId].to.type === "free"
    ) {
      varySpec = varySpec.onDrop(
        produce(freeState, (draft) => {
          delete draft.wires[wireId];
        }),
      );
    }

    return d.closest(snapSpecs).whenFar(varySpec, { gap: 20 });
  }

  return (
    <g>
      {/* wires */}
      {Object.entries(state.wires).map(([wid, wire]) => {
        const [fx, fy] = endPos(state, wire.from);
        const [tx, ty] = endPos(state, wire.to);
        const dx = Math.max(Math.abs(tx - fx) * 0.4, 30);

        return (
          <g id={`wire-${wid}`} dragologyZIndex={3}>
            <path
              id={`wire-path-${wid}`}
              d={`M${fx},${fy} C${fx + dx},${fy} ${tx - dx},${ty} ${tx},${ty}`}
              fill="none"
              stroke="#aaa"
              strokeWidth={2}
            />
            <circle
              id={`wire-${wid}-from`}
              transform={translate(fx, fy)}
              r={wire.from.type === "free" ? 6 : PORT_R}
              fill={wire.from.type === "free" ? "#ccc" : "transparent"}
              stroke={wire.from.type === "free" ? "#999" : "none"}
              strokeWidth={wire.from.type === "free" ? 1 : 0}
              style={
                wire.from.type === "on-port"
                  ? { cursor: "crosshair" }
                  : undefined
              }
              dragologyOnDrag={() => endDragSpec(wid, "from")}
            />
            <circle
              id={`wire-${wid}-to`}
              transform={translate(tx, ty)}
              r={wire.to.type === "free" ? 6 : PORT_R}
              fill={wire.to.type === "free" ? "#ccc" : "transparent"}
              stroke={wire.to.type === "free" ? "#999" : "none"}
              strokeWidth={wire.to.type === "free" ? 1 : 0}
              style={
                wire.to.type === "on-port" ? { cursor: "crosshair" } : undefined
              }
              dragologyOnDrag={() => endDragSpec(wid, "to")}
            />
          </g>
        );
      })}

      {/* nodes */}
      {Object.entries(state.nodes).map(([nid, node]) => {
        const nodeType = NODE_TYPES[node.type];
        const h = nodeHeight(node.type);

        return (
          <g
            id={`node-${nid}`}
            transform={translate(node.x, node.y)}
            dragologyZIndex={draggedId === `node-${nid}` ? 5 : 1}
            dragologyOnDrag={() =>
              d.vary(state, [
                param("nodes", nid, "x"),
                param("nodes", nid, "y"),
              ])
            }
          >
            <rect
              width={NODE_W}
              height={h}
              rx={5}
              fill="#fdfdfd"
              stroke="#bbb"
              strokeWidth={1.2}
            />
            <line
              x1={0}
              y1={NODE_HEADER}
              x2={NODE_W}
              y2={NODE_HEADER}
              stroke="#ddd"
            />
            <text
              x={NODE_W / 2}
              y={NODE_HEADER / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight="600"
              fill="#444"
            >
              {nodeType.label}
            </text>

            {(["in", "out"] as const).map((side) => {
              const ports = side === "in" ? nodeType.inputs : nodeType.outputs;
              const colors =
                side === "in" ? ["#4a9eff", "#c0d8f0"] : ["#ff6b4a", "#f0c8c0"];
              const wireEndKey = side === "in" ? "to" : "from";
              return ports.map((port: string) => {
                const [lx, ly] = localPortPos(node.type, port);
                const connected = Object.values(state.wires).some((w) => {
                  const end = w[wireEndKey];
                  return (
                    end.type === "on-port" &&
                    end.nodeId === nid &&
                    end.port === port
                  );
                });
                const id = `${side === "in" ? "port" : "oport"}-${nid}-${port}`;
                const onDrag =
                  !connected &&
                  (() => {
                    const [px, py] = portPos(state, nid, port);
                    const wid = nextWireId(state);
                    const fixed: WireEnd = {
                      type: "on-port",
                      nodeId: nid,
                      port,
                    };
                    const free: WireEnd = { type: "free", x: px, y: py };
                    const freeEndKey =
                      side === "out" ? "to" : ("from" as const);
                    const newState = produce(state, (draft) => {
                      draft.wires[wid] =
                        side === "out"
                          ? { from: fixed, to: free }
                          : { from: free, to: fixed };
                    });
                    return d
                      .switchToStateAndFollow(
                        newState,
                        `wire-${wid}-${freeEndKey}`,
                      )
                      .withInitContext({ anchorPos: Vec2(0) });
                  });
                return (
                  <g transform={translate(lx, ly)}>
                    <circle
                      r={PORT_R}
                      fill={connected ? colors[0] : colors[1]}
                      stroke="white"
                      strokeWidth={1.5}
                      id={id}
                      dragologyZIndex="/10"
                      style={{
                        pointerEvents: connected ? "none" : undefined,
                        cursor: "crosshair",
                      }}
                      dragologyOnDrag={onDrag}
                    />
                    <text
                      x={side === "in" ? PORT_R + 4 : -(PORT_R + 4)}
                      dominantBaseline="middle"
                      textAnchor={side === "in" ? "start" : "end"}
                      fontSize={9}
                      fill="#999"
                      style={{ cursor: "crosshair" }}
                      dragologyOnDrag={onDrag}
                    >
                      {port}
                    </text>
                  </g>
                );
              });
            })}
          </g>
        );
      })}
    </g>
  );
};

export default demo(
  () => (
    <DemoDraggable
      draggable={draggable}
      initialState={initialState}
      width={500}
      height={200}
    />
  ),
  {
    tags: [
      "d.switchToStateAndFollow",
      "spec.onDrop",
      "d.vary",
      "d.closest",
      "d.fixed",
      "spec.whenFar",
    ],
  },
);
