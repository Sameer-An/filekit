"use client";
import React, { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
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

/* ─────────── Helpers ─────────── */

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
      onMouseDown={(e) => e.preventDefault()} // preserve editor selection
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

/* ─────────── HTML → DOCX mapper (client-side fallback) ─────────── */

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

/* ─────────── Main component ─────────── */

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
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

  // Keep editor's editable state in sync
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  // ─── Import files into editor ───
  const handleFiles = async (selected: File[]) => {
    setFiles(selected);
    if (!selected[0] || !editor) return;
    const f = selected[0];
    setJob(createJob(f.name, f.size));
    setImporting(true);

    try {
      if (["docx-editor", "docx-to-pdf", "docx-to-txt"].includes(tool.id)) {
        const ab = await f.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer: ab },
          {
            convertImage: mammoth.images.imgElement(async (img) => {
              const base64 = await img.read("base64");
              return { src: `data:${img.contentType};base64,${base64}` };
            }),
          },
        );
        editor.commands.setContent(result.value || "<p>Empty document</p>");
        setWordCount(countWords(editor.getText()));
      } else if (tool.id === "pdf-to-docx") {
        const ab = await f.arrayBuffer();
        const ext = await extractPdfText(ab);
        const html = ext.fullText
          .split(/\n\n+/)
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
          .join("");
        editor.commands.setContent(html || "<p>Empty document</p>");
      } else if (tool.id === "markdown-editor") {
        const text = await f.text();
        editor.commands.setContent(await marked(text));
      } else if (tool.id === "txt-to-docx") {
        const text = await f.text();
        const html = text
          .split("\n")
          .map((l) => (l.trim() ? `<p>${escapeHtml(l)}</p>` : "<p></p>"))
          .join("");
        editor.commands.setContent(html || "<p></p>");
      } else if (tool.id === "csv-to-xlsx" || tool.id === "xlsx-editor") {
        const ab = await f.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const json: any[][] = XLSX.utils.sheet_to_json(
          wb.Sheets[wb.SheetNames[0]],
          { header: 1 },
        );
        if (json?.length) setSheetData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  // ─── Insert helpers ───
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

  // ─── Export ───
  const processDocument = async () => {
    if (!editor) return;
    setJob((prev) =>
      prev
        ? {
            ...prev,
            status: "processing",
            progress: 30,
            message: "Preparing document…",
          }
        : createJob(files[0]?.name || "document", files[0]?.size || 0),
    );

    try {
      const html = editor.getHTML();
      let outputBlob: Blob;
      let outputFilename: string;

      if (
        ["docx-editor", "txt-to-docx", "docx-merge", "pdf-to-docx"].includes(
          tool.id,
        )
      ) {
        // ── Try server-side exact export first ──
        try {
          const res = await fetch("/api/docx/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: wrapHtmlForExport(html) }),
          });
          if (!res.ok) throw new Error("Server export failed");
          outputBlob = await res.blob();
        } catch {
          // ── Fallback: client-side docx build (covers common formatting) ──
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
          const buffer = await Packer.toBlob(doc);
          outputBlob = buffer;
        }
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, "") || "document"}.docx`;
      } else if (
        ["docx-to-pdf", "html-to-pdf", "markdown-editor"].includes(tool.id)
      ) {
        // Prefer server-side PDF for real fidelity
        try {
          const res = await fetch("/api/pdf/from-html", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: wrapHtmlForExport(html) }),
          });
          if (!res.ok) throw new Error("PDF export failed");
          outputBlob = await res.blob();
        } catch {
          // Fallback: open print dialog as PDF
          const win = window.open("", "_blank");
          if (!win)
            throw new Error("Popup blocked — allow popups for PDF export");
          win.document.write(wrapHtmlForExport(html));
          win.document.close();
          win.focus();
          win.print();
          win.close();
          return;
        }
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, "") || "document"}.pdf`;
      } else if (tool.id === "docx-to-txt") {
        outputBlob = new Blob([editor.getText()], {
          type: "text/plain;charset=utf-8",
        });
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, "") || "document"}.txt`;
      } else if (tool.id === "csv-to-xlsx" || tool.id === "xlsx-editor") {
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        outputBlob = new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, "") || "spreadsheet"}.xlsx`;
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

  const useEditorMode = [
    "docx-editor",
    "txt-to-docx",
    "docx-to-pdf",
    "pdf-to-docx",
    "markdown-editor",
    "html-to-pdf",
  ].includes(tool.id);

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={tool.id === "docx-merge"}
        maxSizeMB={tool.maxFileSizeMB || 50}
        onFilesSelected={handleFiles}
        disabled={job?.status === "processing" || importing}
      />

      {/* ─── Word-style Editor ─── */}
      {useEditorMode && editor && (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/40">
            <TBtn
              onClick={() => editor.chain().focus().undo().run()}
              title="Undo"
              disabled={!editor.can().undo()}
            >
              <Undo2 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().redo().run()}
              title="Redo"
              disabled={!editor.can().redo()}
            >
              <Redo2 className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              active={editor.isActive("heading", { level: 1 })}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              active={editor.isActive("heading", { level: 2 })}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              active={editor.isActive("heading", { level: 3 })}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive("underline")}
              title="Underline"
            >
              <UnderlineIcon className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive("strike")}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              title="Bullet List"
            >
              <ListIcon className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </TBtn>
            <div className="w-px h-6 bg-border mx-1" />
            <TBtn
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              active={editor.isActive({ textAlign: "left" })}
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().setTextAlign("center").run()
              }
              active={editor.isActive({ textAlign: "center" })}
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              active={editor.isActive({ textAlign: "right" })}
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </TBtn>
            <TBtn
              onClick={() =>
                editor.chain().focus().setTextAlign("justify").run()
              }
              active={editor.isActive({ textAlign: "justify" })}
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
                onChange={(e) =>
                  editor
                    .chain()
                    .focus()
                    .toggleHighlight({ color: e.target.value })
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
            <div className="word-page">
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

      {/* ─── Spreadsheet view ─── */}
      {(tool.id === "csv-to-xlsx" || tool.id === "xlsx-editor") && (
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

      {/* ─── Export button ─── */}
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
