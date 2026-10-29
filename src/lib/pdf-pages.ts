"use client";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

export async function renderPdfPages(
  buffer: ArrayBuffer,
  scale = 1.4,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: { canvas: HTMLCanvasElement; width: number; height: number }[] =
    [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not available in this browser.");

    // FIX: pdfjs-dist v5/v6 mein render parameters mein `canvas` dena zaroori hai
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    pages.push({ canvas, width: canvas.width, height: canvas.height });
  }

  return pages;
}

export async function canvasesToPdf(
  pages: { canvas: HTMLCanvasElement }[],
  jpegQuality: number,
  grayscale: boolean,
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const { canvas } of pages) {
    const work = document.createElement("canvas");
    work.width = canvas.width;
    work.height = canvas.height;
    const ctx = work.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    if (grayscale) ctx.filter = "grayscale(100%)";
    ctx.drawImage(canvas, 0, 0);
    const blob = await canvasToBlob(work, "image/jpeg", jpegQuality);
    const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = out.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }
  return out.save({ useObjectStreams: true });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not encode image from PDF page."));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}
