import { spawn } from "node:child_process";
import path from "node:path";
import type { EnvironmentModuleNode, Plugin } from "vite";

const SCRIPT = "src/slideshow/snapshot-slides.sh";
const SNAPSHOT_PAGE = "src/slideshow/SlideshowSnapshotPage.tsx";

/**
 * Keeps the slideshow outline's snapshots current during dev: once an outline
 * page has been opened, re-runs snapshot-slides.sh on any change to a file the
 * slides are rendered from.
 */
export function slideSnapshots(): Plugin {
  return {
    name: "slide-snapshots",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST) return;
      const root = server.config.root;
      const snapshotPage = path.join(root, SNAPSHOT_PAGE);
      let active = false;
      let running = false;
      let again = false;
      // What changed since the last run started, for the log
      let reasons = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const run = () => {
        const url = server.resolvedUrls?.local[0];
        if (!url) return;
        if (running) {
          again = true;
          return;
        }
        running = true;
        const why = [...reasons].join(", ");
        reasons = new Set();
        const child = spawn(SCRIPT, [url], { cwd: root });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (code) => {
          running = false;
          if (code === 0) {
            server.config.logger.info(`[slide-snapshots] updated (${why})`, {
              timestamp: true,
            });
          } else {
            server.config.logger.error(`[slide-snapshots] failed:\n${output}`);
          }
          if (again) {
            again = false;
            run();
          }
        });
      };
      const schedule = (reason: string) => {
        reasons.add(reason);
        clearTimeout(timer);
        timer = setTimeout(run, 200);
      };

      // Does the snapshot page (transitively) import this file?
      const affectsSlides = (file: string) => {
        const rel = path.relative(root, file);
        if (rel.startsWith("public/slides/thumbs")) return false;
        if (rel.startsWith("public/slides/") || rel.endsWith(".css")) {
          return true;
        }
        const graph = server.environments.client.moduleGraph;
        const seen = new Set<EnvironmentModuleNode>();
        const queue = [...(graph.getModulesByFile(file) ?? [])];
        while (queue.length) {
          const mod = queue.pop()!;
          if (seen.has(mod)) continue;
          seen.add(mod);
          if (mod.file === snapshotPage) return true;
          queue.push(...mod.importers);
        }
        return false;
      };

      server.ws.on("slide-snapshots:open", () => {
        active = true;
        schedule("outline opened");
      });
      for (const event of ["add", "change", "unlink"]) {
        server.watcher.on(event, (file: string) => {
          if (active && affectsSlides(file)) {
            schedule(path.relative(root, file));
          }
        });
      }
    },
  };
}
