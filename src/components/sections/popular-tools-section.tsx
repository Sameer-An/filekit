import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ToolCard } from '@/components/tool-card';
import { getPopularTools } from '@/lib/tools-registry';
import { Button } from '@/components/ui/button';

export function PopularToolsSection() {
  const popularTools = getPopularTools();

  return (
    <section className="py-16 px-4 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Popular tools</h2>
          <p className="text-muted-foreground mt-1 text-sm">Start with the jobs people run most.</p>
        </div>
        <Link href="/tools">
          <Button variant="ghost" size="sm" className="gap-1 rounded-full">
            All tools <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {popularTools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
