/**
 * photo-to-coloring-page
 *
 * Turns a photo (RGBA pixels) into black-and-white line art you can print and color.
 * Dependency-free, runs in browsers, Web Workers and Node.
 *
 * Pipeline:
 *   1. downscale to a working size (area average)
 *   2. edge-preserving smoothing (bilateral filter) to flatten grass / sand / fur texture
 *   3. difference-of-Gaussians on luminance + two colour-opponent channels
 *   4. hysteresis threshold (strong edges seed, weaker connected edges are kept)
 *   5. remove short strokes (connected components below a minimum size)
 *   6. soft upscale of the line mask + threshold, so lines come out even and rounded
 */

/** @typedef {"low" | "medium" | "high"} Detail */

/**
 * Tuned presets. `work` = long side of the working image, `smooth` = bilateral passes,
 * `sigma` = inner Gaussian of the DoG, `t` = strong-edge threshold, `minLen` = smallest stroke kept (px at work size),
 * `weight` = line cutoff on the upscaled mask (lower = thicker).
 */
export const PRESETS = Object.freeze({
  low: Object.freeze({ work: 520, smooth: 5, sigma: 1.5, t: 6.5, minLen: 60, weight: 0.3 }),
  medium: Object.freeze({ work: 680, smooth: 4, sigma: 1.2, t: 5, minLen: 40, weight: 0.32 }),
  high: Object.freeze({ work: 860, smooth: 3, sigma: 1.0, t: 4, minLen: 24, weight: 0.36 }),
});

export const DEFAULT_INK = Object.freeze([17, 17, 17]);

/** Area-average downscale of an interleaved float image with `ch` channels. */
export function resize(src, w, h, ch, nw, nh) {
  const out = new Float32Array(nw * nh * ch);
  const sx = w / nw, sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      for (let c = 0; c < ch; c++) {
        let a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { a += src[(yy * w + xx) * ch + c]; n++; }
        out[(y * nw + x) * ch + c] = n ? a / n : 0;
      }
    }
  }
  return out;
}

/** Bilateral filter (5x5, RGB) applied `iters` times. Smooths texture, keeps strong colour borders. */
export function bilateral(img, w, h, iters) {
  const r = 2, sc = 2 * 22 * 22, ss = 2 * 2 * 2;
  // spatial weights are constant, precompute them
  const sw = new Float32Array((2 * r + 1) ** 2);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sw[(dy + r) * (2 * r + 1) + dx + r] = (dx * dx + dy * dy) / ss;
  let cur = img;
  for (let it = 0; it < iters; it++) {
    const out = new Float32Array(cur.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        let wr = 0, a0 = 0, a1 = 0, a2 = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const j = (yy * w + xx) * 3;
            const d0 = cur[j] - cur[i], d1 = cur[j + 1] - cur[i + 1], d2 = cur[j + 2] - cur[i + 2];
            const wt = Math.exp(-(d0 * d0 + d1 * d1 + d2 * d2) / sc - sw[(dy + r) * (2 * r + 1) + dx + r]);
            wr += wt; a0 += cur[j] * wt; a1 += cur[j + 1] * wt; a2 += cur[j + 2] * wt;
          }
        }
        out[i] = a0 / wr; out[i + 1] = a1 / wr; out[i + 2] = a2 / wr;
      }
    }
    cur = out;
  }
  return cur;
}

/** Separable Gaussian blur of a single-channel float image (clamped borders). */
export function gaussianBlur(src, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[row + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
      out[y * w + x] = a;
    }
  }
  return out;
}

function normalizeInput(input, width, height) {
  let data = input, w = width, h = height;
  if (input && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer) && typeof input === "object" && "data" in input) {
    data = input.data; w = input.width; h = input.height;
  }
  if (data instanceof ArrayBuffer) data = new Uint8ClampedArray(data);
  if (!ArrayBuffer.isView(data)) throw new TypeError("Expected ImageData, {data, width, height} or an RGBA buffer");
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new TypeError("width and height must be positive integers");
  if (data.length !== w * h * 4) throw new RangeError(`RGBA buffer length ${data.length} does not match ${w}x${h}x4 = ${w * h * 4}`);
  return { data, w, h };
}

function resolveOptions(o = {}) {
  const detail = o.detail ?? "medium";
  const p = PRESETS[detail];
  if (!p) throw new RangeError(`detail must be "low", "medium" or "high", got ${JSON.stringify(detail)}`);
  const num = (v, d, min, max) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    work: Math.round(num(o.workSize, p.work, 32, 4096)),
    smooth: Math.round(num(o.smoothing, p.smooth, 0, 20)),
    sigma: p.sigma,
    t: num(o.threshold, p.t, 0.1, 255),
    minLen: Math.round(num(o.minStrokeLength, p.minLen, 0, 1e7)),
    weight: p.weight,
    lineWeight: num(o.lineWeight, 1, 0.25, 4),
    outputSize: o.outputSize == null ? null : Math.round(num(o.outputSize, 0, 1, 16384)),
    invert: !!o.invert,
    transparent: !!o.transparent,
    ink: Array.isArray(o.ink) && o.ink.length >= 3 ? o.ink.slice(0, 3).map((v) => Math.round(num(v, 0, 0, 255))) : DEFAULT_INK,
  };
}

/**
 * Convert a photo to a printable coloring page.
 *
 * @param {ImageData | {data: ArrayLike<number> & ArrayBufferView, width: number, height: number} | Uint8ClampedArray | Uint8Array | ArrayBuffer} input
 * @param {number | object} [widthOrOptions] width when `input` is a raw RGBA buffer, otherwise the options object
 * @param {number} [height]
 * @param {object} [options]
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }} RGBA, same aspect ratio as the input
 */
export function photoToColoringPage(input, widthOrOptions, height, options) {
  let src, opts;
  if (typeof widthOrOptions === "number") { src = normalizeInput(input, widthOrOptions, height); opts = options; }
  else { src = normalizeInput(input); opts = widthOrOptions; }
  const o = resolveOptions(opts);
  const { data: rgba, w, h } = src;

  const outLong = o.outputSize ?? Math.max(w, h);
  const os = outLong / Math.max(w, h);
  const ow = Math.max(1, Math.round(w * os)), oh = Math.max(1, Math.round(h * os));
  const out = new Uint8ClampedArray(ow * oh * 4);
  const paper = o.invert ? [0, 0, 0] : [255, 255, 255];
  const inkRgb = o.invert ? [255, 255, 255] : o.ink;
  const paperA = o.transparent ? 0 : 255;
  const paint = (mask, mw, mh, cutoff) => {
    const sx = mw / ow, sy = mh / oh;
    for (let y = 0; y < oh; y++) {
      const fy = Math.min(mh - 1.001, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
      for (let x = 0; x < ow; x++) {
        const fx = Math.min(mw - 1.001, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
        const i = y0 * mw + x0;
        const v = mask[i] * (1 - tx) * (1 - ty) + mask[i + 1] * tx * (1 - ty) + mask[i + mw] * (1 - tx) * ty + mask[i + mw + 1] * tx * ty;
        const c = v > cutoff ? inkRgb : paper;
        const k = (y * ow + x) * 4;
        out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2]; out[k + 3] = v > cutoff ? 255 : paperA;
      }
    }
  };

  const s = Math.min(1, o.work / Math.max(w, h));
  const ww = Math.round(w * s), wh = Math.round(h * s);
  if (ww < 3 || wh < 3) {
    // too small to have any meaningful edges: blank page
    paint(new Float32Array(4), 2, 2, 1);
    return { data: out, width: ow, height: oh };
  }

  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    // composite transparent pixels onto white so PNG cut-outs behave like paper
    const a = rgba[i * 4 + 3] / 255;
    rgb[i * 3] = rgba[i * 4] * a + 255 * (1 - a);
    rgb[i * 3 + 1] = rgba[i * 4 + 1] * a + 255 * (1 - a);
    rgb[i * 3 + 2] = rgba[i * 4 + 2] * a + 255 * (1 - a);
  }
  const small = s < 1 ? resize(rgb, w, h, 3, ww, wh) : rgb;
  const sm = o.smooth > 0 ? bilateral(small, ww, wh, o.smooth) : small;
  const n = ww * wh;

  // luminance + two colour-opponent channels, so a golden dog on green grass still has an edge
  const chans = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const r = sm[i * 3], g = sm[i * 3 + 1], b = sm[i * 3 + 2];
    chans[0][i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chans[1][i] = (r - g) * 0.8;
    chans[2][i] = ((r + g) / 2 - b) * 0.6;
  }
  // stretch luminance contrast so dim / hazy photos still produce lines
  let mn = 255, mx = 0;
  for (let i = 0; i < n; i++) { const v = chans[0][i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const span = Math.max(1, mx - mn);
  for (let i = 0; i < n; i++) chans[0][i] = ((chans[0][i] - mn) * 255) / span;

  // difference of Gaussians. Luminance is signed (ink lands on the darker side of an edge);
  // colour channels use the magnitude at a lower weight.
  const resp = new Float32Array(n);
  chans.forEach((c, ci) => {
    const g1 = gaussianBlur(c, ww, wh, o.sigma), g2 = gaussianBlur(c, ww, wh, o.sigma * 1.7);
    for (let i = 0; i < n; i++) {
      const d = ci === 0 ? g2[i] - g1[i] : Math.abs(g2[i] - g1[i]) * 0.55;
      if (d > resp[i]) resp[i] = d;
    }
  });

  // hysteresis: strong edges seed, weaker connected edges are kept -> longer, unbroken outlines
  const ink = new Uint8Array(n);
  const strong = o.t, weak = o.t * 0.55;
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) if (resp[i] > strong) { ink[i] = 1; stack[sp++] = i; }
  while (sp) {
    const q = stack[--sp];
    const x = q % ww, y = (q - x) / ww;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= ww || yy >= wh) continue;
      const j = yy * ww + xx;
      if (!ink[j] && resp[j] > weak) { ink[j] = 1; stack[sp++] = j; }
    }
  }

  // drop short strokes (8-connected components smaller than minLen pixels)
  if (o.minLen > 1) {
    const seen = new Uint8Array(n);
    const comp = new Int32Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (!ink[s0] || seen[s0]) continue;
      let cn = 0;
      sp = 0;
      stack[sp++] = s0; seen[s0] = 1;
      while (sp) {
        const q = stack[--sp];
        comp[cn++] = q;
        const x = q % ww, y = (q - x) / ww;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= ww || yy >= wh) continue;
          const j = yy * ww + xx;
          if (ink[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
        }
      }
      if (cn < o.minLen) for (let k = 0; k < cn; k++) ink[comp[k]] = 0;
    }
  }

  // soft upscale + threshold -> even, rounded lines. lineWeight lowers/raises the cutoff.
  // lineWeight > 1 widens the blur (thicker strokes); < 1 raises the cutoff (thinner strokes).
  const soft = gaussianBlur(Float32Array.from(ink), ww, wh, 0.7 * Math.max(1, o.lineWeight));
  const cutoff = Math.min(0.9, Math.max(0.02, (o.weight * 0.8) / o.lineWeight));
  paint(soft, ww, wh, cutoff);
  return { data: out, width: ow, height: oh };
}

export default photoToColoringPage;
