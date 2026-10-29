/** A one-line `initialState` declaration at the top, and the space after it. */
const INITIAL_STATE_LINE = /^const initialState\b[^\n]*;[ \t]*\n\s*/;

/**
 * Formats live TSX with Prettier at a given width. A one-line
 * `initialState` declaration at the top is left as written, however
 * long, so the state reads at a glance while the code below it wraps.
 */
export async function formatCode(
  code: string,
  cursorOffset: number,
  printWidth: number,
): Promise<{ formatted: string; cursorOffset: number }> {
  const head = code.match(INITIAL_STATE_LINE)?.[0] ?? "";
  if (head && code.length > head.length) {
    const tail = await formatWhole(
      code.slice(head.length),
      Math.max(cursorOffset - head.length, 0),
      printWidth,
    );
    return {
      formatted: head + tail.formatted,
      cursorOffset:
        cursorOffset < head.length
          ? cursorOffset
          : head.length + tail.cursorOffset,
    };
  }
  return formatWhole(code, cursorOffset, printWidth);
}

/** Prettier is loaded on first use to keep it out of the main bundle. */
async function formatWhole(
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
  return joinLoneChildren(
    result.formatted.trimEnd(),
    Math.min(result.cursorOffset, result.formatted.length),
  );
}

/**
 * An element whose attributes Prettier broke over lines, ending in a `>`
 * on its own line, followed by a lone one-line `{…}` child and the
 * closing tag.
 */
const LONE_CHILD = /(\n[ \t]*>)\n[ \t]*(\{[^\n]*\})\n[ \t]*(<\/[\w.]*>)/g;

/**
 * Pulls a lone `{…}` child and its closing tag up onto the line of the
 * opening tag's `>`, so with its styling folded the element reads as one
 * line, `<text …>{bead}</text>`, rather than three. (JSX drops whitespace
 * that includes a newline around children, so the code means the same.)
 */
function joinLoneChildren(
  code: string,
  cursorOffset: number,
): { formatted: string; cursorOffset: number } {
  let formatted = "";
  let newCursor = cursorOffset;
  let last = 0;
  for (const m of code.matchAll(LONE_CHILD)) {
    const [whole, open, child, close] = m;
    const start = m.index;
    const end = start + whole.length;
    const joined = open + child + close;
    formatted += code.slice(last, start) + joined;
    if (cursorOffset >= end) {
      newCursor -= whole.length - joined.length;
    } else if (cursorOffset > start) {
      newCursor = formatted.length - joined.length + open.length;
    }
    last = end;
  }
  formatted += code.slice(last);
  return { formatted, cursorOffset: newCursor };
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
