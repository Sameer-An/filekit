import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, rm, mkdtemp, access } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { pathToFileURL } from "url";
import { checkRateLimit } from "@/lib/rate-limit";

const runExecFile = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HTML_LENGTH = 2_000_000; // 2MB cap

async function findSoffice(): Promise<string> {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  if (process.platform === "win32") {
    for (const c of [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ]) {
      try {
        await access(c);
        return c;
      } catch {}
    }
  }
  return "soffice";
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { html?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  if (typeof body.html !== "string" || body.html.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'html' is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (body.html.length > MAX_HTML_LENGTH) {
    return NextResponse.json(
      { error: `HTML payload exceeds maximum allowed size (${MAX_HTML_LENGTH} bytes)` },
      { status: 413 },
    );
  }

  let workDir = "";
  try {
    workDir = await mkdtemp(join(tmpdir(), "filekit-docx-"));
    const htmlPath = join(workDir, "input.html");
    const docxPath = join(workDir, "input.docx");
    const profileDir = join(workDir, "profile");

    await writeFile(htmlPath, body.html, "utf-8");

    const sofficeBin = await findSoffice();
    const profileUrl = pathToFileURL(profileDir).href;

    await runExecFile(
      sofficeBin,
      [
        `-env:UserInstallation=${profileUrl}`,
        "--headless",
        "--norestore",
        "--convert-to",
        'docx:MS Word 2007 XML',
        "--outdir",
        workDir,
        htmlPath,
      ],
      { timeout: 45_000 },
    );

    const buffer = await readFile(docxPath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="document.docx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("DOCX export failed:", err);
    return NextResponse.json(
      { error: "DOCX export failed. Ensure LibreOffice is installed and SOFFICE_PATH is set if needed." },
      { status: 500 },
    );
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
