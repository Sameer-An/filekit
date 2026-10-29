// src/components/pdf-editor/PropertiesPanel.tsx
// Context-sensitive right panel. Shows:
//   - nothing when the selection is empty (default tip)
//   - TextProperties when the selection is a text-like object
//   - shape / colour controls for shapes, highlights, etc.
//   - position / size / lock controls for any object
//   - multi-select summary + alignment + layer actions

"use client";

import React from "react";
import {
Lock,
Unlock,
Trash2,
Copy,
ArrowUp,
ArrowDown,
MoveHorizontal,
MoveVertical,
AlignStartVertical,
AlignCenterVertical,
AlignEndVertical,
AlignStartHorizontal,
AlignCenterHorizontal,
AlignEndHorizontal,
} from "lucide-react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type { PDFObject, ShapeObject } from "@/lib/pdf-editor/types";
import { TextProperties } from "./TextProperties";

export function PropertiesPanel() {
const objects = usePdfEditor((s) => s.objects);
const selectedIds = usePdfEditor((s) => s.selectedIds);
const updateObject = usePdfEditor((s) => s.updateObject);
const deleteSelected = usePdfEditor((s) => s.deleteSelected);
const duplicateSelected = usePdfEditor((s) => s.duplicateSelected);
const bringForward = usePdfEditor((s) => s.bringForward);
const sendBackward = usePdfEditor((s) => s.sendBackward);
const commit = usePdfEditor((s) => s.commit);
const setPropertiesOpen = usePdfEditor((s) => s.setPropertiesOpen);

const selected: PDFObject[] = selectedIds
    .map((id) => objects[id])
    .filter((o): o is PDFObject => Boolean(o));

const single = selected.length === 1 ? selected[0] : null;

const align = (axis: "x" | "y", mode: "start" | "center" | "end") => {
    if (selected.length < 2) return;
    commit("Align", (d) => {
    const rects = selected.map((o) => o.rect);
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    for (const o of selected) {
        const obj = d.objects[o.id];
        if (!obj) continue;
        if (axis === "x") {
        if (mode === "start") obj.rect = { ...obj.rect, x: minX };
        if (mode === "center")
            obj.rect = { ...obj.rect, x: (minX + maxX) / 2 - obj.rect.w / 2 };
        if (mode === "end") obj.rect = { ...obj.rect, x: maxX - obj.rect.w };
        } else {
        if (mode === "start") obj.rect = { ...obj.rect, y: minY };
        if (mode === "center")
            obj.rect = { ...obj.rect, y: (minY + maxY) / 2 - obj.rect.h / 2 };
        if (mode === "end") obj.rect = { ...obj.rect, y: maxY - obj.rect.h };
        }
    }
    });
};

return (
    <div className="shrink-0 w-72 flex flex-col bg-zinc-950 border-l border-zinc-800">
    <div className="flex items-center justify-between px-3 h-8 border-b border-zinc-800">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
        Properties
        </span>
        <button
        onClick={() => setPropertiesOpen(false)}
        className="text-xs text-zinc-500 hover:text-zinc-300"
        >
        Hide
        </button>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {selected.length === 0 && (
        <div className="text-zinc-500 leading-relaxed">
            Select an object on the page to edit its properties. Use the left
            rail to add text, images, shapes, highlights or a signature.
        </div>
        )}

        {selected.length > 1 && (
        <div className="space-y-2">
            <div className="text-zinc-400">
            {selected.length} objects selected
            </div>
            <div className="grid grid-cols-3 gap-1">
            <IconBtn onClick={() => align("x", "start")} title="Align left">
                <AlignStartVertical className="w-3.5 h-3.5" />
            </IconBtn>
            <IconBtn
                onClick={() => align("x", "center")}
                title="Align center"
            >
                <AlignCenterVertical className="w-3.5 h-3.5" />
            </IconBtn>
            <IconBtn onClick={() => align("x", "end")} title="Align right">
                <AlignEndVertical className="w-3.5 h-3.5" />
            </IconBtn>
            <IconBtn onClick={() => align("y", "start")} title="Align bottom">
                <AlignStartHorizontal className="w-3.5 h-3.5" />
            </IconBtn>
            <IconBtn
                onClick={() => align("y", "center")}
                title="Align middle"
            >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </IconBtn>
            <IconBtn onClick={() => align("y", "end")} title="Align top">
                <AlignEndHorizontal className="w-3.5 h-3.5" />
            </IconBtn>
            </div>
        </div>
        )}

        {single && (
        <>
            {(single.kind === "text-run" ||
            single.kind === "new-text" ||
            single.kind === "note") && (
            <TextProperties
                obj={single as never}
                onChange={(patch) =>
                updateObject(single.id, patch as Partial<PDFObject>)
                }
            />
            )}

            {single.kind === "shape" && (
            <ShapeProperties
                obj={single}
                onChange={(patch) => updateObject(single.id, patch)}
            />
            )}

            {(single.kind === "highlight" ||
            single.kind === "underline" ||
            single.kind === "strike" ||
            single.kind === "whiteout" ||
            single.kind === "redact" ||
            single.kind === "link" ||
            single.kind === "stamp" ||
            single.kind === "checkmark") && (
            <ColorOnly
                color={(single as { color: string }).color}
                onChange={(color) =>
                updateObject(single.id, { color } as Partial<PDFObject>)
                }
            />
            )}

            <div className="grid grid-cols-2 gap-2">
            <NumberField
                label="X"
                value={single.rect.x}
                onChange={(v) =>
                updateObject(single.id, { rect: { ...single.rect, x: v } })
                }
            />
            <NumberField
                label="Y"
                value={single.rect.y}
                onChange={(v) =>
                updateObject(single.id, { rect: { ...single.rect, y: v } })
                }
            />
            <NumberField
                label="W"
                value={single.rect.w}
                onChange={(v) =>
                updateObject(single.id, {
                    rect: { ...single.rect, w: Math.max(4, v) },
                })
                }
            />
            <NumberField
                label="H"
                value={single.rect.h}
                onChange={(v) =>
                updateObject(single.id, {
                    rect: { ...single.rect, h: Math.max(4, v) },
                })
                }
            />
            <NumberField
                label="Rotation"
                value={single.rotation}
                onChange={(v) => updateObject(single.id, { rotation: v })}
            />
            <NumberField
                label="Opacity"
                value={single.opacity}
                step={0.05}
                onChange={(v) =>
                updateObject(single.id, {
                    opacity: Math.max(0, Math.min(1, v)),
                })
                }
            />
            </div>
        </>
        )}

        {selected.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-1">
            <IconBtn onClick={duplicateSelected} title="Duplicate (Ctrl+D)">
                <Copy className="w-3.5 h-3.5" /> Duplicate
            </IconBtn>
            <IconBtn onClick={deleteSelected} title="Delete">
                <Trash2 className="w-3.5 h-3.5" /> Delete
            </IconBtn>
            <IconBtn onClick={bringForward} title="Bring forward">
                <ArrowUp className="w-3.5 h-3.5" /> Forward
            </IconBtn>
            <IconBtn onClick={sendBackward} title="Send backward">
                <ArrowDown className="w-3.5 h-3.5" /> Back
            </IconBtn>
            </div>
            {single && (
            <button
                onClick={() =>
                updateObject(single.id, { locked: !single.locked })
                }
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
            >
                {single.locked ? (
                <>
                    <Unlock className="w-3.5 h-3.5" /> Unlock
                </>
                ) : (
                <>
                    <Lock className="w-3.5 h-3.5" /> Lock
                </>
                )}
            </button>
            )}
        </div>
        )}
    </div>
    </div>
);
}

function IconBtn({
onClick,
title,
children,
}: {
onClick: () => void;
title: string;
children: React.ReactNode;
}) {
return (
    <button
    type="button"
    onClick={onClick}
    title={title}
    className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300"
    >
    {children}
    </button>
);
}

function NumberField({
label,
value,
step = 1,
onChange,
}: {
label: string;
value: number;
step?: number;
onChange: (v: number) => void;
}) {
return (
    <label className="space-y-1">
    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
    </span>
    <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
    />
    </label>
);
}

function ShapeProperties({
obj,
onChange,
}: {
obj: ShapeObject;
onChange: (patch: Partial<ShapeObject>) => void;
}) {
return (
    <div className="space-y-2">
    <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        Shape
        </span>
        <select
        value={obj.shape}
        onChange={(e) =>
            onChange({ shape: e.target.value as ShapeObject["shape"] })
        }
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        >
        <option value="rect">Rectangle</option>
        <option value="ellipse">Ellipse</option>
        <option value="line">Line</option>
        <option value="arrow">Arrow</option>
        </select>
    </label>
    <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Stroke
        </span>
        <input
            type="color"
            value={obj.stroke}
            onChange={(e) => onChange({ stroke: e.target.value })}
            className="w-full h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
        />
        </label>
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Fill
        </span>
        <input
            type="color"
            value={obj.fill ?? "#ffffff"}
            onChange={(e) => onChange({ fill: e.target.value })}
            className="w-full h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
        />
        </label>
    </div>
    <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        Stroke width
        </span>
        <input
        type="number"
        step={0.5}
        min={0.5}
        max={20}
        value={obj.strokeWidth}
        onChange={(e) =>
            onChange({
            strokeWidth: Math.max(0.5, parseFloat(e.target.value) || 1),
            })
        }
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        />
    </label>
    </div>
);
}

function ColorOnly({
color,
onChange,
}: {
color: string;
onChange: (c: string) => void;
}) {
return (
    <label className="space-y-1 block">
    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        Colour
    </span>
    <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
    />
    </label>
);
}
