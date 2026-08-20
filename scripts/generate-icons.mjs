import { mkdirSync, copyFileSync, existsSync } from "node:fs";
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

async function writePng(name, size, { maskable = false, dest = outDir } = {}) {
  const padRatio = maskable ? 0.18 : 0.08;
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const icon = await sharp(source)
    .flatten({ background: WHITE })
    .resize(inner, inner, { fit: "contain", background: WHITE })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toFile(path.join(dest, name));
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-192-maskable.png", 192, { maskable: true });
await writePng("icon-512-maskable.png", 512, { maskable: true });
await writePng("apple-touch-icon.png", 180);
await writePng("apple-touch-icon.png", 180, { dest: publicRoot });
copyFileSync(source, path.join(publicRoot, "logo.png"));

console.log("Icons geschrieben nach", outDir);
