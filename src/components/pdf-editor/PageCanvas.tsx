    // src/components/pdf-editor/PageCanvas.tsx
    // Renders one page. Owns:
    //   - the pdfjs render task (cancelled on unmount)
    //   - the canvas sized for devicePixelRatio
    //   - lazy extraction of text runs + image placements on first view
    //   - the ObjectLayer (interactive) + GridOverlay (decorative)

    "use client";

    import React, { useEffect, useRef, useState } from "react";
    import { getPdfjs, getPage, loadPdfDocument } from "@/lib/pdf-editor/pdfjs";
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
    showGrid: boolean;
    }

    /** Module-level cache of the loaded pdfjs document (only one file). */
    interface LoadedState {
    bytes: Uint8Array | null;
    pdf: Awaited<ReturnType<typeof loadPdfDocument>> | null;
    }
    const loaded: LoadedState = { bytes: null, pdf: null };
    const extracting = new Set<string>();

    export function PageCanvas({
    pageIndex,
    pageInfo,
    widthPx,
    heightPx,
    zoom,
    showGrid,
    }: PageCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [renderReady, setRenderReady] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);

    const originalBytes = usePdfEditor((s) => s.originalBytes);
    const commit = usePdfEditor((s) => s.commit);

    // ── 1. Ensure the pdfjs document is loaded for the current bytes.
    useEffect(() => {
        if (!originalBytes) return;
        if (loaded.bytes === originalBytes && loaded.pdf) return;
        loaded.bytes = originalBytes;
        loaded.pdf = null;
        void loadPdfDocument(originalBytes).then((doc) => {
        if (loaded.bytes === originalBytes) loaded.pdf = doc;
        });
    }, [originalBytes]);

    // ── 2. Render the page into the canvas when visible.
    useEffect(() => {
        if (!canvasRef.current || !originalBytes) return;
        let cancelled = false;
        let task: { cancel: () => void } | null = null;

        const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

        const render = async () => {
        try {
            setRenderError(null);
            // Wait for pdfjs to be ready.
            const pdfjs = await getPdfjs();
            if (!loaded.pdf) {
            loaded.pdf = await loadPdfDocument(originalBytes);
            }
            const pdf = loaded.pdf!;
            const page = await getPage(pdf.pdf, pageIndex);
            if (cancelled) return;

            const viewport = page.getViewport({ scale: zoom * dpr, rotation: 0 });
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            canvas.style.width = `${widthPx}px`;
            canvas.style.height = `${heightPx}px`;

            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas 2D context unavailable.");
            // Fill with white so transparent PDFs render on paper.
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
            if (!cancelled) {
            setRenderReady(true);
            }

            // ── 3. Extract text runs + images once per page (background).
            const pageKey = `${pageIndex}-${pageInfo.widthPt}-${pageInfo.heightPt}`;
            if (!extracting.has(pageKey)) {
            extracting.add(pageKey);
            try {
                const sampler = makeBackgroundSampler(canvas, pageInfo, zoom * dpr);
                const runs = await extractTextRuns(page, pageInfo, {
                sampleBackground: sampler,
                });
                const placements = await extractImagePlacements(page, pageInfo);
                commit("Extract page", (d) => {
                for (const run of runs) {
                    if (!d.objects[run.id]) {
                    d.objects[run.id] = run;
                    const arr = d.pageObjectIds[pageIndex] ?? [];
                    if (!arr.includes(run.id)) arr.push(run.id);
                    d.pageObjectIds[pageIndex] = arr;
                    }
                }
                for (const placement of placements) {
                    if (!d.objects[placement.id]) {
                    d.objects[placement.id] = placement;
                    const arr = d.pageObjectIds[pageIndex] ?? [];
                    if (!arr.includes(placement.id)) arr.push(placement.id);
                    d.pageObjectIds[pageIndex] = arr;
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
            // pdfjs render tasks throw with `name: "RenderingCancelledException"`.
            const name = (err as { name?: string })?.name;
            if (name === "RenderingCancelledException") return;
            console.error("[PageCanvas] render failed", err);
            setRenderError(
            err instanceof Error ? err.message : "Could not render this page.",
            );
        }
        };

        void render();

        return () => {
        cancelled = true;
        try {
            task?.cancel();
        } catch {
            /* noop */
        }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [originalBytes, pageIndex, pageInfo, zoom, widthPx, heightPx]);
    // Removed `commit` from deps to prevent infinite extraction loops

    return (
        <div
        className="relative bg-white shadow-[0_0_24px_rgba(0,0,0,0.5)]"
        style={{ width: widthPx, height: heightPx }}
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
        <canvas
            ref={canvasRef}
            className="absolute inset-0 select-none"
            style={{ width: widthPx, height: heightPx }}
        />
        <ObjectLayer pageIndex={pageIndex} pageInfo={pageInfo} zoom={zoom} />
        {showGrid && <GridOverlay pageInfo={pageInfo} zoom={zoom} />}
        </div>
    );
    }
