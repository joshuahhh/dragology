import { createContext, useContext } from "react";
import { DragSpecData } from "./DragSpec";
import { RenderedState, getTraceInfo } from "./DragSpecTraceInfo";
import { LayeredSvgx, drawLayered } from "./svgx/layers";
import { Transition } from "./transition";
import { assert, assertNever } from "./utils";

type TreeViewContext = {
  activePath: string;
  colorMap: Map<string, string> | null;
  svgWidth: number;
  svgHeight: number;
  thumbHeight: number;
};

const TreeViewContext = createContext<TreeViewContext | null>(null);

function useTreeViewContext() {
  const ctx = useContext(TreeViewContext);
  assert(ctx !== null, "TreeViewContext not initialized");
  return ctx;
}

export function DragSpecTreeView<T>({
  spec,
  activePath,
  colorMap,
  svgWidth,
  svgHeight,
  thumbHeight,
}: {
  spec: DragSpecData<T>;
  activePath: string;
  colorMap: Map<string, string> | null;
  svgWidth: number;
  svgHeight: number;
  thumbHeight: number;
}) {
  return (
    <TreeViewContext.Provider
      value={{ activePath, colorMap, svgWidth, svgHeight, thumbHeight }}
    >
      <div className="text-xs font-mono">
        <SpecNode spec={spec} path="" />
      </div>
    </TreeViewContext.Provider>
  );
}

const ACTIVE_BG = "rgba(250, 204, 21, 0.25)";
const ACTIVE_BORDER = "rgb(250, 204, 21)";
const INACTIVE_BG = "rgba(148, 163, 184, 0.08)";
const INACTIVE_BORDER = "rgb(203, 213, 225)";

/**
 * `activePath` is the full, unmodified active path from the root.
 * `path` is the accumulated path of the current node, built top-down.
 * Each node checks whether `activePath` matches or extends its own `path`.
 */
function SpecNode<T>({ spec, path }: { spec: DragSpecData<T>; path: string }) {
  const { activePath, colorMap } = useTreeViewContext();

  /** Compute active/color/childPath/traceInfo for a node from its narrowed spec. */
  const info = <S extends DragSpecData<T>>(s: S) => {
    const fullPath = path + s.type;
    return {
      active: activePath === fullPath,
      color: colorMap?.get(fullPath),
      childPath: fullPath + "/",
      traceInfo: getTraceInfo(s),
    };
  };

  if (spec.type === "fixed") {
    const { active, color, traceInfo } = info(spec);
    return (
      <Box label="fixed" active={active} color={color}>
        {traceInfo && (
          <StateThumbnails renderedStates={traceInfo.renderedStates} />
        )}
      </Box>
    );
  } else if (spec.type === "with-floating") {
    const { color, childPath, traceInfo } = info(spec);
    return (
      <Box label="withFloating" color={color}>
        {traceInfo && (
          <OutputThumbnail outputRendered={traceInfo.outputRendered} />
        )}
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "vary") {
    const { active, color, traceInfo } = info(spec);
    const paramNames = spec.paramPaths.map((p) => {
      const last = p[p.length - 1];
      return typeof last === "string" ? last : String(last);
    });
    const constraintSrc = spec.constraint
      ? truncate(spec.constraint.toString(), 60)
      : null;
    return (
      <Box
        label={`vary [${paramNames.join(", ")}]`}
        active={active}
        color={color}
      >
        {constraintSrc && (
          <div
            style={{
              fontSize: 9,
              color: "rgb(120, 113, 108)",
              background: "rgba(0,0,0,0.04)",
              borderRadius: 3,
              padding: "2px 4px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            constraint: {constraintSrc}
          </div>
        )}
        {traceInfo && (
          <StateThumbnails renderedStates={traceInfo.renderedStates} />
        )}
      </Box>
    );
  } else if (spec.type === "closest") {
    return (
      <Box label="closest">
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {spec.specs.map((childSpec, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", gap: 1 }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "rgb(148, 163, 184)",
                  paddingLeft: 2,
                }}
              >
                {i}
              </div>
              <SpecNode spec={childSpec} path={path + `closest/${i}/`} />
            </div>
          ))}
        </div>
      </Box>
    );
  } else if (spec.type === "with-background") {
    return (
      <Box label={`withBackground (r=${spec.radius})`}>
        <div style={{ display: "flex", flexDirection: "row", gap: 4 }}>
          <Slot label="fg">
            <SpecNode spec={spec.foreground} path={path + "fg/"} />
          </Slot>
          <Slot label="bg">
            <SpecNode spec={spec.background} path={path + "bg/"} />
          </Slot>
        </div>
      </Box>
    );
  } else if (spec.type === "and-then") {
    const { childPath } = info(spec);
    return (
      <Box label="andThen">
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "during") {
    const { childPath, traceInfo } = info(spec);
    return (
      <Box label="during">
        {traceInfo && (
          <OutputThumbnail outputRendered={traceInfo.outputRendered} />
        )}
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "with-distance") {
    const { childPath } = info(spec);
    return (
      <Box label="withDistance">
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "with-snap-radius") {
    const { childPath, traceInfo } = info(spec);
    const snapped = activePath?.startsWith(childPath + "snapped/");
    const snapSegment = snapped ? "snapped/" : "unsnapped/";
    const options = [
      spec.transition && "transition",
      spec.chain && "chain",
    ].filter(Boolean);
    let label = `withSnapRadius (${spec.radius}${
      options.length ? `, ${options.join(", ")}` : ""
    })`;
    if (spec.transition) {
      label += snapped ? " [snapped]" : " [not snapped]";
    }
    return (
      <Box label={label}>
        {traceInfo && (
          <OutputThumbnail outputRendered={traceInfo.outputRendered} />
        )}
        <SpecNode spec={spec.inner} path={childPath + snapSegment} />
      </Box>
    );
  } else if (spec.type === "between") {
    const { active, color, traceInfo } = info(spec);
    return (
      <Box
        label={`between [${spec.states.length}]`}
        active={active}
        color={color}
      >
        {traceInfo && (
          <>
            <OutputThumbnail outputRendered={traceInfo.outputRendered} />
            <Slot label="states">
              <StateThumbnails
                renderedStates={traceInfo.renderedStates}
                closestIndex={traceInfo.closestIndex}
              />
            </Slot>
          </>
        )}
      </Box>
    );
  } else if (spec.type === "with-drop-transition") {
    const { childPath } = info(spec);
    return (
      <Box
        label={`withDropTransition (${describeTransition(spec.transition)})`}
      >
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "switch-to-state-and-follow") {
    const { active, color, traceInfo } = info(spec);
    return (
      <Box
        label={`switchToStateAndFollow → ${spec.draggedId}`}
        active={active}
        color={color}
      >
        {traceInfo && (
          <StateThumbnails renderedStates={traceInfo.renderedStates} />
        )}
      </Box>
    );
  } else if (spec.type === "with-branch-transition") {
    const { childPath } = info(spec);
    return (
      <Box
        label={`withBranchTransition (${describeTransition(spec.transition)})`}
      >
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "drop-target") {
    const { active, color, traceInfo } = info(spec);
    return (
      <Box
        label={`dropTarget → ${spec.targetId}`}
        active={active}
        color={color}
      >
        {traceInfo && (
          <StateThumbnails renderedStates={traceInfo.renderedStates} />
        )}
      </Box>
    );
  } else if (spec.type === "with-chaining") {
    const { childPath } = info(spec);
    return (
      <Box label="withChaining">
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else {
    assertNever(spec);
  }
}

// # Thumbnail rendering

function StateThumbnails({
  renderedStates,
  closestIndex,
}: {
  renderedStates: RenderedState[];
  closestIndex?: number;
}) {
  const { svgWidth, svgHeight, thumbHeight } = useTreeViewContext();
  if (svgWidth === 0 || svgHeight === 0) return null;
  const h = Math.min(thumbHeight, svgHeight);
  const w = Math.round(h * (svgWidth / svgHeight));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 3,
        flexWrap: "wrap",
        marginTop: 2,
      }}
    >
      {renderedStates.map((rs, i) => (
        <svg
          key={i}
          width={w}
          height={h}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            border: "1px solid rgb(203, 213, 225)",
            borderRadius: 3,
            background: "white",
            transition: "width 150ms ease, height 150ms ease",
            ...(closestIndex === i
              ? { outline: `2px solid ${ACTIVE_BORDER}`, outlineOffset: -1 }
              : {}),
          }}
        >
          {drawLayered(rs.layered)}
        </svg>
      ))}
    </div>
  );
}

function OutputThumbnail({ outputRendered }: { outputRendered: LayeredSvgx }) {
  const { svgWidth, svgHeight, thumbHeight } = useTreeViewContext();
  if (svgWidth === 0 || svgHeight === 0) return null;
  const h = Math.min(thumbHeight, svgHeight);
  const w = Math.round(h * (svgWidth / svgHeight));
  return (
    <div style={{ marginTop: 2, marginBottom: 4 }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{
          border: "1px solid rgb(203, 213, 225)",
          borderRadius: 3,
          background: "white",
          transition: "width 150ms ease, height 150ms ease",
        }}
      >
        {drawLayered(outputRendered)}
      </svg>
    </div>
  );
}

// # Shared UI components

function Box({
  label,
  active,
  color,
  children,
}: {
  label: string;
  active?: boolean;
  color?: string;
  children?: React.ReactNode;
}) {
  const bg = color
    ? colorToAlpha(color, 0.15)
    : active
      ? ACTIVE_BG
      : INACTIVE_BG;
  const border = color ? color : active ? ACTIVE_BORDER : INACTIVE_BORDER;

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: "4px 6px",
        transition: "background 150ms, border-color 150ms",
        ...(active
          ? color
            ? { outline: `2px solid black`, outlineOffset: 1 }
            : { outline: `2px solid ${ACTIVE_BORDER}`, outlineOffset: -1 }
          : {}),
      }}
    >
      <div
        style={{
          color: active && !color ? "rgb(161, 98, 7)" : "rgb(100, 116, 139)",
          fontWeight: active ? 600 : 400,
          marginBottom: children ? 3 : 0,
          fontSize: 10,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Slot({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontSize: 9, color: "rgb(148, 163, 184)", paddingLeft: 2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Format a Transition for display. */
function describeTransition(t: Transition | false): string {
  if (!t) return "none";
  return `${typeof t.easing === "function" ? "fn" : t.easing} ${t.duration}ms`;
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "\u2026";
}

/** Convert "rgb(r, g, b)" to "rgba(r, g, b, a)" */
function colorToAlpha(rgb: string, alpha: number): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return rgb;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}
