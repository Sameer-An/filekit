import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { pathToFileURL } from "url";

const run = promisify(execFile);

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

const pythonBin = () =>
process.env.PYTHON_PATH ||
(process.platform === "win32" ? "python" : "python3");

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
const dir = await mkdtemp(join(tmpdir(), "filekit-"));
try {
    return await fn(dir);
} finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
}
}

export function docxToPdf(input: Buffer): Promise<Buffer> {
return withTempDir(async (dir) => {
    const src = join(dir, "input.docx");
    await writeFile(src, input);
    const profile = pathToFileURL(join(dir, "profile")).href;
    await run(
    await findSoffice(),
    [
        `-env:UserInstallation=${profile}`,
        "--headless",
        "--norestore",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        dir,
        src,
    ],
    { timeout: 120_000 },
    );
    return readFile(join(dir, "input.pdf"));
});
}

export function pdfToDocx(input: Buffer): Promise<Buffer> {
return withTempDir(async (dir) => {
    const src = join(dir, "input.pdf");
    const dst = join(dir, "output.docx");
    await writeFile(src, input);
    await run(
    pythonBin(),
    [join(process.cwd(), "scripts", "pdf_to_docx.py"), src, dst],
    {
        timeout: 170_000,
        maxBuffer: 20 * 1024 * 1024,
    },
    );
    return readFile(dst);
});
}
