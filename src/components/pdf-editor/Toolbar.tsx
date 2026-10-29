    // src/components/pdf-editor/Toolbar.tsx
    // Top bar with file name, undo/redo, zoom controls, grid toggle, and the
    // Download button (which opens an inline export-options popover).

    "use client";

    import React, { useCallback, useMemo, useState } from "react";
    import {
    Undo2,
    Redo2,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Square,
    Grid3X3,
    Download,
    Loader2,
    X,
    ChevronDown,
    PanelRight,
    } from "lucide-react";
    import { usePdfEditor, peekRedo, peekUndo } from "@/lib/pdf-editor/store";
    import { exportPdf } from "@/lib/pdf-editor/export";
    import type { ExportOptions } from "@/lib/pdf-editor/types";
    import { downloadBlob } from "@/lib/utils";

    interface ToolbarProps {
    onGridDialog: () => void;
    onToggleProperties: () => void;
    propertiesOpen: boolean;
    }

    export function Toolbar({
    onGridDialog,
    onToggleProperties,
    propertiesOpen,
    }: ToolbarProps) {
    const fileName = usePdfEditor((s) => s.fileName);
    const zoom = usePdfEditor((s) => s.zoom);
    const setZoom = usePdfEditor((s) => s.setZoom);
    const setFitMode = usePdfEditor((s) => s.setFitMode);
    const gridVisible = usePdfEditor((s) => s.gridVisible);
    const setGridVisible = usePdfEditor((s) => s.setGridVisible);
    const undo = usePdfEditor((s) => s.undo);
    const redo = usePdfEditor((s) => s.redo);
    const markSaved = usePdfEditor((s) => s.markSaved);
    const dirty = usePdfEditor((s) => s.dirty);

    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    const [options, setOptions] = useState<{
        pageRangeMode: "all" | "range";
        from: number;
        to: number;
        compress: boolean;
        flatten: boolean;
    }>({
        pageRangeMode: "all",
        from: 1,
        to: 1,
        compress: true,
        flatten: false,
    });

    const historyIndex = usePdfEditor((s) => s.history.index);
    const historyLength = usePdfEditor((s) => s.history.entries.length);

    const undoable = historyIndex > 0;
    const redoable = historyIndex < historyLength - 1;

    const numPages = usePdfEditor((s) => s.numPages);

    const handleDownload = useCallback(async () => {
        setExporting(true);
        setExportError(null);
        try {
        const s = usePdfEditor.getState();
        if (!s.originalBytes) throw new Error("No PDF loaded.");
        const exportOptions: ExportOptions = {
            pageRange:
            options.pageRangeMode === "range"
                ? {
                    from: Math.max(1, options.from),
                    to: Math.min(numPages || options.to, options.to || numPages),
                }
                : "all",
            flatten: options.flatten,
            compress: options.compress,
            requestedPassword: null,
        };

        const bytes = await exportPdf({
            originalBytes: s.originalBytes,
            pages: s.pages,
            objects: s.objects,
            pageObjectIds: s.pageObjectIds,
            pageOps: s.pageOps,
            overlays: s.overlays ?? {
            header: "",
            footer: "",
            watermark: "",
            pageNumbers: false,
            },
            options: exportOptions,
        });

        const blob = new Blob([new Uint8Array(bytes)], {
            type: "application/pdf",
        });
        const outName = s.fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
        downloadBlob(blob, outName);
        markSaved();
        setExportOpen(false);
        } catch (err) {
        console.error(err);
        setExportError(
            err instanceof Error ? err.message : "Export failed. Please try again.",
        );
        } finally {
        setExporting(false);
        }
    }, [markSaved, numPages, options]);

    return (
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-emerald-600 text-white grid place-items-center text-[10px] font-bold">
            P
            </div>
            <span className="text-sm font-medium truncate max-w-[240px]">
            {fileName || "Untitled.pdf"}
            </span>
            {dirty && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                Unsaved
            </span>
            )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
            <button
            onClick={undo}
            disabled={!undoable}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
            >
            <Undo2 className="w-4 h-4" />
            </button>
            <button
            onClick={redo}
            disabled={!redoable}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
            >
            <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-zinc-800 mx-1" />

            <button
            onClick={() => setZoom(zoom / 1.15)}
            title="Zoom out"
            className="p-1.5 rounded hover:bg-zinc-800"
            >
            <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
            </span>
            <button
            onClick={() => setZoom(zoom * 1.15)}
            title="Zoom in"
            className="p-1.5 rounded hover:bg-zinc-800"
            >
            <ZoomIn className="w-4 h-4" />
            </button>
            <button
            onClick={() => setFitMode("width")}
            title="Fit width (Ctrl+1)"
            className="p-1.5 rounded hover:bg-zinc-800"
            >
            <Square className="w-4 h-4" />
            </button>
            <button
            onClick={() => setFitMode("page")}
            title="Fit page (Ctrl+0)"
            className="p-1.5 rounded hover:bg-zinc-800"
            >
            <Maximize2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-zinc-800 mx-1" />

            <button
            onClick={() => setGridVisible(!gridVisible)}
            title="Toggle grid"
            className={`p-1.5 rounded ${
                gridVisible ? "bg-zinc-800 text-emerald-400" : "hover:bg-zinc-800"
            }`}
            >
            <Grid3X3 className="w-4 h-4" />
            </button>
            <button
            onClick={onGridDialog}
            title="Edit grid style"
            className="px-2 py-1 text-xs rounded hover:bg-zinc-800"
            >
            Grid style
            </button>
            <button
            onClick={() => {
                const ev = new CustomEvent("pdf-editor:open-page-overlays");
                window.dispatchEvent(ev);
            }}
            title="Add page overlays"
            className="px-2 py-1 text-xs rounded hover:bg-zinc-800"
            >
            Overlays
            </button>

            <button
            onClick={onToggleProperties}
            title={propertiesOpen ? "Hide properties" : "Show properties"}
            className={`p-1.5 rounded ${
                propertiesOpen
                ? "bg-zinc-800 text-emerald-400"
                : "hover:bg-zinc-800"
            }`}
            >
            <PanelRight className="w-4 h-4" />
            </button>
        </div>

        <div className="flex-1" />

        <div className="relative">
            <button
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
            <Download className="w-4 h-4" />
            Download PDF
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>
            {exportOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl z-50">
                <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Export options</span>
                <button
                    onClick={() => setExportOpen(false)}
                    className="p-1 rounded hover:bg-zinc-800"
                    title="Close"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
                </div>
                <div className="space-y-3 text-xs">
                <div className="space-y-1">
                    <div className="text-zinc-400">Page range</div>
                    <label className="flex items-center gap-2">
                    <input
                        type="radio"
                        checked={options.pageRangeMode === "all"}
                        onChange={() =>
                        setOptions((o) => ({ ...o, pageRangeMode: "all" }))
                        }
                    />
                    All pages
                    </label>
                    <label className="flex items-center gap-2">
                    <input
                        type="radio"
                        checked={options.pageRangeMode === "range"}
                        onChange={() =>
                        setOptions((o) => ({ ...o, pageRangeMode: "range" }))
                        }
                    />
                    Range
                    </label>
                    {options.pageRangeMode === "range" && (
                    <div className="flex items-center gap-1.5 pl-5">
                        <input
                        type="number"
                        min={1}
                        value={options.from}
                        onChange={(e) =>
                            setOptions((o) => ({
                            ...o,
                            from: parseInt(e.target.value, 10) || 1,
                            }))
                        }
                        className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
                        />
                        <span>to</span>
                        <input
                        type="number"
                        min={1}
                        value={options.to || numPages}
                        onChange={(e) =>
                            setOptions((o) => ({
                            ...o,
                            to: parseInt(e.target.value, 10) || numPages,
                            }))
                        }
                        className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
                        />
                        <span className="text-zinc-500">of {numPages}</span>
                    </div>
                    )}
                </div>
                <label className="flex items-center gap-2">
                    <input
                    type="checkbox"
                    checked={options.compress}
                    onChange={(e) =>
                        setOptions((o) => ({ ...o, compress: e.target.checked }))
                    }
                    />
                    Compress output
                </label>
                <label
                    className="flex items-center gap-2 opacity-60"
                    title="Reserved for a future release"
                >
                    <input
                    type="checkbox"
                    checked={options.flatten}
                    disabled
                    readOnly
                    />
                    Flatten annotations (coming soon)
                </label>
                {exportError && (
                    <div className="text-red-400 text-[11px]">{exportError}</div>
                )}
                <button
                    onClick={handleDownload}
                    disabled={exporting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-medium"
                >
                    {exporting ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Preparing…
                    </>
                    ) : (
                    <>
                        <Download className="w-3.5 h-3.5" />
                        Download
                    </>
                    )}
                </button>
                </div>
            </div>
            )}
        </div>
        </div>
    );
    }
