#!/usr/bin/env bash
set -euo pipefail

# Deploy an anonymized snapshot of this repo to the anonymous org repo.
# Usage: ./deploy-anon.sh
#
# Prerequisites:
#   1. Create a GitHub org and repo (e.g., org-name/demo)
#   2. Set ANON_REMOTE below (or pass as env var)
#   3. Enable GitHub Pages in the org repo (source: GitHub Actions)
#
# What this does:
#   - Copies the working tree (no .git history) to a temp dir
#   - Creates a single anonymous commit
#   - Force-pushes to the org repo's main branch
#   - The existing GitHub Action builds and deploys to Pages

ANON_REMOTE="${ANON_REMOTE:-git@github.com:declarative-dragging/dragology.git}"

if [[ "$ANON_REMOTE" == *"ORG_NAME"* ]]; then
  echo "Error: Set ANON_REMOTE first."
  echo "  Either edit this script or run:"
  echo "  ANON_REMOTE=git@github.com:your-org/your-repo.git ./deploy-anon.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR="$(mktemp -d)"

echo "Copying source to temp dir..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist-demo' \
  --exclude='dist-lib' \
  --exclude='.DS_Store' \
  "$SCRIPT_DIR/" "$TEMP_DIR/"

cd "$TEMP_DIR"

echo "Creating anonymized commit..."
git init -b main
git add -A

GIT_AUTHOR_NAME="Anonymous" \
GIT_AUTHOR_EMAIL="anonymous@example.com" \
GIT_COMMITTER_NAME="Anonymous" \
GIT_COMMITTER_EMAIL="anonymous@example.com" \
git commit -m "Update site $(date +%Y-%m-%d)"

echo "Pushing to $ANON_REMOTE ..."
git remote add origin "$ANON_REMOTE"
git push -f origin main

echo "Cleaning up..."
rm -rf "$TEMP_DIR"

echo "Done! The GitHub Action will build and deploy shortly."
