import { arrowhead } from "../arrows";
import { DemoDraggable, DemoNotes } from "../demo/ui";
import { Draggable } from "../draggable";
import { param } from "../DragSpec";

import { produce } from "immer";
import { demo } from "../demo";
import { Vec2 } from "../math/vec2";
import { altKey } from "../modifierKeys";
import { path, translate } from "../svgx/helpers";

type Endpoint = string | { x: number; y: number };

type State = {
  nodes: { [key: string]: { x: number; y: number } };
  edges: { [key: string]: { from: Endpoint; to: Endpoint } };
};

function isNodeRef(ep: Endpoint): ep is string {
  return typeof ep === "string";
}

function endpointCenter(ep: Endpoint, nodes: State["nodes"]): Vec2 {
  return isNodeRef(ep) ? Vec2(nodes[ep]) : Vec2(ep);
}

const initialState: State = {
  nodes: {
    "1": { x: 80, y: 100 },
    "2": { x: 287, y: 73 },
    "3": { x: 274, y: 200 },
    "4": { x: 126, y: 240 },
  },
  edges: {
    "1": { from: "1", to: "2" },
    "2": { from: "2", to: "3" },
    "3": { from: "3", to: "4" },
    "4": { from: "4", to: "1" },
    "5": { from: "1", to: "1" },
    "6": { from: "1", to: "2" },
    "7": { from: "2", to: "1" },
    "8": { from: "1", to: "3" },
    "9": { from: "3", to: "4" },
    "10": { from: "4", to: "3" },
  },
};

function getOrCreate<K, V>(map: Map<K, V>, key: K, init: () => V): V {
  if (!map.has(key)) map.set(key, init());
  return map.get(key)!;
}

// For pair-grouping, produce a stable key for the unordered node pair.
// Edges with free {x,y} endpoints get unique keys (no siblings).
function pairKey(edge: { from: Endpoint; to: Endpoint }, edgeKey: string) {
  if (!isNodeRef(edge.from) || !isNodeRef(edge.to)) return `free:${edgeKey}`;
  if (edge.from === edge.to) return `${edge.from}=>${edge.to}`;
  return [edge.from, edge.to].sort().join("<>");
}

const draggable: Draggable<State> = ({ state, d, draggedId }) => {
  const NODE_R = 20;
  const arrowHeadLength = 20;

  // Group sibling edges (same unordered node pair) for tiebreaking
  const pairGroups = new Map<string, string[]>();
  for (const [edgeKey, edge] of Object.entries(state.edges)) {
    getOrCreate(pairGroups, pairKey(edge, edgeKey), () => []).push(edgeKey);
  }

  // Assign each node-attached port an ideal angle around its node
  type Port = { edgeKey: string; end: "tail" | "head"; idealAngle: number };
  const nodePorts = new Map<string, Port[]>();
  for (const [edgeKey, edge] of Object.entries(state.edges)) {
    const group = pairGroups.get(pairKey(edge, edgeKey))!;
    const tiebreak = group.length > 1 ? group.indexOf(edgeKey) * 0.01 : 0;

    const fromCenter = endpointCenter(edge.from, state.nodes);
    const toCenter = endpointCenter(edge.to, state.nodes);

    if (isNodeRef(edge.from) && isNodeRef(edge.to) && edge.from === edge.to) {
      const ports = getOrCreate(nodePorts, edge.from, () => []);
      ports.push(
        { edgeKey, end: "tail", idealAngle: -90 - 17 + tiebreak },
        { edgeKey, end: "head", idealAngle: -90 + 17 + tiebreak },
      );
    } else {
      if (isNodeRef(edge.from)) {
        getOrCreate(nodePorts, edge.from, () => []).push({
          edgeKey,
          end: "tail",
          idealAngle: fromCenter.angleToDeg(toCenter) - tiebreak,
        });
      }
      if (isNodeRef(edge.to)) {
        getOrCreate(nodePorts, edge.to, () => []).push({
          edgeKey,
          end: "head",
          idealAngle: toCenter.angleToDeg(fromCenter) + tiebreak,
        });
      }
    }
  }

  // Sort ports by ideal angle, then spread with a minimum angular gap
  const minGap = 30;
  const assignedAngles = new Map<string, number>();
  for (const [, ports] of nodePorts) {
    ports.sort((a, b) => a.idealAngle - b.idealAngle);
    const angles = ports.map((p) => p.idealAngle);
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 0; i < angles.length; i++) {
        const next = (i + 1) % angles.length;
        let gap = angles[next] - angles[i];
        if (next === 0) gap += 360;
        if (gap < minGap) {
          const push = (minGap - gap) / 2;
          angles[i] -= push;
          angles[next] += push;
        }
      }
    }
    for (let i = 0; i < ports.length; i++) {
      assignedAngles.set(`${ports[i].edgeKey}-${ports[i].end}`, angles[i]);
    }
  }

  // Resolve an endpoint to its attachment point and outward direction.
  // Node endpoints use the assigned port angle; free endpoints point toward the other end.
  function resolveEndpoint(
    ep: Endpoint,
    edgeKey: string,
    end: "tail" | "head",
    otherCenter: Vec2,
  ): { pos: Vec2; dir: Vec2 } {
    if (isNodeRef(ep)) {
      const angle = assignedAngles.get(`${edgeKey}-${end}`)!;
      const dir = Vec2.polarDeg(1, angle);
      const center = Vec2(state.nodes[ep]);
      return { pos: center.add(dir.withLen(NODE_R + 5)), dir };
    } else {
      const pos = Vec2(ep);
      const dir = otherCenter.sub(pos).norm();
      return { pos, dir };
    }
  }

  return (
    <g>
      <style>{`.edge-tail { opacity: 0; } .edge-tail:hover { opacity: 1; }`}</style>
      {Object.entries(state.edges).map(([key, edge]) => {
        const fromCenter = endpointCenter(edge.from, state.nodes);
        const toCenter = endpointCenter(edge.to, state.nodes);

        const from = resolveEndpoint(edge.from, key, "tail", toCenter);
        const to = resolveEndpoint(edge.to, key, "head", fromCenter);

        const isSelfLoop =
          isNodeRef(edge.from) && isNodeRef(edge.to) && edge.from === edge.to;
        const edgeDist = from.pos.dist(to.pos);
        const handleLen = isSelfLoop ? 40 : edgeDist * 0.4;
        const cp1 = from.pos.add(from.dir.withLen(handleLen));
        const cp2 = to.pos.add(to.dir.withLen(handleLen));

        const tailPos = isNodeRef(edge.from)
          ? from.pos.towards(cp1, 5)
          : from.pos;
        const headLen = isSelfLoop
          ? arrowHeadLength
          : Math.max(8, Math.min(arrowHeadLength, edgeDist * 0.4));
        const arrowDir = to.pos.sub(cp2).norm();
        const arrowButt = to.pos.sub(arrowDir.mul(headLen));
        const cp2Adj = cp2.sub(arrowDir.mul(headLen));

        function endpointOnDrag(endpoint: "from" | "to") {
          // this is a stand-out case for d.substate!
          return d
            .substate(state, ["edges", key, endpoint], (dEndpoint) =>
              dEndpoint
                .closest(
                  // the actual rendered position of the endpoint
                  // doesn't matter as much as the node itself,
                  // so we use it as a dropTarget
                  Object.keys(state.nodes).map((k) =>
                    dEndpoint.dropTarget(`node-${k}-target`, k),
                  ),
                )
                .whenFar(
                  dEndpoint.vary({ x: 0, y: 0 }, [param("x"), param("y")]),
                  { gap: 15 },
                ),
            )
            .onDrop(
              produce((s) => {
                // delete the edge if it has a loose end
                const edge = s.edges[key];
                if (!isNodeRef(edge.to) || !isNodeRef(edge.from)) {
                  delete s.edges[key];
                }
              }),
            );
        }

        return (
          <g id={`edge-${key}`}>
            <path
              d={path("M", tailPos, "C", cp1, cp2Adj, arrowButt)}
              fill="none"
              stroke="black"
              strokeWidth={2}
            />
            {arrowhead({
              tip: to.pos,
              direction: arrowDir,
              headLength: headLen,
              id: `head-${key}`,
              fill: "black",
              dragologyOnDrag: () => endpointOnDrag("to"),
              dragologyZIndex: 1,
            })}
            <circle
              className="edge-tail"
              id={`tail-${key}`}
              transform={translate(tailPos)}
              r={8}
              fill="white"
              stroke="black"
              strokeWidth={2}
              dragologyOnDrag={() => endpointOnDrag("from")}
              dragologyZIndex={1}
            />
          </g>
        );
      })}

      {Object.entries(state.nodes).map(([key, node]) => (
        <g id={`node-${key}`} transform={translate(node)}>
          <circle
            id={`node-${key}-target`}
            r={NODE_R + 15}
            fill="transparent"
            dragologyZIndex={-1}
          />
          <circle
            id={`node-${key}-handle`}
            r={NODE_R}
            fill="black"
            dragologyOnDrag={() =>
              d.reactTo(altKey, (altKey) => {
                if (altKey) {
                  const newId = `edge-${Date.now()}`;
                  const newEdge = {
                    from: key,
                    to: { x: 0, y: 0 },
                  };
                  return d.switchToStateAndFollow(
                    produce(state, (s) => {
                      s.edges[newId] = newEdge;
                    }),
                    `head-${newId}`,
                  );
                } else {
                  return d.closest([
                    d.vary(state, [
                      param("nodes", key, "x"),
                      param("nodes", key, "y"),
                    ]),
                    d.dropTarget(
                      `create-and-destroy`,
                      produce(state, (s) => {
                        for (const [edgeKey, edge] of Object.entries(s.edges)) {
                          if (edge.from === key || edge.to === key) {
                            delete s.edges[edgeKey];
                          }
                        }
                        delete s.nodes[key];
                      }),
                    ),
                  ]);
                }
              })
            }
          />
        </g>
      ))}
      <g
        id="create-and-destroy"
        transform={translate(Vec2(NODE_R + 15))}
        dragologyOnDrag={() => {
          const newId = `node-${Date.now()}`;
          return d.switchToStateAndFollow(
            produce(state, (s) => {
              s.nodes[newId] = { x: 0, y: 0 };
            }),
            `node-${newId}-handle`,
          );
        }}
      >
        <circle r={NODE_R} fill="white" stroke="black" strokeWidth={2} />
        <line x1={10} y1={0} x2={-10} y2={0} stroke="black" strokeWidth={2} />
        {!draggedId?.startsWith("node-") && (
          <line
            id="vert-line-lol"
            x1={0}
            y1={10}
            x2={0}
            y2={-10}
            stroke="black"
            strokeWidth={2}
          />
        )}
      </g>
    </g>
  );
};

export default demo(
  () => (
    <>
      <DemoNotes>
        Hold <b>Alt/Option</b> while dragging to make a new connection.
      </DemoNotes>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={350}
        height={350}
      />
    </>
  ),
  {
    tags: [
      "d.substate",
      "d.closest",
      "d.vary",
      "d.dropTarget",
      "d.switchToStateAndFollow",
      "d.reactTo",
      "d.whenFar",
      "keyboard",
    ],
  },
);
