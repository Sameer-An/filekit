import { pdfPtToCss, cssToPdfPt, pdfRectToCss, cssRectToPdf } from "./coords";
import type { PageInfo } from "./types";

// A4 Page: 595 x 842 pt
const page: PageInfo = {
index: 0,
widthPt: 595,
heightPt: 842,
rotation: 0,
};

const rotatedPage: PageInfo = {
index: 0,
widthPt: 595,
heightPt: 842,
rotation: 90,
};

function assert(condition: boolean, message: string) {
if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTests() {
console.log("Running coords.ts tests...");

// Test 1: PDF bottom-left (0,0) at zoom 1 -> CSS top-left (0, 842)
const cssBottomLeft = pdfPtToCss({ x: 0, y: 0 }, page, 1);
assert(
    cssBottomLeft.x === 0 && cssBottomLeft.y === 842,
    "Bottom-left to CSS",
);

// Test 2: PDF top-right (595, 842) at zoom 1 -> CSS (595, 0)
const cssTopRight = pdfPtToCss({ x: 595, y: 842 }, page, 1);
assert(cssTopRight.x === 595 && cssTopRight.y === 0, "Top-right to CSS");

// Test 3: Round trip (PDF -> CSS -> PDF) at zoom 1.5
const pt = { x: 100, y: 200 };
const css = pdfPtToCss(pt, page, 1.5);
const back = cssToPdfPt(css, page, 1.5);
assert(
    Math.abs(back.x - pt.x) < 0.001 && Math.abs(back.y - pt.y) < 0.001,
    "Round trip at zoom 1.5",
);

// Test 4: Rect round trip at zoom 2
const rect = { x: 50, y: 50, w: 100, h: 100 };
const cssRect = pdfRectToCss(rect, page, 2);
const backRect = cssRectToPdf(cssRect, page, 2);
assert(
    Math.abs(backRect.x - rect.x) < 0.001 &&
    Math.abs(backRect.y - rect.y) < 0.001 &&
    Math.abs(backRect.w - rect.w) < 0.001 &&
    Math.abs(backRect.h - rect.h) < 0.001,
    "Rect round trip at zoom 2",
);

// Test 5: Rotated page (90 deg) round trip
// In a 90-deg rotated page, the effective width is 842, height is 595.
const rotPt = { x: 100, y: 100 };
const rotCss = pdfPtToCss(rotPt, rotatedPage, 1);
const rotBack = cssToPdfPt(rotCss, rotatedPage, 1);
assert(
    Math.abs(rotBack.x - rotPt.x) < 0.001 &&
    Math.abs(rotBack.y - rotPt.y) < 0.001,
    "Rotated page round trip",
);
const at = (rotation: 0 | 90 | 180 | 270, x: number, y: number) =>
  pdfPtToCss({ x, y }, { ...page, rotation }, 1);
const eq = (p: { x: number; y: number }, x: number, y: number, m: string) =>
  assert(Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6, m);
eq(at(90, 0, 0), 0, 0, "rot90 bottom-left -> top-left");
eq(at(90, 0, 842), 842, 0, "rot90 top-left -> top-right");
eq(at(180, 0, 0), 595, 0, "rot180 bottom-left -> top-right");
eq(at(270, 0, 0), 842, 595, "rot270 bottom-left -> bottom-right");
console.log("All coordinate tests passed!");
}

runTests();
