// src/components/pdf-editor/TextProperties.tsx
// Font + paragraph formatting controls. Shown inside PropertiesPanel when the
// selection is a text-bearing object (new-text, text-run, note).

"use client";

import React from "react";
import {
Bold,
Italic,
Underline as UnderlineIcon,
AlignLeft,
AlignCenter,
AlignRight,
AlignJustify,
} from "lucide-react";
import type {
NewTextObject,
TextRunObject,
NoteObject,
} from "@/lib/pdf-editor/types";

type TextLike = NewTextObject | TextRunObject | NoteObject;

interface TextPropertiesProps {
obj: TextLike;
onChange: (patch: Partial<TextLike>) => void;
}

const FONTS = [
"Helvetica",
"Times-Roman",
"Courier",
"Arial",
"Georgia",
"Verdana",
"Calibri",
"Cambria",
];

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export function TextProperties({ obj, onChange }: TextPropertiesProps) {
const isNote = obj.kind === "note";
if (isNote) return null;

const text = obj as NewTextObject | TextRunObject;
return (
    <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Font
        </span>
        <select
            value={text.fontFamily}
            onChange={(e) =>
            onChange({ fontFamily: e.target.value } as Partial<TextLike>)
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        >
            {FONTS.map((f) => (
            <option key={f} value={f}>
                {f}
            </option>
            ))}
        </select>
        </label>
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Size
        </span>
        <select
            value={String(Math.round(text.fontSize))}
            onChange={(e) =>
            onChange({
                fontSize: parseFloat(e.target.value),
            } as Partial<TextLike>)
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        >
            {SIZES.map((s) => (
            <option key={s} value={s}>
                {s} pt
            </option>
            ))}
        </select>
        </label>
    </div>

    <div className="flex items-center gap-0.5">
        <Toggle
        active={text.bold}
        onClick={() => onChange({ bold: !text.bold } as Partial<TextLike>)}
        title="Bold"
        >
        <Bold className="w-4 h-4" />
        </Toggle>
        <Toggle
        active={text.italic}
        onClick={() =>
            onChange({ italic: !text.italic } as Partial<TextLike>)
        }
        title="Italic"
        >
        <Italic className="w-4 h-4" />
        </Toggle>
        <Toggle
        active={text.underline}
        onClick={() =>
            onChange({ underline: !text.underline } as Partial<TextLike>)
        }
        title="Underline"
        >
        <UnderlineIcon className="w-4 h-4" />
        </Toggle>
        <div className="w-px h-5 bg-zinc-800 mx-1" />
        <Toggle
        active={text.align === "left"}
        onClick={() => onChange({ align: "left" } as Partial<TextLike>)}
        title="Align left"
        >
        <AlignLeft className="w-4 h-4" />
        </Toggle>
        <Toggle
        active={text.align === "center"}
        onClick={() => onChange({ align: "center" } as Partial<TextLike>)}
        title="Align center"
        >
        <AlignCenter className="w-4 h-4" />
        </Toggle>
        <Toggle
        active={text.align === "right"}
        onClick={() => onChange({ align: "right" } as Partial<TextLike>)}
        title="Align right"
        >
        <AlignRight className="w-4 h-4" />
        </Toggle>
        <Toggle
        active={text.align === "justify"}
        onClick={() => onChange({ align: "justify" } as Partial<TextLike>)}
        title="Justify"
        >
        <AlignJustify className="w-4 h-4" />
        </Toggle>
    </div>

    <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Color
        </span>
        <input
            type="color"
            value={text.color}
            onChange={(e) =>
            onChange({ color: e.target.value } as Partial<TextLike>)
            }
            className="w-full h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
        />
        </label>
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Line height
        </span>
        <input
            type="number"
            step={0.1}
            min={0.8}
            max={3}
            value={text.lineHeight}
            onChange={(e) =>
            onChange({
                lineHeight: Math.max(0.8, parseFloat(e.target.value) || 1.2),
            } as Partial<TextLike>)
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        />
        </label>
        <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Letter spacing
        </span>
        <input
            type="number"
            step={0.1}
            min={-2}
            max={20}
            value={text.letterSpacing}
            onChange={(e) =>
            onChange({
                letterSpacing: parseFloat(e.target.value) || 0,
            } as Partial<TextLike>)
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs"
        />
        </label>
    </div>

    {obj.kind === "text-run" && obj.substituted && (
        <div className="text-[10px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
        Font substituted on export ({obj.sourceFontName || "unknown"} → Noto
        Sans)
        </div>
    )}
    </div>
);
}

function Toggle({
active,
onClick,
title,
children,
}: {
active: boolean;
onClick: () => void;
title: string;
children: React.ReactNode;
}) {
return (
    <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded ${
        active ? "bg-emerald-600 text-white" : "hover:bg-zinc-800 text-zinc-300"
    }`}
    >
    {children}
    </button>
);
}
