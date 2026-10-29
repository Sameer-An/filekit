// src/components/pdf-editor/FindReplaceBar.tsx
// Simple find / replace across all text runs. Finds matches in `text-run`
// objects' `text` field and can replace them (marking them dirty).

"use client";

import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf-editor/store";

export function FindReplaceBar() {
const open = usePdfEditor((s) => s.findOpen);
const setFindOpen = usePdfEditor((s) => s.setFindOpen);
const objects = usePdfEditor((s) => s.objects);
const commit = usePdfEditor((s) => s.commit);

const [needle, setNeedle] = useState("");
const [replacement, setReplacement] = useState("");

const matches = useMemo(() => {
    if (!needle) return [] as string[];
    const n = needle.toLowerCase();
    return Object.values(objects)
    .filter((o) => o.kind === "text-run" && o.text.toLowerCase().includes(n))
    .map((o) => o.id);
}, [objects, needle]);

if (!open) return null;

const applyReplace = () => {
    if (!needle) return;
    commit("Replace text", (d) => {
    for (const o of Object.values(d.objects)) {
        if (o.kind !== "text-run") continue;
        if (o.text.toLowerCase().includes(needle.toLowerCase())) {
        d.objects[o.id] = {
            ...o,
            text: o.text.replace(
            new RegExp(escapeRegExp(needle), "gi"),
            replacement,
            ),
            dirty: true,
        };
        }
    }
    });
};

return (
    <div className="absolute top-14 right-3 z-40 w-80 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl p-3 space-y-2">
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
        <Search className="w-4 h-4" /> Find & replace
        </div>
        <button
        onClick={() => setFindOpen(false)}
        className="p-1 rounded hover:bg-zinc-800"
        title="Close"
        >
        <X className="w-3.5 h-3.5" />
        </button>
    </div>
    <input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder="Find"
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs"
    />
    <input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Replace with"
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs"
    />
    <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
        {matches.length} match{matches.length === 1 ? "" : "es"}
        </span>
        <button
        onClick={applyReplace}
        disabled={!needle}
        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium"
        >
        Replace all
        </button>
    </div>
    </div>
);
}

function escapeRegExp(s: string): string {
return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
