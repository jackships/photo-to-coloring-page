// A procedurally drawn "photo" (house, tree, sun, textured grass) used for the demo sample and the README example.
// No real photos, nothing downloaded. Returns { data: Uint8ClampedArray (RGBA), width, height }.

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function syntheticScene(width = 640, height = 480, seed = 7) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const u = (x) => x / width, v = (y) => y / height;
  // per-pixel noise field + a coarse "clump" field for grass / leaves
  const noise = new Float32Array(width * height).map(() => rand() - 0.5);
  const S = 1 / Math.min(width, height);

  const hill = (x) => 0.66 + 0.05 * Math.sin(u(x) * 5.2 + 0.6) + 0.025 * Math.sin(u(x) * 13);
  const house = { x0: 0.12, x1: 0.42, y0: 0.42, y1: 0.74 };
  const roofTop = 0.24;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, k = i * 4;
      const nx = u(x), ny = v(y), n = noise[i];
      // sky gradient
      let r = 120 + 80 * ny, g = 170 + 50 * ny, b = 235 - 10 * ny;
      // soft clouds
      const cl = Math.exp(-(((nx - 0.55) / 0.09) ** 2) - (((ny - 0.14) / 0.035) ** 2)) + Math.exp(-(((nx - 0.63) / 0.07) ** 2) - (((ny - 0.11) / 0.04) ** 2));
      if (cl > 0.5) { r = g = b = 245; }
      // sun
      const dSun = Math.hypot((x - width * 0.84) * S, (y - height * 0.16) * S);
      if (dSun < 0.085) { r = 255; g = 210; b = 70; }
      // grass hill with fine texture (the filter should ignore it)
      if (ny > hill(x)) {
        const stripe = Math.sin(x * 0.9 + Math.sin(y * 0.3) * 3) * 0.5;
        r = 70 + 30 * n + 10 * stripe; g = 150 + 50 * n + 15 * stripe; b = 60 + 20 * n;
      }
      // house walls, roof, door, window
      if (nx > house.x0 && nx < house.x1 && ny > house.y0 && ny < house.y1) { r = 236 + 8 * n; g = 214 + 8 * n; b = 170 + 8 * n; }
      const mid = (house.x0 + house.x1) / 2, half = (house.x1 - house.x0) / 2 + 0.03;
      if (ny > roofTop && ny <= house.y0 && Math.abs(nx - mid) < (half * (ny - roofTop)) / (house.y0 - roofTop)) { r = 178 + 10 * n; g = 58 + 6 * n; b = 48 + 6 * n; }
      if (nx > 0.24 && nx < 0.3 && ny > 0.6 && ny < house.y1) { r = 110; g = 72; b = 45; }
      if (nx > 0.33 && nx < 0.39 && ny > 0.5 && ny < 0.59) { r = 150 + 20 * ny; g = 205; b = 240; }
      if (nx > 0.155 && nx < 0.215 && ny > 0.5 && ny < 0.59) { r = 150 + 20 * ny; g = 205; b = 240; }
      // tree: trunk + leafy crown with texture
      if (nx > 0.66 && nx < 0.7 && ny > 0.45 && ny < 0.72) { r = 120 + 10 * n; g = 80 + 8 * n; b = 50; }
      const dCrown = Math.hypot((x - width * 0.68) * S, (y - height * 0.38) * S);
      if (dCrown < 0.16 + 0.012 * Math.sin(Math.atan2(y - height * 0.38, x - width * 0.68) * 9)) {
        r = 40 + 30 * n; g = 115 + 40 * n; b = 50 + 15 * n;
      }
      // red ball on the grass
      const dBall = Math.hypot((x - width * 0.53) * S, (y - height * 0.84) * S);
      if (dBall < 0.06) { const sh = 1 - 0.35 * ((x - width * 0.51) * S + (y - height * 0.82) * S) / 0.06; r = 220 * sh; g = 50 * sh; b = 60 * sh; }
      data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 255;
    }
  }
  return { data, width, height };
}
