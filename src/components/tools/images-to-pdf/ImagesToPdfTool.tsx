// src/components/tools/images-to-pdf/ImagesToPdfTool.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  UploadCloud,
  FileImage,
  Loader2,
  Sparkles,
  Download,
  RotateCcw,
  AlertCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";
import type { ToolDefinition } from "@/lib/tools-registry";
import { ImageOrderList } from "./ImageOrderList";
import { PagePreviewStrip } from "./PagePreviewStrip";
import { ImagesToPdfOptionsPanel } from "./ImagesToPdfOptionsPanel";
import { generateImagesPdf } from "@/lib/images-to-pdf-generate";
import { type ImageItem, type ImagesToPdfOptions, DEFAULT_OPTIONS } from "./types";

interface ImagesToPdfToolProps {
  tool: ToolDefinition;
}

const MAX_FILES = 100;
const THUMB_MAX_PX = 240;

export function ImagesToPdfTool({ tool: _tool }: ImagesToPdfToolProps) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<ImagesToPdfOptions>(DEFAULT_OPTIONS);
  const [debouncedOptions, setDebouncedOptions] = useState<ImagesToPdfOptions>(DEFAULT_OPTIONS);

  // Status & Progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultPdf, setResultPdf] = useState<{ url: string; size: number; filename: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Debounce options updates for preview rendering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOptions(options);
    }, 150);
    return () => clearTimeout(timer);
  }, [options]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
      });
    };
  }, []);

  // Cleanup result PDF url
  useEffect(() => {
    return () => {
      if (resultPdf?.url) URL.revokeObjectURL(resultPdf.url);
    };
  }, [resultPdf]);

  // Helper to generate a small thumbnail efficiently
  const createThumbnail = async (
    file: File,
  ): Promise<{ thumbUrl: string; width: number; height: number }> => {
    if (typeof window === "undefined" || typeof createImageBitmap === "undefined") {
      return { thumbUrl: URL.createObjectURL(file), width: 800, height: 600 };
    }
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const origW = bmp.width;
    const origH = bmp.height;
    const scale = Math.min(1, THUMB_MAX_PX / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context failed");
    ctx.drawImage(bmp, 0, 0, targetW, targetH);
    bmp.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.75),
    );
    if (!blob) throw new Error("Failed to produce thumbnail blob");
    return { thumbUrl: URL.createObjectURL(blob), width: origW, height: origH };
  };

  // Process incoming files with concurrency pool of 3
  const addFiles = useCallback(async (files: File[]) => {
    setErrorMessage(null);
    const existingCount = itemsRef.current.length;
    const availableSlots = MAX_FILES - existingCount;
    if (availableSlots <= 0) {
      setErrorMessage(`Maximum limit of ${MAX_FILES} images reached.`);
      return;
    }

    const toProcess = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setErrorMessage(
        `Added ${availableSlots} images. ${files.length - availableSlots} files exceeded the ${MAX_FILES} limit.`,
      );
    }

    const newItems: ImageItem[] = [];
    const errors: string[] = [];

    // Process in batches of 3
    for (let i = 0; i < toProcess.length; i += 3) {
      const chunk = toProcess.slice(i, i + 3);
      await Promise.all(
        chunk.map(async (f) => {
          try {
            const { thumbUrl, width, height } = await createThumbnail(f);
            newItems.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              file: f,
              name: f.name,
              size: f.size,
              width,
              height,
              rotation: 0,
              thumbUrl,
            });
          } catch {
            errors.push(f.name);
          }
        }),
      );
    }

    if (errors.length > 0) {
      setErrorMessage(
        `Could not decode ${errors.length} file(s): ${errors.slice(0, 3).join(", ")}${
          errors.length > 3 ? "..." : ""
        }. Ensure formats are valid images.`,
      );
    }

    if (newItems.length > 0) {
      setItems((prev) => {
        const next = [...prev, ...newItems];
        if (!selectedId && next[0]) setSelectedId(next[0].id);
        return next;
      });
    }
  }, [selectedId]);

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const files: File[] = [];
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  const handleGenerate = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setProgressMsg("Preparing images...");
    setProgressPercent(0);
    setErrorMessage(null);

    abortRef.current = new AbortController();

    try {
      const { blob, size } = await generateImagesPdf(
        items,
        debouncedOptions,
        (current, total, msg) => {
          setProgressPercent(Math.round((current / total) * 100));
          setProgressMsg(msg);
        },
        abortRef.current.signal,
      );

      const url = URL.createObjectURL(blob);
      setResultPdf({
        url,
        size,
        filename: debouncedOptions.outputFilename || "images_combined.pdf",
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMessage("PDF generation was cancelled.");
      } else {
        const msg = err instanceof Error ? err.message : "PDF generation failed";
        setErrorMessage(msg);
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic"
        className="hidden"
        onChange={(e) => {
          const f = Array.from(e.target.files || []);
          if (f.length > 0) addFiles(f);
          e.target.value = "";
        }}
      />

      {/* Error alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: List, Upload, and Settings */}
        <div className="lg:col-span-7 space-y-6">
          {items.length === 0 ? (
            /* Empty state upload zone */
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = Array.from(e.dataTransfer.files || []);
                if (f.length > 0) addFiles(f);
              }}
              className="border-2 border-dashed border-border hover:border-primary/60 rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-colors bg-card/60 hover:bg-card flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center transition-transform group-hover:scale-105">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  Drop images here, paste from clipboard, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports JPG, PNG, WebP, GIF, BMP, AVIF, HEIC • Up to 100 images
                </p>
              </div>
              <Button type="button" size="sm" className="mt-2 pointer-events-none">
                Select Images
              </Button>
            </div>
          ) : (
            /* Uploaded list & controls */
            <>
              <ImageOrderList
                items={items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onItemsChange={setItems}
                onAddMore={() => fileInputRef.current?.click()}
              />

              <ImagesToPdfOptionsPanel
                options={options}
                onChange={setOptions}
                disabled={isProcessing}
              />

              {/* Progress panel during generation */}
              {isProcessing && (
                <div className="p-5 rounded-2xl border bg-card space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      {progressMsg}
                    </span>
                    <span className="font-mono">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Ready / Download Panel */}
              {resultPdf && !isProcessing && (
                <div className="p-5 rounded-2xl border border-green-500/30 bg-green-500/5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-green-500/20 text-green-600 dark:text-green-400 flex items-center justify-center">
                        <FileImage className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{resultPdf.filename}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {formatBytes(resultPdf.size)} • {items.length} pages
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={resultPdf.url}
                        download={resultPdf.filename}
                        className="inline-flex"
                      >
                        <Button className="gap-2 text-xs font-semibold">
                          <Download className="w-4 h-4" /> Download PDF
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResultPdf(null)}
                        className="text-xs gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Make Another
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Trigger Button */}
              {!resultPdf && (
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={isProcessing || items.length === 0}
                  className="w-full gap-2 font-semibold shadow-md text-sm"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Convert {items.length}{" "}
                      {items.length === 1 ? "Image" : "Images"} to PDF
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Right Column: Sticky Live Page Order Preview */}
        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <PagePreviewStrip
            items={items}
            selectedId={selectedId}
            options={debouncedOptions}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
