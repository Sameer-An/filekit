'use client';
import React, { useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { marked } from 'marked';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  FileText, Table, Code, Download, Sparkles, Loader2,
  Bold, Italic, Heading1, Heading2, List, Save, Eye, CheckCircle2
} from 'lucide-react';
import { ToolDefinition } from '@/lib/tools-registry';
import { FileUploadZone } from '@/components/file-upload-zone';
import { ProcessingPanel } from '@/components/processing-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProcessingJob, createJob } from '@/lib/job-store';
import { extractPdfText } from '@/lib/pdf-text-extractor';
import { uint8ArrayToBlob } from '@/lib/utils';

export function DocumentToolEngine({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<ProcessingJob | null>(null);

  // Editor states
  const [docContent, setDocContent] = useState<string>(
    '# Welcome to FileKit Document Editor\n\nEdit your document text here with full formatting, headings, and lists.'
  );
  const [markdownInput, setMarkdownInput] = useState<string>(
    '# FileKit Markdown\n\n- Convert directly to HTML or PDF\n- Fully responsive and client-side\n\n**Start typing your markdown here.**'
  );

  // Spreadsheet state
  const [sheetData, setSheetData] = useState<any[][]>([
    ['Item', 'Quantity', 'Price', 'Total'],
    ['Product A', 10, 25, 250],
    ['Product B', 5, 40, 200],
    ['Product C', 15, 10, 150],
  ]);

  const isMulti = tool.id === 'docx-merge';

  const handleFiles = async (selected: File[]) => {
    setFiles(selected);
    if (selected.length > 0) {
      const f = selected[0];
      setJob(createJob(f.name, f.size));

      // Auto-extract content for editor tools
      if (tool.id === 'docx-editor' || tool.id === 'docx-to-txt' || tool.id === 'docx-to-pdf') {
        try {
          const ab = await f.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: ab });
          if (res.value.trim()) setDocContent(res.value);
        } catch {
          // ignore
        }
      } else if (tool.id === 'pdf-to-docx') {
        try {
          const ab = await f.arrayBuffer();
          const ext = await extractPdfText(ab);
          if (ext.fullText.trim()) setDocContent(ext.fullText);
        } catch {
          // ignore
        }
      } else if (tool.id === 'markdown-editor' || tool.id === 'txt-to-docx') {
        const text = await f.text();
        setMarkdownInput(text);
        setDocContent(text);
      } else if (tool.id === 'csv-to-xlsx' || tool.id === 'xlsx-editor') {
        try {
          const ab = await f.arrayBuffer();
          const wb = XLSX.read(ab, { type: 'array' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const json: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          if (json && json.length > 0) setSheetData(json);
        } catch {
          // ignore
        }
      }
    } else {
      setJob(null);
    }
  };

  const processDocument = async () => {
    setJob((prev) => {
      const base = prev || createJob(files[0]?.name || 'untitled', files[0]?.size || 0);
      return { ...base, status: 'processing', progress: 30, message: 'Processing document...' };
    });

    try {
      let outputBlob: Blob;
      let outputFilename = `document_${Date.now()}`;

      // ─── 1. PDF TO DOCX ────────────────────────────────────────────────────
      if (tool.id === 'pdf-to-docx') {
        setJob((prev) => prev ? { ...prev, progress: 60, message: 'Converting PDF structure to Word paragraphs...' } : null);
        let textToUse = docContent;
        if (files[0]) {
          const ab = await files[0].arrayBuffer();
          const ext = await extractPdfText(ab);
          if (ext.fullText.trim()) textToUse = ext.fullText;
        }

        const lines = textToUse.split('\n');
        const paragraphs = lines.map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('--- Page')) {
            return new Paragraph({
              text: trimmed,
              heading: HeadingLevel.HEADING_2,
            });
          }
          return new Paragraph({
            children: [new TextRun(line)],
          });
        });

        const doc = new Document({
          sections: [{ properties: {}, children: paragraphs.length > 0 ? paragraphs : [new Paragraph('Converted Document')] }],
        });

        outputBlob = await Packer.toBlob(doc);
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}.docx`;
      }

      // ─── 2. DOCX EDITOR / TXT TO DOCX / DOCX MERGE ─────────────────────────
      else if (tool.id === 'docx-merge') {
        const texts: string[] = [];
        for (const f of files) {
          const ab = await f.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: ab });
          texts.push(res.value);
        }
        const merged = texts.join('\n\n');
        const paragraphs = merged.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }));
        const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
        outputBlob = await Packer.toBlob(doc);
        outputFilename = `merged_${Date.now()}.docx`;
      }

      else if (tool.id === 'docx-editor' || tool.id === 'txt-to-docx') {
        const lines = docContent.split('\n');
        const docxParagraphs = lines.map((line) => {
          if (line.startsWith('# ')) {
            return new Paragraph({
              text: line.replace('# ', ''),
              heading: HeadingLevel.HEADING_1,
            });
          }
          if (line.startsWith('## ')) {
            return new Paragraph({
              text: line.replace('## ', ''),
              heading: HeadingLevel.HEADING_2,
            });
          }
          return new Paragraph({
            children: [new TextRun(line)],
          });
        });

        const doc = new Document({
          sections: [{ properties: {}, children: docxParagraphs }],
        });

        outputBlob = await Packer.toBlob(doc);
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}_edited.docx`;
      }

      // ─── 3. DOCX TO PDF ────────────────────────────────────────────────────
      else if (tool.id === 'docx-to-pdf') {
        setJob((prev) => prev ? { ...prev, progress: 65, message: 'Generating PDF from document text...' } : null);
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const lines = docContent.split('\n');
        let currentPage = pdfDoc.addPage([595, 842]); // A4
        let y = 800;

        for (const line of lines) {
          if (y < 50) {
            currentPage = pdfDoc.addPage([595, 842]);
            y = 800;
          }

          if (line.startsWith('# ')) {
            currentPage.drawText(line.replace('# ', '').slice(0, 60), {
              x: 50,
              y,
              size: 18,
              font: boldFont,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= 28;
          } else if (line.startsWith('## ')) {
            currentPage.drawText(line.replace('## ', '').slice(0, 70), {
              x: 50,
              y,
              size: 14,
              font: boldFont,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= 22;
          } else {
            const cleanLine = line.slice(0, 85);
            currentPage.drawText(cleanLine, {
              x: 50,
              y,
              size: 10,
              font,
              color: rgb(0.15, 0.15, 0.15),
            });
            y -= 15;
          }
        }

        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        outputBlob = uint8ArrayToBlob(pdfBytes, 'application/pdf');
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
      }

      // ─── 4. CSV TO XLSX / XLSX EDITOR ──────────────────────────────────────
      else if (tool.id === 'csv-to-xlsx' || tool.id === 'xlsx-editor') {
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        outputBlob = new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'spreadsheet'}.xlsx`;
      }

      // ─── 5. DOCX TO TXT ────────────────────────────────────────────────────
      else if (tool.id === 'docx-to-txt') {
        outputBlob = new Blob([docContent], { type: 'text/plain;charset=utf-8' });
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'extracted'}.txt`;
      }

      // ─── 6. MARKDOWN EDITOR ────────────────────────────────────────────────
      else if (tool.id === 'markdown-editor') {
        const html = await marked(markdownInput);
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FileKit Export</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1e293b;}</style></head><body>${html}</body></html>`;
        outputBlob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        outputFilename = `markdown_export_${Date.now()}.html`;
      }

      else if (tool.id === 'html-to-pdf') {
        const source = files[0] ? await files[0].text() : docContent;
        const stripped = source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        let page = pdfDoc.addPage([595, 842]);
        let y = 800;
        const words = stripped.split(' ');
        let line = '';
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (next.length > 90) {
            page.drawText(line.slice(0, 110), { x: 50, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
            y -= 16;
            line = word;
            if (y < 50) {
              page = pdfDoc.addPage([595, 842]);
              y = 800;
            }
          } else {
            line = next;
          }
        }
        if (line) page.drawText(line.slice(0, 110), { x: 50, y, size: 11, font });
        outputBlob = uint8ArrayToBlob(await pdfDoc.save({ useObjectStreams: true }), 'application/pdf');
        outputFilename = `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
      }

      else {
        throw new Error(`This tool (${tool.id}) is not implemented.`);
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

  return (
    <div className="space-y-6">
      <FileUploadZone
        accept={tool.inputFormats}
        multiple={isMulti}
        maxSizeMB={tool.maxFileSizeMB || 50}
        onFilesSelected={handleFiles}
        disabled={job?.status === 'processing'}
      />

      {/* Interactive Editor Workspace */}
      {(tool.id === 'markdown-editor' || tool.id === 'html-to-pdf') && (
        <div className="p-6 rounded-2xl border bg-card space-y-4">
          <h3 className="font-medium text-sm">{tool.id === 'markdown-editor' ? 'Markdown' : 'HTML / text'}</h3>
          <textarea
            value={tool.id === 'markdown-editor' ? markdownInput : docContent}
            onChange={(e) =>
              tool.id === 'markdown-editor' ? setMarkdownInput(e.target.value) : setDocContent(e.target.value)
            }
            className="w-full h-72 p-4 rounded-xl border bg-muted/40 font-mono text-sm"
          />
        </div>
      )}

      {(tool.id === 'docx-editor' || tool.id === 'txt-to-docx' || tool.id === 'docx-to-pdf' || tool.id === 'pdf-to-docx') && (
        <div className="p-6 rounded-2xl border bg-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Document Content Editor
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {docContent.split(/\s+/).filter(Boolean).length} words &middot; {docContent.length} chars
            </span>
          </div>

          <textarea
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            className="w-full h-72 p-4 rounded-xl border bg-muted/40 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Type or paste document text here..."
          />
        </div>
      )}

      {/* Spreadsheet Workspace */}
      {(tool.id === 'csv-to-xlsx' || tool.id === 'xlsx-editor') && (
        <div className="p-6 rounded-2xl border bg-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Table className="w-4 h-4 text-primary" /> Spreadsheet Preview & Editor
            </h3>
            <span className="text-xs text-muted-foreground font-mono">{sheetData.length} rows</span>
          </div>

          <div className="overflow-x-auto max-h-80 border rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b">
                  {sheetData[0]?.map((col: any, idx: number) => (
                    <th key={idx} className="p-2.5 font-semibold border-r">
                      {col || `Col ${idx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.slice(1, 15).map((row: any[], rowIdx: number) => (
                  <tr key={rowIdx} className="border-b hover:bg-muted/30">
                    {row.map((cell: any, cellIdx: number) => (
                      <td key={cellIdx} className="p-2 border-r font-mono">
                        {cell !== undefined && cell !== null ? String(cell) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action button */}
      {(files.length > 0 || ['markdown-editor', 'html-to-pdf', 'docx-editor', 'txt-to-docx'].includes(tool.id)) &&
        job?.status !== 'ready' && (
        <div className="p-4 rounded-xl border bg-card flex items-center justify-between">
          <span className="text-sm font-medium">Ready to convert {files[0]?.name}</span>
          <Button
            size="lg"
            onClick={processDocument}
            disabled={job?.status === 'processing'}
            className="px-6 font-semibold gap-2"
          >
            {job?.status === 'processing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Convert to {tool.outputFormats[0]?.toUpperCase() || 'Document'}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Job status */}
      {job && (
        <ProcessingPanel
          job={job}
          onReset={() => {
            setFiles([]);
            setJob(null);
          }}
        />
      )}
    </div>
  );
}
