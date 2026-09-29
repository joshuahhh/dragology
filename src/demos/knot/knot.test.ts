import { describe, expect, it } from "vitest";
import {
  Knot,
  cleanup,
  diagramKey,
  edgeCubics,
  invariants,
  isValid,
  movesAt,
} from "./knot";
import {
  figureEight,
  makeTangleA,
  makeTangleB,
  relax,
  scramble,
  trefoil,
  unknot,
} from "./presets";
import tangles from "./tangles.json";

const inv = (k: Knot) => invariants(k);
const TREFOIL_JONES = ["− t⁴ + t³ + t", "t⁻¹ + t⁻³ − t⁻⁴"];

function allMoves(k: Knot, under = false) {
  return k.code.flatMap((v) => movesAt(k, v.e, under));
}

/** Rendered geometry, for comparing states that should look the same. */
function samplePoints(k: Knot): string {
  return edgeCubics(k)
    .flatMap((c) => [c[0], c[3]])
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .sort()
    .join(" ");
}

describe("presets", () => {
  it("trefoil", () => {
    const k = trefoil();
    expect(isValid(k)).toBe(true);
    const v = inv(k);
    expect(v.n).toBe(3);
    expect(Math.abs(v.writhe)).toBe(3);
    expect(v.tricolorable).toBe(true);
    expect(TREFOIL_JONES).toContain(v.jones);
  });
  it("figure-eight", () => {
    const k = figureEight();
    expect(isValid(k)).toBe(true);
    const v = inv(k);
    expect(v.n).toBe(4);
    expect(v.tricolorable).toBe(false);
    expect(v.jones).toBe("t² − t + 1 − t⁻¹ + t⁻²");
  });
  it("unknot", () => {
    const k = unknot();
    expect(isValid(k)).toBe(true);
    expect(inv(k).n).toBe(0);
    expect(inv(k).jones).toBe("1");
  });
});

describe("moves", () => {
  for (const [name, make] of [
    ["unknot", unknot],
    ["trefoil", trefoil],
    ["figure-eight", figureEight],
  ] as const) {
    it(`every move from the ${name} keeps the Jones polynomial`, () => {
      const k = make();
      const j0 = inv(k).jones;
      const counts: Record<string, number> = {};
      for (const under of [false, true]) {
        for (const m of allMoves(k, under)) {
          counts[m.kind] = (counts[m.kind] ?? 0) + 1;
          expect(isValid(m.to)).toBe(true);
          expect(inv(m.to).jones).toBe(j0);
          const dn = { R1: 1, "R1-": -1, R2: 2, "R2-": -2, R3: 0 }[m.kind];
          expect(inv(m.to).n).toBe(inv(k).n + dn);
          // the pre-split start of a move looks exactly like the knot
          if (m.from !== k) {
            expect(diagramKey(m.from)).toBe(diagramKey(k));
            expect(samplePoints(cleanup(m.from))).toBe(samplePoints(k));
          }
          // after cleanup, only crossings remain (unless it's an unknot)
          const c = cleanup(m.to);
          expect(isValid(c)).toBe(true);
          expect(inv(c).jones).toBe(j0);
          if (inv(c).n > 0) {
            expect(c.code.every((v) => c.nodes[v.n].kind === "x")).toBe(true);
          } else {
            expect(c.code.length).toBe(2);
          }
        }
      }
      expect(counts.R1).toBeGreaterThan(0);
      if (name !== "unknot") expect(counts.R2).toBeGreaterThan(0);
    });
  }

  it("twists and pushes can be undone", () => {
    const k = trefoil();
    let undone = { R1: 0, R2: 0 };
    let made = { R1: 0, R2: 0 };
    for (const v of k.code) {
      for (const m of movesAt(k, v.e, false)) {
        if (m.kind !== "R1" && m.kind !== "R2") continue;
        made[m.kind]++;
        const after = cleanup(m.to);
        // the dragged edge keeps its id; undo from it
        const back = movesAt(after, v.e, false).filter(
          (x) => x.kind === (m.kind === "R1" ? "R1-" : "R2-"),
        );
        if (back.length > 0) {
          undone[m.kind]++;
          const res = cleanup(back[0].to);
          expect(inv(res).n).toBe(3);
          expect(inv(res).jones).toBe(inv(k).jones);
        }
      }
    }
    expect(undone.R1).toBe(made.R1);
    expect(undone.R2).toBe(made.R2);
    made = { R1: 0, R2: 0 };
    undone = made;
  });

  it("R3 appears after an R2 push makes a triangle", () => {
    let found = 0;
    for (const k of [trefoil(), figureEight()]) {
      const j0 = inv(k).jones;
      for (const v of k.code) {
        for (const m of movesAt(k, v.e, false).filter((x) => x.kind === "R2")) {
          const k2 = cleanup(m.to);
          for (const r of allMoves(k2).filter((x) => x.kind === "R3")) {
            found++;
            expect(isValid(r.to)).toBe(true);
            expect(inv(r.to).jones).toBe(j0);
            expect(inv(r.to).n).toBe(inv(k2).n);
          }
          if (found > 8) return;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("unknot twist then untwist returns to two pass nodes", () => {
    const k = unknot();
    const tw = movesAt(k, k.code[0].e, false).find((m) => m.kind === "R1")!;
    const k1 = cleanup(tw.to);
    expect(inv(k1).n).toBe(1);
    const loopEdge = k1.code.find(
      (v, i) => v.n === k1.code[(i + 1) % k1.code.length].n,
    )!.e;
    const un = movesAt(k1, loopEdge, false).find((m) => m.kind === "R1-")!;
    expect(un).toBeTruthy();
    const k2 = cleanup(un.to);
    expect(inv(k2).n).toBe(0);
    expect(k2.code.length).toBe(2);
    expect(isValid(k2)).toBe(true);
  });
});

describe("scramble", () => {
  it("keeps the knot type", () => {
    // (seeds whose results stay within the Jones computation's limit)
    for (const seed of [1, 3]) {
      const a = scramble(unknot(), seed, 8);
      expect(isValid(a)).toBe(true);
      expect(inv(a).jones).toBe("1");
      expect(inv(a).n).toBeGreaterThan(4);
    }
    for (const seed of [1, 2]) {
      const b = scramble(trefoil(), seed, 5);
      expect(isValid(b)).toBe(true);
      expect(inv(b).jones).toBe(inv(trefoil()).jones);
      expect(inv(b).n).toBeGreaterThan(4);
    }
  });
});

describe("baked tangles", () => {
  // Rewrite with `npx vitest run -u` after changing the generator.
  it("tangles.json matches the generator", async () => {
    const fresh = { A: makeTangleA(), B: makeTangleB() };
    expect(inv(fresh.A).jones).toBe("1");
    expect(TREFOIL_JONES).toContain(inv(fresh.B).jones);
    await expect(JSON.stringify(fresh)).toMatchFileSnapshot("./tangles.json");
  });
});

describe("tangles are solvable", () => {
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  /** Greedy: undo moves first, else a fresh R3; relax in between. */
  function solve(k0: Knot, target: number): number {
    const rand = lcg(7);
    let k = k0;
    const seen = new Set<string>();
    for (let step = 0; step < 60; step++) {
      if (inv(k).n <= target) return step;
      const all = k.code.flatMap((v) => [
        ...movesAt(k, v.e, false),
        ...movesAt(k, v.e, true),
      ]);
      let m = all.find((x) => x.kind === "R1-" || x.kind === "R2-");
      if (!m) {
        const r3s = all.filter(
          (x) => x.kind === "R3" && !seen.has(diagramKey(x.to)),
        );
        m = r3s[Math.floor(rand() * r3s.length)];
      }
      if (!m) return -1;
      seen.add(diagramKey(m.to));
      k = relax(cleanup(m.to), 150, rand);
    }
    return -1;
  }

  it("tangle A untangles to the unknot", () => {
    expect(solve(tangles.A as Knot, 0)).toBeGreaterThan(0);
  }, 60000);
  it("tangle B untangles to a 3-crossing trefoil", () => {
    expect(solve(tangles.B as Knot, 3)).toBeGreaterThan(0);
  }, 60000);
});
