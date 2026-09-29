import { describe, expect, it } from "vitest";
import {
  Knot,
  Move,
  MoveKind,
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

describe("baked tangles", () => {
  // Rewrite with `npx vitest run -u` after changing the generator.
  it("tangles.json matches the generator", async () => {
    const fresh = { A: makeTangleA(), B: makeTangleB() };
    for (const k of [fresh.A, fresh.B]) {
      expect(isValid(k)).toBe(true);
      expect(allMoves(k).length).toBeGreaterThan(0);
    }
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
  const rand = lcg(5);

  /** Find a move of the given kinds, re-relaxing the layout (like a
   * player making room) if none is available at first. */
  function findMove(
    k: Knot,
    kinds: MoveKind[],
    ok: (m: Move) => boolean,
  ): { k: Knot; m: Move } | null {
    for (let attempt = 0; attempt < 3; attempt++) {
      const kk = attempt === 0 ? k : relax(k, 200, lcg(100 + attempt));
      for (const v of kk.code) {
        const m = movesAt(kk, v.e, false, kinds).find(ok);
        if (m) return { k: kk, m };
      }
    }
    return null;
  }

  /**
   * Undo moves (R1-, R2-) while possible. When stuck, search R3
   * sequences (breadth-first) for a state from which undo moves get
   * below the stuck crossing count.
   */
  function solve(
    k0: Knot,
    target: number,
    already: Knot[] = [],
  ): string[] | null {
    const seen = new Set([k0, ...already].map(diagramKey));
    const fresh = (m: Move) => !seen.has(diagramKey(cleanup(m.to)));
    const descend = (k1: Knot): { k: Knot; p: string[] } => {
      let k = k1;
      const p: string[] = [];
      for (let s = 0; s < 30; s++) {
        const r = findMove(k, ["R1-", "R2-"], fresh);
        if (!r) break;
        k = relax(cleanup(r.m.to), 80, rand);
        seen.add(diagramKey(k));
        p.push(r.m.kind);
      }
      return { k, p };
    };
    let { k, p: path } = descend(k0);
    for (let guard = 0; guard < 10 && inv(k).n > target; guard++) {
      const stuckAt = inv(k).n;
      let layer = [{ k, p: [] as string[] }];
      let found: { k: Knot; p: string[] } | null = null;
      for (let depth = 0; depth < 6 && !found && layer.length; depth++) {
        const next: typeof layer = [];
        for (const st of layer) {
          if (found) break;
          const r = findMove(st.k, ["R3"], fresh);
          if (!r) continue;
          for (const v of r.k.code) {
            for (const m of movesAt(r.k, v.e, false, ["R3"])) {
              if (found || !fresh(m)) continue;
              const kk = relax(cleanup(m.to), 80, rand);
              seen.add(diagramKey(kk));
              const d = descend(kk);
              const p = [...st.p, "R3", ...d.p];
              if (inv(d.k).n < stuckAt) found = { k: d.k, p };
              else next.push({ k: kk, p: [...st.p, "R3"] });
            }
          }
        }
        layer = next.slice(0, 40);
      }
      if (!found) return null;
      k = found.k;
      path = [...path, ...found.p];
    }
    return inv(k).n <= target ? path : null;
  }

  it("tangle A (the Culprit) untangles after one twist", () => {
    // The Culprit's known solution: add one kink first. Found with
    // spherogram's Reidemeister moves; this checks that our geometry
    // allows every step.
    const A = tangles.A as Knot;
    const twist = movesAt(A, "e21", true, ["R1"])[0];
    expect(twist).toBeTruthy();
    const path = solve(relax(cleanup(twist.to), 150, rand), 0, [A]);
    expect(path).not.toBeNull();
  }, 300000);

  it("tangle B untangles to a 3-crossing trefoil", () => {
    const path = solve(tangles.B as Knot, 3);
    expect(path).not.toBeNull();
  }, 300000);
});
