// src/components/tools/images-to-pdf/PagePreviewStrip.tsx
"use client";

import React, { useRef, useEffect, memo } from "react";
import type { ImageItem, ImagesToPdfOptions } from "./types";
import { calculatePageLayout } from "@/lib/images-to-pdf-layout";

interface PagePreviewStripProps {
  items: ImageItem[];
  selectedId: string | null;
  options: ImagesToPdfOptions;
  onSelect: (id: string) => void;
}

interface PageThumbnailProps {
  item: ImageItem;
  pageIndex: number;
  isSelected: boolean;
  options: ImagesToPdfOptions;
  onSelect: (id: string) => void;
}

const PageThumbnail = memo(function PageThumbnail({
  item,
  pageIndex,
  isSelected,
  options,
  onSelect,
}: PageThumbnailProps) {
  const layout = calculatePageLayout(
    item.width,
    item.height,
    item.rotation,
    options,
  );

  const aspectRatio = layout.pageWidth / layout.pageHeight;

  // Margin percentages relative to page dimensions
  const marginPercentX = (layout.marginPt / layout.pageWidth) * 100;
  const marginPercentY = (layout.marginPt / layout.pageHeight) * 100;

  // Image position percentages
  const imgLeftPercent = (layout.x / layout.pageWidth) * 100;
  const imgTopPercent =
    ((layout.pageHeight - (layout.y + layout.height)) / layout.pageHeight) * 100;
  const imgWidthPercent = (layout.width / layout.pageWidth) * 100;
  const imgHeightPercent = (layout.height / layout.pageHeight) * 100;

  return (
    <div
      onClick={() => onSelect(item.id)}
      id={`page-thumb-${item.id}`}
      className={`group relative flex flex-col items-center gap-1.5 p-1.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-sm"
          : "bg-card hover:bg-muted/50 border-border"
      }`}
    >
      {/* Miniature PDF Sheet with layout fidelity */}
      <div
        className="relative w-20 overflow-hidden rounded-xs border border-muted-foreground/30 shadow-xs flex items-center justify-center transition-transform"
        style={{
          aspectRatio: `${aspectRatio}`,
          backgroundColor: options.backgroundColor || "#ffffff",
        }}
      >
        {/* Margin Guide (subtle dashed border when margins are active) */}
        {layout.marginPt > 0 && (
          <div
            className="absolute border border-dashed border-primary/20 pointer-events-none"
            style={{
              top: `${marginPercentY}%`,
              bottom: `${marginPercentY}%`,
              left: `${marginPercentX}%`,
              right: `${marginPercentX}%`,
            }}
          />
        )}

        {/* Scaled/Fit Image inside the sheet */}
        {item.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt=""
            className="absolute pointer-events-none object-contain"
            style={{
              left: `${imgLeftPercent}%`,
              top: `${imgTopPercent}%`,
              width: `${imgWidthPercent}%`,
              height: `${imgHeightPercent}%`,
              transform: `rotate(${item.rotation}deg)`,
              transformOrigin: "center center",
            }}
          />
        )}
      </div>

      {/* Page Number Badge */}
      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground">
        Page {pageIndex + 1}
      </span>
    </div>
  );
});

export function PagePreviewStrip({
  items,
  selectedId,
  options,
  onSelect,
}: PagePreviewStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedItem = items.find((i) => i.id === selectedId) || items[0];

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
    if (selectedId && stripRef.current) {
      const el = stripRef.current.querySelector(`#page-thumb-${selectedId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [selectedId]);

  if (items.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-6 border rounded-2xl bg-card/50 text-muted-foreground">
        <p className="text-sm font-medium">No images uploaded yet</p>
        <p className="text-xs mt-1">Add images to see the live page preview</p>
      </div>
    );
  }

  // Calculate large preview layout for the selected page
  const selectedLayout = selectedItem
    ? calculatePageLayout(
        selectedItem.width,
        selectedItem.height,
        selectedItem.rotation,
        options,
      )
    : null;

  const selectedAspect = selectedLayout
    ? selectedLayout.pageWidth / selectedLayout.pageHeight
    : 1;

  const selMarginX = selectedLayout
    ? (selectedLayout.marginPt / selectedLayout.pageWidth) * 100
    : 0;
  const selMarginY = selectedLayout
    ? (selectedLayout.marginPt / selectedLayout.pageHeight) * 100
    : 0;

  const selImgLeft = selectedLayout
    ? (selectedLayout.x / selectedLayout.pageWidth) * 100
    : 0;
  const selImgTop = selectedLayout
    ? ((selectedLayout.pageHeight - (selectedLayout.y + selectedLayout.height)) /
        selectedLayout.pageHeight) *
      100
    : 0;
  const selImgW = selectedLayout
    ? (selectedLayout.width / selectedLayout.pageWidth) * 100
    : 0;
  const selImgH = selectedLayout
    ? (selectedLayout.height / selectedLayout.pageHeight) * 100
    : 0;

  const selectedIndex = items.findIndex((i) => i.id === selectedItem?.id);

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">
          PDF Preview ({items.length} {items.length === 1 ? "page" : "pages"})
        </span>
        <span className="font-mono">
          Page {selectedIndex + 1} of {items.length}
        </span>
      </div>

      {/* Large Page Preview */}
      <div className="relative w-full h-80 sm:h-96 rounded-2xl border bg-zinc-950/20 flex items-center justify-center p-4 overflow-hidden">
        {selectedItem && selectedLayout && (
          <div
            className="relative max-h-full max-w-full shadow-xl rounded-xs border border-border/80 transition-all flex items-center justify-center overflow-hidden"
            style={{
              aspectRatio: `${selectedAspect}`,
              backgroundColor: options.backgroundColor || "#ffffff",
              height: selectedAspect <= 1 ? "100%" : "auto",
              width: selectedAspect > 1 ? "100%" : "auto",
            }}
          >
            {/* Margin Visual Guide */}
            {selectedLayout.marginPt > 0 && (
              <div
                className="absolute border border-dashed border-primary/30 pointer-events-none z-10"
                style={{
                  top: `${selMarginY}%`,
                  bottom: `${selMarginY}%`,
                  left: `${selMarginX}%`,
                  right: `${selMarginX}%`,
                }}
              />
            )}

            {/* Placed & Rotated Image */}
            {selectedItem.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedItem.thumbUrl}
                alt=""
                className="absolute object-contain pointer-events-none"
                style={{
                  left: `${selImgLeft}%`,
                  top: `${selImgTop}%`,
                  width: `${selImgW}%`,
                  height: `${selImgH}%`,
                  transform: `rotate(${selectedItem.rotation}deg)`,
                  transformOrigin: "center center",
                }}
              />
            )}

            {/* Bottom Page Badge */}
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] text-white font-mono z-20">
              {Math.round(selectedLayout.pageWidth)} × {Math.round(selectedLayout.pageHeight)} pt
            </div>
          </div>
        )}
      </div>

      {/* Horizontal Page Strip */}
      <div
        ref={stripRef}
        tabIndex={0}
        aria-label="Pages strip"
        className="flex items-center gap-2.5 overflow-x-auto p-2 rounded-xl border bg-card/60 scrollbar-thin focus:outline-hidden focus:ring-2 focus:ring-primary/40"
      >
        {items.map((item, idx) => (
          <PageThumbnail
            key={item.id}
            item={item}
            pageIndex={idx}
            isSelected={item.id === (selectedItem?.id ?? "")}
            options={options}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
