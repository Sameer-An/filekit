import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Toaster } from '@/components/ui/toaster';
import { TopLoadingBar } from '@/components/top-loading-bar';
import { AVAILABLE_TOOL_COUNT } from '@/lib/tools-registry';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'FileKit — Every File. Every Format. One Workspace. No SingUp. No Login',
    template: '%s | FileKit',
  },
  description: `Convert, compress, and edit files in the browser. ${AVAILABLE_TOOL_COUNT} free tools. No account required.`,
  keywords: ['file converter', 'pdf tools', 'image converter', 'video converter', 'audio converter', 'compress files'],
  openGraph: {
    title: 'FileKit',
    description: 'Every File. Every Format. One Workspace.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Suspense fallback={null}>
            <TopLoadingBar />
          </Suspense>
          <div className="min-h-screen flex flex-col bg-background text-foreground">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
