import { NextRequest, NextResponse } from "next/server";
import { docxToPdf } from "@/lib/convert-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

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
    if (!buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
      return NextResponse.json(
        { error: "Not a valid DOCX file" },
        { status: 400 },
      );
    const out = await docxToPdf(buf);
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("docx-to-pdf failed:", err);
    const msg = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
