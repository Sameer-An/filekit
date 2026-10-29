// src/lib/pdf-editor/autosave.ts
// Debounced autosave to IndexedDB. Subscribes to the store and writes a
// session snapshot 1.5s after the last commit. Also flushes on unload.

"use client";

import { usePdfEditor } from "./store";
import { saveSession, clearSession } from "./idb";

const DEBOUNCE_MS = 1500;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let attached = false;

async function flush(): Promise<void> {
if (timer) {
    clearTimeout(timer);
    timer = null;
}
const s = usePdfEditor.getState();
if (!s.dirty || s.status !== "ready" || !s.originalBytes) return;
const snap = s.toSessionSnapshot();
if (!snap) return;
try {
    await saveSession(snap);
    usePdfEditor.getState().markSaved();
} catch (err) {
    console.warn("[autosave] save failed", err);
}
}

function schedule(): void {
if (timer) clearTimeout(timer);
timer = setTimeout(() => {
    timer = null;
    void flush();
}, DEBOUNCE_MS);
}

export function startAutosave(): void {
if (attached) return;
attached = true;
unsubscribe = usePdfEditor.subscribe((state, prev) => {
    if (state.dirty && state.dirty !== prev.dirty) {
    schedule();
    } else if (state.dirty) {
    schedule();
    }
});
if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
}
}

export function stopAutosave(): void {
if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
}
if (timer) {
    clearTimeout(timer);
    timer = null;
}
attached = false;
if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", onBeforeUnload);
}
}

export async function flushAutosave(): Promise<void> {
await flush();
}

export async function discardSession(): Promise<void> {
try {
    await clearSession();
} catch {
    /* ignore */
}
}

function onBeforeUnload(): void {
// Best-effort synchronous write is impossible for IndexedDB; instead we
// schedule one more flush via a beacon-style timer. Most browsers will
// run the microtask before the page dies if it's already been started.
void flush();
}
