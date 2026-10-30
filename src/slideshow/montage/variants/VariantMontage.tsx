import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { STAGE_H, STAGE_W, useSlideShown, useSlideStep } from "../../slide";
import type { Rect } from "../layout";
import {
  GroupCaption,
  MONTAGE_PLAN_TIMED,
  type MontageStep,
  useCycle,
} from "../MontageCanvas";
import { clipUrl, useClipsLoaded } from "./clipBlobs";
import { type Body, step as simStep, tileSize, updateBoxes } from "./physics";
import { makeVariant, type VariantId, variantView } from "./variants";

// A montage variant, drawn: tiles of looping clips on a plain canvas, seen
// through a camera that follows the slide's plan like the grid montage's
// does. Every frame, the bodies move (in the variants that move), the camera
// moves, and each tile on screen is placed by setting its transform
// directly. Only the tiles in or near view are mounted. On a repeating
// canvas a clip can be in view more than once (a period apart); it plays in
// one video, at one of its copies, and the others are canvases painted from
// that video each frame, so there's never more than a video per clip.

type Camera = { scale: number; cx: number; cy: number };

function cameraFor(view: Rect, width: number, height: number): Camera {
  return {
    scale: Math.min(width / view.w, height / view.h),
    cx: view.x + view.w / 2,
    cy: view.y + view.h / 2,
  };
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    scale: a.scale * Math.pow(b.scale / a.scale, t),
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
  };
}

/**
 * The periods of a repeating canvas that a view might see some of: the one
 * the camera's in and those either side. (The camera glides on and on, so
 * that's wherever it's got to, not where it started.)
 */
function periodsAround(
  torus: { W: number; H: number } | null,
  camera: Camera,
): [number[], number[]] {
  if (!torus) return [[0], [0]];
  const i = Math.floor(camera.cx / torus.W),
    j = Math.floor(camera.cy / torus.H);
  return [
    [i - 1, i, i + 1],
    [j - 1, j, j + 1],
  ];
}

/** A copy of a body's tile: the body, a whole number of periods away */
type Copy = { key: string; body: number; i: number; j: number };

/**
 * What's mounted: each body near the view, as a video at its main copy,
 * and its other copies in view, as canvases
 */
type Mounted = { main: Map<number, Copy>; mirrors: Copy[] };

export type VariantMontageProps = {
  variant: VariantId;
  view: string | Rect;
  pan?: { to: string | Rect; ms: number };
  highlight?: string | null;
  cameraMs?: number;
  dimOpacity?: number;
  paused?: boolean;
  width?: number;
  height?: number;
  caption?: boolean;
  /** Outline what collides: each tile's body box */
  debug?: boolean;
  /**
   * For a variant that plays as one take (`Variant.take`): ignore the view,
   * and pull back from the opening view to everything on the take's own
   * clock, which runs while the montage isn't paused
   */
  take?: boolean;
};

const SUBSTEPS = 3;

export function VariantMontage({
  variant: id,
  view,
  pan,
  highlight = null,
  cameraMs = 2600,
  dimOpacity = 0.15,
  paused = false,
  width = STAGE_W,
  height = STAGE_H,
  caption = true,
  debug = false,
  take = false,
}: VariantMontageProps) {
  // each montage moves its own copy of the bodies
  const v = useMemo(() => makeVariant(id), [id]);
  // the clips nearest the opening view first
  const files = useMemo(() => {
    const s = v.views.start;
    const d = (b: Body) => Math.hypot(b.x - s.x - s.w / 2, b.y - s.y - s.h / 2);
    return [
      ...new Set(
        [...v.bodies].sort((a, b) => d(a) - d(b)).map((b) => b.clip.file),
      ),
    ];
  }, [v]);
  useClipsLoaded(files);
  const target = cameraFor(variantView(v, view), width, height);
  const panTo =
    pan && !v.panVelocity
      ? cameraFor(variantView(v, pan.to), width, height)
      : null;

  // Everything the frame loop reads, kept current without restarting it
  const live = useRef({
    paused,
    target,
    panTo,
    panMs: pan?.ms ?? 0,
    cameraMs,
    take,
  });
  live.current = {
    paused,
    target,
    panTo,
    panMs: pan?.ms ?? 0,
    cameraMs,
    take,
  };
  const targetKey = `${target.scale} ${target.cx} ${target.cy} ${panTo?.cx}`;

  // tiles by key (a body's video tile is `v<body>`, a mirror `m<copy>`),
  // videos by body, mirrors' canvases by copy
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const videos = useRef(new Map<number, HTMLVideoElement>());
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const debugRef = useRef<HTMLCanvasElement>(null);
  const empty: Mounted = { main: new Map(), mirrors: [] };
  const [mounted, setMounted] = useState<Mounted>(empty);
  const mountedRef = useRef<Mounted>(empty);

  // The camera's trip: set on a new view, played by the frame loop
  const cam = useRef<{
    now: Camera | null;
    legs: {
      from: Camera;
      to: Camera;
      ms: number;
      ease: (t: number) => number;
    }[];
    leg: number;
    legStart: number;
    /** Whether a take has started (from its opening view) */
    took?: boolean;
  }>({ now: null, legs: [], leg: 0, legStart: 0 });
  useLayoutEffect(() => {
    const c = cam.current;
    const { target, panTo, panMs, cameraMs } = live.current;
    const from = c.now;
    c.legs = [];
    c.leg = 0;
    c.legStart = performance.now();
    if (!from || cameraMs <= 0) c.now = target;
    else if (v.panVelocity) {
      // keep gliding from wherever the camera is; only the zoom changes
      c.legs.push({
        from,
        to: { ...target, cx: from.cx, cy: from.cy },
        ms: cameraMs,
        ease: easeInOutCubic,
      });
    } else {
      c.legs.push({ from, to: target, ms: cameraMs, ease: easeInOutCubic });
    }
    if (panTo)
      c.legs.push({ from: target, to: panTo, ms: panMs, ease: easeInOutSine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, width, height]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let t = 0; // the clips' clock, in seconds
    let frame = 0;
    const hooked = new WeakSet<HTMLVideoElement>();
    const fresh = new Set<HTMLVideoElement>();
    const painted = new WeakSet<HTMLCanvasElement>();
    const period = (k: Copy) => [
      k.i * (v.torus?.W ?? 0),
      k.j * (v.torus?.H ?? 0),
    ];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { paused } = live.current;
      if (!paused) {
        if (v.sim) {
          updateBoxes(v.bodies, t + dt, v.sim);
          const h = dt / SUBSTEPS;
          for (let k = 0; k < SUBSTEPS; k++)
            simStep(v.bodies, t + k * h, h, v.sim);
        }
        t += dt;
      }

      // the camera
      const c = cam.current;
      const take = v.take;
      if (live.current.take && take) {
        // one take: from the opening view, pulling back to all from the
        // first frame (evenly in log scale, a touch quicker at first,
        // settling at the end), gliding all the while (below)
        const from = cameraFor(v.views.start, width, height),
          to = cameraFor(v.views.all, width, height);
        const u = Math.min(1, (t * 1000) / take.zoomMs);
        const scale =
          from.scale * Math.pow(to.scale / from.scale, 1 - (1 - u) ** 1.3);
        c.now =
          c.now && c.took
            ? { ...c.now, scale }
            : { scale, cx: from.cx, cy: from.cy };
        c.took = true;
      } else {
        const l = c.legs[c.leg];
        if (l) {
          const u = Math.max(0, Math.min(1, (now - c.legStart) / l.ms));
          c.now = lerpCamera(l.from, l.to, l.ease(u));
          if (u >= 1 && c.leg < c.legs.length) {
            c.leg++;
            c.legStart = now;
          }
        }
      }
      let glide = v.panVelocity;
      if (take && c.now) {
        // the clips stream across the screen at the same speed however far
        // back the camera is, so it glides faster over the canvas as it
        // pulls back; and the canvas's own flow quickens a little, so it
        // still shows
        const s0 = cameraFor(v.views.start, width, height).scale,
          s1 = cameraFor(v.views.all, width, height).scale;
        const m = Math.sqrt(s0 / c.now.scale);
        if (v.sim) v.sim.flowScale = m;
        // and the stream eases to `slowTo` of its speed all the way back
        const slow = Math.pow(
          Math.min(1, c.now.scale / s0),
          Math.log(take.slowTo) / Math.log(s1 / s0),
        );
        glide = [
          take.flow[0] * m - (take.stream[0] * slow) / c.now.scale,
          take.flow[1] * m - (take.stream[1] * slow) / c.now.scale,
        ];
      }
      if (glide && c.now && !paused) {
        // glide on, whatever else the camera is doing (its legs glide too)
        const [gx, gy] = glide;
        const move = (k: Camera) => ({
          ...k,
          cx: k.cx + gx * dt,
          cy: k.cy + gy * dt,
        });
        c.now = move(c.now);
        for (const leg of c.legs) {
          leg.from = move(leg.from);
          leg.to = move(leg.to);
        }
      }
      const camera = c.now ?? live.current.target;
      const S = camera.scale;
      const vw = width / S,
        vh = height / S;
      const viewX0 = camera.cx - vw / 2,
        viewY0 = camera.cy - vh / 2;

      // which copies are in view: a body's video is mounted while it's
      // within `ready` of the view (so its first frame's there when it
      // comes on), and plays within `pad`; a mirror is mounted only while
      // on screen
      const pad = 0.04 * Math.max(vw, vh);
      const ready = 0.5 * Math.max(vw, vh);
      const was = mountedRef.current;
      const main = new Map<number, Copy>();
      const mirrors: Copy[] = [];
      const inView = new Set<number>();
      const [rangeI, rangeJ] = periodsAround(v.torus, camera);
      v.bodies.forEach((b, bi) => {
        const { w, h } = tileSize(b);
        const cs = Math.abs(Math.cos(b.a)),
          sn = Math.abs(Math.sin(b.a));
        const ex = (cs * w + sn * h) / 2,
          ey = (sn * w + cs * h) / 2;
        const near: Copy[] = [];
        const onScreen = new Set<Copy>();
        let nearest: Copy | null = null;
        const within = (x: number, y: number, p: number) =>
          x + ex > viewX0 - p &&
          x - ex < viewX0 + vw + p &&
          y + ey > viewY0 - p &&
          y - ey < viewY0 + vh + p;
        for (const i of rangeI) {
          for (const j of rangeJ) {
            const k = { key: `${bi}:${i}:${j}`, body: bi, i, j };
            const [px, py] = period(k);
            if (!within(b.x + px, b.y + py, ready)) continue;
            nearest ??= k;
            if (!within(b.x + px, b.y + py, pad)) continue;
            near.push(k);
            if (within(b.x + px, b.y + py, 0)) onScreen.add(k);
          }
        }
        // a body's video stays at its copy while that's in view, so it only
        // ever moves to another copy out of sight; else it goes to the copy
        // nearest the middle
        const prev = was.main.get(bi);
        if (!near.length) {
          if (nearest) main.set(bi, prev ?? nearest);
          return;
        }
        inView.add(bi);
        const dist = (k: Copy) => {
          const [px, py] = period(k);
          return Math.hypot(b.x + px - camera.cx, b.y + py - camera.cy);
        };
        const m =
          near.find((k) => k.key === prev?.key) ??
          near.reduce((a, k) => (dist(k) < dist(a) ? k : a));
        main.set(bi, m);
        for (const k of onScreen) if (k !== m) mirrors.push(k);
      });
      const sig = (m: Mounted) =>
        [...m.main.values()].map((k) => k.key).join() +
        "|" +
        m.mirrors.map((k) => k.key).join();
      if (sig({ main, mirrors }) !== sig(was)) {
        mountedRef.current = { main, mirrors };
        setMounted(mountedRef.current);
      }

      // place the tiles, and paint the mirrors from their bodies' videos
      const place = (el: HTMLDivElement | undefined, b: Body, k: Copy) => {
        if (!el) return;
        const { w, h } = tileSize(b);
        const [px, py] = period(k);
        const sx = width / 2 + (b.x + px - camera.cx) * S;
        const sy = height / 2 + (b.y + py - camera.cy) * S;
        el.style.transform = `translate(${sx}px, ${sy}px) rotate(${b.a}rad) scale(${S}) translate(${-w / 2}px, ${-h / 2}px)`;
      };
      for (const [bi, k] of mountedRef.current.main) {
        place(tiles.current.get(`v${bi}`), v.bodies[bi], k);
      }
      const dpr = window.devicePixelRatio || 1;
      for (const k of mountedRef.current.mirrors) {
        const b = v.bodies[k.body];
        place(tiles.current.get(`m${k.key}`), b, k);
        const canvas = canvases.current.get(k.key);
        const video = videos.current.get(k.body);
        if (!canvas || !video || video.readyState < 2) continue;
        if (!hooked.has(video)) {
          // note each frame the video shows, so mirrors repaint only then
          hooked.add(video);
          const onFrame = () => {
            fresh.add(video);
            video.requestVideoFrameCallback(onFrame);
          };
          video.requestVideoFrameCallback(onFrame);
        }
        const [ux0, uy0, ux1, uy1] = b.clip.union;
        // as many pixels as it covers on screen, in steps, so zooming
        // doesn't reallocate it every frame
        const want = (ux1 - ux0) * b.s * S * dpr;
        const cw = Math.max(
          16,
          Math.pow(1.25, Math.ceil(Math.log(want) / Math.log(1.25))),
        );
        let stale = fresh.has(video) || !painted.has(canvas);
        if (Math.abs(canvas.width - cw) > 1) {
          canvas.width = Math.round(cw);
          canvas.height = Math.round((cw * (uy1 - uy0)) / (ux1 - ux0));
          stale = true;
        }
        if (!stale) continue;
        painted.add(canvas);
        canvas
          .getContext("2d")!
          .drawImage(
            video,
            ux0,
            uy0,
            ux1 - ux0,
            uy1 - uy0,
            0,
            0,
            canvas.width,
            canvas.height,
          );
      }
      fresh.clear();

      // each video plays from its start, uninterrupted (seeking dozens of
      // clips at once starves the decoder), and its body follows it: where
      // the body is in its clip is where the video is
      if (frame++ % 3 === 0) {
        for (const [bi, video] of videos.current) {
          if (paused || !inView.has(bi)) {
            if (!video.paused) video.pause();
            continue;
          }
          if (video.paused) video.play()?.catch(() => {});
          if (video.readyState < 2) continue;
          const b = v.bodies[bi];
          const d = b.clip.duration;
          b.phase = (((video.currentTime - t) % d) + d) % d;
        }
      }

      if (debugRef.current)
        drawDebug(debugRef.current, v, camera, width, height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, width, height]);

  const tileProps = (bi: number) => ({
    body: v.bodies[bi],
    multiply: v.blend[bi],
    z: v.z[bi],
    lit: highlight === null || v.bodies[bi].clip.groups.includes(highlight),
    dimOpacity,
    tiles: tiles.current,
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "hidden",
        background: v.background,
      }}
    >
      {[...mounted.main.keys()].map((bi) => {
        const b = v.bodies[bi];
        return (
          <TileView
            key={`v${bi}`}
            id={`v${bi}`}
            {...tileProps(bi)}
            video={{
              url: clipUrl(b.clip.file),
              body: bi,
              videos: videos.current,
            }}
          />
        );
      })}
      {mounted.mirrors.map((k) => (
        <TileView
          key={`m${k.key}`}
          id={`m${k.key}`}
          {...tileProps(k.body)}
          canvas={{ key: k.key, canvases: canvases.current }}
        />
      ))}
      {debug && (
        <canvas
          ref={debugRef}
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
      )}
      {caption && <GroupCaption highlight={highlight} height={height} />}
    </div>
  );
}

/**
 * One tile: its clip's union box, filled by the clip (the video placed under
 * it so that box fills it) or by a canvas painted from the clip. Tiles nest,
 * one's drawing in another's empty corner, so where their boxes overlap
 * they're multiplied onto the canvas, and white hides nothing.
 */
const TileView = memo(function TileView({
  id,
  body,
  multiply,
  z,
  lit,
  dimOpacity,
  tiles,
  video,
  canvas,
}: {
  id: string;
  body: Body;
  /** Multiply onto the canvas, for tiles that overlap */
  multiply: boolean;
  /** Its place in the stack */
  z: number;
  lit: boolean;
  dimOpacity: number;
  tiles: Map<string, HTMLDivElement>;
  /** Play the clip here (once it's loaded) */
  video?: {
    url: string | undefined;
    body: number;
    videos: Map<number, HTMLVideoElement>;
  };
  /** Or show a canvas, for the frame loop to paint */
  canvas?: { key: string; canvases: Map<string, HTMLCanvasElement> };
}) {
  const { clip, s } = body;
  const [ux0, uy0, ux1, uy1] = clip.union;
  const w = (ux1 - ux0) * s,
    h = (uy1 - uy0) * s;
  const box = {
    position: "absolute",
    left: 0,
    top: 0,
    width: w,
    height: h,
  } as const;
  return (
    <div
      ref={(el) => {
        if (el) tiles.set(id, el);
        else tiles.delete(id);
      }}
      style={{
        ...box,
        transformOrigin: "0 0",
        overflow: "hidden",
        mixBlendMode: multiply ? "multiply" : undefined,
        zIndex: z,
        opacity: lit ? 1 : dimOpacity,
        transition: "opacity 600ms ease",
        willChange: "transform",
      }}
    >
      {video?.url && (
        <video
          ref={(el) => {
            if (el) video.videos.set(video.body, el);
            else video.videos.delete(video.body);
          }}
          src={video.url}
          muted
          loop
          playsInline
          preload="auto"
          style={{
            position: "absolute",
            left: -ux0 * s,
            top: -uy0 * s,
            width: clip.w * s,
            height: clip.h * s,
            maxWidth: "none",
          }}
        />
      )}
      {canvas && (
        <canvas
          ref={(el) => {
            if (el) canvas.canvases.set(canvas.key, el);
            else canvas.canvases.delete(canvas.key);
          }}
          style={{ ...box, width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
});

function drawDebug(
  canvas: HTMLCanvasElement,
  v: ReturnType<typeof makeVariant>,
  camera: Camera,
  width: number,
  height: number,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  const S = camera.scale;
  const [rangeI, rangeJ] = periodsAround(v.torus, camera);
  ctx.lineWidth = 1.5;
  for (const b of v.bodies) {
    const [ux0, uy0, ux1, uy1] = b.clip.union;
    const [x0, y0, x1, y1] = b.box;
    for (const i of rangeI) {
      for (const j of rangeJ) {
        ctx.save();
        ctx.translate(
          width / 2 + (b.x + i * (v.torus?.W ?? 0) - camera.cx) * S,
          height / 2 + (b.y + j * (v.torus?.H ?? 0) - camera.cy) * S,
        );
        ctx.rotate(b.a);
        ctx.scale(S * b.s, S * b.s);
        const cx = (ux0 + ux1) / 2,
          cy = (uy0 + uy1) / 2;
        ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
        ctx.strokeRect(ux0 - cx, uy0 - cy, ux1 - ux0, uy1 - uy0);
        // its shape now: its parts, cut to its box
        ctx.strokeStyle = "rgba(220, 38, 38, 0.8)";
        for (const [px0, py0, px1, py1] of b.clip.parts) {
          const a = Math.max(px0, x0),
            c = Math.max(py0, y0);
          const w = Math.min(px1, x1) - a,
            h = Math.min(py1, y1) - c;
          if (w > 0 && h > 0) ctx.strokeRect(a - cx, c - cy, w, h);
        }
        ctx.restore();
      }
    }
  }
  if (v.torus) {
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.setLineDash([8, 8]);
    for (const i of [0, 1]) {
      for (const j of [0, 1]) {
        const x = width / 2 + (i * v.torus.W - camera.cx) * S;
        const y = height / 2 + (j * v.torus.H - camera.cy) * S;
        ctx.strokeRect(x, y, v.torus.W * S, v.torus.H * S);
      }
    }
    ctx.setLineDash([]);
  }
}

/**
 * The slide's plan, as the variants follow it: the grid montage's, with
 * or without the groups lighting up in turn on its second step
 */
export function variantPlan(groups: boolean): MontageStep[] {
  return groups
    ? MONTAGE_PLAN_TIMED
    : MONTAGE_PLAN_TIMED.map((s) => ({ ...s, cycle: undefined }));
}

/** A variant at a step of a plan (the grid montage's, by default) */
export function VariantMontagePlayer({
  plan = MONTAGE_PLAN_TIMED,
  step,
  ...rest
}: { plan?: MontageStep[]; step: number } & Omit<
  VariantMontageProps,
  "view" | "highlight" | "pan"
>) {
  const s = plan[Math.max(0, Math.min(step, plan.length - 1))];
  const highlight = useCycle(s, step);
  return (
    <VariantMontage view={s.view} pan={s.pan} highlight={highlight} {...rest} />
  );
}

/**
 * A variant as the closing slide's content, following the slide's step;
 * one that plays as a take does so (`take`), the steps only lighting up
 * the groups, if `groups`. Each time we leave the slide it starts afresh,
 * out of sight, so coming back plays the take from the start, its clips
 * already loaded.
 */
export function ClosingVariantSlide({
  variant,
  groups,
}: {
  variant: VariantId;
  groups: boolean;
}) {
  const step = useSlideStep();
  const shown = useSlideShown();
  const [run, setRun] = useState(0);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (wasShown.current && !shown) setRun((r) => r + 1);
    wasShown.current = shown;
  }, [shown]);
  return (
    <VariantMontagePlayer
      key={run}
      variant={variant}
      plan={variantPlan(groups)}
      step={step}
      paused={!shown}
      take
    />
  );
}
