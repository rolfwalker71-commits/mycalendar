import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { appIconSvg, DEFAULT_ICON_VARIANT } from "./app-icon.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web/public/icons");
const publicRoot = path.join(root, "web/public");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const ICON_BG = { r: 224, g: 36, b: 27, alpha: 1 };

const variant = (process.env.APP_ICON_VARIANT ?? DEFAULT_ICON_VARIANT).trim();
const lightSvg = Buffer.from(appIconSvg(variant, { dark: false }));
const darkSvg = Buffer.from(appIconSvg(variant, { dark: true }));

// Quelle für App-Logo (App, Login, Push-Bild) und Favicon-Fallback.
await sharp(lightSvg).resize(1024, 1024).png().toFile(path.join(publicRoot, "logo.png"));
await sharp(darkSvg).resize(1024, 1024).png().toFile(path.join(publicRoot, "logo-dark.png"));

/**
 * maskable: Android beschneidet auf einen Kreis, deshalb das Motiv kleiner auf
 * volle Fläche setzen. Sonst randlos, iOS rundet selbst ab.
 */
async function writePng(name, size, { maskable = false, dest = outDir } = {}) {
  if (!maskable) {
    await sharp(lightSvg).resize(size, size).png().toFile(path.join(dest, name));
    return;
  }
  const inner = Math.round(size * 0.74);
  const pad = Math.round((size - inner) / 2);
  const icon = await sharp(lightSvg).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: ICON_BG } })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toFile(path.join(dest, name));
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-192-maskable.png", 192, { maskable: true });
await writePng("icon-512-maskable.png", 512, { maskable: true });
await writePng("apple-touch-icon.png", 180);
await writePng("apple-touch-icon-152.png", 152);
await writePng("apple-touch-icon-167.png", 167);
await writePng("apple-touch-icon.png", 180, { dest: publicRoot });

// Kleine Kalendergrafiken für Home-Bildschirm-Widgets (Scriptable hat wenig Speicher).
const artDir = path.join(publicRoot, "event-art");
const thumbDir = path.join(artDir, "thumbs");
mkdirSync(thumbDir, { recursive: true });
for (const file of readdirSync(artDir)) {
  if (!file.endsWith(".jpg")) continue;
  const header = file.endsWith("-header.jpg");
  await sharp(path.join(artDir, file))
    .resize(header ? 480 : 144, header ? 270 : 144, { fit: "cover" })
    .jpeg({ quality: 78, progressive: false, mozjpeg: true })
    .toFile(path.join(thumbDir, file));
}

console.log(`Icons (${variant}) geschrieben nach`, outDir);
