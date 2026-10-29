"use client";
import React from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import { getOverlayRects } from "@/lib/pdf-editor/overlay-layout";
import type { PageInfo } from "@/lib/pdf-editor/types";
import { pdfRectToCss } from "@/lib/pdf-editor/coords";

export function PageOverlayPreview({
pageInfo,
pageIndex,
totalPages,
}: {
pageInfo: PageInfo;
pageIndex: number;
totalPages: number;
}) {
const overlays = usePdfEditor((s) => s.overlays);
const rects = getOverlayRects(overlays, pageInfo, pageIndex, totalPages);

return (
    <div className="absolute inset-0 pointer-events-none z-10">
    {rects.map((r, i) => {
        const css = pdfRectToCss(r.rect, pageInfo, 1);
        return (
        <div
            key={i}
            style={{
            position: "absolute",
            left: css.left,
            top: css.top,
            width: css.width,
            height: css.height,
            display: "flex",
            alignItems: "center",
            justifyContent:
                r.align === "center"
                ? "center"
                : r.align === "right"
                    ? "flex-end"
                    : "flex-start",
            fontSize: r.fontSize,
            color: r.color,
            opacity: r.opacity,
            transform: r.rotation ? `rotate(${r.rotation}deg)` : undefined,
            transformOrigin: "center",
            whiteSpace: "pre",
            }}
        >
            {r.text}
        </div>
        );
    })}
    </div>
);
}
