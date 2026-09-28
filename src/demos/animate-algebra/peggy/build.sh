#!/usr/bin/env bash
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"
export PATH="$(pnpm bin):$PATH"

case "${1:-build}" in
  build)
    peggy --format es --plugin ts-pegjs --extra-options-file pattern.options.json -o pattern.ts pattern.peggy
    ;;
  watch)
    ls pattern.peggy pattern.options.json | entr -c "$SELF" build
    ;;
  *)
    echo "Usage: $0 [build|watch]" >&2
    exit 1
    ;;
esac
