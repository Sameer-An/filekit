    // src/lib/pdf-editor/fonts.ts
    import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
    import fontkit from "@pdf-lib/fontkit";
    import type { TextRunObject, NewTextObject } from "./types";

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

    /** Custom font files expected in the public/fonts directory. */
    const CUSTOM_FONT_FILE: Record<string, string> = {
    Roboto: "Roboto-Regular",
    "Open Sans": "OpenSans-Regular",
    Lato: "Lato-Regular",
    Montserrat: "Montserrat-Regular",
    Poppins: "Poppins-Regular",
    "Noto Sans": "NotoSans-Regular",
    };

    /** Resolves a font file from the public directory and embeds it in the PDF. */
    async function embedCustomFont(
    doc: PDFDocument,
    fileName: string,
    ): Promise<PDFFont> {
    doc.registerFontkit(fontkit);

    const response = await fetch(`/fonts/${fileName}.ttf`);

    if (!response.ok) {
        throw new Error(`Font file not found: ${fileName}.ttf`);
    }

    const bytes = await response.arrayBuffer();

    return doc.embedFont(bytes, { subset: true });
    }

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

    // Use Noto Sans for text that may require extended Unicode coverage.
    if (needsNoto(text)) {
        try {
        const font = await embedCustomFont(doc, "NotoSans-Regular");

        return {
            font,
            widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
            substituted: fontFamily !== "Noto Sans" || bold || italic,
            face: "Noto Sans",
        };
        } catch {
        const font = await doc.embedFont(
            standardFontFor("Helvetica", false, false),
        );

        return {
            font,
            widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
            substituted: true,
            face: "Helvetica (fallback)",
        };
        }
    }

    // Try to embed a custom font when a matching file is configured.
    const customFile = CUSTOM_FONT_FILE[fontFamily];

    if (customFile) {
        try {
        const styleSuffix =
            bold && italic
            ? "-BoldItalic"
            : bold
                ? "-Bold"
                : italic
                ? "-Italic"
                : "";

        const fileName = `${customFile.replace(/-Regular$/, "")}${styleSuffix || "-Regular"}`;
        const font = await embedCustomFont(doc, fileName);

        return {
            font,
            widthOfTextAtSize: (value, size) => font.widthOfTextAtSize(value, size),
            substituted: false,
            face: fontFamily,
        };
        } catch {
        // If the requested custom font file is unavailable, try its regular face.
        try {
            const font = await embedCustomFont(doc, customFile);

            return {
            font,
            widthOfTextAtSize: (value, size) =>
                font.widthOfTextAtSize(value, size),
            substituted: bold || italic,
            face: fontFamily,
            };
        } catch {
            const font = await doc.embedFont(
            standardFontFor("Helvetica", bold, italic),
            );

            return {
            font,
            widthOfTextAtSize: (value, size) =>
                font.widthOfTextAtSize(value, size),
            substituted: true,
            face: "Helvetica (fallback)",
            };
        }
        }
    }

    // Use PDF standard fonts for families without a configured custom font file.
    const standardFont = standardFontFor(fontFamily, bold, italic);
    const font = await doc.embedFont(standardFont);

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
