'use client';
import React, { useState } from 'react';
import JSZip from 'jszip';
import exifr from 'exifr';
import { PDFDocument } from 'pdf-lib';
import {
  Image as ImageIcon, RefreshCw, Crop, Sliders, Maximize2,
  RotateCw, EyeOff, Stamp, PackageCheck, Loader2, Sparkles, FileText
} from 'lucide-react';
import { ToolDefinition } from '@/lib/tools-registry';
import { FileUploadZone } from '@/components/file-upload-zone';
import { ProcessingPanel } from '@/components/processing-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ProcessingJob, createJob } from '@/lib/job-store';
import { formatBytes } from '@/lib/utils';
import { canvasToBlob, fileToCanvas, fileToJpegBytes, pngToIco } from '@/lib/image-ops';

export function ImageToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);

  // Settings
  const [targetFormat, setTargetFormat] = useState<string>('png');
  const [quality, setQuality] = useState<number>(85);
  const [resizeWidth, setResizeWidth] = useState<string>('800');
  const [resizeHeight, setResizeHeight] = useState<string>('600');
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true);
  const [rotateDeg, setRotateDeg] = useState<number>(90);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [grayscale, setGrayscale] = useState<number>(0);
  const [watermarkText, setWatermarkText] = useState<string>('FileKit');
  const [exifData, setExifData] = useState<Record<string, any> | null>(null);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    compressedSize: number;
    savingsPct: number;
  } | null>(null);
  const [cropX, setCropX] = useState('10');
  const [cropY, setCropY] = useState('10');
  const [cropW, setCropW] = useState('80');
  const [cropH, setCropH] = useState('80');
  const [icoSize, setIcoSize] = useState('64');

  const isMulti = tool.multiFile || tool.id.includes('batch') || tool.id === 'image-to-pdf';

  const handleFiles = async (selected: File[]) => {
    setFiles(selected);
    if (selected.length > 0) {
      setJob(createJob(selected[0].name, selected[0].size));

      if (tool.id === 'image-metadata') {
        try {
          const parsed = await exifr.parse(selected[0]);
          setExifData(parsed || { info: 'No EXIF metadata found in this image.' });
        } catch {
          setExifData({ error: 'Failed to parse EXIF metadata' });
        }
      }
    } else {
      setJob(null);
      setExifData(null);
    }
  };

  const processImage = async () => {
    if (!files || files.length === 0) return;

    setJob((prev) =>
      prev ? { ...prev, status: 'processing', progress: 20, message: 'Processing image(s)...' } : null
    );

    try {
      let outputBlob: Blob;
      let outputFilename = `processed_${files[0].name}`;

      // ─── 1. BATCH CONVERT OR COMPRESS -> ZIP ───────────────────────────────
      if (tool.id === 'image-batch-convert' || tool.id === 'image-batch-compress') {
        const zip = new JSZip();
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  progress: Math.round(((i + 1) / files.length) * 80),
                  message: `Processing ${f.name}...`,
                }
              : null
          );
          const canvas = await fileToCanvas(f);
          const fmt = tool.id === 'image-batch-convert' ? targetFormat : 'jpeg';
          const mime = `image/${fmt === 'jpg' ? 'jpeg' : fmt}`;
          const blob = await canvasToBlob(canvas, mime, quality / 100);
          const baseName = f.name.replace(/\.[^/.]+$/, '');
          zip.file(`${baseName}.${fmt}`, blob);
        }

        outputBlob = await zip.generateAsync({ type: 'blob' });
        outputFilename = `images_batch_${Date.now()}.zip`;
      }

      // ─── 2. IMAGE TO PDF ───────────────────────────────────────────────────
      else if (tool.id === 'image-to-pdf') {
        const pdfDoc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          const jpg = await fileToJpegBytes(files[i], 0.92);
          const embedded = await pdfDoc.embedJpg(jpg);
          const page = pdfDoc.addPage([embedded.width, embedded.height]);
          page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        }
        const bytes = await pdfDoc.save();
        outputBlob = new Blob([bytes as any], { type: 'application/pdf' });
        outputFilename = `images_${Date.now()}.pdf`;
      }

      // ─── 3. SINGLE IMAGE OPERATIONS ─────────────────────────────────────────
      else if (tool.id === 'image-metadata') {
        outputBlob = new Blob([JSON.stringify(exifData || {}, null, 2)], { type: 'application/json' });
        outputFilename = `${files[0].name.replace(/\.[^/.]+$/, '')}_exif.json`;
      }

      else {
        const file = files[0];
        const size = parseInt(icoSize, 10) || 64;
        const canvas = await fileToCanvas(file, {
          width: tool.id === 'image-resize' ? parseInt(resizeWidth, 10) || undefined : tool.id === 'ico-creator' ? size : undefined,
          height:
            tool.id === 'image-resize'
              ? maintainAspect
                ? undefined
                : parseInt(resizeHeight, 10) || undefined
              : tool.id === 'ico-creator'
              ? size
              : undefined,
          rotateDeg: tool.id === 'image-rotate' ? rotateDeg : 0,
          flipH: tool.id === 'image-rotate' ? flipH : false,
          flipV: tool.id === 'image-rotate' ? flipV : false,
          filter:
            tool.id === 'image-filters'
              ? `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%)`
              : undefined,
          crop:
            tool.id === 'image-crop'
              ? {
                  x: Number(cropX) || 0,
                  y: Number(cropY) || 0,
                  w: Number(cropW) || 100,
                  h: Number(cropH) || 100,
                }
              : undefined,
        });

        if (tool.id === 'image-resize' && maintainAspect && canvas.width && parseInt(resizeWidth, 10)) {
          // fileToCanvas already used width; height follows source crop aspect via draw. Rebuild if needed.
        }

        if (tool.id === 'image-watermark') {
          const ctx = canvas.getContext('2d')!;
          ctx.font = `bold ${Math.max(18, Math.round(canvas.width / 18))}px sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.lineWidth = 2;
          ctx.textAlign = 'center';
          ctx.strokeText(watermarkText, canvas.width / 2, canvas.height - 36);
          ctx.fillText(watermarkText, canvas.width / 2, canvas.height - 36);
        }

        let outFmt = targetFormat;
        if (tool.id === 'image-compress') outFmt = 'jpeg';
        if (tool.id === 'image-remove-exif') outFmt = 'png';
        if (tool.id === 'ico-creator') {
          const pngBlob = await canvasToBlob(canvas, 'image/png');
          const png = new Uint8Array(await pngBlob.arrayBuffer());
          outputBlob = pngToIco(png, size);
          outputFilename = `${file.name.replace(/\.[^/.]+$/, '')}.ico`;
        } else {
          const mime = `image/${outFmt === 'jpg' ? 'jpeg' : outFmt}`;
          outputBlob = await canvasToBlob(canvas, mime, quality / 100);
          outputFilename = `${file.name.replace(/\.[^/.]+$/, '')}_${tool.id}.${outFmt === 'jpg' ? 'jpg' : outFmt}`;
        }

        if (tool.id === 'image-compress') {
          setCompressionStats({
            originalSize: file.size,
            compressedSize: outputBlob.size,
            savingsPct: Math.max(0, Math.round(((file.size - outputBlob.size) / file.size) * 100)),
          });
        }
      }

      const outputUrl = URL.createObjectURL(outputBlob);

      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: 'ready',
              progress: 100,
              message: 'Done!',
              outputUrl,
              outputFilename,
              outputSize: outputBlob.size,
              completedAt: Date.now(),
            }
          : null
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setJob((prev) =>
        prev ? { ...prev, status: 'failed', error: message, message: 'Failed' } : null
      );
    }
  };

  const handleDownload = () => {
    if (job?.outputUrl && job?.outputFilename) {
      const a = document.createElement('a');
      a.href = job.outputUrl;
      a.download = job.outputFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={isMulti}
        maxSizeMB={tool.maxFileSizeMB || 50}
        onFilesSelected={handleFiles}
        disabled={job?.status === 'processing'}
      />

      {files.length > 0 && job?.status !== 'ready' && (
        <div className="p-6 rounded-xl border bg-card space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Image Settings
          </h3>

          {/* Format converter */}
          {(tool.id === 'image-convert' || tool.id === 'image-batch-convert') && (
            <div className="space-y-2 max-w-xs">
              <Label>Convert to Format</Label>
              <Select value={targetFormat} onValueChange={(v) => setTargetFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (Lossless)</SelectItem>
                  <SelectItem value="jpeg">JPG / JPEG</SelectItem>
                  <SelectItem value="webp">WebP (Modern & Compact)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quality Slider for compress/convert */}
          {(tool.id === 'image-compress' || tool.id === 'image-batch-compress' || tool.id === 'image-convert') && (
            <div className="space-y-2 max-w-md">
              <div className="flex justify-between text-xs">
                <Label>Image Quality</Label>
                <span className="font-medium">{quality}%</span>
              </div>
              <Slider
                min={20}
                max={100}
                step={5}
                value={[quality]}
                onValueChange={([val]) => setQuality(val)}
              />
              <p className="text-xs text-muted-foreground">Lower quality yields significantly smaller file sizes.</p>
            </div>
          )}

          {/* Resize controls */}
          {tool.id === 'image-resize' && (
            <div className="space-y-3 max-w-md">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Width (px)</Label>
                  <Input
                    type="number"
                    value={resizeWidth}
                    onChange={(e) => setResizeWidth(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Height (px)</Label>
                  <Input
                    type="number"
                    value={resizeHeight}
                    onChange={(e) => setResizeHeight(e.target.value)}
                    disabled={maintainAspect}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={maintainAspect}
                  onCheckedChange={setMaintainAspect}
                  id="aspect-ratio"
                />
                <Label htmlFor="aspect-ratio" className="text-xs">
                  Maintain aspect ratio
                </Label>
              </div>
            </div>
          )}

          {/* Rotate & Flip */}
          {tool.id === 'image-rotate' && (
            <div className="space-y-3 max-w-md">
              <Label>Rotation Angle</Label>
              <div className="flex gap-2">
                {[90, 180, 270].map((deg) => (
                  <Button
                    key={deg}
                    type="button"
                    variant={rotateDeg === deg ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRotateDeg(deg)}
                  >
                    {deg}°
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={flipH} onCheckedChange={setFlipH} id="flip-h" />
                  <Label htmlFor="flip-h" className="text-xs">Flip Horizontally</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={flipV} onCheckedChange={setFlipV} id="flip-v" />
                  <Label htmlFor="flip-v" className="text-xs">Flip Vertically</Label>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          {tool.id === 'image-filters' && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Label>Brightness</Label>
                  <span>{brightness}%</span>
                </div>
                <Slider min={0} max={200} value={[brightness]} onValueChange={([v]) => setBrightness(v)} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Label>Contrast</Label>
                  <span>{contrast}%</span>
                </div>
                <Slider min={0} max={200} value={[contrast]} onValueChange={([v]) => setContrast(v)} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Label>Saturation</Label>
                  <span>{saturation}%</span>
                </div>
                <Slider min={0} max={200} value={[saturation]} onValueChange={([v]) => setSaturation(v)} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Label>Grayscale</Label>
                  <span>{grayscale}%</span>
                </div>
                <Slider min={0} max={100} value={[grayscale]} onValueChange={([v]) => setGrayscale(v)} />
              </div>
            </div>
          )}

          {tool.id === 'image-crop' && (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {[
                ['X %', cropX, setCropX],
                ['Y %', cropY, setCropY],
                ['Width %', cropW, setCropW],
                ['Height %', cropH, setCropH],
              ].map(([label, value, setter]) => (
                <div key={label as string} className="space-y-1">
                  <Label>{label as string}</Label>
                  <Input type="number" min={0} max={100} value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {tool.id === 'ico-creator' && (
            <div className="space-y-2 max-w-xs">
              <Label>Icon size</Label>
              <Select value={icoSize} onValueChange={setIcoSize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['16', '32', '64', '128', '256'].map((s) => (
                    <SelectItem key={s} value={s}>{s}×{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Watermark text */}
          {tool.id === 'image-watermark' && (
            <div className="space-y-2 max-w-sm">
              <Label>Watermark Text</Label>
              <Input
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Watermark text..."
              />
            </div>
          )}

          <Button
            onClick={processImage}
            disabled={job?.status === 'processing'}
            className="w-full sm:w-auto"
          >
            {job?.status === 'processing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...
              </>
            ) : (
              `Process & Generate ${tool.outputFormats[0]?.toUpperCase() || 'Image'}`
            )}
          </Button>
        </div>
      )}

      {/* EXIF Metadata display */}
      {exifData && (
        <div className="p-4 rounded-xl border bg-card space-y-2">
          <Label className="font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" /> EXIF Metadata Details
          </Label>
          <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-60">
            {JSON.stringify(exifData, null, 2)}
          </pre>
        </div>
      )}

      {/* Compression Stats */}
      {compressionStats && job?.status === 'ready' && (
        <div className="p-5 rounded-2xl border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <span>Compression Results</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-card border">
              <span className="text-[11px] text-muted-foreground block">Original</span>
              <span className="font-bold text-sm font-mono">{formatBytes(compressionStats.originalSize)}</span>
            </div>
            <div className="p-3 rounded-xl bg-card border">
              <span className="text-[11px] text-muted-foreground block">Compressed</span>
              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                {formatBytes(compressionStats.compressedSize)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-card border">
              <span className="text-[11px] text-muted-foreground block">Saved</span>
              <span className="font-bold text-sm text-primary font-mono">{compressionStats.savingsPct}%</span>
            </div>
          </div>
        </div>
      )}

      {job && (
        <ProcessingPanel
          job={job}
          onDownload={handleDownload}
          onReset={() => {
            setFiles([]);
            setJob(null);
            setExifData(null);
          }}
        />
      )}
    </div>
  );
}
