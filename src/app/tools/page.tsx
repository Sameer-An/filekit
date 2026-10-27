'use client';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X, Filter, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToolCard } from '@/components/tool-card';
import {
  TOOL_REGISTRY,
  CATEGORY_LABELS,
  ToolCategory,
  searchTools,
  ToolDefinition,
} from '@/lib/tools-registry';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';

const CATEGORIES: ToolCategory[] = ['pdf', 'image', 'document', 'video', 'audio', 'archive', 'utility'];
const MODES = [{ value: 'browser', label: 'Browser-side' }, { value: 'server', label: 'Server-side' }];

function ToolsContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const initialCat = (searchParams.get('category') as ToolCategory) || '';

  const [query, setQuery] = useState(initialQ);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | ''>(initialCat);
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedCategory((searchParams.get('category') as ToolCategory) || '');
  }, [searchParams]);

  const filtered: ToolDefinition[] = useMemo(() => {
    let results = query ? searchTools(query) : TOOL_REGISTRY;
    if (selectedCategory) results = results.filter((t) => t.category === selectedCategory);
    if (selectedMode) results = results.filter((t) => t.mode === selectedMode || (selectedMode === 'hybrid' && t.mode === 'hybrid'));
    return results;
  }, [query, selectedCategory, selectedMode]);

  const resetFilters = useCallback(() => {
    setQuery('');
    setSelectedCategory('');
    setSelectedMode('');
  }, []);

  const hasFilters = query || selectedCategory || selectedMode;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">All tools</h1>
        <p className="text-muted-foreground">
          {TOOL_REGISTRY.filter((t) => t.status === 'available').length} free tools available &mdash; browse, search, and filter below
        </p>
      </div>

      {/* Filters */}
      <div className="sticky top-[65px] z-30 bg-background/90 backdrop-blur-xl py-4 mb-6 space-y-4 border-b">
        {/* Search */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder='Search tools, formats, or tasks...(e.g., "compress PDF", "jpg to png")'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 rounded-full"
            aria-label="Search tools"
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Category:
          </span>
          <button
            onClick={() => setSelectedCategory('')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              !selectedCategory ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary/50'
            )}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                selectedCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary/50'
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}

          <div className="ml-2 flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">Mode:</span>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedMode(m.value === selectedMode ? '' : m.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  selectedMode === m.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary/50'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 gap-1 ml-1">
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('grid')} aria-label="Grid view">
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode('list')} aria-label="List view">
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} tool{filtered.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-lg mb-2">No tools found</p>
          <p className="text-sm">Try a different search term or clear your filters.</p>
          <Button variant="outline" className="mt-4" onClick={resetFilters}>Clear Filters</Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} compact />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ToolsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">Loading tools...</div>}>
      <ToolsContent />
    </Suspense>
  );
}
