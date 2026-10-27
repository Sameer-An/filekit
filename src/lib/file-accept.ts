import { getFileExtension } from './utils';

const ALIASES: Record<string, string[]> = {
  jpg: ['jpg', 'jpeg'],
  jpeg: ['jpg', 'jpeg'],
  htm: ['htm', 'html'],
  html: ['htm', 'html'],
  yml: ['yml', 'yaml'],
  yaml: ['yml', 'yaml'],
};

export function expandAccept(accept: string[]): string[] {
  const out = new Set<string>();
  for (const item of accept) {
    out.add(item.toLowerCase());
    for (const alias of ALIASES[item.toLowerCase()] || []) out.add(alias);
  }
  return [...out];
}

export function isAcceptedFile(file: File, accept: string[]): boolean {
  if (accept.includes('*')) return true;
  const expanded = expandAccept(accept);
  const ext = getFileExtension(file.name);
  return expanded.includes(ext) || expanded.includes(file.type.toLowerCase());
}
