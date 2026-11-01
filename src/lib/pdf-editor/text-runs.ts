// src/lib/pdf-editor/text-runs.ts
// Extract text runs from a pdfjs page. Each run becomes a TextRunObject that
// the editor can anchor an overlay textarea to. Untouched runs are marked
// `dirty: false` and are excluded from export — only dirty runs get the
// cover + redraw treatment.

import type { PDFPageProxy } from "pdfjs-dist";
import type { FontFamilyId, PageInfo, RectPt, TextRunObject } from "./types";
import { normalizeHexColor, pageUid, pdfjsTextItemToPdfRect } from "./coords";
import {
  extractColoursByOperatorList,
  resolveTextColour,
  sampleTextColourFromCanvas,
} from "./text-color";

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

function makeRunId(pageKey: string, itemIndex: number, text: string): string {
  return `run-${pageKey}-${itemIndex}-${hashString(text)}`;
}

/**
 * The pdfjs Font descriptor from page.commonObjs has fields we can trust:
 * { bold, italic, black, fixedPitch, serif, fontFamily, loadedName, ... }.
 * Accessing it throws if the font isn't loaded yet, so we guard with .has().
 */
interface PdfjsFontDescriptor {
  bold?: boolean;
  italic?: boolean;
  black?: boolean;
  fixedPitch?: boolean;
  serif?: boolean;
  fontFamily?: string;
  name?: string; // PostScript name like "Helvetica-Bold"
  loadedName?: string; // like "g_d0_f1"
  // Some pdf.js versions nest the actual flags here:
  data?: {
    bold?: boolean;
    italic?: boolean;
    black?: boolean;
    fixedPitch?: boolean;
    serif?: boolean;
    name?: string;
  };
}


function getFontDescriptor(
  page: PDFPageProxy,
  fontName: string | undefined,
): PdfjsFontDescriptor | null {
  if (!fontName) return null;
  try {
    type CommonObjs = { has(n: string): boolean; get(n: string): unknown };
    const pageAny = page as unknown as {
      _transport?: { commonObjs?: CommonObjs };
      commonObjs?: CommonObjs;
      _pdfDocument?: { _transport?: { commonObjs?: CommonObjs } };
      pdfDocument?: { _transport?: { commonObjs?: CommonObjs } };
    };
    // pdf.js stores common objects on the private _transport (not on the page
    // directly). Try every known path so this works across v3-v6.
    const commonObjs =
      pageAny._transport?.commonObjs ??
      pageAny.commonObjs ??
      pageAny._pdfDocument?._transport?.commonObjs ??
      pageAny.pdfDocument?._transport?.commonObjs;
    if (!commonObjs) return null;
    if (!commonObjs.has(fontName)) return null;
    const obj = commonObjs.get(fontName) as PdfjsFontDescriptor;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}


interface ExtractOptions {
  sampleBackground?: (rect: RectPt) => string;
  defaultBackground?: string;
  /** The pdfjs module (from getPdfjs). Enables operator-list colour extraction. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfjsModule?: any;
  /**
   * Callback that returns the text colour sampled from the rendered page
   * canvas. Used as a fallback when operator-list extraction misses.
   * `rect` is in CSS-pixel space (already mapped).
   */
  sampleTextColour?: (rect: RectPt, bgHex: string) => string | null;
  /** The rendered source canvas (for the canvas fallback). */
  sourceCanvas?: HTMLCanvasElement;
  /** Page + zoom to convert `rect` from PDF-points to CSS-pixels for sampling. */
  pageInfoForSampling?: PageInfo;
  zoomForSampling?: number;
}

/**
 * Map raw PDF font names to a clean web FontFamilyId with style variants.
 * Now optionally accepts pdfjs Font descriptor flags for reliable bold/italic
 * detection (Chrome PDF export does not encode weight in the font name).
 */
export function mapPdfFontToWeb(
  rawName: string,
  styleFontFamily?: string,
  descriptorFlags?: {
    bold?: boolean;
    italic?: boolean;
    fixedPitch?: boolean;
    serif?: boolean;
  },
): {
  fontFamily: FontFamilyId;
  bold: boolean;
  italic: boolean;
} {
  const cleanName = rawName.replace(/^[A-Z]{6}\+/, "");
  const combined = `${cleanName} ${styleFontFamily || ""}`.toLowerCase();

  const flags = descriptorFlags ?? {};

  const bold =
    flags.bold === true ||
    /bold|black|heavy|semibold|demibold|700|800|900/i.test(combined);

  const italic = flags.italic === true || /italic|oblique/i.test(combined);

  let fontFamily: FontFamilyId = "Arial";

  if (/comic\s*sans|comicsans/i.test(combined)) fontFamily = "Comic Sans MS";
  else if (/impact/i.test(combined)) fontFamily = "Impact";
  else if (/playfair/i.test(combined)) fontFamily = "Playfair Display";
  else if (/merriweather/i.test(combined)) fontFamily = "Merriweather";
  else if (/poppins/i.test(combined)) fontFamily = "Poppins";
  else if (/montserrat/i.test(combined)) fontFamily = "Montserrat";
  else if (/lato/i.test(combined)) fontFamily = "Lato";
  else if (/open\s*sans|opensans/i.test(combined)) fontFamily = "Open Sans";
  else if (/roboto\s*mono|robotomono/i.test(combined))
    fontFamily = "Roboto Mono";
  else if (/roboto/i.test(combined)) fontFamily = "Roboto";
  else if (/\binter\b/i.test(combined)) fontFamily = "Inter";
  else if (/segoe\s*ui|segoeui/i.test(combined)) fontFamily = "Segoe UI";
  else if (/trebuchet/i.test(combined)) fontFamily = "Trebuchet MS";
  else if (/tahoma/i.test(combined)) fontFamily = "Tahoma";
  else if (/verdana/i.test(combined)) fontFamily = "Verdana";
  else if (/calibri/i.test(combined)) fontFamily = "Calibri";
  else if (/noto\s*sans|noto/i.test(combined)) fontFamily = "Noto Sans";
  else if (/palatino/i.test(combined)) fontFamily = "Palatino";
  else if (/garamond/i.test(combined)) fontFamily = "Garamond";
  else if (/cambria/i.test(combined)) fontFamily = "Cambria";
  else if (/georgia/i.test(combined)) fontFamily = "Georgia";
  else if (/times|timesnewroman|times\s*new\s*roman/i.test(combined))
    fontFamily = "Times New Roman";
  else if (/consolas/i.test(combined)) fontFamily = "Consolas";
  else if (/courier/i.test(combined)) fontFamily = "Courier New";
  else if (/helvetica/i.test(combined)) fontFamily = "Helvetica";
  else if (/arial/i.test(combined)) fontFamily = "Arial";
  else {
    // Unknown — use descriptor flags if available
    if (flags.fixedPitch === true) fontFamily = "Courier New";
    else if (flags.serif === true) fontFamily = "Times New Roman";
    else fontFamily = "Arial";
  }

  return { fontFamily, bold, italic };
}

export async function extractTextRuns(
  page: PDFPageProxy,
  pageInfo: PageInfo,
  options: ExtractOptions = {},
): Promise<TextRunObject[]> {
  const content = await page.getTextContent();
  const items = (content.items ?? []) as unknown as PdfjsTextItem[];

  const styles = (content.styles || {}) as Record<
    string,
    { fontFamily?: string }
  >;

  // ── A. Operator-list colours ────────────────────────────────────────────────
  let opColours = new Map<number, string>();
  if (options.pdfjsModule) {
    try {
      opColours = await extractColoursByOperatorList(page, options.pdfjsModule);
    } catch {
      /* opColours stays empty */
    }
  }

  const out: TextRunObject[] = [];
  const seen = new Set<string>();
  let opIdx = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = typeof item.str === "string" ? item.str : "";
    const currentOpIdx = opIdx++;
    if (!text.trim()) continue;

    const rect = pdfjsTextItemToPdfRect({
      transform: item.transform,
      width: item.width,
      height: item.height,
    });
    if (rect.w <= 0.1 || rect.h <= 0.1) continue;

    const id = makeRunId(pageUid(pageInfo), i, text);
    if (seen.has(id)) continue;
    seen.add(id);

    // ── Font descriptor (real bold/italic) ───────────────────────────────────
    const style = styles[item.fontName || ""] || {};
    const descriptor = getFontDescriptor(page, item.fontName);
    const descData = descriptor?.data ?? descriptor;
    const fontInfo = mapPdfFontToWeb(
      item.fontName || descData?.name || "",
      style.fontFamily || descriptor?.fontFamily,
      descData
        ? {
            bold: descData.bold === true || descData.black === true,
            italic: descData.italic === true,
            fixedPitch: descData.fixedPitch === true,
            serif: descData.serif === true,
          }
        : undefined,
    );

    
    // ── Font size from the linear part of the transform matrix ───────────────
    const a = item.transform[0] ?? 1;
    const b = item.transform[1] ?? 0;
    const c = item.transform[2] ?? 0;
    const d = item.transform[3] ?? 1;
    // Prefer vertical scale (c,d); both axes give the same size for unrotated
    // text. Use height as a sanity floor.
    const txScale = Math.max(
      Math.hypot(a, b),
      Math.hypot(c, d),
      item.height,
      4,
    );
    const fontSize = Math.max(4, txScale);

    // ── Background ──────────────────────────────────────────────────────────
    const bgRaw = options.sampleBackground
      ? options.sampleBackground(rect)
      : (options.defaultBackground ?? "#ffffff");
    const bgHex = normalizeHexColor(bgRaw);

    // ── Colour resolution (operator list → canvas → #000000) ────────────────
    let color = resolveTextColour(opColours, currentOpIdx, bgHex);

    // If operator-list failed AND we have a rendered canvas, sample it.
    if (
      color === "#000000" &&
      options.sourceCanvas &&
      options.pageInfoForSampling
    ) {
      // rect is in PDF-points; text-color.ts expects canvas-pixel rect.
      // Convert via pdfRectToCss + zoom (imported from coords).
      const zoom = options.zoomForSampling ?? 1;
      // Inline conversion to avoid an extra import cycle.
      const { pdfRectToCss } = await import("./coords");
      const css = pdfRectToCss(rect, options.pageInfoForSampling, zoom);
      const canvasRect: RectPt = {
        x: css.left,
        y: css.top,
        w: css.width,
        h: css.height,
      };
      const sampled = sampleTextColourFromCanvas(
        options.sourceCanvas,
        canvasRect,
        bgHex,
      );
      if (sampled && sampled.toLowerCase() !== bgHex.toLowerCase()) {
        color = sampled;
      }
    }

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
      sourceFontName:
        item.fontName || descriptor?.name || style.fontFamily || "unknown",
      fontFamily: fontInfo.fontFamily,
      substituted: false,
      fontSize,
      bold: fontInfo.bold,
      italic: fontInfo.italic,
      underline: false,
      color,
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      backgroundColor: bgHex,
    };
    out.push(run);
  }

  out.sort((p, q) => {
    if (Math.abs(q.rect.y - p.rect.y) > 1) return q.rect.y - p.rect.y;
    return p.rect.x - q.rect.x;
  });

  return out.map((run, idx) => ({ ...run, z: idx }));
}

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
