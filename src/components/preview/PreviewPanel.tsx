// src/components/preview/PreviewPanel.tsx
"use client";

import React, { useState, useMemo } from "react";
import { FileSearch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreviewPanelProps } from "./types";
import { getFileCategory } from "./preview-utils";
import { usePreview } from "./usePreview";
import { PreviewToolbar } from "./PreviewToolbar";
import { ImagePreview } from "./ImagePreview";
import { PdfPreview } from "./PdfPreview";
import { FileCardPreview } from "./FileCardPreview";

export function PreviewPanel({
  files,
  effects,
  activeFileIndex = 0,
  onSelectFile,
  onRemoveFile,
  className,
}: PreviewPanelProps) {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const selectedIndex = onSelectFile ? activeFileIndex : internalActiveIndex;
  const activeFile = files[selectedIndex] || files[0] || null;

  const handleSelect = (idx: number) => {
    if (onSelectFile) onSelectFile(idx);
    else setInternalActiveIndex(idx);
    setCurrentPage(1);
  };

  const {
    objectUrl,
    zoom,
    fitMode,
    pan,
    isDragging,
    showOriginal,
    setShowOriginal,
    setFitMode,
    zoomIn,
    zoomOut,
    resetZoom,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  } = usePreview(activeFile);

  const category = useMemo(() => {
    return activeFile ? getFileCategory(activeFile) : "other";
  }, [activeFile]);

  // If no files are added yet
  if (!activeFile) {
    return (
      <div
        className={cn(
          "w-full h-[45vh] lg:h-[min(70vh,720px)] rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 flex flex-col items-center justify-center p-6 text-center text-muted-foreground space-y-3",
          className,
        )}
      >
        <div className="p-4 rounded-full bg-muted/60 border border-border/50 text-muted-foreground/70">
          <FileSearch className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-sm text-foreground">Live Preview</p>
          <p className="text-xs">Add a file to see a preview in real time.</p>
        </div>
      </div>
    );
  }

  const hasEffects = Boolean(
    effects &&
      (effects.brightness !== 100 ||
        effects.contrast !== 100 ||
        effects.saturation !== 100 ||
        (effects.grayscale ?? 0) > 0 ||
        (effects.rotateDeg ?? 0) !== 0 ||
        effects.flipH ||
        effects.flipV ||
        effects.resizeWidth ||
        effects.resizeHeight),
  );

  return (
    <div
      className={cn(
        "w-full flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden",
        "lg:sticky lg:top-20 h-[45vh] lg:h-[min(70vh,720px)]",
        className,
      )}
    >
      {/* Top Toolbar */}
      <PreviewToolbar
        zoom={zoom}
        fitMode={fitMode}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onToggleFit={() => setFitMode(fitMode === "fit" ? "100%" : "fit")}
        hasEffects={category === "image" && hasEffects}
        showOriginal={showOriginal}
        onToggleOriginal={setShowOriginal}
        isApproximate={hasEffects}
        currentPage={currentPage}
        totalPages={category === "pdf" ? totalPages : undefined}
        onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      />

      {/* Main Preview Content */}
      <div className="relative flex-1 w-full overflow-hidden min-h-0 bg-background/50">
        {category === "image" && objectUrl && (
          <ImagePreview
            file={activeFile}
            objectUrl={objectUrl}
            effects={effects}
            zoom={zoom}
            pan={pan}
            fitMode={fitMode}
            showOriginal={showOriginal}
            isDragging={isDragging}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          />
        )}

        {category === "pdf" && (
          <PdfPreview
            file={activeFile}
            effects={effects}
            zoom={zoom}
            pan={pan}
            fitMode={fitMode}
            currentPage={currentPage}
            onPageCountChange={setTotalPages}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          />
        )}

        {category !== "image" && category !== "pdf" && (
          <FileCardPreview
            file={activeFile}
            category={category}
            objectUrl={objectUrl}
          />
        )}
      </div>

      {/* Multiple Files Thumbnail Strip */}
      {files.length > 1 && (
        <div className="h-18 px-3 py-2 bg-muted/30 border-t border-border flex items-center gap-2 overflow-x-auto shrink-0 select-none">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1 pr-1 shrink-0">
            {files.length} Files
          </span>
          {files.map((f, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={`${f.name}-${i}`}
                onClick={() => handleSelect(i)}
                className={cn(
                  "relative group h-13 w-16 shrink-0 rounded-lg border transition-all cursor-pointer overflow-hidden p-1 flex flex-col justify-between text-left",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                    : "border-border/70 bg-card hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase truncate">
                    {f.name.split(".").pop()}
                  </span>
                  {onRemoveFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(i);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-medium truncate leading-tight">
                  {f.name}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
