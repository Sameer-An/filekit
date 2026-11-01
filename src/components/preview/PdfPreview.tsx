// src/components/preview/PdfPreview.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { getPdfjs } from "@/lib/pdf-editor/pdfjs";
import { formatBytes } from "@/lib/utils";
import type { PreviewEffects } from "./types";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfOverlay } from "./PdfOverlay";

interface PdfPreviewProps {
  file: File;
  effects?: PreviewEffects;
  zoom: number;
  pan: { x: number; y: number };
  fitMode: "fit" | "100%";
  currentPage: number;
  onPageCountChange: (total: number) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
}

export function PdfPreview({
  file,
  effects,
  zoom,
  pan,
  fitMode,
  currentPage,
  onPageCountChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
}: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);

  // Sync loading state during render when file changes
  const [prevFile, setPrevFile] = useState<File | null>(file);
  if (file !== prevFile) {
    setPrevFile(file);
    setLoading(true);
    setError(null);
  }

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const currentRequestIdRef = useRef<number>(0);

  // Load PDF document proxy once per file
  useEffect(() => {
    let active = true;

    async function loadDoc() {
      try {
        const pdfjs = await getPdfjs();
        const buffer = await file.arrayBuffer();
        if (!active) return;

        const task = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          stopAtErrors: false,
        });
        loadingTaskRef.current = task;
        const doc = await task.promise;

        if (!active) {
          task.destroy();
          return;
        }

        pdfDocRef.current = doc;
        onPageCountChange(doc.numPages);
        setLoading(false);
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : "Failed to load PDF";
        setError(msg);
        setLoading(false);
      }
    }

    loadDoc();

    return () => {
      active = false;
      renderTaskRef.current?.cancel();
      if (pdfDocRef.current) {
        pdfDocRef.current.cleanup();
        pdfDocRef.current = null;
      }
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy();
        loadingTaskRef.current = null;
      }
    };
  }, [file, onPageCountChange]);

  // Render current page onto canvas
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return;

    const reqId = ++currentRequestIdRef.current;

    // Cancel existing render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    try {
      const pageNum = Math.max(1, Math.min(currentPage, doc.numPages));
      const page = await doc.getPage(pageNum);
      if (reqId !== currentRequestIdRef.current) return;

      const unscaledViewport = page.getViewport({ scale: 1 });
      setPageDims({
        width: Math.round(unscaledViewport.width),
        height: Math.round(unscaledViewport.height),
      });

      // Fit calculation
      const containerW = container.clientWidth || 600;
      const containerH = container.clientHeight || 500;
      const fitScale = Math.min(
        (containerW - 32) / unscaledViewport.width,
        (containerH - 32) / unscaledViewport.height,
      );

      const baseScale = fitMode === "100%" ? 1 : Math.max(0.2, fitScale);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const renderScale = baseScale * dpr;

      const viewport = page.getViewport({ scale: renderScale });

      // Cap at 16 megapixels to prevent memory exhaustion
      const maxArea = 16_000_000;
      let finalW = Math.max(1, Math.floor(viewport.width));
      let finalH = Math.floor(viewport.height);
      if (finalW * finalH > maxArea) {
        const factor = Math.sqrt(maxArea / (finalW * finalH));
        finalW = Math.floor(finalW * factor);
        finalH = Math.floor(finalH * factor);
      }

      canvas.width = finalW;
      canvas.height = finalH;
      canvas.style.width = `${Math.floor(finalW / dpr)}px`;
      canvas.style.height = `${Math.floor(finalH / dpr)}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      });
      renderTaskRef.current = task;

      await task.promise;
      if (reqId === currentRequestIdRef.current) {
        renderTaskRef.current = null;
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "RenderingCancelledException") {
        return;
      }
      setError("Failed to render page");
    }
  }, [currentPage, fitMode]);

  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage();
    }
  }, [loading, renderPage]);

  // Handle container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      renderPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [renderPage]);

  // CSS rotation from effects
  const rotationDeg = effects?.pdfRotation ?? effects?.rotateDeg ?? 0;

  if (error) {
    return (
      <div className="w-full h-full grid place-items-center p-6 text-center">
        <div className="space-y-3 max-w-sm">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => renderPage()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing flex items-center justify-center bg-zinc-900/40"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-card/60 z-20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading PDF...</span>
          </div>
        </div>
      )}

      {/* Canvas container with zoom, pan, and rotation */}
      <div
        className="relative transition-transform duration-75 flex items-center justify-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotationDeg}deg)`,
          transformOrigin: "center center",
        }}
      >
        <canvas
          ref={canvasRef}
          className="shadow-md bg-white rounded-xs pointer-events-none"
        />

        <PdfOverlay effects={effects} currentPage={currentPage} />
      </div>

      {/* Floating Info Pill at Bottom */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none text-[11px]">
        <div className="bg-background/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-border/80 shadow-xs flex items-center gap-2 font-mono">
          <span>{file.name}</span>
          <span className="text-muted-foreground">•</span>
          {pageDims && (
            <>
              <span>
                {pageDims.width} × {pageDims.height} pt
              </span>
              <span className="text-muted-foreground">•</span>
            </>
          )}
          <span>{formatBytes(file.size)}</span>
        </div>
      </div>
    </div>
  );
}
