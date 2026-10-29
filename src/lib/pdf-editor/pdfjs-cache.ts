// src/lib/pdf-editor/pdfjs-cache.ts
// Shared cache for the single loaded PDF document. Both PageCanvas and
// ThumbnailSidebar use this to avoid loading the document multiple times.

import { loadPdfDocument } from "./pdfjs";
import type { LoadedPdf } from "./pdfjs";

let cachedBytes: Uint8Array | null = null;
let cachedPromise: Promise<LoadedPdf> | null = null;

export function getCachedPdf(bytes: Uint8Array): Promise<LoadedPdf> {
if (cachedBytes === bytes && cachedPromise) return cachedPromise;
cachedBytes = bytes;
cachedPromise = loadPdfDocument(bytes);
return cachedPromise;
}
