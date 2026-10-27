import path from 'path';
import os from 'os';

export const MAX_FILE_SIZE_MB = 200;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Determine FFmpeg binary path across Windows/Linux
export function getFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const hardcodedWin = 'C:\\FFMPEG\\ffmpeg-2025-08-11-git-3542260376-full_build\\bin\\ffmpeg.exe';
  const fs = require('fs');
  if (process.platform === 'win32' && fs.existsSync(hardcodedWin)) {
    return hardcodedWin;
  }
  return 'ffmpeg';
}

export const FFMPEG_PATH = getFfmpegPath();
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'FileKit-uploads');
export const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(os.tmpdir(), 'FileKit-outputs');
export const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mp4', 'audio/opus'];
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/x-matroska', 'video/x-msvideo', 'video/quicktime'];

export const APP_NAME = 'FileKit';
export const APP_TAGLINE = 'Every File. Every Format. One Simple Workspace.';
export const APP_DESCRIPTION = 'Convert, edit, compress, enhance, and organize your files in one place. Free core tools, no account required.';
