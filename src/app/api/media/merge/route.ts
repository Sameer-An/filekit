import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { FFMPEG_PATH, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MERGE_FILES = 20;

export async function POST(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `FileKit-merge-${jobId}`);

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const rawMediaType = (formData.get("mediaType") as string) || "audio";
    const mediaType = rawMediaType === "video" ? "video" : "audio";
    const rawFormat = (formData.get("outputFormat") as string)?.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
    const outputFormat = rawFormat || (mediaType === "video" ? "mp4" : "mp3");

    if (!files || files.length < 2) {
      return NextResponse.json({ error: "At least 2 files are required for merging" }, { status: 400 });
    }

    if (files.length > MAX_MERGE_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_MERGE_FILES} files allowed per merge request` }, { status: 400 });
    }

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (totalSize > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: "Combined file size exceeds 200 MB limit" }, { status: 413 });
      }
    }

    fs.mkdirSync(workDir, { recursive: true });

    // Write input files and build concat list
    const concatListPath = path.join(workDir, "concat_list.txt");
    const concatLines: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.name).replace(".", "").toLowerCase() || (mediaType === "video" ? "mp4" : "mp3");
      const inputPath = path.join(workDir, `input_${i}.${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(inputPath, buf);
      concatLines.push(`file '${inputPath.replace(/\\/g, "/")}'`);
    }

    fs.writeFileSync(concatListPath, concatLines.join("\n"), "utf8");

    const outputFilename = `merged_${Date.now()}.${outputFormat}`;
    const outputPath = path.join(workDir, outputFilename);

    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
    ];

    if (mediaType === "video") {
      args.push("-c", "copy");
    } else {
      args.push("-c", "copy");
    }

    args.push(outputPath);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, args, { windowsHide: true });
      let stderr = "";
      ffmpeg.stderr.on("data", (d) => { stderr += d.toString(); });
      ffmpeg.on("error", (err) => reject(new Error(`FFmpeg not found: ${err.message}`)));
      ffmpeg.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(stderr.slice(-300) || "Merge failed"));
      });
    });

    const outputBuffer = fs.readFileSync(outputPath);
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": mediaType === "video" ? `video/${outputFormat}` : `audio/${outputFormat}`,
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
