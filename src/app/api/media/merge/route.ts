import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { FFMPEG_PATH, MAX_FILE_SIZE_BYTES } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `FileKit-merge-${jobId}`);

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const rawMediaType = (formData.get('mediaType') as string) || 'audio';
    const mediaType = rawMediaType === 'video' ? 'video' : 'audio';
    const rawFormat = (formData.get('outputFormat') as string)?.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    const outputFormat = rawFormat || (mediaType === 'video' ? 'mp4' : 'mp3');

    if (!files || files.length < 2) {
      return NextResponse.json({ error: 'At least 2 files are required for merging' }, { status: 400 });
    }

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (totalSize > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: 'Combined file size exceeds 200 MB limit' }, { status: 413 });
      }
    }

    fs.mkdirSync(workDir, { recursive: true });

    // Write input files and build concat list
    const concatListPath = path.join(workDir, 'concat_list.txt');
    const concatLines: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.name).replace('.', '').toLowerCase() || (mediaType === 'video' ? 'mp4' : 'mp3');
      const inputPath = path.join(workDir, `input_${i}.${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(inputPath, buf);
      concatLines.push(`file '${inputPath.replace(/\\/g, '/')}'`);
    }

    fs.writeFileSync(concatListPath, concatLines.join('\n'), 'utf8');

    const outputFilename = `merged_${Date.now()}.${outputFormat}`;
    const outputPath = path.join(workDir, outputFilename);

    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
    ];

    if (mediaType === 'video') {
      args.push('-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', outputPath);
    } else {
      args.push('-c:a', outputFormat === 'wav' ? 'pcm_s16le' : 'libmp3lame', '-q:a', '2', outputPath);
    }

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, args, { windowsHide: true, timeout: 240000 });
      let stderr = '';
      ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
      ffmpeg.on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)));
      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-300)}`));
      });
    });

    const outputBuffer = fs.readFileSync(outputPath);
    const mimeType = mediaType === 'video' ? 'video/mp4' : (outputFormat === 'wav' ? 'audio/wav' : 'audio/mpeg');

    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
        'Content-Length': outputBuffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    try {
      if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    const message = error instanceof Error ? error.message : 'Merging failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
