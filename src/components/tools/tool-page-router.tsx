'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { Monitor, Server, Sparkles, ArrowLeft } from 'lucide-react';
import { ToolDefinition, CATEGORY_LABELS } from '@/lib/tools-registry';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PdfToolEngine } from './pdf-tool-engine';
import { ImageToolEngine } from './image-tool-engine';
import { MediaToolEngine } from './media-tool-engine';
import { DocumentToolEngine } from './document-tool-engine';
import { UtilityToolEngine } from './utility-tool-engine';
import { DirectConvertEngine } from "./direct-convert-engine";

export function ToolPageRouter({ tool }: { tool: ToolDefinition }) {
  const renderEngine = () => {
      if (tool.id === "docx-to-pdf" || tool.id === "pdf-to-docx") {
        return <DirectConvertEngine tool={tool} />;
      }
    switch (tool.category) {
      case 'pdf':
        return <PdfToolEngine tool={tool} />;
      case 'image':
        return <ImageToolEngine tool={tool} />;
      case 'video':
      case 'audio':
        return <MediaToolEngine tool={tool} />;
      case 'document':
        return <DocumentToolEngine tool={tool} />;
      case 'archive':
      case 'utility':
        return <UtilityToolEngine tool={tool} />;
      default:
        return <UtilityToolEngine tool={tool} />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/tools" className="hover:text-foreground transition-colors">
          Tools
        </Link>
        <span>/</span>
        <Link
          href={`/tools?category=${tool.category}`}
          className="hover:text-foreground transition-colors"
        >
          {CATEGORY_LABELS[tool.category]}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{tool.title}</span>
      </div>

      {/* Tool Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">{tool.title}</h1>
            <p className="text-muted-foreground max-w-2xl">{tool.description}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tool.mode === 'browser' && (
              <Badge variant="success" className="gap-1">
                <Monitor className="w-3 h-3" /> Browser-only
              </Badge>
            )}
            {tool.mode === 'server' && (
              <Badge variant="info" className="gap-1">
                <Server className="w-3 h-3" /> Server-processed
              </Badge>
            )}
          </div>
        </div>

        {/* Formats Info */}
        {(tool.inputFormats.length > 0 || tool.outputFormats.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {tool.inputFormats.filter((f) => f !== '*').length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">Input:</span>
                {tool.inputFormats
                  .filter((f) => f !== '*')
                  .map((fmt) => (
                    <span
                      key={fmt}
                      className="text-xs px-2 py-0.5 rounded-md bg-muted font-mono uppercase"
                    >
                      {fmt}
                    </span>
                  ))}
              </>
            )}
            {tool.outputFormats.filter((f) => f !== '*').length > 0 && (
              <>
                <span className="text-xs text-muted-foreground ml-2">Output:</span>
                {tool.outputFormats
                  .filter((f) => f !== '*')
                  .map((fmt) => (
                    <span
                      key={fmt}
                      className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono uppercase"
                    >
                      {fmt}
                    </span>
                  ))}
              </>
            )}
          </div>
        )}

        {tool.mode === 'server' && (
          <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2 p-3 rounded-2xl bg-accent border">
            <Server className="w-3.5 h-3.5 text-primary mt-0.5" />
            <span>
              This job uses FFmpeg on the server. The upload is deleted when processing finishes. Requires FFmpeg on the host.
            </span>
          </div>
        )}
      </div>

      <Separator className="mb-8" />

      {/* Tool Engine */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        {renderEngine()}
      </Suspense>
    </div>
  );
}
