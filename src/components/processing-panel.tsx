'use client';
import React from 'react';
import { Download, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ProcessingJob } from '@/lib/job-store';
import { formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ProcessingPanelProps {
  job: ProcessingJob;
  onDownload?: () => void;
  onCancel?: () => void;
  onReset?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  preparing: 'Preparing…',
  uploading: 'Uploading…',
  processing: 'Processing…',
  finalizing: 'Finishing…',
  ready: 'Done',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export function ProcessingPanel({ job, onDownload, onCancel, onReset }: ProcessingPanelProps) {
  const isActive = ['preparing', 'uploading', 'processing', 'finalizing'].includes(job.status);

  function download() {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!job.outputUrl || !job.outputFilename) return;
    const a = document.createElement('a');
    a.href = job.outputUrl;
    a.download = job.outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 space-y-4 bg-card',
        job.status === 'ready' && 'border-primary/30',
        job.status === 'failed' && 'border-destructive/30',
        isActive && 'border-primary/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {job.status === 'ready' && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
          {job.status === 'failed' && <AlertCircle className="w-5 h-5 text-destructive shrink-0" />}
          {isActive && <Loader2 className="w-5 h-5 text-primary shrink-0 animate-spin" />}
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{job.filename}</p>
            <p className="text-xs text-muted-foreground">{STATUS_LABELS[job.status] || job.status}</p>
          </div>
        </div>
        {onReset && (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={onReset} aria-label="Reset">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {isActive && (
        <div className="space-y-1.5">
          <Progress value={Math.max(job.progress, 8)} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{job.message}</p>
        </div>
      )}

      {job.status === 'ready' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium">{formatBytes(job.originalSize)}</span>
          </div>
          {job.outputSize !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium">{formatBytes(job.outputSize)}</span>
            </div>
          )}
          {job.outputUrl && (
            <Button onClick={download} className="w-full gap-2 rounded-full">
              <Download className="w-4 h-4" /> Download {job.outputFilename || 'file'}
            </Button>
          )}
        </div>
      )}

      {job.status === 'failed' && job.error && (
        <div className="text-sm text-destructive">
          {job.error}
          {onReset && (
            <Button variant="outline" size="sm" className="mt-3 w-full rounded-full" onClick={onReset}>
              Try again
            </Button>
          )}
        </div>
      )}

      {isActive && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel} className="rounded-full">
          Cancel
        </Button>
      )}
    </div>
  );
}
