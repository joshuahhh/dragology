import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigCheckbox,
  ConfigPanel,
  DemoDraggable,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { type DragSpecBuilder } from "../DragSpec";
import { Svgx } from "../svgx";
import { translate } from "../svgx/helpers";

type Tree = {
  id: string;
  label: string;
  children: Tree[];
};

type State = Tree;

const state1: State = {
  id: "root",
  label: "+",
  children: [
    { id: "A", label: "A", children: [] },
    { id: "B", label: "B", children: [] },
  ],
};

const state2: State = {
  id: "root",
  label: "root",
  children: [
    {
      id: "plus-1",
      label: "+",
      children: [
        {
          id: "plus-2",
          label: "+",
          children: [
            { id: "A", label: "A", children: [] },
            { id: "B", label: "B", children: [] },
          ],
        },
        {
          id: "plus-3",
          label: "+",
          children: [
            { id: "C", label: "C", children: [] },
            { id: "D", label: "D", children: [] },
          ],
        },
      ],
    },
  ],
};

const stateTreeOfLife: State = {
  id: "root",
  label: "root",
  children: [
    {
      id: "animalia",
      label: "Animalia",
      children: [
        {
          id: "chordata",
          label: "Chordata",
          children: [
            {
              id: "mammalia",
              label: "Mammalia",
              children: [
                {
                  id: "carnivora",
                  label: "Carnivora",
                  children: [
                    {
                      id: "felidae",
                      label: "Felidae",
                      children: [
                        { id: "cat", label: "🐱 Cat", children: [] },
                        { id: "lion", label: "🦁 Lion", children: [] },
                        { id: "tiger", label: "🐯 Tiger", children: [] },
                      ],
                    },
                    {
                      id: "canidae",
                      label: "Canidae",
                      children: [
                        { id: "dog", label: "🐕 Dog", children: [] },
                        { id: "fox", label: "🦊 Fox", children: [] },
                        { id: "wolf", label: "🐺 Wolf", children: [] },
                      ],
                    },
                  ],
                },
                {
                  id: "primates",
                  label: "Primates",
                  children: [
                    { id: "monkey", label: "🐵 Monkey", children: [] },
                    { id: "gorilla", label: "🦍 Gorilla", children: [] },
                    { id: "orangutan", label: "🦧 Orangutan", children: [] },
                  ],
                },
                {
                  id: "cetacea",
                  label: "Cetacea",
                  children: [
                    { id: "whale", label: "🐋 Whale", children: [] },
                    { id: "dolphin", label: "🐬 Dolphin", children: [] },
                  ],
                },
              ],
            },
            {
              id: "aves",
              label: "Aves",
              children: [
                { id: "eagle", label: "🦅 Eagle", children: [] },
                { id: "parrot", label: "🦜 Parrot", children: [] },
                { id: "penguin", label: "🐧 Penguin", children: [] },
                { id: "owl", label: "🦉 Owl", children: [] },
              ],
            },
            {
              id: "reptilia",
              label: "Reptilia",
              children: [
                { id: "turtle", label: "🐢 Turtle", children: [] },
                { id: "lizard", label: "🦎 Lizard", children: [] },
                { id: "crocodile", label: "🐊 Crocodile", children: [] },
                { id: "snake", label: "🐍 Snake", children: [] },
              ],
            },
          ],
        },
        {
          id: "arthropoda",
          label: "Arthropoda",
          children: [
            {
              id: "insecta",
              label: "Insecta",
              children: [
                { id: "butterfly", label: "🦋 Butterfly", children: [] },
                { id: "bee", label: "🐝 Bee", children: [] },
                { id: "ant", label: "🐜 Ant", children: [] },
                { id: "ladybug", label: "🐞 Ladybug", children: [] },
              ],
            },
            {
              id: "arachnida",
              label: "Arachnida",
              children: [
                { id: "spider", label: "🕷️ Spider", children: [] },
                { id: "scorpion", label: "🦂 Scorpion", children: [] },
              ],
            },
          ],
        },
        {
          id: "mollusca",
          label: "Mollusca",
          children: [
            { id: "octopus", label: "🐙 Octopus", children: [] },
            { id: "squid", label: "🦑 Squid", children: [] },
            { id: "snail", label: "🐌 Snail", children: [] },
          ],
        },
      ],
    },
  ],
};

type Config = {
  useFloating: boolean;
};

const defaultConfig: Config = {
  useFloating: true,
};

const HEIGHT = 25;
const GAP = 2;
const WIDTH = 100;
const INDENT = 20;

function renderTree(
  tree: Tree,
  rootState: Tree,
  draggedId: string | null,
  d: DragSpecBuilder<Tree>,
  config: Config,
  isRoot = false,
): {
  elem: Svgx;
  h: number;
} {
  const block = !isRoot && (
    <g>
      <rect
        x={0}
        y={0}
        width={WIDTH}
        height={HEIGHT}
        rx={4}
        ry={4}
        stroke="none"
        fill="#f0f1f3"
      />
      <text
        x={8}
        y={HEIGHT / 2}
        dominantBaseline="middle"
        textAnchor="start"
        fontSize={13}
        fill="#374151"
      >
        {tree.label}
      </text>
    </g>
  );

  const childIndent = isRoot ? 0 : INDENT;
  let y = isRoot ? 0 : HEIGHT;
  const childRenders: { elem: Svgx; y: number; id: string }[] = [];
  for (const child of tree.children) {
    y += GAP;
    const cr = renderTree(child, rootState, draggedId, d, config);
    childRenders.push({ elem: cr.elem, y, id: child.id });
    y += cr.h;
  }

  return {
    elem: (
      <g
        id={tree.id}
        dragologyZIndex={tree.id === draggedId ? 1 : 0}
        dragologyOnDrag={
          isRoot
            ? undefined
            : () => {
                const result = removeById(rootState, tree.id);
                if (!result) {
                  return d.fixed(rootState);
                }
                const statesWith = insertAtAllPositions(
                  result.tree,
                  result.removed,
                );

                if (config.useFloating) {
                  return d
                    .closest(statesWith)
                    .whenFar(result.tree)
                    .withFloating();
                } else {
                  return d.between(statesWith);
                }
              }
        }
      >
        {block}
        {childRenders.length > 0 && !isRoot && (
          <g id={`connectors-${tree.id}`}>
            <line
              x1={childIndent / 2}
              y1={HEIGHT}
              x2={childIndent / 2}
              y2={childRenders[childRenders.length - 1].y + HEIGHT / 2}
              stroke="#d0d4d8"
              strokeWidth={1}
              strokeLinecap="round"
            />
            {childRenders.map((cr) => (
              <line
                id={`connector-${tree.id}-${cr.id}`}
                x1={childIndent / 2}
                y1={cr.y + HEIGHT / 2}
                x2={childIndent - 2}
                y2={cr.y + HEIGHT / 2}
                stroke="#d0d4d8"
                strokeWidth={1}
              />
            ))}
          </g>
        )}
        {childRenders.map((cr) => (
          <g id={`position-${cr.id}`} transform={translate(childIndent, cr.y)}>
            {cr.elem}
          </g>
        ))}
      </g>
    ),
    h: y,
  };
}

function removeById(
  root: Tree,
  id: string,
): { tree: Tree; removed: Tree } | null {
  const cloned = structuredClone(root);
  let found: Tree | null = null;
  function walk(node: Tree): boolean {
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].id === id) {
        found = node.children[i];
        node.children.splice(i, 1);
        return true;
      }
      if (walk(node.children[i])) return true;
    }
    return false;
  }
  walk(cloned);
  return found ? { tree: cloned, removed: found } : null;
}

function insertAtAllPositions(tree: Tree, child: Tree): Tree[] {
  function helper(node: Tree): Tree[] {
    const results: Tree[] = [];

    const len = node.children.length;
    for (let i = 0; i <= len; i++) {
      const newChildren = [
        ...node.children.slice(0, i),
        child,
        ...node.children.slice(i),
      ];
      results.push({
        ...node,
        children: newChildren,
      });
    }

    for (let i = 0; i < len; i++) {
      const originalChild = node.children[i];
      const subtreeVariants = helper(originalChild);
      for (const variant of subtreeVariants) {
        const newChildren = node.children.slice();
        newChildren[i] = variant;
        results.push({
          ...node,
          children: newChildren,
        });
      }
    }

    return results;
  }

  return helper(tree);
}

function draggableFactory(config: Config): Draggable<State> {
  return ({ state, d, draggedId }) => (
    <g transform={translate(10, 10)}>
      {renderTree(state, state, draggedId, d, config, true).elem}
    </g>
  );
}

// # Component

export default demo(
  () => {
    const [config, setConfig] = useState(defaultConfig);

    const draggable = useMemo(() => draggableFactory(config), [config]);

    return (
      <DemoWithConfig>
        <div>
          <h3 className="text-md font-medium italic mt-6 mb-1">simple</h3>
          <DemoDraggable
            draggable={draggable}
            initialState={state1}
            width={200}
            height={100}
          />
          <h3 className="text-md font-medium italic mt-6 mb-1">nested</h3>
          <DemoDraggable
            draggable={draggable}
            initialState={state2}
            width={250}
            height={200}
          />
          <h3 className="text-md font-medium italic mt-6 mb-1">tree of life</h3>
          <DemoDraggable
            draggable={draggable}
            initialState={stateTreeOfLife}
            width={350}
            height={1200}
          />
        </div>
        <ConfigPanel>
          <ConfigCheckbox
            value={config.useFloating}
            onChange={(v) => setConfig((c) => ({ ...c, useFloating: v }))}
          >
            Use <span className="font-mono">floating</span>
          </ConfigCheckbox>
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  {
    tags: [
      "d.between",
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
      "reordering",
    ],
  },
);
