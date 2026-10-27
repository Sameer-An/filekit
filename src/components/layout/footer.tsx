import React from 'react';
import Link from 'next/link';
import { FileStack, Shield } from 'lucide-react';
import { CATEGORY_LABELS, ToolCategory, AVAILABLE_TOOL_COUNT } from '@/lib/tools-registry';

const CATEGORIES: ToolCategory[] = ['pdf', 'image', 'document', 'video', 'audio', 'archive', 'utility'];

export function Footer() {
  return (
    <footer className="border-t mt-20 bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-2xl flex items-center justify-center">
                <FileStack className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">FileKit</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {AVAILABLE_TOOL_COUNT} free tools for files you already have. Most work in the browser.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Privacy-first by design</span>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Categories</h4>
            <ul className="space-y-2">
              {CATEGORIES.map((cat) => (
                <li key={cat}>
                  <Link href={`/tools?category=${cat}`} className="text-sm text-muted-foreground hover:text-foreground">
                    {CATEGORY_LABELS[cat]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Popular</h4>
            <ul className="space-y-2">
              {[
                ['Compress PDF', '/tools/pdf-compress'],
                ['PDF to Word', '/tools/pdf-to-docx'],
                ['Merge PDF', '/tools/pdf-merge'],
                ['Compress image', '/tools/image-compress'],
                ['Convert video', '/tools/video-convert'],
                ['MP4 to MP3', '/tools/mp4-to-mp3'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Info</h4>
            <ul className="space-y-2">
              {[
                ['Privacy', '/#privacy'],
                ['FAQ', '/#faq'],
                ['All tools', '/tools'],
                ['How it works', '/#how-it-works'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t mt-10 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} FileKit</p>
          <p className="text-xs text-muted-foreground">
            Browser tools never upload files. Media conversions need FFmpeg on the host and delete uploads after processing.
          </p>
        </div>
      </div>
    </footer>
  );
}
