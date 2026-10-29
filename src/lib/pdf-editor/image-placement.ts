// src/lib/pdf-editor/image-placement.ts
// Extract image placements from a pdfjs page. We use pdfjs's operator list
// and walk the `paintImage*` operators while tracking the current transform.
// Each placement becomes an ImagePlacementObject so the editor can select,
// move, replace or delete it.
import { pageUid } from "./coords";
import type { PDFPageProxy } from "pdfjs-dist";
import type { ImagePlacementObject, PageInfo, RectPt } from "./types";

/** Subset of pdfjs `getOperatorList()` result we consume. */
interface OpsLike {
fnArray: number[];
argsArray: unknown[][];
}

/** pdfjs OPS enum values we care about. Values are stable in v6. */
const OPS = {
save: 10,
restore: 11,
transform: 12,
paintImageMaskXObject: 83,
paintImageXObject: 84,
paintInlineImageXObject: 85,
paintSolidColorImageMask: 86,
};

/** A 2D matrix [a b c d e f] following PDF conventions. */
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m: Mat, n: Mat): Mat {
// m * n, standard 2D affine composition.
return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
];
}

function applyMat(m: Mat, x: number, y: number): [number, number] {
return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Convert a unit square (0,0)-(1,1) transformed by `m` into a PDF-space rect. */
function unitSquareToRect(m: Mat): RectPt {
const corners = [
    applyMat(m, 0, 0),
    applyMat(m, 1, 0),
    applyMat(m, 1, 1),
    applyMat(m, 0, 1),
];
const xs = corners.map((c) => c[0]);
const ys = corners.map((c) => c[1]);
const x = Math.min(...xs);
const y = Math.min(...ys);
return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function isPlausibleImageRect(rect: RectPt, page: PageInfo): boolean {
if (rect.w <= 0.5 || rect.h <= 0.5) return false;
// Allow up to 10× page size; images placed with a huge scaling matrix
// sometimes overshoot to produce clipping masks. We keep the rect but
// clamp the display size in the UI.
if (rect.w > page.widthPt * 10 || rect.h > page.heightPt * 10) return false;
return true;
}

/** Decode a pdfjs image object (typed array + kind) to a data URL. */
async function imageObjectToDataUrl(img: {
width: number;
height: number;
kind?: number;
data?: Uint8Array;
}): Promise<string | null> {
if (!img?.width || !img?.height || !img?.data) return null;
const { width, height, kind, data } = img;
// kind === 1 → GRAYSCALE_1BPP; kind === 2 → RGB_24BPP; kind === 3 → RGBA_32BPP
// Anything else, we try to interpret as RGBA.
const expected = kind === 2 ? width * height * 3 : width * height * 4;

let rgba: Uint8ClampedArray | null = null;
if (data.length >= width * height * 4) {
    rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, expected);
} else if (kind === 2 || data.length >= width * height * 3) {
    // Expand RGB → RGBA
    const src = data;
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    out[i * 4] = src[j];
    out[i * 4 + 1] = src[j + 1];
    out[i * 4 + 2] = src[j + 2];
    out[i * 4 + 3] = 255;
    }
    rgba = out;
} else if (kind === 1) {
    // 1bpp bitmap; expand
    const out = new Uint8ClampedArray(width * height * 4);
    const bytesPerRow = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const byte = data[y * bytesPerRow + (x >> 3)];
        const bit = (byte >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * width + x) * 4;
        out[i] = v;
        out[i + 1] = v;
        out[i + 2] = v;
        out[i + 3] = 255;
    }
    }
    rgba = out;
}

if (!rgba) return null;

if (typeof document === "undefined") return null;
const canvas = document.createElement("canvas");
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext("2d");
if (!ctx) return null;
const imageData = new ImageData(rgba, width, height);
ctx.putImageData(imageData, 0, 0);
try {
    return canvas.toDataURL("image/png");
} catch {
    return null;
}
}

/** Resolve an image object from pdfjs `page.objs` by name. */
function resolveImageObject(
page: PDFPageProxy,
name: string,
): Promise<{
width: number;
height: number;
kind?: number;
data?: Uint8Array;
} | null> {
return new Promise((resolve) => {
    try {
    const objs = page.objs as unknown as {
        has?: (k: string) => boolean;
        get?: (k: string, cb?: (v: unknown) => void) => unknown;
    };
    if (objs.has && !objs.has(name)) return resolve(null);
    if (!objs.get) return resolve(null);
    if (objs.has && !objs.has(name)) return resolve(null);
    // Some pdfjs versions return synchronously, some via callback.
    const maybe = objs.get(name);
    if (maybe && typeof (maybe as { width?: number }).width === "number") {
        resolve(
        maybe as {
            width: number;
            height: number;
            data?: Uint8Array;
            kind?: number;
        },
        );
        return;
    }
    // Async path
    try {
        objs.get(name, (v) =>
        resolve(
            v as {
            width: number;
            height: number;
            data?: Uint8Array;
            kind?: number;
            } | null,
        ),
        );
    } catch {
        resolve(null);
    }
    } catch {
    resolve(null);
    }
});
}

/** Deterministic id per (page, z-index) so re-extraction is stable. */
function makePlacementId(pageKey: string, z: number): string {
return `img-${pageKey}-${z}`;
}

/**
 * Extract all image placements on a page.
 * `pageCanvas` is optional; if provided, we render data URLs for each
 * embedded image so the user sees the original.
 */
export async function extractImagePlacements(
page: PDFPageProxy,
pageInfo: PageInfo,
): Promise<ImagePlacementObject[]> {
let ops: OpsLike;
try {
    ops = (await page.getOperatorList()) as unknown as OpsLike;
} catch {
    return [];
}
const stack: Mat[] = [IDENTITY.slice() as Mat];
const out: ImagePlacementObject[] = [];
const seen = new Set<string>();

const current = () => stack[stack.length - 1];

for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] ?? [];

    if (fn === OPS.save) {
    stack.push(current().slice() as Mat);
    continue;
    }
    if (fn === OPS.restore) {
    if (stack.length > 1) stack.pop();
    continue;
    }
    if (fn === OPS.transform) {
    const m = args as number[];
    const mat: Mat = [m[0], m[1], m[2], m[3], m[4], m[5]];
    stack[stack.length - 1] = matMul(current(), mat);
    continue;
    }

    if (
    fn === OPS.paintImageXObject ||
    fn === OPS.paintInlineImageXObject ||
    fn === OPS.paintImageMaskXObject
    ) {
    // For paintImageXObject the first arg is a name; for inline/mask it's
    // the image object itself. Geometry is always the current transform
    // applied to the unit square.
    const rect = unitSquareToRect(current());
    if (!isPlausibleImageRect(rect, pageInfo)) continue;

    const z = out.length;
    const id = makePlacementId(pageUid(pageInfo), z);
    if (seen.has(id)) continue;
    seen.add(id);

    const obj: ImagePlacementObject = {
        id,
        kind: "image-placement",
        page: pageInfo.index,
        rect,
        rotation: 0,
        z,
        locked: false,
        opacity: 1,
        dirty: false,
        dataUrl: null,
        replacementDataUrl: null,
        naturalWidthPt: rect.w,
        naturalHeightPt: rect.h,
    };
    out.push(obj);

    // Try to resolve the actual pixels (best-effort).
    const first = args[0];
    if (fn === OPS.paintImageXObject && typeof first === "string") {
        void resolveImageObject(page, first).then(async (img) => {
        if (!img) return;
        const dataUrl = await imageObjectToDataUrl(img);
        if (dataUrl) obj.dataUrl = dataUrl;
        // `obj` is already in `out`; mutating is fine for the caller
        // because the store merges by id.
        });
    } else if (
        fn === OPS.paintInlineImageXObject &&
        first &&
        typeof first === "object"
    ) {
        const img = first as {
        width: number;
        height: number;
        data?: Uint8Array;
        kind?: number;
        };
        const dataUrl = await imageObjectToDataUrl(img);
        if (dataUrl) obj.dataUrl = dataUrl;
    }
    }
}

return out;
}

/**
 * Merge freshly-extracted placements with any existing ones.
 * Existing placements keep their edits (position, replacement) if the id
 * matches; new placements are added; deleted placements stay deleted
 * (they don't appear in `fresh`).
 */
export function reconcileImagePlacements(
existing: ImagePlacementObject[],
fresh: ImagePlacementObject[],
): ImagePlacementObject[] {
const byId = new Map(existing.map((p) => [p.id, p]));
const merged: ImagePlacementObject[] = [];
const used = new Set<string>();

for (const p of fresh) {
    const prior = byId.get(p.id);
    if (prior) {
    merged.push({ ...prior, dataUrl: prior.dataUrl ?? p.dataUrl });
    used.add(prior.id);
    } else {
    merged.push(p);
    }
}

for (const p of existing) {
    if (!used.has(p.id) && p.dirty) merged.push(p);
}

return merged;
}
