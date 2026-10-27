'use client';
import React, { useState } from 'react';
import {
  Video, Music, Scissors, Volume2, Sparkles, Loader2, Download
} from 'lucide-react';
import { ToolDefinition } from '@/lib/tools-registry';
import { FileUploadZone } from '@/components/file-upload-zone';
import { ProcessingPanel } from '@/components/processing-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ProcessingJob, createJob } from '@/lib/job-store';

export function MediaToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);

  // Settings
  const [targetFormat, setTargetFormat] = useState<string>(tool.outputFormats[0] || 'mp4');
  const [crf, setCrf] = useState<number>(28);
  const [bitrate, setBitrate] = useState<string>('128');
  const [startTime, setStartTime] = useState<string>('00:00:00');
  const [endTime, setEndTime] = useState<string>('00:00:10');
  const [resolution, setResolution] = useState<string>('720p');
  const [volumeChange, setVolumeChange] = useState<string>('3');
  const [fadeIn, setFadeIn] = useState<string>('2');
  const [fadeOut, setFadeOut] = useState<string>('2');
  const [fps, setFps] = useState<string>('12');

  const isMerge = tool.id === 'audio-merge' || tool.id === 'video-merge';

  const handleFiles = (selected: File[]) => {
    setFiles(selected);
    if (selected.length > 0) {
      setJob(createJob(selected[0].name, selected[0].size));
    } else {
      setJob(null);
    }
  };

  const processMedia = async () => {
    if (!files || files.length === 0) return;

    setJob((prev) =>
      prev ? { ...prev, status: 'uploading', progress: 30, message: 'Uploading to FFmpeg server...' } : null
    );

    try {
      const formData = new FormData();

      if (isMerge) {
        files.forEach((f) => formData.append('files', f));
        formData.append('mediaType', tool.category === 'video' ? 'video' : 'audio');
        formData.append('outputFormat', targetFormat);

        const res = await fetch('/api/media/merge', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server responded with ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const outName = `merged_${Date.now()}.${targetFormat}`;

        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'ready',
                progress: 100,
                message: 'Merge completed!',
                outputUrl: url,
                outputFilename: outName,
                outputSize: blob.size,
                completedAt: Date.now(),
              }
            : null
        );
      } else {
        // Single file processing
        const file = files[0];
        formData.append('file', file);
        formData.append('operation', tool.id);
        formData.append('outputFormat', targetFormat);
        formData.append('crf', crf.toString());
        formData.append('bitrate', bitrate);
        formData.append('startTime', startTime);
        formData.append('endTime', endTime);
        formData.append('resolution', resolution);
        formData.append('volumeChange', volumeChange);
        formData.append('fadeIn', fadeIn);
        formData.append('fadeOut', fadeOut);
        formData.append('fps', fps);

        setJob((prev) =>
          prev ? { ...prev, status: 'processing', progress: 60, message: 'Encoding via FFmpeg...' } : null
        );

        const res = await fetch('/api/media/process', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const base = file.name.replace(/\.[^/.]+$/, '');
        const outName = `${base}_processed.${targetFormat}`;

        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'ready',
                progress: 100,
                message: 'Processing complete!',
                outputUrl: url,
                outputFilename: outName,
                outputSize: blob.size,
                completedAt: Date.now(),
              }
            : null
        );
      }
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
        multiple={isMerge}
        maxSizeMB={tool.maxFileSizeMB || 200}
        onFilesSelected={handleFiles}
        disabled={job?.status === 'processing' || job?.status === 'uploading'}
      />

      {files.length > 0 && job?.status !== 'ready' && (
        <div className="p-6 rounded-xl border bg-card space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Processing Controls
          </h3>

          {/* Target Format */}
          {tool.outputFormats.length > 1 && (
            <div className="space-y-2 max-w-xs">
              <Label>Output Format</Label>
              <Select value={targetFormat} onValueChange={(v) => setTargetFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tool.outputFormats.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      {fmt.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Video / Audio Trim */}
          {(tool.id === 'video-trim' || tool.id === 'audio-trim' || tool.id === 'video-thumbnail') && (
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1">
                <Label>Start Time (HH:MM:SS)</Label>
                <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End Time (HH:MM:SS)</Label>
                <Input value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          {/* Video Compress CRF */}
          {tool.id === 'video-compress' && (
            <div className="space-y-2 max-w-md">
              <div className="flex justify-between text-xs">
                <Label>Compression Level (CRF)</Label>
                <span>{crf} (Higher = Smaller Size)</span>
              </div>
              <Slider min={18} max={36} step={1} value={[crf]} onValueChange={([v]) => setCrf(v)} />
            </div>
          )}

          {/* Audio Compress Bitrate */}
          {(tool.id === 'audio-compress' || tool.id === 'audio-convert') && (
            <div className="space-y-2 max-w-xs">
              <Label>Audio Bitrate</Label>
              <Select value={bitrate} onValueChange={setBitrate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="64">64 kbps (Compact)</SelectItem>
                  <SelectItem value="96">96 kbps (Good)</SelectItem>
                  <SelectItem value="128">128 kbps (Standard)</SelectItem>
                  <SelectItem value="192">192 kbps (High Quality)</SelectItem>
                  <SelectItem value="320">320 kbps (Maximum)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Video Resize */}
          {tool.id === 'video-resize' && (
            <div className="space-y-2 max-w-xs">
              <Label>Resolution Preset</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                  <SelectItem value="480p">480p (SD)</SelectItem>
                  <SelectItem value="360p">360p (Mobile)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Audio Volume */}
          {tool.id === 'audio-volume' && (
            <div className="space-y-2 max-w-xs">
              <Label>Volume Adjustment (dB)</Label>
              <Input
                type="number"
                value={volumeChange}
                onChange={(e) => setVolumeChange(e.target.value)}
                placeholder="+3 or -3"
              />
              <p className="text-xs text-muted-foreground">Positive values amplify, negative soften.</p>
            </div>
          )}

          {/* Audio Fade */}
          {tool.id === 'audio-fade' && (
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1">
                <Label>Fade In (seconds)</Label>
                <Input value={fadeIn} onChange={(e) => setFadeIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fade Out (seconds)</Label>
                <Input value={fadeOut} onChange={(e) => setFadeOut(e.target.value)} />
              </div>
            </div>
          )}

          <Button
            onClick={processMedia}
            disabled={job?.status === 'processing' || job?.status === 'uploading'}
            className="w-full sm:w-auto"
          >
            {job?.status === 'processing' || job?.status === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing Media...
              </>
            ) : (
              `Start ${tool.title}`
            )}
          </Button>
        </div>
      )}

      {job && (
        <ProcessingPanel
          job={job}
          onDownload={handleDownload}
          onReset={() => {
            setFiles([]);
            setJob(null);
          }}
        />
      )}
    </div>
  );
}
