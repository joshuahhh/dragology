#!/usr/bin/env bash
# Snapshots the slideshow's content slides for the outline page
# (/#/slideshow-outline), using a headless browser on a running dev server.
# The dev server runs it itself while an outline page is open
# (vite-plugin-slide-snapshots.ts); to run it by hand:
#
#   src/slideshow/snapshot-slides.sh <dev server url>
set -euo pipefail

BASE_URL="${1:?usage: $0 <dev server url>}"
BASE_URL="${BASE_URL%/}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# Its own browser session, so that runs at the same time don't collide.
SESSION="slide-snapshots-$$"

OUT="$ROOT/public/slides/thumbs"
mkdir -p "$OUT"

TMP="$(mktemp -d)"
CODE="$TMP/snapshot.js"
trap 'rm -rf "$TMP"' EXIT
cat > "$CODE" <<EOF
async (page) => {
  const base = $(jq -n --arg s "$BASE_URL" '$s');
  const tmp = $(jq -n --arg s "$TMP" '$s');
  // Stages are 960×540 (half size), stacked down the page.
  await page.setViewportSize({ width: 960, height: 540 });
  // The query string makes this a fresh page load, even if the page is open.
  await page.goto(base + "/?" + Date.now() + "#/slideshow-snapshot");
  await page.locator("[data-slide]").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    );
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  });
  // One screenshot of the whole page, cut into slides below, is much faster
  // than a screenshot per slide.
  await page.screenshot({ path: tmp + "/all.png", fullPage: true });
  const nums = await page.\$\$eval("[data-slide]", (els) =>
    els.map((el) => el.dataset.slide),
  );
  return nums.join(" ");
}
EOF

# playwright-cli's own logs go in TMP too, rather than the working directory.
export PLAYWRIGHT_MCP_OUTPUT_DIR="$TMP"
playwright-cli -s="$SESSION" open >/dev/null
NUMS="$(playwright-cli -s="$SESSION" run-code --raw --filename="$CODE" | tr -d '"')"
playwright-cli -s="$SESSION" close >/dev/null
[[ -n "$NUMS" ]] || exit 1

# The stages are stacked down the page in order, so tile k is the k-th slide.
magick "$TMP/all.png" -crop 960x540 +repage -quality 85 "$TMP/tile-%d.jpg"
rm -f "$OUT"/*.jpg
k=0
for n in $NUMS; do
  mv "$TMP/tile-$k.jpg" "$OUT/$n.jpg"
  k=$((k + 1))
done

# The manifest is what the outline page reads: it lists each snapshot with a
# hash of its contents, so the page only reloads images that changed.
for n in $NUMS; do
  jq -n --arg k "$n" --arg h "$(shasum "$OUT/$n.jpg" | cut -c1-10)" \
    '{($k): $h}'
done | jq -s 'add // {}' > "$TMP/thumbs.json"
cmp -s "$TMP/thumbs.json" "$HERE/thumbs.json" ||
  cp "$TMP/thumbs.json" "$HERE/thumbs.json"
echo "Snapshotted slides $NUMS"
