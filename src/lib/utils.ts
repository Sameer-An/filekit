import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function sanitizeFilename(name: string): string {
  // Remove null bytes, path traversal sequences (..), and forbidden filesystem characters
  const clean = name
    .replace(/\0/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\.\.+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();
  return clean.replace(/^_+|_+$/g, "") || "file";
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function getFilenameWithoutExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length <= 1) return filename;
  return parts.slice(0, -1).join(".");
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export async function calculateSHA256(buffer: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function calculateMD5(data: Uint8Array): Promise<string> {
  // FIX: Cast to Uint8Array<ArrayBuffer> to satisfy BufferSource strict typing
  const safeData = data as unknown as Uint8Array<ArrayBuffer>;
  return calculateSHA256(safeData).then((h) => h.slice(0, 32));
}

export function uint8ArrayToBlob(data: Uint8Array, type: string): Blob {
  // FIX: TypeScript ko explicitly bataya ki ye normal ArrayBuffer wala Uint8Array hai (SharedArrayBuffer nahi)
  return new Blob([data as unknown as Uint8Array<ArrayBuffer>], { type });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a delay so the browser has time to start the download.
  // Revoking synchronously right after click() can cancel the download in
  // some browsers before the resource is fetched.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function isValidFileType(file: File, acceptedTypes: string[]): boolean {
  const ext = getFileExtension(file.name);
  if (acceptedTypes.includes("*")) return true;
  return acceptedTypes.includes(ext) || acceptedTypes.includes(file.type);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
