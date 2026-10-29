// src/lib/pdf-editor/fonts.ts
// Font resolution for export. Standard 14 first (fast, no assets). If the
// user's text contains characters outside WinAnsi or the source font can't
// be mapped to a standard 14 face, we lazily fetch the bundled Noto Sans
// (Regular or Bold) and embed it once per PDFDocument.
//
// Cache key: PDFDocument → { standard14: Map, noto: Map }.

import type { PDFDocument, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { TextRunObject, NewTextObject } from "./types";

/** Hex colour → pdf-lib rgb() components. Kept here so `export.ts` stays lean. */
export function hexToRgbTriplet(hex: string): [number, number, number] {
const clean = hex.replace(/^#/, "");
const full =
    clean.length === 3
    ? clean
        .split("")
        .map((c) => c + c)
        .join("")
    : clean.padEnd(6, "0").slice(0, 6);
const n = parseInt(full, 16) || 0;
return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Fonts known to render with the standard 14 built-in. */
type Standard14Name =
| "Helvetica"
| "Helvetica-Bold"
| "Helvetica-Oblique"
| "Helvetica-BoldOblique"
| "Times-Roman"
| "Times-Bold"
| "Times-Italic"
| "Times-BoldItalic"
| "Courier"
| "Courier-Bold"
| "Courier-Oblique"
| "Courier-BoldOblique";

/** StandardFonts enum name mapping. */
const STANDARD_MAP: Record<string, Standard14Name> = {
Helvetica: "Helvetica",
"Helvetica-Bold": "Helvetica-Bold",
"Helvetica-Oblique": "Helvetica-Oblique",
"Helvetica-BoldOblique": "Helvetica-BoldOblique",
"Times-Roman": "Times-Roman",
"Times-Bold": "Times-Bold",
"Times-Italic": "Times-Italic",
"Times-BoldItalic": "Times-BoldItalic",
Courier: "Courier",
"Courier-Bold": "Courier-Bold",
"Courier-Oblique": "Courier-Oblique",
"Courier-BoldOblique": "Courier-BoldOblique",
};

/** Standard 14 lookup by family + bold + italic. */
function standard14For(
family: string,
bold: boolean,
italic: boolean,
): Standard14Name {
const f = family.toLowerCase();
if (f.startsWith("times")) {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
}
if (f.startsWith("courier") || f.startsWith("mono")) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
}
// Default to Helvetica variants
if (bold && italic) return "Helvetica-BoldOblique";
if (bold) return "Helvetica-Bold";
if (italic) return "Helvetica-Oblique";
return "Helvetica";
}

/**
 * WinAnsi covers Latin-1 plus a handful of typographic punctuation.
 * If every codepoint is within 0x00–0xFF we can use a standard 14 face.
 * Anything outside → we must use Noto.
 */
export function isWinAnsiSafe(text: string): boolean {
for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) return false;
}
return true;
}

/** Convenience wrapper for readability in export.ts. */
export function needsNoto(text: string): boolean {
return !isWinAnsiSafe(text);
}

/* ───────────── Embedded font cache ───────────── */

interface DocCache {
fontkitRegistered: boolean;
standard: Map<Standard14Name, PDFFont>;
noto: Map<"regular" | "bold", PDFFont>;
}

const DOC_CACHE = new WeakMap<PDFDocument, DocCache>();

function cacheFor(doc: PDFDocument): DocCache {
let c = DOC_CACHE.get(doc);
if (!c) {
    c = {
    fontkitRegistered: false,
    standard: new Map(),
    noto: new Map(),
    };
    DOC_CACHE.set(doc, c);
}
return c;
}

function ensureFontkit(doc: PDFDocument, cache: DocCache): void {
if (cache.fontkitRegistered) return;
doc.registerFontkit(fontkit);
cache.fontkitRegistered = true;
}

/* ───────────── Noto fetch (lazy) ───────────── */

const NOTO_URLS = {
regular: "/fonts/NotoSans-Regular.woff2",
bold: "/fonts/NotoSans-Bold.woff2",
} as const;

const NOTO_BYTES_CACHE: Partial<
Record<"regular" | "bold", Promise<Uint8Array>>
> = {};

function fetchNotoBytes(weight: "regular" | "bold"): Promise<Uint8Array> {
const existing = NOTO_BYTES_CACHE[weight];
if (existing) return existing;
const p = fetch(NOTO_URLS[weight], { cache: "force-cache" })
    .then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${NOTO_URLS[weight]}`);
    return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b));
NOTO_BYTES_CACHE[weight] = p;
return p;
}

async function loadNoto(
doc: PDFDocument,
weight: "regular" | "bold",
): Promise<PDFFont> {
const cache = cacheFor(doc);
const existing = cache.noto.get(weight);
if (existing) return existing;
ensureFontkit(doc, cache);
const bytes = await fetchNotoBytes(weight);
const font = await doc.embedFont(bytes, { subset: true });
cache.noto.set(weight, font);
return font;
}

/* ───────────── Standard 14 loader ───────────── */

async function loadStandard(
doc: PDFDocument,
name: Standard14Name,
): Promise<PDFFont> {
const cache = cacheFor(doc);
const existing = cache.standard.get(name);
if (existing) return existing;
// `StandardFonts` is an enum-like object in pdf-lib. We import lazily to
// keep this module's top-level surface small.
const { StandardFonts } = await import("pdf-lib");
const font = await doc.embedFont(StandardFonts[name]);
cache.standard.set(name, font);
return font;
}

/* ───────────── Public API ───────────── */

export interface ResolvedFont {
font: PDFFont;
/** Width of the string at the given size, in points. */
widthOfTextAtSize: (text: string, size: number) => number;
/** True if we substituted Noto for an unmatched source font. */
substituted: boolean;
/** Which physical face we ended up with (for UI notices). */
face: "standard14" | "noto-regular" | "noto-bold";
}

/**
 * Pick the best font for a run and embed it once per document.
 * Rules:
 *  1. If the text needs Noto (non-WinAnsi), use Noto (bold if bold).
 *  2. Else if the family maps to a standard 14 face, use it.
 *  3. Else use Noto (regular/bold).
 */
export async function resolveFontForRun(
doc: PDFDocument,
input: {
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    text: string;
},
): Promise<ResolvedFont> {
const { fontFamily, bold, italic, text } = input;

if (needsNoto(text)) {
    const face = bold ? "noto-bold" : "noto-regular";
    const font = await loadNoto(doc, bold ? "bold" : "regular");
    return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: true,
    face,
    };
}

const lower = fontFamily.toLowerCase();
const isStandardFamily =
    lower.startsWith("helvetica") ||
    lower.startsWith("times") ||
    lower.startsWith("courier") ||
    lower.startsWith("symbol") ||
    lower.startsWith("zapf");

if (isStandardFamily) {
    const name = standard14For(fontFamily, bold, italic);
    const font = await loadStandard(doc, name);
    return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: false,
    face: "standard14",
    };
}

const face = bold ? "noto-bold" : "noto-regular";
const font = await loadNoto(doc, bold ? "bold" : "regular");
return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: true,
    face,
};
}

/**
 * Resolve font + also tell the caller whether the *source* font already
 * required a substitute (so we can flag the run with a small notice).
 */
export async function resolveFontForTextRun(
doc: PDFDocument,
run: TextRunObject,
): Promise<ResolvedFont> {
const resolved = await resolveFontForRun(doc, {
    fontFamily: run.fontFamily,
    bold: run.bold,
    italic: run.italic,
    text: run.text,
});
// A run is "substituted" if either the source was non-standard or the
// text needs Noto. We store the flag back on the run.
const sourceWasStandard = /^(helvetica|times|courier|symbol|zapf)/i.test(
    run.fontFamily,
);
const wasSubstituted =
    !sourceWasStandard || needsNoto(run.text) || resolved.face !== "standard14";
return { ...resolved, substituted: wasSubstituted };
}

/** Resolve font for a new text object the same way as a run. */
export function resolveFontForNewText(
doc: PDFDocument,
obj: NewTextObject,
): Promise<ResolvedFont> {
return resolveFontForRun(doc, {
    fontFamily: obj.fontFamily,
    bold: obj.bold,
    italic: obj.italic,
    text: obj.text,
});
}

/** Human-friendly notice the UI can show on a substituted run. */
export function fontNotice(
run: Pick<TextRunObject, "substituted" | "sourceFontName">,
): string | null {
if (!run.substituted) return null;
return `Font substituted (${run.sourceFontName || "unknown"} → Noto Sans)`;
}

/** Reset per-document font caches (used by tests and by re-export). */
export function clearFontCache(doc: PDFDocument): void {
DOC_CACHE.delete(doc);
}
