import fs from 'fs';
import path from 'path';
import os from 'os';

const WIN_FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  'C:\\FFMPEG\\ffmpeg-2025-08-11-git-3542260376-full_build\\bin\\ffmpeg.exe',
  'C:\\ffmpeg\\bin\\ffmpeg.exe',
].filter(Boolean) as string[];

export function getFfmpegPath(): string {
  if (process.platform === 'win32') {
    for (const candidate of WIN_FFMPEG_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

export function getQpdfPath(): string {
  if (process.env.QPDF_PATH && fs.existsSync(process.env.QPDF_PATH)) return process.env.QPDF_PATH;
  if (process.platform === 'win32') {
    const candidate = 'C:\\Program Files\\qpdf\\bin\\qpdf.exe';
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'qpdf';
}

export function safeTime(value: string | null | undefined, fallback = '00:00:00'): string {
  const v = (value || '').trim();
  if (/^\d{1,2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(v)) return v;
  if (/^\d+(\.\d+)?$/.test(v)) return v;
  return fallback;
}

export function safeNumber(value: string | null | undefined, fallback: number, min: number, max: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(max, Math.max(min, n)));
}

export function makeJobDir(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}
