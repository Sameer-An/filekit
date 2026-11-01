// src/components/preview/PreviewToolbar.tsx
"use client";

import React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PreviewToolbarProps {
  zoom: number;
  fitMode: "fit" | "100%";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleFit: () => void;
  hasEffects?: boolean;
  showOriginal?: boolean;
  onToggleOriginal?: (show: boolean) => void;
  isApproximate?: boolean;
  // PDF page navigation
  currentPage?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
}

export function PreviewToolbar({
  zoom,
  fitMode,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleFit,
  hasEffects = false,
  showOriginal = false,
  onToggleOriginal,
  isApproximate = false,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-card/90 backdrop-blur-sm border-b border-border text-xs z-10 flex-wrap">
      {/* Left: Preview badge & approximation note */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
          Preview
        </Badge>
        {isApproximate && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 hidden sm:inline-flex">
            <Info className="w-3 h-3 text-amber-500" />
            Final output may differ slightly
          </span>
        )}
      </div>

      {/* Middle: PDF Page Navigation (if PDF) */}
      {totalPages && totalPages > 1 && (
        <div className="flex items-center gap-1.5 bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onPrevPage}
            disabled={!currentPage || currentPage <= 1}
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] font-mono select-none">
            {currentPage ?? 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNextPage}
            disabled={!currentPage || currentPage >= totalPages}
            aria-label="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Right: Before/After & Zoom Controls */}
      <div className="flex items-center gap-1">
        {hasEffects && onToggleOriginal && (
          <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40 mr-1.5">
            <button
              type="button"
              onClick={() => onToggleOriginal(false)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                !showOriginal
                  ? "bg-primary text-primary-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              After
            </button>
            <button
              type="button"
              onClick={() => onToggleOriginal(true)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                showOriginal
                  ? "bg-primary text-primary-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Before
            </button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onToggleFit}
          title={fitMode === "fit" ? "Switch to 100%" : "Fit to screen"}
          aria-label="Toggle Fit Mode"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onZoomOut}
          disabled={zoom <= 0.25}
          title="Zoom out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>

        <span className="text-[11px] font-mono w-9 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onZoomIn}
          disabled={zoom >= 4}
          title="Zoom in"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onResetZoom}
          title="Reset zoom"
          aria-label="Reset Zoom"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
