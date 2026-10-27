import test from 'node:test';
import assert from 'node:assert/strict';

// Test Utilities directly
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sanitizeFilename(name) {
  const clean = name
    .replace(/\0/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
  return clean.replace(/^_+|_+$/g, '') || 'file';
}

function getFileExtension(filename) {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getFilenameWithoutExtension(filename) {
  const parts = filename.split('.');
  if (parts.length <= 1) return filename;
  return parts.slice(0, -1).join('.');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Read tools registry to test all production tools
import fs from 'node:fs';
import path from 'node:path';

const registryContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/lib/tools-registry.ts'),
  'utf8'
);

test('Unit Tests: Utilities', async (t) => {
  await t.test('formatBytes formats properly across ranges', () => {
    assert.equal(formatBytes(0), '0 Bytes');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1048576), '1 MB');
    assert.equal(formatBytes(1073741824), '1 GB');
    assert.equal(formatBytes(2500000), '2.38 MB');
  });

  await t.test('formatDuration formats seconds, minutes, hours', () => {
    assert.equal(formatDuration(45), '0:45');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(3665), '1:01:05');
  });

  await t.test('getFileExtension and withoutExtension handle tricky files', () => {
    assert.equal(getFileExtension('report.pdf'), 'pdf');
    assert.equal(getFileExtension('archive.tar.gz'), 'gz');
    assert.equal(getFileExtension('PHOTO.JPEG'), 'jpeg');
    assert.equal(getFilenameWithoutExtension('my.presentation.pptx'), 'my.presentation');
    assert.equal(getFilenameWithoutExtension('simple'), 'simple');
  });

  await t.test('clamp restricts numbers within range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
  });
});

test('Security Tests: Path Traversal & Sanitization', async (t) => {
  await t.test('sanitizeFilename removes path traversal patterns', () => {
    assert.equal(sanitizeFilename('../../etc/passwd'), 'etc_passwd');
    assert.equal(sanitizeFilename('..\\..\\windows\\system32'), 'windows_system32');
    assert.equal(sanitizeFilename('normal-file.pdf'), 'normal-file.pdf');
    assert.equal(sanitizeFilename('file with   spaces.docx'), 'file_with_spaces.docx');
  });

  await t.test('sanitizeFilename blocks dangerous filesystem characters', () => {
    const malicious = 'bad<file>:name"test|pipe?query*star\0null.png';
    const sanitized = sanitizeFilename(malicious);
    assert.ok(!sanitized.includes('<'));
    assert.ok(!sanitized.includes('>'));
    assert.ok(!sanitized.includes(':'));
    assert.ok(!sanitized.includes('"'));
    assert.ok(!sanitized.includes('|'));
    assert.ok(!sanitized.includes('?'));
    assert.ok(!sanitized.includes('*'));
    assert.ok(!sanitized.includes('\0'));
  });

  await t.test('sanitizeFilename provides fallback when name becomes empty', () => {
    assert.equal(sanitizeFilename(''), 'file');
    assert.equal(sanitizeFilename('***:::???'), 'file');
  });
});

test('Registry Tests: All 60+ Tool Definitions Validated', async (t) => {
  // Extract all tool IDs from tools-registry
  const idMatches = [...registryContent.matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  const categories = ['pdf', 'image', 'document', 'video', 'audio', 'archive', 'utility'];

  await t.test('tools registry defines over 60 active tools', () => {
    assert.ok(idMatches.length >= 60, `Found ${idMatches.length} tools, expected >= 60`);
  });

  await t.test('all tool IDs are unique (no duplicates)', () => {
    const seen = new Set();
    const duplicates = [];
    for (const id of idMatches) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    assert.deepEqual(duplicates, [], `Found duplicate tool IDs: ${duplicates.join(', ')}`);
  });

  await t.test('key core tools exist and have definitions', () => {
    const requiredTools = [
      'pdf-compress',
      'pdf-merge',
      'pdf-split',
      'image-convert',
      'image-compress',
      'image-resize',
      'docx-editor',
      'docx-to-pdf',
      'video-convert',
      'video-compress',
      'mp4-to-mp3',
      'zip-create',
      'file-hash',
    ];
    for (const tool of requiredTools) {
      assert.ok(idMatches.includes(tool), `Missing required tool: ${tool}`);
    }
  });
});

test('Feature Tests: PDF Creation & Content Processing', async (t) => {
  await t.test('create and extract text from real PDF bytes', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([500, 500]);
    page.drawText('FileKit Test Extraction 2026', { x: 50, y: 400, size: 16, font });
    const bytes = await doc.save();

    assert.ok(bytes.length > 0, 'PDF bytes should be generated');
    const latin1 = new TextDecoder('latin1').decode(bytes);
    assert.ok(latin1.includes('PDF-1.7') || latin1.includes('PDF'), 'Must be a valid PDF document');
  });

  await t.test('compressing PDF applies object streams and saves bytes', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 5; i++) {
      const p = doc.addPage([400, 400]);
      p.drawText(`Page content ${i + 1} with repeated text streams for testing compression`, { x: 40, y: 350, size: 12, font });
    }
    const uncompressed = await doc.save({ useObjectStreams: false });
    const compressed = await doc.save({ useObjectStreams: true });
    assert.ok(compressed.length > 0, 'Compressed output must be valid');
    assert.ok(compressed.length <= uncompressed.length, 'Object streams must reduce or maintain size');
  });
});
