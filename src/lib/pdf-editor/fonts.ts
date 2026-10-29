// src/lib/pdf-editor/fonts.ts
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { TextRunObject } from "./types";

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

export async function resolveFontForRun(
doc: PDFDocument,
input: { fontFamily: string; bold: boolean; italic: boolean; text: string },
): Promise<ResolvedFont> {
const { text, bold, italic } = input;

// Try to use standard font if possible
if (!needsNoto(text)) {
    let fontName = StandardFonts.Helvetica;
    if (input.fontFamily.includes("Times")) fontName = StandardFonts.TimesRoman;
    if (input.fontFamily.includes("Courier")) fontName = StandardFonts.Courier;

    if (bold && italic) fontName = StandardFonts.HelveticaBoldOblique;
    else if (bold) fontName = StandardFonts.HelveticaBold;
    else if (italic) fontName = StandardFonts.HelveticaOblique;

    const font = await doc.embedFont(fontName);
    return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: false,
    face: "standard",
    };
}

// Fallback to Noto if needed
try {
    doc.registerFontkit(fontkit);
    const fontBytes = await fetch("/fonts/NotoSans-Regular.woff2").then((res) =>
    res.arrayBuffer(),
    );
    const font = await doc.embedFont(fontBytes, { subset: true });
    return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: true,
    face: "noto",
    };
} catch (e) {
    // If fetch fails, fallback to Helvetica to prevent export crash
    const font = await doc.embedFont(StandardFonts.Helvetica);
    return {
    font,
    widthOfTextAtSize: (s, size) => font.widthOfTextAtSize(s, size),
    substituted: true,
    face: "fallback",
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
