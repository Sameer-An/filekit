import React from 'react';
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ToolNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-20">
      <FileQuestion className="w-16 h-16 text-muted-foreground mb-6" />
      <h1 className="text-2xl font-bold mb-2">Tool Not Found</h1>
      <p className="text-muted-foreground mb-6 max-w-sm">
        This tool does not exist or has not been implemented yet.
      </p>
      <Link href="/tools">
        <Button>Browse All Tools</Button>
      </Link>
    </div>
  );
}
