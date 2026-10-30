import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import type { EnvironmentModuleNode, Plugin, WebSocket } from "vite";

const SCRIPT = "src/slideshow/snapshot-slides.ts";
const SNAPSHOT_PAGE = "src/slideshow/SlideshowSnapshotPage.tsx";

// A run waits for this long without changes, so that a burst of saves (an
// agent's edits, say) is snapshotted once, at its end...
const QUIET_MS = 2000;
// ...but not longer than this after the first change it's waiting on, so that
// a steady stream of changes still gets snapshotted now and then.
const MAX_WAIT_MS = 30_000;
// After a run, the next waits at least this many times as long as the run
// took, so that snapshotting takes at most a third or so of the time.
const COOLDOWN_FACTOR = 2;

/**
 * Keeps the slideshow outline's snapshots current during dev: re-runs
 * snapshot-slides.ts after changes to the files the slides are rendered from,
 * while a page showing the snapshots is open and visible (useSlideSnapshots).
 * Changes made while none is are snapshotted when one next is. One run at a
 * time, at low CPU priority.
 *
 * Each run is a headless browser rendering every slide, which is heavy on
 * the CPU. A dev server started with SLIDE_SNAPSHOTS=off doesn't take them,
 * e.g. one an agent edits slides under.
 */
export function slideSnapshots(): Plugin {
  return {
    name: "slide-snapshots",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST || process.env.SLIDE_SNAPSHOTS === "off") return;
      const root = server.config.root;
      const snapshotPage = path.join(root, SNAPSHOT_PAGE);
      let running: ChildProcess | undefined;
      let closed = false;
      // What changed since the last run started, for the log. Starts out
      // non-empty: the snapshots on disk may be from before this server.
      let reasons = new Set<string>(["server started"]);
      let firstChange = Date.now();
      let lastChange = 0;
      let notBefore = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      // The pages showing snapshots that are visible, by connection
      const watchers = new Map<WebSocket, Set<string>>();
      const watched = () => [...watchers.values()].some((ids) => ids.size > 0);

      const schedule = () => {
        clearTimeout(timer);
        if (closed || running || reasons.size === 0 || !watched()) return;
        const now = Date.now();
        const at = Math.max(
          Math.min(lastChange + QUIET_MS, firstChange + MAX_WAIT_MS),
          notBefore,
        );
        timer = setTimeout(run, Math.max(0, at - now));
      };

      const run = () => {
        const url = server.resolvedUrls?.local[0];
        if (!url || closed || running) return;
        const why = [...reasons].join(", ");
        reasons = new Set();
        const started = Date.now();
        // nice, so that the run (and the browser it starts) gives way to
        // whatever else the computer is doing
        const child = spawn(
          "nice",
          ["-n", "15", process.execPath, SCRIPT, url],
          { cwd: root },
        );
        running = child;
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (code, signal) => {
          running = undefined;
          if (closed) return;
          const took = Date.now() - started;
          notBefore = Date.now() + COOLDOWN_FACTOR * took;
          if (code === 0) {
            server.config.logger.info(
              `[slide-snapshots] updated in ${(took / 1000).toFixed(1)}s (${why})`,
              { timestamp: true },
            );
          } else {
            server.config.logger.error(
              `[slide-snapshots] failed (${signal ?? `exit ${code}`}):\n${output}`,
            );
          }
          schedule();
        });
      };
      // A restart closes this server and starts another with a fresh plugin,
      // which wouldn't know about this run, so it ends with the server.
      server.httpServer?.once("close", () => {
        closed = true;
        clearTimeout(timer);
        running?.kill();
      });

      const changed = (reason: string) => {
        const now = Date.now();
        if (reasons.size === 0) firstChange = now;
        lastChange = now;
        reasons.add(reason);
        schedule();
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

      // A page becoming visible doesn't itself snapshot, only changes do: a
      // page reloaded by new snapshots would otherwise ask for more, and
      // reload again whenever they differ.
      server.ws.on(
        "slide-snapshots:watch",
        ({ id, visible }: { id: string; visible: boolean }, client) => {
          const socket = client.socket;
          let ids = watchers.get(socket);
          if (!ids) {
            ids = new Set();
            watchers.set(socket, ids);
            socket.once("close", () => {
              watchers.delete(socket);
              schedule();
            });
          }
          if (visible) ids.add(id);
          else ids.delete(id);
          schedule();
        },
      );
      for (const event of ["add", "change", "unlink"]) {
        server.watcher.on(event, (file: string) => {
          if (affectsSlides(file)) changed(path.relative(root, file));
        });
      }
    },
  };
}
