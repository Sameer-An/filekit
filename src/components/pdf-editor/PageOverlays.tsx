// src/components/pdf-editor/PageOverlays.tsx
// Quick action panel for adding page numbers / headers / footers / watermark
// to every page. Currently a small modal that writes `new-text` objects to
// each page. Kept deliberately simple so it doesn't blow up scope.

"use client";

import React, { useState } from "react";
import { Hash, X, Type, Droplets } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type { NewTextObject } from "@/lib/pdf-editor/types";

interface PageOverlaysProps {
open: boolean;
onOpenChange: (open: boolean) => void;
}

type Mode = "page-numbers" | "header" | "footer" | "watermark";

export function PageOverlays({ open, onOpenChange }: PageOverlaysProps) {
const [mode, setMode] = useState<Mode>("page-numbers");
const [headerText, setHeaderText] = useState("");
const [footerText, setFooterText] = useState("");
const [watermarkText, setWatermarkText] = useState("DRAFT");

const pages = usePdfEditor((s) => s.pages);
const commit = usePdfEditor((s) => s.commit);

if (!open) return null;

const apply = () => {
    commit("Apply page overlay", (d) => {
    pages.forEach((page, index) => {
        const w = page.widthPt;
        const h = page.heightPt;
        if (mode === "page-numbers") {
        const id = `pgno-${crypto.randomUUID()}`;
        const obj: NewTextObject = {
            id,
            kind: "new-text",
            page: index,
            rect: { x: w - 60, y: 18, w: 40, h: 16 },
            rotation: 0,
            z: 9999,
            locked: false,
            opacity: 1,
            text: String(index + 1),
            fontFamily: "Helvetica",
            fontSize: 10,
            bold: false,
            italic: false,
            underline: false,
            color: "#666666",
            align: "right",
            lineHeight: 1.2,
            letterSpacing: 0,
        };
        d.objects[id] = obj;
        (d.pageObjectIds[index] ??= []).push(id);
        } else if (mode === "header" && headerText.trim()) {
        const id = `hdr-${crypto.randomUUID()}`;
        const obj: NewTextObject = {
            id,
            kind: "new-text",
            page: index,
            rect: { x: 24, y: h - 36, w: w - 48, h: 20 },
            rotation: 0,
            z: 9999,
            locked: false,
            opacity: 1,
            text: headerText,
            fontFamily: "Helvetica",
            fontSize: 10,
            bold: false,
            italic: false,
            underline: false,
            color: "#666666",
            align: "center",
            lineHeight: 1.2,
            letterSpacing: 0,
        };
        d.objects[id] = obj;
        (d.pageObjectIds[index] ??= []).push(id);
        } else if (mode === "footer" && footerText.trim()) {
        const id = `ftr-${crypto.randomUUID()}`;
        const obj: NewTextObject = {
            id,
            kind: "new-text",
            page: index,
            rect: { x: 24, y: 18, w: w - 48, h: 20 },
            rotation: 0,
            z: 9999,
            locked: false,
            opacity: 1,
            text: footerText,
            fontFamily: "Helvetica",
            fontSize: 10,
            bold: false,
            italic: false,
            underline: false,
            color: "#666666",
            align: "center",
            lineHeight: 1.2,
            letterSpacing: 0,
        };
        d.objects[id] = obj;
        (d.pageObjectIds[index] ??= []).push(id);
        } else if (mode === "watermark" && watermarkText.trim()) {
        const id = `wm-${crypto.randomUUID()}`;
        const obj: NewTextObject = {
            id,
            kind: "new-text",
            page: index,
            rect: { x: 0, y: h / 2 - 20, w, h: 40 },
            rotation: -25,
            z: 0,
            locked: true,
            opacity: 0.25,
            text: watermarkText,
            fontFamily: "Helvetica",
            fontSize: 60,
            bold: true,
            italic: false,
            underline: false,
            color: "#888888",
            align: "center",
            lineHeight: 1.2,
            letterSpacing: 0,
        };
        d.objects[id] = obj;
        // Watermark goes to the bottom of the z-order.
        (d.pageObjectIds[index] ??= []).unshift(id);
        }
    });
    });
    onOpenChange(false);
};

return (
    <div
    className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    onClick={() => onOpenChange(false)}
    >
    <div
        className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center justify-between px-4 h-11 border-b border-zinc-800">
        <h2 className="text-sm font-semibold">Page overlays</h2>
        <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded hover:bg-zinc-800"
            title="Close"
        >
            <X className="w-4 h-4" />
        </button>
        </div>
        <div className="flex gap-1 p-2 border-b border-zinc-800">
        <Tab
            active={mode === "page-numbers"}
            onClick={() => setMode("page-numbers")}
        >
            <Hash className="w-3.5 h-3.5" /> Numbers
        </Tab>
        <Tab active={mode === "header"} onClick={() => setMode("header")}>
            <Type className="w-3.5 h-3.5" /> Header
        </Tab>
        <Tab active={mode === "footer"} onClick={() => setMode("footer")}>
            <Type className="w-3.5 h-3.5" /> Footer
        </Tab>
        <Tab
            active={mode === "watermark"}
            onClick={() => setMode("watermark")}
        >
            <Droplets className="w-3.5 h-3.5" /> Watermark
        </Tab>
        </div>
        <div className="p-4 space-y-3 text-xs">
        {mode === "header" && (
            <input
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="Header text"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
            />
        )}
        {mode === "footer" && (
            <input
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="Footer text"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
            />
        )}
        {mode === "watermark" && (
            <input
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Watermark text"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
            />
        )}
        {mode === "page-numbers" && (
            <p className="text-zinc-500">
            Adds &ldquo;Page N&rdquo; to the bottom-right corner of every
            page.
            </p>
        )}
        <p className="text-zinc-500">
            Applied to all {pages.length} pages. Each overlay becomes a regular
            text object you can move or delete afterwards.
        </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-zinc-800">
        <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded text-xs border border-zinc-700 hover:bg-zinc-800"
        >
            Cancel
        </button>
        <button
            onClick={apply}
            className="px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
        >
            Apply to all pages
        </button>
        </div>
    </div>
    </div>
);
}

function Tab({
active,
onClick,
children,
}: {
active: boolean;
onClick: () => void;
children: React.ReactNode;
}) {
return (
    <button
    onClick={onClick}
    className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
        active ? "bg-emerald-600 text-white" : "hover:bg-zinc-800 text-zinc-300"
    }`}
    >
    {children}
    </button>
);
}
