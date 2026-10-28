import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import {
  type MontageLayout,
  SAVE_MONTAGE_PATH,
  type SaveMontageResponse,
} from "./src/slideshow/montage/montageApi";

const LAYOUT = "src/slideshow/montage/layout.json";

/**
 * Lets the montage editor (#/montage-editor) save during dev: on a POST of a
 * layout from the page, rewrites layout.json, which then reaches the page by
 * HMR like any other edit.
 */
export function montageLayout(): Plugin {
  return {
    name: "montage-layout",
    apply: "serve",
    configureServer(server) {
      const file = path.join(server.config.root, LAYOUT);
      server.middlewares.use(SAVE_MONTAGE_PATH, (req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let reply: SaveMontageResponse;
          try {
            const layout: MontageLayout = JSON.parse(body);
            if (
              !Array.isArray(layout.tiles) ||
              typeof layout.views !== "object"
            )
              throw new Error("Not a montage layout");
            const text = formatLayout(layout);
            const old = await fs.readFile(file, "utf8").catch(() => "");
            if (text !== old) await fs.writeFile(file, text);
            reply = { changed: text !== old };
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

/** JSON with one line per tile, view and group, for readable diffs */
export function formatLayout(layout: MontageLayout): string {
  const { gutter, radius, groups, tiles, views } = layout;
  const lines = (items: string[]) => items.map((s) => `    ${s}`).join(",\n");
  return (
    "{\n" +
    `  "gutter": ${JSON.stringify(gutter)},\n` +
    `  "radius": ${JSON.stringify(radius)},\n` +
    `  "groups": [\n${lines(groups.map((g) => JSON.stringify(g)))}\n  ],\n` +
    `  "views": {\n${lines(
      Object.entries(views).map(
        ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`,
      ),
    )}\n  },\n` +
    `  "tiles": [\n${lines(tiles.map((t) => JSON.stringify(t)))}\n  ]\n` +
    "}\n"
  );
}
