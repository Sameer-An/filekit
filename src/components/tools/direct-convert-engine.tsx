"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ToolDefinition } from "@/lib/tools-registry";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { ProcessingJob, createJob } from "@/lib/job-store";

const ENDPOINTS: Record<string, string> = {
"docx-to-pdf": "/api/convert/docx-to-pdf",
"pdf-to-docx": "/api/convert/pdf-to-docx",
};

export function DirectConvertEngine({ tool }: { tool: ToolDefinition }) {
const [file, setFile] = useState<File | null>(null);
const [job, setJob] = useState<ProcessingJob | null>(null);
const busy = job?.status === "processing";
const outExt = tool.outputFormats[0];

const reset = () => {
    if (job?.outputUrl) URL.revokeObjectURL(job.outputUrl);
    setFile(null);
    setJob(null);
};

const convert = async () => {
    if (!file) return;
    const base = createJob(file.name, file.size);
    setJob({
    ...base,
    status: "processing",
    progress: -1,
    message: "Converting…",
    });
    try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(ENDPOINTS[tool.id], { method: "POST", body });
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Conversion failed (${res.status})`);
    }
    const blob = await res.blob();
    setJob({
        ...base,
        status: "ready",
        progress: 100,
        message: "Done!",
        outputUrl: URL.createObjectURL(blob),
        outputFilename: `${file.name.replace(/\.[^/.]+$/, "")}.${outExt}`,
        outputSize: blob.size,
        completedAt: Date.now(),
    });
    } catch (err) {
    setJob({
        ...base,
        status: "failed",
        message: "Failed",
        error: err instanceof Error ? err.message : "Conversion failed",
    });
    }
};

return (
    <div className="space-y-6">
    <FileUploadZone
        accept={tool.inputFormats}
        maxSizeMB={tool.maxFileSizeMB || 50}
        onFilesSelected={(f) => {
        reset();
        setFile(f[0] ?? null);
        }}
        disabled={busy}
    />
    {file && job?.status !== "ready" && (
        <div className="p-4 rounded-xl border bg-card flex items-center justify-between gap-4">
        <span className="text-sm font-medium truncate">
            Ready: {file.name}
        </span>
        <Button
            size="lg"
            onClick={convert}
            disabled={busy}
            className="gap-2 px-6 font-semibold"
        >
            {busy ? (
            <>
                <Loader2 className="w-4 h-4 animate-spin" /> Converting…
            </>
            ) : (
            <>
                <Sparkles className="w-4 h-4" /> Convert to{" "}
                {outExt.toUpperCase()}
            </>
            )}
        </Button>
        </div>
    )}
    {job && <ProcessingPanel job={job} onReset={reset} />}
    </div>
);
}
