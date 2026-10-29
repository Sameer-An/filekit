    "use client";

    import React, { useState, useEffect, useRef } from "react";
    import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
    import { StarterKit } from "@tiptap/starter-kit";
    import { Underline } from "@tiptap/extension-underline";
    import { TextAlign } from "@tiptap/extension-text-align";
    import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
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
    // FIX 1: Imported CommandProps and RawCommands for proper type safety
    import { Extension, type CommandProps, type RawCommands } from "@tiptap/core";

    // Pagination for Tiptap v3
    import { PaginationPlus } from "tiptap-pagination-plus";

    import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List as ListIcon,
    ListOrdered,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Image as ImageIcon,
    Table as TableIcon,
    Undo2,
    Redo2,
    Loader2,
    Sparkles,
    Palette,
    Highlighter,
    FileText,
    X,
    Grid3X3,
    } from "lucide-react";
    import { Button } from "@/components/ui/button";

    /* ─────────── CUSTOM FONT SIZE EXTENSION ─────────── */

    declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        fontSize: {
        setFontSize: (size: string) => ReturnType;
        unsetFontSize: () => ReturnType;
        };
    }
    }

    const FontSize = Extension.create({
    name: "fontSize",
    addOptions() {
        return { types: ["textStyle"] };
    },
    addGlobalAttributes() {
        return [
        {
            types: this.options.types,
            attributes: {
            fontSize: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                element.style.fontSize?.replace(/['"]+/g, "") || null,
                // FIX 2: Replaced `any` with `unknown`
                renderHTML: (attributes: Record<string, unknown>) =>
                !attributes.fontSize
                    ? {}
                    : { style: `font-size: ${attributes.fontSize}` },
            },
            },
        },
        ];
    },
    addCommands() {
        // FIX 3: Replaced `any` with `Partial<RawCommands>` and `CommandProps`
        return {
        setFontSize:
            (size: string) =>
            ({ chain }: CommandProps) =>
            chain().setMark("textStyle", { fontSize: size }).run(),
        unsetFontSize:
            () =>
            ({ chain }: CommandProps) =>
            chain()
                .setMark("textStyle", { fontSize: null })
                .removeEmptyTextStyle()
                .run(),
        } as Partial<RawCommands>;
    },
    });

    /* ─────────── Helpers ─────────── */

    const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
            c
        ] as string,
    );

    const getDocFromDB = (): Promise<{ html: string; filename: string } | null> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("FileKitDocs", 2);
        request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs");
        };
        request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("docs")) {
            db.close();
            return resolve(null);
        }
        const tx = db.transaction("docs", "readonly");
        const getReq = tx.objectStore("docs").get("current");
        getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result || null);
        };
        getReq.onerror = () => reject(getReq.error);
        };
        request.onerror = () => reject(request.error);
    });
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

    const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const FONT_SIZES = [
    "10pt",
    "11pt",
    "12pt",
    "14pt",
    "16pt",
    "18pt",
    "24pt",
    "32pt",
    ];

    /* ─────────── Page ─────────── */

    export default function FullScreenEditorPage() {
    const [fileName, setFileName] = useState("document.docx");
    const [isExporting, setIsExporting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [headerText, setHeaderText] = useState("");
    const [footerText, setFooterText] = useState("");
    const [showGrid, setShowGrid] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
        StarterKit.configure({ link: false, underline: false }),
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        Highlight.configure({ multicolor: true }),
        Image.configure({ allowBase64: true, inline: true }),
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({ placeholder: "Start typing..." }),

        // FIX 4: Replaced `pageMargin` with `marginTop`, `marginBottom`, `marginLeft`, `marginRight`
        PaginationPlus.configure({
            pageHeight: 1056,
            pageWidth: 816,
            marginTop: 96,
            marginBottom: 96,
            marginLeft: 96,
            marginRight: 96,

            pageGap: 30,
            pageGapBorderSize: 1,
            pageGapBorderColor: "#d1d5db",
            pageBreakBackground: "#f3f4f6",
        }),
        ],
        content: "<p></p>",
        editorProps: {
        attributes: {
            class: "focus:outline-none text-gray-900 outline-none w-full",
        },
        },
    });

    /* Load the document handed off from the tool page (IndexedDB) */
    useEffect(() => {
        if (!editor) return;
        let cancelled = false;
        getDocFromDB()
        .then((data) => {
            if (cancelled) return;
            if (data?.html) {
            editor.commands.setContent(data.html);
            setFileName(data.filename);
            }
        })
        .catch((err) => console.error(err))
        .finally(() => {
            if (!cancelled) setIsLoading(false);
        });
        return () => {
        cancelled = true;
        };
    }, [editor]);

    const editorState = useEditorState({
        editor,
        selector: (ctx) => ({
        canUndo: ctx.editor?.can().undo() ?? false,
        canRedo: ctx.editor?.can().redo() ?? false,
        isBold: ctx.editor?.isActive("bold") ?? false,
        isItalic: ctx.editor?.isActive("italic") ?? false,
        isUnderline: ctx.editor?.isActive("underline") ?? false,
        isStrike: ctx.editor?.isActive("strike") ?? false,
        isBulletList: ctx.editor?.isActive("bulletList") ?? false,
        isOrderedList: ctx.editor?.isActive("orderedList") ?? false,
        color: ctx.editor?.getAttributes("textStyle").color ?? "#000000",
        fontFamily: ctx.editor?.getAttributes("textStyle").fontFamily ?? "",
        fontSize: ctx.editor?.getAttributes("textStyle").fontSize ?? "11pt",
        }),
    });

    /* ─────────── Export (.docx via API, with fallback) ─────────── */

    const handleExport = async () => {
        if (!editor) return;
        setIsExporting(true);
        try {
        const headerHtml = headerText.trim()
            ? `<p style="color:#6b7280;font-size:9pt;border-bottom:1px solid #d1d5db;padding-bottom:4px;">${escapeHtml(
                headerText,
            )}</p>`
            : "";
        const footerHtml = footerText.trim()
            ? `<p style="color:#6b7280;font-size:9pt;border-top:1px solid #d1d5db;padding-top:4px;">${escapeHtml(
                footerText,
            )}</p>`
            : "";
        const fullHtml = wrapHtmlForExport(
            `${headerHtml}${editor.getHTML()}${footerHtml}`,
        );
        const base = fileName.replace(/\.[^/.]+$/, "") || "document";

        try {
            const res = await fetch("/api/docx/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: fullHtml }),
            });
            if (!res.ok) throw new Error("Server export failed");
            downloadBlob(await res.blob(), `${base}.docx`);
        } catch (apiErr) {
            console.warn("DOCX API failed, using Word-compatible fallback", apiErr);
            downloadBlob(
            new Blob(["\ufeff", fullHtml], { type: "application/msword" }),
            `${base}.doc`,
            );
        }
        } catch (err) {
        console.error(err);
        alert("Export failed. Please try again.");
        } finally {
        setIsExporting(false);
        }
    };

    const handleClose = () => {
        window.close();
        setTimeout(() => {
        window.location.href = "/tools?q=docx";
        }, 150);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
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
        e.target.value = "";
    };

    /* Toolbar button that doesn't steal editor focus */
    const tb = (active?: boolean) =>
        `p-1.5 rounded ${
        active ? "bg-zinc-700" : "hover:bg-zinc-800"
        } disabled:opacity-40`;
    const keepFocus = (e: React.MouseEvent) => e.preventDefault();

    if (isLoading) {
        return (
        <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-white">
            <Loader2 className="w-8 h-8 animate-spin mr-3" /> Loading Editor...
        </div>
        );
    }

    const safeColor = /^#[0-9a-fA-F]{6}$/.test(editorState?.color ?? "")
        ? editorState!.color
        : "#000000";

    return (
        <div className="h-screen w-full flex flex-col bg-zinc-900">
        {/* HEADER / TOOLBAR */}
        <div className="flex flex-col shrink-0 sticky top-0 z-10 shadow-md">
            <div className="flex items-center justify-between p-2 bg-zinc-950 border-b border-zinc-800">
            <div className="flex items-center gap-4 text-zinc-300">
                <FileText className="w-5 h-5 text-emerald-500" />
                <span className="font-medium text-sm">{fileName}</span>
            </div>
            <div className="flex items-center gap-2">
                <Button
                onClick={handleExport}
                size="sm"
                disabled={isExporting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                )}
                Download .docx
                </Button>
                <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                >
                <X className="w-4 h-4 mr-2" /> Close
                </Button>
            </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-900 border-b border-zinc-800 text-zinc-300">
            <button
                type="button"
                title="Undo"
                onMouseDown={keepFocus}
                disabled={!editorState?.canUndo}
                onClick={() => editor?.chain().focus().undo().run()}
                className={tb()}
            >
                <Undo2 className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Redo"
                onMouseDown={keepFocus}
                disabled={!editorState?.canRedo}
                onClick={() => editor?.chain().focus().redo().run()}
                className={tb()}
            >
                <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-zinc-700 mx-1" />

            <select
                value={editorState?.fontFamily}
                onChange={(e) =>
                e.target.value
                    ? editor?.chain().focus().setFontFamily(e.target.value).run()
                    : editor?.chain().focus().unsetFontFamily().run()
                }
                className="bg-zinc-800 text-xs rounded px-1 py-1 outline-none"
            >
                <option value="">Default</option>
                <option value="Arial">Arial</option>
                <option value="Calibri">Calibri</option>
                <option value="Times New Roman">Times New Roman</option>
            </select>

            <select
                value={editorState?.fontSize}
                onChange={(e) =>
                editor?.chain().focus().setFontSize(e.target.value).run()
                }
                className="bg-zinc-800 text-xs rounded px-1 py-1 outline-none"
            >
                {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                    {s}
                </option>
                ))}
            </select>
            <div className="w-px h-5 bg-zinc-700 mx-1" />

            <button
                type="button"
                title="Bold"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={tb(editorState?.isBold)}
            >
                <Bold className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Italic"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={tb(editorState?.isItalic)}
            >
                <Italic className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Underline"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                className={tb(editorState?.isUnderline)}
            >
                <UnderlineIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Strikethrough"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                className={tb(editorState?.isStrike)}
            >
                <Strikethrough className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <button
                type="button"
                title="Bullet List"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={tb(editorState?.isBulletList)}
            >
                <ListIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Numbered List"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                className={tb(editorState?.isOrderedList)}
            >
                <ListOrdered className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <button
                type="button"
                title="Align Left"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().setTextAlign("left").run()}
                className={tb()}
            >
                <AlignLeft className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Align Center"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().setTextAlign("center").run()}
                className={tb()}
            >
                <AlignCenter className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Align Right"
                onMouseDown={keepFocus}
                onClick={() => editor?.chain().focus().setTextAlign("right").run()}
                className={tb()}
            >
                <AlignRight className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Justify"
                onMouseDown={keepFocus}
                onClick={() =>
                editor?.chain().focus().setTextAlign("justify").run()
                }
                className={tb()}
            >
                <AlignJustify className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <label
                title="Text Color"
                className="relative p-1.5 hover:bg-zinc-800 rounded cursor-pointer"
            >
                <Palette className="w-4 h-4" />
                <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={safeColor}
                onChange={(e) =>
                    editor?.chain().focus().setColor(e.target.value).run()
                }
                />
            </label>
            <label
                title="Highlight"
                className="relative p-1.5 hover:bg-zinc-800 rounded cursor-pointer"
            >
                <Highlighter className="w-4 h-4" />
                <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer"
                defaultValue="#fef08a"
                onChange={(e) =>
                    editor
                    ?.chain()
                    .focus()
                    .setHighlight({ color: e.target.value })
                    .run()
                }
                />
            </label>

            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <button
                type="button"
                title="Insert Table"
                onMouseDown={keepFocus}
                onClick={() =>
                editor
                    ?.chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                className={tb()}
            >
                <TableIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Toggle Table Borders"
                onMouseDown={keepFocus}
                onClick={() => setShowGrid((v) => !v)}
                className={tb(showGrid)}
            >
                <Grid3X3 className="w-4 h-4" />
            </button>
            <button
                type="button"
                title="Insert Image"
                onMouseDown={keepFocus}
                onClick={() => fileInputRef.current?.click()}
                className={tb()}
            >
                <ImageIcon className="w-4 h-4" />
            </button>
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleImageUpload}
            />
            </div>
        </div>

        {/* PAGE CANVAS */}
        <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-zinc-900">
            <div className="w-[794px] shrink-0 flex flex-col">
            {/* Document-level header (included once at top of export) */}
            <input
                type="text"
                placeholder="Click to add Header"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="w-full bg-white border border-zinc-700 rounded-t-md p-4 mb-4 text-xs text-gray-500 focus:outline-none placeholder-gray-300"
            />

            {/* Paginated body — grid class lives on this wrapper (CSS uses descendant selectors) */}
            <div
                className={`shadow-[0_0_20px_rgba(0,0,0,0.5)] ${
                showGrid ? "show-grid" : "hide-grid"
                }`}
            >
                <EditorContent editor={editor} />
            </div>

            {/* Document-level footer (included once at bottom of export) */}
            <input
                type="text"
                placeholder="Click to add Footer"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="w-full bg-white border border-zinc-700 rounded-b-md p-4 mt-4 text-xs text-gray-500 focus:outline-none placeholder-gray-300"
            />
            </div>
        </div>
        </div>
    );
    }
