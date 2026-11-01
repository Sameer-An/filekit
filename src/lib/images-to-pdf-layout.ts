// src/lib/images-to-pdf-layout.ts
// Pure layout mathematics for Images to PDF.
// Used by BOTH the screen preview and pdf-lib export so preview == PDF.

export type PageSizeId = "fit" | "a4" | "letter" | "legal" | "a3" | "a5";
export type OrientationId = "auto" | "portrait" | "landscape";
export type MarginId = "none" | "small" | "medium" | "large";
export type FitModeId = "fit" | "fill" | "stretch" | "original";

export interface LayoutOptions {
  pageSize: PageSizeId;
  orientation: OrientationId;
  margin: MarginId;
  fit: FitModeId;
}

export interface LayoutResult {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  marginPt: number;
  effectiveImgWidth: number;
  effectiveImgHeight: number;
}

// Standard paper dimensions in points (72 points = 1 inch)
// Represented in portrait [width, height]
export const PAGE_SIZES: Record<Exclude<PageSizeId, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

export const MARGIN_PTS: Record<MarginId, number> = {
  none: 0,
  small: 18, // 0.25 in
  medium: 36, // 0.5 in
  large: 54, // 0.75 in
};

/**
 * Normalizes rotation angle to 0, 90, 180, 270 degrees.
 */
export function normalizeRotation(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  if (mod >= 45 && mod < 135) return 90;
  if (mod >= 135 && mod < 225) return 180;
  if (mod >= 225 && mod < 315) return 270;
  return 0;
}

/**
 * Calculates page dimensions and image placement rectangle.
 */
export function calculatePageLayout(
  imgWidth: number,
  imgHeight: number,
  rotation: number,
  options: LayoutOptions,
): LayoutResult {
  const normRot = normalizeRotation(rotation);
  const isRotated90or270 = normRot === 90 || normRot === 270;

  // Effective dimensions after rotation
  const effectiveImgWidth = isRotated90or270 ? imgHeight : imgWidth;
  const effectiveImgHeight = isRotated90or270 ? imgWidth : imgHeight;

  const marginPt = options.pageSize === "fit" ? 0 : (MARGIN_PTS[options.margin] ?? 0);

  let pageWidth: number;
  let pageHeight: number;

  if (options.pageSize === "fit") {
    pageWidth = Math.max(1, effectiveImgWidth);
    pageHeight = Math.max(1, effectiveImgHeight);
  } else {
    const baseDims = PAGE_SIZES[options.pageSize] || PAGE_SIZES.a4;
    const shortSide = Math.min(baseDims[0], baseDims[1]);
    const longSide = Math.max(baseDims[0], baseDims[1]);

    let isLandscape = false;
    if (options.orientation === "landscape") {
      isLandscape = true;
    } else if (options.orientation === "portrait") {
      isLandscape = false;
    } else {
      // "auto": match image's aspect ratio
      isLandscape = effectiveImgWidth > effectiveImgHeight;
    }

    pageWidth = isLandscape ? longSide : shortSide;
    pageHeight = isLandscape ? shortSide : longSide;
  }

  // Printable area inside margins
  const printableW = Math.max(1, pageWidth - 2 * marginPt);
  const printableH = Math.max(1, pageHeight - 2 * marginPt);

  let drawW: number;
  let drawH: number;

  if (options.fit === "stretch") {
    drawW = printableW;
    drawH = printableH;
  } else if (options.fit === "fill") {
    // Cover: scale to fill, preserving ratio
    const scale = Math.max(
      printableW / effectiveImgWidth,
      printableH / effectiveImgHeight,
    );
    drawW = effectiveImgWidth * scale;
    drawH = effectiveImgHeight * scale;
  } else if (options.fit === "original") {
    // 1 pt per pixel, but scale down if it exceeds printable bounds
    const scale = Math.min(
      1,
      printableW / effectiveImgWidth,
      printableH / effectiveImgHeight,
    );
    drawW = effectiveImgWidth * scale;
    drawH = effectiveImgHeight * scale;
  } else {
    // "fit" (contain): default
    const scale = Math.min(
      printableW / effectiveImgWidth,
      printableH / effectiveImgHeight,
    );
    drawW = effectiveImgWidth * scale;
    drawH = effectiveImgHeight * scale;
  }

  // Center within printable area
  const x = marginPt + (printableW - drawW) / 2;
  const y = marginPt + (printableH - drawH) / 2;

  return {
    pageWidth,
    pageHeight,
    x,
    y,
    width: drawW,
    height: drawH,
    marginPt,
    effectiveImgWidth,
    effectiveImgHeight,
  };
}

/* ─────────── List Reordering & Sorting Helpers ─────────── */

export function moveItemIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export function moveItemUp<T>(items: T[], index: number): T[] {
  return moveItemIndex(items, index, index - 1);
}

export function moveItemDown<T>(items: T[], index: number): T[] {
  return moveItemIndex(items, index, index + 1);
}

export function moveItemToTop<T>(items: T[], index: number): T[] {
  return moveItemIndex(items, index, 0);
}

export function moveItemToBottom<T>(items: T[], index: number): T[] {
  return moveItemIndex(items, index, items.length - 1);
}

export function sortItemsByName<T extends { name: string }>(items: T[], direction: "asc" | "desc"): T[] {
  return [...items].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? cmp : -cmp;
  });
}

export function reverseItemList<T>(items: T[]): T[] {
  return [...items].reverse();
}

