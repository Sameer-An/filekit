'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { FileStack, Search, Sun, Moon, Menu, X, Shield, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CATEGORY_LABELS, ToolCategory } from '@/lib/tools-registry';
import { cn } from '@/lib/utils';

const CATEGORIES: ToolCategory[] = ['pdf', 'image', 'document', 'video', 'audio', 'archive', 'utility'];

export function Header() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) router.push(`/tools?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="FileKit home">
            <div className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center shadow-sm">
              <FileStack className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight text-[15px] hidden sm:block">FileKit</span>
          </Link>

          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-2">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search tools"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 rounded-full bg-muted/70 border-transparent focus-visible:bg-card"
                aria-label="Search tools"
              />
            </div>
          </form>

          <nav className="hidden md:flex items-center gap-0.5" aria-label="Main navigation">
            <div className="relative" ref={menuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCatOpen(!catOpen)}
                className="gap-1 rounded-full"
                aria-haspopup="true"
                aria-expanded={catOpen}
              >
                Tools <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', catOpen && 'rotate-180')} />
              </Button>
              {catOpen && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-popover border rounded-2xl shadow-lg py-1.5 z-50">
                  {CATEGORIES.map((cat) => (
                    <Link
                      key={cat}
                      href={`/tools?category=${cat}`}
                      className="block px-4 py-2 text-sm hover:bg-accent rounded-lg mx-1"
                      onClick={() => setCatOpen(false)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Link>
                  ))}
                  <div className="border-t my-1" />
                  <Link
                    href="/tools"
                    className="block px-4 py-2 text-sm font-medium hover:bg-accent rounded-lg mx-1"
                    onClick={() => setCatOpen(false)}
                  >
                    All tools
                  </Link>
                </div>
              )}
            </div>

            <Link href="/#privacy">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
                <Shield className="w-3.5 h-3.5" /> Privacy
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="relative rounded-full"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </nav>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle mobile menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileOpen && (
          <div className="md:hidden py-4 border-t space-y-3">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search tools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-full"
                />
              </div>
            </form>
            <div className="grid grid-cols-2 gap-1">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/tools?category=${cat}`}
                  className="px-3 py-2 text-sm rounded-xl hover:bg-accent"
                  onClick={() => setMobileOpen(false)}
                >
                  {CATEGORY_LABELS[cat]}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <Link href="/tools" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" size="sm" className="rounded-full">All tools</Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                  setMobileOpen(false);
                }}
              >
                {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
