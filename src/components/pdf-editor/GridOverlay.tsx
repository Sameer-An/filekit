// src/components/pdf-editor/GridOverlay.tsx
// Non-interactive grid drawn above the page content. Uses the fast CSS
// gradient path where possible, falls back to an inline SVG data URL for
// the fancy presets. Never appears in exports, thumbnails or print.

"use client";

import React, { useMemo } from "react";
import type { GridSettings, PageInfo } from "@/lib/pdf-editor/types";
import {
gridCssStyle,
isCssPreset,
getGridPreset,
} from "@/lib/pdf-editor/grid-presets";
import { usePdfEditor } from "@/lib/pdf-editor/store";

interface GridOverlayProps {
pageInfo: PageInfo;
zoom: number;
}

export function GridOverlay({ pageInfo, zoom }: GridOverlayProps) {
const grid = usePdfEditor((s) => s.grid);

const widthPx = pageInfo.widthPt * zoom;
const heightPx = pageInfo.heightPt * zoom;

const style: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: grid.opacity,
    mixBlendMode: "multiply",
    };
    if (isCssPreset(grid.styleId)) {
    const css = gridCssStyle(grid);
    return {
        ...base,
        backgroundImage: css.backgroundImage,
        backgroundSize: css.backgroundSize,
        backgroundPosition: css.backgroundPosition,
    };
    }
    // SVG fallback for non-CSS presets.
    const svg = getGridPreset(grid.styleId).renderSvg(
    Math.max(1, Math.round(widthPx)),
    Math.max(1, Math.round(heightPx)),
    grid,
    );
    return {
    ...base,
    backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
    };
}, [grid, widthPx, heightPx]);

return <div className="pdf-grid-overlay" style={style} aria-hidden />;
}

/** Print stylesheet: hide the grid on print. */
export function GridPrintStyles() {
return (
    <style jsx global>{`
    @media print {
        .pdf-grid-overlay {
        display: none !important;
        }
    }
    `}</style>
);
}
