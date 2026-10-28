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

const ALIGN_MAP: Record<string, any> = {
left: AlignmentType.LEFT,
center: AlignmentType.CENTER,
right: AlignmentType.RIGHT,
justify: AlignmentType.JUSTIFIED,
};

function hexToColor(hex?: string) {
if (!hex) return undefined;
return hex.replace("#", "").toUpperCase();
}

function marksToTextRun(node: JSONContent, text: string): TextRun {
const marks = node.marks ?? [];
const bold = marks.some((m) => m.type === "bold");
const italic = marks.some((m) => m.type === "italic");
const underline = marks.some((m) => m.type === "underline");
const strike = marks.some((m) => m.type === "strike");
const code = marks.some((m) => m.type === "code");
const highlight = marks.find((m) => m.type === "highlight");
const textStyle = marks.find((m) => m.type === "textStyle");
const link = marks.find((m) => m.type === "link");

return new TextRun({
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
    // Link support
    ...(link?.attrs?.href ? { style: "Hyperlink", children: [] as any } : {}),
});
}

function inlineContentToRuns(nodes: JSONContent[] = []): TextRun[] {
const runs: TextRun[] = [];
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
    return (node.content ?? []).flatMap((item, i) =>
        (item.content ?? []).flatMap((child, j) =>
        blockToParagraph(child).map((p) => {
            // Attach bullet/num info
            return new Paragraph({
            children: p.root?.[0]?.root?.length ? [] : [],
            // Simplest: rebuild as bullet paragraph
            bullet: node.type === "bulletList" ? { level: 0 } : undefined,
            numbering:
                node.type === "orderedList"
                ? { reference: "ordered-list", level: 0, instance: i }
                : undefined,
            });
        }),
        ),
    );
    }
    case "blockquote": {
    return (node.content ?? []).flatMap((child) =>
        blockToParagraph(child).map(
        (p) =>
            new Paragraph({
            children: [],
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
    const base64 = src.split(",")[1];
    if (!base64) return [];
    const buffer = Buffer.from(base64, "base64");
    return [
        new Paragraph({
        children: [
            new ImageRun({
            data: buffer,
            transformation: {
                width: attrs.width ?? 400,
                height: attrs.height ?? 300,
            },
            }),
        ],
        }),
    ];
    }
    case "table": {
    const rows = (node.content ?? []).map(
        (row) =>
        new TableRow({
            children: (row.content ?? []).map(
            (cell) =>
                new TableCell({
                children: (cell.content ?? []).flatMap((child) =>
                    blockToParagraph(child),
                ),
                width: {
                    size: 100 / (row.content?.length ?? 1),
                    type: WidthType.PERCENTAGE,
                },
                }),
            ),
        }),
    );
    return [new Paragraph({ children: [] }), ...([] as any)]; // replaced below
    }
    default:
    // Fallback: render children
    return (node.content ?? []).flatMap(blockToParagraph);
}
}

// Cleaner table handler
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
