import { test } from "node:test";
import assert from "node:assert/strict";
import { photoToColoringPage, PRESETS } from "../src/index.js";
import { syntheticScene } from "../demo/synthetic-scene.js";

// ---- helpers --------------------------------------------------------------------------------------------

function canvas(w, h, fill = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...fill, 255], i * 4);
  return { data, width: w, height: h };
}
function paint(img, inside, color) {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) if (inside(x, y)) img.data.set([...color, 255], (y * img.width + x) * 4);
  return img;
}
const isInk = (r, i) => r.data[i * 4] < 128;
function inkCount(r, where = () => true) {
  let n = 0;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (where(x, y) && isInk(r, y * r.width + x)) n++;
  return n;
}

// ---- shape & size ---------------------------------------------------------------------------------------

test("output dimensions match the input by default", () => {
  for (const [w, h] of [[320, 240], [200, 300], [97, 61]]) {
    const r = photoToColoringPage(canvas(w, h));
    assert.equal(r.width, w);
    assert.equal(r.height, h);
    assert.equal(r.data.length, w * h * 4);
    assert.ok(r.data instanceof Uint8ClampedArray);
  }
});

test("outputSize sets the long side and keeps the aspect ratio", () => {
  const r = photoToColoringPage(canvas(400, 300), { outputSize: 1000 });
  assert.equal(r.width, 1000);
  assert.equal(r.height, 750);
  const p = photoToColoringPage(canvas(300, 400), { outputSize: 200 });
  assert.equal(p.width, 150);
  assert.equal(p.height, 200);
});

test("accepts (rgba, width, height, options) as well as ImageData-like objects", () => {
  const img = paint(canvas(120, 90), (x, y) => x > 30 && x < 90 && y > 20 && y < 70, [0, 0, 0]);
  const a = photoToColoringPage(img, { detail: "high" });
  const b = photoToColoringPage(img.data, 120, 90, { detail: "high" });
  const c = photoToColoringPage(img.data.buffer, 120, 90, { detail: "high" });
  assert.deepEqual(a.data, b.data);
  assert.deepEqual(a.data, c.data);
});

test("rejects bad input", () => {
  assert.throws(() => photoToColoringPage(new Uint8ClampedArray(10), 2, 2), RangeError);
  assert.throws(() => photoToColoringPage(new Uint8ClampedArray(16), 0, 4), TypeError);
  assert.throws(() => photoToColoringPage("nope"), TypeError);
  assert.throws(() => photoToColoringPage(canvas(10, 10), { detail: "ultra" }), RangeError);
});

test("tiny images do not crash and come back blank", () => {
  for (const [w, h] of [[1, 1], [2, 5], [5, 2]]) {
    const r = photoToColoringPage(paint(canvas(w, h), () => true, [0, 0, 0]));
    assert.equal(r.width, w);
    assert.equal(r.height, h);
    assert.equal(inkCount(r), 0);
  }
});

// ---- what gets drawn ------------------------------------------------------------------------------------

test("a blank white image stays white", () => {
  const r = photoToColoringPage(canvas(300, 200));
  assert.equal(inkCount(r), 0);
  for (let i = 0; i < r.data.length; i += 4) assert.deepEqual([...r.data.subarray(i, i + 4)], [255, 255, 255, 255]);
});

test("a flat colour image (no edges) stays white", () => {
  for (const c of [[128, 128, 128], [20, 120, 220], [0, 0, 0]]) assert.equal(inkCount(photoToColoringPage(canvas(200, 150, c))), 0);
});

test("a filled square produces an outline, not a filled shape", () => {
  const W = 300, H = 300, x0 = 90, x1 = 210, y0 = 90, y1 = 210;
  const img = paint(canvas(W, H), (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, [30, 30, 30]);
  const r = photoToColoringPage(img);
  const nearBorder = (x, y) => {
    const insideOuter = x >= x0 - 6 && x < x1 + 6 && y >= y0 - 6 && y < y1 + 6;
    const insideInner = x >= x0 + 6 && x < x1 - 6 && y >= y0 + 6 && y < y1 - 6;
    return insideOuter && !insideInner;
  };
  const total = inkCount(r);
  const onBorder = inkCount(r, nearBorder);
  assert.ok(total > 4 * 100, `expected a full outline, got ${total} ink pixels`);
  assert.ok(onBorder / total > 0.98, `ink should sit on the square's border (${onBorder}/${total})`);
  // the middle of the square and the far background stay white
  assert.equal(inkCount(r, (x, y) => x > 120 && x < 180 && y > 120 && y < 180), 0);
  assert.equal(inkCount(r, (x, y) => x < 60 || y < 60), 0);
  // every side of the square has ink
  for (const [x, y] of [[150, y0], [150, y1 - 1], [x0, 150], [x1 - 1, 150]]) {
    assert.ok(inkCount(r, (xx, yy) => Math.abs(xx - x) <= 4 && Math.abs(yy - y) <= 4) > 0, `missing ink near ${x},${y}`);
  }
});

test("a circle produces a ring of ink at its radius", () => {
  const W = 320, H = 320, cx = 160, cy = 160, R = 80;
  const img = paint(canvas(W, H), (x, y) => Math.hypot(x - cx, y - cy) < R, [200, 40, 40]);
  const r = photoToColoringPage(img);
  const total = inkCount(r);
  const ring = inkCount(r, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - R) < 7);
  assert.ok(total > 2 * Math.PI * R, `expected a closed ring, got ${total} ink pixels`);
  assert.ok(ring / total > 0.98, `ink should lie on the circle (${ring}/${total})`);
  // closed: every 10-degree sector of the ring contains ink
  for (let a = 0; a < 360; a += 10) {
    const t = (a * Math.PI) / 180;
    const px = Math.round(cx + R * Math.cos(t)), py = Math.round(cy + R * Math.sin(t));
    assert.ok(inkCount(r, (x, y) => Math.abs(x - px) <= 4 && Math.abs(y - py) <= 4) > 0, `gap in ring at ${a} deg`);
  }
});

test("colour-only edges (same brightness) are still found", () => {
  // green (40,120,40) and red (200,40,32) have the same luminance (~86.9)
  const img = paint(canvas(240, 160, [40, 120, 40]), (x) => x >= 120, [200, 40, 32]);
  // small black and white patches far from the boundary pin the contrast stretch, so the
  // red/green boundary is NOT amplified into a luminance edge
  paint(img, (x, y) => x >= 6 && x < 18 && y >= 6 && y < 18, [0, 0, 0]);
  paint(img, (x, y) => x >= 6 && x < 18 && y >= 40 && y < 52, [255, 255, 255]);
  const r = photoToColoringPage(img, { minStrokeLength: 0 });
  assert.ok(inkCount(r, (x) => Math.abs(x - 120) <= 6) > 100, "expected a vertical line at the colour boundary");
  assert.equal(inkCount(r, (x) => x > 40 && Math.abs(x - 120) > 10), 0);
});

test("isolated specks and fine noise are removed", () => {
  const img = canvas(300, 300);
  let s = 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // scattered single dark pixels
  for (let k = 0; k < 120; k++) {
    const x = Math.floor(rand() * 300), y = Math.floor(rand() * 300);
    img.data.set([0, 0, 0, 255], (y * 300 + x) * 4);
  }
  assert.equal(inkCount(photoToColoringPage(img)), 0);
});

test("textured areas produce far less ink than real shapes", () => {
  const scene = syntheticScene(400, 300);
  const r = photoToColoringPage(scene);
  // bottom strip is textured grass only (the ball sits higher, around y≈0.84*h, so stop above it)
  const grass = inkCount(r, (x, y) => y > 0.93 * 300);
  assert.ok(grass < 0.01 * 400 * 0.07 * 300, `grass texture leaked ${grass} ink pixels`);
  assert.ok(inkCount(r) > 1000, "scene should have outlines");
});

test("output is strictly two-tone", () => {
  const r = photoToColoringPage(syntheticScene(320, 240));
  for (let i = 0; i < r.data.length; i += 4) {
    const v = r.data[i];
    assert.ok(v === 17 || v === 255, `unexpected value ${v}`);
    assert.equal(r.data[i + 3], 255);
  }
});

test("is deterministic", () => {
  const s = syntheticScene(240, 180);
  assert.deepEqual(photoToColoringPage(s).data, photoToColoringPage(s).data);
});

// ---- options --------------------------------------------------------------------------------------------

test("lineWeight makes lines thicker or thinner", () => {
  const s = syntheticScene(320, 240);
  const thin = inkCount(photoToColoringPage(s, { lineWeight: 0.5 }));
  const normal = inkCount(photoToColoringPage(s));
  const bold = inkCount(photoToColoringPage(s, { lineWeight: 2.5 }));
  assert.ok(thin < normal && normal < bold, `${thin} < ${normal} < ${bold}`);
});

test("a higher threshold draws fewer lines", () => {
  const s = syntheticScene(320, 240);
  const many = inkCount(photoToColoringPage(s, { threshold: 3 }));
  const few = inkCount(photoToColoringPage(s, { threshold: 25 }));
  assert.ok(few < many, `${few} < ${many}`);
});

test("invert gives white lines on black", () => {
  const img = paint(canvas(200, 200), (x, y) => x > 50 && x < 150 && y > 50 && y < 150, [0, 0, 0]);
  const r = photoToColoringPage(img, { invert: true });
  assert.deepEqual([...r.data.subarray(0, 4)], [0, 0, 0, 255]);
  const normal = photoToColoringPage(img);
  for (let i = 0; i < r.data.length; i += 4) assert.equal(r.data[i] === 255, normal.data[i] === 17);
});

test("transparent makes the background alpha 0 and keeps lines opaque", () => {
  const img = paint(canvas(200, 200), (x, y) => x > 50 && x < 150 && y > 50 && y < 150, [0, 0, 0]);
  const r = photoToColoringPage(img, { transparent: true, ink: [10, 20, 200] });
  assert.equal(r.data[3], 0);
  let lines = 0;
  for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3] === 255) { lines++; assert.deepEqual([...r.data.subarray(i, i + 3)], [10, 20, 200]); }
  assert.ok(lines > 0);
});

test("transparent input pixels are treated as white paper", () => {
  const img = canvas(200, 200, [0, 0, 0]);
  // fully transparent black everywhere except an opaque black square
  for (let i = 0; i < 200 * 200; i++) img.data[i * 4 + 3] = 0;
  paint(img, (x, y) => x > 50 && x < 150 && y > 50 && y < 150, [0, 0, 0]);
  const r = photoToColoringPage(img);
  assert.ok(inkCount(r) > 200, "edge between transparent and opaque should be drawn");
  assert.equal(inkCount(r, (x, y) => x < 30 || y < 30), 0);
});

test("presets are exposed and every detail level runs", () => {
  assert.deepEqual(Object.keys(PRESETS), ["low", "medium", "high"]);
  const s = syntheticScene(320, 240);
  for (const detail of Object.keys(PRESETS)) assert.ok(inkCount(photoToColoringPage(s, { detail })) > 0);
});
