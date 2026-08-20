import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web/public/icons");
mkdirSync(outDir, { recursive: true });

function calendarSvg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.18 : size * 0.14;
  const inner = size - pad * 2;
  const radius = inner * 0.18;
  const headerH = inner * 0.22;
  const x = pad;
  const y = pad;
  const dots = [];
  const cols = 3;
  const rows = 3;
  const gridTop = y + headerH + inner * 0.1;
  const gridH = inner - headerH - inner * 0.18;
  const cellW = inner / cols;
  const cellH = gridH / rows;
  const r = Math.max(2, inner * 0.035);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = x + cellW * (col + 0.5);
      const cy = gridTop + cellH * (row + 0.5);
      const fill = row === 0 && col === 1 ? "#c43b3a" : "#c7c7cc";
      dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? size * 0.12 : size * 0.22}" fill="#f5f5f7"/>
  <rect x="${x}" y="${y}" width="${inner}" height="${inner}" rx="${radius}" fill="#ffffff"/>
  <path d="M${x} ${y + headerH} H${x + inner} V${y + radius} Q${x + inner} ${y} ${x + inner - radius} ${y} H${x + radius} Q${x} ${y} ${x} ${y + radius} Z" fill="#d95553"/>
  ${dots.join("\n  ")}
</svg>`;
}

async function writePng(name, size, opts) {
  const png = await sharp(Buffer.from(calendarSvg(size, opts)))
    .png()
    .toBuffer();
  writeFileSync(path.join(outDir, name), png);
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-192-maskable.png", 192, { maskable: true });
await writePng("icon-512-maskable.png", 512, { maskable: true });
await writePng("apple-touch-icon.png", 180);

const publicRoot = path.join(root, "web/public");
await sharp(Buffer.from(calendarSvg(180)))
  .png()
  .toFile(path.join(publicRoot, "apple-touch-icon.png"));

console.log("Icons geschrieben nach", outDir);
