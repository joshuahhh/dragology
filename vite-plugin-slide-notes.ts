import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";
import {
  SAVE_NOTES_PATH,
  type SaveNotesRequest,
  type SaveNotesResponse,
} from "./src/slideshow/notesApi";

const SLIDES = "src/slideshow/slides.tsx";

/**
 * Lets the slideshow edit speaker notes during dev: on a request from the
 * page, rewrites a slide's `notes` in slides.tsx, which then reaches the page
 * by HMR like any other edit.
 */
export function slideNotes(): Plugin {
  return {
    name: "slide-notes",
    apply: "serve",
    configureServer(server) {
      const file = path.join(server.config.root, SLIDES);
      server.middlewares.use(SAVE_NOTES_PATH, (req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let reply: SaveNotesResponse;
          try {
            const save: SaveNotesRequest = JSON.parse(body);
            const text = await fs.readFile(file, "utf8");
            const next = setNotes(text, save);
            if (next !== text) await fs.writeFile(file, next);
            reply = { changed: next !== text };
          } catch (e) {
            reply = { error: e instanceof Error ? e.message : String(e) };
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(reply));
        });
      });
    },
  };
}

/** slides.tsx's text, with slide `index`'s notes set to `notes`. */
export function setNotes(
  text: string,
  { index, old, notes }: SaveNotesRequest,
): string {
  const sf = ts.createSourceFile(
    SLIDES,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

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
  const slide = outline.elements[index];
  if (!slide || !ts.isObjectLiteralExpression(slide)) {
    throw new Error(`Slide ${index} in \`outline\` isn't an object literal`);
  }

  const prop = slide.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && p.name.getText(sf) === "notes",
  );
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
  const firstProp = slide.properties[0];
  const indent = " ".repeat(
    firstProp
      ? sf.getLineAndCharacterOfPosition(firstProp.getStart(sf)).character
      : 4,
  );
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
  const anchor = slide.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ["content", "video"].includes(p.name.getText(sf)),
  );
  if (!anchor) throw new Error(`Slide ${index} has no content or video`);
  const at = anchor.getStart(sf);
  return splice(text, at, at, `notes: ${literal},\n${indent}`);
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
