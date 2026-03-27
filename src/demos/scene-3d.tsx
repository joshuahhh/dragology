import { useMemo, useState } from "react";
import { demo } from "../demo";
import {
  ConfigPanel,
  ConfigSlider,
  DemoDraggable,
  DemoWithConfig,
} from "../demo/ui";
import { Draggable } from "../draggable";
import { inOrder, param } from "../DragSpec";
import { translate } from "../svgx/helpers";

// A simple 3D scene: draggable colored boxes on a ground grid.
// Use the sliders to orbit the camera; drag boxes to move them on the ground.

const W = 500;
const H = 450;
const CX = W / 2;
const CY = H * 0.56;
const G = 4; // grid half-size in world units

type Box = { x: number; z: number; color: string; size: number };
type State = { boxes: Record<string, Box> };

const initialState: State = {
  boxes: {
    a: { x: -2.0, z: -1.5, color: "#e05060", size: 0.65 },
    b: { x: 1.5, z: -2.0, color: "#5090e0", size: 0.45 },
    c: { x: -1.0, z: 2.0, color: "#50d080", size: 0.75 },
    d: { x: 2.5, z: 0.5, color: "#e0c040", size: 0.55 },
    e: { x: 0.2, z: 0.5, color: "#c050e0", size: 0.85 },
  },
};

type Pt = { x: number; y: number; depth: number };

function makeProjection(az: number, el: number, fov: number, camDist: number) {
  const azR = (az * Math.PI) / 180;
  const elR = (el * Math.PI) / 180;
  const cosAz = Math.cos(azR);
  const sinAz = Math.sin(azR);
  const cosEl = Math.cos(elR);
  const sinEl = Math.sin(elR);

  // FOCAL (pixels) is set by FOV alone: how wide the lens aperture is.
  // camDist is independent: how far the camera sits from the scene.
  // Together they control both zoom (FOCAL/camDist) and perspective distortion.
  const FOCAL = CX / Math.tan((fov * Math.PI) / 180 / 2);

  return (wx: number, wy: number, wz: number): Pt => {
    const rx = wx * cosAz - wz * sinAz;
    const ry = wy;
    const rz = wx * sinAz + wz * cosAz;
    const sx = rx;
    const sy = -ry * cosEl + rz * sinEl;
    // Higher depth = closer to camera; camera itself is at depth=camDist
    const depth = ry * sinEl + rz * cosEl;
    const f = FOCAL / (camDist - depth);
    return { x: sx * f + CX, y: sy * f + CY, depth };
  };
}

function pStr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function pRel(pts: Pt[], ox: number, oy: number): string {
  return pts
    .map((p) => `${(p.x - ox).toFixed(2)},${(p.y - oy).toFixed(2)}`)
    .join(" ");
}

function avgDepth(pts: Pt[]): number {
  return pts.reduce((s, p) => s + p.depth, 0) / pts.length;
}

function tint(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function makeDraggable(
  az: number,
  el: number,
  fov: number,
  camDist: number,
): Draggable<State> {
  return ({ state, d }) => {
    const proj = makeProjection(az, el, fov, camDist);

    const azR = (az * Math.PI) / 180;
    const elR = (el * Math.PI) / 180;
    const camWX = camDist * Math.cos(elR) * Math.sin(azR);
    const camWZ = camDist * Math.cos(elR) * Math.cos(azR);

    const gridRange = Array.from({ length: 2 * G + 1 }, (_, i) => i - G);
    const groundCorners = [
      proj(-G, 0, -G),
      proj(G, 0, -G),
      proj(G, 0, G),
      proj(-G, 0, G),
    ];

    // Back-to-front: ascending depth (lower = further from camera)
    const sortedBoxes = Object.entries(state.boxes).sort(
      ([, a], [, b]) => proj(a.x, 0, a.z).depth - proj(b.x, 0, b.z).depth,
    );

    return (
      <g>
        <rect width={W} height={H} fill="#1a1a2e" />

        <polygon points={pStr(groundCorners)} fill="rgba(255,255,255,0.03)" />

        {gridRange.map((i) => (
          <g>
            <line
              x1={proj(i, 0, -G).x}
              y1={proj(i, 0, -G).y}
              x2={proj(i, 0, G).x}
              y2={proj(i, 0, G).y}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={0.5}
            />
            <line
              x1={proj(-G, 0, i).x}
              y1={proj(-G, 0, i).y}
              x2={proj(G, 0, i).x}
              y2={proj(G, 0, i).y}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={0.5}
            />
          </g>
        ))}

        <polygon
          points={pStr(groundCorners)}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.2}
        />

        {sortedBoxes.map(([key, box]) => {
          const { x, z, color, size: s } = box;
          const h = s * 2;
          const P = (dx: number, dy: number, dz: number): Pt =>
            proj(x + dx, dy, z + dz);

          // Per-box direction from box to camera
          const dx = camWX - x;
          const dz = camWZ - z;

          type Face = { pts: Pt[]; fill: string };

          const faces: Face[] = [
            {
              pts: [P(-s, h, -s), P(s, h, -s), P(s, h, s), P(-s, h, s)],
              fill: tint(color, 1.3),
            },
            dx > 0
              ? {
                  pts: [P(s, 0, -s), P(s, 0, s), P(s, h, s), P(s, h, -s)],
                  fill: tint(color, 0.65),
                }
              : {
                  pts: [P(-s, 0, -s), P(-s, 0, s), P(-s, h, s), P(-s, h, -s)],
                  fill: tint(color, 0.65),
                },
            dz > 0
              ? {
                  pts: [P(-s, 0, s), P(s, 0, s), P(s, h, s), P(-s, h, s)],
                  fill: tint(color, 0.85),
                }
              : {
                  pts: [P(-s, 0, -s), P(s, 0, -s), P(s, h, -s), P(-s, h, -s)],
                  fill: tint(color, 0.85),
                },
          ].sort((a, b) => avgDepth(a.pts) - avgDepth(b.pts));

          const shadow = [P(-s, 0, -s), P(s, 0, -s), P(s, 0, s), P(-s, 0, s)];
          const center = proj(x, h / 2, z);

          return (
            <g
              id={`box-${key}`}
              transform={translate(center.x, center.y)}
              dragologyZIndex={1}
              dragologyOnDrag={() =>
                d.vary(
                  state,
                  [param("boxes", key, "x"), param("boxes", key, "z")],
                  {
                    constraint: (s) => {
                      const box = s.boxes[key];
                      return [
                        inOrder(-G + box.size, box.x, G - box.size),
                        inOrder(-G + box.size, box.z, G - box.size),
                      ];
                    },
                  },
                )
              }
            >
              {/* No ids on internal polygons — ids cause extraction from this <g>,
                  breaking event bubbling and making clicks miss the dragology target */}
              <polygon
                points={pRel(shadow, center.x, center.y)}
                fill="rgba(0,0,0,0.4)"
              />
              {faces.map((face) => (
                <polygon
                  points={pRel(face.pts, center.x, center.y)}
                  fill={face.fill}
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth={0.8}
                />
              ))}
            </g>
          );
        })}
      </g>
    );
  };
}

const degrees = (v: number) => `${v}°`;

export default demo(
  () => {
    const [az, setAz] = useState(35);
    const [el, setEl] = useState(28);
    const [fov, setFov] = useState(60);
    const [camDist, setCamDist] = useState(10);
    const draggable = useMemo(
      () => makeDraggable(az, el, fov, camDist),
      [az, el, fov, camDist],
    );

    return (
      <DemoWithConfig>
        <DemoDraggable
          draggable={draggable}
          initialState={initialState}
          width={W}
          height={H}
        />
        <ConfigPanel>
          <ConfigSlider
            label="Azimuth"
            value={az}
            onChange={setAz}
            min={-180}
            max={180}
            formatValue={degrees}
          />
          <ConfigSlider
            label="Elevation"
            value={el}
            onChange={setEl}
            min={0}
            max={90}
            formatValue={degrees}
          />
          <ConfigSlider
            label="FOV"
            value={fov}
            onChange={setFov}
            min={0}
            max={180}
            formatValue={degrees}
          />
          <ConfigSlider
            label="Distance"
            value={camDist}
            onChange={setCamDist}
            min={0}
            max={30}
          />
        </ConfigPanel>
      </DemoWithConfig>
    );
  },
  { tags: ["d.vary", "3d", "camera"] },
);
