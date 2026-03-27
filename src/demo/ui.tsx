import { PrettyPrint } from "@joshuahhh/pretty-print";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  DropZoneLegend,
  DropZonesSvg,
  useDropZoneData,
} from "../DragSpecDropZones";
import { DragSpecTreeView } from "../DragSpecTreeView";
import { DraggableRenderer, type DragStatus } from "../DraggableRenderer";
import { ErrorBoundary } from "../ErrorBoundary";
import { Draggable } from "../draggable";
import { assert } from "../utils/assert";
import { OpenInEditor } from "./OpenInEditor";
import type { Demo } from "./registry";
import { parseTag, type TagNode, tagStringFromPath } from "./tags";

// # window.dumpState

const dumpStateCallbacks = new Set<() => void>();
declare global {
  interface Window {
    dumpState?: () => void;
  }
}
if (typeof window !== "undefined") {
  window.dumpState = () => {
    for (const cb of dumpStateCallbacks) cb();
  };
}

export type DemoToggleSettings = {
  showTreeView: boolean;
  showDropZones: boolean;
  showDebugOverlay: boolean;
  showStateViewer: boolean;
  showTimingMeter: boolean;
};

export type DemoSettings = DemoToggleSettings & {
  thumbArea: number;
};

const defaultThumbArea = 10000;

const defaultToggles: DemoToggleSettings = {
  showTreeView: false,
  showDropZones: false,
  showDebugOverlay: false,
  showStateViewer: false,
  showTimingMeter: false,
};

export const defaultDemoContext = {
  settings: { ...defaultToggles, thumbArea: defaultThumbArea },
  setToggles: () => {},
};

export const DemoContext = createContext<{
  settings: DemoSettings;
  setToggles: React.Dispatch<React.SetStateAction<DemoToggleSettings>>;
}>(defaultDemoContext);

export const useDemoSettings = () => useContext(DemoContext).settings;

const SETTINGS_KEY = "demo-settings";

function loadToggles(): DemoToggleSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...defaultToggles, ...JSON.parse(stored) };
  } catch {}
  return defaultToggles;
}

export function DemoSettingsProvider({
  children,
  persist = true,
}: {
  children: ReactNode;
  persist?: boolean;
}) {
  const [toggles, setToggles] = useState<DemoToggleSettings>(
    persist ? loadToggles : () => defaultToggles,
  );
  const [thumbArea, setThumbArea] = useState(defaultThumbArea);

  useEffect(() => {
    if (!persist) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toggles));
  }, [toggles, persist]);

  // Thumbnail resize: [ / ] keys (registered once here, not per-DemoDraggable)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "]") {
        setThumbArea((a) => Math.min(Math.round(a * 1.4), 40000));
      } else if (e.key === "[") {
        setThumbArea((a) => Math.max(Math.round(a / 1.4), 400));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const settings: DemoSettings = { ...toggles, thumbArea };

  return (
    <DemoContext.Provider value={{ settings, setToggles }}>
      {children}
    </DemoContext.Provider>
  );
}

const settingsEntries = [
  { key: "showStateViewer", label: "State viewer", mobileHidden: true },
  { key: "showDebugOverlay", label: "Overlay", mobileHidden: false },
  { key: "showTreeView", label: "Spec tree", mobileHidden: true },
  { key: "showDropZones", label: "Drop zones", mobileHidden: false },
  { key: "showTimingMeter", label: "Timing", mobileHidden: true },
] as const;

const settingsIcons: Record<keyof DemoToggleSettings, ReactNode> = {
  showStateViewer: (
    <svg width={18} height={18} viewBox="0 0 14 14" className="shrink-0">
      <text
        x={7}
        y={10.5}
        textAnchor="middle"
        fontSize={11}
        fontFamily="ui-monospace, monospace"
        fill="#64748b"
        fontWeight={700}
      >
        {"{}"}
      </text>
    </svg>
  ),
  showDebugOverlay: (
    <svg width={18} height={18} viewBox="0 0 14 14" className="shrink-0">
      <circle cx={7} cy={7} r={5} fill="magenta" />
    </svg>
  ),
  showTreeView: (
    <svg width={18} height={18} viewBox="0 0 14 14" className="shrink-0">
      <rect
        x={2}
        y={2}
        width={10}
        height={10}
        rx={3}
        ry={3}
        fill="rgba(250, 204, 21, 0.25)"
        stroke="rgb(250, 204, 21)"
        strokeWidth={1.5}
      />
    </svg>
  ),
  showDropZones: (
    <svg width={18} height={18} viewBox="0 0 14 14" className="shrink-0">
      <defs>
        <clipPath id="dz-clip">
          <rect x={1} y={1} width={12} height={12} rx={2} />
        </clipPath>
      </defs>
      <g clipPath="url(#dz-clip)">
        <g opacity={0.35}>
          <path
            d="M7,7 L17,7 A10,10,0,0,1,2,15.66 Z"
            fill="rgb(65, 105, 225)"
          />
          <path
            d="M7,7 L2,15.66 A10,10,0,0,1,2,-1.66 Z"
            fill="rgb(220, 20, 60)"
          />
          <path d="M7,7 L2,-1.66 A10,10,0,0,1,17,7 Z" fill="rgb(34, 139, 34)" />
        </g>
        <line x1={7} y1={7} x2={17} y2={7} stroke="white" strokeWidth={1} />
        <line x1={7} y1={7} x2={2} y2={15.66} stroke="white" strokeWidth={1} />
        <line x1={7} y1={7} x2={2} y2={-1.66} stroke="white" strokeWidth={1} />
      </g>
    </svg>
  ),
  showTimingMeter: (
    <svg width={18} height={18} viewBox="0 0 14 14" className="shrink-0">
      <circle
        cx={7}
        cy={7}
        r={5.5}
        fill="none"
        stroke="#64748b"
        strokeWidth={1.2}
      />
      <line
        x1={7}
        y1={7}
        x2={7}
        y2={3.5}
        stroke="#64748b"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <line
        x1={7}
        y1={7}
        x2={9.5}
        y2={7}
        stroke="#64748b"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  ),
};

const settingsActiveColors: Record<
  keyof DemoToggleSettings,
  { bg: string; border: string }
> = {
  showStateViewer: { bg: "#f1f5f9", border: "#64748b" },
  showDebugOverlay: { bg: "#fdf4ff", border: "#d946ef" },
  showTreeView: { bg: "#fffbeb", border: "#f59e0b" },
  showDropZones: { bg: "#eff6ff", border: "#3b82f6" },
  showTimingMeter: { bg: "#f1f5f9", border: "#64748b" },
};

function TimingMeter() {
  const [msPerFrame, setMsPerFrame] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  const tick = useCallback(() => {
    framesRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;
    if (elapsed >= 1000) {
      setMsPerFrame(+(elapsed / framesRef.current).toFixed(1));
      framesRef.current = 0;
      lastTimeRef.current = now;
    }
  }, []);

  useEffect(() => {
    let id: number;
    const loop = () => {
      tick();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [tick]);

  return (
    <div className="text-xs font-mono text-slate-500">{msPerFrame} ms/f</div>
  );
}

export function DemoSettingsBar({
  only,
  compact,
}: { only?: (keyof DemoSettings)[]; compact?: boolean } = {}) {
  const { settings, setToggles } = useContext(DemoContext);
  const entries = only
    ? settingsEntries.filter(({ key }) => only.includes(key))
    : settingsEntries;
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 flex justify-center pointer-events-none`}
    >
      <div
        className={`pointer-events-auto bg-white border border-gray-200 flex items-center shadow-[0_-4px_12px_rgba(0,0,0,0.08)] ${
          compact
            ? "py-1.5 px-2 rounded-full gap-1 mb-2 border-b"
            : "py-2 px-3 rounded-t-3xl border-b-0 gap-1.5"
        }`}
      >
        {entries.map(({ key, label, mobileHidden }) => {
          const active = settings[key];
          const colors = settingsActiveColors[key];
          return (
            <button
              key={key}
              title={label}
              className={`${
                mobileHidden && !compact
                  ? "hidden md:inline-flex"
                  : "inline-flex"
              } items-center rounded-full border select-none cursor-pointer ${
                compact ? "p-1.5" : "gap-1.5 px-3 py-1.5 text-xs font-medium"
              }`}
              style={
                active
                  ? {
                      backgroundColor: colors.bg,
                      borderColor: colors.border,
                      color: "#374151",
                    }
                  : {
                      backgroundColor: "transparent",
                      borderColor: "#e2e8f0",
                      color: "#94a3b8",
                    }
              }
              onClick={() => setToggles((s) => ({ ...s, [key]: !s[key] }))}
            >
              <span className="shrink-0" style={{ opacity: active ? 1 : 0.4 }}>
                {settingsIcons[key]}
              </span>
              {!compact && label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DemoDraggable<T extends object>({
  draggable,
  initialState,
  width,
  height,
  onDropState,
  stateRef,
}: {
  draggable: Draggable<T>;
  initialState: T;
  width: number;
  height: number;
  onDropState?: (state: T) => void;
  stateRef?: React.RefObject<T | null>;
}) {
  const {
    showTreeView,
    showDropZones,
    showDebugOverlay,
    showStateViewer,
    showTimingMeter,
    thumbArea,
  } = useDemoSettings();
  const [status, setStatus] = useState<DragStatus<T> | null>(null);

  useEffect(() => {
    if (stateRef) {
      if (status?.type === "idle") {
        stateRef.current = status.state;
      } else {
        stateRef.current = null;
      }
    }
  }, [stateRef, status]);

  useEffect(() => {
    const cb = () => {
      if (status?.type === "idle") {
        console.log(status.state);
      }
    };
    dumpStateCallbacks.add(cb);
    return () => {
      dumpStateCallbacks.delete(cb);
    };
  }, [status]);

  const draggingStatus = status?.type === "dragging" ? status : null;

  const { data: overlayData, computing: overlayComputing } = useDropZoneData(
    showDropZones ? draggingStatus : null,
    width,
    height,
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-col gap-2">
        <div className="flex gap-4 items-start">
          <div className="relative">
            <DraggableRenderer
              draggable={draggable}
              initialState={initialState}
              width={width}
              height={height}
              onDragStatus={setStatus}
              showDebugOverlay={showDebugOverlay}
              onDropState={onDropState}
            />
            {showDropZones && overlayData && (
              <DropZonesSvg data={overlayData} width={width} height={height} />
            )}
            {showDropZones && overlayComputing && (
              <svg
                width={20}
                height={20}
                className="absolute top-1.5 left-1.5 pointer-events-none"
                viewBox="0 0 20 20"
              >
                <circle
                  cx={10}
                  cy={10}
                  r={7}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="11 33"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 10 10"
                    to="360 10 10"
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
            )}
          </div>
          {(showTreeView || showStateViewer || showTimingMeter) && (
            <div className="min-w-72 flex-1 flex flex-col gap-2">
              {showTimingMeter && <TimingMeter />}
              {showTreeView && (
                <>
                  {draggingStatus ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-xs text-slate-500 font-mono whitespace-nowrap">
                        activePath: {draggingStatus.result.activePath}
                      </div>
                      <DragSpecTreeView
                        spec={draggingStatus.result.tracedSpec}
                        activePath={draggingStatus.result.activePath}
                        colorMap={overlayData?.colorMap ?? null}
                        svgWidth={width}
                        svgHeight={height}
                        thumbArea={thumbArea}
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">
                      Drag an element to see its spec tree
                    </div>
                  )}
                </>
              )}
              {showStateViewer && status && (
                <ErrorBoundary>
                  <div className="flex gap-4">
                    <div className="min-w-[50%]">
                      <div className="text-xs text-slate-500">drop state</div>
                      <PrettyPrint
                        value={
                          status.type === "dragging"
                            ? status.startState
                            : status.state
                        }
                        precision={2}
                        style={{ fontSize: "11px" }}
                        niceId={false}
                        niceType={false}
                      />
                    </div>
                    {status.type === "dragging" && (
                      <div className="min-w-[50%]">
                        <div className="text-xs text-slate-500">drag state</div>
                        <PrettyPrint
                          value={status.result.dropState}
                          precision={2}
                          style={{ fontSize: "11px" }}
                          niceId={false}
                          niceType={false}
                        />
                      </div>
                    )}
                  </div>
                  {/* {status.springOrigin && (
                    <div>
                      <div className="text-xs text-slate-500 mb-1">
                        Spring origin
                      </div>
                      <svg
                        width={120}
                        height={120 * (height / width)}
                        viewBox={`0 0 ${width} ${height}`}
                        className="border border-slate-200 rounded bg-white"
                      >
                        {drawLayered(status.springOrigin.layered)}
                      </svg>
                    </div>
                  )} */}
                </ErrorBoundary>
              )}
            </div>
          )}
        </div>
        {showDropZones && !showTreeView && overlayData && (
          <DropZoneLegend data={overlayData} />
        )}
      </div>
    </ErrorBoundary>
  );
}

export function ConfigCheckbox({
  label,
  value,
  onChange,
  children,
}: {
  label?: string;
  value: boolean;
  onChange: (newValue: boolean) => void;
  children?: React.ReactNode;
}) {
  assert(!(label && children), "Provide either label or children, not both");
  return (
    <label className="flex items-start gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label ?? children}</span>
    </label>
  );
}

export function ConfigSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span>
        {label}: {formatValue ? formatValue(value) : value}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function DemoNotes({ children }: { children?: React.ReactNode }) {
  return <div className="text-sm text-gray-600 mb-4">{children}</div>;
}

export function DemoLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className="text-blue-600/70 hover:text-blue-700 hover:underline"
      {...props}
    />
  );
}

export function DemoTags({ children }: { children?: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5 mb-4">{children}</div>;
}

export function DemoTag({
  tag,
  onTagClick,
}: {
  tag: string;
  onTagClick?: (filter: string) => void;
}) {
  const parsed = parseTag(tag);
  return (
    <TagNodeView
      node={parsed}
      ancestorPath={[]}
      onTagClick={onTagClick}
      isRoot
    />
  );
}

function TagNodeView({
  node,
  ancestorPath,
  onTagClick,
  isRoot,
}: {
  node: TagNode;
  ancestorPath: string[];
  onTagClick?: (filter: string) => void;
  isRoot: boolean;
}) {
  const currentPath = [...ancestorPath, node.text];
  const filterString = tagStringFromPath(currentPath);
  const hasChildren = node.children.length > 0;

  const handleClick = onTagClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onTagClick(filterString);
      }
    : undefined;

  const clickable = onTagClick ? "cursor-pointer" : "";

  if (isRoot && !hasChildren) {
    return (
      <span
        className={`inline-flex items-center text-xs border rounded px-1.5 py-0.5 text-slate-500 bg-slate-50 border-slate-200 ${clickable} ${onTagClick ? "hover:bg-slate-100" : ""}`}
        onClick={handleClick}
      >
        {node.text}
      </span>
    );
  }

  if (isRoot) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs border rounded pl-1.5 pr-0.5 py-0.5 text-slate-500 bg-slate-50 border-slate-200 ${clickable} ${onTagClick ? "hover:bg-slate-100" : ""}`}
        onClick={handleClick}
      >
        {node.text}
        {node.children.map((child, i) => (
          <TagNodeView
            key={i}
            node={child}
            ancestorPath={currentPath}
            onTagClick={onTagClick}
            isRoot={false}
          />
        ))}
      </span>
    );
  }

  // Sub-tag
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] border rounded px-1 py-0 text-slate-500 bg-white border-slate-300 ${clickable} ${onTagClick ? "hover:bg-slate-100" : ""}`}
      onClick={handleClick}
    >
      {node.text}
      {node.children.map((child, i) => (
        <TagNodeView
          key={i}
          node={child}
          ancestorPath={currentPath}
          onTagClick={onTagClick}
          isRoot={false}
        />
      ))}
    </span>
  );
}

export function DemoWithConfig({ children }: { children: React.ReactNode }) {
  const { showTreeView, showStateViewer, showTimingMeter } = useDemoSettings();
  const debugOpen = showTreeView || showStateViewer || showTimingMeter;
  return (
    <div
      className={`flex flex-col ${debugOpen ? "" : "md:flex-row"} gap-4 items-start`}
    >
      {children}
    </div>
  );
}

export function ConfigPanel({
  title = "Options",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded p-3 shrink-0 md:sticky md:top-4">
      <div className="text-xs font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function ConfigSelect<T>({
  label,
  value,
  onChange,
  options,
  stringifyOption,
  children,
}: {
  label?: string;
  value: T;
  onChange: (newValue: T) => void;
  options: readonly T[];
  stringifyOption?: (option: T) => string;
  children?: React.ReactNode;
}) {
  assert(!(label && children), "Provide either label or children, not both");
  const stringify = stringifyOption ?? ((opt: T) => String(opt));
  return (
    <label className="flex items-start gap-2 text-xs">
      <span>{label ?? children}</span>
      <select
        value={stringify(value)}
        onChange={(e) => {
          const selected = options.find(
            (opt) => stringify(opt) === e.target.value,
          );
          assert(selected !== undefined, "Selected option not found");
          onChange(selected);
        }}
        className="text-xs border border-gray-300 rounded px-2 py-1"
      >
        {options.map((option) => {
          const stringValue = stringify(option);
          return (
            <option key={stringValue} value={stringValue}>
              {stringValue}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function ConfigRadio<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (newValue: T) => void;
  options: Record<T, React.ReactNode> | readonly T[];
}) {
  const entries: [T, React.ReactNode][] = Array.isArray(options)
    ? options.map((k) => [k, k])
    : (Object.entries(options) as [T, React.ReactNode][]);
  return (
    <fieldset className="flex flex-col gap-1 text-xs">
      {label && (
        <legend className="font-medium text-gray-600 mb-1">{label}</legend>
      )}
      {entries.map(([key, node]) => (
        <label key={key} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={value === key}
            onChange={() => onChange(key)}
            className="accent-blue-500"
          />
          {node}
        </label>
      ))}
    </fieldset>
  );
}

export function DemoCard({
  demo,
  linkTitle,
  onTagClick,
}: {
  demo: Demo;
  linkTitle?: boolean;
  onTagClick?: (label: string) => void;
}) {
  const sourceUrl = `https://github.com/joshuahhh/draggable-diagrams/blob/main/src/demos/${demo.sourcePath}`;
  return (
    <div
      className={`bg-white rounded-lg p-5 shadow-sm ${demo.cardClassName ?? ""}`}
    >
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 m-0">
          {linkTitle ? (
            <Link
              to={`/demos/${demo.id}`}
              className="no-underline text-gray-900 hover:text-gray-700 hover:underline"
            >
              {demo.id}
            </Link>
          ) : (
            demo.id
          )}
        </h2>
        <div className="flex gap-3">
          <OpenInEditor
            relativePath={`src/demos/${demo.sourcePath}`}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
          >
            open in editor
          </OpenInEditor>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-700 no-underline hover:underline"
          >
            github
          </a>
        </div>
      </div>
      {demo.tags && demo.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {demo.tags.map((tag) => (
            <DemoTag key={tag} tag={tag} onTagClick={onTagClick} />
          ))}
        </div>
      )}
      <demo.Component />
    </div>
  );
}
