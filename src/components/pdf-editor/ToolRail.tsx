// src/components/pdf-editor/ToolRail.tsx
// Vertical tool rail. Each button selects a `ToolId`. When the signature tool
// is selected, PdfEditorApp intercepts and opens the signature dialog.

"use client";

import React from "react";
import {
MousePointer2,
Type,
Image as ImageIcon,
Square,
Pencil,
Highlighter,
Underline as UnderlineIcon,
Strikethrough,
Eraser,
ScanLine,
Signature,
Link as LinkIcon,
StickyNote,
Stamp,
Check,
} from "lucide-react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type { ToolId } from "@/lib/pdf-editor/types";

interface ToolDef {
id: ToolId;
label: string;
icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
{
    id: "select",
    label: "Select",
    icon: <MousePointer2 className="w-4 h-4" />,
},
{ id: "text", label: "Text box", icon: <Type className="w-4 h-4" /> },
{ id: "image", label: "Image", icon: <ImageIcon className="w-4 h-4" /> },
{ id: "shape", label: "Shape", icon: <Square className="w-4 h-4" /> },
{ id: "draw", label: "Draw", icon: <Pencil className="w-4 h-4" /> },
{
    id: "highlight",
    label: "Highlight",
    icon: <Highlighter className="w-4 h-4" />,
},
{
    id: "underline",
    label: "Underline",
    icon: <UnderlineIcon className="w-4 h-4" />,
},
{
    id: "strike",
    label: "Strikethrough",
    icon: <Strikethrough className="w-4 h-4" />,
},
{ id: "whiteout", label: "Whiteout", icon: <Eraser className="w-4 h-4" /> },
{ id: "redact", label: "Redact", icon: <ScanLine className="w-4 h-4" /> },
{
    id: "signature",
    label: "Signature",
    icon: <Signature className="w-4 h-4" />,
},
{ id: "link", label: "Link", icon: <LinkIcon className="w-4 h-4" /> },
{
    id: "note",
    label: "Sticky note",
    icon: <StickyNote className="w-4 h-4" />,
},
{ id: "stamp", label: "Stamp", icon: <Stamp className="w-4 h-4" /> },
{ id: "checkmark", label: "Checkmark", icon: <Check className="w-4 h-4" /> },
];

export function ToolRail() {
const activeTool = usePdfEditor((s) => s.activeTool);
const selectTool = usePdfEditor((s) => s.selectTool);

return (
    <div className="shrink-0 w-12 flex flex-col items-center gap-0.5 py-2 bg-zinc-950 border-r border-zinc-800 overflow-y-auto">
    {TOOLS.map((t) => (
        <button
        key={t.id}
        onClick={() => selectTool(t.id)}
        title={t.label}
        className={`w-9 h-9 grid place-items-center rounded ${
            activeTool === t.id
            ? "bg-emerald-600 text-white"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        }`}
        >
        {t.icon}
        </button>
    ))}
    </div>
);
}
