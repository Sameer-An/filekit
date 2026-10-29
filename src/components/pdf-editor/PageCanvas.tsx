// src/components/pdf-editor/PageCanvas.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { getPdfjs, getPage } from "@/lib/pdf-editor/pdfjs";
import { getCachedPdf } from "@/lib/pdf-editor/pdfjs-cache";
import { isPageExtracted, usePdfEditor } from "@/lib/pdf-editor/store";
import { extractTextRuns } from "@/lib/pdf-editor/text-runs";
import { extractImagePlacements } from "@/lib/pdf-editor/image-placement";
import { makeBackgroundSampler } from "@/lib/pdf-editor/background-sample";
import { pageUid, rotatedPageSize } from "@/lib/pdf-editor/coords";
import type { PageInfo } from "@/lib/pdf-editor/types";
import { ObjectLayer } from "./ObjectLayer";
import { GridOverlay } from "./GridOverlay";
import { PageOverlayPreview } from "./PageOverlayPreview";

interface PageCanvasProps {
  pageIndex: number;
  pageInfo: PageInfo;
  zoom: number;
  /** Debounced zoom used for rasterising. `zoom` only scales it with CSS. */
  renderZoom: number;
  showGrid: boolean;
  debug?: boolean;
}

/** Hard cap on canvas pixels (zoom 4 x DPR 3 used to reach ~72M px). */
const MAX_CANVAS_PIXELS = 16_000_000;

/** Page uids currently being extracted (avoids double work). */
const extracting = new Set<string>();

function PageCanvasImpl({
  pageIndex,
  pageInfo,
  zoom,
  renderZoom,
  showGrid,
  debug = false,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderReady, setRenderReady] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const originalBytes = usePdfEditor((s) => s.originalBytes);
  const totalPages = usePdfEditor((s) => s.numPages);

  useEffect(() => {
    if (!originalBytes) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    const { w: wPt, h: hPt } = rotatedPageSize(pageInfo);

    /** Extract text runs + images once per page instance (never via commit). */
    const extractOnce = async (
      pdfPage: PDFPageProxy,
      source: HTMLCanvasElement,
    ) => {
      const uid = pageUid(pageInfo);
      if (isPageExtracted(uid) || extracting.has(uid)) return;
      const st = usePdfEditor.getState();
      const idx = st.pages.findIndex((p) => pageUid(p) === uid);
      if (idx < 0) return;
      const alreadyHas = (st.pageObjectIds[idx] ?? []).some((id) => {
        const k = st.objects[id]?.kind;
        return k === "text-run" || k === "image-placement";
      });
      if (alreadyHas) {
        st.addExtracted(idx, uid, []); // e.g. a duplicated page: just mark it
        return;
      }
      extracting.add(uid);
      try {
        // 1 px = 1 pt copy, so sampling is cheap and the main canvas can stay GPU-backed.
        const sample = document.createElement("canvas");
        sample.width = Math.max(1, Math.round(wPt));
        sample.height = Math.max(1, Math.round(hPt));
        sample
          .getContext("2d", { willReadFrequently: true })
          ?.drawImage(source, 0, 0, sample.width, sample.height);

        const sampler = makeBackgroundSampler(sample, pageInfo, 1);

        const runs = await extractTextRuns(pdfPage, pageInfo, {
          sampleBackground: sampler,
        });

        // Pass the `source` canvas so moving an image extracts its pixels directly from the rendered page
        const placements = await extractImagePlacements(
          pdfPage,
          pageInfo,
          source,
        );

        // images first => they sit below the text runs
        usePdfEditor
          .getState()
          .addExtracted(idx, uid, [...placements, ...runs]);
      } catch (err) {
        console.warn("[PageCanvas] extraction failed", err);
      } finally {
        extracting.delete(uid);
      }
    };

    const run = async () => {
      try {
        setRenderError(null);
        await getPdfjs();
        const loaded = await getCachedPdf(originalBytes);
        if (cancelled) return;

        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const wanted = (renderZoom || 1) * dpr;
        const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, wPt * hPt));
        const scale = Math.max(0.1, Math.min(wanted, maxScale));

        // Always draw into a FRESH offscreen canvas: no "same canvas used by
        // multiple render() operations" error, and no blank flash on zoom.
        const off = document.createElement("canvas");
        let pdfPage: PDFPageProxy | null = null;
        const src = pageInfo.index; // SOURCE page; -1 = blank page

        if (src < 0 || src >= loaded.pdf.numPages) {
          off.width = Math.max(1, Math.floor(wPt * scale));
          off.height = Math.max(1, Math.floor(hPt * scale));
          const c = off.getContext("2d");
          if (c) {
            c.fillStyle = "#ffffff";
            c.fillRect(0, 0, off.width, off.height);
          }
        } else {
          pdfPage = await getPage(loaded.pdf, src);
          if (cancelled) return;
          const viewport = pdfPage.getViewport({
            scale,
            rotation: pageInfo.rotation,
          });
          off.width = Math.max(1, Math.floor(viewport.width));
          off.height = Math.max(1, Math.floor(viewport.height));
          const octx = off.getContext("2d");
          if (!octx) throw new Error("Canvas 2D context unavailable.");
          octx.fillStyle = "#ffffff";
          octx.fillRect(0, 0, off.width, off.height);

          // FIX: Added `canvas: off` to satisfy pdfjs-dist v5/v6 types
          const t = pdfPage.render({
            canvas: off,
            canvasContext: octx,
            viewport,
            intent: "display",
          });

          task = t;
          await t.promise;
        }
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        // Resize + draw in the same task => the browser never paints a blank frame.
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
        setRenderReady(true);

        if (pdfPage) await extractOnce(pdfPage, off);
      } catch (err) {
        if (cancelled) return;
        if ((err as { name?: string })?.name === "RenderingCancelledException")
          return;
        console.error("[PageCanvas] render failed", err);
        setRenderError(err instanceof Error ? err.message : "Render error");
      }
    };

    void run();
    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
    };
    // NOTE: `zoom` is intentionally NOT a dependency (CSS scales it);
    // only the debounced `renderZoom` re-rasterises.
  }, [originalBytes, pageInfo, renderZoom]);

  const { w: wrapperW, h: wrapperH } = rotatedPageSize(pageInfo);

  return (
    <div
      className="absolute top-0 left-0 bg-white shadow-[0_0_24px_rgba(0,0,0,0.5)]"
      style={{
        width: wrapperW,
        height: wrapperH,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}
    >
      {!renderReady && !renderError && (
        <div className="absolute inset-0 z-[1] grid place-items-center text-xs text-zinc-400 bg-white">
          Rendering…
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 z-[1] grid place-items-center text-xs text-red-500 bg-white p-4 text-center">
          {renderError}
        </div>
      )}
      {debug && (
        <div className="absolute inset-0 border-2 border-red-500 pointer-events-none z-[9999]" />
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 select-none"
        style={{ width: wrapperW, height: wrapperH }}
      />

      {showGrid && <GridOverlay pageInfo={pageInfo} />}

      <PageOverlayPreview
        pageInfo={pageInfo}
        pageIndex={pageIndex}
        totalPages={totalPages}
      />

      <ObjectLayer
        pageIndex={pageIndex}
        pageInfo={pageInfo}
        zoom={zoom}
        debug={debug}
      />
    </div>
  );
}

export const PageCanvas = React.memo(PageCanvasImpl);
