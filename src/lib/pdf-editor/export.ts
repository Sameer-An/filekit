// src/lib/pdf-editor/export.ts
// Serialise the editor's model into a real PDF using pdf-lib.
//
// Strategy:
//  1. Load original bytes.
//  2. If page ops move/delete/insert/duplicate/extract are queued, build a
//     new document that copies the selected pages in the final order.
//     Rotation is applied per-page. Appended bytes (merge) are copied in.
//  3. For each page, walk `pageObjectIds[page]` in z-order and draw:
//       - dirty text-runs: cover with sampled bg, redraw
//       - image-placement with replacement: cover, embed, draw
//       - new-text, new-image, shape, draw, highlight, underline, strike,
//         whiteout, redact, signature, link, note, stamp, checkmark
//     Untouched text-runs and untouched image placements are left alone —
//     the original content stream is preserved byte-for-byte.
//  4. Apply page-range cropping on the output if requested.
//  5. Save with `useObjectStreams` when `compress` is true.

import {
PDFDocument,
rgb,
degrees,
StandardFonts,
PDFPage,
PDFImage,
} from "pdf-lib";
import type {
ExportOptions,
ImagePlacementObject,
PDFObject,
PageInfo,
PageOp,
DrawObject,
ShapeObject,
NewTextObject,
TextRunObject,
LinkObject,
NoteObject,
StampObject,
SignatureObject,
CheckmarkObject,
HighlightObject,
UnderlineObject,
StrikeObject,
WhiteoutObject,
RedactObject,
NewImageObject,
} from "./types";
import {
resolveFontForTextRun,
resolveFontForNewText,
hexToRgbTriplet,
} from "./fonts";
import { applyPageOps } from "./page-ops";

interface ExportInput {
originalBytes: Uint8Array;
pages: PageInfo[];
objects: Record<string, PDFObject>;
pageObjectIds: string[][];
pageOps: PageOp[];
options: ExportOptions;
}

/** Top-level entry point. Returns the bytes of the final PDF. */
export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
const { originalBytes, pages, objects, pageObjectIds, pageOps, options } =
    input;

// 1. Load source.
const src = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
});

// 2. Apply page ops in the model first (so page indices line up).
const model = applyPageOps({ pages, pageObjectIds, objects }, pageOps);
const finalPages = model.pages;
const finalPageIds = model.pageObjectIds;
const finalObjects = model.objects;

// 3. Build target document.
let target: PDFDocument;
// Fast path: no ops that change page count/order → reuse `src` in place.
const hasStructuralOps = pageOps.some(
    (op) =>
    op.op === "move" ||
    op.op === "delete" ||
    op.op === "duplicate" ||
    op.op === "insert-blank" ||
    op.op === "extract" ||
    op.op === "merge",
);

const srcPageCount = src.getPageCount();

if (!hasStructuralOps && finalPages.length === srcPageCount) {
    target = src;
} else {
    target = await PDFDocument.create();
    // Copy pages in the order the model dictates. For each new page, find
    // its source index. `extract` shrinks the list; `duplicate` repeats.
    // We reconstruct source indices from the *original* `pages` array by
    // matching geometry+rotation where possible; a simpler approach is to
    // trust that finalPages[i] corresponds to original page `pages` before
    // any op that reordered — but that loses provenance on reorders.
    //
    // For v1 we handle reorder/delete/duplicate/insert in a pragmatic way:
    // take finalPages as authoritative for order, and copy source pages by
    // index from the *current* model before ops (which is exactly what the
    // caller passed: `pages`). That means:
    //   - move: pages were reordered; we copy by pageMap.
    //   - delete: shortened list.
    //   - duplicate: repeated source index.
    //   - insert-blank: new size, no source page.
    // Because `applyPageOps` already produced `finalPages`, we can infer
    // the source index for each final page by matching `finalPages[i]` to
    // `pages` by identity of `index` when possible, falling back to order.
    const srcIndices = inferSourceIndices(pages, finalPages, pageOps);
    // Copy all source pages we need, in original order, then reorder.
    const copyOrder = Array.from(new Set(srcIndices.filter((n) => n >= 0)));
    const copiedMap = new Map<number, PDFPage>();
    if (copyOrder.length > 0) {
    const copied = await target.copyPages(
        src,
        copyOrder.map((i) => Math.min(srcPageCount - 1, Math.max(0, i))),
    );
    copyOrder.forEach((srcIdx, k) => copiedMap.set(srcIdx, copied[k]));
    }
    for (let i = 0; i < finalPages.length; i++) {
    const srcIdx = srcIndices[i];
    if (srcIdx >= 0 && copiedMap.has(srcIdx)) {
        target.addPage(copiedMap.get(srcIdx)!);
    } else {
        target.addPage([finalPages[i].widthPt, finalPages[i].heightPt]);
    }
    }
    // 4. Merge appended bytes, if any.
    for (const op of pageOps) {
    if (op.op === "merge") {
        const appended = await PDFDocument.load(op.appendedBytes, {
        ignoreEncryption: true,
        });
        const copiedAppended = await target.copyPages(
        appended,
        appended.getPageIndices(),
        );
        copiedAppended.forEach((p) => target.addPage(p));
    }
    }
}

// 5. Apply rotation from the model.
const targetPages = target.getPages();
for (let i = 0; i < finalPages.length && i < targetPages.length; i++) {
    const want = finalPages[i].rotation;
    const cur = targetPages[i].getRotation().angle % 360;
    const delta = (want - cur + 360) % 360;
    if (delta !== 0) {
    targetPages[i].setRotation(degrees((cur + delta) % 360));
    }
}

// 6. Draw objects per page.
for (let pageIdx = 0; pageIdx < finalPages.length; pageIdx++) {
    const page = targetPages[pageIdx];
    if (!page) continue;
    const ids = finalPageIds[pageIdx] ?? [];
    for (const id of ids) {
    const obj = finalObjects[id];
    if (!obj) continue;
    await drawObject(target, page, obj, finalPages[pageIdx]);
    }
}

// 7. Optional page-range crop on output.
if (options.pageRange !== "all") {
    const { from, to } = options.pageRange;
    const total = target.getPageCount();
    const start = Math.max(0, Math.min(total - 1, from - 1));
    const end = Math.max(start, Math.min(total - 1, to - 1));
    if (start !== 0 || end !== total - 1) {
    const trimmed = await PDFDocument.create();
    const indices = [];
    for (let i = start; i <= end; i++) indices.push(i);
    const copied = await trimmed.copyPages(target, indices);
    copied.forEach((p) => trimmed.addPage(p));
    return trimmed.save({ useObjectStreams: options.compress });
    }
}

return target.save({ useObjectStreams: options.compress });
}

/* ───────────── Helpers ───────────── */

function inferSourceIndices(
original: PageInfo[],
final: PageInfo[],
ops: PageOp[],
): number[] {
// Heuristic: for each final page, try to find a matching original page by
// (index, width, height, rotation) triple. If the model didn't rotate,
// match by index. Duplicates share the same origin.
const byKey = new Map<string, number>();
for (const p of original) {
    byKey.set(`${p.index}|${p.widthPt}|${p.heightPt}`, p.index);
}
return final.map((p) => {
    const key = `${p.index}|${p.widthPt}|${p.heightPt}`;
    if (byKey.has(key)) return byKey.get(key)!;
    // Search by size+rotation as a fallback.
    const fallback = original.find(
    (o) =>
        o.widthPt === p.widthPt &&
        o.heightPt === p.heightPt &&
        o.rotation === p.rotation,
    );
    return fallback ? fallback.index : -1;
});
}

async function drawObject(
doc: PDFDocument,
page: PDFPage,
obj: PDFObject,
pageInfo: PageInfo,
): Promise<void> {
switch (obj.kind) {
    case "text-run":
    return drawTextRun(doc, page, obj, pageInfo);
    case "new-text":
    return drawNewText(doc, page, obj);
    case "image-placement":
    return drawImagePlacement(doc, page, obj);
    case "new-image":
    return drawNewImage(doc, page, obj);
    case "shape":
    return drawShape(page, obj);
    case "draw":
    return drawFreehand(page, obj);
    case "highlight":
    return drawHighlight(page, obj);
    case "underline":
    return drawUnderline(page, obj);
    case "strike":
    return drawStrike(page, obj);
    case "whiteout":
    return drawWhiteout(page, obj);
    case "redact":
    return drawRedact(page, obj);
    case "signature":
    return drawSignature(doc, page, obj);
    case "link":
    return drawLink(page, obj);
    case "note":
    return drawNote(page, obj);
    case "stamp":
    return drawStamp(page, obj);
    case "checkmark":
    return drawCheckmark(page, obj);
    default:
    return;
}
}

/* ───────────── Text ───────────── */

async function drawTextRun(
doc: PDFDocument,
page: PDFPage,
run: TextRunObject,
pageInfo: PageInfo,
): Promise<void> {
if (!run.dirty) return; // untouched — leave original content untouched
const rect = clampRect(run.rect, pageInfo);
// Cover with sampled background (never paint outside the page).
const [br, bg, bb] = hexToRgbTriplet(run.backgroundColor);
page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    color: rgb(br, bg, bb),
    opacity: 1,
});
// Redraw text.
const resolved = await resolveFontForTextRun(doc, run);
const [tr, tg, tb] = hexToRgbTriplet(run.color);
const color = rgb(tr, tg, tb);
const lines = wrapLines(
    run.text,
    run.fontSize,
    run.letterSpacing,
    rect.w,
    resolved.widthOfTextAtSize,
);
const lineH = run.fontSize * (run.lineHeight || 1.2);
const baselineY = rect.y + rect.h - run.fontSize * 0.85;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = baselineY - i * lineH;
    page.drawText(line, {
    x: rect.x,
    y,
    size: run.fontSize,
    font: resolved.font,
    color,
    opacity: run.opacity,
    });
    if (run.underline) {
    const w = resolved.widthOfTextAtSize(line, run.fontSize);
    page.drawLine({
        start: { x: rect.x, y: y - run.fontSize * 0.12 },
        end: { x: rect.x + w, y: y - run.fontSize * 0.12 },
        thickness: Math.max(0.5, run.fontSize * 0.06),
        color,
    });
    }
}
}

async function drawNewText(
doc: PDFDocument,
page: PDFPage,
obj: NewTextObject,
): Promise<void> {
const rect = obj.rect;
const resolved = await resolveFontForNewText(doc, obj);
const [r, g, b] = hexToRgbTriplet(obj.color);
const color = rgb(r, g, b);
const lines = wrapLines(
    obj.text,
    obj.fontSize,
    obj.letterSpacing,
    rect.w,
    resolved.widthOfTextAtSize,
);
const lineH = obj.fontSize * (obj.lineHeight || 1.2);
const baselineY = rect.y + rect.h - obj.fontSize * 0.85;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let x = rect.x;
    if (obj.align === "center") {
    x =
        rect.x + (rect.w - resolved.widthOfTextAtSize(line, obj.fontSize)) / 2;
    } else if (obj.align === "right") {
    x = rect.x + rect.w - resolved.widthOfTextAtSize(line, obj.fontSize);
    }
    const y = baselineY - i * lineH;
    page.drawText(line, {
    x,
    y,
    size: obj.fontSize,
    font: resolved.font,
    color,
    opacity: obj.opacity,
    });
    if (obj.underline) {
    const w = resolved.widthOfTextAtSize(line, obj.fontSize);
    page.drawLine({
        start: { x, y: y - obj.fontSize * 0.12 },
        end: { x: x + w, y: y - obj.fontSize * 0.12 },
        thickness: Math.max(0.5, obj.fontSize * 0.06),
        color,
    });
    }
}
}

function wrapLines(
text: string,
fontSize: number,
letterSpacing: number,
maxWidth: number,
measure: (s: string, size: number) => number,
): string[] {
if (!text) return [""];
const words = text.split(/(\s+)/); // keep whitespace tokens
const lines: string[] = [];
let current = "";
const measureWithSpacing = (s: string) =>
    measure(s, fontSize) + letterSpacing * Math.max(0, s.length - 1);
for (const w of words) {
    const candidate = current + w;
    if (measureWithSpacing(candidate) <= maxWidth || current === "") {
    current = candidate;
    } else {
    lines.push(current.trimEnd());
    current = w.trimStart();
    }
}
if (current) lines.push(current.trimEnd());
return lines.length ? lines : [""];
}

function clampRect(
rect: { x: number; y: number; w: number; h: number },
page: PageInfo,
) {
const w = Math.max(1, Math.min(rect.w, page.widthPt));
const h = Math.max(1, Math.min(rect.h, page.heightPt));
const x = Math.max(0, Math.min(rect.x, page.widthPt - w));
const y = Math.max(0, Math.min(rect.y, page.heightPt - h));
return { x, y, w, h };
}

/* ───────────── Images ───────────── */

async function drawImagePlacement(
doc: PDFDocument,
page: PDFPage,
obj: ImagePlacementObject,
): Promise<void> {
if (!obj.dirty || !obj.replacementDataUrl) return;
const rect = obj.rect;
// Cover the original placement so the swap looks clean.
const bg = hexToRgbTriplet("#ffffff");
page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    color: rgb(bg[0], bg[1], bg[2]),
    opacity: 1,
});
const img = await embedImageFromDataUrl(doc, obj.replacementDataUrl);
if (!img) return;
page.drawImage(img, {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    opacity: obj.opacity,
});
}

async function drawNewImage(
doc: PDFDocument,
page: PDFPage,
obj: NewImageObject,
): Promise<void> {
const img = await embedImageFromDataUrl(doc, obj.dataUrl);
if (!img) return;
page.drawImage(img, {
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    opacity: obj.opacity,
    rotate: degrees(obj.rotation),
});
}

async function embedImageFromDataUrl(
doc: PDFDocument,
dataUrl: string,
): Promise<PDFImage | null> {
try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (mime === "image/png") return await doc.embedPng(bytes);
    if (mime === "image/jpeg" || mime === "image/jpg")
    return await doc.embedJpg(bytes);
    return await doc.embedPng(bytes);
} catch {
    return null;
}
}

/* ───────────── Shapes ───────────── */

function drawShape(page: PDFPage, obj: ShapeObject): void {
const { x, y, w, h } = obj.rect;
const [sr, sg, sb] = hexToRgbTriplet(obj.stroke);
const strokeColor = rgb(sr, sg, sb);
const fillColor = obj.fill ? rgb(...hexToRgbTriplet(obj.fill)) : undefined;
if (obj.shape === "rect") {
    page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: strokeColor,
    borderWidth: obj.strokeWidth,
    color: fillColor,
    opacity: obj.opacity,
    borderOpacity: obj.opacity,
    });
} else if (obj.shape === "ellipse") {
    page.drawEllipse({
    x: x + w / 2,
    y: y + h / 2,
    xScale: w / 2,
    yScale: h / 2,
    borderColor: strokeColor,
    borderWidth: obj.strokeWidth,
    color: fillColor,
    opacity: obj.opacity,
    borderOpacity: obj.opacity,
    });
} else if (obj.shape === "line") {
    page.drawLine({
    start: { x, y },
    end: { x: x + w, y: y + h },
    thickness: obj.strokeWidth,
    color: strokeColor,
    opacity: obj.opacity,
    });
} else if (obj.shape === "arrow") {
    page.drawLine({
    start: { x, y },
    end: { x: x + w, y: y + h },
    thickness: obj.strokeWidth,
    color: strokeColor,
    opacity: obj.opacity,
    });
    const angle = Math.atan2(h, w);
    const headLen = Math.min(16, Math.hypot(w, h) / 3);
    for (const off of [Math.PI * 0.85, -Math.PI * 0.85]) {
    page.drawLine({
        start: { x: x + w, y: y + h },
        end: {
        x: x + w + Math.cos(angle + off) * headLen,
        y: y + h + Math.sin(angle + off) * headLen,
        },
        thickness: obj.strokeWidth,
        color: strokeColor,
        opacity: obj.opacity,
    });
    }
}
}

/* ───────────── Freehand ───────────── */

function drawFreehand(page: PDFPage, obj: DrawObject): void {
const [r, g, b] = hexToRgbTriplet(obj.stroke);
const color = rgb(r, g, b);
for (const stroke of obj.strokes) {
    if (stroke.points.length < 2) continue;
    // Simple polyline; the editor side uses perfect-freehand for the live
    // preview but exports the raw points to keep the file small.
    for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1];
    const c = stroke.points[i];
    page.drawLine({
        start: { x: obj.rect.x + a[0], y: obj.rect.y + a[1] },
        end: { x: obj.rect.x + c[0], y: obj.rect.y + c[1] },
        thickness: obj.strokeWidth,
        color,
        opacity: obj.opacity,
    });
    }
}
}

/* ───────────── Annotation overlays ───────────── */

function drawHighlight(page: PDFPage, obj: HighlightObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    color: rgb(r, g, b),
    opacity: Math.min(0.6, obj.opacity * 0.6),
});
}
function drawUnderline(page: PDFPage, obj: UnderlineObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawLine({
    start: { x: obj.rect.x, y: obj.rect.y },
    end: { x: obj.rect.x + obj.rect.w, y: obj.rect.y },
    thickness: obj.strokeWidth,
    color: rgb(r, g, b),
    opacity: obj.opacity,
});
}
function drawStrike(page: PDFPage, obj: StrikeObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawLine({
    start: { x: obj.rect.x, y: obj.rect.y + obj.rect.h / 2 },
    end: { x: obj.rect.x + obj.rect.w, y: obj.rect.y + obj.rect.h / 2 },
    thickness: obj.strokeWidth,
    color: rgb(r, g, b),
    opacity: obj.opacity,
});
}
function drawWhiteout(page: PDFPage, obj: WhiteoutObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    color: rgb(r, g, b),
    opacity: 1,
});
}
function drawRedact(page: PDFPage, obj: RedactObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    color: rgb(r, g, b),
    opacity: 1,
});
}
async function drawSignature(
doc: PDFDocument,
page: PDFPage,
obj: SignatureObject,
): Promise<void> {
const img = await embedImageFromDataUrl(doc, obj.dataUrl);
if (!img) return;
page.drawImage(img, {
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    opacity: obj.opacity,
    rotate: degrees(obj.rotation),
});
}
function drawLink(page: PDFPage, obj: LinkObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    borderColor: rgb(r, g, b),
    borderWidth: 1,
    opacity: 0,
    borderOpacity: 1,
});
}
function drawNote(page: PDFPage, obj: NoteObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    color: rgb(r, g, b),
    opacity: Math.min(0.35, obj.opacity),
    borderColor: rgb(r * 0.5, g * 0.5, b * 0.5),
    borderWidth: 1,
});
}
function drawStamp(page: PDFPage, obj: StampObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
page.drawRectangle({
    x: obj.rect.x,
    y: obj.rect.y,
    width: obj.rect.w,
    height: obj.rect.h,
    borderColor: rgb(r, g, b),
    borderWidth: 2,
    opacity: 0,
});
}
function drawCheckmark(page: PDFPage, obj: CheckmarkObject): void {
const [r, g, b] = hexToRgbTriplet(obj.color);
const { x, y, w, h } = obj.rect;
page.drawLine({
    start: { x: x + w * 0.2, y: y + h * 0.5 },
    end: { x: x + w * 0.45, y: y + h * 0.25 },
    thickness: 2,
    color: rgb(r, g, b),
    opacity: obj.opacity,
});
page.drawLine({
    start: { x: x + w * 0.45, y: y + h * 0.25 },
    end: { x: x + w * 0.85, y: y + h * 0.8 },
    thickness: 2,
    color: rgb(r, g, b),
    opacity: obj.opacity,
});
}
