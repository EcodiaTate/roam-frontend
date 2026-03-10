#!/usr/bin/env bash
#
# download-glyphs.sh
#
# Downloads glyph PBF files from MapLibre's demo tile server
# for the two fontstack names used in Roam's style JSON:
#   - "Open Sans Regular"
#   - "Arial Unicode MS Regular"
#
# The glyph ranges are 0-255, 256-511, ..., 65280-65535 (256 files per font).
# Total size: ~8-12 MB
#
# Output directory structure:
#   public/offline/glyphs/Open Sans Regular/0-255.pbf
#   public/offline/glyphs/Open Sans Regular/256-511.pbf
#   ...
#   public/offline/glyphs/Arial Unicode MS Regular/0-255.pbf
#   ...
#
# Run from your frontend project root:
#   chmod +x scripts/download-glyphs.sh
#   ./scripts/download-glyphs.sh

set -euo pipefail

BASE_URL="https://demotiles.maplibre.org/font"
OUT_DIR="public/offline/glyphs"

FONTS=(
  "Open Sans Regular"
  "Arial Unicode MS Regular"
)

# 256 ranges: 0-255, 256-511, ..., 65280-65535
RANGES=()
for ((i=0; i<256; i++)); do
  start=$((i * 256))
  end=$((start + 255))
  RANGES+=("${start}-${end}")
done

echo "=== Downloading MapLibre glyphs for offline use ==="
echo "Output: ${OUT_DIR}"
echo ""

for font in "${FONTS[@]}"; do
  dir="${OUT_DIR}/${font}"
  mkdir -p "${dir}"
  echo "Font: ${font}"
  
  downloaded=0
  skipped=0
  failed=0
  
  for range in "${RANGES[@]}"; do
    outfile="${dir}/${range}.pbf"
    
    # Skip if already downloaded
    if [[ -f "${outfile}" && -s "${outfile}" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    
    # URL-encode the font name (spaces → %20)
    encoded_font="${font// /%20}"
    url="${BASE_URL}/${encoded_font}/${range}.pbf"
    
    if curl -sS -f -o "${outfile}" "${url}" 2>/dev/null; then
      downloaded=$((downloaded + 1))
    else
      # Some ranges legitimately don't exist (no glyphs in that Unicode block)
      # Create an empty file so we don't retry
      touch "${outfile}"
      failed=$((failed + 1))
    fi
  done
  
  echo "  Downloaded: ${downloaded}, Skipped: ${skipped}, Empty: ${failed}"
done

# Print total size
total_size=$(du -sh "${OUT_DIR}" 2>/dev/null | cut -f1)
echo ""
echo "=== Done. Total size: ${total_size} ==="
echo ""
echo "These files are bundled in your app's static export."
echo "The local tile server also serves them from device storage."
echo "Both paths work — the app bundle path is the fallback."