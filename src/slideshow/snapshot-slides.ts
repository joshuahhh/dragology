// Snapshots the slideshow's content slides for the outline page
// (/#/slideshow-outline), using a headless browser on a running dev server.
// The dev server runs it itself while an outline page is open
// (vite-plugin-slide-snapshots.ts); to run it by hand:
//
//   node src/slideshow/snapshot-slides.ts <dev server url> [plan]
//
// Without a plan, it snapshots every content slide. A plan (JSON, see `Plan`)
// says which to snapshot, which snapshots to keep, and which to copy from
// another slide's number; the snapshots of slides it doesn't mention go.
//
// It needs Playwright's headless Chromium shell, which `pnpm install` doesn't
// download: `pnpm exec playwright-core install --only-shell chromium`.
//
// The browser is Playwright's child, talking to it over a pipe, so it can't
// outlive this process: it's closed when a run fails, and Playwright kills it
// when the process exits or gets a signal.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

type Plan = {
  keep: number[];
  shoot: number[];
  /** Pairs of [slide number, number of the slide to copy its snapshot from] */
  copy: [number, number][];
};

const [arg, planArg] = process.argv.slice(2);
if (!arg) {
  console.error(
    "usage: node src/slideshow/snapshot-slides.ts <dev server url> [plan]",
  );
  process.exit(2);
}
const BASE_URL = arg.replace(/\/$/, "");
const plan: Plan | undefined = planArg && JSON.parse(planArg);
const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "public/slides/thumbs");
const MANIFEST = path.join(HERE, "thumbs.json");
// Stages are 960×540 (half size), stacked down the page.
const W = 960;
const H = 540;
// A run normally takes seconds; past this, something is stuck.
const TIMEOUT_MS = 120_000;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slide-snapshots-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
setTimeout(() => {
  console.error(`Timed out after ${TIMEOUT_MS / 1000}s`);
  process.exit(1);
}, TIMEOUT_MS).unref();

const jpg = (n: number | string) => path.join(OUT, `${n}.jpg`);
// Snapshots to keep or copy that have gone missing get taken again
const toShoot = new Set(plan?.shoot);
const kept = new Map<number, Buffer>();
for (const [to, from] of [
  ...(plan?.keep.map((n) => [n, n]) ?? []),
  ...(plan?.copy ?? []),
]) {
  if (fs.existsSync(jpg(from))) kept.set(to, fs.readFileSync(jpg(from)));
  else toShoot.add(to);
}

let nums: string[] = [];
const shots: string[] = [];
if (!plan || toShoot.size > 0) {
  const only = plan ? `&only=${[...toShoot].join(",")}` : "";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(30_000);
    // The query string makes this a fresh page load, even if the page is open.
    await page.goto(`${BASE_URL}/?${Date.now()}${only}#/slideshow-snapshot`);
    await page.locator("[data-slides-page]").waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => img.decode().catch(() => {})),
      );
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    });
    nums = await page.$$eval("[data-slide]", (els) =>
      els.map((el) => (el as HTMLElement).dataset.slide!),
    );
    // A few screenshots of the page, cut into slides below, are much faster
    // than a screenshot per slide. A few, not one: Chrome captures at most
    // 16384 px of height at a time, which is 30 stages.
    const PER_SHOT = 30;
    for (let i = 0; i * PER_SHOT < nums.length; i++) {
      const count = Math.min(PER_SHOT, nums.length - i * PER_SHOT);
      const shot = path.join(tmp, `all-${String(i).padStart(3, "0")}.png`);
      await page.screenshot({
        path: shot,
        fullPage: true,
        clip: { x: 0, y: i * PER_SHOT * H, width: W, height: count * H },
      });
      shots.push(shot);
    }
  } finally {
    await browser.close();
  }
  // (With a plan, the slides to snapshot may all have become video slides
  // since, which the page leaves out.)
  if (!plan && nums.length === 0) {
    console.error("No slides on the snapshot page");
    process.exit(1);
  }
}

// The stages are stacked down the page in order, so tile k is the k-th slide.
const tile = (k: number) => path.join(tmp, `tile-${k}.jpg`);
if (shots.length > 0) {
  execFileSync("magick", [
    ...shots,
    ...["-crop", `${W}x${H}`, "+repage", "-quality", "85"],
    path.join(tmp, "tile-%d.jpg"),
  ]);
}
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith(".jpg")) fs.rmSync(path.join(OUT, f));
}
for (const [n, data] of kept) fs.writeFileSync(jpg(n), data);
nums.forEach((n, k) => fs.copyFileSync(tile(k), jpg(n)));

// The manifest is what the outline page reads: it lists each snapshot with a
// hash of its contents, so the page only reloads images that changed.
const manifest: Record<string, string> = {};
const all = [...new Set([...kept.keys(), ...nums.map(Number)])];
for (const n of all.sort((a, b) => a - b)) {
  const data = fs.readFileSync(jpg(n));
  manifest[n] = createHash("sha1").update(data).digest("hex").slice(0, 10);
}
const json = JSON.stringify(manifest, null, 2) + "\n";
if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, "utf8") !== json) {
  fs.writeFileSync(MANIFEST, json);
}
console.log(
  nums.length
    ? `Snapshotted slides ${nums.join(" ")}`
    : "Snapshotted no slides",
);
