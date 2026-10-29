    "use client";

    import React from "react";
    import { usePdfEditor } from "@/lib/pdf-editor/store";
    import type {
    TextRunObject,
    NewTextObject,
    PDFObject,
    } from "@/lib/pdf-editor/types";

    export function TextProperties() {
    const selectedIds = usePdfEditor((s) => s.selectedIds);
    const objects = usePdfEditor((s) => s.objects);
    const updateObject = usePdfEditor((s) => s.updateObject);

    if (selectedIds.length !== 1) return null;
    const obj = objects[selectedIds[0]];

    // Only show this panel for text objects
    if (!obj || (obj.kind !== "text-run" && obj.kind !== "new-text")) return null;

    const text = obj as TextRunObject | NewTextObject;

    // Fix: Replaced `any` with a proper Partial type
    const update = (patch: Partial<PDFObject>) => {
        updateObject(obj.id, patch);
    };

    return (
        <div className="space-y-4 text-xs text-zinc-300 p-2">
        <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Font
            </label>
            <select
            value={text.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            >
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Arial">Arial</option>
            </select>
        </div>

        <div className="flex items-center gap-2">
            <button
            onClick={() => update({ bold: !text.bold })}
            className={`px-2 py-1 rounded border ${
                text.bold ? "bg-emerald-600 border-emerald-500" : "border-zinc-700"
            }`}
            >
            B
            </button>
            <button
            onClick={() => update({ italic: !text.italic })}
            className={`px-2 py-1 rounded border italic ${
                text.italic
                ? "bg-emerald-600 border-emerald-500"
                : "border-zinc-700"
            }`}
            >
            I
            </button>
            <button
            onClick={() => update({ underline: !text.underline })}
            className={`px-2 py-1 rounded border underline ${
                text.underline
                ? "bg-emerald-600 border-emerald-500"
                : "border-zinc-700"
            }`}
            >
            U
            </button>

            {/* Fix: Removed `isRun` check and `as any` cast because `strike` now exists on both text types */}
            <button
            onClick={() => update({ strike: !text.strike })}
            className={`px-2 py-1 rounded border line-through ${
                text.strike
                ? "bg-emerald-600 border-emerald-500"
                : "border-zinc-700"
            }`}
            >
            S
            </button>
        </div>

        <div className="flex items-center gap-2">
            <input
            type="number"
            value={text.fontSize}
            onChange={(e) =>
                update({ fontSize: parseFloat(e.target.value) || 12 })
            }
            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            title="Font Size"
            />
            <input
            type="color"
            value={text.color}
            onChange={(e) => update({ color: e.target.value })}
            className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
            title="Text Color"
            />
        </div>
        </div>
    );
    }
