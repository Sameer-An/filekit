// src/lib/pdf-editor/coords.ts
// Coordinate math between PDF points (origin bottom-left, y up) and CSS
// pixels (origin top-left, y down). Handles page rotation.
//
// Conventions:
//  - A `RectPt` is always expressed in *un-rotated* PDF user space.
//  - The viewport renders the page at `zoom` and applies page rotation as a
//    CSS transform around the page center; therefore any object rect must be
//    rotated by `pageRotation` before being laid out inside the page box.

import type { PageInfo, RectPt } from "./types";

/** Matrix that rotates a point around (cx, cy) by `deg` (clockwise, screen-agnostic). */
export interface Mat2D {
a: number;
b: number;
c: number;
d: number;
e: number;
f: number;
}

export function identity(): Mat2D {
return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function rotateAround(cx: number, cy: number, deg: number): Mat2D {
const r = (deg * Math.PI) / 180;
const cos = Math.cos(r);
const sin = Math.sin(r);
// translate(-cx,-cy) * rotate * translate(cx,cy)
return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cos * cx + sin * cy,
    f: cy - sin * cx - cos * cy,
};
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

/** Effective (rotated) page size in PDF points. */
export function rotatedPageSize(page: PageInfo): { w: number; h: number } {
const { widthPt, heightPt, rotation } = page;
return rotation === 90 || rotation === 270
    ? { w: heightPt, h: widthPt }
    : { w: widthPt, h: heightPt };
}

/**
 * Matrix that maps an un-rotated PDF-space point (x right, y up, origin at
 * bottom-left of the page box) to a CSS pixel inside the rendered page box
 * (x right, y down, origin top-left), at a given zoom.
 *
 * Steps:
 *  1. Flip y: y' = heightPt - y
 *  2. Apply page rotation around the (flipped) page center using the rotated
 *     page box center.
 *  3. Multiply by zoom.
 */
export function pdfToCssMatrix(page: PageInfo, zoom: number): Mat2D {
const flip: Mat2D = { a: 1, b: 0, c: 0, d: -1, e: 0, f: page.heightPt };
const rp = rotatedPageSize(page);
const rot = rotateAround(rp.w / 2, rp.h / 2, page.rotation);
const scale: Mat2D = { a: zoom, b: 0, c: 0, d: zoom, e: 0, f: 0 };
return multiply(scale, multiply(rot, flip));
}

/** Inverse of `pdfToCssMatrix`. */
export function cssToPdfMatrix(page: PageInfo, zoom: number): Mat2D {
const m = pdfToCssMatrix(page, zoom);
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
page: PageInfo,
zoom: number,
): { x: number; y: number } {
return apply(pdfToCssMatrix(page, zoom), pt.x, pt.y);
}

export function cssToPdfPt(
px: { x: number; y: number },
page: PageInfo,
zoom: number,
): { x: number; y: number } {
return apply(cssToPdfMatrix(page, zoom), px.x, px.y);
}

/**
 * Convert a PDF-space rect into a CSS-space rect that is guaranteed to have
 * positive width/height (useful for selection outlines and hit-testing).
 */
export function pdfRectToCss(
rect: RectPt,
page: PageInfo,
zoom: number,
): { left: number; top: number; width: number; height: number } {
const m = pdfToCssMatrix(page, zoom);
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

/** Inverse: a CSS rect expressed in PDF user space (un-rotated). */
export function cssRectToPdf(
css: { left: number; top: number; width: number; height: number },
page: PageInfo,
zoom: number,
): RectPt {
const m = cssToPdfMatrix(page, zoom);
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
 * pdfjs `viewport.transform` is [a, b, c, d, e, f] mapping PDF user space
 * (after its own y-flip) to CSS pixels. Use this to convert a pdfjs text-item
 * transform matrix into a PDF-user-space rect.
 */
export interface PdfjsTextItemTransform {
/** [a b c d e f] as returned by pdfjs `getTextContent`. */
transform: number[];
width: number;
height: number;
}

/**
 * Given a pdfjs text item transform + width/height, return the rect in
 * *un-rotated* PDF user space (origin bottom-left). Assumes the pdfjs viewport
 * has scale=1 and rotation=0 (we always render base viewport, then apply
 * rotation/zoom in CSS).
 */
export function pdfjsTextItemToPdfRect(item: PdfjsTextItemTransform): RectPt {
const [a, b, c, d, e, f] = item.transform;
const w = item.width;
const h = item.height || Math.hypot(b, d);
// Baseline endpoints in PDF user space
const x0 = e;
const y0 = f;
const x1 = e + a * w;
const y1 = f + b * w;
// Descender offset (positive downward on screen == negative y in PDF space)
const descY = -d * h;
const xs = [x0, x1, x0, x1];
const ys = [y0, y1, y0 + descY, y1 + descY];
const x = Math.min(...xs);
const y = Math.min(...ys);
return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
};
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
