import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web/public/icons");
const publicRoot = path.join(root, "web/public");
const source = path.join(publicRoot, "logo-source.png");
mkdirSync(outDir, { recursive: true });

if (!existsSync(source)) {
  console.error("Fehlt:", source);
  process.exit(1);
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function isNearWhite(r, g, b, threshold) {
  return r >= threshold && g >= threshold && b >= threshold;
}

/** Entfernt den weißen Rand per Flood-Fill vom Bildrand, Objektweiß bleibt. */
async function knockoutWhiteBackground(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { width: w, height: h, channels: ch } = info;
  const px = (x, y) => (y * w + x) * ch;
  const seen = new Uint8Array(w * h);
  const queue = [];

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = px(x, y);
    if (!isNearWhite(data[i], data[i + 1], data[i + 2], 248)) return;
    seen[idx] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }

  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    const i = px(x, y);
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  // Weiche Kante: fast-weiße Pixel neben Transparenz ausfaden
  const copy = Buffer.from(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = px(x, y);
      if (copy[i + 3] === 0) continue;
      if (!isNearWhite(copy[i], copy[i + 1], copy[i + 2], 236)) continue;
      let transparentNeighbor = false;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        if (copy[px(x + dx, y + dy) + 3] === 0) {
          transparentNeighbor = true;
          break;
        }
      }
      if (!transparentNeighbor) continue;
      const minC = Math.min(copy[i], copy[i + 1], copy[i + 2]);
      data[i + 3] = Math.round(((255 - minC) / 19) * 255);
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png();
}

const cutout = await knockoutWhiteBackground(source);
const cutoutBuf = await cutout.toBuffer();
writeFileSync(path.join(publicRoot, "logo.png"), cutoutBuf);
writeFileSync(source, cutoutBuf);

async function writePng(name, size, { maskable = false, opaque = false, dest = outDir } = {}) {
  const padRatio = maskable ? 0.18 : 0.04;
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const icon = await sharp(cutoutBuf)
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? WHITE : TRANSPARENT,
    },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toFile(path.join(dest, name));
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-192-maskable.png", 192, { maskable: true, opaque: true });
await writePng("icon-512-maskable.png", 512, { maskable: true, opaque: true });
await writePng("apple-touch-icon.png", 180, { opaque: true });
await writePng("apple-touch-icon.png", 180, { opaque: true, dest: publicRoot });

console.log("Icons geschrieben nach", outDir);
