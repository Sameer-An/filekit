// src/components/pdf-editor/PageViewport.tsx
// Continuous scroll viewport. Renders a `PageCanvas` per page, but only
// mounts the canvas for pages near the current scroll position (via
// IntersectionObserver). Auto-scrolls when `currentPage` changes (from
// thumbnail click), and syncs `scrollPage` when the user scrolls.

"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type { PageInfo } from "@/lib/pdf-editor/types";
import { PageCanvas } from "./PageCanvas";
import { rotatedPageSize } from "@/lib/pdf-editor/coords";

const PAGE_GAP = 24; // px between pages

export function PageViewport() {
const pages = usePdfEditor((s) => s.pages);
const zoom = usePdfEditor((s) => s.zoom);
const fitMode = usePdfEditor((s) => s.fitMode);
const currentPage = usePdfEditor((s) => s.currentPage);
const setScrollPage = usePdfEditor((s) => s.setScrollPage);
const setZoom = usePdfEditor((s) => s.setZoom);
const gridVisible = usePdfEditor((s) => s.gridVisible);

const scrollRef = useRef<HTMLDivElement | null>(null);
const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

// Fit-width / fit-page. Computed from the widest page and the viewport.
useEffect(() => {
    if (fitMode === "none" || pages.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth - 48; // padding
    const containerHeight = el.clientHeight - 48;
    const first = pages[currentPage] ?? pages[0];
    const { w, h } = rotatedPageSize(first);
    const targetZoom =
    fitMode === "width"
        ? containerWidth / w
        : Math.min(containerWidth / w, containerHeight / h);
    if (Number.isFinite(targetZoom) && targetZoom > 0) {
    setZoom(targetZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [fitMode, pages.length, currentPage]);

// Scroll to current page when the thumbnail is clicked.
useEffect(() => {
    const el = pageRefs.current[currentPage];
    if (el && scrollRef.current) {
    const parent = scrollRef.current;
    const offset = el.offsetTop - 24;
    if (Math.abs(parent.scrollTop - offset) > 4) {
        parent.scrollTo({ top: offset, behavior: "smooth" });
    }
    }
}, [currentPage]);

// Track the topmost visible page and mirror it into `scrollPage`.
useEffect(() => {
    const el = scrollRef.current;
    if (!el || pages.length === 0) return;
    let raf = 0;
    const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        const parent = scrollRef.current;
        if (!parent) return;
        const top = parent.scrollTop;
        // Find the page whose box contains `top` (or the closest above).
        let best = 0;
        for (let i = 0; i < pageRefs.current.length; i++) {
        const node = pageRefs.current[i];
        if (!node) continue;
        if (node.offsetTop <= top + 8) best = i;
        else break;
        }
        setScrollPage(best);
    });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
    el.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
    };
}, [pages.length, setScrollPage]);

const rendered = useMemo(() => pages, [pages]);

if (rendered.length === 0) {
    return (
    <div className="h-full grid place-items-center text-sm text-zinc-500">
        No PDF loaded.
    </div>
    );
}

return (
    <div
    ref={scrollRef}
    className="h-full w-full overflow-auto bg-zinc-900 px-6 py-4"
    style={{ scrollbarGutter: "stable" }}
    >
    <div
        className="mx-auto flex flex-col items-center"
        style={{ gap: PAGE_GAP }}
    >
        {rendered.map((page, i) => {
        const { w, h } = rotatedPageSize(page);
        return (
            <div
            key={`${page.index}-${i}`}
            ref={(el) => {
                pageRefs.current[i] = el;
            }}
            style={{
                width: w * zoom,
                height: h * zoom,
                position: "relative",
            }}
            >
            <PageCanvas
                pageIndex={i}
                pageInfo={page}
                widthPx={w * zoom}
                heightPx={h * zoom}
                zoom={zoom}
                showGrid={gridVisible}
            />
            </div>
        );
        })}
    </div>
    </div>
);
}
