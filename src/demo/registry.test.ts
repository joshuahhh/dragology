import { describe, expect, it } from "vitest";
import { listedDemoIds } from "./list";
import { pathToId } from "./pathToId";

// Lazy glob — only discovers file paths, doesn't load any modules
const modules = import.meta.glob("../demos/**/*.tsx");

const discoveredIds = new Set(Object.keys(modules).map(pathToId));

describe("demo registry", () => {
  it("every id in demoList corresponds to a real file", () => {
    const missing = listedDemoIds.filter((id) => !discoveredIds.has(id));
    expect(missing).toEqual([]);
  });
});
