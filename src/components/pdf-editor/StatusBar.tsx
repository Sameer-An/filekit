// src/components/pdf-editor/StatusBar.tsx

"use client";

import React from "react";
import { usePdfEditor } from "@/lib/pdf-editor/store";

export function StatusBar() {
const zoom = usePdfEditor((s) => s.zoom);
const numPages = usePdfEditor((s) => s.numPages);
const currentPage = usePdfEditor((s) => s.scrollPage);
const dirty = usePdfEditor((s) => s.dirty);
const savedAt = usePdfEditor((s) => s.savedAt);
const gridVisible = usePdfEditor((s) => s.gridVisible);
const gridSnap = usePdfEditor((s) => s.grid.snap);

const savedLabel = (() => {
    if (dirty) return "Unsaved changes";
    if (!savedAt) return "Ready";
    const s = Math.max(1, Math.round((Date.now() - savedAt) / 1000));
    if (s < 5) return "Saved just now";
    if (s < 60) return `Saved ${s}s ago`;
    const m = Math.round(s / 60);
    return `Saved ${m}m ago`;
})();

return (
    <div className="shrink-0 flex items-center gap-3 px-3 h-7 bg-zinc-950 border-t border-zinc-800 text-[11px] text-zinc-500">
    <span className="tabular-nums">
        Page {numPages > 0 ? currentPage + 1 : 0} of {numPages}
    </span>
    <span className="tabular-nums">Zoom {Math.round(zoom * 100)}%</span>
    {gridVisible && <span className="text-emerald-500">Grid on</span>}
    {gridVisible && gridSnap && (
        <span className="text-emerald-500/80">Snap</span>
    )}
    <div className="flex-1" />
    <span className={dirty ? "text-amber-400" : ""}>{savedLabel}</span>
    </div>
);
}
