// Set up Monaco to use local bundles (no CDN), with only TypeScript support.
//
// We import the editor core + TS contributions directly from ESM sub-paths
// rather than the top-level "monaco-editor" entry, which would pull in every
// language (~90 syntax grammars, CSS/HTML/JSON workers, etc.).

import { loader, type Monaco } from "@monaco-editor/react";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/editor/editor.all.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as tsContribution from "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
// These use the custom `dts:` / `dts-bundle:` Vite plugins to inline .d.ts files at build time
// @ts-expect-error virtual dts-bundle: import
import libTypesDts from "dts-bundle:src/docs/live-editor-imports.ts";
// @ts-expect-error virtual dts: import
import reactTypesDts from "dts:@types/react/index.d.ts";
// @ts-expect-error virtual dts: import
import reactGlobalDts from "dts:@types/react/global.d.ts";
// @ts-expect-error virtual dts: import
import cssTypeDts from "dts:csstype/index.d.ts";

// editor.api.js doesn't wire up language contributions — editor.main.js does,
// but that also pulls in every language. Do it manually for just TypeScript.
// @ts-expect-error not on the type
monaco.languages.typescript = tsContribution;

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "typescript" || label === "javascript") {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

loader.config({ monaco });

/**
 * Convert the module .d.ts from dts-bundle-generator into ambient
 * declarations suitable for addExtraLib (no imports/exports).
 */
function toAmbient(moduleDts: string): string {
  return moduleDts
    .replace(/^import .*;\n?/gm, "")
    .replace(/^export \{\};\n?/gm, "")
    .replace(/^export declare /gm, "declare ")
    .replace(/^export type /gm, "declare type ")
    .replace(/^export interface /gm, "declare interface ")
    .replace(/^export class /gm, "declare class ")
    .replace(/^export function /gm, "declare function ")
    .replace(/^export const /gm, "declare const ")
    .replace(/React\$1/g, "React");
}

// Configure Monaco's TypeScript defaults once
let monacoConfigured = false;
export function configureMonaco(monaco: Monaco) {
  if (monacoConfigured) return;
  monacoConfigured = true;

  const tsDefaults = monaco.languages.typescript.typescriptDefaults;

  tsDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    // Treat every file as a module so type declarations in one
    // LiveEditor don't leak into others (e.g. duplicate `type State`)
    moduleDetection: 3, // ts.ModuleDetectionKind.Force
    jsx: monaco.languages.typescript.JsxEmit.React,
    jsxFactory: "createElement",
    strict: true,
    noEmit: true,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  } as any);

  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticsOptions: { noSemanticValidation: false },
  });

  // Auto-generated library types (converted from module to ambient)
  tsDefaults.addExtraLib(toAmbient(libTypesDts), "draggable-lib.d.ts");

  // Real React + csstype types so JSX elements have proper types
  tsDefaults.addExtraLib(cssTypeDts, "file:///node_modules/csstype/index.d.ts");
  tsDefaults.addExtraLib(
    reactGlobalDts,
    "file:///node_modules/@types/react/global.d.ts",
  );
  tsDefaults.addExtraLib(
    reactTypesDts,
    "file:///node_modules/@types/react/index.d.ts",
  );
  // Global declarations: JSX bridge, createElement, lodash, immer,
  // and custom SVG attributes (module augmentation from jsx.d.ts
  // isn't emitted by dts-bundle-generator)
  tsDefaults.addExtraLib(
    `
    declare function createElement(...args: any[]): any;
    declare namespace JSX {
      type ElementType = React.JSX.ElementType;
      interface Element extends React.JSX.Element {}
      interface ElementClass extends React.JSX.ElementClass {}
      interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
      interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
      type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
      interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
      interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
      interface IntrinsicElements extends React.JSX.IntrinsicElements {}
    }
    declare namespace React {
      interface SVGAttributes<T> {
        "dragologyOnDrag"?: (() => DragSpec<any>) | false | null | undefined | 0 | "";
        "dragologyZIndex"?: number;
        "dragologyTransition"?: boolean;
      }
    }
    declare const _: {
      range(end: number): number[];
      range(start: number, end: number, step?: number): number[];
      clamp(number: number, lower: number, upper: number): number;
      clamp(number: number, upper: number): number;
      sortBy<T>(collection: T[], iteratee: (value: T) => unknown): T[];
      flatten<T>(array: T[][]): T[];
      chunk<T>(array: T[], size: number): T[][];
      zip<A, B>(a: A[], b: B[]): [A | undefined, B | undefined][];
      sum(values: number[]): number;
      min(values: number[]): number | undefined;
      max(values: number[]): number | undefined;
      uniq<T>(array: T[]): T[];
      groupBy<T>(collection: T[], iteratee: (value: T) => string): Record<string, T[]>;
      mapValues<T, R>(obj: Record<string, T>, fn: (value: T) => R): Record<string, R>;
      [key: string]: (...args: any[]) => any;
    };
    declare function produce<T>(base: T, recipe: (draft: T) => void): T;
    `,
    "globals.d.ts",
  );
}

export type { editor } from "monaco-editor/esm/vs/editor/editor.api.js";
