// src/components/pdf-editor/PageViewport.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import { PageCanvas } from "./PageCanvas";
import { rotatedPageSize } from "@/lib/pdf-editor/coords";

const PAGE_GAP = 24; // px between pages
const VISIBILITY_BUFFER = 1; // render 1 page above/below
const ZOOM_DEBOUNCE_MS = 150;

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

// --- Virtualization State ---
const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0]));

// --- Debounced Render Zoom ---
const [renderZoom, setRenderZoom] = useState(zoom);

// --- Debug Mode ---
const [debugMode, setDebugMode] = useState(false);

useEffect(() => {
    // Read ?debug=1 from the URL
    if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get("debug") === "1");
    }
}, []);

// Debounce the heavy canvas rendering when zooming
useEffect(() => {
    const timer = setTimeout(() => setRenderZoom(zoom), ZOOM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
}, [zoom]);

// Fit-width / fit-page logic
useEffect(() => {
    if (fitMode === "none" || pages.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth - 48;
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
}, [fitMode, pages.length, currentPage, setZoom]);

// Scroll to current page when thumbnail is clicked
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

// Track visible pages via IntersectionObserver
useEffect(() => {
    const el = scrollRef.current;
    if (!el || pages.length === 0) return;

    const observer = new IntersectionObserver(
    (entries) => {
        setVisiblePages((prev) => {
        const next = new Set(prev);
        let changed = false;

        entries.forEach((entry) => {
            const index = parseInt(
            (entry.target as HTMLElement).dataset.pageIndex || "0",
            10,
            );
            if (entry.isIntersecting) {
            // Add this page + buffer
            for (
                let i = Math.max(0, index - VISIBILITY_BUFFER);
                i <= Math.min(pages.length - 1, index + VISIBILITY_BUFFER);
                i++
            ) {
                if (!next.has(i)) {
                next.add(i);
                changed = true;
                }
            }
            }
        });

        return changed ? next : prev;
        });
    },
    {
        root: el,
        rootMargin: "200px", // Start rendering slightly before it enters view
        threshold: 0,
    },
    );

    pageRefs.current.forEach((ref) => {
    if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
}, [pages.length]);

// Track scroll position to update `scrollPage` and `currentPage`
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

if (pages.length === 0) {
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
        {pages.map((page, i) => {
        const { w, h } = rotatedPageSize(page);
        const widthPx = w * zoom;
        const heightPx = h * zoom;
        const shouldRender = visiblePages.has(i);

        return (
            <div
            key={`${page.index}-${i}`}
            data-page-index={i}
            ref={(el) => {
                pageRefs.current[i] = el;
            }}
            style={{
                width: widthPx,
                height: heightPx,
                position: "relative",
            }}
            >
            {shouldRender ? (
                <PageCanvas
                pageIndex={i}
                pageInfo={page}
                widthPx={widthPx}
                heightPx={heightPx}
                zoom={zoom}
                renderZoom={renderZoom}
                showGrid={gridVisible}
                debug={debugMode}
                />
            ) : (
                // Placeholder skeleton to maintain scrollbar height
                <div className="w-full h-full bg-zinc-800/50 animate-pulse flex items-center justify-center border border-zinc-700/50">
                <span className="text-zinc-600 text-xs font-medium">
                    Page {i + 1}
                </span>
                </div>
            )}
            </div>
        );
        })}
    </div>
    </div>
);
}
