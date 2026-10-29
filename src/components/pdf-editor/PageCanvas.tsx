// src/components/pdf-editor/PageCanvas.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { getPdfjs, getPage } from "@/lib/pdf-editor/pdfjs";
import { getCachedPdf } from "@/lib/pdf-editor/pdfjs-cache";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import { extractTextRuns } from "@/lib/pdf-editor/text-runs";
import { extractImagePlacements } from "@/lib/pdf-editor/image-placement";
import { makeBackgroundSampler } from "@/lib/pdf-editor/background-sample";
import type { PageInfo } from "@/lib/pdf-editor/types";
import { ObjectLayer } from "./ObjectLayer";
import { GridOverlay } from "./GridOverlay";

interface PageCanvasProps {
pageIndex: number;
pageInfo: PageInfo;
widthPx: number;
heightPx: number;
zoom: number;
renderZoom: number;
showGrid: boolean;
debug?: boolean;
}

const extracting = new Set<string>();

export function PageCanvas({
pageIndex,
pageInfo,
widthPx,
heightPx,
zoom,
renderZoom,
showGrid,
debug = false,
}: PageCanvasProps) {
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const [renderReady, setRenderReady] = useState(false);
const [renderError, setRenderError] = useState<string | null>(null);

const originalBytes = usePdfEditor((s) => s.originalBytes);
const commit = usePdfEditor((s) => s.commit);

useEffect(() => {
    if (!canvasRef.current || !originalBytes) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

    const render = async () => {
    try {
        setRenderError(null);
        await getPdfjs();
        const loaded = await getCachedPdf(originalBytes);

        const canvas = canvasRef.current;
        if (!canvas) return;

        // FIX: Handle newly duplicated/inserted pages
        if (pageIndex >= loaded.pdf.numPages) {
        const scale = (renderZoom || zoom) * dpr;
        const isRotated =
            pageInfo.rotation === 90 || pageInfo.rotation === 270;
        const w = isRotated ? pageInfo.heightPt : pageInfo.widthPt;
        const h = isRotated ? pageInfo.widthPt : pageInfo.heightPt;
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        setRenderReady(true);
        return; // Skip pdfjs extraction for pages that don't exist in original file
        }

        const page = await getPage(loaded.pdf, pageIndex);
        if (cancelled) return;

        const viewport = page.getViewport({
        scale: (renderZoom || zoom) * dpr,
        rotation: pageInfo.rotation,
        });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context unavailable.");

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        intent: "display",
        });
        task = renderTask;
        await renderTask.promise;

        if (!cancelled) setRenderReady(true);

        const pageKey = `${pageIndex}-${pageInfo.widthPt}-${pageInfo.heightPt}`;
        if (!extracting.has(pageKey)) {
        extracting.add(pageKey);
        try {
            const sampler = makeBackgroundSampler(
            canvas,
            pageInfo,
            (renderZoom || zoom) * dpr,
            );
            const runs = await extractTextRuns(page, pageInfo, {
            sampleBackground: sampler,
            });
            const placements = await extractImagePlacements(page, pageInfo);
            commit("Extract page", (d) => {
            for (const run of runs) {
                if (!d.objects[run.id]) {
                d.objects[run.id] = run;
                (d.pageObjectIds[pageIndex] ??= []).push(run.id);
                }
            }
            for (const placement of placements) {
                if (!d.objects[placement.id]) {
                d.objects[placement.id] = placement;
                (d.pageObjectIds[pageIndex] ??= []).push(placement.id);
                }
            }
            });
        } catch (err) {
            console.warn("[PageCanvas] extraction failed", err);
        } finally {
            extracting.delete(pageKey);
        }
        }
    } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === "RenderingCancelledException") return;
        console.error("[PageCanvas] render failed", err);
        setRenderError(err instanceof Error ? err.message : "Render error");
    }
    };

    void render();

    return () => {
    cancelled = true;
    try {
        task?.cancel();
    } catch {}
    };
}, [originalBytes, pageIndex, pageInfo, renderZoom, zoom, commit]);

const baseW = pageInfo.widthPt;
const baseH = pageInfo.heightPt;
const isRotated = pageInfo.rotation === 90 || pageInfo.rotation === 270;
const wrapperW = isRotated ? baseH : baseW;
const wrapperH = isRotated ? baseW : baseH;

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
        <div className="absolute inset-0 grid place-items-center text-xs text-zinc-400 bg-white">
        Rendering…
        </div>
    )}
    {renderError && (
        <div className="absolute inset-0 grid place-items-center text-xs text-red-500 bg-white p-4 text-center">
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

    <ObjectLayer
        pageIndex={pageIndex}
        pageInfo={pageInfo}
        zoom={1}
        debug={debug}
    />
    </div>
);
}
