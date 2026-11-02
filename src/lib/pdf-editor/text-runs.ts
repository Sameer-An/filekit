// src/lib/pdf-editor/text-runs.ts
// Extract text runs from a pdfjs page. Each run becomes a TextRunObject that
// the editor can anchor a rich-text overlay to. Untouched runs are marked
// `dirty: false` and are excluded from export — only dirty runs get the
// cover + redraw treatment.
//
// Compatibility model (see types.ts): when a text object has `runs`, they are
// the source of truth for content and character-level formatting. Objects
// without `runs` fall back to the object-level `text` and style fields. The
// helpers below always materialise runs from legacy objects before editing,
// so the fallback is preserved without change.

import type { PDFPageProxy } from "pdfjs-dist";
import type {
  FontFamilyId,
  PageInfo,
  RectPt,
  TextRunObject,
  NewTextObject,
  StyledTextRun,
} from "./types";
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

// ─── Styled-run helpers ─────────────────────────────────────────────────────
//
// These operate on the `runs` array introduced in types.ts. They never touch
// the store or React; callers pass in a text object and apply the returned
// value via their existing update path. The helpers are safe on legacy
// objects that do not yet have `runs` — they materialise one run from the
// object-level properties first, so existing formatting is not lost.
//
// The helpers do NOT mutate their inputs. `mergeAdjacentRuns` copies each run
// before merging text; `applyStyleToRange` returns a fresh object and leaves
// the original untouched.

/** Either a TextRunObject or a NewTextObject — the two text-like objects in types.ts. */
export type TextLikeObject = TextRunObject | NewTextObject;

/** Style-only patch for a run — everything except the `text` content. */
export type StyledRunPatch = Omit<StyledTextRun, "text">;

/**
 * Return the effective styled runs for a text object.
 *
 * - If `obj.runs` is present and non-empty, they are returned verbatim (each
 *   run copied so the caller can mutate safely). Unset properties on a run
 *   still inherit from `obj` at render time via the standard compatibility
 *   model.
 * - Otherwise a single run is materialised from the object-level text and
 *   style properties. This is the fallback that keeps legacy objects working
 *   after their first character-level edit.
 */
export function materializeRuns(obj: TextLikeObject): StyledTextRun[] {
  if (obj.runs && obj.runs.length > 0) {
    return obj.runs.map((run) => ({ ...run }));
  }
  return [
    {
      text: obj.text,
      bold: obj.bold,
      italic: obj.italic,
      underline: obj.underline,
      strike: obj.strike ?? false,
      fontFamily: obj.fontFamily,
      fontSize: obj.fontSize,
      color: obj.color,
      letterSpacing: obj.letterSpacing,
    },
  ];
}

/**
 * Split a run array at a character offset.
 *
 * - offset === 0 returns `{ left: [], right: [...runs] }`
 * - offset >= total length returns `{ left: [...runs], right: [] }`
 * - an offset strictly inside a run splits it into two runs that share every
 *   other property — text content, order, and all style attributes are
 *   preserved exactly.
 *
 * The returned arrays are freshly allocated. When a run is split, both halves
 * are new objects; runs outside the split point are shallow-copied so callers
 * cannot mutate the input.
 */
export function splitRunAt(
  runs: StyledTextRun[],
  offset: number,
): { left: StyledTextRun[]; right: StyledTextRun[] } {
  if (runs.length === 0) return { left: [], right: [] };

  const total = runs.reduce((sum, r) => sum + r.text.length, 0);
  const target = Math.max(0, Math.min(offset, total));

  if (target === 0) {
    return { left: [], right: runs.map((r) => ({ ...r })) };
  }
  if (target === total) {
    return { left: runs.map((r) => ({ ...r })), right: [] };
  }

  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const runEnd = pos + run.text.length;

    if (target === pos) {
      return {
        left: runs.slice(0, i).map((r) => ({ ...r })),
        right: runs.slice(i).map((r) => ({ ...r })),
      };
    }
    if (target > pos && target < runEnd) {
      const local = target - pos;
      const leftRun: StyledTextRun = {
        ...run,
        text: run.text.slice(0, local),
      };
      const rightRun: StyledTextRun = {
        ...run,
        text: run.text.slice(local),
      };
      return {
        left: [...runs.slice(0, i).map((r) => ({ ...r })), leftRun],
        right: [rightRun, ...runs.slice(i + 1).map((r) => ({ ...r }))],
      };
    }
    if (target === runEnd) {
      return {
        left: runs.slice(0, i + 1).map((r) => ({ ...r })),
        right: runs.slice(i + 1).map((r) => ({ ...r })),
      };
    }

    pos = runEnd;
  }

  // Unreachable given target <= total, but keep the compiler happy and be
  // defensive against a caller passing a malformed offset.
  return { left: runs.map((r) => ({ ...r })), right: [] };
}

/**
 * True when two runs resolve to identical styling. Because `materializeRuns`
 * expands object-level defaults into each run before editing, comparing the
 * fields directly is enough. Two runs that both leave `bold`/`italic`/etc.
 * undefined are treated as equal (they inherit from the same containing
 * object). An `undefined` vs an explicit value is treated as different — this
 * is conservative and avoids collapsing runs whose effective style can only
 * be determined with the containing object in hand.
 */
function sameRunStyle(a: StyledTextRun, b: StyledTextRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.letterSpacing === b.letterSpacing
  );
}

/**
 * Merge adjacent runs whose styling is identical. Run order is preserved and
 * text is concatenated left-to-right. Runs with different styling are never
 * combined, so this is safe to call after an edit that split a run at the
 * boundaries of a style patch — adjacent untouched runs collapse back into
 * one, and the styled run stays distinct.
 */
export function mergeAdjacentRuns(runs: StyledTextRun[]): StyledTextRun[] {
  if (runs.length <= 1) return runs.map((r) => ({ ...r }));

  const out: StyledTextRun[] = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    const last = out[out.length - 1];
    const current = runs[i];
    if (sameRunStyle(last, current)) {
      out[out.length - 1] = { ...last, text: last.text + current.text };
    } else {
      out.push({ ...current });
    }
  }
  return out;
}

/**
 * Return a new text object whose `runs` are the supplied array and whose
 * `text` mirrors their concatenation. This is the single place the compatibility
 * invariant "obj.text === runs.map(r => r.text).join('')" is enforced.
 *
 * Does not change `dirty` or `origRect` — those remain the caller's
 * responsibility so this helper stays free of any store-specific behavior.
 */
export function withRuns(
  obj: TextLikeObject,
  runs: StyledTextRun[],
): TextLikeObject {
  const text = runs.map((r) => r.text).join("");
  return { ...obj, text, runs };
}

/**
 * Clear the character-level `runs` on a text object, falling back to the
 * object-level `text` and style fields. Useful when a caller has edited the
 * plain text without preserving character positions — the alternative would
 * be a `runs` array that no longer matches `text`.
 *
 * No-op for objects that never had `runs`.
 */
export function clearRuns(obj: TextLikeObject): TextLikeObject {
  if (!obj.runs) return obj;
  return { ...obj, runs: undefined };
}

/**
 * Apply a style patch to the character range `[start, end)` of a text object,
 * preserving every character outside the range and every style attribute the
 * patch does not mention.
 *
 * Behavior:
 * - `start` and `end` are clamped to `[0, text.length]`.
 * - An empty range (`start >= end`) returns `obj` unchanged.
 * - Legacy objects (no `runs`) are first materialised into a single run, so
 *   their object-level formatting survives the edit.
 * - The patch is applied only to the runs that overlap `[start, end)`.
 * - Touched runs are split at the exact boundaries, so character order and
 *   total text are preserved byte-for-byte.
 * - Adjacent runs with identical styling are re-merged so the result is
 *   canonical.
 * - For `text-run` objects the returned object has `dirty: true` so the
 *   export path knows it must redraw. For `new-text` objects `dirty` is not
 *   part of the type and is left untouched.
 *
 * Callers are responsible for committing the returned object via their
 * existing update path (e.g. `commit(...)` or `updateObject(...)`); this
 * helper does not talk to the store.
 */
export function applyStyleToRange(
  obj: TextLikeObject,
  start: number,
  end: number,
  patch: StyledRunPatch,
): TextLikeObject {
  const runs = materializeRuns(obj);
  const total = runs.reduce((sum, r) => sum + r.text.length, 0);
  const s = Math.max(0, Math.min(start, total));
  const e = Math.max(s, Math.min(end, total));
  if (s === e) return obj;

  const firstSplit = splitRunAt(runs, s);
  const secondSplit = splitRunAt(firstSplit.right, e - s);

  const styledRuns: StyledTextRun[] = secondSplit.left.map((run) => ({
    ...run,
    ...patch,
  }));

  const merged = mergeAdjacentRuns([
    ...firstSplit.left,
    ...styledRuns,
    ...secondSplit.right,
  ]);

  const next = withRuns(obj, merged);
  if (next.kind === "text-run") {
    return { ...next, dirty: true };
  }
  return next;
}

export type TextStyleKey = "bold" | "italic" | "underline" | "strike";
export type TextStyleState = boolean | "Mixed";

/**
 * Read the effective style across a non-empty character range.
 * Returns null for a collapsed or out-of-range selection.
 */
export function styleForRange(
  obj: TextLikeObject,
  key: TextStyleKey,
  start: number,
  end: number,
): TextStyleState | null {
  const runs = materializeRuns(obj);
  const total = runs.reduce((sum, run) => sum + run.text.length, 0);
  const from = Math.max(0, Math.min(start, end, total));
  const to = Math.max(from, Math.min(Math.max(start, end), total));
  if (from === to) return null;

  let position = 0;
  let first: boolean | undefined;
  for (const run of runs) {
    const runEnd = position + run.text.length;
    if (runEnd > from && position < to) {
      const value = run[key] ?? obj[key] ?? false;
      if (first === undefined) first = value;
      else if (first !== value) return "Mixed";
    }
    position = runEnd;
  }
  return first ?? false;
}

/**
 * Replace the object's text while preserving formatting outside the changed
 * span. Newly inserted text inherits the style immediately before its
 * insertion point, or the first affected/available style at the start.
 */
export function replaceText(
  obj: TextLikeObject,
  nextText: string,
): TextLikeObject {
  const runs = materializeRuns(obj);
  const previousText = runs.map((run) => run.text).join("");
  if (previousText === nextText && obj.text === nextText) return obj;

  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText[prefix] === nextText[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < previousText.length - prefix &&
    suffix < nextText.length - prefix &&
    previousText[previousText.length - suffix - 1] ===
      nextText[nextText.length - suffix - 1]
  ) {
    suffix++;
  }

  return replaceTextRange(
    obj,
    prefix,
    previousText.length - suffix,
    nextText.slice(prefix, nextText.length - suffix),
  );
}

/** Replace a specific character range while retaining the surrounding runs. */
export function replaceTextRange<T extends TextLikeObject>(
  obj: T,
  start: number,
  end: number,
  insertedText: string,
): T {
  const runs = materializeRuns(obj);
  const previousText = runs.map((run) => run.text).join("");
  const rangeStart = Math.max(0, Math.min(start, end, previousText.length));
  const rangeEnd = Math.max(
    rangeStart,
    Math.min(Math.max(start, end), previousText.length),
  );
  if (
    rangeStart === rangeEnd &&
    insertedText.length === 0 &&
    obj.text === previousText
  ) {
    return obj;
  }

  const left = splitRunAt(runs, rangeStart).left;
  const right = splitRunAt(runs, rangeEnd).right;

  let insertedRuns: StyledTextRun[] = [];
  if (insertedText.length > 0) {
    const stylePosition =
      rangeEnd > rangeStart
        ? rangeStart
        : rangeStart > 0
          ? rangeStart - 1
          : rangeStart;
    let position = 0;
    let styleSource = runs[runs.length - 1];
    for (const run of runs) {
      if (stylePosition < position + run.text.length) {
        styleSource = run;
        break;
      }
      position += run.text.length;
    }

    insertedRuns = [{ ...styleSource, text: insertedText }];
  }

  const nextRuns = mergeAdjacentRuns(
    [...left, ...insertedRuns, ...right].filter((run) => run.text.length > 0),
  );
  return withRuns(obj, nextRuns) as T;
}
