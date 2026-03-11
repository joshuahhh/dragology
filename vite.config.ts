/// <reference types="vitest/config" />
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import gitignore from "parse-gitignore";
import { defineConfig, type Plugin } from "vite";
import { qrcode } from "vite-plugin-qrcode";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

const { patterns } = gitignore.parse(readFileSync(".gitignore"));
const gitignoreExclude = patterns.map((p: string) => `**/${p}/**`);

/**
 * Virtual import plugin for type definitions.
 *
 * - `dts:@types/react/index.d.ts`  → inlines a .d.ts from node_modules
 * - `dts-bundle:src/docs/foo.ts`   → runs dts-bundle-generator on a barrel file
 */
function dtsPlugin(): Plugin {
  return {
    name: "dts",
    resolveId(id) {
      if (id.startsWith("dts:") || id.startsWith("dts-bundle:")) return id;
    },
    async load(id) {
      if (id.startsWith("dts-bundle:")) {
        const { generateDtsBundle } = await import("dts-bundle-generator");
        const path = await import("node:path");
        const filePath = path.resolve(id.slice("dts-bundle:".length));
        const [result] = generateDtsBundle(
          [{ filePath, output: { noBanner: true } }],
          { preferredConfigPath: path.resolve("tsconfig.app.json") },
        );
        return `export default ${JSON.stringify(result)};`;
      }
      if (id.startsWith("dts:")) {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const { createRequire } = await import("node:module");
        const nodeRequire = createRequire(import.meta.url);
        // Resolve the package directory via package.json (always exported),
        // then join the subpath to bypass exports map restrictions.
        const spec = id.slice(4);
        const slashIdx = spec.startsWith("@")
          ? spec.indexOf("/", spec.indexOf("/") + 1)
          : spec.indexOf("/");
        const pkgName = spec.slice(0, slashIdx);
        const subpath = spec.slice(slashIdx + 1);
        const pkgJson = nodeRequire.resolve(`${pkgName}/package.json`);
        const resolved = path.join(path.dirname(pkgJson), subpath);
        return `export default ${JSON.stringify(fs.readFileSync(resolved, "utf-8"))};`;
      }
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-demo",
  },
  plugins: [
    dtsPlugin(),
    {
      enforce: "pre",
      ...mdx({
        providerImportSource: "@mdx-js/react",
      }),
    },
    react(),
    tailwindcss(),
    qrcode(),
  ],
  test: {
    exclude: gitignoreExclude,
  },
  define: {
    "process.env": {},
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});
