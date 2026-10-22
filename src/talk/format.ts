/**
 * Formats live TSX with Prettier at a given width. Prettier is loaded
 * on first use to keep it out of the main bundle.
 */
export async function formatCode(
  code: string,
  cursorOffset: number,
  printWidth: number,
): Promise<{ formatted: string; cursorOffset: number }> {
  const [prettier, typescript, estree] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/estree"),
  ]);
  const result = await prettier.formatWithCursor(code, {
    cursorOffset,
    parser: "typescript",
    filepath: "live.tsx",
    plugins: [typescript, estree],
    printWidth,
    tabWidth: 1,
  });
  // Prettier ends files with a newline, which shows as a blank last line.
  const formatted = result.formatted.trimEnd();
  return {
    formatted,
    cursorOffset: Math.min(result.cursorOffset, formatted.length),
  };
}

/**
 * The smallest single replacement turning `a` into `b`, so a reformat
 * leaves untouched regions (and positions mapped through it) alone.
 */
export function minimalChange(
  a: string,
  b: string,
): { from: number; to: number; insert: string } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }
  return {
    from: start,
    to: a.length - end,
    insert: b.slice(start, b.length - end),
  };
}
