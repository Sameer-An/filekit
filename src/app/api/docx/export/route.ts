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
        // FIX: Removed html-to-docx fallback as requested to clear vulnerabilities
        console.error("DOCX export failed:", err);
        return NextResponse.json(
        { error: "DOCX export failed. Is LibreOffice installed (SOFFICE_PATH)?" },
        { status: 500 },
        );
    } finally {
        try {
        await unlink(htmlPath);
        } catch {}
        try {
        await unlink(docxPath);
        } catch {}
    }
    }
