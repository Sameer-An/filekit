    import { NextRequest, NextResponse } from "next/server";
    import { writeFile, readFile, unlink, mkdir } from "fs/promises";
    import { exec } from "child_process";
    import { promisify } from "util";
    import { join } from "path";
    import { tmpdir } from "os";
    import { randomUUID } from "crypto";

    const execAsync = promisify(exec);

    export const runtime = "nodejs";
    export const maxDuration = 60;

    export async function POST(req: NextRequest) {
    const { html } = await req.json();
    if (!html)
        return NextResponse.json({ error: "html required" }, { status: 400 });

    const id = randomUUID();
    const workDir = join(tmpdir(), `docx-${id}`);
    await mkdir(workDir, { recursive: true });
    const htmlPath = join(workDir, "input.html");
    const docxPath = join(workDir, "input.docx");

    try {
        await writeFile(htmlPath, html, "utf-8");

        // Note: This requires LibreOffice to be installed on your machine/server
        await execAsync(
        `libreoffice --headless --convert-to docx:"MS Word 2007 XML" --outdir "${workDir}" "${htmlPath}"`,
        { timeout: 45_000 },
        );

        const buffer = await readFile(docxPath);
        return new NextResponse(buffer, {
        headers: {
            "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": 'attachment; filename="document.docx"',
        },
        });
    } catch (err) {
        console.error(
        "LibreOffice export failed, falling back to html-to-docx:",
        err,
        );

        // Fallback: html-to-docx npm package
        try {
        // FIX 1: Suppress missing type declaration error
        // @ts-expect-error - html-to-docx does not provide its own type definitions
        const { default: HTMLtoDOCX } = await import("html-to-docx");

        const buf = await HTMLtoDOCX(html, null, {
            table: { row: { cantSplit: true } },
            footer: false,
            pageNumber: false,
        });

        // FIX 2: Replaced `any` with proper ArrayBuffer cast to satisfy NextResponse
        return new NextResponse(buf as unknown as Uint8Array<ArrayBuffer>, {
            headers: {
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
        });
        } catch {
        return NextResponse.json(
            { error: "DOCX export failed" },
            { status: 500 },
        );
        }
    } finally {
        try {
        await unlink(htmlPath);
        } catch {}
        try {
        await unlink(docxPath);
        } catch {}
    }
    }
