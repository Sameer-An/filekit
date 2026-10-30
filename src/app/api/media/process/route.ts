import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { FFMPEG_PATH, MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Supported output extensions and MIME types
const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export async function POST(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `FileKit-media-${jobId}`);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawOperation = (formData.get('operation') as string) || 'convert';
    const operation = rawOperation.replace(/[^a-zA-Z0-9_-]/g, '');
    const requestedFormat = (formData.get('outputFormat') as string)?.toLowerCase() || 'mp4';
    const outputFormat = MIME_MAP[requestedFormat] ? requestedFormat : 'mp4';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum allowed limit of 200 MB' },
        { status: 413 }
      );
    }

    // Create isolated job directory
    fs.mkdirSync(workDir, { recursive: true });

    // Strictly sanitize extensions
    const origExt = path.extname(file.name).replace('.', '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
    const inputPath = path.join(workDir, `input.${origExt}`);
    const outputFilename = `output_${operation}_${Date.now()}.${outputFormat}`;
    const outputPath = path.join(workDir, outputFilename);

    // Write input file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    // Build safe FFmpeg arguments
    const args: string[] = ['-y', '-i', inputPath];

    // Extra parameters
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const crf = formData.get('crf') as string;
    const bitrate = formData.get('bitrate') as string;
    const resolution = formData.get('resolution') as string;
    const volumeChange = formData.get('volumeChange') as string;
    const fadeIn = formData.get('fadeIn') as string;
    const fadeOut = formData.get('fadeOut') as string;
    const fps = formData.get('fps') as string;

    switch (operation) {
      case 'trim':
      case 'video-trim':
      case 'audio-trim':
        if (startTime) args.push('-ss', startTime);
        if (endTime) args.push('-to', endTime);
        break;

      case 'video-compress':
      case 'compress':
        if (outputFormat === 'mp4') {
          args.push('-c:v', 'libx264', '-crf', crf || '28', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k');
        } else if (outputFormat === 'webm') {
          args.push('-c:v', 'libvpx-vp9', '-crf', crf || '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '96k');
        }
        break;

      case 'video-to-gif':
        args.push(
          '-vf',
          `fps=${fps || '12'},scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
        );
        break;

      case 'extract-audio':
      case 'video-extract-audio':
      case 'mp4-to-mp3':
        args.push('-vn');
        if (outputFormat === 'mp3') {
          args.push('-c:a', 'libmp3lame', '-q:a', '2');
        } else if (outputFormat === 'wav') {
          args.push('-c:a', 'pcm_s16le');
        } else if (outputFormat === 'aac') {
          args.push('-c:a', 'aac', '-b:a', '192k');
        } else if (outputFormat === 'ogg') {
          args.push('-c:a', 'libvorbis', '-q:a', '4');
        }
        break;

      case 'video-thumbnail':
      case 'thumbnail':
        args.push('-ss', startTime || '00:00:01', '-vframes', '1');
        break;

      case 'video-mute':
      case 'mute':
        args.push('-an', '-c:v', 'copy');
        break;

      case 'video-resize':
      case 'resize':
        if (resolution === '720p') {
          args.push('-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-c:a', 'copy');
        } else if (resolution === '1080p') {
          args.push('-vf', 'scale=-2:1080', '-c:v', 'libx264', '-crf', '23', '-c:a', 'copy');
        } else if (resolution === '480p') {
          args.push('-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '23', '-c:a', 'copy');
        } else if (resolution === '360p') {
          args.push('-vf', 'scale=-2:360', '-c:v', 'libx264', '-crf', '23', '-c:a', 'copy');
        }
        break;

      case 'audio-compress':
        if (outputFormat === 'mp3') {
          args.push('-b:a', bitrate ? `${bitrate}k` : '96k', '-c:a', 'libmp3lame');
        } else if (outputFormat === 'aac') {
          args.push('-b:a', bitrate ? `${bitrate}k` : '96k', '-c:a', 'aac');
        } else if (outputFormat === 'ogg') {
          args.push('-b:a', bitrate ? `${bitrate}k` : '96k', '-c:a', 'libvorbis');
        }
        break;

      case 'audio-volume':
        args.push('-af', `volume=${volumeChange || '3'}dB`);
        break;

      case 'audio-fade':
        {
          const filters: string[] = [];
          if (fadeIn && Number(fadeIn) > 0) {
            filters.push(`afade=t=in:ss=0:d=${fadeIn}`);
          }
          if (fadeOut && Number(fadeOut) > 0) {
            filters.push(`afade=t=out:st=10:d=${fadeOut}`);
          }
          if (filters.length > 0) {
            args.push('-af', filters.join(','));
          }
        }
        break;

      case 'audio-to-wav':
        args.push('-c:a', 'pcm_s16le');
        break;

      default:
        // Default conversion
        if (outputFormat === 'mp4') {
          args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
        } else if (outputFormat === 'webm') {
          args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus');
        } else if (outputFormat === 'mp3') {
          args.push('-c:a', 'libmp3lame', '-q:a', '2');
        } else if (outputFormat === 'wav') {
          args.push('-c:a', 'pcm_s16le');
        } else if (outputFormat === 'gif') {
          args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos');
        }
        break;
    }

    args.push(outputPath);

    // Execute FFmpeg safely with timeout
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, args, {
        windowsHide: true,
        timeout: 180000, // 3 minutes timeout
      });

      let stderr = '';
      ffmpeg.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
        }
      });
    });

    // Read result
    const outputBuffer = fs.readFileSync(outputPath);
    const mimeType = MIME_MAP[outputFormat] || 'application/octet-stream';

    // Cleanup temp files immediately
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }

    const downloadName = `${path.basename(file.name, path.extname(file.name))}_processed.${outputFormat}`;

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': outputBuffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    // Attempt cleanup on failure
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }

    const message = error instanceof Error ? error.message : 'Processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
