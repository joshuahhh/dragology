#!/usr/bin/env bash
set -euo pipefail

# Build an anonymized supplement zip for paper submission.
# Usage: ./build-supplement-zip.sh
#
# Produces: supplement.zip containing:
#   README.md                  — table of contents
#   dragology/                 — anonymized copy of this repo (the library + demo site)
#   dragology-comparison/      — anonymized copy of the framework comparison experiment

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# NOTE: Expects dragology-comparison repo to be cloned as a sibling directory.
# Override with COMPARISON_DIR=/path/to/repo if it lives elsewhere.
COMPARISON_DIR="${COMPARISON_DIR:-$SCRIPT_DIR/../dragology-comparison}"
OUT_DIR="$(mktemp -d)"
ZIP_NAME="declarative-dragging-supplement-$(date +%Y-%m-%d-%H%M).zip"

echo "Building supplement in $OUT_DIR ..."

# --- 1. Copy this repo (anonymized) ---
echo "Copying dragology source..."
mkdir -p "$OUT_DIR/dragology"
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist-demo' \
  --exclude='dist-lib' \
  --exclude='.DS_Store' \
  "$SCRIPT_DIR/" "$OUT_DIR/dragology/"

# --- 2. Copy comparison repo (anonymized) ---
echo "Copying dragology-comparison source..."
if [ ! -d "$COMPARISON_DIR" ]; then
  echo "Error: Comparison repo not found at $COMPARISON_DIR"
  echo "  Set COMPARISON_DIR to the path of the dragology-comparison repo."
  exit 1
fi
mkdir -p "$OUT_DIR/dragology-comparison"
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  "$COMPARISON_DIR/" "$OUT_DIR/dragology-comparison/"

# --- 3. Write README ---
echo "Writing README..."
cat > "$OUT_DIR/README.md" << 'EOF'
# Declarative Dragging Supplementary Material

This archive contains two folders:

## dragology/

The Dragology library and companion website, including all demos and study
tasks discussed in the paper. This is the source for the explorable supplement
at https://declarative-dragging.github.io/.

To run locally:

```bash
cd dragology
npm install
npm run dev
```

Then open http://localhost:5173.

## dragology-comparison/

Infrastructure and results for the framework comparison experiment described
in Appendix C. Contains trial scaffolding, 35 trial outputs (7 conditions
x 5 trials), built trial apps, analysis notebook, and the resulting figure.

See `dragology-comparison/README.md` for full details on reproducing the
experiment.
EOF

# --- 4. Zip ---
echo "Creating zip..."
cd "$OUT_DIR"
zip -r -q "$SCRIPT_DIR/$ZIP_NAME" .

echo "Cleaning up..."
rm -rf "$OUT_DIR"

echo "Done! Created $SCRIPT_DIR/$ZIP_NAME"
