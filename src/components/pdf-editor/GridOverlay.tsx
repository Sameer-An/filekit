    // src/components/pdf-editor/GridOverlay.tsx
    "use client";

    import React, { useMemo } from "react";
    import type { GridUnit, PageInfo } from "@/lib/pdf-editor/types";
    import { getGridPreset } from "@/lib/pdf-editor/grid-presets";
    import { rotatedPageSize } from "@/lib/pdf-editor/coords";
    import { usePdfEditor } from "@/lib/pdf-editor/store";

    interface GridOverlayProps {
    pageInfo: PageInfo;
    }

    function unitToPt(value: number, unit: GridUnit): number {
    if (unit === "mm") return (value * 72) / 25.4;
    if (unit === "in") return value * 72;
    return value;
    }

    /**
     * Reference-only grid. Lives INSIDE the page wrapper, so it uses the same
     * point coordinate system and scales with the page. It is never exported.
     * Every style uses the same SVG renderer as the style dialog preview.
     */
    export function GridOverlay({ pageInfo }: GridOverlayProps) {
    const grid = usePdfEditor((s) => s.grid);
    const { w, h } = rotatedPageSize(pageInfo);

    const backgroundImage = useMemo(() => {
        const cell = Math.max(2, unitToPt(grid.cellSize, grid.unit));
        const svg = getGridPreset(grid.styleId).renderSvg(
        Math.max(1, Math.round(w)),
        Math.max(1, Math.round(h)),
        { ...grid, cellSize: cell, unit: "px" },
        );
        return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    }, [grid, w, h]);

    return (
        <div
        className="pdf-grid-overlay"
        aria-hidden
        style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 10,
            backgroundImage,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
        }}
        />
    );
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
