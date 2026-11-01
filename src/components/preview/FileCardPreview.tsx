// src/components/preview/FileCardPreview.tsx
"use client";

import React from "react";
import {
  FileText,
  FileCode,
  Film,
  Music,
  Archive,
  File,
  AlertCircle,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { FileCategory } from "./types";

interface FileCardPreviewProps {
  file: File;
  category: FileCategory;
  objectUrl: string | null;
}

export function FileCardPreview({
  file,
  category,
  objectUrl,
}: FileCardPreviewProps) {
  if (category === "video" && objectUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4 bg-zinc-950">
        <video
          src={objectUrl}
          controls
          className="max-w-full max-h-full rounded-lg shadow-md"
        >
          <track kind="captions" />
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (category === "audio" && objectUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 space-y-4 bg-card">
        <div className="p-4 rounded-full bg-primary/10 text-primary">
          <Music className="w-10 h-10" />
        </div>
        <div className="text-center space-y-1 max-w-sm">
          <p className="font-medium text-sm truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
        <audio src={objectUrl} controls className="w-full max-w-sm">
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  const renderIcon = () => {
    switch (category) {
      case "document":
        return <FileText className="w-12 h-12 text-blue-500" />;
      case "video":
        return <Film className="w-12 h-12 text-purple-500" />;
      case "audio":
        return <Music className="w-12 h-12 text-emerald-500" />;
      default:
        if (file.name.endsWith(".zip") || file.name.endsWith(".tar")) {
          return <Archive className="w-12 h-12 text-amber-500" />;
        }
        if (file.name.endsWith(".json") || file.name.endsWith(".html")) {
          return <FileCode className="w-12 h-12 text-cyan-500" />;
        }
        return <File className="w-12 h-12 text-muted-foreground" />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-card">
      <div className="p-5 rounded-2xl bg-muted/50 border border-border/80 shadow-xs space-y-3 max-w-sm w-full">
        <div className="flex justify-center">{renderIcon()}</div>
        <div className="space-y-1">
          <h4 className="font-semibold text-sm break-all">{file.name}</h4>
          <p className="text-xs text-muted-foreground">
            {file.type || "Unknown Type"} • {formatBytes(file.size)}
          </p>
        </div>
        <div className="pt-2 text-[11px] text-muted-foreground border-t border-border/60">
          Preview is available for Images, PDFs, Audio, and Video files.
        </div>
      </div>
    </div>
  );
}

export function ErrorPreview({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="w-full h-full grid place-items-center p-6 text-center bg-card">
      <div className="space-y-3 max-w-sm">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h4 className="font-semibold text-sm">Preview Unavailable</h4>
        <p className="text-xs text-muted-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
