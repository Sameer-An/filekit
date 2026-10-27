import React from 'react';
import { Upload, Settings2, Download } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Upload',
    description: 'Drop a file. Format and size are checked before anything runs.',
  },
  {
    icon: Settings2,
    title: 'Adjust',
    description: 'Set quality, pages, or format. Most jobs stay on your device.',
  },
  {
    icon: Download,
    title: 'Download',
    description: 'Get the result immediately. Server jobs delete the upload after processing.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-semibold tracking-tight mb-2">How it works</h2>
        <p className="text-muted-foreground text-sm">Three steps. No account.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-2xl border bg-card p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-accent text-primary flex items-center justify-center mx-auto">
              <step.icon className="w-6 h-6" />
            </div>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
