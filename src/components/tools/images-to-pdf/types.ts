// src/components/tools/images-to-pdf/types.ts

import type {
  PageSizeId,
  OrientationId,
  MarginId,
  FitModeId,
} from "@/lib/images-to-pdf-layout";

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  thumbUrl: string;
}

export interface ImagesToPdfOptions {
  pageSize: PageSizeId;
  orientation: OrientationId;
  margin: MarginId;
  fit: FitModeId;
  backgroundColor: string;
  quality: "high" | "medium" | "low";
  outputFilename: string;
}

export const DEFAULT_OPTIONS: ImagesToPdfOptions = {
  pageSize: "a4",
  orientation: "auto",
  margin: "small",
  fit: "fit",
  backgroundColor: "#ffffff",
  quality: "high",
  outputFilename: "images_combined.pdf",
};
