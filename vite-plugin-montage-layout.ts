import fs from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import type { Plugin } from "vite";
import {
  MONTAGE_LAYOUT_FILES,
  type MontageLayout,
  SAVE_MONTAGE_PATH,
  type SaveMontageResponse,
} from "./src/slideshow/montage/montageApi";

/**
 * Lets the montage editor (#/montage-editor) save during dev: on a POST of a
 * layout from the page (to `?name=<layout>`, default "grid"), rewrites that
 * layout's JSON file, which then reaches the page by HMR like any other edit.
 */
export function montageLayout(): Plugin {
  return {
    name: "montage-layout",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_MONTAGE_PATH, (req, res) => {
        const name =
          new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "grid";
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          let reply: SaveMontageResponse;
          try {
            if (!Object.hasOwn(MONTAGE_LAYOUT_FILES, name))
              throw new Error(`No montage layout named ${name}`);
            const file = path.join(
              server.config.root,
              MONTAGE_LAYOUT_FILES[name as keyof typeof MONTAGE_LAYOUT_FILES],
            );
            const layout: MontageLayout = JSON.parse(body);
            if (
              !Array.isArray(layout.tiles) ||
              typeof layout.views !== "object"
            )
              throw new Error("Not a montage layout");
            const text = await formatJson(layout, file);
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

/** JSON as `pnpm prettier` would leave it, so saves don't churn the file */
export async function formatJson(value: unknown, file: string) {
  const options = await prettier.resolveConfig(file);
  return prettier.format(JSON.stringify(value), { ...options, filepath: file });
}
