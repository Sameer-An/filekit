import { NextRequest, NextResponse } from "next/server";
import { pdfToDocx } from "@/lib/convert-server";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File))
    return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > 100 * 1024 * 1024)
    return NextResponse.json(
        { error: "File too large (max 100 MB)" },
        { status: 413 },
    );
    const buf = Buffer.from(await file.arrayBuffer());
    // PDF files start with "%PDF"
    if (!buf.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46])))
    return NextResponse.json(
        { error: "Not a valid PDF file" },
        { status: 400 },
    );
    const out = await pdfToDocx(buf);
    return new NextResponse(new Uint8Array(out), {
    headers: {
        "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    });
} catch (err) {
    console.error("pdf-to-docx failed:", err);
    const msg = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
}
}
