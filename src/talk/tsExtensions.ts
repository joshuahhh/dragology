import {
  Completion,
  CompletionContext,
  CompletionResult,
  snippet,
} from "@codemirror/autocomplete";
import { Diagnostic, linter } from "@codemirror/lint";
import { Extension, Text } from "@codemirror/state";
import { hoverTooltip, ViewPlugin } from "@codemirror/view";
import * as Comlink from "comlink";
import type { CompletionEntry, Details, TsService } from "./tsService";

// Completion, hover types, and type errors from TypeScript's language
// service, which runs in a worker (started on first use, and shared by
// every editor).

let service: Comlink.Remote<TsService> | null = null;

function getService() {
  service ??= Comlink.wrap<TsService>(
    new Worker(new URL("./tsWorker.ts", import.meta.url), { type: "module" }),
  );
  return service;
}

/** Keeps the service's copy of the code (after `prelude()`) current. */
export function tsSync(prelude: () => string): Extension {
  return ViewPlugin.define((view) => {
    const send = (doc: Text) =>
      void getService().update(prelude(), doc.toString());
    send(view.state.doc);
    return {
      update(update) {
        if (update.docChanged) send(update.state.doc);
      },
    };
  });
}

/** TypeScript snippet syntax (`$1`, `${1:x}`) as CodeMirror's (`${x}`). */
function toCodeMirrorSnippet(text: string): string {
  return text.replace(
    /\$\{\d+:([^}]*)\}|\$\{\d+\}|\$\d+/g,
    (_, placeholder) => `\${${placeholder ?? ""}}`,
  );
}

function renderDetails({ signature, documentation }: Details): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-ts-details";
  const pre = dom.appendChild(document.createElement("pre"));
  pre.className = "cm-ts-signature";
  pre.textContent = signature;
  if (documentation) {
    dom.appendChild(document.createElement("div")).textContent = documentation;
  }
  return dom;
}

function toCompletion(entry: CompletionEntry, pos: number): Completion {
  return {
    label: entry.name,
    // Lower sortText sorts first: locals, then members, then globals.
    boost: -Number(entry.sortText) || 0,
    apply: entry.snippet
      ? snippet(toCodeMirrorSnippet(entry.snippet))
      : undefined,
    info: async () => {
      const details = await getService().details(pos, entry);
      return details && renderDetails(details);
    },
  };
}

export async function tsCompletions(
  ctx: CompletionContext,
): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/\w*/)!;
  const afterDot = ctx.state.sliceDoc(word.from - 1, word.from) === ".";
  if (word.from === word.to && !afterDot && !ctx.explicit) return null;
  const entries = await getService().completions(ctx.pos);
  if (!entries || ctx.aborted) return null;
  return {
    from: word.from,
    options: entries.map((e) => toCompletion(e, ctx.pos)),
    validFor: /^\w*$/,
  };
}

export const tsHover = hoverTooltip(async (_view, pos) => {
  const hover = await getService().hover(pos);
  if (!hover) return null;
  return {
    pos: hover.from,
    end: hover.to,
    create: () => ({ dom: renderDetails(hover) }),
  };
});

export const tsLinter = linter(async (view): Promise<Diagnostic[]> => {
  const diagnostics = await getService().diagnostics();
  // The doc may have changed while the service worked.
  const length = view.state.doc.length;
  return diagnostics.map((d) => ({
    ...d,
    from: Math.min(d.from, length),
    to: Math.min(d.to, length),
  }));
});
