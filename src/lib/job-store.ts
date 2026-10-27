import { generateId } from './utils';

export type JobStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'finalizing'
  | 'ready'
  | 'cancelled'
  | 'failed';

export interface ProcessingJob {
  id: string;
  filename: string;
  originalSize: number;
  status: JobStatus;
  progress: number; // 0-100, -1 for indeterminate
  message: string;
  outputUrl?: string;
  outputFilename?: string;
  outputSize?: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export function createJob(filename: string, originalSize: number): ProcessingJob {
  return {
    id: generateId(),
    filename,
    originalSize,
    status: 'idle',
    progress: 0,
    message: 'Ready',
    createdAt: Date.now(),
  };
}
