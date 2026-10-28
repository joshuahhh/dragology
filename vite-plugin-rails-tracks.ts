import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const DIR = "src/slideshow/rails";
const SAVE_PATH = "/__rails/save";

/**
 * Lets slides record pointer tracks during dev (src/slideshow/rails.tsx): on
 * a request from the page, writes a slide's tracks to
 * src/slideshow/rails/<id>.json.
 */
export function railsTracks(): Plugin {
  return {
    name: "rails-tracks",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_PATH, (req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const { id, tracks } = JSON.parse(body);
            if (!/^[\w-]+$/.test(id)) throw new Error(`Bad id: ${id}`);
            const dir = path.join(server.config.root, DIR);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(
              path.join(dir, `${id}.json`),
              JSON.stringify(tracks) + "\n",
            );
            res.end("ok");
          } catch (e) {
            res.statusCode = 500;
            res.end(e instanceof Error ? e.message : String(e));
          }
        });
      });
    },
  };
}
