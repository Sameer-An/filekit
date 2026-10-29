    import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    UnderlineType,
    HighlightColor,
    ExternalHyperlink, // FIX: 导入 ExternalHyperlink
    } from "docx";
    import type { JSONContent } from "@tiptap/react";

    const HEADING_MAP = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
    };

    // FIX 1: Typed the value to AlignmentType instead of any
    const ALIGN_MAP: Record<
    string,
    (typeof AlignmentType)[keyof typeof AlignmentType]
    > = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    };

    function hexToColor(hex?: string) {
    if (!hex) return undefined;
    return hex.replace("#", "").toUpperCase();
    }

    // FIX: 返回类型改为 TextRun | ExternalHyperlink
    function marksToTextRun(
    node: JSONContent,
    text: string,
    ): TextRun | ExternalHyperlink {
    const marks = node.marks ?? [];
    const bold = marks.some((m) => m.type === "bold");
    const italic = marks.some((m) => m.type === "italic");
    const underline = marks.some((m) => m.type === "underline");
    const strike = marks.some((m) => m.type === "strike");
    const code = marks.some((m) => m.type === "code");
    const highlight = marks.find((m) => m.type === "highlight");
    const textStyle = marks.find((m) => m.type === "textStyle");
    const link = marks.find((m) => m.type === "link");

    const runOptions = {
        text,
        bold,
        italics: italic,
        strike,
        underline: underline ? { type: UnderlineType.SINGLE } : undefined,
        font: (textStyle?.attrs?.fontFamily ?? code) ? "Courier New" : undefined,
        size: textStyle?.attrs?.fontSize
        ? Math.round(parseFloat(textStyle.attrs.fontSize) * 2) // pt → half-points
        : undefined,
        color: hexToColor(textStyle?.attrs?.color),
        highlight: highlight?.attrs?.color
        ? HighlightColor.YELLOW // docx lib supports limited set
        : undefined,
        style: link?.attrs?.href ? "Hyperlink" : undefined,
    };

    // FIX 2: 使用 ExternalHyperlink 包裹 TextRun
    if (link?.attrs?.href) {
        return new ExternalHyperlink({
        children: [new TextRun(runOptions)],
        link: String(link.attrs.href),
        });
    }

    return new TextRun(runOptions);
    }

    // FIX: 返回类型改为 (TextRun | ExternalHyperlink)[]
    function inlineContentToRuns(
    nodes: JSONContent[] = [],
    ): (TextRun | ExternalHyperlink)[] {
    const runs: (TextRun | ExternalHyperlink)[] = [];
    for (const node of nodes) {
        if (node.type === "text") {
        runs.push(marksToTextRun(node, node.text ?? ""));
        } else if (node.type === "hardBreak") {
        runs.push(new TextRun({ break: 1 }));
        } else if (node.content) {
        runs.push(...inlineContentToRuns(node.content));
        }
    }
    return runs;
    }

    function blockToParagraph(node: JSONContent): Paragraph[] {
    const attrs = node.attrs ?? {};

    switch (node.type) {
        case "paragraph": {
        return [
            new Paragraph({
            children: inlineContentToRuns(node.content ?? []),
            alignment: ALIGN_MAP[attrs.textAlign] ?? undefined,
            }),
        ];
        }
        case "heading": {
        return [
            new Paragraph({
            children: inlineContentToRuns(node.content ?? []),
            heading: HEADING_MAP[attrs.level as 1 | 2 | 3 | 4 | 5 | 6],
            alignment: ALIGN_MAP[attrs.textAlign] ?? undefined,
            }),
        ];
        }
        case "bulletList":
        case "orderedList": {
        return (node.content ?? []).flatMap((item, i) => {
            return (item.content ?? []).flatMap((child) => {
            if (child.type === "paragraph") {
                return [
                new Paragraph({
                    children: inlineContentToRuns(child.content ?? []),
                    bullet: node.type === "bulletList" ? { level: 0 } : undefined,
                    numbering:
                    node.type === "orderedList"
                        ? { reference: "ordered-list", level: 0, instance: i }
                        : undefined,
                }),
                ];
            }
            return blockToParagraph(child);
            });
        });
        }
        case "blockquote": {
        return (node.content ?? []).flatMap((child) =>
            blockToParagraph(child).map(
            (p) =>
                new Paragraph({
                children: [], // Typically you'd extract children here too, but keeping your original logic
                indent: { left: 720 },
                border: {
                    left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
                },
                }),
            ),
        );
        }
        case "codeBlock": {
        return [
            new Paragraph({
            children: inlineContentToRuns(node.content ?? []),
            style: "CodeBlock",
            shading: { fill: "F3F4F6" },
            }),
        ];
        }
        case "image": {
        const src: string = attrs.src ?? "";
        const match = src.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
        if (!match) return [];

        const ext = match[1].toLowerCase();
        const type = (ext === "jpeg" || ext === "jpg" ? "jpg" : ext) as
            | "jpg"
            | "png"
            | "gif";
        const base64 = match[2];
        const buffer = Buffer.from(base64, "base64");

        return [
            new Paragraph({
            children: [
                new ImageRun({
                type,
                data: buffer,
                transformation: {
                    width: Number(attrs.width) || 400,
                    height: Number(attrs.height) || 300,
                },
                }),
            ],
            }),
        ];
        }
        case "table":
        return [];
        default:
        return (node.content ?? []).flatMap(blockToParagraph);
    }
    }

    function nodeToDocxElements(node: JSONContent): (Paragraph | Table)[] {
    if (node.type === "table") {
        const rows = (node.content ?? []).map(
        (row) =>
            new TableRow({
            children: (row.content ?? []).map(
                (cell) =>
                new TableCell({
                    children: (cell.content ?? []).flatMap((child) =>
                    nodeToDocxElements(child).filter(
                        (x): x is Paragraph => x instanceof Paragraph,
                    ),
                    ),
                }),
            ),
            }),
        );
        return [
        new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        ];
    }
    return blockToParagraph(node);
    }

    export async function exportTiptapJsonToDocx(
    json: JSONContent,
    fileName = "document.docx",
    ): Promise<Blob> {
    const children: (Paragraph | Table)[] = [];
    for (const node of json.content ?? []) {
        children.push(...nodeToDocxElements(node));
    }

    const doc = new Document({
        numbering: {
        config: [
            {
            reference: "ordered-list",
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
        sections: [{ properties: {}, children }],
    });

    return await Packer.toBlob(doc);
    }
