import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web/public/icons");
const publicRoot = path.join(root, "web/public");
const proposals = path.join(publicRoot, "logo-proposals");
const source = path.join(publicRoot, "logo-source.png");
const lightProposal = path.join(proposals, "logo-proposal-a-light.png");
const darkProposal = path.join(proposals, "logo-proposal-a-dark.png");
const sourceProposal = path.join(proposals, "logo-proposal-a-source.png");
mkdirSync(outDir, { recursive: true });

if (existsSync(sourceProposal)) {
  copyFileSync(sourceProposal, source);
}

if (!existsSync(source)) {
  console.error("Fehlt:", source);
  process.exit(1);
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function colorClose(r, g, b, target, slack) {
  return (
    Math.abs(r - target[0]) <= slack &&
    Math.abs(g - target[1]) <= slack &&
    Math.abs(b - target[2]) <= slack
  );
}

/** Entfernt den Rand per Flood-Fill, Objektfarbe bleibt. */
async function knockoutEdgeBackground(input, slack) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { width: w, height: h, channels: ch } = info;
  const px = (x, y) => (y * w + x) * ch;
  const edge = [data[0], data[1], data[2]];
  const seen = new Uint8Array(w * h);
  const queue = [];

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = px(x, y);
    if (!colorClose(data[i], data[i + 1], data[i + 2], edge, slack)) return;
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

  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const lightIn = existsSync(lightProposal) ? lightProposal : source;
const cutoutBuf = await knockoutEdgeBackground(lightIn, 4);
writeFileSync(path.join(publicRoot, "logo.png"), cutoutBuf);

if (existsSync(darkProposal)) {
  const darkBuf = await knockoutEdgeBackground(darkProposal, 10);
  writeFileSync(path.join(publicRoot, "logo-dark.png"), darkBuf);
}

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
