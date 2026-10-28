"use client";

import React, { useState, useEffect } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extension-placeholder";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
} from "docx";
import { marked } from "marked";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List as ListIcon,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  Link as LinkIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
  Lock,
  Unlock,
  Loader2,
  Sparkles,
  Palette,
  Highlighter,
} from "lucide-react";
import { ToolDefinition } from "@/lib/tools-registry";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { ProcessingJob, createJob } from "@/lib/job-store";
import { extractPdfText } from "@/lib/pdf-text-extractor";

/* ─────────── Shared helpers ─────────── */

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

const baseName = (name: string | undefined, fallback: string) =>
  name?.replace(/\.[^/.]+$/, "") || fallback;

/* IndexedDB handoff — used by the new-tab editor flow */
const saveDocToDB = (html: string, filename: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("FileKitDocs", 2);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("docs")) {
        db.createObjectStore("docs");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("docs", "readwrite");
      tx.objectStore("docs").put({ html, filename }, "current");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

/* Shared docx → html conversion (mammoth + cleanup for Word artifacts) */
const convertDocxToHtml = async (file: File): Promise<string> => {
  const ab = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer: ab },
    {
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(async (img) => {
        const base64 = await img.read("base64");
        return { src: `data:${img.contentType};base64,${base64}` };
      }),
    },
  );

  let html = (result.value || "<p>Empty document</p>").toString();

  if (typeof window !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("p, table, div").forEach((el) => {
      (el as HTMLElement).style.marginLeft = "0px";
      if ((el as HTMLElement).tagName === "TABLE") {
        (el as HTMLElement).style.width = "100%";
        (el as HTMLElement).style.borderCollapse = "collapse";
      }
    });
    html = doc.body.innerHTML;
  }

  return html;
};

function wrapHtmlForExport(body: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Document</title>
<style>
  body { font-family: Calibri, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #1e1e1e; }
  h1 { font-size: 2em; font-weight: 700; margin: 1.2em 0 0.5em; }
  h2 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; }
  h3 { font-size: 1.25em; font-weight: 700; margin: 0.8em 0 0.4em; }
  p { margin: 0 0 0.75em 0; }
  ul, ol { padding-left: 1.5em; margin-bottom: 0.75em; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #d0d0d0; padding: 0.5em 0.75em; }
  th { background: #f5f5f5; font-weight: 700; }
  img { max-width: 100%; }
  a { color: #2563eb; text-decoration: underline; }
  blockquote { border-left: 3px solid #d0d0d0; padding-left: 1em; color: #666; }
</style></head><body>${body}</body></html>`;
}

function TBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-md transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

/* ─────────── HTML → DOCX client-side fallback helpers ─────────── */

async function dataUrlToBytes(
  src: string,
): Promise<{ bytes: Uint8Array; type: "png" | "jpg" | "gif" | "bmp" } | null> {
  try {
    const base64 = src.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    let type: "png" | "jpg" | "gif" | "bmp" = "png";
    if (src.includes("jpeg") || src.includes("jpg")) type = "jpg";
    else if (src.includes("gif")) type = "gif";
    else if (src.includes("bmp")) type = "bmp";
    return { bytes, type };
  } catch {
    return null;
  }
}

async function inlineRuns(node: Element): Promise<(TextRun | ImageRun)[]> {
  const runs: (TextRun | ImageRun)[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || "";
      if (text) runs.push(new TextRun({ text }));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("data:")) {
          const data = await dataUrlToBytes(src);
          if (data) {
            runs.push(
              new ImageRun({
                data: data.bytes,
                transformation: { width: 480, height: 320 },
                type: data.type,
              }),
            );
          }
        }
        continue;
      }
      const opts: Record<string, unknown> = { text: el.textContent || "" };
      let cur: Element | null = el;
      while (cur && cur !== node.parentElement) {
        const t = cur.tagName.toLowerCase();
        if (t === "strong" || t === "b") opts.bold = true;
        if (t === "em" || t === "i") opts.italics = true;
        if (t === "u") opts.underline = {};
        if (t === "s" || t === "del" || t === "strike") opts.strike = true;
        if (t === "code") opts.font = "Courier New";
        if (t === "a") opts.color = "2563eb";
        cur = cur.parentElement;
      }
      if (opts.text) runs.push(new TextRun(opts as any));
    }
  }
  return runs;
}

async function elementToDocxBlock(
  node: Element,
): Promise<(Paragraph | DocxTable)[]> {
  const tag = node.tagName.toLowerCase();
  const out: (Paragraph | DocxTable)[] = [];

  if (tag === "table") {
    const rows: DocxTableRow[] = [];
    for (const tr of Array.from(node.querySelectorAll("tr"))) {
      const cells: DocxTableCell[] = [];
      for (const td of Array.from(tr.querySelectorAll("td, th"))) {
        cells.push(
          new DocxTableCell({
            children: [
              new Paragraph({ children: [new TextRun(td.textContent || "")] }),
            ],
            shading: td.tagName === "TH" ? { fill: "F5F5F5" } : undefined,
          }),
        );
      }
      rows.push(new DocxTableRow({ children: cells }));
    }
    out.push(
      new DocxTable({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    );
    return out;
  }

  if (tag === "ul" || tag === "ol") {
    for (const li of Array.from(node.querySelectorAll(":scope > li"))) {
      const runs = await inlineRuns(li);
      out.push(
        new Paragraph({
          children: runs,
          bullet: tag === "ul" ? { level: 0 } : undefined,
          numbering:
            tag === "ol" ? { reference: "ordered", level: 0 } : undefined,
        }),
      );
    }
    return out;
  }

  const runs = await inlineRuns(node);

  if (tag === "h1")
    out.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs }),
    );
  else if (tag === "h2")
    out.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs }),
    );
  else if (tag === "h3")
    out.push(
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs }),
    );
  else if (tag === "blockquote")
    out.push(new Paragraph({ children: runs, indent: { left: 720 } }));
  else out.push(new Paragraph({ children: runs }));
  return out;
}

async function htmlToDocxChildren(
  html: string,
): Promise<(Paragraph | DocxTable)[]> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const all: (Paragraph | DocxTable)[] = [];
  for (const node of Array.from(doc.body.children)) {
    all.push(...(await elementToDocxBlock(node)));
  }
  return all;
}

/* ─────────── Tool groups ─────────── */

const NEW_TAB_TOOLS = ["docx-editor", "word-editor"];
const SHEET_TOOLS = ["csv-to-xlsx", "xlsx-editor"];
const EDITOR_TOOLS = [
  "txt-to-docx",
  "docx-to-pdf",
  "docx-to-txt",
  "docx-merge",
  "pdf-to-docx",
  "markdown-editor",
  "html-to-pdf",
];

/* ─────────── Main Component ─────────── */

export function DocumentToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [editable, setEditable] = useState(true);
  const [importing, setImporting] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [sheetData, setSheetData] = useState<any[][]>([
    ["Item", "Quantity", "Price", "Total"],
    ["Product A", 10, 25, 250],
    ["Product B", 5, 40, 200],
    ["Product C", 15, 10, 150],
  ]);

  /**
   * `docx-editor` and `word-editor` are routed to the dedicated full-screen
   * `/editor` page (paginated Tiptap editor). Everything else edits inline.
   */
  const isNewTabEditor = NEW_TAB_TOOLS.includes(tool.id);
  const isSheetTool = SHEET_TOOLS.includes(tool.id);
  const useEditorMode = !isNewTabEditor && EDITOR_TOOLS.includes(tool.id);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Tiptap v3: StarterKit already bundles Link + Underline,
      // so disable them here and register our configured versions.
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder:
          "Start typing your document, or upload a .docx file to edit it…",
      }),
    ],
    content:
      "<h1>Welcome to OmniFile Word Editor</h1><p>Start typing, or upload a <strong>.docx</strong> file to load it. Use the toolbar to format text and insert images, tables, or links.</p>",
    editable,
    editorProps: {
      attributes: { class: "focus:outline-none" },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith("image/")) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            const { schema } = view.state;
            const node = schema.nodes.image.create({ src: reader.result });
            view.dispatch(view.state.tr.replaceSelectionWith(node));
          };
          reader.readAsDataURL(file);
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = () => {
              const { schema } = view.state;
              const node = schema.nodes.image.create({ src: reader.result });
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => setWordCount(countWords(editor.getText())),
  });

  // Tiptap v3 no longer re-renders React on every transaction,
  // so toolbar state must be subscribed explicitly.
  const ui = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      strike: editor?.isActive("strike") ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      left: editor?.isActive({ textAlign: "left" }) ?? false,
      center: editor?.isActive({ textAlign: "center" }) ?? false,
      right: editor?.isActive({ textAlign: "right" }) ?? false,
      justify: editor?.isActive({ textAlign: "justify" }) ?? false,
    }),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  /* ─────────── File handling ─────────── */

  const handleFiles = async (selected: File[]) => {
    if (!selected[0]) return;
    const f = selected[0];
    setFiles(selected);
    setImporting(true);

    // ── New-tab flow: docx-editor / word-editor ──
    if (isNewTabEditor) {
      // Must be opened synchronously (before any await) to avoid popup blockers.
      const newTab = window.open("about:blank", "_blank");
      try {
        setJob(createJob(f.name, f.size));
        const html = await convertDocxToHtml(f);
        await saveDocToDB(html, f.name);

        if (newTab) newTab.location.href = "/editor";
        else window.location.href = "/editor";

        setJob(null);
      } catch (err) {
        console.error("Error processing file:", err);
        alert("Failed to open document. Please try again.");
        if (newTab) newTab.close();
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: err instanceof Error ? err.message : "Failed",
                message: "Failed",
              }
            : null,
        );
      } finally {
        setImporting(false);
      }
      return;
    }

    // ── Inline flow ──
    if (!editor && !isSheetTool) {
      setImporting(false);
      return;
    }
    setJob(createJob(f.name, f.size));

    try {
      if (tool.id === "docx-merge" && editor) {
        const parts: string[] = [];
        for (const file of selected) parts.push(await convertDocxToHtml(file));
        editor.commands.setContent(parts.join("<p></p>"));
        setWordCount(countWords(editor.getText()));
      } else if (["docx-to-pdf", "docx-to-txt"].includes(tool.id) && editor) {
        const html = await convertDocxToHtml(f);
        editor.commands.setContent(html);
        setWordCount(countWords(editor.getText()));
      } else if (tool.id === "pdf-to-docx" && editor) {
        const ab = await f.arrayBuffer();
        const ext = await extractPdfText(ab);
        const html = ext.fullText
          .split(/\n\n+/)
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
          .join("");
        editor.commands.setContent(html || "<p>Empty document</p>");
        setWordCount(countWords(editor.getText()));
      } else if (tool.id === "markdown-editor" && editor) {
        const text = await f.text();
        editor.commands.setContent(await marked(text));
        setWordCount(countWords(editor.getText()));
      } else if (tool.id === "html-to-pdf" && editor) {
        const text = await f.text();
        editor.commands.setContent(text);
        setWordCount(countWords(editor.getText()));
      } else if (tool.id === "txt-to-docx" && editor) {
        const text = await f.text();
        const html = text
          .split("\n")
          .map((l) => (l.trim() ? `<p>${escapeHtml(l)}</p>` : "<p></p>"))
          .join("");
        editor.commands.setContent(html || "<p></p>");
        setWordCount(countWords(editor.getText()));
      } else if (isSheetTool) {
        const ab = await f.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const json: any[][] = XLSX.utils.sheet_to_json(
          wb.Sheets[wb.SheetNames[0]],
          { header: 1 },
        );
        if (json?.length) setSheetData(json);
      }
      // File imported — clear the "importing" job card so only the export flow shows.
      setJob(null);
    } catch (err) {
      console.error(err);
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              error: err instanceof Error ? err.message : "Import failed",
              message: "Import failed",
            }
          : null,
      );
    } finally {
      setImporting(false);
    }
  };

  /* ─────────── Insert helpers ─────────── */

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        editor
          ?.chain()
          .focus()
          .setImage({ src: reader.result as string })
          .run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertLink = () => {
    const url = window.prompt("Enter URL:", "https://");
    if (!url) return;
    editor
      ?.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  const insertTable = () => {
    editor
      ?.chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  /* ─────────── Export ─────────── */

  const processDocument = async () => {
    if (!editor && !isSheetTool) return;

    setJob((prev) =>
      prev
        ? {
            ...prev,
            status: "processing",
            progress: 30,
            message: "Preparing document…",
          }
        : {
            ...createJob(files[0]?.name || "document", files[0]?.size || 0),
            status: "processing",
            progress: 30,
            message: "Preparing document…",
          },
    );

    try {
      const html = editor?.getHTML() ?? "";
      let outputBlob: Blob;
      let outputFilename: string;

      if (["txt-to-docx", "pdf-to-docx", "docx-merge"].includes(tool.id)) {
        try {
          const res = await fetch("/api/docx/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: wrapHtmlForExport(html) }),
          });
          if (!res.ok) throw new Error("Server export failed");
          outputBlob = await res.blob();
        } catch {
          const children = await htmlToDocxChildren(html);
          const doc = new DocxDocument({
            numbering: {
              config: [
                {
                  reference: "ordered",
                  levels: [
                    {
                      level: 0,
                      format: "decimal",
                      text: "%1.",
                      alignment: AlignmentType.LEFT,
                    },
                  ],
                },
              ],
            },
            sections: [
              {
                properties: {},
                children: children.length
                  ? children
                  : [new Paragraph("Empty document")],
              },
            ],
          });
          outputBlob = await Packer.toBlob(doc);
        }
        outputFilename = `${baseName(files[0]?.name, "document")}.docx`;
      } else if (
        ["docx-to-pdf", "html-to-pdf", "markdown-editor"].includes(tool.id)
      ) {
        try {
          const res = await fetch("/api/pdf/from-html", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: wrapHtmlForExport(html) }),
          });
          if (!res.ok) throw new Error("PDF export failed");
          outputBlob = await res.blob();
        } catch {
          // Fallback: browser print dialog ("Save as PDF")
          const win = window.open("", "_blank");
          if (!win)
            throw new Error("Popup blocked — allow popups for PDF export");
          win.document.write(wrapHtmlForExport(html));
          win.document.close();
          win.focus();
          win.print();
          win.close();
          setJob(null); // don't leave the panel stuck on "processing"
          return;
        }
        outputFilename = `${baseName(files[0]?.name, "document")}.pdf`;
      } else if (tool.id === "docx-to-txt") {
        outputBlob = new Blob([editor?.getText() ?? ""], {
          type: "text/plain;charset=utf-8",
        });
        outputFilename = `${baseName(files[0]?.name, "document")}.txt`;
      } else if (isSheetTool) {
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        outputBlob = new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        outputFilename = `${baseName(files[0]?.name, "spreadsheet")}.xlsx`;
      } else {
        throw new Error(`Unsupported tool: ${tool.id}`);
      }

      const outputUrl = URL.createObjectURL(outputBlob);
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "ready",
              progress: 100,
              message: "Done!",
              outputUrl,
              outputFilename,
              outputSize: outputBlob.size,
              completedAt: Date.now(),
            }
          : null,
      );
    } catch (err) {
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              error: err instanceof Error ? err.message : "Failed",
              message: "Failed",
            }
          : null,
      );
    }
  };

  /* ─────────── Render: new-tab redirect UI ─────────── */

  if (isNewTabEditor) {
    return (
      <div className="space-y-6">
        <FileUploadZone
          accept={tool.inputFormats}
          onFilesSelected={handleFiles}
          disabled={importing}
        />
        {importing && (
          <div className="flex items-center justify-center p-6 text-primary border rounded-xl bg-card">
            <Loader2 className="w-6 h-6 animate-spin mr-3" />
            Opening in full-screen editor…
          </div>
        )}
      </div>
    );
  }

  /* ─────────── Render: inline editor UI ─────────── */

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={tool.id === "docx-merge"}
        maxSizeMB={tool.maxFileSizeMB || 50}
        onFilesSelected={handleFiles}
        disabled={job?.status === "processing" || importing}
      />

      {/* Word-style Editor */}
      {useEditorMode && editor && (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/40">
            <TBtn
              onClick={() => editor.chain().focus().undo().run()}
              title="Undo"
              disabled={!ui?.canUndo}
            >
              <Undo2 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().redo().run()}
              title="Redo"
              disabled={!ui?.canRedo}
            >
              <Redo2 className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              active={ui?.h1}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              active={ui?.h2}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              active={ui?.h3}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={ui?.bold}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={ui?.italic}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={ui?.underline}
              title="Underline"
            >
              <UnderlineIcon className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={ui?.strike}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={ui?.bullet}
              title="Bullet List"
            >
              <ListIcon className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={ui?.ordered}
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              active={ui?.left}
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().setTextAlign("center").run()
              }
              active={ui?.center}
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              active={ui?.right}
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().setTextAlign("justify").run()
              }
              active={ui?.justify}
              title="Justify"
            >
              <AlignJustify className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <label
              className="relative p-2 rounded-md hover:bg-muted cursor-pointer"
              title="Text Color"
            >
              <Palette className="w-4 h-4" />
              <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) =>
                  editor.chain().focus().setColor(e.target.value).run()
                }
              />
            </label>
            <label
              className="relative p-2 rounded-md hover:bg-muted cursor-pointer"
              title="Highlight"
            >
              <Highlighter className="w-4 h-4" />
              <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                defaultValue="#fef08a"
                onChange={(e) =>
                  editor
                    .chain()
                    .focus()
                    .setHighlight({ color: e.target.value })
                    .run()
                }
              />
            </label>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn onClick={insertImage} title="Insert Image">
              <ImageIcon className="w-4 h-4" />
            </TBtn>
            <TBtn onClick={insertLink} title="Insert Link">
              <LinkIcon className="w-4 h-4" />
            </TBtn>
            <TBtn onClick={insertTable} title="Insert Table">
              <TableIcon className="w-4 h-4" />
            </TBtn>
            <div className="flex-1" />
            <TBtn
              onClick={() => setEditable((v) => !v)}
              active={!editable}
              title={editable ? "Lock editing" : "Unlock editing"}
            >
              {editable ? (
                <Unlock className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </TBtn>
          </div>

          {/* Word-like page */}
          <div
            className="bg-muted/30 p-6 overflow-auto"
            style={{ maxHeight: "80vh" }}
          >
            <div className="word-page show-grid">
              {importing ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Importing
                  document…
                </div>
              ) : (
                <EditorContent editor={editor} />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
            <span>{wordCount.toLocaleString()} words</span>
            <span className="font-mono">
              {editable ? "✏️ Editing" : "🔒 Read-only"} · Drag images to insert
            </span>
          </div>
        </div>
      )}

      {/* Spreadsheet view */}
      {isSheetTool && (
        <div className="p-6 rounded-2xl border bg-card space-y-4">
          <h3 className="font-semibold text-sm">Spreadsheet Preview</h3>
          <div className="overflow-x-auto max-h-80 border rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b">
                  {sheetData[0]?.map((col, i) => (
                    <th key={i} className="p-2.5 font-semibold border-r">
                      {col || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.slice(1, 20).map((row, r) => (
                  <tr key={r} className="border-b hover:bg-muted/30">
                    {row.map((c, ci) => (
                      <td key={ci} className="p-2 border-r font-mono">
                        {c ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export button */}
      {job?.status !== "ready" && (
        <div className="p-4 rounded-xl border bg-card flex items-center justify-between gap-4">
          <span className="text-sm font-medium truncate">
            {files[0] ? `Ready: ${files[0].name}` : "Ready to export"}
          </span>
          <Button
            size="lg"
            onClick={processDocument}
            disabled={job?.status === "processing" || importing}
            className="gap-2 px-6 font-semibold"
          >
            {job?.status === "processing" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Export as{" "}
                {tool.outputFormats[0]?.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      )}

      {job && (
        <ProcessingPanel
          job={job}
          onReset={() => {
            setFiles([]);
            setJob(null);
          }}
        />
      )}
    </div>
  );
}
