import React from 'react';
import { Shield, Monitor, Server, Trash2, Lock } from 'lucide-react';

const POINTS = [
  {
    icon: Monitor,
    title: 'Browser-only tools',
    description: 'PDFs, images, ZIP, hashes, and most documents never leave this tab.',
  },
  {
    icon: Server,
    title: 'Media on the server',
    description: 'Video and audio use FFmpeg on the host. Files go over HTTPS, then are deleted.',
  },
  {
    icon: Trash2,
    title: 'No long-term storage',
    description: 'Temp folders are removed as soon as the download is ready, including on failure.',
  },
  {
    icon: Lock,
    title: 'No account',
    description: 'Preferences stay in your browser. We do not attach files to an identity.',
  },
];

export function PrivacySection() {
  return (
    <section id="privacy" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary mb-3">
            <Shield className="w-3.5 h-3.5" /> Privacy
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">Your files stay yours</h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Clear rules for what runs locally and what needs the server.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {POINTS.map((point) => (
            <div key={point.title} className="p-6 rounded-2xl border bg-card space-y-2">
              <div className="w-9 h-9 rounded-xl bg-accent text-primary flex items-center justify-center">
                <point.icon className="w-4 h-4" />
              </div>
              <h3 className="font-medium text-sm">{point.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
