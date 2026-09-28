import { describe, expect, it } from "vitest";
import { Knot, analyze, invariants, movesAt, resampleKnot } from "./knot";

import { figureEight, scramble, trefoil, unknot } from "./presets";

function inv(k: Knot) {
  return invariants(analyze(k));
}

describe("presets", () => {
  it("trefoil", () => {
    const k = trefoil();
    const an = analyze(k);
    expect(an.consistent).toBe(true);
    const v = inv(k);
    expect(v.n).toBe(3);
    expect(Math.abs(v.writhe)).toBe(3);
    expect(v.tricolorable).toBe(true);
    expect(["− t⁴ + t³ + t", "t⁻¹ + t⁻³ − t⁻⁴"]).toContain(v.jones);
    console.log("trefoil", v, k.pts.length);
  });
  it("figure-eight", () => {
    const k = figureEight();
    const an = analyze(k);
    expect(an.consistent).toBe(true);
    const v = inv(k);
    console.log("fig8", v, k.pts.length);
    expect(v.tricolorable).toBe(false);
    expect(v.jones).toBe("t² − t + 1 − t⁻¹ + t⁻²");
  });
  it("unknot", () => {
    const v = inv(unknot());
    expect(v.n).toBe(0);
    expect(v.jones).toBe("1");
    expect(v.tricolorable).toBe(false);
  });
});

describe("moves", () => {
  it("R1 twist keeps the Jones polynomial and changes writhe by ±1", () => {
    const k = trefoil();
    const j0 = inv(k).jones;
    let found = 0;
    for (const p of k.pts) {
      const moves = movesAt(k, p.id, false);
      for (const m of moves.filter((m) => m.kind === "R1")) {
        found++;
        const vf = inv(m.from);
        const vt = inv(m.to);
        expect(vf.jones).toBe(j0);
        expect(vt.jones).toBe(j0);
        expect(vt.n).toBe(4);
        expect(Math.abs(vt.writhe - vf.writhe)).toBe(1);
        expect(m.from.pts.length).toBe(m.to.pts.length);
        // and the untwist should be available at the apex
        const back = movesAt(m.to, p.id, false).filter((x) => x.kind === "R1-");
        expect(back.length).toBe(1);
        expect(inv(back[0].to).n).toBe(3);
        expect(inv(back[0].to).jones).toBe(j0);
      }
    }
    expect(found).toBeGreaterThan(0);
    console.log("R1 twists found", found);
  });
  it("R2 push/pull keep the Jones polynomial", () => {
    const k = trefoil();
    const j0 = inv(k).jones;
    let found = 0;
    let pulls = 0;
    for (const p of k.pts) {
      for (const under of [false, true]) {
        const moves = movesAt(k, p.id, under);
        for (const m of moves.filter((m) => m.kind === "R2")) {
          found++;
          const vt = inv(m.to);
          expect(vt.jones).toBe(j0);
          expect([5, 7]).toContain(vt.n);
          const back = movesAt(m.to, p.id, false).filter(
            (x) => x.kind === "R2-",
          );
          if (back.length) {
            pulls++;
            expect(inv(back[0].to).n).toBe(vt.n - 2);
            expect(inv(back[0].to).jones).toBe(j0);
          }
        }
      }
    }
    console.log("R2 pushes", found, "pulls", pulls);
    expect(found).toBeGreaterThan(0);
    expect(pulls).toBeGreaterThan(0);
  });
  it("R3 keeps the Jones polynomial (after an R2 push makes a triangle)", () => {
    let found = 0;
    for (const k of [trefoil(), figureEight()]) {
      const j0 = inv(k).jones;
      for (const p of k.pts) {
        for (const under of [false, true]) {
          for (const m of movesAt(k, p.id, under).filter(
            (m) => m.kind === "R2",
          )) {
            if (inv(m.to).n < 7 || found >= 6) continue;
            for (const q of m.to.pts) {
              for (const r of movesAt(m.to, q.id, false).filter(
                (x) => x.kind === "R3",
              )) {
                found++;
                const vt = inv(r.to);
                expect(vt.jones).toBe(j0);
                expect(vt.n).toBe(inv(m.to).n);
                expect(r.from.pts.length).toBe(r.to.pts.length);
              }
            }
          }
        }
      }
    }
    console.log("R3 found", found);
    expect(found).toBeGreaterThan(0);
  });
  it("scrambling keeps the Jones polynomial", () => {
    for (const seed of [1, 2, 3, 4]) {
      const a = scramble(unknot(), seed, 8);
      expect(inv(a).jones).toBe("1");
      expect(inv(a).n).toBeGreaterThan(5);
      const b = scramble(trefoil(), seed, 5);
      expect(inv(b).jones).toBe(inv(trefoil()).jones);
      expect(inv(b).n).toBeGreaterThan(5);
    }
  });
  it("resample keeps invariants", () => {
    const k = trefoil();
    const k2 = resampleKnot(k);
    expect(inv(k2)).toEqual(inv(k));
  });
});
