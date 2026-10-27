import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getToolById } from '@/lib/tools-registry';
import { ToolPageRouter } from '@/components/tools/tool-page-router';

export async function generateMetadata({ params }: { params: Promise<{ toolId: string }> }): Promise<Metadata> {
  const { toolId } = await params;
  const tool = getToolById(toolId);
  if (!tool) return { title: 'Tool Not Found' };
  return {
    title: tool.title,
    description: tool.description,
  };
}

export default async function ToolPage({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  const tool = getToolById(toolId);
  if (!tool) notFound();

  return <ToolPageRouter tool={tool} />;
}
