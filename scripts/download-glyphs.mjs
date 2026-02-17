#!/usr/bin/env node
// scripts/download-glyphs.mjs
//
// Downloads glyph PBF files for offline MapLibre rendering.
// Uses the OpenMapTiles public font CDN (no API key needed).
//
// Run from project root:
//   node scripts/download-glyphs.mjs

import { mkdirSync, writeFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { get } from "https";

// ── Config ───────────────────────────────────────────────────────────
const OUT_DIR = join(process.cwd(), "public", "offline", "glyphs");

// These must match the font names in your style JSON "text-font" arrays.
// Your styles use: ["Open Sans Regular", "Arial Unicode MS Regular"]
//
// The OpenMapTiles CDN uses these exact names:
const FONTS = [
  "Open Sans Regular",
  "Arial Unicode MS Regular",
];

// Glyph CDN sources to try (in order of preference)
const CDN_SOURCES = [
  // OpenMapTiles free font server
  (font, range) =>
    `https://fonts.openmaptiles.org/${encodeURIComponent(font)}/${range}.pbf`,
  // MapTiler free tier (no key needed for fonts)
  (font, range) =>
    `https://api.maptiler.com/fonts/${encodeURIComponent(font)}/${range}.pbf`,
  // MapLibre demo server
  (font, range) =>
    `https://demotiles.maplibre.org/font/${encodeURIComponent(font)}/${range}.pbf`,
];

// Glyph ranges: 0-255, 256-511, ..., 65280-65535
const RANGES = [];
for (let i = 0; i < 256; i++) {
  const start = i * 256;
  const end = start + 255;
  RANGES.push(`${start}-${end}`);
}

// ── Download helper ──────────────────────────────────────────────────

function download(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, { timeout: 15000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume(); // drain
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function downloadWithFallback(font, range) {
  for (const makeUrl of CDN_SOURCES) {
    const url = makeUrl(font, range);
    try {
      const buf = await download(url);
      // Validate: PBF files should be at least a few bytes
      if (buf.length > 10) return buf;
    } catch {
      // Try next CDN
    }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Downloading MapLibre glyphs for offline use ===\n");

  let totalBytes = 0;
  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalEmpty = 0;

  for (const font of FONTS) {
    const dir = join(OUT_DIR, font);
    mkdirSync(dir, { recursive: true });

    console.log(`Font: ${font}`);

    let downloaded = 0;
    let skipped = 0;
    let empty = 0;

    // Process in batches of 10 to avoid hammering the server
    for (let batch = 0; batch < RANGES.length; batch += 10) {
      const batchRanges = RANGES.slice(batch, batch + 10);
      const results = await Promise.allSettled(
        batchRanges.map(async (range) => {
          const outFile = join(dir, `${range}.pbf`);

          // Skip if already downloaded and non-empty
          if (existsSync(outFile)) {
            try {
              const stat = statSync(outFile);
              if (stat.size > 10) {
                skipped++;
                totalBytes += stat.size;
                return "skipped";
              }
            } catch {}
          }

          const buf = await downloadWithFallback(font, range);
          if (buf && buf.length > 10) {
            writeFileSync(outFile, buf);
            downloaded++;
            totalBytes += buf.length;
            return "downloaded";
          } else {
            // Some Unicode ranges legitimately have no glyphs
            // Write a minimal valid protobuf (empty message)
            writeFileSync(outFile, Buffer.alloc(0));
            empty++;
            return "empty";
          }
        })
      );

      // Progress dot every 10 ranges
      process.stdout.write(".");
    }

    console.log(""); // newline after dots
    console.log(`  Downloaded: ${downloaded}, Skipped: ${skipped}, Empty ranges: ${empty}`);

    totalDownloaded += downloaded;
    totalSkipped += skipped;
    totalEmpty += empty;
  }

  const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(`\n=== Done ===`);
  console.log(`Total: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalEmpty} empty`);
  console.log(`Size: ${sizeMB} MB in ${OUT_DIR}`);

  if (totalDownloaded === 0 && totalSkipped === 0) {
    console.error("\n⚠️  No glyphs were downloaded! Check your network connection.");
    console.error("   The font CDN may be temporarily unavailable.");
    console.error("   Try running again in a minute.\n");
    process.exit(1);
  }

  console.log("\nThese files ship inside your app's static export.");
  console.log("MapLibre will load them from /offline/glyphs/ when offline.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
