#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const indexPath = path.join(distDir, "index.html");

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function collectAssetFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      collectAssetFiles(fullPath, out);
    } else if (/\.(js|css)$/i.test(entry)) {
      out.push(fullPath);
    }
  }
  return out;
}

function fail(message) {
  console.error(`\n[parity-check] ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail("Missing dist folder. Run `npm run build` first.");
}

if (!existsSync(indexPath)) {
  fail("Missing dist/index.html. Build output is incomplete.");
}

const indexHtml = readFileSync(indexPath, "utf8");
if (!/assets\/.+\.js/.test(indexHtml)) {
  fail("No production JS bundles referenced in dist/index.html.");
}
if (!/assets\/.+\.css/.test(indexHtml)) {
  fail("No production CSS bundles referenced in dist/index.html.");
}
if (/src\/main\.tsx/.test(indexHtml)) {
  fail("dist/index.html still points to src/main.tsx (looks like dev HTML, not production build).");
}

const assetFiles = collectAssetFiles(path.join(distDir, "assets"));
if (assetFiles.length === 0) {
  fail("No JS/CSS files found under dist/assets.");
}

const signature = assetFiles
  .sort((a, b) => a.localeCompare(b))
  .map((filePath) => {
    const relative = path.relative(distDir, filePath).replace(/\\/g, "/");
    return `${relative}:${sha256(filePath)}`;
  })
  .join("\n");

console.log("[parity-check] Build assets verified.");
console.log(`[parity-check] Files checked: ${assetFiles.length}`);
console.log("[parity-check] Bundle signature:");
console.log(signature);
