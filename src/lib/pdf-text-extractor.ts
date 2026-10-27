/**
 * pdf-text-extractor.ts
 *
 * Layout-aware PDF → text + Markdown table extraction using PDF.js.
 *
 * Pipeline (all internal, all within this file):
 *   raw PDF.js items → Item[]
 *   Item[]           → Line[]   (stable baseline grouping)
 *   Line[]           → Block[]  (vertical gap + structural compatibility)
 *   Block            → Rendered (text | list | table)
 *   Rendered[]       → strings + fullText
 *
 * Table reconstruction is grid-based:
 *   - a shared column grid is inferred from recurring *left* edges across
 *     the whole block (right edges vary with wrapped text length and are
 *     used only as confirmation), not from per-line gap splitting;
 *   - wrapped-line continuation is decided by geometric alignment against
 *     the grid, not by "any one-cell row after another";
 *   - spanning cells are only split when geometry *and* tokens agree;
 *   - header rows are chosen by grid alignment and row shape, and header
 *     labels from multiple rows are combined only when they exclusively
 *     cover the same column (so `Sr.` + `No.` → `Sr. No.`).
 *
 * Cross-page table merging is applied only to `fullText`. The per-page
 * `pages[].text` always reflects the original page content.
 */

import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";

/* ------------------------------------------------------------------ */
/* Public types                                                       */
/* ------------------------------------------------------------------ */

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  fullText: string;
  pageCount: number;
  wordCount: number;
  charCount: number;
  pages: ExtractedPdfPage[];
}

/* ------------------------------------------------------------------ */
/* Internal types                                                     */
/* ------------------------------------------------------------------ */

interface Item {
  str: string;
  x: number;
  endX: number;
  y: number;          // baseline in PDF coordinates (y increases upward)
  top: number;
  bottom: number;
  fontSize: number;
  seq: number;
}

interface Cell {
  x: number;
  endX: number;
  text: string;
  items: Item[];      // original items (used for numeric column assignment)
}

interface Line {
  y: number;
  top: number;
  bottom: number;
  items: Item[];
  cells: Cell[];
  fontSize: number;
}

interface Column {
  center: number;
  left: number;
  right: number;
}

type Rendered =
  | { kind: "table"; header: string[]; body: string[][] }
  | { kind: "list"; entries: string[] }
  | { kind: "text"; text: string };

interface PageResult {
  pageNumber: number;
  rendered: Rendered[];
}

const EMPTY_TEXT_MESSAGE =
  "No selectable text found in this PDF. The document may consist of scanned images. OCR (Optical Character Recognition) is required to extract text.";

const NUMERIC_RE = /^[+-]?\d+(?:\.\d+)?%?$/;
const LIST_MARKER_RE = /^[\(\[]?(?:\d+|[a-zA-Z]|[ivxIVX]+)[\)\].]?$/;

/* ------------------------------------------------------------------ */
/* Worker                                                             */
/* ------------------------------------------------------------------ */

function configurePdfWorker(): void {
  if (typeof window === "undefined") {
    GlobalWorkerOptions.workerSrc = "";
    return;
  }
  try {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function extractPdfText(
  pdfBuffer: ArrayBuffer
): Promise<ExtractedPdf> {
  configurePdfWorker();

  const isBrowser = typeof window !== "undefined";
  let loadingTask: ReturnType<typeof getDocument> | undefined;

  try {
    loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      ...(isBrowser ? {} : { disableWorker: true }),
    });

    const pdf = await loadingTask.promise;
    const pageResults: PageResult[] = [];

    for (let pn = 1; pn <= pdf.numPages; pn++) {
      const page = await pdf.getPage(pn);
      try {
        const content = await page.getTextContent();
        const rendered = processPageItems(content.items as unknown[]);
        pageResults.push({ pageNumber: pn, rendered });
      } finally {
        try {
          page.cleanup();
        } catch {
          /* ignore */
        }
      }
    }

    // Per-page output: original page content, no cross-page merging.
    const pages: ExtractedPdfPage[] = pageResults.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.rendered
        .map(renderToString)
        .filter((s) => s.trim().length > 0)
        .join("\n\n")
        .trim(),
    }));

    const hasText = pages.some((p) => p.text.length > 0);
    if (!hasText) {
      return {
        fullText: EMPTY_TEXT_MESSAGE,
        pageCount: pdf.numPages,
        wordCount: 0,
        charCount: 0,
        pages,
      };
    }

    // fullText: merged view (cross-page table continuations fused).
    const fullText = buildFullTextWithMerges(pageResults);

    const allText = pages.map((p) => p.text).join("\n");
    const wordCount = allText.trim()
      ? allText.trim().split(/\s+/).filter(Boolean).length
      : 0;

    return {
      fullText,
      pageCount: pdf.numPages,
      wordCount,
      charCount: allText.length,
      pages,
    };
  } catch (error) {
    throw mapPdfError(error);
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Item extraction                                                    */
/* ------------------------------------------------------------------ */

function extractItems(rawItems: unknown[]): Item[] {
  const out: Item[] = [];
  let seq = 0;

  for (const raw of rawItems) {
    seq++;
    if (typeof raw !== "object" || raw === null) continue;
    const it = raw as Record<string, unknown>;

    const str = it.str;
    if (typeof str !== "string" || str.trim().length === 0) continue;

    const transform = it.transform;
    if (!Array.isArray(transform) || transform.length < 6) continue;

    const t0 = Number(transform[0]);
    const t1 = Number(transform[1]);
    const t2 = Number(transform[2]);
    const t3 = Number(transform[3]);
    const tx = Number(transform[4]);
    const ty = Number(transform[5]);
    if (![t0, t1, t2, t3, tx, ty].every(Number.isFinite)) continue;

    const rawWidth = Number(it.width);
    const width = Number.isFinite(rawWidth) && rawWidth >= 0 ? rawWidth : 0;

    // Font scale from the text matrix's first column. Fallbacks: second
    // column, item height, then a sane default. Rotated text is kept but
    // is not allowed to dominate a baseline group.
    let scale = Math.hypot(t0, t1);
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = Math.hypot(t2, t3);
    }
    if (!Number.isFinite(scale) || scale <= 0) {
      const rawHeight = Number(it.height);
      scale = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 10;
    }

    // Off-diagonal terms indicate rotation. Conservative: only reduce
    // the effective size used for grouping, never drop the item.
    const rotated = Math.abs(t1) > 1e-3 || Math.abs(t2) > 1e-3;
    const fontSize = rotated ? scale * 0.5 : scale;

    out.push({
      str,
      x: tx,
      endX: tx + width,
      y: ty,
      top: ty + fontSize,
      bottom: ty,
      fontSize,
      seq,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Line building                                                      */
/* ------------------------------------------------------------------ */

/**
 * Stable baseline grouping:
 *   - sort top→bottom, then left→right;
 *   - keep a running anchor baseline for the current line;
 *   - use a tolerance relative to the *smaller* of the two font sizes so
 *     that a large heading does not swallow following body text;
 *   - also allow a slight baseline difference when the item is
 *     horizontally adjacent (super/subscripts, inline math).
 *
 * No fixed pixel tolerance: everything scales with font size.
 */
function buildLines(items: Item[]): Line[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const dy = b.y - a.y;
    const maxFs = Math.max(a.fontSize, b.fontSize, 1);
    if (Math.abs(dy) > maxFs * 0.5) return dy;
    return a.x - b.x;
  });

  const groups: Item[][] = [];
  let current: Item[] = [sorted[0]];
  let anchorY = sorted[0].y;
  let maxFsInGroup = sorted[0].fontSize;

  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    const minFs = Math.min(it.fontSize, maxFsInGroup);
    const baseTol = Math.max(minFs * 0.45, 2);
    const closeEnough =
      Math.abs(it.y - anchorY) <= baseTol;

    const nearBaseline =
      Math.abs(it.y - anchorY) <= Math.max(maxFsInGroup, it.fontSize) * 0.75;
    const horizontallyNear = horizontalProximity(current, it) > 0;
    const sameLineByProximity = nearBaseline && horizontallyNear;

    if (closeEnough || sameLineByProximity) {
      current.push(it);
      maxFsInGroup = Math.max(maxFsInGroup, it.fontSize);
      anchorY =
        current.reduce((s, x) => s + x.y, 0) / current.length;
    } else {
      groups.push(current);
      current = [it];
      anchorY = it.y;
      maxFsInGroup = it.fontSize;
    }
  }
  groups.push(current);

  return groups.map((g) => makeLine(g));
}

function horizontalProximity(group: Item[], it: Item): number {
  let best = 0;
  for (const g of group) {
    const overlap = Math.min(it.endX, g.endX) - Math.max(it.x, g.x);
    if (overlap > 0) {
      const minWidth = Math.min(
        Math.max(it.endX - it.x, 1),
        Math.max(g.endX - g.x, 1)
      );
      best = Math.max(best, overlap / minWidth);
    } else {
      const gap = Math.min(
        Math.abs(it.x - g.endX),
        Math.abs(g.x - it.endX)
      );
      if (gap <= Math.max(it.fontSize, g.fontSize) * 1.5) {
        best = Math.max(best, 0.01);
      }
    }
  }
  return best;
}

function robustBaseline(items: Item[]): number {
  if (items.length === 0) return 0;
  const ys = items.map((i) => i.y).sort((a, b) => a - b);
  return ys[Math.floor(ys.length / 2)];
}

function makeLine(items: Item[]): Line {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const top = Math.max(...sorted.map((i) => i.top));
  const bottom = Math.min(...sorted.map((i) => i.bottom));
  const fontSize =
    sorted.reduce((s, i) => s + i.fontSize, 0) / sorted.length;

  return {
    y: robustBaseline(sorted),
    top,
    bottom,
    items: sorted,
    cells: splitIntoCells(sorted),
    fontSize,
  };
}

/* ------------------------------------------------------------------ */
/* Cell splitting within a line                                       */
/* ------------------------------------------------------------------ */

/**
 * A *line-level cell* is only a candidate group of text. It is NOT a
 * final table cell. Column membership is decided later at block level
 * against a shared grid, so a gap here is never by itself proof of a
 * new column.
 *
 * The threshold is intentionally generous (≈2–3 character widths) so
 * normal word spacing stays inside a cell, while clear column gaps
 * split. `items` are preserved on the resulting Cell so that numeric
 * cells can later be distributed using their actual x positions.
 */
function splitIntoCells(items: Item[]): Cell[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const cells: Cell[] = [];
  let group: Item[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const it = sorted[i];
    const gap = it.x - prev.endX;

    const fs = Math.max(prev.fontSize, it.fontSize, 1);
    const prevCharW =
      prev.str.length > 0
        ? Math.max(prev.endX - prev.x, 0) / prev.str.length
        : fs * 0.5;
    const itCharW =
      it.str.length > 0
        ? Math.max(it.endX - it.x, 0) / it.str.length
        : fs * 0.5;

    const threshold = Math.max(
      fs * 2.0,
      prevCharW * 3,
      itCharW * 3,
      6
    );

    if (gap > threshold) {
      cells.push(buildCell(group));
      group = [it];
    } else {
      group.push(it);
    }
  }
  cells.push(buildCell(group));

  return cells.filter((c) => c.text.length > 0);
}

function buildCell(items: Item[]): Cell {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const x = sorted[0].x;
  const endX = Math.max(...sorted.map((i) => i.endX));

  let text = "";
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      const gap = sorted[i].x - prev.endX;
      const fs = Math.max(prev.fontSize, sorted[i].fontSize);
      const charW =
        prev.str.length > 0
          ? Math.max(prev.endX - prev.x, 0) / prev.str.length
          : fs * 0.5;
      if (gap > charW * 0.3) text += " ";
    }
    text += sorted[i].str;
  }

  return {
    x,
    endX,
    text: text.replace(/\s+/g, " ").trim(),
    items: sorted,
  };
}

/* ------------------------------------------------------------------ */
/* Block building                                                     */
/* ------------------------------------------------------------------ */

/**
 * Lines belong to the same block when they are vertically close AND
 * their geometry is compatible. Vertical split uses a scaled gap
 * (font-size aware) so paragraphs and section headings separate
 * reliably.
 */
function buildBlocks(lines: Line[]): Line[][] {
  if (lines.length === 0) return [];

  const blocks: Line[][] = [];
  let current: Line[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const prev = current[current.length - 1];
    const it = lines[i];
    const vGap = Math.abs(prev.y - it.y);
    const fs = Math.max(prev.fontSize, it.fontSize, 1);

    const tooFar = vGap > fs * 2.4;
    const compatible = linesAreCompatible(prev, it);

    if (!tooFar && compatible) {
      current.push(it);
    } else {
      blocks.push(current);
      current = [it];
    }
  }
  blocks.push(current);
  return blocks;
}

function linesAreCompatible(a: Line, b: Line): boolean {
  const aL = Math.min(...a.cells.map((c) => c.x));
  const aR = Math.max(...a.cells.map((c) => c.endX));
  const bL = Math.min(...b.cells.map((c) => c.x));
  const bR = Math.max(...b.cells.map((c) => c.endX));

  const overlap = Math.min(aR, bR) - Math.max(aL, bL);
  if (overlap > 0) return true;

  const fs = Math.max(a.fontSize, b.fontSize, 1);
  const tol = Math.max(fs * 0.75, 4);
  return Math.abs(aL - bL) <= tol;
}

/* ------------------------------------------------------------------ */
/* Block interpretation                                               */
/* ------------------------------------------------------------------ */

function interpretBlock(block: Line[]): Rendered | null {
  if (block.length === 0) return null;

  const wideRows = block.filter((l) => {
    const xs = l.cells.map((c) => c.x).sort((a, b) => a - b);
    if (xs.length < 2) return false;
    const fs = l.fontSize || 10;
    return xs[1] - xs[0] > Math.max(fs * 1.5, 8);
  });
  if (wideRows.length < 2) return textFromLines(block);

  if (isList(block)) return listFromLines(block);

  const table = tryBuildTable(block);
  if (table) return table;

  return textFromLines(block);
}

/* ------------------------------------------------------------------ */
/* List detection                                                     */
/* ------------------------------------------------------------------ */

function isList(lines: Line[]): boolean {
  if (lines.length < 2) return false;
  for (const l of lines) {
    const cells = l.cells.filter((c) => c.text.length > 0);
    if (cells.length !== 2) return false;
    if (!LIST_MARKER_RE.test(cells[0].text)) return false;
  }
  return true;
}

function listFromLines(lines: Line[]): Rendered {
  return {
    kind: "list",
    entries: lines.map((l) => {
      const cells = l.cells.filter((c) => c.text.length > 0);
      const marker = cells[0]?.text ?? "";
      const content = cells
        .slice(1)
        .map((c) => c.text)
        .join(" ")
        .trim();
      const m = marker.match(/^[\(\[]?(\d+)[\)\].]?$/);
      if (m) return `${m[1]}. ${content}`;
      if (/^[-•·*]$/.test(marker)) return `- ${content}`;
      return `${marker} ${content}`;
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Column grid                                                        */
/* ------------------------------------------------------------------ */

/**
 * Infer a column grid from recurring *left* edges. Right edges are
 * unreliable for wrapped text (their position varies with line length),
 * so they are not used to seed clusters here. The algorithm:
 *
 *   1. Collect every cell's left edge.
 *   2. Cluster edges with a tolerance scaled to the block's median font.
 *   3. Keep clusters seen on ≥2 lines, or on the first line (strong
 *      header evidence).
 *   4. Sort by centre and derive [left, right] boundaries halfway
 *      between neighbours.
 */
function detectColumnGrid(lines: Line[]): Column[] {
  if (lines.length === 0) return [];

  const edges: { pos: number; line: number }[] = [];
  for (let r = 0; r < lines.length; r++) {
    for (const c of lines[r].cells) {
      if (c.text.length === 0) continue;
      edges.push({ pos: c.x, line: r });
    }
  }
  if (edges.length === 0) return [];

  const fs = median(lines.map((l) => l.fontSize)) || 10;
  const tol = Math.max(fs * 0.6, 4);

  edges.sort((a, b) => a.pos - b.pos);

  interface Cluster {
    sum: number;
    n: number;
    lines: Set<number>;
    firstLine: number;
  }
  const clusters: Cluster[] = [];
  for (const e of edges) {
    let matched = false;
    for (const cl of clusters) {
      const center = cl.sum / cl.n;
      if (Math.abs(e.pos - center) <= tol) {
        cl.sum += e.pos;
        cl.n += 1;
        cl.lines.add(e.line);
        cl.firstLine = Math.min(cl.firstLine, e.line);
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({
        sum: e.pos,
        n: 1,
        lines: new Set([e.line]),
        firstLine: e.line,
      });
    }
  }

  const kept = clusters.filter(
    (cl) => cl.lines.size >= 2 || cl.firstLine === 0
  );
  if (kept.length === 0) {
    return clusters.map((cl) => {
      const c = cl.sum / cl.n;
      return { center: c, left: c - tol * 2, right: c + tol * 2 };
    });
  }

  const centers = kept
    .map((cl) => cl.sum / cl.n)
    .sort((a, b) => a - b);

  return centers.map((center, i) => {
    const prev = centers[i - 1];
    const next = centers[i + 1];
    return {
      center,
      left: prev !== undefined ? (prev + center) / 2 : center - tol * 3,
      right: next !== undefined ? (center + next) / 2 : center + tol * 3,
    };
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* ------------------------------------------------------------------ */
/* Table construction                                                 */
/* ------------------------------------------------------------------ */

function tryBuildTable(lines: Line[]): Rendered | null {
  if (lines.length < 2) return null;

  const grid = detectColumnGrid(lines);
  if (grid.length < 2) return null;

  const totalCells = lines.reduce(
    (s, l) => s + l.cells.filter((c) => c.text.length > 0).length,
    0
  );
  if (grid.length > totalCells) return null;

  const headerCount = detectHeaderRowCount(lines, grid);
  const headerLines = lines.slice(0, headerCount);
  const bodyLines = lines.slice(headerCount);

  const mergedBody = mergeContinuations(bodyLines, grid);
  if (mergedBody.length === 0) return null;

  const bodyRows = mergedBody.map((l) => assignLineToGrid(l, grid));

  let aligned = 0;
  for (const row of bodyRows) {
    if (row.filter((c) => c.length > 0).length >= 2) aligned++;
  }
  if (aligned / bodyRows.length < 0.6) return null;

  const header = buildHeader(headerLines, grid);
  const keep = selectColumns(header, bodyRows);
  if (keep.length < 2) return null;

  const finalHeader = keep.map((i) => header[i] ?? "");
  const finalBody = bodyRows
    .map((r) => keep.map((i) => r[i] ?? ""))
    .filter((r) => r.some((c) => c.length > 0));

  if (finalBody.length === 0) return null;

  return { kind: "table", header: finalHeader, body: finalBody };
}

/* ------------------------------------------------------------------ */
/* Continuation-row merging                                           */
/* ------------------------------------------------------------------ */

/**
 * A wrapped line is merged into the previous row only if:
 *   - it populates exactly one line-level cell;
 *   - that cell geometrically aligns with a cell in the previous row
 *     (overlap or a small leftward/rightward offset — not a fixed
 *     threshold);
 *   - the vertical gap is below one row height;
 *   - the cell does not look like a self-contained record (e.g. a
 *     numeric serial in the first column, or a very short token).
 *
 * This prevents a new unit row (numeric first cell) from being
 * merged into the previous row, while still allowing long
 * descriptions to wrap naturally.
 */
function mergeContinuations(lines: Line[], grid: Column[]): Line[] {
  const out: Line[] = [];

  for (const line of lines) {
    const populated = line.cells.filter((c) => c.text.length > 0);
    if (populated.length === 0) continue;

    if (populated.length === 1 && out.length > 0) {
      const prev = out[out.length - 1];
      const prevPopulated = prev.cells.filter((c) => c.text.length > 0);
      const gap = Math.abs(prev.y - line.y);
      const fs = Math.max(prev.fontSize, line.fontSize, 1);

      const cell = populated[0];
      const gapOk = gap <= fs * 1.8;
      const aligns = continuationAligns(cell, prevPopulated, fs);
      const looksLikeNewRecord = isNewRecordCell(cell, grid);

      if (gapOk && aligns && !looksLikeNewRecord) {
        const cells = prev.cells.slice();
        for (let i = 0; i < cells.length; i++) {
          if (cellsOverlapOrAdjacent(cells[i], cell, fs)) {
            cells[i] = {
              x: Math.min(cells[i].x, cell.x),
              endX: Math.max(cells[i].endX, cell.endX),
              text: `${cells[i].text} ${cell.text}`
                .replace(/\s+/g, " ")
                .trim(),
              items: [...cells[i].items, ...cell.items],
            };
            break;
          }
        }
        out[out.length - 1] = { ...prev, cells };
        continue;
      }
    }

    out.push(line);
  }

  return out;
}

function continuationAligns(cell: Cell, prevCells: Cell[], fs: number): boolean {
  for (const pc of prevCells) {
    if (cellsOverlapOrAdjacent(pc, cell, fs)) return true;
    // A continuation often starts at the same left edge as the parent.
    if (Math.abs(cell.x - pc.x) <= fs * 2) return true;
    // …or is slightly indented within the parent's range.
    if (cell.x >= pc.x && cell.x <= pc.x + fs * 5) return true;
  }
  return false;
}

function cellsOverlapOrAdjacent(a: Cell, b: Cell, fs: number): boolean {
  const overlap = Math.min(a.endX, b.endX) - Math.max(a.x, b.x);
  if (overlap > 0) return true;
  const gap = Math.min(Math.abs(a.endX - b.x), Math.abs(b.endX - a.x));
  return gap <= fs;
}

function isNewRecordCell(cell: Cell, grid: Column[]): boolean {
  const idx = nearestColumnIndex(cell, grid);
  if (idx !== 0) return false;
  if (NUMERIC_RE.test(cell.text.trim())) return true;
  return cell.text.trim().length <= 4;
}

function nearestColumnIndex(cell: Cell, grid: Column[]): number {
  const center = (cell.x + cell.endX) / 2;
  return nearestColumnFromCenter(center, grid);
}

function nearestColumnFromCenter(center: number, grid: Column[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < grid.length; i++) {
    const d = Math.abs(center - grid[i].center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Row → grid assignment                                              */
/* ------------------------------------------------------------------ */

function assignLineToGrid(line: Line, grid: Column[]): string[] {
  const out: string[] = new Array(grid.length).fill("");

  for (const cell of line.cells) {
    if (cell.text.length === 0) continue;

    const covered = columnsCovered(cell, grid);
    if (covered.length === 0) {
      appendText(out, nearestColumnIndex(cell, grid), cell.text);
      continue;
    }

    if (covered.length === 1) {
      appendText(out, covered[0], cell.text);
      continue;
    }

    // Spanning cell. Try to split using actual item positions first:
    // this is the only reliable way when the gap between neighbouring
    // numeric values is below the line-level split threshold.
    if (
      cell.items.length > 1 &&
      cell.items.every((it) => NUMERIC_RE.test(it.str.trim()))
    ) {
      let assigned = 0;
      for (const item of cell.items) {
        const center = (item.x + item.endX) / 2;
        const idx = nearestColumnFromCenter(center, grid);
        if (idx >= 0) {
          appendText(out, idx, item.str.trim());
          assigned++;
        }
      }
      if (assigned > 0) continue;
    }

    // Fallback: token split when token count matches coverage exactly.
    const tokens = cell.text.split(/\s+/).filter(Boolean);
    const allNumeric =
      tokens.length > 0 && tokens.every((t) => NUMERIC_RE.test(t));

    if (allNumeric && tokens.length === covered.length) {
      for (let k = 0; k < covered.length; k++) {
        appendText(out, covered[k], tokens[k]);
      }
    } else {
      // Put the full text into the leftmost covered column; do not
      // spread prose across unrelated columns.
      appendText(out, covered[0], cell.text);
    }
  }

  return out;
}

function columnsCovered(cell: Cell, grid: Column[]): number[] {
  const covered: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    const overlap = Math.min(cell.endX, g.right) - Math.max(cell.x, g.left);
    if (overlap > 0) covered.push(i);
  }
  if (covered.length === 0) {
    covered.push(nearestColumnIndex(cell, grid));
  }
  return covered;
}

function appendText(arr: string[], idx: number, text: string): void {
  if (idx < 0 || idx >= arr.length) return;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return;
  arr[idx] = arr[idx] ? `${arr[idx]} ${t}` : t;
}

/* ------------------------------------------------------------------ */
/* Header detection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Header detection is grid-aware and scans *upward* from the first
 * data row. A section heading (single long cell that spans most of the
 * table width) terminates the scan so it is not absorbed into the
 * table header.
 */
function detectHeaderRowCount(lines: Line[], grid: Column[]): number {
  if (lines.length < 2) return 0;

  let dataRowIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].cells.filter((c) => c.text.length > 0);
    if (cells.length < 2) continue;
    if (cells.some((c) => NUMERIC_RE.test(c.text.trim()))) {
      dataRowIdx = i;
      break;
    }
  }

  if (dataRowIdx < 0) {
    const first = lines[0];
    const cells = first.cells.filter((c) => c.text.length > 0);
    const allShort = cells.every((c) => c.text.length <= 24);
    return allShort && cells.length >= 2 ? 1 : 0;
  }

  if (dataRowIdx === 0) return 0;

  const dataCols = new Set(
    lines[dataRowIdx].cells
      .filter((c) => c.text.length > 0)
      .map((c) => nearestColumnIndex(c, grid))
  );

  let count = 0;
  for (let i = dataRowIdx - 1; i >= 0; i--) {
    const line = lines[i];
    const cells = line.cells.filter((c) => c.text.length > 0);
    if (cells.length === 0) break;

    // Section heading (single long/sparse cell) — stop here.
    if (cells.length === 1) {
      const covered = columnsCovered(cells[0], grid);
      const text = cells[0].text.trim();
      if (
        covered.length >= grid.length * 0.5 ||
        text.length > 30 ||
        text.endsWith(":")
      ) {
        break;
      }
    }

    const headerCols = new Set(
      cells.map((c) => nearestColumnIndex(c, grid))
    );
    let overlap = 0;
    for (const hc of headerCols) if (dataCols.has(hc)) overlap++;
    if (overlap === 0) break;

    if (cells.some((c) => NUMERIC_RE.test(c.text.trim()))) break;

    count++;
    if (count >= 5) break;
  }

  return count;
}

/**
 * For each column, prefer labels from header rows whose cells cover
 * *only* that column (`exclusive parts`). This naturally:
 *   - drops grouping spans such as "Examination Marks";
 *   - keeps leaf labels such as "ESE (E)";
 *   - combines vertically-split labels such as "Sr." + "No.";
 *   - avoids appending unrelated section headings.
 * If no exclusive label exists, fall back to all covering labels.
 */
function buildHeader(headerLines: Line[], grid: Column[]): string[] {
  const out: string[] = new Array(grid.length).fill("");
  if (headerLines.length === 0) return out;

  for (let col = 0; col < grid.length; col++) {
    const exclusive: string[] = [];
    const fallback: string[] = [];

    for (const line of headerLines) {
      for (const cell of line.cells) {
        if (cell.text.length === 0) continue;
        const covered = columnsCovered(cell, grid);
        if (!covered.includes(col)) continue;
        const text = cell.text.trim();
        if (!text) continue;
        if (covered.length === 1) exclusive.push(text);
        else fallback.push(text);
      }
    }

    const parts = exclusive.length > 0 ? exclusive : fallback;
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(p);
    }
    out[col] = uniq.join(" ").replace(/\s+/g, " ").trim();
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Column pruning                                                     */
/* ------------------------------------------------------------------ */

function selectColumns(header: string[], body: string[][]): number[] {
  const keep: number[] = [];
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] ?? "").trim();
    const used = body.some((r) => (r[i] ?? "").trim().length > 0);
    if (h.length > 0 || used) keep.push(i);
  }
  return keep;
}

/* ------------------------------------------------------------------ */
/* Text rendering                                                     */
/* ------------------------------------------------------------------ */

function textFromLines(lines: Line[]): Rendered {
  const parts: string[] = [];
  let prevY: number | null = null;
  let prevFs = 10;

  for (const line of lines) {
    const text = line.cells
      .map((c) => c.text)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    if (prevY !== null) {
      const gap = Math.abs(prevY - line.y);
      const fs = Math.max(prevFs, line.fontSize);
      if (gap > fs * 1.6) parts.push("");
    }
    parts.push(text);
    prevY = line.y;
    prevFs = line.fontSize;
  }

  return { kind: "text", text: parts.join("\n").trim() };
}

/* ------------------------------------------------------------------ */
/* Cross-page continuation (fullText only)                            */
/* ------------------------------------------------------------------ */

/**
 * Build the `fullText` stream. We merge continuation tables only on a
 * deep copy so that `pages[].text` still reflects the original page
 * content.
 */
function buildFullTextWithMerges(pageResults: PageResult[]): string {
  const merged: PageResult[] = pageResults.map((p) => ({
    pageNumber: p.pageNumber,
    rendered: p.rendered.map(cloneRendered),
  }));

  mergeContinuationTables(merged);

  return merged
    .map((p) => {
      const text = p.rendered
        .map(renderToString)
        .filter((s) => s.trim().length > 0)
        .join("\n\n")
        .trim();
      return `--- Page ${p.pageNumber} ---\n${text}`;
    })
    .join("\n\n");
}

function cloneRendered(r: Rendered): Rendered {
  if (r.kind === "table") {
    return {
      kind: "table",
      header: [...r.header],
      body: r.body.map((row) => [...row]),
    };
  }
  if (r.kind === "list") {
    return { kind: "list", entries: [...r.entries] };
  }
  return { kind: "text", text: r.text };
}

/**
 * Merge a continuation table on page B into the last table on page A
 * when:
 *   - column count matches;
 *   - either B's header is empty AND B's table is the first rendered
 *     element on its page (no header, straight into rows); or
 *   - B's header matches A's header text (repeated header).
 *
 * Only the deep copy is modified. Rows are never duplicated in the
 * output stream, and no row content is dropped.
 */
function mergeContinuationTables(pages: PageResult[]): void {
  for (let i = 0; i < pages.length - 1; i++) {
    const a = pages[i];
    const b = pages[i + 1];

    const lastA = lastTableIndex(a.rendered);
    const firstB = firstTableIndex(b.rendered);
    if (lastA < 0 || firstB < 0) continue;

    const tA = a.rendered[lastA];
    const tB = b.rendered[firstB];
    if (tA.kind !== "table" || tB.kind !== "table") continue;

    if (tA.header.length !== tB.header.length) continue;

    const bHeaderEmpty = tB.header.every((h) => !h.trim());
    const headersEqual =
      !bHeaderEmpty &&
      tA.header.every(
        (h, idx) => normHeader(h) === normHeader(tB.header[idx])
      );

    const shouldMerge =
      (bHeaderEmpty && firstB === 0) || headersEqual;
    if (!shouldMerge) continue;

    a.rendered[lastA] = {
      kind: "table",
      header: tA.header,
      body: [...tA.body, ...tB.body],
    };
    b.rendered.splice(firstB, 1);
  }
}

function lastTableIndex(r: Rendered[]): number {
  for (let i = r.length - 1; i >= 0; i--) {
    if (r[i].kind === "table") return i;
  }
  return -1;
}

function firstTableIndex(r: Rendered[]): number {
  for (let i = 0; i < r.length; i++) {
    if (r[i].kind === "table") return i;
  }
  return -1;
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Serialization                                                      */
/* ------------------------------------------------------------------ */

function renderToString(r: Rendered): string {
  if (r.kind === "text") return r.text;
  if (r.kind === "list") return r.entries.join("\n");
  return renderTable(r.header, r.body);
}

function renderTable(header: string[], body: string[][]): string {
  if (body.length === 0) return "";
  const cols = header.length;
  if (cols < 2) return "";

  const esc = (s: string) =>
    s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

  const hasHeader = header.some((h) => h.trim().length > 0);

  if (!hasHeader) {
    // Continuation table with no header row. Render as pipe-delimited
    // rows without fabricating placeholder header text.
    return body
      .map((row) => {
        const cells: string[] = [];
        for (let i = 0; i < cols; i++) cells.push(esc(row[i] ?? ""));
        return cells.join(" | ");
      })
      .join("\n");
  }

  const aligned: string[] = [];
  for (let i = 0; i < cols; i++) {
    const values = body
      .map((r) => (r[i] ?? "").trim())
      .filter((v) => v.length > 0);
    if (values.length === 0) {
      aligned.push("---");
      continue;
    }
    const numeric = values.filter((v) => NUMERIC_RE.test(v)).length;
    aligned.push(numeric >= values.length * 0.8 ? "---:" : "---");
  }

  const lines: string[] = [];
  lines.push("| " + header.map(esc).join(" | ") + " |");
  lines.push("|" + aligned.join("|") + "|");
  for (const row of body) {
    const cells: string[] = [];
    for (let i = 0; i < cols; i++) cells.push(esc(row[i] ?? ""));
    lines.push("| " + cells.join(" | ") + " |");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Page pipeline                                                      */
/* ------------------------------------------------------------------ */

function processPageItems(rawItems: unknown[]): Rendered[] {
  const items = extractItems(rawItems);
  if (items.length === 0) return [];

  const lines = buildLines(items);
  if (lines.length === 0) return [];

  const blocks = buildBlocks(lines);
  const out: Rendered[] = [];
  for (const block of blocks) {
    const r = interpretBlock(block);
    if (r) out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Error mapping                                                      */
/* ------------------------------------------------------------------ */

function mapPdfError(error: unknown): Error {
  if (error instanceof Error) {
    const name = error.name;
    const msg = error.message;

    if (name === "PasswordException") {
      return new Error(
        "This PDF is password-protected. Text cannot be extracted without the correct password."
      );
    }
    if (name === "InvalidPDFException") {
      return new Error(
        "The file is not a valid PDF or appears to be corrupted."
      );
    }
    if (name === "MissingPDFException") {
      return new Error("The PDF file could not be found or loaded.");
    }
    if (name === "UnexpectedResponseException") {
      return new Error(
        "The PDF server returned an unexpected response while loading the file."
      );
    }
    if (msg && /worker/i.test(msg)) {
      return new Error(
        `Failed to load the PDF.js worker. Details: ${msg}`
      );
    }
    return new Error(`PDF text extraction failed: ${msg}`);
  }
  return new Error("An unknown error occurred while extracting PDF text.");
}