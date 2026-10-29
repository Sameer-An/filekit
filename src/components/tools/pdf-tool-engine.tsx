"use client";
import React, { useState } from "react";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import {
  FileText,
  Download,
  RotateCw,
  Stamp,
  Hash,
  Scissors,
  Merge,
  Lock,
  Info,
  Eye,
  Check,
  Loader2,
  Sparkles,
  FileImage,
  Sliders,
  Minimize2,
  Copy,
  FileCode,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Image as ImageIcon,
  Type,
  Palette,
  Layers,
  Grid,
  Shuffle,
  PenLine,
  X,
} from "lucide-react";
import { ToolDefinition } from "@/lib/tools-registry";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ProcessingJob, createJob } from "@/lib/job-store";
import { downloadBlob, formatBytes, uint8ArrayToBlob } from "@/lib/utils";
import { extractPdfText } from "@/lib/pdf-text-extractor";
import { canvasesToPdf, canvasToBlob, renderPdfPages } from "@/lib/pdf-pages";
import { fileToJpegBytes } from "@/lib/image-ops";

/* ──────────────────────────── Helpers (module scope) ──────────────────────────── */

function toRoman(num: number): string {
  const map: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) {
    while (num >= v) {
      out += s;
      num -= v;
    }
  }
  return out;
}

function toAlpha(num: number): string {
  let s = "";
  while (num > 0) {
    num -= 1;
    s = String.fromCharCode(65 + (num % 26)) + s;
    num = Math.floor(num / 26);
  }
  return s;
}

function formatPageLabel(num: number, total: number, format: string): string {
  if (format === "roman-upper") return toRoman(num);
  if (format === "roman-lower") return toRoman(num).toLowerCase();
  if (format === "alpha-upper") return toAlpha(num);
  if (format === "alpha-lower") return toAlpha(num).toLowerCase();
  return `Page ${num} of ${total}`;
}

/** Parse "1-3, 5, 7-9" → sorted unique 1-based page numbers (clamped to maxPage). */
function parseRanges(input: string, maxPage: number): number[] {
  const pages = new Set<number>();
  if (!input || !input.trim()) return [];
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [a, b] = trimmed.split("-").map((s) => parseInt(s.trim(), 10));
      if (!isNaN(a) && !isNaN(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(maxPage, Math.max(a, b));
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n >= 1 && n <= maxPage) pages.add(n);
    }
  }
  return Array.from(pages).sort((x, y) => x - y);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full || "000000", 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

const OCR_LANGUAGES = [
  { code: "eng", name: "English" },
  { code: "spa", name: "Spanish" },
  { code: "fra", name: "French" },
  { code: "deu", name: "German" },
  { code: "ita", name: "Italian" },
  { code: "por", name: "Portuguese" },
  { code: "rus", name: "Russian" },
  { code: "ara", name: "Arabic" },
  { code: "hin", name: "Hindi" },
  { code: "chi_sim", name: "Chinese (Simplified)" },
  { code: "jpn", name: "Japanese" },
  { code: "kor", name: "Korean" },
];

/* ──────────────────────────── Component ──────────────────────────── */

export function PdfToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);

  /* Compress */
  const [compressLevel, setCompressLevel] = useState<
    "recommended" | "extreme" | "low" | "custom"
  >("recommended");
  const [targetSizeVal, setTargetSizeVal] = useState<string>("500");
  const [targetSizeUnit, setTargetSizeUnit] = useState<"KB" | "MB">("KB");
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [removeMetadata, setRemoveMetadata] = useState<boolean>(true);
  const [customQuality, setCustomQuality] = useState<number>(0.55);
  const [customScale, setCustomScale] = useState<number>(0.9);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    compressedSize: number;
    savingsPct: number;
  } | null>(null);

  /* Rotate */
  const [rotateAngle, setRotateAngle] = useState<"90" | "180" | "270">("90");
  const [rotateScope, setRotateScope] = useState<"all" | "selected">("all");
  const [rotatePages, setRotatePages] = useState<string>("");

  /* Split */
  const [splitMode, setSplitMode] = useState<
    "extract" | "each" | "ranges" | "chunks"
  >("extract");
  const [pageRange, setPageRange] = useState<string>("1");
  const [chunkSize, setChunkSize] = useState<string>("10");

  /* Watermark */
  const [watermarkText, setWatermarkText] = useState<string>("CONFIDENTIAL");
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.3);
  const [watermarkPosition, setWatermarkPosition] = useState<
    "diagonal" | "center" | "top" | "bottom" | "tile"
  >("diagonal");
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(44);
  const [watermarkColor, setWatermarkColor] = useState<string>("#999999");
  const [watermarkImageFile, setWatermarkImageFile] = useState<File | null>(
    null,
  );
  const [watermarkImageScale, setWatermarkImageScale] = useState<number>(0.5);

  /* Page numbers */
  const [numberPosition, setNumberPosition] = useState<
    "bottom-center" | "bottom-right" | "top-center" | "top-right"
  >("bottom-center");
  const [pageNumStart, setPageNumStart] = useState<number>(1);
  const [pageNumFormat, setPageNumFormat] = useState<
    "numeric" | "roman-upper" | "roman-lower" | "alpha-upper" | "alpha-lower"
  >("numeric");

  /* Metadata */
  const [metaTitle, setMetaTitle] = useState<string>("");
  const [metaAuthor, setMetaAuthor] = useState<string>("");
  const [metaSubject, setMetaSubject] = useState<string>("");
  const [metaKeywords, setMetaKeywords] = useState<string>("");
  const [clearMetadataOnSave, setClearMetadataOnSave] =
    useState<boolean>(false);

  /* Protect */
  const [password, setPassword] = useState<string>("");

  /* Reorder */
  const [pageOrder, setPageOrder] = useState<string>("");

  /* To-images */
  const [imageFormat, setImageFormat] = useState<"jpg" | "png">("jpg");
  const [imageQuality, setImageQuality] = useState<number>(0.92);
  const [imageScale, setImageScale] = useState<number>(1.8);
  const [imagePageRange, setImagePageRange] = useState<string>("");

  /* OCR */
  const [ocrLanguage, setOcrLanguage] = useState<string>("eng");

  /* Extracted text preview */
  const [extractedText, setExtractedText] = useState<string>("");
  const [extractedStats, setExtractedStats] = useState<{
    words: number;
    chars: number;
    pages: number;
  } | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const isMulti = tool.id === "pdf-merge" || tool.id === "images-to-pdf";

  /* ───────────── File handlers ───────────── */

  const handleFiles = async (selected: File[]) => {
    setFiles(selected);
    setCompressionStats(null);
    setExtractedText("");
    setExtractedStats(null);

    if (selected.length > 0) {
      setJob(createJob(selected[0].name, selected[0].size));

      if (tool.id === "pdf-compress") {
        const halfSizeKB = Math.max(
          Math.round((selected[0].size / 1024) * 0.5),
          50,
        );
        setTargetSizeVal(halfSizeKB.toString());
        setTargetSizeUnit("KB");
      }

      if (tool.id === "pdf-metadata" || tool.id === "pdf-reorder") {
        try {
          const buf = await selected[0].arrayBuffer();
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
          setMetaTitle(doc.getTitle() || "");
          setMetaAuthor(doc.getAuthor() || "");
          setMetaSubject(doc.getSubject() || "");
          setMetaKeywords((doc.getKeywords() || "").toString());
          const count = doc.getPageCount();
          setPageOrder(
            Array.from({ length: count }, (_, i) => i + 1).join(", "),
          );
        } catch {
          /* ignore */
        }
      }
    } else {
      setJob(null);
    }
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    setFiles((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /* ───────────── Processing ───────────── */

  const processPdf = async () => {
    if (!files || files.length === 0) return;
    const file = files[0];

    setJob((prev) =>
      prev
        ? {
            ...prev,
            status: "processing",
            progress: 20,
            message: "Processing PDF…",
          }
        : null,
    );

    try {
      let outputBlob: Blob;
      let outputName = `${file.name.replace(/\.[^/.]+$/, "")}_processed.pdf`;

      /* ─── 1. COMPRESS ─────────────────────────────────────────────── */
      if (tool.id === "pdf-compress") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                progress: 25,
                message: "Rendering pages for compression…",
              }
            : null,
        );
        const originalSize = file.size;
        const originalBuf = await file.arrayBuffer();
        const initialScale =
          compressLevel === "custom"
            ? customScale
            : compressLevel === "extreme"
              ? 0.7
              : compressLevel === "low"
                ? 1.1
                : 0.9;
        const initialQuality =
          compressLevel === "custom"
            ? customQuality
            : compressLevel === "extreme"
              ? 0.42
              : compressLevel === "recommended"
                ? 0.62
                : 0.82;
        let bytes: Uint8Array;
        try {
          const pages = await renderPdfPages(
            originalBuf.slice(0),
            initialScale,
          );
          setJob((prev) =>
            prev
              ? { ...prev, progress: 70, message: "Encoding compressed pages…" }
              : null,
          );
          bytes = await canvasesToPdf(pages, initialQuality, grayscale);
          if (compressLevel === "custom") {
            const target =
              (Number(targetSizeVal) || 500) *
              (targetSizeUnit === "MB" ? 1024 * 1024 : 1024);
            let q = initialQuality;
            for (let i = 0; i < 4 && bytes.length > target && q > 0.25; i++) {
              q -= 0.1;
              bytes = await canvasesToPdf(pages, q, grayscale);
            }
          }
        } catch {
          const pdfDoc = await PDFDocument.load(originalBuf, {
            ignoreEncryption: true,
          });
          if (removeMetadata) {
            pdfDoc.setTitle("");
            pdfDoc.setAuthor("");
            pdfDoc.setSubject("");
            pdfDoc.setKeywords([]);
          }
          bytes = await pdfDoc.save({ useObjectStreams: true });
        }
        outputBlob = uint8ArrayToBlob(bytes, "application/pdf");
        outputName = `${file.name.replace(/\.[^/.]+$/, "")}_compressed.pdf`;
        const compressedSize = outputBlob.size;
        setCompressionStats({
          originalSize,
          compressedSize,
          savingsPct: Math.max(
            0,
            Math.round(((originalSize - compressedSize) / originalSize) * 100),
          ),
        });
      } else if (tool.id === "pdf-to-text") {

      /* ─── 2. TO TEXT ──────────────────────────────────────────────── */
        setJob((prev) =>
          prev ? { ...prev, progress: 50, message: "Extracting text…" } : null,
        );
        const buf = await file.arrayBuffer();
        const extraction = await extractPdfText(buf);
        setExtractedText(extraction.fullText);
        setExtractedStats({
          words: extraction.wordCount,
          chars: extraction.charCount,
          pages: extraction.pageCount,
        });
        outputBlob = new Blob([extraction.fullText], {
          type: "text/plain;charset=utf-8",
        });
        outputName = `${file.name.replace(/\.[^/.]+$/, "")}_extracted.txt`;
      } else if (tool.id === "pdf-ocr") {

      /* ─── 3. OCR ──────────────────────────────────────────────────── */
        setJob((prev) =>
          prev
            ? { ...prev, progress: 20, message: "Rendering scanned pages…" }
            : null,
        );
        const buf = await file.arrayBuffer();
        const pages = await renderPdfPages(buf, 1.6);
        const Tesseract = (await import("tesseract.js")).default;
        const chunks: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  progress: 25 + Math.round(((i + 1) / pages.length) * 60),
                  message: `OCR page ${i + 1} of ${pages.length} (${ocrLanguage})…`,
                }
              : null,
          );
          const { data } = await Tesseract.recognize(
            pages[i].canvas,
            ocrLanguage,
          );
          chunks.push(`--- Page ${i + 1} ---\n${data.text.trim()}`);
        }
        const fullText = chunks.join("\n\n");
        setExtractedText(fullText);
        setExtractedStats({
          words: fullText.split(/\s+/).filter(Boolean).length,
          chars: fullText.length,
          pages: pages.length,
        });
        outputBlob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
        outputName = `${file.name.replace(/\.[^/.]+$/, "")}_ocr.txt`;
      } else if (tool.id === "pdf-to-images") {

      /* ─── 4. TO IMAGES ────────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const allPages = await renderPdfPages(buf, imageScale);
        const totalPages = allPages.length;

        let indices = Array.from({ length: totalPages }, (_, i) => i);
        if (imagePageRange.trim()) {
          const parsed = parseRanges(imagePageRange, totalPages);
          if (parsed.length > 0) indices = parsed.map((n) => n - 1);
        }

        const zip = new JSZip();
        const mime = imageFormat === "png" ? "image/png" : "image/jpeg";
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k];
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  progress: Math.round(((k + 1) / indices.length) * 90),
                  message: `Exporting page ${i + 1}…`,
                }
              : null,
          );
          const blob = await canvasToBlob(
            allPages[i].canvas,
            mime,
            imageQuality,
          );
          zip.file(
            `page-${String(i + 1).padStart(3, "0")}.${imageFormat}`,
            blob,
          );
        }
        outputBlob = await zip.generateAsync({ type: "blob" });
        outputName = `${file.name.replace(/\.[^/.]+$/, "")}_pages.zip`;
      } else if (tool.id === "pdf-reorder") {

      /* ─── 5. REORDER ──────────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const total = doc.getPageCount();
        const order = parseRanges(pageOrder.replace(/-/g, "-"), total);
        if (order.length === 0)
          throw new Error(
            "Enter a page order such as 3, 1, 2 (or 1-5 for ranges).",
          );
        const newDoc = await PDFDocument.create();
        const copied = await newDoc.copyPages(
          doc,
          order.map((n) => n - 1),
        );
        copied.forEach((p) => newDoc.addPage(p));
        outputBlob = uint8ArrayToBlob(
          await newDoc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `reordered_${file.name}`;
      } else if (tool.id === "pdf-merge") {

      /* ─── 6. MERGE ────────────────────────────────────────────────── */
        if (files.length < 2)
          throw new Error("Please select at least 2 PDF files to merge.");
        const mergedDoc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  progress: Math.round(((i + 1) / files.length) * 85),
                  message: `Merging file ${i + 1} of ${files.length}…`,
                }
              : null,
          );
          const buf = await files[i].arrayBuffer();
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
          const copied = await mergedDoc.copyPages(doc, doc.getPageIndices());
          copied.forEach((p) => mergedDoc.addPage(p));
        }
        outputBlob = uint8ArrayToBlob(
          await mergedDoc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `merged_${Date.now()}.pdf`;
      } else if (tool.id === "images-to-pdf") {

      /* ─── 7. IMAGES TO PDF ────────────────────────────────────────── */
        const pdfDoc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  progress: Math.round(((i + 1) / files.length) * 85),
                  message: `Embedding image ${i + 1}…`,
                }
              : null,
          );
          const jpgBytes = await fileToJpegBytes(files[i], 0.92);
          const img = await pdfDoc.embedJpg(jpgBytes);
          const page = pdfDoc.addPage([img.width, img.height]);
          page.drawImage(img, {
            x: 0,
            y: 0,
            width: img.width,
            height: img.height,
          });
        }
        outputBlob = uint8ArrayToBlob(
          await pdfDoc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `images_combined_${Date.now()}.pdf`;
      } else if (tool.id === "pdf-split") {

      /* ─── 8. SPLIT (4 modes) ──────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const total = doc.getPageCount();
        const baseName = file.name.replace(/\.[^/.]+$/, "");

        const makeSubDoc = async (indices: number[]): Promise<Blob> => {
          const newDoc = await PDFDocument.create();
          const copied = await newDoc.copyPages(doc, indices);
          copied.forEach((p) => newDoc.addPage(p));
          return uint8ArrayToBlob(
            await newDoc.save({ useObjectStreams: true }),
            "application/pdf",
          );
        };

        if (splitMode === "extract") {
          const pagesToKeep = parseRanges(pageRange, total);
          if (pagesToKeep.length === 0)
            throw new Error("Enter at least one valid page (e.g. 1, 3, 5-7).");
          outputBlob = await makeSubDoc(pagesToKeep.map((p) => p - 1));
          outputName = `split_pages_${pagesToKeep.join("-")}_${file.name}`;
        } else if (splitMode === "each") {
          const zip = new JSZip();
          for (let i = 0; i < total; i++) {
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    progress: Math.round(((i + 1) / total) * 90),
                    message: `Extracting page ${i + 1}…`,
                  }
                : null,
            );
            zip.file(
              `page-${String(i + 1).padStart(3, "0")}.pdf`,
              await makeSubDoc([i]),
            );
          }
          outputBlob = await zip.generateAsync({ type: "blob" });
          outputName = `${baseName}_pages.zip`;
        } else if (splitMode === "ranges") {
          const rawRanges = pageRange
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean);
          if (rawRanges.length === 0)
            throw new Error("Enter ranges like 1-3, 4-6, 7-10.");
          const zip = new JSZip();
          for (let i = 0; i < rawRanges.length; i++) {
            const parsed = parseRanges(rawRanges[i], total);
            if (parsed.length === 0) continue;
            zip.file(
              `range-${i + 1}_pages-${parsed[0]}-${parsed[parsed.length - 1]}.pdf`,
              await makeSubDoc(parsed.map((n) => n - 1)),
            );
          }
          outputBlob = await zip.generateAsync({ type: "blob" });
          outputName = `${baseName}_ranges.zip`;
        } else {
          const size = Math.max(1, parseInt(chunkSize, 10) || 10);
          const zip = new JSZip();
          let chunkIdx = 1;
          for (let i = 0; i < total; i += size) {
            const end = Math.min(i + size, total);
            const indices = Array.from({ length: end - i }, (_, k) => i + k);
            zip.file(
              `chunk-${chunkIdx}_pages-${i + 1}-${end}.pdf`,
              await makeSubDoc(indices),
            );
            chunkIdx++;
          }
          outputBlob = await zip.generateAsync({ type: "blob" });
          outputName = `${baseName}_chunks.zip`;
        }
      } else if (tool.id === "pdf-rotate") {

      /* ─── 9. ROTATE ───────────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const angle = parseInt(rotateAngle, 10);

        let targets: ReturnType<typeof doc.getPages>[number][];
        if (rotateScope === "selected") {
          const parsed = parseRanges(rotatePages, doc.getPageCount());
          if (parsed.length === 0)
            throw new Error("Enter pages to rotate (e.g. 1, 3, 5-7).");
          targets = parsed.map((n) => doc.getPage(n - 1));
        } else {
          targets = doc.getPages();
        }
        targets.forEach((p) => {
          const current = p.getRotation().angle;
          p.setRotation(degrees((current + angle) % 360));
        });
        outputBlob = uint8ArrayToBlob(
          await doc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `rotated_${angle}deg_${file.name}`;
      } else if (tool.id === "pdf-watermark") {

      /* ─── 10. WATERMARK ──────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const pages = doc.getPages();
        const { r, g, b } = hexToRgb(watermarkColor);
        const color = rgb(r, g, b);

        let embeddedWatermark: Awaited<ReturnType<typeof doc.embedJpg>> | null =
          null;
        if (watermarkImageFile) {
          const imgBytes = await watermarkImageFile.arrayBuffer();
          embeddedWatermark =
            watermarkImageFile.type === "image/png"
              ? await doc.embedPng(imgBytes)
              : await doc.embedJpg(imgBytes);
        }

        pages.forEach((page) => {
          const { width, height } = page.getSize();

          if (embeddedWatermark) {
            const scale =
              Math.min(
                width / embeddedWatermark.width,
                height / embeddedWatermark.height,
              ) * watermarkImageScale;
            const w = embeddedWatermark.width * scale;
            const h = embeddedWatermark.height * scale;
            page.drawImage(embeddedWatermark, {
              x: (width - w) / 2,
              y: (height - h) / 2,
              width: w,
              height: h,
              opacity: watermarkOpacity,
            });
            return;
          }

          const text = watermarkText || "CONFIDENTIAL";
          const fs = watermarkFontSize;

          if (watermarkPosition === "tile") {
            const textWidth = font.widthOfTextAtSize(text, fs);
            const spacingX = textWidth + fs * 2;
            const spacingY = fs * 3;
            const cols = Math.ceil(width / spacingX) + 1;
            const rows = Math.ceil(height / spacingY) + 1;
            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                page.drawText(text, {
                  x: col * spacingX - textWidth / 2,
                  y: row * spacingY,
                  size: fs,
                  font,
                  color,
                  opacity: watermarkOpacity,
                });
              }
            }
            return;
          }

          if (watermarkPosition === "diagonal") {
            page.drawText(text, {
              x: width / 4,
              y: height / 2,
              size: fs,
              font,
              color,
              opacity: watermarkOpacity,
              rotate: degrees(45),
            });
            return;
          }

          const textWidth = font.widthOfTextAtSize(text, fs);
          const x = (width - textWidth) / 2;
          let y = height / 2;
          if (watermarkPosition === "top") y = height - fs - 20;
          if (watermarkPosition === "bottom") y = 20;
          page.drawText(text, {
            x,
            y,
            size: fs,
            font,
            color,
            opacity: watermarkOpacity,
          });
        });

        outputBlob = uint8ArrayToBlob(
          await doc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `watermarked_${file.name}`;
      } else if (tool.id === "pdf-page-numbers") {

      /* ─── 11. PAGE NUMBERS ───────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const total = doc.getPageCount();

        doc.getPages().forEach((page, i) => {
          const { width, height } = page.getSize();
          const num = pageNumStart + i;
          const text = formatPageLabel(num, total, pageNumFormat);
          const textWidth = font.widthOfTextAtSize(text, 10);

          let x = (width - textWidth) / 2;
          let y = 20;
          if (numberPosition === "bottom-right") {
            x = width - textWidth - 20;
            y = 20;
          } else if (numberPosition === "top-center") {
            y = height - 25;
          } else if (numberPosition === "top-right") {
            x = width - textWidth - 20;
            y = height - 25;
          }

          page.drawText(text, {
            x,
            y,
            size: 10,
            font,
            color: rgb(0.3, 0.3, 0.3),
          });
        });

        outputBlob = uint8ArrayToBlob(
          await doc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `numbered_${file.name}`;
      } else if (tool.id === "pdf-metadata") {

      /* ─── 12. METADATA ───────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });

        if (clearMetadataOnSave) {
          doc.setTitle("");
          doc.setAuthor("");
          doc.setSubject("");
          doc.setKeywords([]);
        } else {
          if (metaTitle) doc.setTitle(metaTitle);
          if (metaAuthor) doc.setAuthor(metaAuthor);
          if (metaSubject) doc.setSubject(metaSubject);
          if (metaKeywords) {
            doc.setKeywords(
              metaKeywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            );
          }
        }
        doc.setProducer("FileKit");
        doc.setModificationDate(new Date());

        outputBlob = uint8ArrayToBlob(
          await doc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `metadata_updated_${file.name}`;
      } else if (tool.id === "pdf-protect") {

      /* ─── 13. PROTECT ────────────────────────────────────────────── */
        if (!password.trim())
          throw new Error("Enter a password to encrypt this PDF.");
        const form = new FormData();
        form.append("file", file);
        form.append("password", password);
        const res = await fetch("/api/pdf/protect", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Encryption failed" }));
          throw new Error(
            err.error || "PDF encryption failed. Install qpdf on the server.",
          );
        }
        outputBlob = await res.blob();
        outputName = `protected_${file.name}`;
      } else {

      /* ─── 15. FALLBACK ───────────────────────────────────────────── */
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        outputBlob = uint8ArrayToBlob(
          await doc.save({ useObjectStreams: true }),
          "application/pdf",
        );
        outputName = `processed_${file.name}`;
      }

      const outputUrl = URL.createObjectURL(outputBlob);
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "ready",
              progress: 100,
              message: "Complete!",
              outputUrl,
              outputFilename: outputName,
              outputSize: outputBlob.size,
              completedAt: Date.now(),
            }
          : null,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Processing failed";
      setJob((prev) =>
        prev
          ? { ...prev, status: "failed", error: message, message: "Failed" }
          : null,
      );
    }
  };

  const copyExtractedText = () => {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  /* ───────────── UI ───────────── */

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={isMulti}
        maxSizeMB={tool.maxFileSizeMB || 200}
        onFilesSelected={handleFiles}
        label={`Drop ${tool.inputFormats.map((f) => f.toUpperCase()).join("/")} here or click to browse`}
        disabled={job?.status === "processing"}
      />

      {files.length > 0 && job?.status !== "ready" && (
        <div className="p-6 rounded-2xl border bg-card shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" /> Configuration &
              Options
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              Input: {files[0]?.name} ({formatBytes(files[0]?.size || 0)})
            </span>
          </div>

          {/* ── COMPRESS ── */}
          {tool.id === "pdf-compress" && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Compression Level</Label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    {
                      id: "extreme",
                      title: "Extreme",
                      desc: "Max savings (~75%)",
                      badge: "Smallest",
                    },
                    {
                      id: "recommended",
                      title: "Recommended",
                      desc: "Balanced (~50%)",
                      badge: "Optimal",
                    },
                    {
                      id: "low",
                      title: "Low",
                      desc: "High Quality (~25%)",
                      badge: "Crisp",
                    },
                    {
                      id: "custom",
                      title: "Target Size",
                      desc: "Custom KB/MB",
                      badge: "Precise",
                    },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setCompressLevel(preset.id as typeof compressLevel)
                      }
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        compressLevel === preset.id
                          ? "border-primary ring-2 ring-primary/20 bg-primary/5 dark:bg-primary/10"
                          : "hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-foreground">
                          {preset.title}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {preset.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {compressLevel === "custom" && (
                <div className="p-4 rounded-xl border bg-muted/30 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Target File Size
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="10"
                        max="100000"
                        value={targetSizeVal}
                        onChange={(e) => setTargetSizeVal(e.target.value)}
                        placeholder="e.g. 500"
                        className="max-w-[140px] font-mono text-base"
                      />
                      <Select
                        value={targetSizeUnit}
                        onValueChange={(v: "KB" | "MB") => setTargetSizeUnit(v)}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="KB">KB</SelectItem>
                          <SelectItem value="MB">MB</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">
                        Quick presets:
                      </span>
                      {["200", "500", "1000", "2000"].map((val) => (
                        <Button
                          key={val}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTargetSizeVal(val);
                            setTargetSizeUnit("KB");
                          }}
                          className="h-7 text-xs font-mono"
                        >
                          {parseInt(val) >= 1000
                            ? `${parseInt(val) / 1000} MB`
                            : `${val} KB`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs">Image Quality</Label>
                        <span className="text-xs font-mono">
                          {Math.round(customQuality * 100)}%
                        </span>
                      </div>
                      <Slider
                        min={0.3}
                        max={0.95}
                        step={0.05}
                        value={[customQuality]}
                        onValueChange={([v]) => setCustomQuality(v)}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-xs">Page Resolution Scale</Label>
                        <span className="text-xs font-mono">
                          {customScale.toFixed(1)}×
                        </span>
                      </div>
                      <Slider
                        min={0.5}
                        max={1.5}
                        step={0.1}
                        value={[customScale]}
                        onValueChange={([v]) => setCustomScale(v)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <Label className="font-medium text-sm">
                      Convert to Grayscale
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Compresses color documents up to 80% more
                    </p>
                  </div>
                  <Switch checked={grayscale} onCheckedChange={setGrayscale} />
                </div>
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <Label className="font-medium text-sm">
                      Strip Unused Metadata
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Removes redundant tags, thumbnails &amp; history
                    </p>
                  </div>
                  <Switch
                    checked={removeMetadata}
                    onCheckedChange={setRemoveMetadata}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── ROTATE ── */}
          {tool.id === "pdf-rotate" && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Rotation Angle</Label>
                <Select
                  value={rotateAngle}
                  onValueChange={(v: "90" | "180" | "270") => setRotateAngle(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90° Clockwise</SelectItem>
                    <SelectItem value="180">180° Half Turn</SelectItem>
                    <SelectItem value="270">270° Counter-Clockwise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Apply To</Label>
                <Select
                  value={rotateScope}
                  onValueChange={(v: "all" | "selected") => setRotateScope(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All pages</SelectItem>
                    <SelectItem value="selected">
                      Selected pages only
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rotateScope === "selected" && (
                <div className="space-y-2">
                  <Label>Pages to rotate</Label>
                  <Input
                    value={rotatePages}
                    onChange={(e) => setRotatePages(e.target.value)}
                    placeholder="e.g. 1, 3, 5-7"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── SPLIT ── */}
          {tool.id === "pdf-split" && (
            <div className="space-y-4 max-w-lg">
              <div className="space-y-2">
                <Label>Split Mode</Label>
                <Select
                  value={splitMode}
                  onValueChange={(v: typeof splitMode) => setSplitMode(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extract">
                      Extract pages → one PDF
                    </SelectItem>
                    <SelectItem value="each">Split each page → ZIP</SelectItem>
                    <SelectItem value="ranges">
                      Split by ranges → ZIP
                    </SelectItem>
                    <SelectItem value="chunks">
                      Split into chunks of N pages → ZIP
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(splitMode === "extract" || splitMode === "ranges") && (
                <div className="space-y-2">
                  <Label>
                    {splitMode === "extract"
                      ? "Pages to extract (e.g. 1, 3, 5-7)"
                      : "Ranges, one per output file (e.g. 1-3, 4-6, 7-10)"}
                  </Label>
                  <Input
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder="1-3, 4-6"
                  />
                </div>
              )}
              {splitMode === "chunks" && (
                <div className="space-y-2">
                  <Label>Pages per chunk</Label>
                  <Input
                    type="number"
                    min="1"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── REORDER ── */}
          {tool.id === "pdf-reorder" && (
            <div className="space-y-2 max-w-md">
              <Label>
                New page order (supports ranges, e.g. 3, 1, 2 or 1-5, 8, 6-7)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={pageOrder}
                  onChange={(e) => setPageOrder(e.target.value)}
                  placeholder="3, 1, 2"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    setPageOrder((prev) =>
                      prev
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .reverse()
                        .join(", "),
                    )
                  }
                >
                  <Shuffle className="w-3.5 h-3.5" /> Reverse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Omitted pages are dropped from the output.
              </p>
            </div>
          )}

          {/* ── MERGE (file list) ── */}
          {tool.id === "pdf-merge" && files.length > 1 && (
            <div className="space-y-2">
              <Label>File Order (drag-free — use arrows)</Label>
              <div className="space-y-1.5">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
                  >
                    <span className="text-xs font-mono w-6 text-center text-muted-foreground">
                      {idx + 1}
                    </span>
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-xs flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(f.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveFile(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveFile(idx, 1)}
                      disabled={idx === files.length - 1}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500"
                      onClick={() => removeFile(idx)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TO IMAGES ── */}
          {tool.id === "pdf-to-images" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-2">
                <Label>Image format</Label>
                <Select
                  value={imageFormat}
                  onValueChange={(v: "jpg" | "png") => setImageFormat(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpg">JPG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pages (blank = all)</Label>
                <Input
                  value={imagePageRange}
                  onChange={(e) => setImagePageRange(e.target.value)}
                  placeholder="1-3, 5"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Quality</Label>
                  <span className="text-xs font-mono">
                    {Math.round(imageQuality * 100)}%
                  </span>
                </div>
                <Slider
                  min={0.5}
                  max={1}
                  step={0.05}
                  value={[imageQuality]}
                  onValueChange={([v]) => setImageQuality(v)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Render scale</Label>
                  <span className="text-xs font-mono">
                    {imageScale.toFixed(1)}×
                  </span>
                </div>
                <Slider
                  min={1}
                  max={3}
                  step={0.2}
                  value={[imageScale]}
                  onValueChange={([v]) => setImageScale(v)}
                />
              </div>
            </div>
          )}

          {/* ── OCR ── */}
          {tool.id === "pdf-ocr" && (
            <div className="space-y-2 max-w-xs">
              <Label>OCR Language</Label>
              <Select value={ocrLanguage} onValueChange={setOcrLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCR_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── WATERMARK ── */}
          {tool.id === "pdf-watermark" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Watermark Text</Label>
                  <Input
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="e.g. DRAFT or CONFIDENTIAL"
                    disabled={!!watermarkImageFile}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select
                    value={watermarkPosition}
                    onValueChange={(v: typeof watermarkPosition) =>
                      setWatermarkPosition(v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diagonal">Diagonal (45°)</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                      <SelectItem value="tile">Tiled (grid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Opacity</Label>
                    <span className="text-xs font-mono">
                      {Math.round(watermarkOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={[watermarkOpacity]}
                    onValueChange={([v]) => setWatermarkOpacity(v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5" /> Color
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="h-9 w-14 rounded border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Font size</Label>
                    <span className="text-xs font-mono">
                      {watermarkFontSize}px
                    </span>
                  </div>
                  <Slider
                    min={12}
                    max={100}
                    step={2}
                    value={[watermarkFontSize]}
                    onValueChange={([v]) => setWatermarkFontSize(v)}
                    disabled={!!watermarkImageFile}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Or upload image
                    watermark
                  </Label>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) =>
                      setWatermarkImageFile(e.target.files?.[0] || null)
                    }
                    className="text-xs"
                  />
                  {watermarkImageFile && (
                    <p className="text-[11px] text-muted-foreground">
                      ✓ {watermarkImageFile.name} —{" "}
                      <button
                        type="button"
                        className="text-red-500 underline"
                        onClick={() => setWatermarkImageFile(null)}
                      >
                        clear
                      </button>
                    </p>
                  )}
                </div>
                {watermarkImageFile && (
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex justify-between">
                      <Label>Image scale</Label>
                      <span className="text-xs font-mono">
                        {(watermarkImageScale * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Slider
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={[watermarkImageScale]}
                      onValueChange={([v]) => setWatermarkImageScale(v)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PAGE NUMBERS ── */}
          {tool.id === "pdf-page-numbers" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
              <div className="space-y-2">
                <Label>Position</Label>
                <Select
                  value={numberPosition}
                  onValueChange={(v: typeof numberPosition) =>
                    setNumberPosition(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-center">Bottom Center</SelectItem>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="top-center">Top Center</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number format</Label>
                <Select
                  value={pageNumFormat}
                  onValueChange={(v: typeof pageNumFormat) =>
                    setPageNumFormat(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">Page 1 of N</SelectItem>
                    <SelectItem value="roman-upper">I, II, III</SelectItem>
                    <SelectItem value="roman-lower">i, ii, iii</SelectItem>
                    <SelectItem value="alpha-upper">A, B, C</SelectItem>
                    <SelectItem value="alpha-lower">a, b, c</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start number</Label>
                <Input
                  type="number"
                  min="1"
                  value={pageNumStart}
                  onChange={(e) =>
                    setPageNumStart(
                      Math.max(1, parseInt(e.target.value, 10) || 1),
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* ── METADATA ── */}
          {tool.id === "pdf-metadata" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Document Title</Label>
                  <Input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Author</Label>
                  <Input
                    value={metaAuthor}
                    onChange={(e) => setMetaAuthor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={metaSubject}
                    onChange={(e) => setMetaSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Keywords (comma separated)</Label>
                  <Input
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="report, 2024, finance"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                <div>
                  <Label className="font-medium text-sm">
                    Clear all metadata
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Wipes title, author, subject, keywords (overrides fields
                    above)
                  </p>
                </div>
                <Switch
                  checked={clearMetadataOnSave}
                  onCheckedChange={setClearMetadataOnSave}
                />
              </div>
            </div>
          )}

          {/* ── PROTECT ── */}
          {tool.id === "pdf-protect" && (
            <div className="space-y-2 max-w-sm">
              <Label>Document Password</Label>
              <Input
                type="password"
                placeholder="Enter password to encrypt"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {/* ── EDITOR ──
          {tool.id === "pdf-editor" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PenLine className="w-4 h-4 text-primary" /> Add Annotation
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={annotationDraft.type}
                      onValueChange={(v: AnnotationType) =>
                        setAnnotationDraft((d) => ({ ...d, type: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="highlight">Highlight</SelectItem>
                        <SelectItem value="rect">Rectangle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Page</Label>
                    <Input
                      type="number"
                      min="1"
                      value={annotationDraft.page}
                      onChange={(e) =>
                        setAnnotationDraft((d) => ({
                          ...d,
                          page: Math.max(1, parseInt(e.target.value, 10) || 1),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">X</Label>
                    <Input
                      type="number"
                      value={annotationDraft.x}
                      onChange={(e) =>
                        setAnnotationDraft((d) => ({
                          ...d,
                          x: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Y</Label>
                    <Input
                      type="number"
                      value={annotationDraft.y}
                      onChange={(e) =>
                        setAnnotationDraft((d) => ({
                          ...d,
                          y: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {annotationDraft.type === "text" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Text</Label>
                      <Input
                        value={annotationDraft.text || ""}
                        onChange={(e) =>
                          setAnnotationDraft((d) => ({
                            ...d,
                            text: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Font size</Label>
                      <Input
                        type="number"
                        min="6"
                        value={annotationDraft.size}
                        onChange={(e) =>
                          setAnnotationDraft((d) => ({
                            ...d,
                            size: Math.max(
                              6,
                              parseInt(e.target.value, 10) || 14,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {(annotationDraft.type === "highlight" ||
                  annotationDraft.type === "rect") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Width</Label>
                      <Input
                        type="number"
                        min="5"
                        value={annotationDraft.width}
                        onChange={(e) =>
                          setAnnotationDraft((d) => ({
                            ...d,
                            width: Math.max(
                              5,
                              parseInt(e.target.value, 10) || 100,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Height</Label>
                      <Input
                        type="number"
                        min="5"
                        value={annotationDraft.height}
                        onChange={(e) =>
                          setAnnotationDraft((d) => ({
                            ...d,
                            height: Math.max(
                              5,
                              parseInt(e.target.value, 10) || 20,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Palette className="w-3 h-3" /> Color
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={annotationDraft.color}
                        onChange={(e) =>
                          setAnnotationDraft((d) => ({
                            ...d,
                            color: e.target.value,
                          }))
                        }
                        className="h-8 w-10 rounded border cursor-pointer bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {annotationDraft.color}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={addAnnotation}
                    className="gap-1.5 mt-4"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
              </div>

              {annotations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> Placed Annotations (
                      {annotations.length})
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 text-red-500"
                      onClick={() => setAnnotations([])}
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {annotations.map((ann) => (
                      <div
                        key={ann.id}
                        className="flex items-center gap-2 p-1.5 rounded border bg-muted/20 text-xs"
                      >
                        <span className="text-muted-foreground font-mono">
                          P{ann.page}
                        </span>
                        <span className="px-1 py-0.5 rounded bg-primary/10 text-[10px] font-mono">
                          {ann.type === "rect" ? "shape" : ann.type}
                        </span>
                        <span className="flex-1 truncate">
                          {ann.type === "text"
                            ? ann.text
                            : `${ann.width}×${ann.height}`}
                        </span>
                        <span
                          className="w-3 h-3 rounded-full border"
                          style={{ backgroundColor: ann.color }}
                        />
                        <button
                          type="button"
                          onClick={() => removeAnnotation(ann.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )} */}

          {/* Main action */}
          <div className="pt-2">
            <Button
              size="lg"
              onClick={processPdf}
              disabled={job?.status === "processing"}
              className="w-full sm:w-auto px-8 gap-2 font-semibold shadow-sm hover:shadow transition-all"
            >
              {job?.status === "processing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {tool.id === "pdf-compress"
                    ? "Compress PDF Now"
                    : tool.id === "pdf-to-text" || tool.id === "pdf-ocr"
                      ? "Extract Content"
                      : tool.id === "pdf-split"
                        ? `Run Split (${splitMode})`
                        : tool.id === "pdf-merge"
                          ? `Merge ${files.length} PDFs`
                          : `Process ${tool.title}`}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {job && (
        <ProcessingPanel
          job={job}
          onReset={() => {
            setFiles([]);
            setJob(null);
            setExtractedText("");
            setCompressionStats(null);
          }}
        />
      )}

      {/* Compression results */}
      {compressionStats && job?.status === "ready" && (
        <div className="p-6 rounded-2xl border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            <span>Compression Successful!</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-xl bg-background border">
              <span className="text-xs text-muted-foreground block">
                Original Size
              </span>
              <span className="text-lg font-bold text-foreground font-mono">
                {formatBytes(compressionStats.originalSize)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-background border">
              <span className="text-xs text-muted-foreground block">
                Compressed Size
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatBytes(compressionStats.compressedSize)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-background border">
              <span className="text-xs text-muted-foreground block">
                Total Space Saved
              </span>
              <span className="text-lg font-bold text-primary font-mono">
                {compressionStats.savingsPct}% reduction
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Extracted text preview */}
      {extractedText && (
        <div className="p-6 rounded-2xl border bg-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b">
            <div>
              <h4 className="font-semibold text-base text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Extracted Text
                Content
              </h4>
              {extractedStats && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {extractedStats.words.toLocaleString()} words ·{" "}
                  {extractedStats.chars.toLocaleString()} characters ·{" "}
                  {extractedStats.pages} page
                  {extractedStats.pages > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyExtractedText}
                className="gap-1.5 text-xs"
              >
                {copiedText ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  const blob = new Blob([extractedText], {
                    type: "text/plain;charset=utf-8",
                  });
                  downloadBlob(
                    blob,
                    `${files[0]?.name.replace(/\.[^/.]+$/, "") || "extracted"}.txt`,
                  );
                }}
              >
                <Download className="w-3.5 h-3.5" /> Download .TXT
              </Button>
            </div>
          </div>
          <textarea
            readOnly
            value={extractedText}
            className="w-full h-80 p-4 font-mono text-xs rounded-xl border bg-muted/40 text-foreground resize-y leading-relaxed focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
