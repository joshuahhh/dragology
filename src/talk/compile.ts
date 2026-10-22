import { tsxLanguage } from "@codemirror/lang-javascript";
import type { SyntaxNode } from "@lezer/common";
import { produce } from "immer";
import _ from "lodash";
import React from "react";
import { transform } from "sucrase";
import { amb, produceAmb, require } from "../amb";
import { Draggable } from "../draggable";
import { and, lessThan, moreThan, param } from "../DragSpec";
import { Vec2 } from "../math/vec2";
import { path, rotateDeg, rotateRad, scale, translate } from "../svgx/helpers";

/**
 * Where a lowercase (SVG) JSX element lives in the source. `from`/`to`
 * span the whole element; `tags` are the open tag and (if present) the
 * close tag.
 */
export type SourceLoc = {
  from: number;
  to: number;
  tags: { from: number; to: number }[];
};

export const LOC_ATTR = "data-loc";

/**
 * Inserts `data-loc="i"` into every lowercase JSX element, where `i`
 * indexes into the returned `locs`. The attribute survives rendering,
 * so a DOM element can be traced back to the code that made it.
 */
export function instrumentJsx(code: string): {
  code: string;
  locs: SourceLoc[];
} {
  const tree = tsxLanguage.parser.parse(code);
  const locs: SourceLoc[] = [];
  const inserts: { at: number; text: string }[] = [];

  tree.iterate({
    enter(node) {
      if (node.name !== "JSXElement") return;
      const openTag =
        node.node.getChild("JSXOpenTag") ??
        node.node.getChild("JSXSelfClosingTag");
      if (!openTag) return;
      const name = tagName(openTag);
      if (!name || name.name !== "JSXBuiltin") return;
      const closeTag = node.node.getChild("JSXCloseTag");
      const idx = locs.length;
      locs.push({
        from: node.from,
        to: node.to,
        tags: [openTag, ...(closeTag ? [closeTag] : [])].map((t) => ({
          from: t.from,
          to: t.to,
        })),
      });
      inserts.push({ at: name.to, text: ` ${LOC_ATTR}="${idx}"` });
    },
  });

  let out = code;
  for (const { at, text } of _.sortBy(inserts, (i) => -i.at)) {
    out = out.slice(0, at) + text + out.slice(at);
  }
  return { code: out, locs };
}

function tagName(tag: SyntaxNode): SyntaxNode | null {
  for (let child = tag.firstChild; child; child = child.nextSibling) {
    if (
      child.name === "JSXBuiltin" ||
      child.name === "JSXIdentifier" ||
      child.name === "JSXMemberExpression" ||
      child.name === "JSXNamespacedName"
    ) {
      return child;
    }
  }
  return null;
}

/** Names available to live code without importing. */
const SCOPE: Record<string, unknown> = {
  React,
  _,
  Vec2,
  translate,
  rotateDeg,
  rotateRad,
  scale,
  path,
  produce,
  amb,
  produceAmb,
  require,
  param,
  and,
  lessThan,
  moreThan,
};

export type Compiled = {
  draggable: Draggable<object>;
  initialState: object;
  locs: SourceLoc[];
};

/**
 * Compiles live TSX. The code must define `initialState` and
 * `draggable`. `prelude` is hidden helper code that runs first (it is
 * not instrumented).
 */
export function compileLiveCode(code: string, prelude = ""): Compiled {
  const instrumented = instrumentJsx(code);
  const preludeLines = prelude.split("\n").length;
  let js: string;
  try {
    js = transform(`${prelude}\n${instrumented.code}`, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "classic",
      production: true,
    }).code;
  } catch (e) {
    // Report syntax errors by line in `code`. (Columns are skewed by
    // instrumentation, so they're dropped.)
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      message.replace(
        /\((\d+):\d+\)$/,
        (_, line) => `(line ${Number(line) - preludeLines})`,
      ),
    );
  }
  const names = Object.keys(SCOPE);
  const fn = new Function(
    ...names,
    `"use strict";\n${js}\nreturn { initialState, draggable };`,
  );
  const result = fn(...names.map((n) => SCOPE[n]));
  if (typeof result.draggable !== "function") {
    throw new Error("`draggable` should be a function");
  }
  if (typeof result.initialState !== "object" || !result.initialState) {
    throw new Error("`initialState` should be an object");
  }
  return { ...result, locs: instrumented.locs };
}
