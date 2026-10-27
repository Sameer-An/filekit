import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getQpdfPath, makeJobDir } from '@/lib/media-binaries';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const workDir = makeJobDir(`FileKit-protect-${uuidv4()}`);
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const password = String(formData.get('password') || '');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!password || password.length < 1 || password.length > 64) {
      return NextResponse.json({ error: 'Password must be 1–64 characters' }, { status: 400 });
    }
    if (/[\r\n]/.test(password)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    fs.mkdirSync(workDir, { recursive: true });
    const inputPath = path.join(workDir, 'input.pdf');
    const outputPath = path.join(workDir, 'output.pdf');
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    await new Promise<void>((resolve, reject) => {
      const qpdf = spawn(
        getQpdfPath(),
        ['--encrypt', password, password, '256', '--', inputPath, outputPath],
        { windowsHide: true }
      );
      let stderr = '';
      qpdf.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      qpdf.on('error', (err) => reject(new Error(`qpdf is not installed: ${err.message}`)));
      qpdf.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(stderr.slice(-280) || 'qpdf failed. Install qpdf to encrypt PDFs.'));
      });
    });

    const output = fs.readFileSync(outputPath);
    fs.rmSync(workDir, { recursive: true, force: true });
    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="protected.pdf"',
      },
    });
  } catch (error: unknown) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : 'Encryption failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
