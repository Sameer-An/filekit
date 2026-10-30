// src/lib/pdf-editor/text-runs.ts
// Extract text runs from a pdfjs page. Each run becomes a TextRunObject that
// the editor can anchor an overlay textarea to. Untouched runs are marked
// `dirty: false` and are excluded from export — only dirty runs get the
// cover + redraw treatment.

import type { PDFPageProxy } from "pdfjs-dist";
import type { FontFamilyId, PageInfo, RectPt, TextRunObject } from "./types";
import { normalizeHexColor, pageUid, pdfjsTextItemToPdfRect } from "./coords";

/** Subset of `TextItem` we actually consume (pdfjs v6). */
interface PdfjsTextItem {
  str: string;
  transform: number[]; // [a b c d e f]
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

/** Cheap hash so re-extraction yields stable ids. */
function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Deterministic id for a run. Two extractions of the same page produce
 * identical ids so the store can merge them without duplicates.
 */
function makeRunId(pageKey: string, itemIndex: number, text: string): string {
  return `run-${pageKey}-${itemIndex}-${hashString(text)}`;
}

interface ExtractOptions {
  /** Called once per run to sample the background colour under it. */
  sampleBackground?: (rect: RectPt) => string;
  /** Fallback colour if no sampler is provided. */
  defaultBackground?: string;
}

/**
 * Map raw PDF font names (and optional pdfjs style fontFamily) to a clean web FontFamilyId,
 * detecting bold and italic style variants accurately. Never emits raw font identifiers.
 */
export function mapPdfFontToWeb(
  rawName: string,
  styleFontFamily?: string,
): {
  fontFamily: FontFamilyId;
  bold: boolean;
  italic: boolean;
} {
  // Strip 6-uppercase-letter PDF subset prefix like 'BCDEEE+' or 'XAAAAA+'
  const cleanName = rawName.replace(/^[A-Z]{6}\+/, "");
  const combined = `${cleanName} ${styleFontFamily || ""}`.toLowerCase();

  const bold = /bold|black|heavy|semibold|700|800|900/i.test(combined);
  const italic = /italic|oblique/i.test(combined);

  let fontFamily: FontFamilyId = "Arial";
  if (/noto\s*sans|noto/i.test(combined)) {
    fontFamily = "Noto Sans";
  } else if (/times|times\s*new\s*roman|timesnewroman/i.test(combined)) {
    fontFamily = "Times New Roman";
  } else if (/cambria/i.test(combined)) {
    fontFamily = "Cambria";
  } else if (/garamond/i.test(combined)) {
    fontFamily = "Garamond";
  } else if (/georgia/i.test(combined)) {
    fontFamily = "Georgia";
  } else if (/courier|mono|consolas/i.test(combined)) {
    fontFamily = "Courier New";
  } else if (/helvetica/i.test(combined)) {
    fontFamily = "Helvetica";
  } else if (/serif/i.test(combined)) {
    fontFamily = "Times New Roman";
  } else {
    fontFamily = "Arial";
  }

  return { fontFamily, bold, italic };
}

/**
 * Extract all runs for a page. Skips whitespace-only items and items whose
 * rect has zero area (some PDFs emit those for spacing hints).
 */
export async function extractTextRuns(
  page: PDFPageProxy,
  pageInfo: PageInfo,
  options: ExtractOptions = {},
): Promise<TextRunObject[]> {
  const content = await page.getTextContent();
  const items = (content.items ?? []) as unknown as PdfjsTextItem[];

  // Explicitly type the styles record instead of using `any`
  const styles = (content.styles || {}) as Record<
    string,
    { fontFamily?: string }
  >;

  const out: TextRunObject[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = typeof item.str === "string" ? item.str : "";
    if (!text.trim()) continue;

    const rect = pdfjsTextItemToPdfRect({
      transform: item.transform,
      width: item.width,
      height: item.height,
    });
    if (rect.w <= 0.1 || rect.h <= 0.1) continue;

    // Use pageUid to prevent collisions on duplicated pages
    const id = makeRunId(pageUid(pageInfo), i, text);
    if (seen.has(id)) continue;
    seen.add(id);

    // Extract exact font details from pdfjs styles mapped to clean web fonts
    const style = styles[item.fontName || ""] || {};
    const fontInfo = mapPdfFontToWeb(item.fontName || "", style.fontFamily);

    // Font size from the linear part of the transform matrix
    const a = item.transform[0] ?? 1;
    const b = item.transform[1] ?? 0;
    const c = item.transform[2] ?? 0;
    const d = item.transform[3] ?? 1;
    const fontSize = Math.max(4, Math.hypot(c, d) || Math.hypot(a, b) || 10);

    const bg = options.sampleBackground
      ? options.sampleBackground(rect)
      : (options.defaultBackground ?? "#ffffff");

    const run: TextRunObject = {
      id,
      kind: "text-run",
      page: pageInfo.index,
      rect,
      rotation: 0,
      z: out.length,
      locked: false,
      opacity: 1,
      dirty: false,
      text,
      originalText: text,
      sourceFontName: item.fontName || style.fontFamily || "unknown",
      fontFamily: fontInfo.fontFamily,
      substituted: false,
      fontSize,
      bold: fontInfo.bold,
      italic: fontInfo.italic,
      underline: false,
      color: "#000000",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      backgroundColor: normalizeHexColor(bg),
    };
    out.push(run);
  }

  // Sort for stable visual order: top → bottom, then left → right.
  out.sort((p, q) => {
    if (Math.abs(q.rect.y - p.rect.y) > 1) return q.rect.y - p.rect.y;
    return p.rect.x - q.rect.x;
  });

  // Reassign z after sorting so the array order matches the visual order.
  return out.map((run, idx) => ({ ...run, z: idx }));
}

/**
 * Merge freshly-extracted runs with any that already exist in the store.
 * Existing runs whose ids match a newly-extracted run keep their edited
 * state (`dirty`, `text`, style); new runs are added. Runs that no longer
 * appear in the PDF (user edited them away) are kept if `dirty` so the
 * user can still export them, otherwise dropped.
 */
export function reconcileTextRuns(
  existing: TextRunObject[],
  fresh: TextRunObject[],
): TextRunObject[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const merged: TextRunObject[] = [];
  const used = new Set<string>();

  for (const run of fresh) {
    const prior = byId.get(run.id);
    if (prior) {
      merged.push(prior);
      used.add(prior.id);
    } else {
      merged.push(run);
    }
  }

  for (const run of existing) {
    if (!used.has(run.id) && run.dirty) merged.push(run);
  }

  return merged;
}
