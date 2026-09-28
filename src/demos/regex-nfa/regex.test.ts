import { describe, expect, it } from "vitest";
import {
  alt,
  buildDfa,
  buildNfa,
  cat,
  chr,
  nfaMatches,
  placementTargets,
  regexToString,
  removeNode,
  star,
  wrapInStar,
} from "./regex";

const re = cat(
  "root",
  star("s", alt("alt", chr("a1", "a"), chr("b1", "b"))),
  chr("a2", "a"),
  chr("b2", "b"),
);

describe("regex", () => {
  it("prints", () => {
    expect(regexToString(re)).toBe("(a|b)*ab");
    expect(
      regexToString(star("s", cat("c", chr("a", "a"), chr("b", "b")))),
    ).toBe("(ab)*");
    expect(regexToString(null)).toBe("ε");
  });

  it("NFA matches the expected language", () => {
    const nfa = buildNfa(re);
    expect(nfaMatches(nfa, "ab")).toBe(true);
    expect(nfaMatches(nfa, "aab")).toBe(true);
    expect(nfaMatches(nfa, "babab")).toBe(true);
    expect(nfaMatches(nfa, "")).toBe(false);
    expect(nfaMatches(nfa, "ba")).toBe(false);
    expect(nfaMatches(buildNfa(null), "")).toBe(true);
    expect(nfaMatches(buildNfa(null), "a")).toBe(false);
  });

  it("NFA states and edges have unique ids", () => {
    const nfa = buildNfa(re);
    const ids = [...nfa.states.map((s) => s.id), ...nfa.edges.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("DFA agrees with NFA", () => {
    const nfa = buildNfa(re);
    const dfa = buildDfa(nfa, ["a", "b"]);
    for (const s of ["", "a", "ab", "aab", "ba", "abab", "bbab"]) {
      let cur: string | undefined = dfa.start;
      for (const c of s) {
        const e = dfa.edges.find((e) => e.from === cur && e.labels.includes(c));
        cur = e?.to;
        if (!cur) break;
      }
      const accepted = cur
        ? dfa.states.find((st) => st.id === cur)!.accept
        : false;
      expect(accepted).toBe(nfaMatches(nfa, s));
    }
  });

  it("removeNode collapses single-child containers", () => {
    const r = removeNode(re, "a1")!;
    expect(regexToString(r)).toBe("b*ab");
    expect(removeNode(star("s", chr("a", "a")), "a")).toBe(null);
  });

  it("placement targets and star wrapping", () => {
    const targets = placementTargets(chr("x", "a"), chr("y", "b"), {
      concat: "c",
      alt: "l",
    });
    expect(new Set(targets.map((t) => regexToString(t)))).toEqual(
      new Set(["a|b", "ab", "b|a", "ba"]),
    );
    expect(regexToString(wrapInStar(re, "a2", "s2"))).toBe("(a|b)*a*b");
  });
});
