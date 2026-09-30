import { DemoInfo, isDemo } from ".";
import { demoList, listedDemoIds } from "./list";
import { pathToId } from "./pathToId";

export { demo } from ".";
export type { DemoInfo, DemoOptions } from ".";

export type Demo = DemoInfo & {
  id: string;
  sourcePath: string;
};

const modules = import.meta.glob<{ default: unknown }>("../demos/**/*.tsx", {
  eager: true,
});

const demosById = new Map<string, Demo>();
for (const [path, mod] of Object.entries(modules)) {
  if (!isDemo(mod.default)) continue;
  const id = pathToId(path);
  const sourcePath = path.replace("../demos/", "");
  demosById.set(id, { ...mod.default, id, sourcePath });
}

const listSet = new Set(listedDemoIds);

function getListedDemo(id: string): Demo {
  const demo = demosById.get(id);
  if (!demo) throw new Error(`Demo "${id}" not found in demos/`);
  return demo;
}

export const listedDemos: Demo[] = listedDemoIds.map(getListedDemo);

/**
 * The listed demos grouped for display: each section in `demoList`
 * becomes a titled group, and each run of plain ids between sections
 * becomes an untitled group.
 */
export type DemoGroup = { title: string | null; demos: Demo[] };

export const listedDemoGroups: DemoGroup[] = [];
for (const entry of demoList) {
  if (typeof entry === "string") {
    const last = listedDemoGroups[listedDemoGroups.length - 1];
    if (last && last.title === null) last.demos.push(getListedDemo(entry));
    else listedDemoGroups.push({ title: null, demos: [getListedDemo(entry)] });
  } else {
    listedDemoGroups.push({
      title: entry.section,
      demos: entry.demos.map(getListedDemo),
    });
  }
}

export const unlistedDemos: Demo[] = [...demosById.values()].filter(
  (d) => !listSet.has(d.id),
);

export { demoList, demosById, listedDemoIds };
