// Pieces of the back half of the talk (Andrew's part: the demos, Hazel, where
// the ideas came from, and the close). The slides themselves are in the
// outline in slides.tsx, where their notes can be edited in place.

import _ from "lodash";
import { type ReactNode, useContext, useEffect, useRef } from "react";
import { DemoContext, type DemoToggleSettings } from "../demo/ui";
import "../studio/shantell-sans";
import { EmbedSlide } from "./EmbedSlide";
import hazelProgram from "./hazel-demo-program.txt?raw";
import { slideFileUrl, useSlideActive, useSlideStep } from "./slide";

const HIGHLIGHT = "#d5e5a3";
const EASE = "cubic-bezier(0.45, 0, 0.25, 1)";

/** A file in public/slides/back-half */
function file(name: string) {
  return slideFileUrl(`back-half/${name}`);
}

// ── Code callouts ──

/** Code highlighted at the given steps of the slide. */
export function Hl({ at, children }: { at: number[]; children: ReactNode }) {
  const on = at.includes(useSlideStep());
  return (
    <span
      style={{
        backgroundColor: on ? HIGHLIGHT : "transparent",
        padding: "0 6px",
        borderRadius: 4,
        transition: "background-color 300ms ease",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Code in a corner of the stage, shown from step `from`. Put it beside a
 * DemoSlide, not in it, so that it's drawn at stage scale.
 */
export function CodeCallout({
  children,
  from = 0,
  corner = "bottom-right",
}: {
  children: ReactNode;
  from?: number;
  corner?: "bottom-right" | "bottom-left" | "top-right";
}) {
  const shown = useSlideStep() >= from;
  const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  return (
    <pre
      style={{
        position: "absolute",
        [v]: 72,
        [h]: 64,
        zIndex: 10,
        margin: 0,
        padding: "20px 28px",
        fontFamily: "monospace",
        fontSize: 32,
        fontWeight: "bold",
        lineHeight: 1.45,
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(12px)",
        transition: "opacity 400ms ease, transform 400ms ease",
        pointerEvents: "none",
      }}
    >
      {children}
    </pre>
  );
}

/**
 * Turns demo settings (overlays and such) on or off at each step. Goes inside
 * a DemoSlide, whose settings it changes; `byStep[i]` applies from step i
 * until a later entry says otherwise.
 */
export function StepToggles({
  byStep,
}: {
  byStep: Partial<DemoToggleSettings>[];
}) {
  const step = useSlideStep();
  const { setToggles } = useContext(DemoContext);
  useEffect(() => {
    const merged = Object.assign({}, ...byStep.slice(0, step + 1));
    setToggles((t) => ({ ...t, ...merged }));
  }, [step, byStep, setToggles]);
  return null;
}

// ── Pictures ──

/**
 * Layers that fade between each other as the steps go: layer i is shown from
 * step `at[i]`, until the next layer.
 */
function StepLayers({
  layers,
}: {
  layers: { at: number; content: ReactNode }[];
}) {
  const step = useSlideStep();
  const current = _.findLastIndex(layers, (l) => l.at <= step);
  return (
    <div
      className="absolute inset-0"
      style={{ background: "white", overflow: "hidden" }}
    >
      {layers.map((l, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            opacity: i === current ? 1 : 0,
            transition: "opacity 700ms ease",
          }}
        >
          {l.content}
        </div>
      ))}
    </div>
  );
}

/** A picture filling the stage, cropped to fill it or fit inside it. */
function Picture({
  name,
  fit = "contain",
  style,
}: {
  name: string;
  fit?: "contain" | "cover";
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={file(name)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: fit,
        ...style,
      }}
    />
  );
}

/** A caption in a corner, like a photo's date. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 40,
        padding: "8px 18px",
        fontSize: 36,
        color: "white",
        background: "rgba(0,0,0,0.45)",
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A muted video from public/slides/back-half that plays (looping) while its
 * slide is shown and waits at its start otherwise. Before the clip exists,
 * shows `poster`.
 */
export function ClipVideo({
  name,
  poster,
  loop = true,
}: {
  name: string;
  poster?: string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const active = useSlideActive();
  useEffect(() => {
    const video = ref.current!;
    if (active) {
      video.play()?.catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);
  return (
    <video
      ref={ref}
      src={file(name)}
      poster={poster && file(poster)}
      muted
      playsInline
      loop={loop}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "white",
      }}
    />
  );
}

// ── Slides ──

/** Hazel, its chrome hidden but for the nut menu and the start of the top bar. */
export function HazelSlide() {
  return (
    <EmbedSlide
      // A static build of Hazel's refactorings branch, with the drag
      // refactorings turned on (in the nut menu; saved per origin). Hazel
      // opens a share link as a new scratch slide, its program URI-encoded
      // (by Hazel) and then encoded again as a URL parameter.
      src={`hazel/index.html?name=${encodeURIComponent(
        "declarative dragging",
      )}&share=${encodeURIComponent(encodeURIComponent(hazelProgram))}`}
      zoom={1.4}
      css={HAZEL_CSS}
    />
  );
}

// Hazel's page is a grid: the top bar, the editor (#main), the sidebars, and
// the bottom bar. We keep the top bar's left end (the nut menu, the mode, and
// the scratch slide's name) and the editor, which takes the sidebars' room.
const HAZEL_CSS = `
  #sidebars, #bottom-bar, #edit-buttons, #sample-focus-bar { display: none !important; }
  #main { grid-column: 1 / -1 !important; }
`;

/** Nool before dragging: select a subterm, pick a rewrite, see it happen. */
export function NoolClassicSlide() {
  return (
    <div className="absolute inset-0">
      <ClipVideo name="nool-classic.mp4" poster="nool-classic.jpg" />
    </div>
  );
}

/** The whiteboard: the whole thing, then closer in on three of its sketches. */
export function WhiteboardSlide() {
  const step = useSlideStep();
  // Each detail eases in a little while it's shown
  const drift = (at: number) => ({
    transform: step >= at ? "scale(1.04)" : "scale(1)",
    transition: `transform 6s ${EASE}`,
  });
  return (
    <StepLayers
      layers={[
        { at: 0, content: <Picture name="wb-room.jpg" fit="cover" /> },
        {
          at: 1,
          content: (
            <Picture name="wb-radial.jpg" fit="cover" style={drift(1)} />
          ),
        },
        {
          at: 2,
          content: (
            <div className="absolute inset-0 flex" style={{ gap: 0 }}>
              <div className="relative flex-1">
                <Picture name="wb-arrows.jpg" fit="cover" style={drift(2)} />
              </div>
              <div className="relative flex-1">
                <Picture name="wb-nested.jpg" fit="cover" style={drift(2)} />
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * The walk: the trail, then the route we walked drawn over it, then the map
 * the route came from.
 */
export function WalkSlide() {
  const step = useSlideStep();
  const routeShown = step >= 1;
  return (
    <StepLayers
      layers={[
        {
          at: 0,
          content: (
            <div className="absolute inset-0">
              <Picture name="walk-trail.jpg" fit="cover" />
              <img
                src={file("walk-route.png")}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  height: 860,
                  transform: "translate(-50%, -50%)",
                  // Wipes on from the start of the route, at the bottom left
                  clipPath: routeShown
                    ? "circle(150% at 8% 92%)"
                    : "circle(0% at 8% 92%)",
                  transition: `clip-path 2.4s ${EASE}`,
                  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.35))",
                }}
              />
              <Caption>Seattle, 2022</Caption>
            </div>
          ),
        },
        {
          at: 2,
          content: (
            <div className="absolute inset-0" style={{ background: "#eef0ea" }}>
              <Picture name="walk-map.jpg" />
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * Elliot's order-preserving maps, Josh's drawings of them, and then the live
 * demo they became (passed in as `live`).
 */
export function ElliotSlide({ live }: { live: ReactNode }) {
  return (
    <StepLayers
      layers={[
        { at: 0, content: <Picture name="elliot-1.jpg" /> },
        { at: 1, content: <Picture name="elliot-2.jpg" /> },
        { at: 2, content: <Picture name="elliot-3.jpg" /> },
        {
          at: 3,
          content: (
            <div className="absolute inset-0 flex items-center justify-center">
              {live}
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * Supernool's talk build. It runs its own beats on Space, and moves the
 * avatar with the arrow keys, so it gets those; the clicker's keys (or
 * Escape, then →) move on.
 */
export function SupernoolSlide() {
  return (
    <EmbedSlide
      // What supernool/wist/ redirects to (a directory URL, which the dev
      // server would answer with our own page)
      src="supernool/explorations/018-painted-ground/index.html?demo=wist&inhabited=1"
      arrows="app"
      focusOnShow
    />
  );
}

/**
 * The close: where to find Dragology, written on the whiteboard the drag
 * ideas haunted, now wiped clean.
 */
export function CallToActionSlide() {
  return (
    <div className="absolute inset-0" style={{ overflow: "hidden" }}>
      <Picture name="empty-wb.jpg" fit="cover" />
      {/* The board's face: 440–1450 × 280–1080 in the 1920×1440 photo,
          whose top 180px the stage crops off */}
      <div
        style={{
          position: "absolute",
          left: 440,
          top: 100,
          width: 1010,
          height: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          fontFamily: "'Shantell Sans', cursive",
          color: "#1f3a8a",
          transform: "rotate(-0.6deg)",
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            border: "6px dashed #1f3a8a",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            opacity: 0.7,
          }}
        >
          QR
        </div>
        <div
          style={{
            fontSize: 54,
            fontWeight: 500,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 88, fontWeight: 700 }}>Dragology</div>
          <div>declarative-dragging.github.io</div>
        </div>
      </div>
    </div>
  );
}

export function ThanksSlide() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: "white", gap: 24 }}
    >
      <div style={{ fontSize: 140, fontStyle: "italic" }}>Thanks!</div>
      <div style={{ fontSize: 44, color: "#6b7280" }}>
        Joshua Horowitz · Andrew Blinn
      </div>
    </div>
  );
}
