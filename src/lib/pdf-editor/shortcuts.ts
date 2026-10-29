// src/lib/pdf-editor/shortcuts.ts
// Global keyboard shortcuts for the PDF editor. Mounted once by PdfEditorApp.
// Uses `useEffect` + `keydown` capture so we don't conflict with textareas
// (which handle Enter / Escape / Backspace themselves).

"use client";

import { useEffect } from "react";
import { usePdfEditor } from "./store";

export function useEditorShortcuts(): void {
useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target && target.isContentEditable);

    const s = usePdfEditor.getState();
    const meta = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + Z / Y
    if (meta && !isTyping) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
        return;
        }
        if (
        e.key.toLowerCase() === "y" ||
        (e.key.toLowerCase() === "z" && e.shiftKey)
        ) {
        e.preventDefault();
        s.redo();
        return;
        }
    }

    if (isTyping) return; // typing beats everything else

    // Delete / Backspace
    if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedIds.length > 0) {
        e.preventDefault();
        s.deleteSelected();
        }
        return;
    }

    // Ctrl/Cmd + D duplicate
    if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
    }

    // Ctrl/Cmd + A select all on current page
    if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const ids = s.pageObjectIds[s.currentPage] ?? [];
        s.selectObjects(ids.slice());
        return;
    }

    // Ctrl/Cmd + F find
    if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault();
        s.setFindOpen(!s.findOpen);
        return;
    }

    // Escape
    if (e.key === "Escape") {
        s.clearSelection();
        s.selectTool("select");
        return;
    }

    // Zoom: Ctrl+0 fit page, Ctrl+1 fit width, Ctrl+ +/- zoom
    if (meta && e.key === "0") {
        e.preventDefault();
        s.setFitMode("page");
        return;
    }
    if (meta && e.key === "1") {
        e.preventDefault();
        s.setFitMode("width");
        return;
    }
    if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        s.setZoom(s.zoom * 1.15);
        return;
    }
    if (meta && e.key === "-") {
        e.preventDefault();
        s.setZoom(s.zoom / 1.15);
        return;
    }

    // Arrow keys: nudge selection
    if (s.selectedIds.length > 0) {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = step;
        else if (e.key === "ArrowDown") dy = -step;
        if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        s.commit("Nudge", (d) => {
            for (const id of s.selectedIds) {
            const o = d.objects[id];
            if (!o || o.locked) continue;
            d.objects[id] = {
                ...o,
                rect: { ...o.rect, x: o.rect.x + dx, y: o.rect.y + dy },
            };
            }
        });
        }
    }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
}, []);
}
