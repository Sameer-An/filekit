'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileDown, Merge, Scissors, Images, FileImage, RotateCw, GripVertical,
  Stamp, Hash, Info, FileText, ScanText, Lock, PenLine,
  RefreshCw, ImageDown, Maximize2, Crop, Sliders, EyeOff, PackageCheck,
  PackageOpen, Globe, BookOpen, FileMinus, FilePlus, FileOutput, FileCode,
  FileSearch, Table, Sheet, Video, VideoOff, Clapperboard, Music,
  Camera, VolumeX, MonitorSpeaker, FileAudio, AudioLines, Volume1,
  Volume2, Waves, TrendingDown, Music2, FolderArchive, FolderOpen,
  Fingerprint, Braces, Table2, Code2, FileJson, ScanSearch, ScanEye,
  Archive, Image, Wrench, File, ChevronRight, Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToolDefinition } from '@/lib/tools-registry';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ElementType> = {
  FileDown, Merge, Scissors, Images, FileImage, RotateCw, GripVertical,
  Stamp, Hash, Info, FileText, ScanText, Lock, PenLine,
  RefreshCw, ImageDown, Maximize2, Crop, Sliders, EyeOff, PackageCheck,
  PackageOpen, Globe, BookOpen, FileMinus, FilePlus, FileOutput, FileCode,
  FileSearch, Table, Sheet, Video, VideoOff, Clapperboard, Music,
  Camera, VolumeX, MonitorSpeaker, FileAudio, AudioLines, Volume1,
  Volume2, Waves, TrendingDown, Music2, FolderArchive, FolderOpen,
  Fingerprint, Braces, Table2, Code2, FileJson, ScanSearch, ScanEye,
  Archive, Image, Wrench, File,
};
const CATEGORY_COLORS: Record<string, string> = {
  pdf: "bg-background text-red-600 dark:bg-red-950/40 dark:text-red-400",
  image: "bg-background text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  document:
    "bg-background text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  video:
    "bg-background text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  audio:
    "bg-background text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  archive:
    "bg-background text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
  utility:
    "bg-background text-muted-foreground dark:bg-muted dark:text-muted-foreground",
};

interface ToolCardProps {
  tool: ToolDefinition;
  compact?: boolean;
}

export function ToolCard({ tool, compact = false }: ToolCardProps) {
  const [clicked, setClicked] = useState(false);
  const IconComponent = ICON_MAP[tool.icon] || File;
  const iconTheme = CATEGORY_COLORS[tool.category] || CATEGORY_COLORS.utility;

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  if (compact) {
    return (
      <Link
        href={`/tools/${tool.id}`}
        onClick={handleClick}
        className={cn(
          'flex items-center gap-3 p-3 rounded-2xl border bg-card transition-colors group',
          'hover:border-primary/35 hover:bg-accent/40',
          clicked && 'border-primary bg-accent'
        )}
      >
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', iconTheme)}>
          {clicked ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconComponent className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{tool.title}</p>
          <p className="text-xs text-muted-foreground truncate uppercase tracking-wide">
            {tool.inputFormats.slice(0, 3).join(' · ')}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      href={`/tools/${tool.id}`}
      onClick={handleClick}
      className={cn(
        'group flex flex-col p-4 rounded-2xl border bg-card transition-colors',
        'hover:border-primary/35 hover:shadow-sm',
        clicked && 'border-primary'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconTheme)}>
          {clicked ? <Loader2 className="w-5 h-5 animate-spin" /> : <IconComponent className="w-5 h-5 " />}
        </div>
        {tool.mode === 'browser' ? (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide px-2 py-0 border-transparent bg-accent text-accent-foreground">
            Local
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]  uppercase tracking-wide px-2 py-0">
            Server
          </Badge>
        )}
      </div>
      <h3 className="font-medium text-sm mb-1 leading-snug">{tool.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
        {tool.description}
      </p>
      <div className="flex flex-wrap gap-1 pt-2 border-t border-border/60">
        {tool.inputFormats.slice(0, 3).map((fmt) => (
          <span key={fmt} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground uppercase tracking-wide">
            {fmt}
          </span>
        ))}
      </div>
    </Link>
  );
}
