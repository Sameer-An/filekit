// src/components/preview/preview-utils.ts
import type { FileCategory, PreviewEffects } from "./types";

/** Categorize a file by MIME type and filename extension */
export function getFileCategory(file: File): FileCategory {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp|avif|ico|tiff?)$/i.test(name)) {
    return "image";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return "video";
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|aac|flac|m4a)$/i.test(name)) {
    return "audio";
  }
  if (
    mime.includes("document") ||
    mime.includes("word") ||
    mime.includes("text") ||
    /\.(docx?|txt|rtf|odt|md)$/i.test(name)
  ) {
    return "document";
  }
  return "other";
}

/** Compute CSS filter and transform strings for instant live image preview */
export function getEffectCss(effects?: PreviewEffects): {
  filter: string;
  transform: string;
  hasEffects: boolean;
} {
  if (!effects) {
    return { filter: "none", transform: "none", hasEffects: false };
  }

  const filters: string[] = [];
  const transforms: string[] = [];

  if (effects.brightness !== undefined && effects.brightness !== 100) {
    filters.push(`brightness(${effects.brightness}%)`);
  }
  if (effects.contrast !== undefined && effects.contrast !== 100) {
    filters.push(`contrast(${effects.contrast}%)`);
  }
  if (effects.saturation !== undefined && effects.saturation !== 100) {
    filters.push(`saturate(${effects.saturation}%)`);
  }
  if (effects.grayscale !== undefined && effects.grayscale > 0) {
    filters.push(`grayscale(${effects.grayscale}%)`);
  }

  if (effects.rotateDeg && effects.rotateDeg % 360 !== 0) {
    transforms.push(`rotate(${effects.rotateDeg}deg)`);
  }
  if (effects.flipH) {
    transforms.push("scaleX(-1)");
  }
  if (effects.flipV) {
    transforms.push("scaleY(-1)");
  }

  const filter = filters.length > 0 ? filters.join(" ") : "none";
  const transform = transforms.length > 0 ? transforms.join(" ") : "none";
  const hasEffects = filter !== "none" || transform !== "none";

  return { filter, transform, hasEffects };
}

/** Compute fit scale ratio ensuring content fits within a container */
export function calculateFitScale(
  containerW: number,
  containerH: number,
  contentW: number,
  contentH: number,
  padding = 16,
): number {
  if (containerW <= 0 || containerH <= 0 || contentW <= 0 || contentH <= 0) {
    return 1;
  }
  const availW = Math.max(1, containerW - padding * 2);
  const availH = Math.max(1, containerH - padding * 2);
  const scaleW = availW / contentW;
  const scaleH = availH / contentH;
  return Math.min(scaleW, scaleH);
}

/** Generate a deterministic cache key for estimated output size */
export function getEstimatedSizeCacheKey(
  fileName: string,
  fileSize: number,
  format?: string,
  quality?: number,
  width?: number,
  height?: number,
): string {
  return `${fileName}_${fileSize}_${format || "orig"}_${quality ?? 85}_${width ?? 0}x${height ?? 0}`;
}

const sizeEstimateCache = new Map<string, number>();

/**
 * Estimate output size by encoding a scaled copy (max 1280px) on an off-screen canvas.
 * Results are cached by option keys to prevent re-encoding.
 */
export async function estimateOutputSize(
  file: File,
  format?: string,
  quality?: number,
  width?: number,
  height?: number,
): Promise<number | null> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return null;
  }

  const targetFmt = (format || "jpeg").toLowerCase().replace("jpg", "jpeg");
  const q = (quality ?? 85) / 100;
  const key = getEstimatedSizeCacheKey(file.name, file.size, targetFmt, quality, width, height);

  if (sizeEstimateCache.has(key)) {
    return sizeEstimateCache.get(key)!;
  }

  try {
    const bmp = await createImageBitmap(file);
    const maxDim = 1280;
    let w = width || bmp.width;
    let h = height || bmp.height;

    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.max(1, Math.round(w * ratio));
      h = Math.max(1, Math.round(h * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return null;
    }

    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();

    const mime = `image/${targetFmt === "ico" ? "png" : targetFmt}`;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, q),
    );

    if (blob) {
      // Extrapolate ratio if we downscaled from full size
      let estimated = blob.size;
      const originalPixels = (width || bmp.width) * (height || bmp.height);
      const samplePixels = w * h;
      if (originalPixels > samplePixels && samplePixels > 0) {
        const factor = Math.sqrt(originalPixels / samplePixels);
        estimated = Math.round(blob.size * factor);
      }
      sizeEstimateCache.set(key, estimated);
      return estimated;
    }
    return null;
  } catch {
    return null;
  }
}
