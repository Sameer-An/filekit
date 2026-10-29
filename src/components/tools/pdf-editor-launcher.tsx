// src/components/tools/pdf-editor-launcher.tsx
// Upload zone shown on /tools/pdf-editor. Hands the file to /pdf-editor via
// IndexedDB in a new tab. Falls back to same-tab navigation if the popup is
// blocked.

"use client";

import React, { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ToolDefinition } from "@/lib/tools-registry";
import { FileUploadZone } from "@/components/file-upload-zone";
import { saveHandoff } from "@/lib/pdf-editor/idb";

export function PdfEditorLauncher({ tool }: { tool: ToolDefinition }) {
const [importing, setImporting] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setImporting(true);

    // Open the new tab synchronously so the browser doesn't block it.
    const newTab = window.open("about:blank", "_blank");

    try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    await saveHandoff(bytes, file.name);
    if (newTab) {
        newTab.location.href = "/pdf-editor";
    } else {
        window.location.href = "/pdf-editor";
    }
    } catch (err) {
    console.error(err);
    if (newTab) newTab.close();
    setError(
        err instanceof Error
        ? err.message
        : "Could not hand the file to the editor.",
    );
    setImporting(false);
    }
};

return (
    <div className="space-y-4">
    <FileUploadZone
        accept={tool.inputFormats}
        onFilesSelected={handleFiles}
        disabled={importing}
    />
    {importing && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-card text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Opening the PDF editor in a new tab…
        </div>
    )}
    {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/40 bg-destructive/5 text-sm text-destructive">
        <AlertCircle className="w-4 h-4" />
        {error}
        </div>
    )}
    <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/40 border">
        The editor runs entirely in your browser. Files are never uploaded.
        Encrypted PDFs are not supported — remove the password first.
    </div>
    </div>
);
}
