import { createContext, useContext } from "react";
import { DragSpecData } from "./DragSpec";
import { RenderedState, getTraceInfo } from "./DragSpecTraceInfo";
import { StudioHackContext } from "./studio/StudioHackContext";
import { LayeredSvgx, drawLayered } from "./svgx/layers";
import { Transition } from "./transition";
import { assert, assertNever } from "./utils/assert";

export type DragSpecTreeViewNodeProps = {
  width?: number | string;
  height?: number | string;
};

type TreeViewContext = {
  activePath: string;
  colorMap: Map<string, string> | null;
  nodeProps: Record<string, DragSpecTreeViewNodeProps> | undefined;
  svgWidth: number;
  svgHeight: number;
  thumbArea: number;
};

const TreeViewContext = createContext<TreeViewContext | null>(null);

function useTreeViewContext() {
  const ctx = useContext(TreeViewContext);
  assert(ctx !== null, "TreeViewContext not initialized");
  return ctx;
}

export function DragSpecTreeView<T extends object>({
  spec,
  activePath,
  colorMap,
  nodeProps,
  svgWidth,
  svgHeight,
  thumbArea,
}: {
  spec: DragSpecData<T>;
  activePath: string;
  colorMap: Map<string, string> | null;
  nodeProps?: Record<string, DragSpecTreeViewNodeProps>;
  svgWidth: number;
  svgHeight: number;
  thumbArea: number;
}) {
  return (
    <TreeViewContext.Provider
      value={{
        activePath,
        colorMap,
        nodeProps,
        svgWidth,
        svgHeight,
        thumbArea,
      }}
    >
      <div style={{ fontSize: "0.75rem", fontFamily: "monospace" }}>
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
function SpecNode<T extends object>({
  spec,
  path,
}: {
  spec: DragSpecData<T>;
  path: string;
}) {
  const { activePath, colorMap } = useTreeViewContext();
  const { tightFixed } = useContext(StudioHackContext);

  /** Compute active/color/childPath/traceInfo for a node from its narrowed spec. */
  const info = <S extends DragSpecData<T>>(s: S) => {
    const fullPath = path + s.type;
    return {
      active: activePath === fullPath || activePath.startsWith(fullPath + "/"),
      color: colorMap?.get(fullPath),
      childPath: fullPath + "/",
      traceInfo: getTraceInfo(s),
    };
  };

  /** A labeled box around a single child. */
  const wrapper = (
    label: string,
    s: DragSpecData<T> & { inner: DragSpecData<T> },
  ) => (
    <Box label={label} path={path}>
      <SpecNode spec={s.inner} path={info(s).childPath} />
    </Box>
  );

  if (spec.type === "fixed") {
    const { active, color, traceInfo } = info(spec);
    if (tightFixed && traceInfo) {
      return (
        <OutputThumbnail
          outputPreview={traceInfo.outputPreview}
          active={active}
        />
      );
    }
    return (
      <Box label="fixed" active={active} color={color} path={path}>
        {traceInfo && (
          <OutputThumbnail outputPreview={traceInfo.outputPreview} />
        )}
      </Box>
    );
  } else if (spec.type === "with-floating") {
    const { color, childPath, traceInfo } = info(spec);
    return (
      <Box label="withFloating" color={color} path={path}>
        {traceInfo?.outputPreview && (
          <OutputThumbnail outputPreview={traceInfo.outputPreview} />
        )}
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "vary" || spec.type === "vary-func") {
    const { active, color, traceInfo } = info(spec);
    const label =
      spec.type === "vary"
        ? `vary [${spec.paramPaths.map((p) => p.join(".")).join(", ")}]`
        : `varyFunc [${spec.initParams.length} params]`;
    const constraintSrc = spec.options.constraint
      ? truncate(spec.options.constraint.toString(), 60)
      : null;
    // TODO: pins?
    return (
      <Box label={label} active={active} color={color} path={path}>
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
      <Box label="closest" path={path}>
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
  } else if (spec.type === "when-far") {
    const gapLabel =
      spec.gapIn === spec.gapOut
        ? `gap=${spec.gapIn}`
        : `gapIn=${spec.gapIn} gapOut=${spec.gapOut}`;
    return (
      <Box label={`whenFar (${gapLabel})`} path={path}>
        <div style={{ display: "flex", flexDirection: "row", gap: 4 }}>
          <Slot label="fg">
            <SpecNode spec={spec.foreground} path={path + "when-far/fg/"} />
          </Slot>
          <Slot label="bg">
            <SpecNode spec={spec.background} path={path + "when-far/bg/"} />
          </Slot>
        </div>
      </Box>
    );
  } else if (spec.type === "on-drop") {
    return wrapper("onDrop", spec);
  } else if (spec.type === "during") {
    const { childPath, traceInfo } = info(spec);
    return (
      <Box label="during" path={path}>
        {traceInfo && (
          <OutputThumbnail outputPreview={traceInfo.outputPreview} />
        )}
        <SpecNode spec={spec.inner} path={childPath} />
      </Box>
    );
  } else if (spec.type === "change-frame") {
    return wrapper("changeFrame", spec);
  } else if (spec.type === "change-result") {
    return wrapper("changeResult", spec);
  } else if (spec.type === "change-gap") {
    return wrapper("changeGap", spec);
  } else if (spec.type === "with-snap-radius") {
    const { childPath, traceInfo } = info(spec);
    const snapped = traceInfo?.snapped ?? false;
    const snapSegment = spec.transition
      ? snapped
        ? "snapped/"
        : "unsnapped/"
      : "";
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
      <Box label={label} path={path}>
        {traceInfo && (
          <OutputThumbnail outputPreview={traceInfo.outputPreview} />
        )}
        <SpecNode spec={spec.inner} path={childPath + snapSegment} />
      </Box>
    );
  } else if (spec.type === "between") {
    const { active, color, traceInfo } = info(spec);
    const allFixed = spec.specs.every((s) => s.type === "fixed");
    return (
      <Box
        label={`between [${spec.specs.length}]${spec.interpolation ? ` (${spec.interpolation})` : ""}`}
        active={active}
        color={color}
        path={path}
      >
        {traceInfo && (
          <OutputThumbnail outputPreview={traceInfo.outputPreview} />
        )}
        {allFixed
          ? traceInfo && (
              <Slot label="states">
                <StateThumbnails
                  renderedStates={traceInfo.renderedStates}
                  closestIndex={traceInfo.closestIndex}
                />
              </Slot>
            )
          : spec.specs.map((childSpec, i) => (
              <SpecNode
                key={i}
                spec={childSpec}
                path={path + `between/${i}/`}
              />
            ))}
      </Box>
    );
  } else if (spec.type === "with-drop-transition") {
    return wrapper(
      `withDropTransition (${describeTransition(spec.transition)})`,
      spec,
    );
  } else if (spec.type === "with-overlay") {
    return wrapper("withOverlay", spec);
  } else if (spec.type === "switch-to-state-and-follow") {
    const { color, traceInfo, childPath } = info(spec);
    return (
      <Box
        label={`switchToStateAndFollow → ${spec.draggedId}`}
        color={color}
        path={path}
      >
        {traceInfo && (
          <SpecNode spec={traceInfo.tracedInner} path={childPath} />
        )}
      </Box>
    );
  } else if (spec.type === "with-branch-transition") {
    return wrapper(
      `withBranchTransition (${describeTransition(spec.transition)})`,
      spec,
    );
  } else if (spec.type === "drop-target") {
    const { active, color, traceInfo } = info(spec);
    return (
      <Box
        label={`dropTarget → ${spec.targetId}`}
        active={active}
        color={color}
        path={path}
      >
        {traceInfo && (
          <StateThumbnails renderedStates={traceInfo.renderedStates} />
        )}
      </Box>
    );
  } else if (spec.type === "with-chaining") {
    return wrapper("withChaining", spec);
  } else if (spec.type === "substate") {
    const { childPath } = info(spec);
    return (
      <Box label={`substate [${spec.path.join(", ")}]`} path={path}>
        <SpecNode spec={spec.innerSpec} path={childPath} />
      </Box>
    );
  } else if (spec.type === "react-to") {
    const { traceInfo, childPath } = info(spec);
    return (
      <Box label="reactTo" path={path}>
        {traceInfo && (
          <>
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
              value: {truncate(String(traceInfo.currentValue), 40)}
              {" · "}
              changes: {traceInfo.changeCount}
            </div>
            <SpecNode spec={traceInfo.tracedInner} path={childPath} />
          </>
        )}
      </Box>
    );
  } else if (spec.type === "with-init-context") {
    return wrapper("withInitContext", spec);
  } else if (spec.type === "custom") {
    return (
      <Box label="custom" path={path}>
        not supported yet
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
  const { svgWidth, svgHeight, thumbArea } = useTreeViewContext();
  if (svgWidth === 0 || svgHeight === 0) return null;
  const aspect = svgWidth / svgHeight;
  const h = Math.round(Math.sqrt(thumbArea / aspect));
  const w = Math.round(h * aspect);
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

function OutputThumbnail({
  outputPreview,
  active,
}: {
  outputPreview: LayeredSvgx;
  active?: boolean;
}) {
  const { svgWidth, svgHeight, thumbArea } = useTreeViewContext();
  if (svgWidth === 0 || svgHeight === 0) return null;
  const aspect = svgWidth / svgHeight;
  const h = Math.round(Math.sqrt(thumbArea / aspect));
  const w = Math.round(h * aspect);
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
          ...(active
            ? { outline: `2px solid ${ACTIVE_BORDER}`, outlineOffset: -1 }
            : {}),
        }}
      >
        {active && (
          <rect
            width={svgWidth}
            height={svgHeight}
            fill={ACTIVE_BORDER}
            opacity={0.15}
          />
        )}
        {drawLayered(outputPreview)}
      </svg>
    </div>
  );
}

// # Shared UI components

function Box({
  label,
  active,
  color,
  path,
  children,
}: {
  label: string;
  active?: boolean;
  color?: string;
  path?: string;
  children?: React.ReactNode;
}) {
  const { nodeProps } = useTreeViewContext();
  const { tightFixed } = useContext(StudioHackContext);
  const myProps = path !== undefined ? nodeProps?.[path] : undefined;

  const bg = color
    ? colorToAlpha(color, 0.15)
    : active
      ? ACTIVE_BG
      : INACTIVE_BG;
  const border = color ? color : active ? ACTIVE_BORDER : INACTIVE_BORDER;

  return (
    <div
      style={{
        width: myProps?.width ?? "fit-content",
        height: myProps?.height,
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
          fontSize: tightFixed ? 15 : 10,
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
