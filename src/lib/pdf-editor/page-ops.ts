// src/lib/pdf-editor/page-ops.ts
// Pure helpers for page reordering / rotation / delete / duplicate / insert.
// These functions never touch pdf-lib or pdfjs — they operate on the
// editor's own model (PageInfo[], pageObjectIds, objects map) so the UI
// stays responsive and export.ts can apply the same logic to the real PDF.

import type { PageInfo, PageOp, PDFObject, RectPt } from "./types";

export interface PageOpResult {
pages: PageInfo[];
pageObjectIds: string[][];
objects: Record<string, PDFObject>;
/** Mapping original page index → new page index (or -1 if deleted). */
pageMap: Record<number, number>;
}

/** Clone a PageInfo so callers can mutate without surprises. */
export function clonePageInfo(p: PageInfo): PageInfo {
return {
    index: p.index,
    widthPt: p.widthPt,
    heightPt: p.heightPt,
    rotation: p.rotation,
};
}

/** Default blank-page size derived from a neighbouring page. */
export function defaultBlankSize(
pages: PageInfo[],
afterIndex: number,
): { widthPt: number; heightPt: number } {
const neighbour = pages[afterIndex] ?? pages[pages.length - 1];
if (neighbour) {
    return { widthPt: neighbour.widthPt, heightPt: neighbour.heightPt };
}
// US Letter at 72 dpi
return { widthPt: 612, heightPt: 792 };
}

/**
 * Apply a single PageOp to the model. Returns a fresh result object;
 * inputs are never mutated.
 */
export function applyPageOp(
state: {
    pages: PageInfo[];
    pageObjectIds: string[][];
    objects: Record<string, PDFObject>;
},
op: PageOp,
): PageOpResult {
const pages = state.pages.map(clonePageInfo);
const pageObjectIds = state.pageObjectIds.map((ids) => ids.slice());
const objects = { ...state.objects };

switch (op.op) {
    case "move": {
    const from = op.fromIndex;
    const to = op.toIndex;
    if (
        from < 0 ||
        from >= pages.length ||
        to < 0 ||
        to >= pages.length ||
        from === to
    ) {
        return identityResult(pages, pageObjectIds, objects);
    }
    const [movedPage] = pages.splice(from, 1);
    pages.splice(to, 0, movedPage);
    const [movedIds] = pageObjectIds.splice(from, 1);
    pageObjectIds.splice(to, 0, movedIds);
    // Recompute page numbers on all objects.
    pages.forEach((_, newIdx) => {
        for (const id of pageObjectIds[newIdx]) {
        const o = objects[id];
        if (o) objects[id] = { ...o, page: newIdx };
        }
    });
    return buildResult(pages, pageObjectIds, objects);
    }
    case "rotate": {
    const idx = op.index;
    if (idx < 0 || idx >= pages.length) {
        return identityResult(pages, pageObjectIds, objects);
    }
    const p = pages[idx];
    const newRotation = ((p.rotation + op.delta) % 360) as 0 | 90 | 180 | 270;
    pages[idx] = { ...p, rotation: newRotation };
    return buildResult(pages, pageObjectIds, objects);
    }
    case "delete": {
    const idx = op.index;
    if (idx < 0 || idx >= pages.length) {
        return identityResult(pages, pageObjectIds, objects);
    }
    const [removedIds] = pageObjectIds.splice(idx, 1);
    pages.splice(idx, 1);
    // Delete all objects that lived on that page.
    for (const id of removedIds) delete objects[id];
    // Recompute page numbers.
    pages.forEach((_, newIdx) => {
        for (const id of pageObjectIds[newIdx]) {
        const o = objects[id];
        if (o) objects[id] = { ...o, page: newIdx };
        }
    });
    return buildResult(pages, pageObjectIds, objects);
    }
    case "duplicate": {
    const idx = op.index;
    if (idx < 0 || idx >= pages.length) {
        return identityResult(pages, pageObjectIds, objects);
    }
    const srcPage = pages[idx];
    const srcIds = pageObjectIds[idx];
    const newIds: string[] = [];
    for (const srcId of srcIds) {
        const src = objects[srcId];
        if (!src) continue;
        const newId = `${src.kind}-${crypto.randomUUID()}`;
        objects[newId] = { ...src, id: newId, page: idx + 1 };
        newIds.push(newId);
    }
    pages.splice(idx + 1, 0, { ...clonePageInfo(srcPage), index: idx + 1 });
    pageObjectIds.splice(idx + 1, 0, newIds);
    // Recompute page numbers.
    pages.forEach((_, newIdx) => {
        for (const id of pageObjectIds[newIdx]) {
        const o = objects[id];
        if (o) objects[id] = { ...o, page: newIdx };
        }
    });
    return buildResult(pages, pageObjectIds, objects);
    }
    case "insert-blank": {
    const after = op.afterIndex;
    const insertAt = Math.max(0, Math.min(pages.length, after + 1));
    const newPage: PageInfo = {
        index: insertAt,
        widthPt: op.widthPt,
        heightPt: op.heightPt,
        rotation: 0,
    };
    pages.splice(insertAt, 0, newPage);
    pageObjectIds.splice(insertAt, 0, []);
    // Recompute page numbers.
    pages.forEach((_, newIdx) => {
        for (const id of pageObjectIds[newIdx]) {
        const o = objects[id];
        if (o) objects[id] = { ...o, page: newIdx };
        }
    });
    return buildResult(pages, pageObjectIds, objects);
    }
    case "extract": {
    // Keep only the requested indices, in the order given.
    const wanted = op.indices.filter((i) => i >= 0 && i < pages.length);
    const newPages = wanted.map((i) => clonePageInfo(pages[i]));
    const newIds = wanted.map((i) => pageObjectIds[i].slice());
    // Collect kept object ids and rebuild the objects map from scratch.
    const kept = new Set<string>();
    for (const ids of newIds) for (const id of ids) kept.add(id);
    const newObjects: Record<string, PDFObject> = {};
    newPages.forEach((_, newIdx) => {
        for (const id of newIds[newIdx]) {
        const o = objects[id];
        if (o) newObjects[id] = { ...o, page: newIdx };
        }
    });
    return buildResult(newPages, newIds, newObjects);
    }
    case "merge": {
    // Appended bytes are applied at export time; here we just record
    // the op so the exporter knows to append. UI does not change.
    return identityResult(pages, pageObjectIds, objects);
    }
    default:
    return identityResult(pages, pageObjectIds, objects);
}
}

/** Apply a list of page ops in order. */
export function applyPageOps(
state: {
    pages: PageInfo[];
    pageObjectIds: string[][];
    objects: Record<string, PDFObject>;
},
ops: PageOp[],
): PageOpResult {
let cur: PageOpResult = {
    pages: state.pages.map(clonePageInfo),
    pageObjectIds: state.pageObjectIds.map((ids) => ids.slice()),
    objects: { ...state.objects },
    pageMap: {},
};
for (const op of ops) {
    cur = applyPageOp(cur, op);
}
return cur;
}

function identityResult(
pages: PageInfo[],
pageObjectIds: string[][],
objects: Record<string, PDFObject>,
): PageOpResult {
const pageMap: Record<number, number> = {};
pages.forEach((_, i) => (pageMap[i] = i));
return { pages, pageObjectIds, objects, pageMap };
}

function buildResult(
pages: PageInfo[],
pageObjectIds: string[][],
objects: Record<string, PDFObject>,
): PageOpResult {
const pageMap: Record<number, number> = {};
pages.forEach((_, i) => (pageMap[i] = i));
return { pages, pageObjectIds, objects, pageMap };
}

/** Convenience for callers that want to rotate every page. */
export function rotateAll(
pages: PageInfo[],
delta: 90 | 180 | 270,
): PageInfo[] {
return pages.map((p) => ({
    ...clonePageInfo(p),
    rotation: ((p.rotation + delta) % 360) as 0 | 90 | 180 | 270,
}));
}

/** Convenience: shift a rect by a delta (used when moving a page's content). */
export function translateRect(rect: RectPt, dx: number, dy: number): RectPt {
return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}
