// src/components/pdf-editor/PageViewport.tsx
"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import { PageCanvas } from "./PageCanvas";
import { pageUid, rotatedPageSize } from "@/lib/pdf-editor/coords";

const PAGE_GAP = 24;
const PAD_X = 24;
const PAD_Y = 16;
const ZOOM_DEBOUNCE_MS = 150;

export function PageViewport() {
  const pages = usePdfEditor((s) => s.pages);
  const zoom = usePdfEditor((s) => s.zoom);
  const fitMode = usePdfEditor((s) => s.fitMode);
  const currentPage = usePdfEditor((s) => s.currentPage);
  const setCurrentPage = usePdfEditor((s) => s.setCurrentPage);
  const setScrollPage = usePdfEditor((s) => s.setScrollPage);
  const setZoom = usePdfEditor((s) => s.setZoom);
  const gridVisible = usePdfEditor((s) => s.gridVisible);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ w: 0, h: 800 });
  const [scrollTop, setScrollTop] = useState(0);
  const [renderZoom, setRenderZoom] = useState(zoom);
  const [debugMode, setDebugMode] = useState(false);
  const anchorRef = useRef({ page: 0, frac: 0 });
  const lastZoomRef = useRef(zoom);

  useEffect(() => {
    setDebugMode(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  // Debounce the expensive re-rasterisation; CSS scale is instant.
  useEffect(() => {
    const t = setTimeout(() => setRenderZoom(zoom), ZOOM_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [zoom]);

  // Container size.
  const hasPages = pages.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPages]);

  // Absolute layout: exact tops/heights, no DOM measuring, no offsetTop bugs.
  const layout = useMemo(() => {
    const tops: number[] = [];
    const heights: number[] = [];
    const widths: number[] = [];
    let y = PAD_Y;
    for (const p of pages) {
      const { w, h } = rotatedPageSize(p);
      tops.push(y);
      heights.push(h * zoom);
      widths.push(w * zoom);
      y += h * zoom + PAGE_GAP;
    }
    const maxW = widths.length ? Math.max(...widths) : 0;
    return {
      tops,
      heights,
      widths,
      total: Math.max(0, y - PAGE_GAP) + PAD_Y,
      innerW: Math.max(view.w, maxW + PAD_X * 2),
    };
  }, [pages, zoom, view.w]);

  // Auto-fit (keeps fitMode, so it also re-fits on window resize).
  useEffect(() => {
    if (fitMode === "none" || pages.length === 0 || view.w === 0) return;
    const first = pages[Math.min(currentPage, pages.length - 1)] ?? pages[0];
    const { w, h } = rotatedPageSize(first);
    const cw = view.w - PAD_X * 2;
    const ch = view.h - PAD_Y * 2;
    const target = fitMode === "width" ? cw / w : Math.min(cw / w, ch / h);
    if (Number.isFinite(target) && target > 0) setZoom(target, true);
  }, [fitMode, pages, currentPage, view.w, view.h, setZoom]);

  // Keep the same spot of the document under the viewport when zoom changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || lastZoomRef.current === zoom) return;
    lastZoomRef.current = zoom;
    const { page, frac } = anchorRef.current;
    if (layout.tops[page] === undefined) return;
    el.scrollTop = layout.tops[page] + frac * layout.heights[page];
  }, [zoom, layout]);

  // Track the page under the top third of the viewport (rAF throttled).
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pages.length === 0) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const top = el.scrollTop;
        const { tops, heights } = layoutRef.current;
        setScrollTop(top);
        const probe = top + el.clientHeight / 3;
        let best = 0;
        for (let i = 0; i < tops.length; i++) {
          if (tops[i] <= probe) best = i;
          else break;
        }
        anchorRef.current = {
          page: best,
          frac: heights[best] ? (top - tops[best]) / heights[best] : 0,
        };
        setScrollPage(best);
        setCurrentPage(best); // thumbnail highlight follows the scroll
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pages.length, setScrollPage, setCurrentPage]);

  // Thumbnail click => scroll (only when the request did not come from scrolling).
  useEffect(() => {
    const el = scrollRef.current;
    const top = layout.tops[currentPage];
    if (!el || top === undefined) return;
    if (usePdfEditor.getState().scrollPage === currentPage) return;
    el.scrollTo({ top: Math.max(0, top - PAD_Y), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  if (pages.length === 0) {
    return (
      <div className="h-full grid place-items-center text-sm text-zinc-500">
        No PDF loaded.
      </div>
    );
  }

  // Virtualisation: mount only pages within one screen above/below the view.
  const lo = scrollTop - view.h;
  const hi = scrollTop + view.h * 2;

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-auto bg-zinc-900"
      style={{ scrollbarGutter: "stable" }}
    >
      <div
        className="relative"
        style={{ width: layout.innerW, height: layout.total }}
      >
        {pages.map((page, i) => {
          const top = layout.tops[i];
          const height = layout.heights[i];
          const width = layout.widths[i];
          const left = (layout.innerW - width) / 2;
          const mounted = top + height >= lo && top <= hi;
          return (
            <div
              key={pageUid(page)}
              data-page-index={i}
              style={{ position: "absolute", top, left, width, height }}
            >
              {mounted ? (
                <PageCanvas
                  pageIndex={i}
                  pageInfo={page}
                  zoom={zoom}
                  renderZoom={renderZoom}
                  showGrid={gridVisible}
                  debug={debugMode}
                />
              ) : (
                <div className="w-full h-full bg-zinc-800/50 grid place-items-center border border-zinc-700/50">
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