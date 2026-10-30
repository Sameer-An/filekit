// src/lib/pdf-editor/fonts.ts
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { TextRunObject, NewTextObject } from "./types";

// Polyfill regeneratorRuntime in environments where fontkit requires it for complex scripts (e.g. Indic)
if (typeof globalThis !== "undefined" && !("regeneratorRuntime" in globalThis)) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("regenerator-runtime/runtime.js");
  } catch {
    // Continue if regenerator-runtime is unavailable
  }
}

export interface ResolvedFont {
  font: PDFFont;
  widthOfTextAtSize: (text: string, size: number) => number;
  substituted: boolean;
  face: string;
}

export function hexToRgbTriplet(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function needsNoto(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) return true;
  }
  return false;
}

/** Cache each embedded font per PDFDocument so a font is fetched and embedded only once. */
const documentFontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

function getCachedFont(doc: PDFDocument, cacheKey: string): PDFFont | undefined {
  const map = documentFontCache.get(doc);
  return map?.get(cacheKey);
}

function setCachedFont(doc: PDFDocument, cacheKey: string, font: PDFFont): void {
  let map = documentFontCache.get(doc);
  if (!map) {
    map = new Map<string, PDFFont>();
    documentFontCache.set(doc, map);
  }
  map.set(cacheKey, font);
}

/** Maps standard font families to PDF standard fonts and their style variants. */
function standardFontFor(
  family: string,
  bold: boolean,
  italic: boolean,
): (typeof StandardFonts)[keyof typeof StandardFonts] {
  const f = family.toLowerCase();

  if (
    f.includes("times") ||
    f.includes("georgia") ||
    f.includes("garamond") ||
    f.includes("cambria")
  ) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (f.includes("courier")) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;

  return StandardFonts.Helvetica;
}

/** Embeds a standard PDF font with per-document caching. */
async function getOrEmbedStandardFont(
  doc: PDFDocument,
  standardFont: (typeof StandardFonts)[keyof typeof StandardFonts],
): Promise<PDFFont> {
  const cacheKey = `standard:${standardFont}`;
  const cached = getCachedFont(doc, cacheKey);
  if (cached) return cached;

  const font = await doc.embedFont(standardFont);
  setCachedFont(doc, cacheKey, font);
  return font;
}

/** Helper to load font binary in both browser (fetch) and server/test environments (fs). */
async function loadFontBuffer(fileName: string, ext: string): Promise<ArrayBuffer | null> {
  if (typeof window === "undefined") {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const fullPath = path.resolve(process.cwd(), "public", "fonts", `${fileName}${ext}`);
      const buf = await fs.readFile(fullPath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(`/fonts/${fileName}${ext}`);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

const SUPPORTED_EXTENSIONS = [".woff2", ".woff", ".ttf"] as const;

/** Resolves a custom font file and embeds it into the PDF with caching. */
async function embedCustomFont(doc: PDFDocument, fileName: string): Promise<PDFFont> {
  const cacheKey = `custom:${fileName}`;
  const cached = getCachedFont(doc, cacheKey);
  if (cached) return cached;

  try {
    doc.registerFontkit(fontkit);
  } catch {
    // Fontkit may already be registered on this doc
  }

  for (const ext of SUPPORTED_EXTENSIONS) {
    const bytes = await loadFontBuffer(fileName, ext);
    if (!bytes) continue;

    try {
      // Fontkit doesn't support subsetting WOFF2 (throws RangeError during doc.save).
      // For WOFF2, embed without subsetting; for TTF/OTF, embed with subsetting.
      const font = ext === ".woff2"
        ? await doc.embedFont(bytes)
        : await doc.embedFont(bytes, { subset: true });

      setCachedFont(doc, cacheKey, font);
      return font;
    } catch {
      // Try next extension if embedding this extension failed
      continue;
    }
  }

  throw new Error(`Could not load or embed font: ${fileName}`);
}

/** Custom font file base mappings shipped in public/fonts. */
const CUSTOM_FONT_MAP: Record<string, { regular: string; bold: string }> = {
  "Noto Sans": {
    regular: "NotoSans-Regular",
    bold: "NotoSans-Bold",
  },
};

export async function resolveFontForRun(
  doc: PDFDocument,
  input: {
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    text: string;
  },
): Promise<ResolvedFont> {
  const { text, bold, italic, fontFamily } = input;

  try {
    // If text needs Noto for extended Unicode coverage (non-Latin) or fontFamily is Noto Sans
    if (needsNoto(text) || fontFamily === "Noto Sans") {
      const variant = bold ? "NotoSans-Bold" : "NotoSans-Regular";
      try {
        const font = await embedCustomFont(doc, variant);
        return {
          font,
          widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
          substituted: fontFamily !== "Noto Sans",
          face: "Noto Sans",
        };
      } catch {
        // Fall back to Helvetica if Noto loading fails
        const font = await getOrEmbedStandardFont(
          doc,
          standardFontFor("Helvetica", bold, italic),
        );
        return {
          font,
          widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
          substituted: true,
          face: "Helvetica (fallback)",
        };
      }
    }

    // Check custom font files shipped in public/fonts
    const customConfig = CUSTOM_FONT_MAP[fontFamily];
    if (customConfig) {
      try {
        const fileBase = bold ? customConfig.bold : customConfig.regular;
        const font = await embedCustomFont(doc, fileBase);
        return {
          font,
          widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
          substituted: false,
          face: fontFamily,
        };
      } catch {
        // Fallback to standard Helvetica on error
        const font = await getOrEmbedStandardFont(
          doc,
          standardFontFor("Helvetica", bold, italic),
        );
        return {
          font,
          widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
          substituted: true,
          face: "Helvetica (fallback)",
        };
      }
    }

    // Standard PDF font families
    const standardFont = standardFontFor(fontFamily, bold, italic);
    const font = await getOrEmbedStandardFont(doc, standardFont);

    const usesFallback =
      !fontFamily.toLowerCase().includes("helvetica") &&
      !fontFamily.toLowerCase().includes("arial") &&
      !fontFamily.toLowerCase().includes("times") &&
      !fontFamily.toLowerCase().includes("courier");

    return {
      font,
      widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
      substituted: usesFallback,
      face: usesFallback ? `${fontFamily} (standard fallback)` : fontFamily,
    };
  } catch {
    // Never throw from font resolution during export - fallback to Helvetica
    const font = await getOrEmbedStandardFont(doc, StandardFonts.Helvetica);
    return {
      font,
      widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
      substituted: true,
      face: "Helvetica (fallback)",
    };
  }
}

export async function resolveFontForTextRun(
  doc: PDFDocument,
  run: TextRunObject,
): Promise<ResolvedFont> {
  return resolveFontForRun(doc, {
    fontFamily: run.fontFamily,
    bold: run.bold,
    italic: run.italic,
    text: run.text,
  });
}

export async function resolveFontForNewText(
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
