import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Syntax color schemes, cycled through with a shortcut. Magenta is
 * avoided since it's the highlight color.
 */
export const syntaxThemes: { name: string; style: HighlightStyle }[] = [
  {
    // Structure forward: tags and names stand out; keywords and
    // punctuation recede.
    name: "quiet",
    style: HighlightStyle.define([
      { tag: t.keyword, color: "#a1a1aa" },
      { tag: [t.punctuation, t.bracket, t.angleBracket], color: "#a1a1aa" },
      { tag: t.tagName, color: "#1d4ed8", fontWeight: "600" },
      { tag: t.attributeName, color: "#71717a" },
      { tag: [t.string, t.special(t.string)], color: "#0f766e" },
      { tag: [t.number, t.bool], color: "#c2410c" },
      {
        tag: t.definition(t.variableName),
        color: "#18181b",
        fontWeight: "600",
      },
      { tag: t.function(t.variableName), color: "#18181b" },
      { tag: t.comment, color: "#a1a1aa", fontStyle: "italic" },
    ]),
  },
  {
    // Warm and saturated, closer to the bright beads.
    name: "candy",
    style: HighlightStyle.define([
      { tag: t.keyword, color: "#7c3aed", fontWeight: "600" },
      { tag: [t.punctuation, t.bracket, t.angleBracket], color: "#94a3b8" },
      { tag: t.tagName, color: "#2563eb", fontWeight: "600" },
      { tag: t.attributeName, color: "#0891b2" },
      { tag: [t.string, t.special(t.string)], color: "#16a34a" },
      { tag: [t.number, t.bool], color: "#ea580c" },
      { tag: t.definition(t.variableName), color: "#b45309" },
      { tag: t.propertyName, color: "#0f172a" },
      { tag: t.comment, color: "#94a3b8", fontStyle: "italic" },
    ]),
  },
  {
    // Near-monochrome; only literals get color.
    name: "ink",
    style: HighlightStyle.define([
      { tag: t.keyword, color: "#111", fontWeight: "700" },
      { tag: [t.punctuation, t.bracket, t.angleBracket], color: "#9ca3af" },
      { tag: t.tagName, color: "#111", fontWeight: "700" },
      { tag: t.attributeName, color: "#6b7280" },
      {
        tag: [t.string, t.special(t.string), t.number, t.bool],
        color: "#2563eb",
      },
      { tag: t.comment, color: "#9ca3af", fontStyle: "italic" },
    ]),
  },
  {
    // The first scheme, GitHub-ish.
    name: "classic",
    style: HighlightStyle.define([
      { tag: t.keyword, color: "#8a3ffc" },
      { tag: [t.string, t.special(t.string)], color: "#1a7f37" },
      { tag: t.number, color: "#0550ae" },
      { tag: t.comment, color: "#999", fontStyle: "italic" },
      { tag: [t.typeName, t.tagName], color: "#0550ae" },
      { tag: t.attributeName, color: "#6e7781" },
      { tag: t.propertyName, color: "#24292f" },
      { tag: [t.definition(t.variableName)], color: "#953800" },
    ]),
  },
];
