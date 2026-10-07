// Regenerates examples/scene-input.png and examples/scene-coloring-page.png from the synthetic scene.
// Usage: node scripts/make-example.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { photoToColoringPage } from "../src/index.js";
import { syntheticScene } from "../demo/synthetic-scene.js";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
/** Minimal RGB PNG encoder (alpha dropped). */
function encodePng({ data, width, height }) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (width * 3 + 1) + 1 + x * 3;
      raw[d] = data[s]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../examples/", import.meta.url);
mkdirSync(dir, { recursive: true });
const scene = syntheticScene(800, 600);
const t0 = performance.now();
const page = photoToColoringPage(scene, { detail: "medium" });
console.log(`converted ${scene.width}x${scene.height} in ${Math.round(performance.now() - t0)} ms`);
writeFileSync(new URL("scene-input.png", dir), encodePng(scene));
writeFileSync(new URL("scene-coloring-page.png", dir), encodePng(page));
console.log("wrote examples/scene-input.png, examples/scene-coloring-page.png");
