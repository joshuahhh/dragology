import { useCallback, useMemo, useRef, useState } from "react";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import { Draggable } from "../draggable";
import { renderDraggableInert } from "../renderDraggable";
import { Svgx } from "../svgx";
import { Bounds, getGlobalBounds } from "../svgx/bounds";
import { Layer, LayeredSvgx, compareStackingPaths } from "../svgx/layers";

type SortedLayer = {
  id: string;
  stackingPath: number[];
  element: Svgx;
  bounds: Bounds;
};

function sortedLayers(byId: Map<string, Layer>): SortedLayer[] {
  return Array.from(byId.entries())
    .sort(([, a], [, b]) =>
      compareStackingPaths(a.stackingPath, b.stackingPath),
    )
    .map(([key, layer]) => ({
      id: key,
      stackingPath: layer.stackingPath,
      element: layer.element,
      bounds: getGlobalBounds(
        layer.element,
        layer.element.props.transform ?? "",
      ),
    }));
}

type LayersListState = {
  layers: SortedLayer[];
  onHover: (id: string | null) => void;
  hoveredId: string | null;
  svgWidth: number;
};

const ROW_HEIGHT = 16;
const THUMB_SIZE = 14;
const THUMB_PAD = 1;
const CHAR_WIDTH = 6.6; // approximate for 11px monospace
const MIN_LAYERS_WIDTH = 140;

const layersListDraggable: Draggable<LayersListState> = ({ state }) => {
  const textX = THUMB_SIZE + 6;
  const maxIdLen = Math.max(
    ...state.layers.map(({ id }) => (id === "" ? 6 : id.length)),
  );
  const pathX = textX + (maxIdLen + 1) * CHAR_WIDTH;
  return (
    <g>
      {state.layers.map(({ id, stackingPath, element, bounds }, i) => (
        <g
          id={`layer-${id || "__root__"}`}
          transform={`translate(0, ${i * ROW_HEIGHT})`}
        >
          <rect
            x={0}
            y={0}
            width={state.svgWidth}
            height={ROW_HEIGHT}
            rx={3}
            fill={
              state.hoveredId === id ? "rgba(255, 0, 255, 0.08)" : "transparent"
            }
            onPointerEnter={() => state.onHover(id)}
            onPointerLeave={() => state.onHover(null)}
          />
          <rect
            x={0}
            y={1}
            width={THUMB_SIZE}
            height={THUMB_SIZE}
            rx={2}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth={0.5}
            pointerEvents="none"
          />
          {!bounds.empty &&
            (() => {
              const bw = bounds.maxX - bounds.minX;
              const bh = bounds.maxY - bounds.minY;
              if (bw === 0 && bh === 0) return null;
              const inner = THUMB_SIZE - THUMB_PAD * 2;
              const scale = Math.min(inner / (bw || 1), inner / (bh || 1));
              const cx = THUMB_PAD + (inner - bw * scale) / 2;
              const cy = 1 + THUMB_PAD + (inner - bh * scale) / 2;
              return (
                <g
                  id={`layer-${id || "__root__"}-element`}
                  transform={`translate(${cx}, ${cy}) scale(${scale}) translate(${-bounds.minX}, ${-bounds.minY})`}
                  pointerEvents="none"
                >
                  {element}
                </g>
              );
            })()}
          <text
            x={textX}
            y={12}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
            fill="#334155"
            pointerEvents="none"
          >
            {id === "" ? "(root)" : id}
          </text>
          <text
            y={12}
            x={pathX}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
            fill="#94a3b8"
            pointerEvents="none"
          >
            [{stackingPath.join(", ")}]
          </text>
        </g>
      ))}
    </g>
  );
};

function getLayeredFromStatus<T extends object>(
  outerDraggable: Draggable<T>,
  status: DragStatus<T>,
): LayeredSvgx {
  if (status.type === "dragging") {
    return status.result.preview;
  }
  return renderDraggableInert(outerDraggable, status.state, null, false);
}

export function LayerHighlight({
  bounds,
  width,
  height,
}: {
  bounds: Bounds;
  width: number;
  height: number;
}) {
  if (bounds.empty) return null;
  const pad = 2;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute top-0 left-0 pointer-events-none"
    >
      <rect
        x={bounds.minX - pad}
        y={bounds.minY - pad}
        width={bounds.maxX - bounds.minX + pad * 2}
        height={bounds.maxY - bounds.minY + pad * 2}
        rx={3}
        fill="rgba(255, 0, 255, 0.08)"
        stroke="magenta"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function LayersList<T extends object>({
  draggable,
  status,
  onHoverBounds,
}: {
  draggable: Draggable<T>;
  status: DragStatus<T>;
  onHoverBounds?: (bounds: Bounds | null) => void;
}) {
  const layers = useMemo(
    () => sortedLayers(getLayeredFromStatus(draggable, status).byId),
    [draggable, status],
  );

  const onHoverBoundsRef = useRef(onHoverBounds);
  onHoverBoundsRef.current = onHoverBounds;

  const boundsById = useMemo(() => {
    const map = new Map<string, Bounds>();
    for (const layer of layers) {
      map.set(layer.id, layer.bounds);
    }
    return map;
  }, [layers]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const onHover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      onHoverBoundsRef.current?.(
        id != null ? (boundsById.get(id) ?? null) : null,
      );
    },
    [boundsById],
  );

  const textX = THUMB_SIZE + 6;
  const svgWidth = useMemo(() => {
    const maxIdLen = Math.max(
      0,
      ...layers.map(({ id }) => (id === "" ? 6 : id.length)),
    );
    const maxPathLen = Math.max(
      0,
      ...layers.map(
        ({ stackingPath }) => `[${stackingPath.join(", ")}]`.length,
      ),
    );
    return Math.max(
      MIN_LAYERS_WIDTH,
      textX + (maxIdLen + 1 + maxPathLen) * CHAR_WIDTH,
    );
  }, [layers, textX]);

  const layersState = useMemo<LayersListState>(
    () => ({ layers, onHover, hoveredId, svgWidth }),
    [layers, onHover, hoveredId, svgWidth],
  );
  const svgHeight = Math.max(layers.length * ROW_HEIGHT, ROW_HEIGHT);

  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">layers</div>
      <div onPointerLeave={() => onHover(null)}>
        <DraggableRenderer
          draggable={layersListDraggable}
          state={layersState}
          width={svgWidth}
          height={svgHeight}
        />
      </div>
    </div>
  );
}
