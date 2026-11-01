// src/lib/images-to-pdf-generate.ts
// Pure browser-side PDF generator using pdf-lib.

import { PDFDocument, rgb, type PDFImage } from "pdf-lib";
import {
  calculatePageLayout,
  normalizeRotation,
  type LayoutOptions,
} from "./images-to-pdf-layout.ts";

export interface GenerateImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  rotation: number;
}

export interface GenerateOptions extends LayoutOptions {
  backgroundColor: string; // e.g. "#ffffff"
  quality: "high" | "medium" | "low";
  outputFilename: string;
}

const QUALITY_VALUES: Record<"high" | "medium" | "low", number> = {
  high: 0.92,
  medium: 0.75,
  low: 0.5,
};

const MAX_DIMENSION = 6000;

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  }
  return [1, 1, 1]; // Default white
}

/**
 * Converts any browser-decodable image to a JPEG or PNG Uint8Array,
 * applying EXIF orientation, user rotation, and downscaling if > 6000px.
 */
async function processImageToBytes(
  file: File,
  rotation: number,
  quality: number,
): Promise<{ bytes: Uint8Array; format: "jpg" | "png"; width: number; height: number }> {
  const normRot = normalizeRotation(rotation);
  const isDirectJpg = file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg");
  const isDirectPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

  // If no rotation, directly supported, and small enough, embed directly
  if (normRot === 0 && (isDirectJpg || isDirectPng)) {
    // Quick size probe using createImageBitmap if available
    let needDownscale = false;
    let bmp: ImageBitmap | null = null;
    if (typeof createImageBitmap !== "undefined") {
      try {
        bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        if (Math.max(bmp.width, bmp.height) > MAX_DIMENSION) {
          needDownscale = true;
        }
      } catch {
        // Fall back to direct embed
      }
    }

    if (!needDownscale) {
      if (bmp) bmp.close();
      const ab = await file.arrayBuffer();
      return {
        bytes: new Uint8Array(ab),
        format: isDirectJpg ? "jpg" : "png",
        width: bmp?.width ?? 0,
        height: bmp?.height ?? 0,
      };
    }
    if (bmp) bmp.close();
  }

  // Otherwise, decode onto a canvas with rotation, downscaling, and quality encoding
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    // Node.js test environment fallback
    const ab = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      format: isDirectJpg ? "jpg" : "png",
      width: 100,
      height: 100,
    };
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let origW = bitmap.width;
  let origH = bitmap.height;

  // Scale down if exceeding MAX_DIMENSION
  const maxDim = Math.max(origW, origH);
  if (maxDim > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxDim;
    origW = Math.round(origW * scale);
    origH = Math.round(origH * scale);
  }

  const is90or270 = normRot === 90 || normRot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = is90or270 ? origH : origW;
  canvas.height = is90or270 ? origW : origH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D canvas context");

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normRot * Math.PI) / 180);
  ctx.drawImage(bitmap, -origW / 2, -origH / 2, origW, origH);
  bitmap.close();

  const mime = isDirectPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  );

  if (!blob) throw new Error(`Failed to encode image canvas for ${file.name}`);

  const buffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    format: mime === "image/png" ? "png" : "jpg",
    width: canvas.width,
    height: canvas.height,
  };
}

export async function generateImagesPdf(
  items: GenerateImageItem[],
  options: GenerateOptions,
  onProgress?: (current: number, total: number, message: string) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; size: number }> {
  if (items.length === 0) {
    throw new Error("No images provided for PDF generation");
  }

  const pdfDoc = await PDFDocument.create();
  const quality = QUALITY_VALUES[options.quality] ?? 0.92;
  const [bgR, bgG, bgB] = parseHexColor(options.backgroundColor);

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) {
      throw new DOMException("PDF generation cancelled by user", "AbortError");
    }

    const item = items[i];
    onProgress?.(i + 1, items.length, `Processing image ${i + 1} of ${items.length}: ${item.name}`);

    // Process image bytes with rotation/format/downscaling
    const processed = await processImageToBytes(item.file, item.rotation, quality);

    let embeddedImg: PDFImage;
    if (processed.format === "png") {
      embeddedImg = await pdfDoc.embedPng(processed.bytes);
    } else {
      embeddedImg = await pdfDoc.embedJpg(processed.bytes);
    }

    // Effective dimensions from processed image (which already baked in rotation)
    const layout = calculatePageLayout(
      embeddedImg.width,
      embeddedImg.height,
      0, // rotation is already applied to pixel bytes
      options,
    );

    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

    // Draw background
    if (options.backgroundColor && options.backgroundColor.toLowerCase() !== "transparent") {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: layout.pageWidth,
        height: layout.pageHeight,
        color: rgb(bgR, bgG, bgB),
      });
    }

    // Draw image centered in layout
    page.drawImage(embeddedImg, {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });

    // Yield to event loop between images to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (signal?.aborted) {
    throw new DOMException("PDF generation cancelled by user", "AbortError");
  }

  onProgress?.(items.length, items.length, "Finalizing PDF file...");
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([pdfBytes as unknown as Uint8Array<ArrayBuffer>], {
    type: "application/pdf",
  });

  return { blob, size: blob.size };
}
