import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";

const ID = "virtual:live-types";
const SCOPE = "src/talk/scope.ts";

/**
 * The type declarations the live-coding editor's TypeScript service runs
 * on, as `virtual:live-types`: a map from path (in the service's virtual
 * file system) to contents. It has TypeScript's own libs, React's, lodash's
 * and immer's types, and `dragology-live`, the types of the names live code
 * gets for free (`src/talk/scope.ts`).
 */
export function liveTypes(): Plugin {
  return {
    name: "live-types",
    resolveId(id) {
      if (id === ID) return "\0" + ID;
    },
    async load(id) {
      if (id !== "\0" + ID) return;
      const files: Record<string, string> = {};

      const tsLib = path.dirname(packageFile("typescript", "lib/lib.d.ts"));
      for (const name of fs.readdirSync(tsLib)) {
        if (/^lib\.(es|dom|decorators).*\.d\.ts$/.test(name)) {
          files[`/${name}`] = read(path.join(tsLib, name));
        }
      }

      for (const name of ["index", "global", "jsx-runtime"]) {
        addPackageFile(files, "@types/react", `${name}.d.ts`);
      }
      // React's dependency, not ours, so it's resolved from React's types.
      files["/node_modules/csstype/index.d.ts"] = read(
        packageFile(
          "csstype",
          "index.d.ts",
          packageFile("@types/react", "package.json"),
        ),
      );
      addPackageFile(files, "@types/lodash", "index.d.ts");
      const lodashCommon = path.dirname(
        packageFile("@types/lodash", "common/common.d.ts"),
      );
      for (const name of fs.readdirSync(lodashCommon)) {
        addPackageFile(files, "@types/lodash", `common/${name}`);
      }
      files["/node_modules/immer/index.d.ts"] = read(
        packageFile("immer", "dist/immer.d.ts"),
      );

      const dir = "/node_modules/dragology-live";
      const { declarations, sources } = scopeDeclarations();
      for (const [file, text] of Object.entries(declarations)) {
        files[`${dir}/${file}`] = text;
      }
      files[`${dir}/index.d.ts`] = [
        // Not imported by scope.ts's declarations, but its module
        // augmentation (`dragologyOnDrag` etc.) is needed.
        `/// <reference path="./src/jsx.d.ts" />`,
        `export * from "./${SCOPE.replace(/\.ts$/, "")}";`,
      ].join("\n");
      for (const source of sources) this.addWatchFile(source);

      return `export default ${JSON.stringify(files)};`;
    },
  };
}

/**
 * Declarations for `SCOPE` and the source files it imports, by path
 * relative to the project, from TypeScript's own declaration emit (which
 * keeps doc comments, unlike dts-bundle-generator), plus `sources`, the
 * files they come from.
 */
function scopeDeclarations(): {
  declarations: Record<string, string>;
  sources: string[];
} {
  const root = path.resolve(".");
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(root, "tsconfig.app.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
  )!;
  // Never written to: `emit` hands the files to the callback.
  const outDir = path.join(root, "live-types");
  const program = ts.createProgram([path.join(root, SCOPE)], {
    ...config.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: root,
    outDir,
  });
  const declarations: Record<string, string> = {};
  program.emit(
    undefined,
    (file, text) => {
      declarations[path.relative(outDir, file)] = text;
    },
    undefined,
    true,
  );
  const sources = program
    .getSourceFiles()
    .map((f) => f.fileName)
    .filter((f) => !f.includes("/node_modules/"));
  // Already a declaration file, so not emitted.
  declarations["src/jsx.d.ts"] = read(path.join(root, "src/jsx.d.ts"));
  return { declarations, sources };
}

/**
 * A file in a package installed for `from`, past the package's `exports`
 * restrictions.
 */
function packageFile(
  pkg: string,
  subpath: string,
  from = import.meta.url,
): string {
  const pkgJson = createRequire(from).resolve(`${pkg}/package.json`);
  return path.join(path.dirname(pkgJson), subpath);
}

function addPackageFile(
  files: Record<string, string>,
  pkg: string,
  subpath: string,
) {
  files[`/node_modules/${pkg}/${subpath}`] = read(packageFile(pkg, subpath));
}

function read(file: string): string {
  return fs.readFileSync(file, "utf-8");
}
