#!/bin/bash
set -e

# Bundle JS, then strip comments via esbuild
vite build -c vite.config.lib.ts
npx esbuild dist-lib/index.js --outfile=dist-lib/index.js --allow-overwrite --minify-syntax --minify-whitespace

# Bundle .d.ts
dts-bundle-generator --project tsconfig.app.json -o dist-lib/index.d.ts src/lib.ts

# Append the React SVGAttributes module augmentation.
# dts-bundle-generator doesn't handle module augmentations (global side effects,
# not exports), so we append jsx.d.ts with its imports stripped (the types it
# references are already declared in index.d.ts).
sed '/^import/d' src/jsx.d.ts >> dist-lib/index.d.ts
