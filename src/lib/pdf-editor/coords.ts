// src/lib/pdf-editor/coords.ts
// Single source of truth for PDF <-> CSS coordinate conversions.
// All geometry in PDF points (origin bottom-left, y-up) unless suffixed Px.
// Uses pdfjs viewport transforms to guarantee alignment with the canvas.

import type { PageInfo, RectPt } from "./types";

export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Effective (rotated) page size in PDF points. */
/** Stable identity of a page instance (falls back to its source index). */
export function pageUid(page: PageInfo): string {
  return page.uid ?? `src-${page.index}`;
}

export function rotatedPageSize(page: PageInfo): { w: number; h: number } {
  const { widthPt, heightPt, rotation } = page;
  return rotation === 90 || rotation === 270
    ? { w: heightPt, h: widthPt }
    : { w: widthPt, h: heightPt };
}

export function identity(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function apply(
  m: Mat2D,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  };
}

/**
 * Build a matrix that maps PDF points (origin bottom-left) to CSS pixels
 * (origin top-left) inside a page element.
 *
 * We use the pdfjs viewport transform at scale=1, rotation=pageRotation.
 * Then we apply zoom. This guarantees the overlay matches the canvas
 * exactly, because the canvas is rendered with the same viewport.
 *
 * @param pageInfo - page dimensions and rotation
 * @param zoom - current zoom level (1 = 100%)
 * @returns Mat2D mapping PDF user space to CSS pixels
 */
export function pdfToCssMatrix(pageInfo: PageInfo, zoom: number): Mat2D {
  // Exact equivalent of pdfjs PageViewport.transform for a viewBox at (0,0).
  const { widthPt: W, heightPt: H, rotation } = pageInfo;
  const s = zoom;
  switch (rotation) {
    case 90:
      return { a: 0, b: s, c: s, d: 0, e: 0, f: 0 };
    case 180:
      return { a: -s, b: 0, c: 0, d: s, e: W * s, f: 0 };
    case 270:
      return { a: 0, b: -s, c: -s, d: 0, e: H * s, f: W * s };
    default:
      return { a: s, b: 0, c: 0, d: -s, e: 0, f: H * s };
  }
}

/** Inverse of pdfToCssMatrix. */
export function cssToPdfMatrix(pageInfo: PageInfo, zoom: number): Mat2D {
  const m = pdfToCssMatrix(pageInfo, zoom);
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) return identity();
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function pdfPtToCss(
  pt: { x: number; y: number },
  pageInfo: PageInfo,
  zoom: number,
): { x: number; y: number } {
  return apply(pdfToCssMatrix(pageInfo, zoom), pt.x, pt.y);
}

export function cssToPdfPt(
  px: { x: number; y: number },
  pageInfo: PageInfo,
  zoom: number,
): { x: number; y: number } {
  return apply(cssToPdfMatrix(pageInfo, zoom), px.x, px.y);
}

/** Convert a PDF-space rect into a CSS-space rect (positive width/height). */
export function pdfRectToCss(
  rect: RectPt,
  pageInfo: PageInfo,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  const m = pdfToCssMatrix(pageInfo, zoom);
  const corners = [
    apply(m, rect.x, rect.y),
    apply(m, rect.x + rect.w, rect.y),
    apply(m, rect.x + rect.w, rect.y + rect.h),
    apply(m, rect.x, rect.y + rect.h),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  return { left, top, width, height };
}

/** Inverse: a CSS rect expressed in PDF user space. */
export function cssRectToPdf(
  css: { left: number; top: number; width: number; height: number },
  pageInfo: PageInfo,
  zoom: number,
): RectPt {
  const m = cssToPdfMatrix(pageInfo, zoom);
  const corners = [
    apply(m, css.left, css.top),
    apply(m, css.left + css.width, css.top),
    apply(m, css.left, css.top + css.height),
    apply(m, css.left + css.width, css.top + css.height),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return { x, y, w, h };
}

/** Snap a PDF-space point to the nearest multiple of `step` (guarded for 0). */
export function snapPt(v: number, step: number): number {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

/** Clamp a rect so it stays inside the page box (0..widthPt, 0..heightPt). */
export function clampRectToPage(rect: RectPt, page: PageInfo): RectPt {
  const w = Math.min(rect.w, page.widthPt);
  const h = Math.min(rect.h, page.heightPt);
  const x = Math.max(0, Math.min(rect.x, page.widthPt - w));
  const y = Math.max(0, Math.min(rect.y, page.heightPt - h));
  return { x, y, w, h };
}

/** Center of a PDF-space rect. */
export function rectCenterPt(r: RectPt): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Convert a pdfjs text item transform into a PDF-user-space rect.
 * Uses the pdfjs transform directly, which is already in PDF user space
 * (after the pdfjs y-flip). We only need to account for the flip.
 *
 * pdfjs transform: [a, b, c, d, e, f] maps text space to PDF user space
 * with y already flipped. The baseline is at (e, f).
 * We compute the bounding box using width and height.
 */
export interface PdfjsTextItemTransform {
  transform: number[];
  width: number;
  height: number;
}

export function pdfjsTextItemToPdfRect(item: PdfjsTextItemTransform): RectPt {
  // pdfjs transform already contains the font size: |(a,b)| = |(c,d)| = fontSize,
  // (e,f) = baseline origin, y-up. `height` is about the font size.
  const [a, b, c, d, e, f] = item.transform;
  const w = item.width;
  const sx = Math.hypot(a, b) || 1;
  const sy = Math.hypot(c, d) || 1;
  const h = item.height > 0 ? item.height : sy;
  const ux = { x: a / sx, y: b / sx }; // along the baseline
  const uy = { x: c / sy, y: d / sy }; // "up" for the glyphs
  const DESCENT = 0.2; // fraction of font height below the baseline
  const BOX = 1.2; // total box height as a fraction of font height
  const p0 = { x: e - uy.x * DESCENT * h, y: f - uy.y * DESCENT * h };
  const p1 = { x: p0.x + ux.x * w, y: p0.y + ux.y * w };
  const p2 = { x: p1.x + uy.x * BOX * h, y: p1.y + uy.y * BOX * h };
  const p3 = { x: p0.x + uy.x * BOX * h, y: p0.y + uy.y * BOX * h };
  const xs = [p0.x, p1.x, p2.x, p3.x];
  const ys = [p0.y, p1.y, p2.y, p3.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Turn `rgb(…)` / `#rrggbb` into `#rrggbb`. Falls back to `#000000`. */
export function normalizeHexColor(input: string): string {
  if (!input) return "#000000";
  const s = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      const toHex = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  return "#000000";
}
