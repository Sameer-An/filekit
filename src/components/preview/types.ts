// src/components/preview/types.ts

export interface PreviewEffects {
  /** Rotation in degrees (e.g. 90, 180, 270) */
  rotateDeg?: number;
  /** Flip horizontally */
  flipH?: boolean;
  /** Flip vertically */
  flipV?: boolean;
  /** Brightness percentage (default 100) */
  brightness?: number;
  /** Contrast percentage (default 100) */
  contrast?: number;
  /** Saturation percentage (default 100) */
  saturation?: number;
  /** Grayscale percentage (0 - 100) */
  grayscale?: number;
  /** Target resize width */
  resizeWidth?: number;
  /** Target resize height */
  resizeHeight?: number;
  /** Target output format (png, jpg, webp, etc.) */
  targetFormat?: string;
  /** Quality percentage (0 - 100) */
  quality?: number;
  /** Crop coordinates in percentages (0 - 100) */
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  // PDF Overlays
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: "diagonal" | "center" | "top" | "bottom" | "tile";
  watermarkColor?: string;
  watermarkFontSize?: number;
  pageNumbers?: {
    position: "bottom-center" | "bottom-right" | "top-center" | "top-right";
    start: number;
    format: "numeric" | "roman-upper" | "roman-lower" | "alpha-upper" | "alpha-lower";
  };
  pdfRotation?: number;
}

export type FileCategory =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "document"
  | "other";

export interface PreviewPanelProps {
  files: File[];
  effects?: PreviewEffects;
  activeFileIndex?: number;
  onSelectFile?: (index: number) => void;
  className?: string;
  onRemoveFile?: (index: number) => void;
}
