// TypeScript's language service, run on the live-coding editor's code (in
// a worker; see tsWorker.ts). The service sees a file that wraps the
// editor's code (see `update`), so positions are translated on the way in.

import {
  createSystem,
  createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import ts from "typescript";
import types from "virtual:live-types";

const FILE = "/live.tsx";
const SCOPE_MODULE = "dragology-live";

// The file starts out importing the scope module, so `header` can read the
// module's exports.
const env = createVirtualTypeScriptEnvironment(
  createSystem(
    new Map([...Object.entries(types), [FILE, `import "${SCOPE_MODULE}";`]]),
  ),
  [FILE],
  ts,
  {
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    // So the code's top-level names don't clash with the DOM's globals.
    moduleDetection: ts.ModuleDetectionKind.Force,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    // Live code is mostly unannotated.
    noImplicitAny: false,
    skipLibCheck: true,
    noEmit: true,
  },
);

/** Live code gets every name `src/talk/scope.ts` exports, unimported. */
const header = (() => {
  const program = env.languageService.getProgram()!;
  const checker = program.getTypeChecker();
  const scopeFile = program.getSourceFile(
    `/node_modules/${SCOPE_MODULE}/index.d.ts`,
  )!;
  const names = checker
    .getExportsOfModule(checker.getSymbolAtLocation(scopeFile)!)
    .map((s) => s.name);
  return `import { ${names.join(", ")} } from "${SCOPE_MODULE}";\n`;
})();

/**
 * The file is `header`, the prelude, then the code, with `draggable`'s
 * props typed if the code doesn't type them (so `d.` and `state.`
 * complete): `insertLen` characters inserted at `insertAt` in the code.
 */
let layout = { codeStart: 0, insertAt: Infinity, insertLen: 0 };

function toFile(pos: number): number {
  const { codeStart, insertAt, insertLen } = layout;
  return codeStart + pos + (pos > insertAt ? insertLen : 0);
}

/** Null for positions in the header or prelude. */
function fromFile(pos: number): number | null {
  const { codeStart, insertAt, insertLen } = layout;
  const p = pos - codeStart;
  if (p < 0) return null;
  if (p > insertAt + insertLen) return p - insertLen;
  return Math.min(p, insertAt);
}

/** A span of the file, in the code, if it's all in the code. */
function spanFromFile(
  start: number,
  length: number,
): { from: number; to: number } | null {
  const from = fromFile(start);
  const to = fromFile(start + length);
  return from === null || to === null ? null : { from, to };
}

/** Where to type `draggable`'s props, and as what. */
function propsAnnotation(code: string): { at: number; text: string } | null {
  const source = ts.createSourceFile(
    "code.tsx",
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const stateType = "typeof initialState";
  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === "draggable") {
      const props = stmt.parameters[0];
      if (!props || props.type) return null;
      return {
        at: props.end,
        text: `: import("${SCOPE_MODULE}").DraggableProps<${stateType}>`,
      };
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== "draggable")
          continue;
        if (decl.type) return null;
        return {
          at: decl.name.end,
          text: `: import("${SCOPE_MODULE}").Draggable<${stateType}>`,
        };
      }
    }
  }
  return null;
}

export type CompletionEntry = {
  name: string;
  sortText: string;
  /** In TypeScript's snippet syntax (e.g. `onClick={$1}`). */
  snippet?: string;
  source?: string;
  data?: ts.CompletionEntryData;
};

export type Details = { signature: string; documentation: string };

export type Hover = Details & { from: number; to: number };

export type Diagnostic = {
  from: number;
  to: number;
  message: string;
  severity: "error" | "warning";
};

/**
 * `documentation`, or else the docs of the function `symbol` holds: the
 * spec builder's `d.closest` is a getter returning the documented
 * `closest` function, and the getter itself has no docs.
 */
function documentationOf(
  documentation: ts.SymbolDisplayPart[] | undefined,
  symbol: ts.Symbol | undefined,
): string {
  const own = ts.displayPartsToString(documentation);
  if (own || !symbol) return own;
  const checker = env.languageService.getProgram()!.getTypeChecker();
  const [signature] = checker.getTypeOfSymbol(symbol).getCallSignatures();
  return signature
    ? ts.displayPartsToString(signature.getDocumentationComment(checker))
    : "";
}

/** The innermost node of the file starting at or containing `pos`. */
function nodeAt(pos: number): ts.Node {
  const file = env.getSourceFile(FILE)!;
  let node: ts.Node = file;
  for (;;) {
    const child = node.forEachChild((c) =>
      c.getStart(file) <= pos && pos < c.end ? c : undefined,
    );
    if (!child) return node;
    node = child;
  }
}

export const tsService = {
  update(prelude: string, code: string) {
    const annotation = propsAnnotation(code);
    const codeStart = header.length + prelude.length + 1;
    layout = annotation
      ? {
          codeStart,
          insertAt: annotation.at,
          insertLen: annotation.text.length,
        }
      : { codeStart, insertAt: Infinity, insertLen: 0 };
    const annotated = annotation
      ? code.slice(0, annotation.at) +
        annotation.text +
        code.slice(annotation.at)
      : code;
    env.updateFile(FILE, `${header}${prelude}\n${annotated}`);
  },

  completions(pos: number): CompletionEntry[] | null {
    const info = env.languageService.getCompletionsAtPosition(
      FILE,
      toFile(pos),
      {
        includeCompletionsWithInsertText: true,
        includeCompletionsWithSnippetText: true,
        jsxAttributeCompletionStyle: "braces",
      },
    );
    if (!info) return null;
    return info.entries
      .filter((e) => e.kind !== ts.ScriptElementKind.warning)
      .map((e) => ({
        name: e.name,
        sortText: e.sortText,
        snippet: e.isSnippet ? e.insertText : undefined,
        source: e.source,
        data: e.data,
      }));
  },

  details(pos: number, entry: CompletionEntry): Details | null {
    const details = env.languageService.getCompletionEntryDetails(
      FILE,
      toFile(pos),
      entry.name,
      undefined,
      entry.source,
      undefined,
      entry.data,
    );
    if (!details) return null;
    const symbol = env.languageService.getCompletionEntrySymbol(
      FILE,
      toFile(pos),
      entry.name,
      entry.source,
    );
    return {
      signature: ts.displayPartsToString(details.displayParts),
      documentation: documentationOf(details.documentation, symbol),
    };
  },

  hover(pos: number): Hover | null {
    const info = env.languageService.getQuickInfoAtPosition(FILE, toFile(pos));
    const span =
      info && spanFromFile(info.textSpan.start, info.textSpan.length);
    if (!span) return null;
    const checker = env.languageService.getProgram()!.getTypeChecker();
    const symbol = checker.getSymbolAtLocation(nodeAt(info.textSpan.start));
    return {
      ...span,
      signature: ts.displayPartsToString(info.displayParts),
      documentation: documentationOf(info.documentation, symbol),
    };
  },

  diagnostics(): Diagnostic[] {
    const service = env.languageService;
    return [
      ...service.getSyntacticDiagnostics(FILE),
      ...service.getSemanticDiagnostics(FILE),
    ].flatMap((d) => {
      const span =
        d.start === undefined ? null : spanFromFile(d.start, d.length ?? 0);
      if (!span) return [];
      return [
        {
          ...span,
          message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
          severity:
            d.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
        },
      ];
    });
  },
};

export type TsService = typeof tsService;
