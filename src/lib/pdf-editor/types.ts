// src/lib/pdf-editor/types.ts
// Shared types for the PDF Editor. All geometry in PDF points unless a `Px`
// suffix is explicitly present. Origin is bottom-left (matches pdf-lib).

export type Pt = number;
export type Px = number;

export interface PointPt {
  x: Pt;
  y: Pt;
}

export interface SizePt {
  w: Pt;
  h: Pt;
}

export interface RectPt {
  x: Pt;
  y: Pt;
  w: Pt;
  h: Pt;
}

export interface PageInfo {
  /**
   * SOURCE page in the original PDF (0-based). A duplicated page keeps the
   * index of the page it was copied from. `-1` means "inserted blank page".
   * NOTE: this is NOT the position in the editor; that is the array index.
   */
  index: number;
  /** Stable unique id of this page instance (survives reorder/duplicate). */
  uid?: string;
  /** Un-rotated, un-cropped page box width in points. */
  widthPt: Pt;
  /** Un-rotated, un-cropped page box height in points. */
  heightPt: Pt;
  /** Page rotation in degrees: 0 | 90 | 180 | 270. */
  rotation: 0 | 90 | 180 | 270;
}

/** The tools available in the ToolRail. */
export type ToolId =
  | "select"
  | "text"
  | "image"
  | "shape"
  | "draw"
  | "highlight"
  | "underline"
  | "strike"
  | "whiteout"
  | "redact"
  | "signature"
  | "link"
  | "note"
  | "stamp"
  | "checkmark";

export type FontFamilyId =
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Georgia"
  | "Courier New"
  | "Cambria"
  | "Garamond"
  | "Noto Sans";

export interface BaseObject {
  id: string;
  page: number;
  rect: RectPt;
  rotation: number;
  z: number;
  locked: boolean;
  opacity: number;
  deleted?: boolean;
  origRect?: RectPt;
}

/** A text run detected inside the original PDF. Editable via overlay. */
export interface TextRunObject extends BaseObject {
  kind: "text-run";
  /** True once the user has committed a change. Untouched runs are skipped on export. */
  dirty: boolean;
  /** Rendered text shown in the overlay. Updated when the user edits. */
  text: string;
  /** Original text, kept so we can revert. */
  originalText: string;
  /** Font name reported by pdfjs (`fontName`). */
  sourceFontName: string;
  /** Base font shown in the panel. */
  fontFamily: string;
  /** Whether we substituted the font on export. */
  substituted: boolean;
  fontSize: Pt;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Added for the strike text decoration. */
  strike?: boolean;
  color: string; // hex
  align: "left" | "center" | "right" | "justify";
  lineHeight: number;
  letterSpacing: Pt;
  /** Sampled background color for cover-up on export (hex). */
  backgroundColor: string;
}

/** An image detected inside the original PDF. */
export interface ImagePlacementObject extends BaseObject {
  kind: "image-placement";
  dirty: boolean;
  dataUrl: string | null;
  replacementDataUrl: string | null;
  naturalWidthPt: Pt;
  naturalHeightPt: Pt;
  /** Crop fractions (0 to 1) relative to the original image boundaries. */
  crop?: { l: number; t: number; r: number; b: number };
}

export interface OverlaySettings {
  header: string;
  footer: string;
  watermark: string;
  pageNumbers: boolean;
}

export interface NewTextObject extends BaseObject {
  kind: "new-text";
  text: string;
  fontFamily: string;
  fontSize: Pt;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Added for the strike text decoration. */
  strike?: boolean;
  color: string;
  align: "left" | "center" | "right" | "justify";
  lineHeight: number;
  letterSpacing: Pt;
}

export interface NewImageObject extends BaseObject {
  kind: "new-image";
  dataUrl: string;
}

export type ShapeKind =
  | "rect"
  | "rounded-rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle";

export interface ShapeObject extends BaseObject {
  kind: "shape";
  shape: ShapeKind;
  stroke: string;
  fill: string | null;
  strokeWidth: Pt;
}

export interface DrawStroke {
  /** Each point: [x, y, pressure] in rect-local PDF points (0..1 fraction optional). */
  points: Array<[Pt, Pt, number]>;
}

export interface DrawObject extends BaseObject {
  kind: "draw";
  stroke: string;
  strokeWidth: Pt;
  strokes: DrawStroke[];
}

export interface HighlightObject extends BaseObject {
  kind: "highlight";
  color: string;
}

export interface UnderlineObject extends BaseObject {
  kind: "underline";
  color: string;
  strokeWidth: Pt;
}

export interface StrikeObject extends BaseObject {
  kind: "strike";
  color: string;
  strokeWidth: Pt;
}

export interface WhiteoutObject extends BaseObject {
  kind: "whiteout";
  color: string;
}

export interface RedactObject extends BaseObject {
  kind: "redact";
  color: string;
}

export interface SignatureObject extends BaseObject {
  kind: "signature";
  /** PNG data URL of the signature drawn, typed or uploaded. */
  dataUrl: string;
}

export interface LinkObject extends BaseObject {
  kind: "link";
  href: string;
  color: string;
}

export interface NoteObject extends BaseObject {
  kind: "note";
  author: string;
  body: string;
  color: string;
}

export interface StampObject extends BaseObject {
  kind: "stamp";
  label: string;
  color: string;
}

export interface CheckmarkObject extends BaseObject {
  kind: "checkmark";
  color: string;
}

export type PDFObject =
  | TextRunObject
  | ImagePlacementObject
  | NewTextObject
  | NewImageObject
  | ShapeObject
  | DrawObject
  | HighlightObject
  | UnderlineObject
  | StrikeObject
  | WhiteoutObject
  | RedactObject
  | SignatureObject
  | LinkObject
  | NoteObject
  | StampObject
  | CheckmarkObject;

export type PDFObjectKind = PDFObject["kind"];

/** Actions applied to a page when the user reorders / rotates / deletes. */
export type PageOp =
  | { op: "move"; fromIndex: number; toIndex: number }
  | { op: "rotate"; index: number; delta: 90 | 180 | 270 }
  | { op: "delete"; index: number }
  | { op: "duplicate"; index: number }
  | { op: "insert-blank"; afterIndex: number; widthPt: Pt; heightPt: Pt }
  | { op: "extract"; indices: number[] }
  | { op: "merge"; appendedBytes: Uint8Array };

export type GridStyleId =
  | "square"
  | "dotted"
  | "horizontal"
  | "vertical"
  | "columns"
  | "isometric"
  | "margin-guides"
  | "rule-of-thirds"
  | "crosshair";

export type GridUnit = "px" | "mm" | "in";

export interface GridSettings {
  styleId: GridStyleId;
  cellSize: number;
  unit: GridUnit;
  rows: number | null; // null = derive from cell size
  columns: number | null;
  lineColor: string;
  lineThicknessPx: number;
  opacity: number;
  majorEvery: number; // 0 = no major lines
  offsetX: number;
  offsetY: number;
  snap: boolean;
  showContent: boolean;
}

export interface ExportOptions {
  pageRange: "all" | { from: number; to: number };
  flatten: boolean;
  compress: boolean;
  requestedPassword: string | null; // reserved; not wired in v1
}

export interface SessionSnapshot {
  fileName: string;
  originalBytes: Uint8Array;
  pages: PageInfo[];
  objects: Record<string, PDFObject>;
  pageObjectIds: string[][];
  zoom: number;
  currentPage: number;
  grid: GridSettings;
  overlays: OverlaySettings; // Added for persistence
  savedAt: number;
  /** Page uids whose text/images were already extracted (so deletes stick). */
  extractedUids?: string[];
}
