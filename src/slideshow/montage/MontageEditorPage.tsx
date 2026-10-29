import _ from "lodash";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Draggable } from "../../draggable";
import { DraggableRenderer } from "../../DraggableRenderer";
import { moreThan, param } from "../../DragSpec";
import { equal } from "../../math/optimization";
import { scale, translate } from "../../svgx/helpers";
import { STAGE_H, STAGE_W } from "../slide";
import { ACTIVE_MONTAGE_LAYOUT, montageLayouts, tilesBounds } from "./layout";
import {
  type MontageLayout,
  type MontageLayoutName,
  type MontageTile,
  type Rect,
  SAVE_MONTAGE_PATH,
  type SaveMontageResponse,
} from "./montageApi";
import {
  MONTAGE_PLAN_SPLIT,
  MONTAGE_PLAN_TIMED,
  MontagePlayer,
} from "./MontageCanvas";
import { TileContent } from "./MontageTile";

// The montage editor (#/montage-editor), for laying out the montage by hand.
// It's built with Dragology: tiles move and resize by `d.vary`, snapping to
// their neighbors' edges with `.during`. Saving writes layout.json through the
// dev server (vite-plugin-montage-layout.ts).

type EditorState = { layout: MontageLayout; selected: string | null };

type Options = {
  zoom: number;
  /** The canvas point at the canvas's top-left corner */
  origin: { x: number; y: number };
  lockAspect: boolean;
  snap: boolean;
  showViews: boolean;
  playVideos: boolean;
};

/** How close an edge must come to another, in screen pixels, to snap to it */
const SNAP_PX = 10;
const HANDLE_PX = 14;
const MIN_SIZE = 40;

/**
 * Every video in public/slides/closing-montage (clips from the submission
 * video) and public/slides/canvas-clips (recorded for the canvas by
 * d2-talk/recorder/vrec.js), found at build time
 */
const montageFiles = Object.keys(
  import.meta.glob([
    "/public/slides/closing-montage/*.mp4",
    "/public/slides/canvas-clips/*.mp4",
  ]),
)
  .map((p) => p.replace("/public/slides/", ""))
  .sort();

// # Snapping

/**
 * The value among `candidates` nearest `v`, if within `tol`; otherwise `v`.
 */
function snapTo(v: number, candidates: number[], tol: number): number {
  let best = v;
  let bestD = tol;
  for (const c of candidates) {
    const dist = Math.abs(c - v);
    if (dist < bestD) [best, bestD] = [c, dist];
  }
  return best;
}

/** Where another rect's edges invite this rect's near edge, along one axis */
function edgeTargets(
  others: Rect[],
  gutter: number,
  axis: "x" | "y",
): { starts: number[]; ends: number[] } {
  const size = axis === "x" ? "w" : "h";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const o of others) {
    const lo = o[axis];
    const hi = o[axis] + o[size];
    starts.push(lo, hi + gutter);
    ends.push(hi, lo - gutter);
  }
  return { starts, ends };
}

function withTile(
  state: EditorState,
  id: string,
  f: (t: MontageTile) => MontageTile,
): EditorState {
  return {
    ...state,
    layout: {
      ...state.layout,
      tiles: state.layout.tiles.map((t) => (t.id === id ? f(t) : t)),
    },
  };
}

function snapMove(id: string, tol: number) {
  return (state: EditorState): EditorState => {
    const { tiles, gutter } = state.layout;
    const others = tiles.filter((t) => t.id !== id);
    return withTile(state, id, (t) => {
      const snapAxis = (axis: "x" | "y") => {
        const size = axis === "x" ? t.w : t.h;
        const { starts, ends } = edgeTargets(others, gutter, axis);
        const a = snapTo(t[axis], starts, tol);
        const b = snapTo(t[axis] + size, ends, tol) - size;
        // Whichever edge snapped by less
        if (a === t[axis]) return Math.round(b);
        if (b === t[axis]) return Math.round(a);
        return Math.round(
          Math.abs(a - t[axis]) <= Math.abs(b - t[axis]) ? a : b,
        );
      };
      return { ...t, x: snapAxis("x"), y: snapAxis("y") };
    });
  };
}

function snapResize(id: string, tol: number, aspect: number | null) {
  return (state: EditorState): EditorState => {
    const { tiles, gutter } = state.layout;
    const others = tiles.filter((t) => t.id !== id);
    return withTile(state, id, (t) => {
      const right = snapTo(
        t.x + t.w,
        edgeTargets(others, gutter, "x").ends,
        tol,
      );
      const bottom = snapTo(
        t.y + t.h,
        edgeTargets(others, gutter, "y").ends,
        tol,
      );
      let w = right - t.x;
      let h = bottom - t.y;
      if (aspect !== null) {
        // Keep the aspect, from whichever edge snapped (or the right one)
        if (bottom !== t.y + t.h && right === t.x + t.w) w = h * aspect;
        else h = w / aspect;
      }
      return { ...t, w: Math.round(w), h: Math.round(h) };
    });
  };
}

// # The canvas, as a draggable

function makeEditorDraggable(opts: Options): Draggable<EditorState> {
  const { zoom, origin, lockAspect, snap, showViews, playVideos } = opts;
  const tol = snap ? SNAP_PX / zoom : 0;
  const handle = HANDLE_PX / zoom;
  const stroke = 1 / zoom;
  return ({ state, d, setState, draggedId }) => {
    const { layout, selected } = state;
    const select = (id: string | null) =>
      setState({ ...state, selected: id }, { transition: false });
    return (
      <g
        transform={translate(-origin.x * zoom, -origin.y * zoom) + scale(zoom)}
      >
        {layout.tiles.map((t, i) => {
          const isSel = t.id === selected;
          const tileId = `tile-${t.id}`;
          return (
            <g
              id={tileId}
              transform={translate(t.x, t.y)}
              dragologyZIndex={
                draggedId === tileId || draggedId === `resize-${t.id}`
                  ? "/1"
                  : false
              }
              onClick={() => select(t.id)}
              style={{ cursor: "move" }}
              dragologyOnDrag={() =>
                d
                  .vary({ ...state, selected: t.id }, [
                    param("layout", "tiles", i, "x"),
                    param("layout", "tiles", i, "y"),
                  ])
                  .during(snapMove(t.id, tol))
              }
            >
              <rect
                width={t.w}
                height={t.h}
                rx={layout.radius}
                fill={layout.tileStyle === "bare" ? "transparent" : "white"}
              />
              <foreignObject width={t.w} height={t.h}>
                <EditorTile
                  tile={t}
                  radius={layout.radius}
                  play={playVideos}
                  alpha={layout.alpha}
                />
              </foreignObject>
              <rect
                width={t.w}
                height={t.h}
                rx={layout.radius}
                fill="none"
                stroke={
                  isSel
                    ? "#2563eb"
                    : layout.tileStyle === "bare"
                      ? "rgba(0,0,0,0.12)"
                      : "rgba(0,0,0,0.25)"
                }
                strokeWidth={(isSel ? 3 : 1) * stroke}
              />
              <g
                id={`resize-${t.id}`}
                transform={translate(t.w, t.h)}
                style={{ cursor: "nwse-resize" }}
                dragologyOnDrag={() => {
                  const aspect = lockAspect ? t.w / t.h : null;
                  return d
                    .vary(
                      { ...state, selected: t.id },
                      [
                        param("layout", "tiles", i, "w"),
                        param("layout", "tiles", i, "h"),
                      ],
                      {
                        constraint: (s) => {
                          const tt = s.layout.tiles[i];
                          return [
                            moreThan(tt.w, MIN_SIZE),
                            moreThan(tt.h, MIN_SIZE),
                            ...(aspect === null
                              ? []
                              : equal(tt.w, tt.h * aspect)),
                          ];
                        },
                      },
                    )
                    .during(snapResize(t.id, tol, aspect));
                }}
              >
                <rect
                  transform={translate(-handle, -handle)}
                  width={handle * 1.4}
                  height={handle * 1.4}
                  rx={handle * 0.3}
                  fill={isSel ? "#2563eb" : "rgba(0,0,0,0.35)"}
                  stroke="white"
                  strokeWidth={stroke * 1.5}
                />
              </g>
            </g>
          );
        })}
        {showViews &&
          Object.entries(layout.views).map(([name, v]) => (
            <g
              id={`view-${name}`}
              transform={translate(v.x, v.y)}
              dragologyZIndex={2}
              style={{ cursor: "move" }}
              dragologyOnDrag={() =>
                d.vary(state, [
                  param("layout", "views", name, "x"),
                  param("layout", "views", name, "y"),
                ])
              }
            >
              <rect
                width={v.w}
                height={v.h}
                fill="none"
                stroke="#e11d48"
                strokeWidth={2 * stroke}
                strokeDasharray={`${8 * stroke} ${6 * stroke}`}
                pointerEvents="none"
              />
              {/* A frame to grab the view by, wider than the line drawn */}
              <rect
                width={v.w}
                height={v.h}
                fill="none"
                stroke="transparent"
                strokeWidth={handle}
                pointerEvents="stroke"
              />
              <g transform={translate(0, -22 * stroke)}>
                <rect
                  width={(name.length * 8 + 16) * stroke}
                  height={20 * stroke}
                  rx={4 * stroke}
                  fill="#e11d48"
                />
                <text
                  transform={translate(8 * stroke, 14 * stroke)}
                  fontSize={13 * stroke}
                  fill="white"
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  {name}
                </text>
              </g>
              <g
                id={`view-resize-${name}`}
                transform={translate(v.w, v.h)}
                style={{ cursor: "nwse-resize" }}
                dragologyOnDrag={() => {
                  const aspect = STAGE_W / STAGE_H;
                  return d.vary(
                    state,
                    [
                      param("layout", "views", name, "w"),
                      param("layout", "views", name, "h"),
                    ],
                    {
                      constraint: (s) => {
                        const vv = s.layout.views[name];
                        return [
                          moreThan(vv.w, 200),
                          ...equal(vv.w, vv.h * aspect),
                        ];
                      },
                    },
                  );
                }}
              >
                <circle r={handle * 0.7} fill="#e11d48" stroke="white" />
              </g>
            </g>
          ))}
      </g>
    );
  };
}

/** A tile's video in the editor, still unless the videos are set to play */
function EditorTile({
  tile,
  radius,
  play,
  alpha,
}: {
  tile: MontageTile;
  radius: number;
  play: boolean;
  alpha?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* Remount on toggling play, so autoplay takes effect */}
      <TileContent
        key={String(play)}
        tile={tile}
        paused={!play}
        alpha={alpha}
      />
    </div>
  );
}

// # The page

/** Bounds of the tiles and views, padded, for fitting the canvas to the page */
function contentBounds(layout: MontageLayout): Rect {
  const rects = [...layout.tiles, ...Object.values(layout.views)];
  const b = tilesBounds(
    rects.map((r) => ({ ...r, id: "", file: null, groups: [] })),
  );
  const pad = 60;
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

/** The aspect ratio of each video, once its metadata loads */
function useClipAspects(files: string[]) {
  const [aspects, setAspects] = useState<Record<string, number>>({});
  useEffect(() => {
    const videos = files.map((file) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () =>
        setAspects((a) => ({ ...a, [file]: v.videoWidth / v.videoHeight }));
      v.src = `${import.meta.env.BASE_URL}slides/${file}`;
      return v;
    });
    return () => videos.forEach((v) => v.removeAttribute("src"));
  }, [files]);
  return aspects;
}

async function saveLayout(
  name: MontageLayoutName,
  layout: MontageLayout,
): Promise<SaveMontageResponse> {
  try {
    const res = await fetch(`${SAVE_MONTAGE_PATH}?name=${name}`, {
      method: "POST",
      body: JSON.stringify(layout),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return (await res.json()) as SaveMontageResponse;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function MontageEditorPage() {
  const [layoutName, setLayoutName] = useState<MontageLayoutName>(
    ACTIVE_MONTAGE_LAYOUT,
  );
  const [state, setStateRaw] = useState<EditorState>({
    layout: montageLayouts[layoutName],
    selected: null,
  });
  const [saved, setSaved] = useState(() =>
    JSON.stringify(montageLayouts[layoutName]),
  );
  const [status, setStatus] = useState<string>("");

  // The latest state, ahead of rendering, so that keys pressed in quick
  // succession each see the one before. Undo history lives here too, outside
  // of state updaters (which StrictMode runs twice).
  const stateRef = useRef(state);
  const history = useRef<MontageLayout[]>([]);
  const future = useRef<MontageLayout[]>([]);
  const commit = useCallback((next: EditorState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const setState = useCallback(
    (next: EditorState) => {
      if (next.layout !== stateRef.current.layout) {
        history.current.push(stateRef.current.layout);
        future.current = [];
      }
      commit(next);
    },
    [commit],
  );
  const updateLayout = useCallback(
    (f: (l: MontageLayout) => MontageLayout) =>
      setState({ ...stateRef.current, layout: f(stateRef.current.layout) }),
    [setState],
  );
  const select = useCallback(
    (id: string | null) => commit({ ...stateRef.current, selected: id }),
    [commit],
  );
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(stateRef.current.layout);
    commit({ ...stateRef.current, layout: prev });
  }, [commit]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(stateRef.current.layout);
    commit({ ...stateRef.current, layout: next });
  }, [commit]);

  const [opts, setOpts] = useState({
    lockAspect: true,
    snap: true,
    showViews: true,
    playVideos: false,
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // The canvas fits the page's width, from the bounds when last fitted (not
  // live, so the canvas holds still while tiles move)
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(1200);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const [frame, setFrame] = useState(() =>
    contentBounds(montageLayouts[layoutName]),
  );
  const zoom = areaW / frame.w;

  const draggable = useMemo(
    () =>
      makeEditorDraggable({
        zoom,
        origin: { x: frame.x, y: frame.y },
        ...opts,
      }),
    [zoom, frame.x, frame.y, opts],
  );

  const dirty = JSON.stringify(state.layout) !== saved;
  const save = useCallback(async () => {
    setStatus("saving…");
    const res = await saveLayout(layoutName, state.layout);
    if (res.error) {
      setStatus(`error: ${res.error}`);
    } else {
      setSaved(JSON.stringify(state.layout));
      setStatus(res.changed ? "saved" : "no changes");
    }
  }, [layoutName, state.layout]);

  const switchLayout = (name: MontageLayoutName) => {
    if (name === layoutName) return;
    if (dirty && !window.confirm(`Drop unsaved changes to "${layoutName}"?`))
      return;
    const next = montageLayouts[name];
    history.current = [];
    future.current = [];
    commit({ layout: next, selected: null });
    setSaved(JSON.stringify(next));
    setFrame(contentBounds(next));
    setLayoutName(name);
    setStatus("");
  };

  const selectedTile = state.layout.tiles.find((t) => t.id === state.selected);
  const aspects = useClipAspects(montageFiles);

  // Keyboard: save, undo/redo, delete, nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        void save();
      } else if (typing) {
        return;
      } else if (mod && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (
        state.selected &&
        (e.key === "Backspace" || e.key === "Delete")
      ) {
        const id = state.selected;
        updateLayout((l) => ({
          ...l,
          tiles: l.tiles.filter((t) => t.id !== id),
        }));
      } else if (state.selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[e.key] ?? [0, 0];
        const id = state.selected;
        updateLayout((l) => ({
          ...l,
          tiles: l.tiles.map((t) =>
            t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t,
          ),
        }));
      } else if (e.key === "Escape") {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo, updateLayout, select, state.selected]);

  const addTile = () => {
    const start = state.layout.views.start ?? frame;
    const id = `tile-${Math.random().toString(36).slice(2, 7)}`;
    const tile: MontageTile = {
      id,
      file: null,
      label: "new clip",
      x: Math.round(start.x + start.w / 2 - 160),
      y: Math.round(start.y + start.h / 2 - 90),
      w: 320,
      h: 180,
      groups: [],
    };
    updateLayout((l) => ({ ...l, tiles: [...l.tiles, tile] }));
    select(id);
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "100vh", fontFamily: "system-ui, sans-serif" }}
    >
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 text-sm flex-wrap">
        <b>Montage editor</b>
        <Seg
          value={layoutName}
          options={Object.keys(montageLayouts)}
          onChange={(n) => switchLayout(n as MontageLayoutName)}
        />
        <Seg
          value={mode}
          options={["edit", "preview"]}
          onChange={(m) => setMode(m as "edit" | "preview")}
        />
        <button className={btn} onClick={save} disabled={!dirty}>
          Save{dirty ? " *" : ""}
        </button>
        <span className="text-gray-500 min-w-20">{status}</span>
        {mode === "edit" && (
          <>
            <button className={btn} onClick={undo}>
              Undo
            </button>
            <button className={btn} onClick={redo}>
              Redo
            </button>
            <button className={btn} onClick={addTile}>
              Add tile
            </button>
            <button
              className={btn}
              onClick={() => setFrame(contentBounds(state.layout))}
            >
              Fit
            </button>
            <Check
              label="lock aspect"
              value={opts.lockAspect}
              onChange={(v) => setOpts({ ...opts, lockAspect: v })}
            />
            <Check
              label="snap"
              value={opts.snap}
              onChange={(v) => setOpts({ ...opts, snap: v })}
            />
            <Check
              label="views"
              value={opts.showViews}
              onChange={(v) => setOpts({ ...opts, showViews: v })}
            />
            <Check
              label="play videos"
              value={opts.playVideos}
              onChange={(v) => setOpts({ ...opts, playVideos: v })}
            />
          </>
        )}
        <span className="text-gray-400 ml-auto">
          drag to move · corner to resize · ⌘S save · ⌘Z undo · ⌫ delete ·
          arrows nudge
        </span>
      </div>
      {mode === "preview" ? (
        <MontagePreview layout={state.layout} />
      ) : (
        <div className="flex flex-1 min-h-0">
          <div
            ref={areaRef}
            className="flex-1 overflow-auto"
            style={{ background: state.layout.background ?? "#27272a" }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) select(null);
            }}
          >
            <DraggableRenderer
              draggable={draggable}
              state={state}
              onDropState={setState}
              width={areaW}
              height={frame.h * zoom}
            />
          </div>
          <div className="w-72 border-l border-gray-200 p-3 overflow-auto text-sm">
            {selectedTile ? (
              <TileInspector
                tile={selectedTile}
                layout={state.layout}
                aspects={aspects}
                onChange={(next) =>
                  updateLayout((l) => ({
                    ...l,
                    tiles: l.tiles.map((t) =>
                      t.id === selectedTile.id ? next : t,
                    ),
                  }))
                }
                onSelectId={(id) => select(id)}
                onDelete={() =>
                  updateLayout((l) => ({
                    ...l,
                    tiles: l.tiles.filter((t) => t.id !== selectedTile.id),
                  }))
                }
              />
            ) : (
              <LayoutSummary layout={state.layout} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const btn =
  "px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40";

function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded border border-gray-300 overflow-hidden">
      {options.map((o) => (
        <button
          key={o}
          className={`px-2 py-0.5 ${o === value ? "bg-gray-800 text-white" : "bg-white"}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 mb-2">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const input = "border border-gray-300 rounded px-1 py-0.5 w-full";

function TileInspector({
  tile,
  layout,
  aspects,
  onChange,
  onSelectId,
  onDelete,
}: {
  tile: MontageTile;
  layout: MontageLayout;
  aspects: Record<string, number>;
  onChange: (t: MontageTile) => void;
  onSelectId: (id: string) => void;
  onDelete: () => void;
}) {
  const [idDraft, setIdDraft] = useState(tile.id);
  useEffect(() => setIdDraft(tile.id), [tile.id]);
  const aspect = tile.file ? aspects[tile.file] : undefined;
  const commitId = () => {
    const id = idDraft.trim().replace(/[^\w-]/g, "-");
    if (!id || id === tile.id) return setIdDraft(tile.id);
    if (layout.tiles.some((t) => t.id === id)) return setIdDraft(tile.id);
    onChange({ ...tile, id });
    onSelectId(id);
  };
  return (
    <div>
      <Field label="id">
        <input
          className={input}
          value={idDraft}
          onChange={(e) => setIdDraft(e.target.value)}
          onBlur={commitId}
          onKeyDown={(e) => e.key === "Enter" && commitId()}
        />
      </Field>
      <Field label="clip">
        <select
          className={input}
          value={tile.file ?? ""}
          onChange={(e) => onChange({ ...tile, file: e.target.value || null })}
        >
          <option value="">(placeholder: clip to come)</option>
          {montageFiles.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field label="label / note">
        <textarea
          className={input}
          rows={3}
          value={tile.label ?? ""}
          onChange={(e) =>
            onChange({ ...tile, label: e.target.value || undefined })
          }
        />
      </Field>
      <div className="text-xs text-gray-500 mb-1">groups</div>
      <div className="flex flex-col mb-2">
        {layout.groups.map((g) => (
          <Check
            key={g.id}
            label={g.label}
            value={tile.groups.includes(g.id)}
            onChange={(v) =>
              onChange({
                ...tile,
                groups: v
                  ? [...tile.groups, g.id]
                  : tile.groups.filter((x) => x !== g.id),
              })
            }
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <Field key={k} label={k}>
            <input
              className={input}
              type="number"
              value={tile[k]}
              onChange={(e) =>
                onChange({ ...tile, [k]: Number(e.target.value) || 0 })
              }
            />
          </Field>
        ))}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        tile aspect {(tile.w / tile.h).toFixed(3)}
        {aspect !== undefined && <> · clip {aspect.toFixed(3)}</>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {aspect !== undefined && (
          <button
            className={btn}
            onClick={() =>
              onChange({ ...tile, h: Math.round(tile.w / aspect) })
            }
          >
            Fit clip aspect
          </button>
        )}
        <button className={btn} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function LayoutSummary({ layout }: { layout: MontageLayout }) {
  const used = new Set(layout.tiles.map((t) => t.file));
  const unused = montageFiles.filter((f) => !used.has(f));
  const placeholders = layout.tiles.filter((t) => !t.file);
  return (
    <div className="text-gray-600">
      <p className="mb-2">
        {layout.tiles.length} tiles, {placeholders.length} placeholders. Click a
        tile to edit it.
      </p>
      {_.map(layout.groups, (g) => (
        <div key={g.id}>
          {g.label}:{" "}
          {layout.tiles.filter((t) => t.groups.includes(g.id)).length}
        </div>
      ))}
      {unused.length > 0 && (
        <>
          <div className="mt-3 text-xs text-gray-500">unused clips</div>
          {unused.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </>
      )}
    </div>
  );
}

/** The montage as the slide shows it, stepped with buttons or arrow keys */
function MontagePreview({ layout }: { layout: MontageLayout }) {
  const [split, setSplit] = useState(false);
  const plan = split ? MONTAGE_PLAN_SPLIT : MONTAGE_PLAN_TIMED;
  const [step, setStep] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const zoom = Math.min(
        el.clientWidth / STAGE_W,
        el.clientHeight / STAGE_H,
      );
      setSize({ w: STAGE_W * zoom, h: STAGE_H * zoom });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ")
        setStep((s) => Math.min(plan.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan.length]);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        step
        {plan.map((_, i) => (
          <button
            key={i}
            className={`${btn} ${i === step ? "!bg-gray-800 text-white" : ""}`}
            onClick={() => setStep(i)}
          >
            {i}
          </button>
        ))}
        <Check
          label="a step per group"
          value={split}
          onChange={(v) => {
            setSplit(v);
            setStep(0);
          }}
        />
        <span className="text-gray-400">← → to step</span>
      </div>
      <div
        ref={areaRef}
        className="flex-1 min-h-0 flex items-center justify-center bg-black"
      >
        {/* Laid out at stage size and zoomed, as the slideshow does */}
        <div
          style={{
            position: "relative",
            width: STAGE_W,
            height: STAGE_H,
            zoom: size.w / STAGE_W,
          }}
        >
          <MontagePlayer plan={plan} step={step} layout={layout} />
        </div>
      </div>
    </div>
  );
}
