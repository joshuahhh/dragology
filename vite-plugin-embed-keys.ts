import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * First in each embedded page's <head>: tells the slide around it (its
 * iframe element, in our page) that the page's window exists. It runs before
 * any of the app's scripts, so the slide's key handlers come before the app's.
 */
const SCRIPT = `<script>frameElement&&frameElement.dispatchEvent(new CustomEvent("embed-window"))</script>`;

/**
 * Serves the HTML pages of the apps embedded in slides (public/embeds, see
 * src/slideshow/EmbedSlide.tsx) with SCRIPT added, so that a slide can take
 * keys like Escape from the app however the app listens for them.
 */
export function embedKeys(): Plugin {
  return {
    name: "embed-keys",
    apply: "serve",
    configureServer(server) {
      const root = path.join(server.config.publicDir, "embeds");
      server.middlewares.use("/embeds", async (req, res, next) => {
        const pathname = decodeURIComponent(
          new URL(req.url ?? "", "http://x").pathname,
        );
        const file = path.join(root, pathname);
        if (!pathname.endsWith(".html") || !file.startsWith(root + path.sep))
          return next();
        let html;
        try {
          html = await fs.readFile(file, "utf8");
        } catch {
          return next();
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html.replace(/<head[^>]*>/i, (head) => head + SCRIPT));
      });
    },
  };
}
