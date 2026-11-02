"use client";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import {
  readUploadedFont,
  readUploadedFontMetadata,
  saveUploadedFont,
  type StoredUploadedFont,
  type UploadedFontMetadata,
} from "./idb";
import type { UploadedPdfFont } from "./fonts";

export const MAX_UPLOADED_FONT_SIZE = 10 * 1024 * 1024;
const registeredFonts = new Map<string, Promise<void>>();
const registeredFaces = new Map<string, FontFace>();
const bundledFontLoads = new Map<string, Promise<void>>();

export function validateFontFileHeader(
  fileName: string,
  size: number,
  bytes: Uint8Array,
): "ttf" | "otf" {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "ttf" && extension !== "otf") {
    throw new Error("Unsupported font format. Choose a TTF or OTF file.");
  }
  if (size <= 0 || size > MAX_UPLOADED_FONT_SIZE) {
    throw new Error("Font files must be between 1 byte and 10 MB.");
  }
  if (bytes.length < 4) {
    throw new Error("The selected file is too small to be a valid font.");
  }

  const signature = String.fromCharCode(...bytes.slice(0, 4));
  if (
    signature !== "OTTO" &&
    signature !== "true" &&
    signature !== "typ1" &&
    !(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
  ) {
    throw new Error("This file does not contain a supported TrueType/OpenType font.");
  }
  return extension;
}

export async function assertPdfEmbeddableFont(
  bytes: Uint8Array,
): Promise<void> {
  const validationDocument = await PDFDocument.create();
  validationDocument.registerFontkit(fontkit);
  await validationDocument.embedFont(bytes, { subset: true });
  await validationDocument.save();
}

function stableFamilyName(familyName: string | null, fileName: string): string {
  const fromFileName = fileName.replace(/\.(ttf|otf)$/i, "");
  const base = (familyName || fromFileName)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
  if (!base) throw new Error("The font file has no usable family name.");
  return `${base} (Imported)`;
}

function loadFontFace(font: StoredUploadedFont): Promise<FontFace> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.reject(new Error("This browser cannot load custom fonts."));
  }
  const face = new FontFace(font.family, font.bytes, {
    weight: font.bold ? "700" : "400",
    style: font.italic ? "italic" : "normal",
  });
  return face.load();
}

function registerFontFace(font: StoredUploadedFont, face?: FontFace): Promise<void> {
  if (face) {
    const previous = registeredFaces.get(font.family);
    if (previous && typeof document !== "undefined") {
      document.fonts.delete(previous);
    }
    registeredFaces.set(font.family, face);
    registeredFonts.delete(font.family);
    if (typeof document !== "undefined") document.fonts.add(face);
    return Promise.resolve();
  }
  const existing = registeredFonts.get(font.family);
  if (existing) return existing;
  const loading = (async () => {
    const loadedFace = await loadFontFace(font);
    document.fonts.add(loadedFace);
    registeredFaces.set(font.family, loadedFace);
  })();
  registeredFonts.set(font.family, loading);
  loading.catch(() => registeredFonts.delete(font.family));
  return loading;
}

export async function importUploadedFont(file: File): Promise<UploadedFontMetadata> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = validateFontFileHeader(file.name, file.size, bytes);
  let parsedFont: ReturnType<typeof fontkit.create>;
  try {
    parsedFont = fontkit.create(bytes);
  } catch {
    throw new Error("The selected file is not a valid or supported font.");
  }
  const family = stableFamilyName(parsedFont.familyName, file.name);
  const subfamily = parsedFont.subfamilyName ?? "";
  const storedFont: StoredUploadedFont = {
    family,
    fileName: file.name,
    format,
    bytes: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    size: bytes.byteLength,
    importedAt: Date.now(),
    bold: /\b(bold|black|heavy|semibold)\b/i.test(subfamily),
    italic:
      parsedFont.italicAngle !== 0 || /\b(italic|oblique)\b/i.test(subfamily),
  };

  try {
    await assertPdfEmbeddableFont(bytes);
  } catch {
    throw new Error(
      "This font can be used only if it can be embedded in a PDF; this file is not compatible with the current PDF export pipeline.",
    );
  }

  const loadedFace = await loadFontFace(storedFont);
  await saveUploadedFont(storedFont);
  await registerFontFace(storedFont, loadedFace);
  return {
    family: storedFont.family,
    fileName: storedFont.fileName,
    format: storedFont.format,
    size: storedFont.size,
    importedAt: storedFont.importedAt,
    bold: storedFont.bold,
    italic: storedFont.italic,
  };
}

export async function ensureFontLoaded(family: string): Promise<void> {
  if (typeof document === "undefined") return;
  if (family === "Noto Sans") {
    let loading = bundledFontLoads.get(family);
    if (!loading) {
      loading = (async () => {
        const regular = new FontFace(
          "Noto Sans",
          'url("/fonts/NotoSans-Regular.woff2") format("woff2")',
          { weight: "400" },
        );
        const bold = new FontFace(
          "Noto Sans",
          'url("/fonts/NotoSans-Bold.woff2") format("woff2")',
          { weight: "700" },
        );
        await Promise.all([regular.load(), bold.load()]);
        document.fonts.add(regular);
        document.fonts.add(bold);
      })();
      bundledFontLoads.set(family, loading);
      loading.catch(() => bundledFontLoads.delete(family));
    }
    await loading;
    await document.fonts.load('14px "Noto Sans"');
    return;
  }

  if (!family.endsWith(" (Imported)")) return;
  const uploaded = await readUploadedFont(family);
  if (uploaded) {
    await registerFontFace(uploaded);
    await document.fonts.load(`14px ${JSON.stringify(family)}`);
  }
}

export async function loadUploadedFontCatalogue(): Promise<
  UploadedFontMetadata[]
> {
  return readUploadedFontMetadata();
}

export async function getUploadedFontBytes(
  family: string,
): Promise<Uint8Array | undefined> {
  const font = await readUploadedFont(family);
  return font ? new Uint8Array(font.bytes) : undefined;
}

export async function getUploadedFontForExport(
  family: string,
): Promise<UploadedPdfFont | undefined> {
  const font = await readUploadedFont(family);
  return font
    ? {
        bytes: new Uint8Array(font.bytes),
        bold: font.bold,
        italic: font.italic,
      }
    : undefined;
}
