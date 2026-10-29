import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";
import {
  SAVE_NOTES_PATH,
  SAVE_TIMINGS_PATH,
  type SaveNotesRequest,
  type SaveResponse,
  type SaveTimingsRequest,
} from "./src/slideshow/notesApi";

const SLIDES = "src/slideshow/slides.tsx";

/**
 * Lets the slideshow write to its slides during dev: on a request from the
 * page, rewrites a slide's `notes`, or the `timing`s from a timed run-through,
 * in slides.tsx, which then reaches the page by HMR like any other edit.
 */
export function slideNotes(): Plugin {
  return {
    name: "slide-notes",
    apply: "serve",
    configureServer(server) {
      const file = path.join(server.config.root, SLIDES);
      // One rewrite at a time, each reading what the one before wrote:
      // otherwise two at once (notes saved on blur, timings saved by the
      // same keystroke) both read the old file, and the later write drops
      // the earlier one's edit
      let rewrites = Promise.resolve();
      const rewriteWith =
        <Req>(edit: (text: string, req: Req) => string) =>
        (req: IncomingMessage, res: ServerResponse) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            rewrites = rewrites.then(async () => {
              let reply: SaveResponse;
              try {
                const text = await fs.readFile(file, "utf8");
                const next = edit(text, JSON.parse(body));
                if (next !== text) await fs.writeFile(file, next);
                reply = { changed: next !== text };
              } catch (e) {
                reply = { error: e instanceof Error ? e.message : String(e) };
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(reply));
            });
          });
        };
      server.middlewares.use(SAVE_NOTES_PATH, rewriteWith(setNotes));
      server.middlewares.use(SAVE_TIMINGS_PATH, rewriteWith(setTimings));
    },
  };
}

/** slides.tsx's text, with slide `index`'s notes set to `notes`. */
export function setNotes(
  text: string,
  { index, old, notes }: SaveNotesRequest,
): string {
  const sf = parse(text);
  const slide = slideAt(sf, index);

  const prop = findProp(sf, slide, "notes");
  const init = prop?.initializer;
  if (
    init &&
    !ts.isNoSubstitutionTemplateLiteral(init) &&
    !ts.isStringLiteral(init)
  ) {
    throw new Error("These notes aren't a plain string in slides.tsx");
  }
  if ((init?.text ?? "") !== (old ?? "")) {
    throw new Error("These notes changed in slides.tsx while you edited them");
  }

  // Indented like the slide's other properties, as a block of its own
  const indent = propIndent(sf, slide);
  const lines = notes
    .replace(/^\s*\n/, "")
    .trimEnd()
    .split("\n");
  const literal =
    "`\n" +
    lines
      .map((line) => (line.trim() ? indent + "  " + escape(line) : ""))
      .join("\n") +
    "\n" +
    indent +
    "`";
  const empty = notes.trim() === "";

  if (prop && init) {
    if (!empty) return splice(text, init.getStart(sf), init.end, literal);
    // Remove the property, with its line and comma
    const end = text[prop.end] === "," ? prop.end + 1 : prop.end;
    return splice(text, prop.getFullStart(), end, "");
  }
  if (empty) return text;
  // New notes go before the slide's content
  const anchor = findContent(sf, slide, index);
  const at = anchor.getStart(sf);
  return splice(text, at, at, `notes: ${literal},\n${indent}`);
}

/**
 * slides.tsx's text, with each of `slides`' `timing` set. Each slide is found
 * by its index, so if slides were added to or removed from the outline during
 * the run-through, none are set.
 */
export function setTimings(
  text: string,
  { outlineLength, slides }: SaveTimingsRequest,
): string {
  const sf = parse(text);
  if (outlineArray(sf).elements.length !== outlineLength) {
    throw new Error(
      "Slides were added to or removed from the outline during the run-through, so its timings might go on the wrong slides",
    );
  }
  const edits = slides.map(({ index, timing }) => {
    const slide = slideAt(sf, index);
    const literal = `[${timing.join(", ")}]`;
    const init = findProp(sf, slide, "timing")?.initializer;
    if (init) return { start: init.getStart(sf), end: init.end, literal };
    // New timings go before the notes, or else the content
    const anchor =
      findProp(sf, slide, "notes") ?? findContent(sf, slide, index);
    const at = anchor.getStart(sf);
    return {
      start: at,
      end: at,
      literal: `timing: ${literal},\n${propIndent(sf, slide)}`,
    };
  });
  // From the end, so each edit leaves the positions of those before it alone
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (t, { start, end, literal }) => splice(t, start, end, literal),
      text,
    );
}

function parse(text: string) {
  return ts.createSourceFile(
    SLIDES,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** `outline`'s array literal */
function outlineArray(sf: ts.SourceFile) {
  let outline: ts.Expression | undefined;
  sf.forEachChild(function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === "outline") {
      outline = node.initializer;
    }
    node.forEachChild(visit);
  });
  if (!outline || !ts.isArrayLiteralExpression(outline)) {
    throw new Error("`outline` in slides.tsx isn't an array literal");
  }
  return outline;
}

/** Entry `index` of `outline` (which counts headings too). */
function slideAt(sf: ts.SourceFile, index: number) {
  const slide = outlineArray(sf).elements[index];
  if (!slide || !ts.isObjectLiteralExpression(slide)) {
    throw new Error(`Slide ${index} in \`outline\` isn't an object literal`);
  }
  return slide;
}

function findProp(
  sf: ts.SourceFile,
  slide: ts.ObjectLiteralExpression,
  name: string,
) {
  return slide.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && p.name.getText(sf) === name,
  );
}

function findContent(
  sf: ts.SourceFile,
  slide: ts.ObjectLiteralExpression,
  index: number,
) {
  const anchor = findProp(sf, slide, "content") ?? findProp(sf, slide, "video");
  if (!anchor) throw new Error(`Slide ${index} has no content or video`);
  return anchor;
}

/** The indent of the slide's properties */
function propIndent(sf: ts.SourceFile, slide: ts.ObjectLiteralExpression) {
  const firstProp = slide.properties[0];
  return " ".repeat(
    firstProp
      ? sf.getLineAndCharacterOfPosition(firstProp.getStart(sf)).character
      : 4,
  );
}

function escape(line: string) {
  return line
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function splice(text: string, start: number, end: number, insert: string) {
  return text.slice(0, start) + insert + text.slice(end);
}
