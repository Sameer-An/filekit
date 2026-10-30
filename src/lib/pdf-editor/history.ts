// src/lib/pdf-editor/history.ts
// Ring-buffer undo/redo. The store holds the current snapshot of the pieces
// of state we care about (objects, page ops, page info); history stores
// immutable references to those pieces, not the whole store.
//
// We deliberately store references (structural sharing) — the reducer in the
// store always produces new top-level objects when mutating, so history
// entries never alias each other's contents.

import type { PageInfo, PDFObject, PageOp, GridSettings } from "./types";

/**
 * Maximum number of undo steps kept in memory.
 *
 * IMPORTANT — memory safety: history entries share object references with
 * each other and with the live store via structural sharing. The `commit`
 * function in store.ts copies only the *top-level containers* (objects map,
 * pageObjectIds array, pages array, pageOps array) with a shallow spread /
 * `.slice()`. Each `PDFObject` inside those containers — including any
 * `dataUrl` field that may hold a base64-encoded image — is referenced, not
 * duplicated. This means 100 history entries cost O(1) extra memory per
 * unmodified object, NOT O(100 * image_size). Never replace the shallow
 * spreads in `commit` with `JSON.parse(JSON.stringify(...))` or
 * `structuredClone`; doing so would copy every image 100 times.
 */
export const HISTORY_LIMIT = 100;

export interface HistorySnapshot {
/** Objects keyed by id, in their state at that point in time. */
objects: Record<string, PDFObject>;
/** Per page, the ordered list of object ids (bottom → top). */
pageObjectIds: string[][];
/** Page geometry in effect at that point in time. */
pages: PageInfo[];
/** Page-level operations queued for export. */
pageOps: PageOp[];
/** Optional label for the UI ("Added text", "Moved image", …). */
label?: string;
}

export interface HistoryState {
entries: HistorySnapshot[];
index: number; // points at the "current" snapshot
}

export function createHistory(initial: HistorySnapshot): HistoryState {
return { entries: [initial], index: 0 };
}

/**
 * Push a new snapshot. Any redo entries past `index` are discarded.
 * If the new snapshot is deep-equal to the current one, it is ignored so
 * that no-op actions don't spam the buffer.
 */
export function pushSnapshot(
state: HistoryState,
next: HistorySnapshot,
): HistoryState {
const current = state.entries[state.index];
if (current && snapshotsEqual(current, next)) return state;

const trimmed = state.entries.slice(0, state.index + 1);
trimmed.push(next);
const overflow = Math.max(0, trimmed.length - HISTORY_LIMIT);
const entries = overflow > 0 ? trimmed.slice(overflow) : trimmed;
const index = entries.length - 1;
return { entries, index };
}

export function canUndo(state: HistoryState): boolean {
return state.index > 0;
}

export function canRedo(state: HistoryState): boolean {
return state.index < state.entries.length - 1;
}

/** Snapshot the caller should restore when the user hits Ctrl+Z. */
export function undoTarget(state: HistoryState): HistorySnapshot | null {
if (!canUndo(state)) return null;
return state.entries[state.index - 1] ?? null;
}

/** Snapshot the caller should restore when the user hits Ctrl+Y. */
export function redoTarget(state: HistoryState): HistorySnapshot | null {
if (!canRedo(state)) return null;
return state.entries[state.index + 1] ?? null;
}

/** Move the pointer back one entry. Callers restore the returned snapshot. */
export function stepBack(state: HistoryState): {
state: HistoryState;
snapshot: HistorySnapshot | null;
} {
if (!canUndo(state)) return { state, snapshot: null };
const nextIndex = state.index - 1;
return {
    state: { entries: state.entries, index: nextIndex },
    snapshot: state.entries[nextIndex],
};
}

/** Move the pointer forward one entry. */
export function stepForward(state: HistoryState): {
state: HistoryState;
snapshot: HistorySnapshot | null;
} {
if (!canRedo(state)) return { state, snapshot: null };
const nextIndex = state.index + 1;
return {
    state: { entries: state.entries, index: nextIndex },
    snapshot: state.entries[nextIndex],
};
}

/**
 * Cheap equality. Compares reference identity per component:
 *  - objects: top-level map identity + per-id object identity
 *  - pageObjectIds: top-level array identity + per-page array identity
 *  - pages: array identity + per-page object identity
 *  - pageOps: array identity + per-op object identity
 * Because the store reducer always creates new containers when mutating,
 * reference identity is enough. If nothing was actually mutated (same refs),
 * it's a no-op.
 */
export function snapshotsEqual(
a: HistorySnapshot,
b: HistorySnapshot,
): boolean {
if (a === b) return true;
if (a.objects !== b.objects) {
    const ak = Object.keys(a.objects);
    const bk = Object.keys(b.objects);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
    if (!(k in b.objects)) return false;
    if (a.objects[k] !== b.objects[k]) return false;
    }
}
if (a.pageObjectIds !== b.pageObjectIds) {
    if (a.pageObjectIds.length !== b.pageObjectIds.length) return false;
    for (let i = 0; i < a.pageObjectIds.length; i++) {
    if (a.pageObjectIds[i] !== b.pageObjectIds[i]) return false;
    }
}
if (a.pages !== b.pages) {
    if (a.pages.length !== b.pages.length) return false;
    for (let i = 0; i < a.pages.length; i++) {
    if (a.pages[i] !== b.pages[i]) return false;
    }
}
if (a.pageOps !== b.pageOps) {
    if (a.pageOps.length !== b.pageOps.length) return false;
    for (let i = 0; i < a.pageOps.length; i++) {
    if (a.pageOps[i] !== b.pageOps[i]) return false;
    }
}
return true;
}

/**
 * Extract a fresh `HistorySnapshot` from the current store shape. Kept here
 * so the store can call it without importing itself.
 */
export function snapshotFromState(args: {
objects: Record<string, PDFObject>;
pageObjectIds: string[][];
pages: PageInfo[];
pageOps: PageOp[];
label?: string;
}): HistorySnapshot {
return {
    objects: args.objects,
    pageObjectIds: args.pageObjectIds,
    pages: args.pages,
    pageOps: args.pageOps,
    label: args.label,
};
}

/**
 * Initial grid settings used both by the store and by the grid dialog.
 * Placed in history.ts (not grid-presets.ts) so the store can be built
 * without importing the presets module (which is client-only).
 */
export function defaultGridSettings(): GridSettings {
return {
    styleId: "square",
    cellSize: 24,
    unit: "px",
    rows: null,
    columns: null,
    lineColor: "#94a3b8",
    lineThicknessPx: 1,
    opacity: 0.35,
    majorEvery: 5,
    offsetX: 0,
    offsetY: 0,
    snap: true,
    showContent: true,
};
}
