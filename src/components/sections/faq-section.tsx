'use client';
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const FAQS = [
  {
    q: 'Is this free?',
    a: 'Yes. Core tools are free and do not require an account.',
  },
  {
    q: 'Are my files uploaded?',
    a: 'Most tools run in the browser. Video and audio conversion upload to the server, process with FFmpeg, then delete the files.',
  },
  {
    q: 'What is the size limit?',
    a: '200 MB per file. Browser tools also depend on your device memory.',
  },
  {
    q: 'Why did PDF compression not shrink much?',
    a: 'Already-optimized PDFs have little room left. Extreme mode re-renders pages as JPEG, which is lossy but smaller.',
  },
  {
    q: 'Do video tools work on Vercel?',
    a: 'No. Media tools need a Node host with FFmpeg (Docker or a VPS). Browser tools still work anywhere.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-4 text-left text-sm font-medium"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {q}
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</div>}
    </div>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="py-16 px-4 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold tracking-tight mb-2">FAQ</h2>
        <p className="text-muted-foreground text-sm">Short answers.</p>
      </div>
      <div className="rounded-2xl border bg-card px-6">
        {FAQS.map((faq) => (
          <FaqItem key={faq.q} {...faq} />
        ))}
      </div>
    </section>
  );
}
