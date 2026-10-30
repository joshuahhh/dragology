import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { EnvironmentModuleNode, Plugin, WebSocket } from "vite";
import { outlineArray, parse } from "./vite-plugin-slide-notes";

const SCRIPT = "src/slideshow/snapshot-slides.ts";
const SNAPSHOT_PAGE = "src/slideshow/SlideshowSnapshotPage.tsx";
const SLIDES = "src/slideshow/slides.tsx";

// A run waits for this long without changes, so that a burst of saves (an
// agent's edits, say) is snapshotted once, at its end...
const QUIET_MS = 2000;
// ...but not longer than this after the first change it's waiting on, so that
// a steady stream of changes still gets snapshotted now and then.
const MAX_WAIT_MS = 30_000;
// After a run, the next waits at least this many times as long as the run
// took, so that snapshotting takes at most a third or so of the time.
const COOLDOWN_FACTOR = 2;

/** What a slide's snapshot was taken of */
type Shot = {
  /** The slide's own code in slides.tsx (`SlideDeps.sig`) */
  sig: string;
  /** The files that slides.tsx imports what the slide uses from */
  files: Set<string>;
};

/**
 * Keeps the slideshow outline's snapshots current during dev: re-runs
 * snapshot-slides.ts after changes to the files the slides are rendered from,
 * while a page showing the snapshots is open and visible (useSlideSnapshots).
 * Changes made while none is are snapshotted when one next is. One run at a
 * time, at low CPU priority.
 *
 * A run only snapshots the slides a change could have changed: those whose
 * code in slides.tsx changed (not their notes or timings, which don't show),
 * or that use something slides.tsx imports from a module that (transitively)
 * imports the changed file. A slide that only moved has its snapshot moved
 * with it. Anything else the snapshot page imports, CSS, and files in
 * public/slides could change any slide, and so do the first run after the
 * server starts.
 *
 * Each run is a headless browser rendering slides, which is heavy on the
 * CPU. A dev server started with SLIDE_SNAPSHOTS=off doesn't take them, e.g.
 * one an agent edits slides under.
 */
export function slideSnapshots(): Plugin {
  return {
    name: "slide-snapshots",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST || process.env.SLIDE_SNAPSHOTS === "off") return;
      const root = server.config.root;
      const snapshotPage = path.join(root, SNAPSHOT_PAGE);
      const slidesFile = path.join(root, SLIDES);
      const env = server.environments.client;
      let busy = false;
      let child: ChildProcess | undefined;
      let closed = false;
      // The snapshots on disk that are known to be current, by slide number.
      // Starts out empty: the snapshots on disk may be from before this
      // server.
      let shots = new Map<number, Shot>();
      // What changed since the last run started, for the log
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
        if (closed || busy || reasons.size === 0 || !watched()) return;
        const now = Date.now();
        const at = Math.max(
          Math.min(lastChange + QUIET_MS, firstChange + MAX_WAIT_MS),
          notBefore,
        );
        timer = setTimeout(run, Math.max(0, at - now));
      };

      /**
       * Which slides to snapshot, and which snapshots to move to another
       * slide's number, or null if none need either. `plan` is undefined to
       * snapshot them all, if slides.tsx can't be analyzed. Updates `shots`
       * to what the run will leave on disk.
       */
      const planRun = async () => {
        const text = await fs.readFile(slidesFile, "utf8");
        let deps: SlideDeps[];
        try {
          deps = slideDependencies(text);
        } catch (e) {
          server.config.logger.warn(
            `[slide-snapshots] can't tell which slides changed, so snapshotting them all: ${e instanceof Error ? e.message : e}`,
          );
          shots = new Map();
          return { text, plan: undefined };
        }
        const resolved = new Map<string, string | undefined>();
        for (const spec of new Set(deps.flatMap((d) => [...d.specs]))) {
          const id = (await env.pluginContainer.resolveId(spec, slidesFile))
            ?.id;
          resolved.set(spec, id?.replace(/\?.*/, ""));
        }
        // No awaits from here on, so that a change while planning, which
        // updates `shots`, isn't lost
        const bySig = new Map([...shots].map(([num, s]) => [s.sig, num]));
        const keep: number[] = [];
        const shoot: number[] = [];
        const copy: [to: number, from: number][] = [];
        const next = new Map<number, Shot>();
        for (const { num, sig, specs } of deps) {
          const files = new Set(
            [...specs].flatMap((s) => resolved.get(s) ?? []),
          );
          next.set(num, { sig, files });
          const from = shots.get(num)?.sig === sig ? num : bySig.get(sig);
          if (from === num) keep.push(num);
          else if (from !== undefined) copy.push([num, from]);
          else shoot.push(num);
        }
        const dropped = [...shots.keys()].some((num) => !next.has(num));
        shots = next;
        if (!shoot.length && !copy.length && !dropped) return null;
        return { text, plan: { keep, shoot, copy } };
      };

      const run = async () => {
        const url = server.resolvedUrls?.local[0];
        if (!url || closed || busy) return;
        busy = true;
        const why = [...reasons].join(", ");
        reasons = new Set();
        const planned = await planRun();
        if (!planned || closed) {
          busy = false;
          schedule();
          return;
        }
        const { text, plan } = planned;
        const started = Date.now();
        // nice, so that the run (and the browser it starts) gives way to
        // whatever else the computer is doing
        const args = ["-n", "15", process.execPath, SCRIPT, url];
        if (plan) args.push(JSON.stringify(plan));
        const proc = spawn("nice", args, { cwd: root });
        child = proc;
        let output = "";
        proc.stdout.on("data", (d) => (output += d));
        proc.stderr.on("data", (d) => (output += d));
        proc.on("close", async (code, signal) => {
          child = undefined;
          if (closed) return;
          const took = Date.now() - started;
          notBefore = Date.now() + COOLDOWN_FACTOR * took;
          const what =
            !plan || (!plan.keep.length && !plan.copy.length)
              ? "all slides"
              : plan.shoot.length
                ? `slide${plan.shoot.length > 1 ? "s" : ""} ${plan.shoot.join(" ")}`
                : "slide numbers";
          if (code === 0) {
            server.config.logger.info(
              `[slide-snapshots] updated ${what} in ${(took / 1000).toFixed(1)}s (${why})`,
              { timestamp: true },
            );
          } else {
            server.config.logger.error(
              `[slide-snapshots] failed (${signal ?? `exit ${code}`}):\n${output}`,
            );
          }
          // If slides.tsx changed during the run, the page may have shown
          // the slides as they are now, under other numbers
          const unsure =
            code !== 0 ||
            (await fs.readFile(slidesFile, "utf8").catch(() => "")) !== text;
          if (unsure && plan) {
            for (const num of [...plan.shoot, ...plan.copy.map(([to]) => to)]) {
              shots.delete(num);
            }
          } else if (unsure) {
            shots.clear();
          }
          busy = false;
          schedule();
        });
      };
      // A restart closes this server and starts another with a fresh plugin,
      // which wouldn't know about this run, so it ends with the server.
      server.httpServer?.once("close", () => {
        closed = true;
        clearTimeout(timer);
        child?.kill();
      });

      const changed = (reason: string) => {
        const now = Date.now();
        if (reasons.size === 0) firstChange = now;
        lastChange = now;
        reasons.add(reason);
        schedule();
      };

      /**
       * Forgets the snapshots a change to this file could have changed, and
       * says whether it could have changed any. (Changes to slides.tsx itself
       * are found by comparing each slide's code when planning a run.)
       */
      const invalidate = (file: string) => {
        const rel = path.relative(root, file);
        if (rel.startsWith("public/slides/thumbs")) return false;
        if (file === slidesFile) return true;
        if (rel.startsWith("public/slides/") || rel.endsWith(".css")) {
          shots.clear();
          return true;
        }
        // Up the module graph from the file, to the modules slides.tsx
        // imports, or to the snapshot page by some other way
        const imported = new Set<string>();
        const seen = new Set<EnvironmentModuleNode>();
        const queue = [...(env.moduleGraph.getModulesByFile(file) ?? [])];
        while (queue.length) {
          const mod = queue.pop()!;
          if (seen.has(mod)) continue;
          seen.add(mod);
          if (mod.file === snapshotPage) {
            shots.clear();
            return true;
          }
          for (const importer of mod.importers) {
            if (importer.file !== slidesFile) queue.push(importer);
            else if (mod.file) imported.add(mod.file);
          }
        }
        if (imported.size === 0) return false;
        for (const [num, shot] of shots) {
          if ([...shot.files].some((f) => imported.has(f))) shots.delete(num);
        }
        return true;
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
          if (invalidate(file)) changed(path.relative(root, file));
        });
      }
    },
  };
}

/** What a content slide in slides.tsx is rendered from */
export type SlideDeps = {
  /** The slide's number, counting video slides but not headings */
  num: number;
  /**
   * A hash of the slide's code in slides.tsx: its `content`, and every
   * declaration there that it (transitively) uses
   */
  sig: string;
  /** The specifiers of the imports it (transitively) uses */
  specs: Set<string>;
};

/**
 * Each content slide's dependencies in slides.tsx, found by name: a slide
 * depends on every top-level name its `content` mentions, and on the names
 * their declarations mention in turn. (That overestimates, for a local that
 * shadows a top-level name, which only means snapshotting a slide that didn't
 * change.) Throws if the outline isn't laid out as expected.
 */
export function slideDependencies(text: string): SlideDeps[] {
  const sf = parse(text);
  const outline = outlineArray(sf);

  const imports = new Map<string, string>();
  const decls = new Map<string, ts.Statement>();
  // Imports for their side effects, and top-level code that isn't a
  // declaration, which every slide depends on
  const sideEffects: string[] = [];
  let loose = "";
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = (st.moduleSpecifier as ts.StringLiteral).text;
      const clause = st.importClause;
      if (!clause) sideEffects.push(spec);
      else if (!clause.isTypeOnly) {
        if (clause.name) imports.set(clause.name.text, spec);
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) {
          imports.set(named.name.text, spec);
        } else if (named) {
          for (const el of named.elements) {
            if (!el.isTypeOnly) imports.set(el.name.text, spec);
          }
        }
      }
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name
    ) {
      decls.set(st.name.text, st);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        for (const name of boundNames(d.name)) decls.set(name, st);
      }
    } else if (
      !ts.isTypeAliasDeclaration(st) &&
      !ts.isInterfaceDeclaration(st)
    ) {
      loose += st.getText(sf);
    }
  }

  // The outline's own text, should a slide use it, leaves out notes and
  // timings, which don't show
  const outlineStatement = outline.parent.parent.parent;
  const declText = (st: ts.Statement) => {
    if (st !== outlineStatement) return st.getText(sf);
    const start = st.getStart(sf);
    let out = st.getText(sf);
    const props = outline.elements
      .flatMap((el) => (ts.isObjectLiteralExpression(el) ? el.properties : []))
      .filter((p) => ["notes", "timing"].includes(p.name?.getText(sf) ?? ""))
      .reverse();
    for (const p of props) {
      out = out.slice(0, p.getStart(sf) - start) + out.slice(p.end - start);
    }
    return out;
  };

  const result: SlideDeps[] = [];
  let num = 0;
  outline.elements.forEach((el, index) => {
    if (
      !ts.isObjectLiteralExpression(el) ||
      !el.properties.every(ts.isPropertyAssignment)
    ) {
      throw new Error(`Slide ${index} in \`outline\` isn't an object literal`);
    }
    const prop = (name: string) =>
      el.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(sf) === name,
      );
    if (prop("heading")) return;
    num++;
    if (prop("video")) return;
    const content = prop("content");
    if (!content) throw new Error(`Slide ${index} has no content or video`);

    const texts = [loose, content.initializer.getText(sf)];
    const specs = new Set(sideEffects);
    const seen = new Set<string>();
    const queue = [...mentions(content.initializer)];
    while (queue.length) {
      const name = queue.pop()!;
      if (seen.has(name)) continue;
      seen.add(name);
      const spec = imports.get(name);
      if (spec) specs.add(spec);
      const decl = decls.get(name);
      if (decl) {
        texts.push(declText(decl));
        queue.push(...mentions(decl));
      }
    }
    const sig = createHash("sha1").update(texts.join("\0")).digest("hex");
    result.push({ num, sig, specs });
  });
  return result;
}

/** The names a binding pattern binds */
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) =>
    ts.isOmittedExpression(el) ? [] : boundNames(el.name),
  );
}

/** Every identifier in `node` that could be a reference to a variable */
function mentions(node: ts.Node): Set<string> {
  const names = new Set<string>();
  (function visit(n: ts.Node) {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMember =
        ((ts.isPropertyAccessExpression(p) ||
          ts.isPropertyAssignment(p) ||
          ts.isJsxAttribute(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isPropertyDeclaration(p)) &&
          p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n);
      if (!isMember) names.add(n.text);
    }
    n.forEachChild(visit);
  })(node);
  return names;
}
