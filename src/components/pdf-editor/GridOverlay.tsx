// src/components/pdf-editor/GridOverlay.tsx
"use client";

import React, { useMemo } from "react";
import type { PageInfo } from "@/lib/pdf-editor/types";
import {
gridCssStyle,
isCssPreset,
getGridPreset,
} from "@/lib/pdf-editor/grid-presets";
import { usePdfEditor } from "@/lib/pdf-editor/store";

interface GridOverlayProps {
pageInfo: PageInfo;
}

export function GridOverlay({ pageInfo }: GridOverlayProps) {
const grid = usePdfEditor((s) => s.grid);

const widthPx = pageInfo.widthPt;
const heightPx = pageInfo.heightPt;

const style: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: grid.opacity,
    mixBlendMode: "multiply",
    zIndex: 10,
    // Crucial: Clear any previous background when style changes
    backgroundImage: "none",
    backgroundSize: "auto",
    backgroundPosition: "0 0",
    };

    if (isCssPreset(grid.styleId)) {
    const css = gridCssStyle(grid);
    return {
        ...base,
        backgroundImage: css.backgroundImage || "none",
        backgroundSize: css.backgroundSize || "auto",
        backgroundPosition: css.backgroundPosition || "0 0",
    };
    }

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
