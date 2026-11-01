// src/lib/pdf-editor/text-color.ts
// Extracts the real fill colour used for each text item in a PDF page.
//
// Strategy (in priority order):
//   A. Read fill-colour operators from page.getOperatorList(), tracking a
//      save/restore stack so nested colour changes work correctly, and assign
//      the active colour to each Tj/TJ/'./"  operator.
//   B. Fallback: sample the rendered canvas inside the text rect and pick the
//      colour farthest from the sampled background (background-sample.ts).
//   C. Last resort: #000000 — but only if it differs from the background.

import type { PDFPageProxy } from "pdfjs-dist";
import type { RectPt } from "./types";

// ─── Colour conversion helpers ────────────────────────────────────────────────

/** Clamp a float in [0,1] and convert to 0-255 integer. */
function f2b(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    f2b(r).toString(16).padStart(2, "0") +
    f2b(g).toString(16).padStart(2, "0") +
    f2b(b).toString(16).padStart(2, "0")
  );
}

/** Gray (0–1) → hex. */
export function grayToHex(g: number): string {
  return toHex(g, g, g);
}

/** RGB (each 0–1) → hex. */
export function rgbToHex(r: number, g: number, b: number): string {
  return toHex(r, g, b);
}

/** CMYK (each 0–1) → hex via simple formula. */
export function cmykToHex(c: number, m: number, y: number, k: number): string {
  const r = (1 - c) * (1 - k);
  const g = (1 - m) * (1 - k);
  const b = (1 - y) * (1 - k);
  return toHex(r, g, b);
}

// ─── pdfjs OPS identifiers we care about ────────────────────────────────────
// These are the numeric OPS codes for pdfjs-dist v3/v4/v6.
// We look them up dynamically to be version-agnostic.

interface PdfjsModule {
  OPS: Record<string, number>;
}

type OpsMap = Map<number, string>; // opCode → opName

function buildOpsMap(pdfjs: PdfjsModule): OpsMap {
  const m: OpsMap = new Map();
  for (const [name, code] of Object.entries(pdfjs.OPS)) {
    m.set(code as number, name);
  }
  return m;
}

// ─── Save/restore colour stack ───────────────────────────────────────────────

interface ColourState {
  fill: string; // hex
}

function cloneState(s: ColourState): ColourState {
  return { fill: s.fill };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface TextItemColour {
  /** Index into the text-content items array (matches position order). */
  itemIndex: number;
  /** Hex colour detected from operator list, e.g. "#ffffff". */
  colour: string;
}

/**
 * For every text-showing operator in the page operator list, record the
 * active fill colour at that moment (after tracking setFill* operators and
 * the q/Q save-restore stack).
 *
 * Returns a Map from item index (0-based, matching getTextContent order) to
 * hex colour. Items without an entry inherit #000000.
 *
 * @param page - pdfjs PDFPageProxy
 * @param pdfjs - the pdfjs module (needed for OPS enum)
 */
export async function extractColoursByOperatorList(
  page: PDFPageProxy,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfjs: any,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  let opList: { fnArray: number[]; argsArray: unknown[][] };
  try {
    opList = await (
      page as unknown as {
        getOperatorList(): Promise<{
          fnArray: number[];
          argsArray: unknown[][];
        }>;
      }
    ).getOperatorList();
  } catch {
    return result; // operator list unavailable — caller uses fallback
  }

  const OPS: Record<string, number> = pdfjs?.OPS ?? {};
  // Build reverse map: code → name
  const opsMap = buildOpsMap({ OPS });

  // Save/restore stack
  const stack: ColourState[] = [];
  let current: ColourState = { fill: "#000000" };

  // Text item counter — incremented every time a text-showing op occurs
  let textItemIdx = 0;

  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i++) {
    const code = fnArray[i];
    const args = argsArray[i] as number[];
    const name = opsMap.get(code) ?? "";

    switch (name) {
      // ── Save/restore ─────────────────────────────────────────────────────
      case "save":
        stack.push(cloneState(current));
        break;
      case "restore":
        if (stack.length > 0) current = stack.pop()!;
        break;

      // ── Fill colour setters ───────────────────────────────────────────────
      case "setFillGray":
        if (args.length >= 1) current.fill = grayToHex(args[0]);
        break;
      case "setFillRGBColor":
        if (args.length >= 3)
          current.fill = rgbToHex(args[0], args[1], args[2]);
        break;
      case "setFillCMYKColor":
        if (args.length >= 4)
          current.fill = cmykToHex(args[0], args[1], args[2], args[3]);
        break;
      case "setFillColorN":
      case "setFillColor": {
        // Colour-space dependent; we handle the most common ones.
        // If 1 arg → gray; 3 args → RGB; 4 args → CMYK
        if (args.length === 1) current.fill = grayToHex(args[0]);
        else if (args.length === 3)
          current.fill = rgbToHex(args[0], args[1], args[2]);
        else if (args.length >= 4)
          current.fill = cmykToHex(args[0], args[1], args[2], args[3]);
        break;
      }

      // ── Text-showing operators ────────────────────────────────────────────
      // Each of these corresponds to one text item in getTextContent order.
      case "showText":
      case "showSpacedText":
      case "nextLineShowText":
      case "nextLineSetSpacingShowText":
        result.set(textItemIdx++, current.fill);
        break;

      default:
        break;
    }
  }

  return result;
}

// ─── Canvas-based fallback ────────────────────────────────────────────────────

/**
 * For a text rect that operator-list analysis couldn't colour, sample the
 * rendered canvas and find the colour most different from the background.
 *
 * Returns null if the canvas is not available or tainted.
 */
export function sampleTextColourFromCanvas(
  canvas: HTMLCanvasElement,
  rect: RectPt,
  bgHex: string,
): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const { x, y, w, h } = rect;
  // rect is in canvas-pixel coordinates — caller must convert from PDF pts
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvas.width - 1, Math.ceil(x + w));
  const y1 = Math.min(canvas.height - 1, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return null;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  } catch {
    return null; // tainted
  }

  const bgR = parseInt(bgHex.slice(1, 3), 16) / 255;
  const bgG = parseInt(bgHex.slice(3, 5), 16) / 255;
  const bgB = parseInt(bgHex.slice(5, 7), 16) / 255;

  let bestDist = -1;
  let bestR = 0,
    bestG = 0,
    bestB = 0;

  const data = imageData.data;
  const step = Math.max(1, Math.floor(data.length / 4 / 200)); // ≤200 samples
  for (let i = 0; i < data.length; i += step * 4) {
    const a = data[i + 3];
    if (a < 32) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const dist =
      (r - bgR) * (r - bgR) + (g - bgG) * (g - bgG) + (b - bgB) * (b - bgB);
    if (dist > bestDist) {
      bestDist = dist;
      bestR = r;
      bestG = g;
      bestB = b;
    }
  }

  if (bestDist < 0) return null;
  return toHex(bestR, bestG, bestB);
}

/**
 * Convenience: given an operator-list colour map, a background sampler, and
 * a background colour, return the best colour for each text item index.
 *
 * @param opColours - Map from itemIndex → hex from operator list (may be empty)
 * @param itemIndex - the item we want the colour for
 * @param bgHex     - sampled background hex under this run
 */
export function resolveTextColour(
  opColours: Map<number, string>,
  itemIndex: number,
  bgHex: string,
): string {
  const fromOps = opColours.get(itemIndex);
  if (fromOps && fromOps.toLowerCase() !== bgHex.toLowerCase()) {
    return fromOps;
  }

  // If index missed, try the nearest previous colour (indices drift when
  // getTextContent groups/splits items differently from the operator list).
  for (let back = itemIndex - 1; back >= Math.max(0, itemIndex - 3); back--) {
    const prev = opColours.get(back);
    if (prev && prev.toLowerCase() !== bgHex.toLowerCase()) {
      return prev;
    }
  }

  const fallback = "#000000";
  return fallback.toLowerCase() === bgHex.toLowerCase() ? "#ffffff" : fallback;
}