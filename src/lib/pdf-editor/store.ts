// src/lib/pdf-editor/store.ts
// Zustand store for the PDF Editor. Single source of truth for:
//  - the loaded document (original bytes, page infos)
//  - all objects (existing runs, image placements, new content)
//  - selection, active tool, view state
//  - grid settings
//  - undo/redo history
//
// All mutations go through `commit(mutator)`. `commit` clones the top-level
// containers (never deep-clones individual objects) so history snapshots can
// share refs with the live state.

"use client";

import React from "react";
import { create } from "zustand";
import type {
PageInfo,
PageOp,
PDFObject,
RectPt,
SessionSnapshot,
GridSettings,
ToolId,
} from "./types";
import {
canRedo,
canUndo,
createHistory,
defaultGridSettings,
HistorySnapshot,
HistoryState,
pushSnapshot,
redoTarget,
snapshotFromState,
stepBack,
stepForward,
undoTarget,
} from "./history";

/**
 * Stable empty array used as a fallback for `pageObjectIds[pageIndex]`.
 * Creating `[]` inline in a selector returns a new reference on every call,
 * which is the canonical React 19 "getSnapshot should be cached" bug.
 * Never mutate this.
 */
const EMPTY_IDS: readonly string[] = [];

export type EditorStatus = "idle" | "loading" | "ready" | "error";

export interface PdfEditorState {
  /* Document */
  originalBytes: Uint8Array | null;
  fileName: string;
  numPages: number;
  pages: PageInfo[];

  /* Objects */
  objects: Record<string, PDFObject>;
  pageObjectIds: string[][];

  /* Page ops queued for export */
  pageOps: PageOp[];

  /* Selection + tool */
  selectedIds: string[];
  activeTool: ToolId;

  /* View */
  zoom: number;
  fitMode: "none" | "width" | "page";
  currentPage: number;
  scrollPage: number;

  /* Grid */
  grid: GridSettings;
  gridVisible: boolean;

  /* UI flags */
  propertiesOpen: boolean;
  findOpen: boolean;

  /* History */
  history: HistoryState;

  /* Persistence */
  savedAt: number | null;
  dirty: boolean;
  status: EditorStatus;
  error: string | null;

  /* ───── Actions ───── */

  /** Replace the whole editor with a freshly loaded document. */
  initDocument: (args: {
    originalBytes: Uint8Array;
    fileName: string;
    pages: PageInfo[];
    objects?: Record<string, PDFObject>;
    pageObjectIds?: string[][];
    pageOps?: PageOp[];
  }) => void;

  /** Restore from an autosaved snapshot. */
  loadSession: (snap: SessionSnapshot) => void;

  /** Produce a serialisable snapshot for autosave. */
  toSessionSnapshot: () => SessionSnapshot | null;

  /**
   * Run a mutation. The mutator receives a mutable draft with top-level
   * containers already cloned. Push a history snapshot before returning.
   */
  commit: (label: string, mutator: (draft: CommitDraft) => void) => void;

  undo: () => void;
  redo: () => void;

  selectTool: (tool: ToolId) => void;
  selectObjects: (ids: string[]) => void;
  toggleObjectSelection: (id: string) => void;
  clearSelection: () => void;

  addObject: (obj: PDFObject) => void;
  updateObject: (id: string, patch: Partial<PDFObject>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;

  setZoom: (zoom: number) => void;
  setFitMode: (fit: "none" | "width" | "page") => void;
  setCurrentPage: (page: number) => void;
  setScrollPage: (page: number) => void;

  setGrid: (patch: Partial<GridSettings>) => void;
  setGridVisible: (visible: boolean) => void;

  setPropertiesOpen: (open: boolean) => void;
  setFindOpen: (open: boolean) => void;

  setStatus: (status: EditorStatus) => void;
  setError: (error: string | null) => void;
  markSaved: () => void;
  /** Transient update without pushing a history snapshot. */
  updateObjectTransient: (id: string, patch: Partial<PDFObject>) => void;
}

/** Mutable draft handed to `commit()` — top-level containers are new. */
export interface CommitDraft {
objects: Record<string, PDFObject>;
pageObjectIds: string[][];
pages: PageInfo[];
pageOps: PageOp[];
}

const emptyHistory = createHistory(
snapshotFromState({
    objects: {},
    pageObjectIds: [],
    pages: [],
    pageOps: [],
    label: "Initial",
}),
);

function clonePageIds(ids: string[][]): string[][] {
return ids.map((arr) => arr.slice());
}

function normalizeZ(
ids: string[],
objects: Record<string, PDFObject>,
): string[] {
// Ensure the array order is authoritative for z. Also rewrite each
// object's numeric `z` field to match so renderers that sort by `z`
// agree with the array order.
for (let i = 0; i < ids.length; i++) {
    const obj = objects[ids[i]];
    if (obj && obj.z !== i) {
    objects[ids[i]] = { ...obj, z: i };
    }
}
return ids;
}

export const usePdfEditor = create<PdfEditorState>((set, get) => ({
  originalBytes: null,
  fileName: "",
  numPages: 0,
  pages: [],

  objects: {},
  pageObjectIds: [],
  pageOps: [],

  selectedIds: [],
  activeTool: "select",

  zoom: 1,
  fitMode: "width",
  currentPage: 0,
  scrollPage: 0,

  grid: defaultGridSettings(),
  gridVisible: false,

  propertiesOpen: true,
  findOpen: false,

  history: emptyHistory,

  savedAt: null,
  dirty: false,
  status: "idle",
  error: null,

  initDocument: ({
    originalBytes,
    fileName,
    pages,
    objects,
    pageObjectIds,
    pageOps,
  }) => {
    const safeObjects = objects ?? {};
    const safePageIds = pageObjectIds ?? pages.map(() => [] as string[]);
    const safeOps = pageOps ?? [];
    const history = createHistory(
      snapshotFromState({
        objects: safeObjects,
        pageObjectIds: safePageIds,
        pages,
        pageOps: safeOps,
        label: "Load document",
      }),
    );
    set({
      originalBytes,
      fileName,
      numPages: pages.length,
      pages,
      objects: safeObjects,
      pageObjectIds: safePageIds,
      pageOps: safeOps,
      selectedIds: [],
      activeTool: "select",
      zoom: 1,
      fitMode: "width",
      currentPage: 0,
      scrollPage: 0,
      history,
      savedAt: null,
      dirty: false,
      status: "ready",
      error: null,
    });
  },

  loadSession: (snap) => {
    const history = createHistory(
      snapshotFromState({
        objects: snap.objects,
        pageObjectIds: snap.pageObjectIds,
        pages: snap.pages,
        pageOps: [],
        label: "Restore session",
      }),
    );
    set({
      originalBytes: snap.originalBytes,
      fileName: snap.fileName,
      numPages: snap.pages.length,
      pages: snap.pages,
      objects: snap.objects,
      pageObjectIds: snap.pageObjectIds,
      pageOps: [],
      selectedIds: [],
      activeTool: "select",
      zoom: snap.zoom,
      fitMode: "none",
      currentPage: snap.currentPage,
      scrollPage: snap.currentPage,
      grid: snap.grid,
      gridVisible: snap.grid.snap,
      history,
      savedAt: snap.savedAt,
      dirty: false,
      status: "ready",
      error: null,
    });
  },

  toSessionSnapshot: () => {
    const s = get();
    if (!s.originalBytes) return null;
    return {
      fileName: s.fileName,
      originalBytes: s.originalBytes,
      pages: s.pages,
      objects: s.objects,
      pageObjectIds: s.pageObjectIds,
      zoom: s.zoom,
      currentPage: s.currentPage,
      grid: s.grid,
      savedAt: Date.now(),
    };
  },

  commit: (label, mutator) => {
    const s = get();
    const draft: CommitDraft = {
      objects: { ...s.objects },
      pageObjectIds: clonePageIds(s.pageObjectIds),
      pages: s.pages.slice(),
      pageOps: s.pageOps.slice(),
    };
    mutator(draft);
    // Renormalise z per page.
    draft.pageObjectIds = draft.pageObjectIds.map((ids) =>
      normalizeZ(ids, draft.objects),
    );
    const nextSnapshot = snapshotFromState({
      objects: draft.objects,
      pageObjectIds: draft.pageObjectIds,
      pages: draft.pages,
      pageOps: draft.pageOps,
      label,
    });
    const history = pushSnapshot(s.history, nextSnapshot);
    set({
      objects: draft.objects,
      pageObjectIds: draft.pageObjectIds,
      pages: draft.pages,
      pageOps: draft.pageOps,
      history,
      dirty: true,
    });
  },

  undo: () => {
    const s = get();
    if (!canUndo(s.history)) return;
    const { state, snapshot } = stepBack(s.history);
    if (!snapshot) return;
    set({
      history: state,
      objects: snapshot.objects,
      pageObjectIds: snapshot.pageObjectIds,
      pages: snapshot.pages,
      pageOps: snapshot.pageOps,
      selectedIds: [],
      dirty: true,
    });
  },

  redo: () => {
    const s = get();
    if (!canRedo(s.history)) return;
    const { state, snapshot } = stepForward(s.history);
    if (!snapshot) return;
    set({
      history: state,
      objects: snapshot.objects,
      pageObjectIds: snapshot.pageObjectIds,
      pages: snapshot.pages,
      pageOps: snapshot.pageOps,
      selectedIds: [],
      dirty: true,
    });
  },

  selectTool: (tool) => set({ activeTool: tool, selectedIds: [] }),
  selectObjects: (ids) => set({ selectedIds: ids }),
  toggleObjectSelection: (id) => {
    const cur = get().selectedIds;
    set({
      selectedIds: cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id],
    });
  },
  clearSelection: () => set({ selectedIds: [] }),

  addObject: (obj) => {
    get().commit(`Add ${obj.kind}`, (d) => {
      d.objects[obj.id] = obj;
      const pageArr = d.pageObjectIds[obj.page] ?? [];
      pageArr.push(obj.id);
      d.pageObjectIds[obj.page] = pageArr;
    });
    set({ selectedIds: [obj.id] });
  },

  updateObject: (id, patch) => {
    const current = get().objects[id];
    if (!current) return;
    if (current.locked) return;
    get().commit(`Update ${current.kind}`, (d) => {
      d.objects[id] = { ...current, ...patch } as PDFObject;
    });
  },

  deleteSelected: () => {
    const s = get();
    const toDelete = new Set(s.selectedIds);
    if (toDelete.size === 0) return;
    get().commit("Delete", (d) => {
      for (const id of toDelete) delete d.objects[id];
      d.pageObjectIds = d.pageObjectIds.map((ids) =>
        ids.filter((id) => !toDelete.has(id)),
      );
    });
    set({ selectedIds: [] });
  },

  duplicateSelected: () => {
    const s = get();
    const src = s.selectedIds
      .map((id) => s.objects[id])
      .filter((o): o is PDFObject => Boolean(o));
    if (src.length === 0) return;
    const newIds: string[] = [];
    get().commit("Duplicate", (d) => {
      for (const o of src) {
        const newId = `${o.kind}-${crypto.randomUUID()}`;
        const offset = 8; // pt
        const dup: PDFObject = {
          ...o,
          id: newId,
          rect: { ...o.rect, x: o.rect.x + offset, y: o.rect.y - offset },
        };
        d.objects[newId] = dup;
        const pageArr = d.pageObjectIds[o.page] ?? [];
        pageArr.push(newId);
        d.pageObjectIds[o.page] = pageArr;
        newIds.push(newId);
      }
    });
    set({ selectedIds: newIds });
  },

  bringForward: () => {
    const s = get();
    if (s.selectedIds.length === 0) return;
    get().commit("Bring forward", (d) => {
      const sel = new Set(s.selectedIds);
      d.pageObjectIds = d.pageObjectIds.map((ids) => {
        const next = ids.slice();
        // Walk from top-1 → 0, swapping each selected with its upper neighbour.
        for (let i = next.length - 2; i >= 0; i--) {
          if (sel.has(next[i]) && !sel.has(next[i + 1])) {
            [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        }
        return next;
      });
    });
  },

  sendBackward: () => {
    const s = get();
    if (s.selectedIds.length === 0) return;
    get().commit("Send backward", (d) => {
      const sel = new Set(s.selectedIds);
      d.pageObjectIds = d.pageObjectIds.map((ids) => {
        const next = ids.slice();
        for (let i = 1; i < next.length; i++) {
          if (sel.has(next[i]) && !sel.has(next[i - 1])) {
            [next[i], next[i - 1]] = [next[i - 1], next[i]];
          }
        }
        return next;
      });
    });
  },

  setZoom: (zoom) => {
    const clamped = Math.max(0.25, Math.min(4, zoom));
    set({ zoom: clamped, fitMode: "none" });
  },
  setFitMode: (fit) => set({ fitMode: fit }),
  setCurrentPage: (page) => {
    const s = get();
    const p = Math.max(0, Math.min(s.pages.length - 1, page));
    set({ currentPage: p });
  },
  setScrollPage: (page) => {
    const s = get();
    const p = Math.max(0, Math.min(s.pages.length - 1, page));
    set({ scrollPage: p });
  },

  setGrid: (patch) => set({ grid: { ...get().grid, ...patch } }),
  setGridVisible: (visible) => set({ gridVisible: visible }),

  setPropertiesOpen: (open) => set({ propertiesOpen: open }),
  setFindOpen: (open) => set({ findOpen: open }),

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  markSaved: () => set({ dirty: false, savedAt: Date.now() }),
  updateObjectTransient: (id, patch) => {
    const current = get().objects[id];
    if (!current) return;
    const next = { ...current, ...patch } as PDFObject;
    set({
      objects: { ...get().objects, [id]: next },
      dirty: true,
    });
  },
}));

/* ───────────── Selectors (memoised helpers) ───────────── */

/**
 * All objects of a page, in z-order.
 *
 * Zustand v5 removed the v4 `useStore(selector, equalityFn)` signature, so
 * passing `shallow` as the 2nd argument does nothing — the selector is called
 * raw and a new array is returned on every render, which makes
 * `useSyncExternalStore` see a new snapshot each time and loop.
 *
 * Fix: select only STABLE references from the store (the id array and the
 * objects map — both are replaced immutably by `commit`/`updateObject*`),
 * then derive the object array with `useMemo` so its identity is stable
 * until one of those two inputs actually changes.
 */
export function usePageObjects(pageIndex: number): PDFObject[] {
  const ids = usePdfEditor(
    (s) => s.pageObjectIds[pageIndex] ?? EMPTY_IDS,
  );
  const objects = usePdfEditor((s) => s.objects);
  return React.useMemo(() => {
    const out: PDFObject[] = [];
    for (const id of ids) {
      const o = objects[id];
      if (o) out.push(o);
    }
    return out;
  }, [ids, objects]);
}

/** Current rect of a selected object, if exactly one is selected. */
export function singleSelectedRect(state: PdfEditorState): RectPt | null {
if (state.selectedIds.length !== 1) return null;
const obj = state.objects[state.selectedIds[0]];
return obj ? obj.rect : null;
}

/** True when at least one selection is a text-run (for the font-substitution notice). */
export function selectionHasTextRun(state: PdfEditorState): boolean {
return state.selectedIds.some((id) => state.objects[id]?.kind === "text-run");
}

/* Convenience re-exports for consumers */
export type { HistorySnapshot, HistoryState };
export { canRedo, canUndo, redoTarget, undoTarget };

/**
 * Undo helpers exposed to UI — return the snapshot that *would* be applied
 * without applying it, so the UI can enable/disable buttons accurately.
 */
export function peekUndo(): HistorySnapshot | null {
return undoTarget(usePdfEditor.getState().history);
}
export function peekRedo(): HistorySnapshot | null {
return redoTarget(usePdfEditor.getState().history);
}
