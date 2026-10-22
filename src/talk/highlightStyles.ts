/**
 * The highlight color is a CSS variable (set on the page root) so it can
 * be switched live; see `highlightColors`.
 */
export const HIGHLIGHT_COLOR = "var(--talk-hl)";

export const highlightColors: { name: string; color: string }[] = [
  { name: "magenta", color: "#d946ef" },
  { name: "ink", color: "#27272a" },
];

export type CodeHighlightStyle = "bar" | "tint" | "dim";
export type DiagramHighlightStyle =
  | "halo"
  | "halo-fade"
  | "lift"
  | "glow"
  | "outline"
  | "dim"
  | "dim-glow";

/** Paired code + diagram styles, cycled through with a shortcut. */
export const highlightStyles: {
  name: string;
  code: CodeHighlightStyle;
  diagram: DiagramHighlightStyle;
}[] = [
  { name: "glow", code: "bar", diagram: "glow" },
  { name: "halo", code: "bar", diagram: "halo" },
  { name: "halo + fade", code: "dim", diagram: "halo-fade" },
  { name: "lift", code: "bar", diagram: "lift" },
  { name: "tint + outline", code: "tint", diagram: "outline" },
  { name: "spotlight", code: "dim", diagram: "dim" },
  { name: "spotlight + glow", code: "dim", diagram: "dim-glow" },
];

/** The SVG filter the halo styles reference; see `HaloFilter`. */
export const HALO_FILTER_ID = "talk-halo";

const SHAPES = "circle,ellipse,rect,path,line,polyline,polygon,text";

/**
 * CSS that highlights the elements tagged with any of `locs` inside
 * `scope`. Per-shape effects (glow, outline, dimming) style only leaf
 * shapes, so nested groups don't compound. Whole-element effects (halo,
 * lift) style only the outermost highlighted elements, so a group gets
 * one halo around its silhouette rather than one per shape inside it.
 */
export function diagramHighlightCss(
  scope: string,
  locs: number[],
  style: DiagramHighlightStyle,
): string {
  if (locs.length === 0) return "";
  const matched = locs.map((i) => `[data-loc="${i}"]`).join(",");
  const hit = `${scope} :is(${matched}):is(${SHAPES})`;
  const outermost = `${scope} :is(${matched}):not(:is(${matched}) *)`;
  // Only the code's own shapes (which all carry data-loc) are dimmed,
  // not Dragology's debug overlay.
  const miss = `${scope} [data-loc]:is(${SHAPES}):not(${matched})`;

  const glow = `${hit} { filter: drop-shadow(0 0 2px ${HIGHLIGHT_COLOR}) drop-shadow(0 0 6px ${HIGHLIGHT_COLOR}) !important; }`;
  const dim = `${miss} { filter: opacity(0.15) !important; }`;
  const fade = `${miss} { filter: grayscale(1) opacity(0.35) !important; }`;
  const halo = `${outermost} { filter: url(#${HALO_FILTER_ID}) !important; }`;
  switch (style) {
    case "halo":
      return halo;
    case "halo-fade":
      return `${fade}\n${halo}`;
    case "lift":
      return `${outermost} { filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.35)) !important; }`;
    case "glow":
      return glow;
    case "outline":
      // Recolor strokes but keep their widths: changing a width moves
      // the shape's edge, which jumps visually and, on hover, can move
      // the shape out from under the pointer (flickering on and off).
      return [
        `${hit}:not(text) { stroke: ${HIGHLIGHT_COLOR} !important; }`,
        `${hit}:is(text) { fill: ${HIGHLIGHT_COLOR} !important; }`,
      ].join("\n");
    case "dim":
      return dim;
    case "dim-glow":
      return `${dim}\n${glow}`;
  }
}
