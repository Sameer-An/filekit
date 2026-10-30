import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getFfmpegPath, getQpdfPath } from "@/lib/media-binaries";
import { AVAILABLE_TOOL_COUNT } from "@/lib/tools-registry";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function canRun(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 || code === 1));
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(false);
    }, 4000);
  });
}

export async function GET(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req, { capacity: 60, windowMs: 60_000 });
  if (rateLimitResponse) return rateLimitResponse;

  const ffmpeg = getFfmpegPath();
  const qpdf = getQpdfPath();
  const ffmpegOk = await canRun(ffmpeg, ["-version"]);
  const qpdfOk = await canRun(qpdf, ["--version"]);
  return NextResponse.json({
    ok: true,
    tools: AVAILABLE_TOOL_COUNT,
    ffmpeg: { path: ffmpeg, available: ffmpegOk },
    qpdf: { path: qpdf, available: qpdfOk },
  });
}
