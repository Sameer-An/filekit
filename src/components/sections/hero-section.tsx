'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AVAILABLE_TOOL_COUNT } from '@/lib/tools-registry';

const FORMAT_CHIPS = [
  { label: 'PDF', href: '/tools?category=pdf' },
  { label: 'JPG', href: '/tools?q=jpg' },
  { label: 'PNG', href: '/tools?q=png' },
  { label: 'DOCX', href: '/tools?q=docx' },
  { label: 'MP4', href: '/tools?q=mp4' },
  { label: 'MP3', href: '/tools?q=mp3' },
  { label: 'ZIP', href: '/tools?category=archive' },
  { label: 'WebP', href: '/tools?q=webp' },
];

const SEARCH_EXAMPLES = [
  'Compress PDF',
  'Convert MP4 to MP3',
  'Resize image',
  'Merge PDFs',
  'Extract audio',
];

export function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % SEARCH_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/tools?q=${encodeURIComponent(query.trim())}`);
    else router.push('/tools');
  }

  return (
    <section className="hero-wash pt-16 pb-20 px-4">
      <div className="relative max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border text-xs font-medium mb-8 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {AVAILABLE_TOOL_COUNT} tools · no account · private by default
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight text-foreground mb-5 leading-[1.12]">
          Files in. Files out.
          <br />
          <span className="text-primary">Nothing extra.</span>
        </h1>

        <div className="mb-4">

        <span>
          <span className="text-primary mr-1">●</span>No Singup / Login
        </span>
        <span className="m-3">
          <span className="text-primary mr-1">●</span>Free
        </span>
        </div>
        <p className="text-base sm:text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
          Convert, compress, and edit PDFs, images, docs, audio, and video in
          one quiet workspace.
        </p>

        <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-7">
          <div className="flex gap-2 p-1.5 bg-card border rounded-full shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={`Try ${SEARCH_EXAMPLES[placeholderIdx]}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-11 border-0 shadow-none h-11 focus-visible:ring-0 bg-transparent"
                aria-label="Search for a tool"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="rounded-full px-6 shrink-0"
            >
              Search
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {FORMAT_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className="px-3 py-1 rounded-full text-xs font-medium bg-card border hover:border-primary/40 hover:text-primary transition-colors"
            >
              {chip.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-primary" /> Browser-first
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-primary" /> No signup
          </span>
        </div>
      </div>
    </section>
  );
}
