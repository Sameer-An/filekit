// src/lib/pdf-editor/background-sample.ts
// Sample the background colour of a rect on a rendered page canvas.
// Used to (a) paint an opaque cover behind redrawn text on export, and
// (b) colour-match the "editing" textarea inside the overlay.
//
// Robustness: we sample a sparse grid (not every pixel) for speed, discard
// near-transparent pixels (canvases may be painted on transparent bg), and
// use the median channel value per R/G/B so one noisy text glyph does not
// distort the result.

import type { PageInfo, RectPt } from "./types";
import { pdfRectToCss, normalizeHexColor } from "./coords";

const SAMPLE_GRID = 12; // 12×12 = 144 samples per rect

interface Rgba {
r: number;
g: number;
b: number;
a: number;
}

function clamp255(v: number): number {
return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(r: number, g: number, b: number): string {
const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
}

function median(values: number[]): number {
if (values.length === 0) return 0;
const sorted = values.slice().sort((a, b) => a - b);
const mid = sorted.length >> 1;
return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Sample a rect (in PDF points) from `sourceCanvas` (a rendered page at
 * `zoom`). Returns `#rrggbb`. Falls back to `#ffffff` for empty reads.
 */
export function sampleMedianBackground(
sourceCanvas: HTMLCanvasElement,
rect: RectPt,
page: PageInfo,
zoom: number,
): string {
if (!sourceCanvas || sourceCanvas.width === 0) return "#ffffff";

const css = pdfRectToCss(rect, page, zoom);
const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
if (!ctx) return "#ffffff";

// Expand the sample a few px outward so we catch the "paper" tone around
// antialiased glyph edges. Guard against canvas boundaries.
const pad = 2;
const x0 = Math.max(0, Math.floor(css.left - pad));
const y0 = Math.max(0, Math.floor(css.top - pad));
const x1 = Math.min(
    sourceCanvas.width - 1,
    Math.ceil(css.left + css.width + pad),
);
const y1 = Math.min(
    sourceCanvas.height - 1,
    Math.ceil(css.top + css.height + pad),
);
if (x1 <= x0 || y1 <= y0) return "#ffffff";

const w = x1 - x0;
const h = y1 - y0;
const stepX = Math.max(1, Math.floor(w / SAMPLE_GRID));
const stepY = Math.max(1, Math.floor(h / SAMPLE_GRID));

let imageData: ImageData;
try {
    imageData = ctx.getImageData(x0, y0, w, h);
} catch {
    // Tainted canvas — the caller painted cross-origin content.
    return "#ffffff";
}

const rs: number[] = [];
const gs: number[] = [];
const bs: number[] = [];

for (let sy = 0; sy < h; sy += stepY) {
    for (let sx = 0; sx < w; sx += stepX) {
    const idx = (sy * w + sx) * 4;
    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];
    const a = imageData.data[idx + 3];
    if (a < 8) continue; // skip near-transparent
    rs.push(r);
    gs.push(g);
    bs.push(b);
    }
}

if (rs.length === 0) return "#ffffff";

return toHex(median(rs), median(gs), median(bs));
}

/**
 * Sample the single pixel under a CSS point. Useful for the eyedropper.
 */
export function samplePoint(
sourceCanvas: HTMLCanvasElement,
cssX: number,
cssY: number,
): string {
const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
if (!ctx) return "#ffffff";
const x = Math.max(0, Math.min(sourceCanvas.width - 1, Math.floor(cssX)));
const y = Math.max(0, Math.min(sourceCanvas.height - 1, Math.floor(cssY)));
const d = ctx.getImageData(x, y, 1, 1).data;
if (d[3] < 8) return "#ffffff";
return toHex(d[0], d[1], d[2]);
}

/**
 * Helper for text-run extraction: given a text run's PDF rect, return the
 * dominant background. Exposed as a callback factory so `extractTextRuns`
 * can be called without knowing about canvases.
 */
export function makeBackgroundSampler(
sourceCanvas: HTMLCanvasElement,
page: PageInfo,
zoom: number,
): (rect: RectPt) => string {
return (rect: RectPt) =>
    sampleMedianBackground(sourceCanvas, rect, page, zoom);
}

/** Re-export for convenience. */
export { normalizeHexColor };
