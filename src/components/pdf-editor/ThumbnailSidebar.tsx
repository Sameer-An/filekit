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

// Global render queue to prevent too many concurrent pdfjs renders.
let activeRenders = 0;
const renderQueue: (() => void)[] = [];

function enqueueRender(task: () => void) {
renderQueue.push(task);
processQueue();
}

function processQueue() {
if (activeRenders >= 2 || renderQueue.length === 0) return;
activeRenders++;
const task = renderQueue.shift();
task?.();
}

function dequeueRender() {
activeRenders--;
processQueue();
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
            key={`${page.index}-${i}`}
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
const [rendered, setRendered] = useState(false);
const [error, setError] = useState(false);

const aspect = page.heightPt / page.widthPt;
const thumbWidth = 140;
const thumbHeight = Math.round(thumbWidth * aspect);

useEffect(() => {
    if (!containerRef.current || !originalBytes || rendered || error) return;

    let isMounted = true;
    let task: { cancel: () => void } | null = null;

    const observer = new IntersectionObserver(
    (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        enqueueRender(async () => {
        try {
            await getPdfjs();
            const loaded = await getCachedPdf(originalBytes);
            if (!isMounted) return dequeueRender();

            const pdfPage = await getPage(loaded.pdf, index);
            if (!isMounted) return dequeueRender();

            const canvas = canvasRef.current;
            if (!canvas) return dequeueRender();

            const viewport = pdfPage.getViewport({
            scale: 1,
            rotation: page.rotation,
            });
            const scale = thumbWidth / viewport.width;
            const finalViewport = pdfPage.getViewport({
            scale,
            rotation: page.rotation,
            });

            canvas.width = finalViewport.width;
            canvas.height = finalViewport.height;

            const ctx = canvas.getContext("2d");
            if (!ctx) return dequeueRender();

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const renderTask = pdfPage.render({
            canvasContext: ctx,
            viewport: finalViewport,
            });
            task = renderTask;

            await renderTask.promise;
            if (isMounted) {
            setRendered(true);
            dequeueRender();
            }
        } catch (err) {
            const name = (err as { name?: string })?.name;
            if (name !== "RenderingCancelledException") {
            console.warn("Thumb render error:", err);
            if (isMounted) setError(true);
            }
            dequeueRender();
        }
        });
    },
    { root: null, rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(containerRef.current);

    return () => {
    isMounted = false;
    observer.disconnect();
    try {
        task?.cancel();
    } catch {}
    };
}, [originalBytes, index, page.rotation, rendered, error]);

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
        className="bg-white mx-auto flex items-center justify-center overflow-hidden"
        style={{ width: thumbWidth, height: thumbHeight }}
    >
        {!rendered && !error && (
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        )}
        {error && (
        <span className="text-[10px] text-red-500 text-center px-1">
            Failed to load
        </span>
        )}
        <canvas
        ref={canvasRef}
        style={{
            display: rendered ? "block" : "none",
            maxWidth: "100%",
            maxHeight: "100%",
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
