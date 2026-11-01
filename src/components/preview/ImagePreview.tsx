// src/components/preview/ImagePreview.tsx
"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { formatBytes, cn } from "@/lib/utils";
import type { PreviewEffects } from "./types";
import { getEffectCss, estimateOutputSize } from "./preview-utils";

interface ImagePreviewProps {
  file: File;
  objectUrl: string;
  effects?: PreviewEffects;
  zoom: number;
  pan: { x: number; y: number };
  fitMode: "fit" | "100%";
  showOriginal: boolean;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
}

export function ImagePreview({
  file,
  objectUrl,
  effects,
  zoom,
  pan,
  fitMode,
  showOriginal,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
}: ImagePreviewProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Measure natural dimensions on image load
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // Debounced estimated output size calculation
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (effects?.quality || effects?.targetFormat || effects?.resizeWidth) {
        const est = await estimateOutputSize(
          file,
          effects?.targetFormat,
          effects?.quality,
          effects?.resizeWidth,
          effects?.resizeHeight,
        );
        setEstimatedSize(est);
      } else {
        setEstimatedSize(null);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [file, effects]);

  const { filter, transform } = useMemo(() => {
    if (showOriginal) {
      return { filter: "none", transform: "none", hasEffects: false };
    }
    return getEffectCss(effects);
  }, [effects, showOriginal]);

  // Compute resize overlay box ratio if resize is configured
  const resizeBox = useMemo(() => {
    if (!dimensions || !effects?.resizeWidth || !effects?.resizeHeight) return null;
    const origRatio = dimensions.width / dimensions.height;
    const targetRatio = effects.resizeWidth / effects.resizeHeight;
    return {
      targetW: effects.resizeWidth,
      targetH: effects.resizeHeight,
      ratioDiff: Math.abs(origRatio - targetRatio) > 0.02,
    };
  }, [dimensions, effects]);

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden select-none flex items-center justify-center",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      style={{
        backgroundImage:
          "conic-gradient(rgba(128,128,128,0.15) 90deg, transparent 90deg 180deg, rgba(128,128,128,0.15) 180deg 270deg, transparent 270deg)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Scaled and panned viewport container */}
      <div
        className="relative flex items-center justify-center transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          width: fitMode === "100%" && dimensions ? `${dimensions.width}px` : "100%",
          height: fitMode === "100%" && dimensions ? `${dimensions.height}px` : "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt={file.name}
          onLoad={onImageLoad}
          draggable={false}
          className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-sm transition-all duration-150"
          style={{
            filter,
            transform,
          }}
        />

        {/* Target resize frame overlay */}
        {resizeBox && (
          <div
            className="absolute pointer-events-none border-2 border-dashed border-primary/70 bg-primary/10 rounded-sm flex items-end justify-end p-1.5"
            style={{
              width: "90%",
              height: "90%",
            }}
          >
            <span className="text-[10px] bg-background/80 text-foreground px-1 py-0.5 rounded font-mono shadow-xs">
              Target: {resizeBox.targetW} × {resizeBox.targetH}px
            </span>
          </div>
        )}
      </div>

      {/* Floating Info Pill at Bottom */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none text-[11px] gap-2">
        <div className="bg-background/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-border/80 shadow-xs flex items-center gap-2 font-mono">
          <span>{file.name}</span>
          <span className="text-muted-foreground">•</span>
          {dimensions && (
            <>
              <span>
                {dimensions.width} × {dimensions.height}px
              </span>
              <span className="text-muted-foreground">•</span>
            </>
          )}
          <span>{formatBytes(file.size)}</span>
        </div>

        {estimatedSize !== null && (
          <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 backdrop-blur-md px-2.5 py-1 rounded-md shadow-xs font-mono font-medium">
            Est. ~{formatBytes(estimatedSize)}
          </div>
        )}
      </div>
    </div>
  );
}
