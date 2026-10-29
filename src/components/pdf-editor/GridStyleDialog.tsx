    // src/components/pdf-editor/GridStyleDialog.tsx
    // Modal "Edit grid style": a visual gallery of the 9 preset styles + the
    // settings that apply to any of them. Persists to localStorage.

    "use client";

    import React, { useEffect, useMemo, useState } from "react";
    import { X } from "lucide-react";
    import { usePdfEditor } from "@/lib/pdf-editor/store";
    import type {
    GridSettings,
    GridStyleId,
    GridUnit,
    } from "@/lib/pdf-editor/types";
    import {
    GRID_PRESET_IDS,
    getGridPreset,
    renderPresetPreviewDataUrl,
    } from "@/lib/pdf-editor/grid-presets";

    const STORAGE_KEY = "pdf-editor.grid";

    interface GridStyleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    }

    export function GridStyleDialog({ open, onOpenChange }: GridStyleDialogProps) {
    const grid = usePdfEditor((s) => s.grid);
    const setGrid = usePdfEditor((s) => s.setGrid);
    const setGridVisible = usePdfEditor((s) => s.setGridVisible);
    const [draft, setDraft] = useState<GridSettings>(grid);

    // FIX: Deferred the state sync using setTimeout to avoid React 19 synchronous setState warning
    useEffect(() => {
        if (open) {
        const timer = setTimeout(() => setDraft(grid), 0);
        return () => clearTimeout(timer);
        }
    }, [open, grid]);

    // Persist to localStorage whenever the store's grid changes.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
        } catch {
        /* noop */
        }
    }, [grid]);

    const previewSettings = useMemo<GridSettings>(
        () => ({ ...draft, opacity: Math.max(0.15, draft.opacity) }),
        [draft],
    );

    if (!open) return null;

    const commit = () => {
        setGrid(draft);
        setGridVisible(true);
        onOpenChange(false);
    };

    const patch = (p: Partial<GridSettings>) => setDraft((d) => ({ ...d, ...p }));

    return (
        <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={() => onOpenChange(false)}
        >
        <div
            className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-4 h-11 border-b border-zinc-800">
            <h2 className="text-sm font-semibold">Edit grid style</h2>
            <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded hover:bg-zinc-800"
                title="Close"
            >
                <X className="w-4 h-4" />
            </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
                <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
                Gallery
                </h3>
                <div className="grid grid-cols-3 gap-3">
                {GRID_PRESET_IDS.map((id) => (
                    <button
                    key={id}
                    type="button"
                    onClick={() => patch({ styleId: id })}
                    className={`rounded-lg overflow-hidden border ${
                        draft.styleId === id
                        ? "border-emerald-500 ring-2 ring-emerald-500/30"
                        : "border-zinc-800 hover:border-zinc-700"
                    } bg-zinc-900`}
                    >
                    <div
                        className="h-24 w-full bg-white"
                        style={{
                        backgroundImage: `url(${renderPresetPreviewDataUrl(id, 320, 200, previewSettings)})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        }}
                    />
                    <div className="p-2 text-left">
                        <div className="text-xs font-semibold text-zinc-100">
                        {getGridPreset(id).name}
                        </div>
                        <div className="text-[10px] text-zinc-500 leading-snug">
                        {getGridPreset(id).description}
                        </div>
                    </div>
                    </button>
                ))}
                </div>
            </section>

            <section>
                <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
                Settings
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Field label="Cell size">
                    <input
                    type="number"
                    min={4}
                    max={400}
                    value={draft.cellSize}
                    onChange={(e) =>
                        patch({
                        cellSize: Math.max(4, parseFloat(e.target.value) || 24),
                        })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Unit">
                    <select
                    value={draft.unit}
                    onChange={(e) => patch({ unit: e.target.value as GridUnit })}
                    className="input"
                    >
                    <option value="px">px</option>
                    <option value="mm">mm</option>
                    <option value="in">in</option>
                    </select>
                </Field>
                <Field label="Rows (blank = auto)">
                    <input
                    type="number"
                    min={1}
                    value={draft.rows ?? ""}
                    onChange={(e) =>
                        patch({
                        rows: e.target.value
                            ? Math.max(1, parseInt(e.target.value, 10))
                            : null,
                        })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Columns (blank = auto)">
                    <input
                    type="number"
                    min={1}
                    value={draft.columns ?? ""}
                    onChange={(e) =>
                        patch({
                        columns: e.target.value
                            ? Math.max(1, parseInt(e.target.value, 10))
                            : null,
                        })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Major every">
                    <input
                    type="number"
                    min={0}
                    max={20}
                    value={draft.majorEvery}
                    onChange={(e) =>
                        patch({
                        majorEvery: Math.max(
                            0,
                            parseInt(e.target.value, 10) || 0,
                        ),
                        })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Offset X">
                    <input
                    type="number"
                    value={draft.offsetX}
                    onChange={(e) =>
                        patch({ offsetX: parseFloat(e.target.value) || 0 })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Offset Y">
                    <input
                    type="number"
                    value={draft.offsetY}
                    onChange={(e) =>
                        patch({ offsetY: parseFloat(e.target.value) || 0 })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Line width (px)">
                    <input
                    type="number"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={draft.lineThicknessPx}
                    onChange={(e) =>
                        patch({
                        lineThicknessPx: Math.max(
                            0.5,
                            parseFloat(e.target.value) || 1,
                        ),
                        })
                    }
                    className="input"
                    />
                </Field>
                <Field label="Line colour">
                    <input
                    type="color"
                    value={draft.lineColor}
                    onChange={(e) => patch({ lineColor: e.target.value })}
                    className="w-full h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
                    />
                </Field>
                <Field label="Opacity">
                    <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={draft.opacity}
                    onChange={(e) =>
                        patch({ opacity: parseFloat(e.target.value) })
                    }
                    className="w-full"
                    />
                </Field>
                <Field label="Snap to grid">
                    <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={draft.snap}
                        onChange={(e) => patch({ snap: e.target.checked })}
                    />
                    On
                    </label>
                </Field>
                </div>
            </section>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-zinc-800">
            <button
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 rounded text-xs border border-zinc-700 hover:bg-zinc-800"
            >
                Cancel
            </button>
            <button
                onClick={commit}
                className="px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
                Apply
            </button>
            </div>
        </div>
        <style jsx>{`
            .input {
            width: 100%;
            background: #18181b;
            border: 1px solid #3f3f46;
            border-radius: 4px;
            padding: 4px 6px;
            font-size: 12px;
            color: #e4e4e7;
            }
        `}</style>
        </div>
    );
    }

    function Field({
    label,
    children,
    }: {
    label: string;
    children: React.ReactNode;
    }) {
    return (
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {label}
        </span>
        {children}
        </label>
    );
    }
