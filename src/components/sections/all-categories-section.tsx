import React from 'react';
import Link from 'next/link';
import { FileText, Image, BookOpen, Video, Music, Archive, Wrench } from 'lucide-react';
import { CATEGORY_LABELS, ToolCategory, getToolsByCategory } from '@/lib/tools-registry';

const CATEGORIES: { id: ToolCategory; icon: React.ElementType }[] = [
  { id: 'pdf', icon: FileText },
  { id: 'image', icon: Image },
  { id: 'document', icon: BookOpen },
  { id: 'video', icon: Video },
  { id: 'audio', icon: Music },
  { id: 'archive', icon: Archive },
  { id: 'utility', icon: Wrench },
];

export function AllCategoriesSection() {
  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight text-center mb-2">Browse by category</h2>
        <p className="text-muted-foreground text-center text-sm mb-8">Pick a file type and go.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {CATEGORIES.map(({ id, icon: Icon }) => {
            const count = getToolsByCategory(id).filter((t) => t.status === 'available').length;
            return (
              <Link
                key={id}
                href={`/tools?category=${id}`}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl border bg-card hover:border-primary/35 transition-colors text-center"
              >
                <div className="w-11 h-11 rounded-2xl bg-accent text-primary flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-sm">{CATEGORY_LABELS[id]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} tools</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
