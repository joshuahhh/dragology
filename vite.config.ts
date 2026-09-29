/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

import { defineConfig } from "vite";
import { qrcode } from "vite-plugin-qrcode";
import { reactProd } from "./vite-plugin-react-prod";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

const gitIgnored = execSync(
  "git ls-files --others --ignored --exclude-standard --directory",
)
  .toString()
  .trim()
  .split("\n")
  .map((p) => (p.endsWith("/") ? `${p}**` : p));

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-demo",
  },
  resolve: {
    alias: {
      "#dragology-built": new URL("dist-lib/index.js", import.meta.url)
        .pathname,
    },
  },
  plugins: [react(), reactProd(), tailwindcss(), qrcode()],
  test: {
    // The fuzz tests (src/fuzz) take minutes; they only run via
    // `pnpm fuzz` (which sets FUZZ=1), not on every `pnpm test`.
    exclude: [...gitIgnored, ...(process.env.FUZZ ? [] : ["src/fuzz/**"])],
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.app.json",
    },
  },
  define: {
    "process.env": {},
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});
