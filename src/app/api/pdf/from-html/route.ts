    import { NextRequest, NextResponse } from "next/server";
    import { chromium } from "playwright";

    export const runtime = "nodejs";
    export const maxDuration = 60;

    export async function POST(req: NextRequest) {
    const { html } = await req.json();

    if (!html) {
        return NextResponse.json({ error: "html required" }, { status: 400 });
    }

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });

        const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
        });

        // FIX: Casted Buffer to Uint8Array<ArrayBuffer> to satisfy NextResponse strict typing
        return new NextResponse(pdf as unknown as Uint8Array<ArrayBuffer>, {
        headers: { "Content-Type": "application/pdf" },
        });
    } finally {
        await browser.close();
    }
    }
