    // src/components/pdf-editor/ThumbnailSidebar.tsx
    "use client";

    import React, { useCallback, useEffect, useRef, useState } from "react";
    import {
    RotateCw,
    Copy,
    Trash2,
    Plus,
    ChevronLeft,
    ChevronRight,
    Loader2,
    } from "lucide-react";
    import { usePdfEditor } from "@/lib/pdf-editor/store";
    import type { PageOp, PageInfo } from "@/lib/pdf-editor/types";
    import { defaultBlankSize, applyPageOp } from "@/lib/pdf-editor/page-ops";
    import { getCachedPdf } from "@/lib/pdf-editor/pdfjs-cache";
    import { getPdfjs, getPage } from "@/lib/pdf-editor/pdfjs";
    import { pageUid, rotatedPageSize } from "@/lib/pdf-editor/coords";

    // Global render queue: max 2 concurrent pdfjs renders.
    const MAX_CONCURRENT = 2;
    let activeRenders = 0;
    const waiting: Array<() => void> = [];

    function acquireSlot(): Promise<() => void> {
    return new Promise((resolve) => {
        const start = () => {
        activeRenders++;
        let released = false;
        resolve(() => {
            if (released) return;
            released = true;
            activeRenders--;
            waiting.shift()?.();
        });
        };
        if (activeRenders < MAX_CONCURRENT) start();
        else waiting.push(start);
    });
    }

    export function ThumbnailSidebar() {
    const pages = usePdfEditor((s) => s.pages);
    const currentPage = usePdfEditor((s) => s.currentPage);
    const setCurrentPage = usePdfEditor((s) => s.setCurrentPage);
    const commit = usePdfEditor((s) => s.commit);
    const originalBytes = usePdfEditor((s) => s.originalBytes);

    const [collapsed, setCollapsed] = useState(false);
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);

    const applyOp = useCallback(
        (op: PageOp, label: string) => {
        commit(label, (d) => {
            const result = applyPageOp(
            {
                pages: d.pages,
                pageObjectIds: d.pageObjectIds,
                objects: d.objects,
            },
            op,
            );
            d.pages = result.pages;
            d.pageObjectIds = result.pageObjectIds;
            d.objects = result.objects;
        });
        },
        [commit],
    );

    const onDragStart = (index: number) => () => setDragFrom(index);
    const onDragOver = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(index);
    };
    const onDrop = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        if (dragFrom === null || dragFrom === index) {
        setDragFrom(null);
        setDragOver(null);
        return;
        }
        applyOp(
        { op: "move", fromIndex: dragFrom, toIndex: index },
        "Reorder page",
        );
        setDragFrom(null);
        setDragOver(null);
    };

    const handleRotate = (index: number) => () =>
        applyOp({ op: "rotate", index, delta: 90 }, "Rotate page");
    const handleDuplicate = (index: number) => () =>
        applyOp({ op: "duplicate", index }, "Duplicate page");
    const handleDelete = (index: number) => () => {
        if (!confirm(`Delete page ${index + 1}?`)) return;
        applyOp({ op: "delete", index }, "Delete page");
    };
    const handleInsert = (index: number) => () => {
        const { widthPt, heightPt } = defaultBlankSize(pages, index);
        applyOp(
        { op: "insert-blank", afterIndex: index, widthPt, heightPt },
        "Insert blank page",
        );
    };

    if (collapsed) {
        return (
        <div className="shrink-0 w-8 flex flex-col items-center py-2 bg-zinc-950 border-r border-zinc-800">
            <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded hover:bg-zinc-800"
            title="Show thumbnails"
            >
            <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
        </div>
        );
    }

    return (
        <div className="shrink-0 w-44 flex flex-col bg-zinc-950 border-r border-zinc-800">
        <div className="flex items-center justify-between px-2 h-8 border-b border-zinc-800">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Pages ({pages.length})
            </span>
            <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded hover:bg-zinc-800"
            title="Hide thumbnails"
            >
            <ChevronLeft className="w-3.5 h-3.5 text-zinc-400" />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {pages.map((page, i) => (
            <Thumb
                key={pageUid(page)}
                page={page}
                index={i}
                active={currentPage === i}
                isDragging={dragFrom === i}
                isOver={dragOver === i}
                onSelect={() => setCurrentPage(i)}
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDrop={onDrop(i)}
                onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
                }}
                onRotate={handleRotate(i)}
                onDuplicate={handleDuplicate(i)}
                onDelete={handleDelete(i)}
                onInsert={handleInsert(i)}
                originalBytes={originalBytes}
            />
            ))}
        </div>
        </div>
    );
    }

    interface ThumbProps {
    page: PageInfo;
    index: number;
    active: boolean;
    isDragging: boolean;
    isOver: boolean;
    onSelect: () => void;
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onRotate: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onInsert: () => void;
    originalBytes: Uint8Array | null;
    }

    function Thumb({
    page,
    index,
    active,
    isDragging,
    isOver,
    onSelect,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onRotate,
    onDuplicate,
    onDelete,
    onInsert,
    originalBytes,
    }: ThumbProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visible, setVisible] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(false);

    const { w: wPt, h: hPt } = rotatedPageSize(page);
    const thumbWidth = 140;
    const thumbHeight = Math.round(thumbWidth * (hPt / wPt));

    // Start rendering only once the thumbnail scrolls near the viewport.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || visible) return;
        const io = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) {
            setVisible(true);
            io.disconnect();
            }
        },
        { rootMargin: "300px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [visible]);

    // (Re-)render whenever the page content/geometry changes, e.g. after rotate.
    useEffect(() => {
        if (!visible || !originalBytes) return;
        let cancelled = false;
        let task: { cancel: () => void } | null = null;
        let release: (() => void) | null = null;

        (async () => {
        try {
            release = await acquireSlot();
            if (cancelled) return;
            await getPdfjs();
            const loaded = await getCachedPdf(originalBytes);
            if (cancelled) return;

            const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
            const scale = (thumbWidth * dpr) / wPt;
            const off = document.createElement("canvas");
            const src = page.index; // SOURCE page; -1 = blank page

            if (src < 0 || src >= loaded.pdf.numPages) {
            off.width = Math.max(1, Math.floor(wPt * scale));
            off.height = Math.max(1, Math.floor(hPt * scale));
            const c = off.getContext("2d");
            if (c) {
                c.fillStyle = "#ffffff";
                c.fillRect(0, 0, off.width, off.height);
            }
            } else {
            const pdfPage = await getPage(loaded.pdf, src);
            if (cancelled) return;
            const viewport = pdfPage.getViewport({
                scale,
                rotation: page.rotation,
            });
            off.width = Math.max(1, Math.floor(viewport.width));
            off.height = Math.max(1, Math.floor(viewport.height));
            const octx = off.getContext("2d");
            if (!octx) throw new Error("no 2d context");
            octx.fillStyle = "#ffffff";
            octx.fillRect(0, 0, off.width, off.height);

            // FIX: Added `canvas: off` to satisfy pdfjs-dist v5/v6 types
            const t = pdfPage.render({
                canvas: off,
                canvasContext: octx,
                viewport,
                intent: "display",
            });

            task = t;
            await t.promise;
            }
            if (cancelled) return;
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = off.width;
            canvas.height = off.height;
            canvas.getContext("2d")?.drawImage(off, 0, 0);
            setError(false);
            setReady(true);
        } catch (err) {
            if (
            (err as { name?: string })?.name !== "RenderingCancelledException"
            ) {
            console.warn("Thumb render error:", err);
            if (!cancelled) setError(true);
            }
        } finally {
            release?.();
        }
        })();

        return () => {
        cancelled = true;
        try {
            task?.cancel();
        } catch {
            /* already finished */
        }
        };
    }, [visible, originalBytes, page, wPt, hPt, thumbWidth]);

    return (
        <div
        ref={containerRef}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`group relative rounded border ${
            active ? "border-emerald-500" : "border-zinc-800"
        } ${isDragging ? "opacity-40" : ""} ${
            isOver ? "ring-1 ring-emerald-500/60" : ""
        } bg-zinc-900 overflow-hidden cursor-pointer flex flex-col`}
        onClick={onSelect}
        >
        <div
            className="bg-white mx-auto relative overflow-hidden"
            style={{ width: thumbWidth, height: thumbHeight }}
        >
            {!ready && !error && (
            <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
            )}
            {error && (
            <div className="absolute inset-0 grid place-items-center text-[10px] text-red-500 text-center px-1">
                Failed to load
            </div>
            )}
            <canvas
            ref={canvasRef}
            style={{
                display: ready ? "block" : "none",
                width: thumbWidth,
                height: thumbHeight,
            }}
            />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-zinc-950/80 text-[10px] text-zinc-300 px-1 py-0.5 flex items-center justify-between">
            <span>{index + 1}</span>
            {page.rotation !== 0 && (
            <span className="text-emerald-400">{page.rotation}°</span>
            )}
        </div>

        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-zinc-950/80 rounded">
            <button
            onClick={(e) => {
                e.stopPropagation();
                onRotate();
            }}
            className="p-1 hover:bg-zinc-800 rounded"
            title="Rotate 90°"
            >
            <RotateCw className="w-3 h-3" />
            </button>
            <button
            onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
            }}
            className="p-1 hover:bg-zinc-800 rounded"
            title="Duplicate"
            >
            <Copy className="w-3 h-3" />
            </button>
            <button
            onClick={(e) => {
                e.stopPropagation();
                onInsert();
            }}
            className="p-1 hover:bg-zinc-800 rounded"
            title="Insert blank page after"
            >
            <Plus className="w-3 h-3" />
            </button>
            <button
            onClick={(e) => {
                e.stopPropagation();
                onDelete();
            }}
            className="p-1 hover:bg-red-600/30 text-red-400 rounded"
            title="Delete page"
            >
            <Trash2 className="w-3 h-3" />
            </button>
        </div>
        </div>
    );
    }
