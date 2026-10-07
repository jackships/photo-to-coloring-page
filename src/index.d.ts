export type Detail = "low" | "medium" | "high";

export interface Preset {
  /** Long side of the working image, px. */
  readonly work: number;
  /** Bilateral smoothing passes. */
  readonly smooth: number;
  /** Inner Gaussian sigma of the difference-of-Gaussians. */
  readonly sigma: number;
  /** Strong-edge threshold. */
  readonly t: number;
  /** Smallest stroke kept, in pixels at working size. */
  readonly minLen: number;
  /** Line cutoff on the upscaled mask (lower = thicker). */
  readonly weight: number;
}

export interface ColoringPageOptions {
  /** Preset: fewer, bolder lines ("low") to more detail ("high"). Default "medium". */
  detail?: Detail;
  /** Line thickness multiplier, 0.25–4. Default 1. */
  lineWeight?: number;
  /** Edge strength needed to start a line. Higher = fewer lines. Default from preset (6.5 / 5 / 4). */
  threshold?: number;
  /** Strokes smaller than this many pixels (at working size) are removed. Default from preset (60 / 40 / 24). */
  minStrokeLength?: number;
  /** Bilateral smoothing passes before edge detection. Default from preset (5 / 4 / 3). */
  smoothing?: number;
  /** Long side of the internal working image. Default from preset (520 / 680 / 860). */
  workSize?: number;
  /** Long side of the output in px. Default: same size as the input. Use ~2000–2400 for print. */
  outputSize?: number;
  /** White lines on a black background. Default false. */
  invert?: boolean;
  /** Make the background transparent (alpha 0) instead of white/black. Default false. */
  transparent?: boolean;
  /** Line colour as [r, g, b]. Default [17, 17, 17]. Ignored when invert is true. */
  ink?: [number, number, number];
}

export interface ColoringPageResult {
  /** RGBA pixels, width * height * 4. Pass to `new ImageData(data, width, height)` in browsers. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageDataLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export const PRESETS: Readonly<Record<Detail, Preset>>;
export const DEFAULT_INK: readonly [number, number, number];

export function photoToColoringPage(input: ImageDataLike, options?: ColoringPageOptions): ColoringPageResult;
export function photoToColoringPage(
  rgba: Uint8ClampedArray | Uint8Array | ArrayBuffer,
  width: number,
  height: number,
  options?: ColoringPageOptions
): ColoringPageResult;

export function resize(src: Float32Array, w: number, h: number, ch: number, nw: number, nh: number): Float32Array;
export function bilateral(img: Float32Array, w: number, h: number, iters: number): Float32Array;
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array;

export default photoToColoringPage;
