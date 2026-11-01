// src/components/tools/images-to-pdf/ImagesToPdfOptionsPanel.tsx
"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { ImagesToPdfOptions } from "./types";
import type { PageSizeId, OrientationId, MarginId, FitModeId } from "@/lib/images-to-pdf-layout";

interface ImagesToPdfOptionsPanelProps {
  options: ImagesToPdfOptions;
  onChange: (options: ImagesToPdfOptions) => void;
  disabled?: boolean;
}

export function ImagesToPdfOptionsPanel({
  options,
  onChange,
  disabled,
}: ImagesToPdfOptionsPanelProps) {
  const updateOption = <K extends keyof ImagesToPdfOptions>(
    key: K,
    val: ImagesToPdfOptions[K],
  ) => {
    onChange({ ...options, [key]: val });
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl border bg-card space-y-4">
      <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
        PDF Page & Layout Settings
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        {/* Page Size */}
        <div className="space-y-1.5">
          <Label className="text-xs">Page Size</Label>
          <Select
            value={options.pageSize}
            onValueChange={(v) => updateOption("pageSize", v as PageSizeId)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit to Image</SelectItem>
              <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
              <SelectItem value="letter">Letter (8.5 × 11 in)</SelectItem>
              <SelectItem value="legal">Legal (8.5 × 14 in)</SelectItem>
              <SelectItem value="a3">A3 (297 × 420 mm)</SelectItem>
              <SelectItem value="a5">A5 (148 × 210 mm)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orientation */}
        <div className="space-y-1.5">
          <Label className="text-xs">Orientation</Label>
          <Select
            value={options.orientation}
            onValueChange={(v) => updateOption("orientation", v as OrientationId)}
            disabled={disabled || options.pageSize === "fit"}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (Match Image)</SelectItem>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Margins */}
        <div className="space-y-1.5">
          <Label className="text-xs">Margin</Label>
          <Select
            value={options.margin}
            onValueChange={(v) => updateOption("margin", v as MarginId)}
            disabled={disabled || options.pageSize === "fit"}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (0 pt)</SelectItem>
              <SelectItem value="small">Small (0.25 in)</SelectItem>
              <SelectItem value="medium">Medium (0.5 in)</SelectItem>
              <SelectItem value="large">Large (0.75 in)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Image Fit */}
        <div className="space-y-1.5">
          <Label className="text-xs">Image Fit</Label>
          <Select
            value={options.fit}
            onValueChange={(v) => updateOption("fit", v as FitModeId)}
            disabled={disabled || options.pageSize === "fit"}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit Inside (Contain)</SelectItem>
              <SelectItem value="fill">Fill Page (Cover)</SelectItem>
              <SelectItem value="stretch">Stretch to Fit</SelectItem>
              <SelectItem value="original">Original Size</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quality */}
        <div className="space-y-1.5">
          <Label className="text-xs">Compression Quality</Label>
          <Select
            value={options.quality}
            onValueChange={(v) => updateOption("quality", v as "high" | "medium" | "low")}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High Quality (92%)</SelectItem>
              <SelectItem value="medium">Medium Quality (75%)</SelectItem>
              <SelectItem value="low">Low Quality (50% - Smallest)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Background Color */}
        <div className="space-y-1.5">
          <Label className="text-xs">Background Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={options.backgroundColor}
              onChange={(e) => updateOption("backgroundColor", e.target.value)}
              disabled={disabled}
              className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-background"
            />
            <Input
              type="text"
              value={options.backgroundColor}
              onChange={(e) => updateOption("backgroundColor", e.target.value)}
              disabled={disabled}
              className="h-9 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Output Filename */}
      <div className="space-y-1.5 pt-1">
        <Label className="text-xs">Output PDF Name</Label>
        <Input
          type="text"
          value={options.outputFilename}
          onChange={(e) => updateOption("outputFilename", e.target.value)}
          placeholder="images_combined.pdf"
          disabled={disabled}
          className="h-9 text-xs"
        />
      </div>
    </div>
  );
}
