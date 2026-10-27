'use client';
import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, Image, Film, Music, Archive, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatBytes } from '@/lib/utils';
import { isAcceptedFile, expandAccept } from '@/lib/file-accept';

interface FileUploadZoneProps {
  accept?: string[];
  multiple?: boolean;
  maxSizeMB?: number;
  onFilesSelected: (files: File[]) => void;
  label?: string;
  sublabel?: string;
  className?: string;
  disabled?: boolean;
}

function getFileIcon(file: File) {
  const mime = file.type;
  if (mime.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
  if (mime.startsWith('video/')) return <Film className="w-5 h-5 text-purple-500" />;
  if (mime.startsWith('audio/')) return <Music className="w-5 h-5 text-green-500" />;
  if (mime === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('archive'))
    return <Archive className="w-5 h-5 text-yellow-500" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
}

export function FileUploadZone({
  accept = ['*'],
  multiple = false,
  maxSizeMB = 200,
  onFilesSelected,
  label = 'Drop files here or click to browse',
  sublabel,
  className,
  disabled = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const validateAndAdd = useCallback(
    (incoming: File[]) => {
      const errs: string[] = [];
      const valid: File[] = [];

      for (const f of incoming) {
        if (f.size > maxBytes) {
          errs.push(`"${f.name}" exceeds ${maxSizeMB} MB limit (${formatBytes(f.size)}).`);
          continue;
        }
        if (!accept.includes('*') && !isAcceptedFile(f, accept)) {
          errs.push(`"${f.name}" format not supported. Accepted: ${expandAccept(accept).join(', ')}.`);
          continue;
        }
        valid.push(f);
      }

      setErrors(errs);

      if (valid.length > 0) {
        const next = multiple ? [...selectedFiles, ...valid] : valid.slice(0, 1);
        // Deduplicate by name+size
        const deduped = next.filter(
          (f, i, arr) => arr.findIndex((x) => x.name === f.name && x.size === f.size) === i
        );
        setSelectedFiles(deduped);
        onFilesSelected(deduped);
      }
    },
    [accept, maxBytes, maxSizeMB, multiple, onFilesSelected, selectedFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      validateAndAdd(files);
    },
    [disabled, validateAndAdd]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) validateAndAdd(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    const next = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(next);
    onFilesSelected(next);
    setErrors([]);
  };

  const acceptAttr = accept.includes('*')
    ? '*/*'
    : accept
        .map((a) => {
          if (a.includes('/')) return a;
          return `.${a}`;
        })
        .join(',');

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/40 hover:bg-muted/40',
          disabled && 'opacity-50 cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          multiple={multiple}
          onChange={onInputChange}
          className="hidden"
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
            isDragging ? 'bg-primary/20' : 'bg-muted'
          )}>
            <Upload className={cn('w-7 h-7 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {sublabel || `Up to ${maxSizeMB} MB per file${multiple ? ', multiple files supported' : ''}`}
            </p>
            {!accept.includes('*') && (
              <p className="text-xs text-muted-foreground mt-1">
                Supported: {accept.map((a) => a.toUpperCase()).join(', ')}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={disabled}
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            Browse Files
          </Button>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <X className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className="flex items-center gap-3 p-3 bg-card rounded-2xl border"
            >
              {getFileIcon(file)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeFile(idx)}
                aria-label={`Remove ${file.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
