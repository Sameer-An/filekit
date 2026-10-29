    // src/components/pdf-editor/TextProperties.tsx
    "use client";
    import React from "react";
    import { useShallow } from "zustand/react/shallow";
    import { usePdfEditor } from "@/lib/pdf-editor/store";
    import type {
    PDFObject,
    TextRunObject,
    NewTextObject,
    } from "@/lib/pdf-editor/types";

    const FONT_OPTIONS = [
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Georgia",
    "Courier New",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Calibri",
    "Cambria",
    "Garamond",
    "Comic Sans MS",
    "Impact",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Noto Sans",
    ] as const;

    type TextLike = TextRunObject | NewTextObject;

    function isTextLike(o: PDFObject | undefined): o is TextLike {
    return !!o && (o.kind === "text-run" || o.kind === "new-text");
    }

    export function TextProperties() {
    const { selectedIds, objects, commit } = usePdfEditor(
        useShallow((s) => ({
        selectedIds: s.selectedIds,
        objects: s.objects,
        commit: s.commit,
        })),
    );

    const selected = selectedIds.map((id) => objects[id]).filter(isTextLike);

    if (selected.length === 0) return null;

    const first = selected[0];

    const apply = (patch: Partial<TextLike>) => {
        if (selected.length === 0) return;
        commit("Text style", (d) => {
        for (const obj of selected) {
            const cur = d.objects[obj.id];
            if (!cur || (cur.kind !== "text-run" && cur.kind !== "new-text"))
            continue;
            d.objects[obj.id] = { ...cur, ...patch } as PDFObject;
        }
        });
    };

    const toggle = (key: "bold" | "italic" | "underline" | "strike") => {
        // FIX: Removed `as any` here
        apply({ [key]: !first[key] } as Partial<TextLike>);
    };

    return (
        <div className="space-y-3 text-xs text-zinc-300">
        {/* Font */}
        <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Font
            </label>
            <select
            value={first.fontFamily}
            onChange={(e) => apply({ fontFamily: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            style={{ fontFamily: first.fontFamily }}
            >
            {FONT_OPTIONS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
                </option>
            ))}
            </select>
        </div>

        {/* B I U S */}
        <div className="flex items-center gap-1">
            {(
            [
                ["bold", "B", "font-bold"],
                ["italic", "I", "italic"],
                ["underline", "U", "underline"],
                ["strike", "S", "line-through"],
            ] as const
            ).map(([key, label, cls]) => (
            <button
                key={key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(key)}
                className={`px-2 py-1 rounded border ${cls} ${
                // FIX: Removed `as any` here as well
                first[key]
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "border-zinc-700"
                }`}
            >
                {label}
            </button>
            ))}
        </div>

        {/* Size + Color */}
        <div className="flex items-center gap-2">
            <input
            type="number"
            value={first.fontSize}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) =>
                apply({ fontSize: Math.max(4, parseFloat(e.target.value) || 12) })
            }
            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            title="Font size"
            />
            <input
            type="color"
            value={first.color}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => apply({ color: e.target.value })}
            className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
            title="Text color"
            />
        </div>

        {/* Align */}
        <div className="flex items-center gap-1">
            {(["left", "center", "right", "justify"] as const).map((a) => (
            <button
                key={a}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply({ align: a })}
                className={`px-2 py-1 rounded border ${
                first.align === a
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "border-zinc-700"
                }`}
            >
                {a[0].toUpperCase()}
            </button>
            ))}
        </div>
        </div>
    );
    }
