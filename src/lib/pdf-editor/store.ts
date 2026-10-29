// src/lib/pdf-editor/store.ts
"use client";

import React from "react";
import { pageUid } from "./coords";
import { create } from "zustand";
import type {
  PageInfo,
  PageOp,
  PDFObject,
  RectPt,
  SessionSnapshot,
  GridSettings,
  ToolId,
  OverlaySettings,
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

const EMPTY_IDS: readonly string[] = [];

const extractedUids = new Set<string>();
export function isPageExtracted(uid: string): boolean {
  return extractedUids.has(uid);
}

export type EditorStatus = "idle" | "loading" | "ready" | "error";

export interface PdfEditorState {
  originalBytes: Uint8Array | null;
  fileName: string;
  numPages: number;
  pages: PageInfo[];

  objects: Record<string, PDFObject>;
  pageObjectIds: string[][];
  pageOps: PageOp[];

  selectedIds: string[];
  activeTool: ToolId;
  editingId: string | null;

  zoom: number;
  fitMode: "none" | "width" | "page";
  currentPage: number;
  scrollPage: number;

  grid: GridSettings;
  gridVisible: boolean;

  overlays: OverlaySettings;

  propertiesOpen: boolean;
  findOpen: boolean;

  history: HistoryState;

  savedAt: number | null;
  dirty: boolean;
  status: EditorStatus;
  error: string | null;

  initDocument: (args: {
    originalBytes: Uint8Array;
    fileName: string;
    pages: PageInfo[];
    objects?: Record<string, PDFObject>;
    pageObjectIds?: string[][];
    pageOps?: PageOp[];
  }) => void;

  loadSession: (snap: SessionSnapshot) => void;
  toSessionSnapshot: () => SessionSnapshot | null;
  commit: (label: string, mutator: (draft: CommitDraft) => void) => void;
  undo: () => void;
  redo: () => void;

  selectTool: (tool: ToolId) => void;
  selectObjects: (ids: string[]) => void;
  toggleObjectSelection: (id: string) => void;
  clearSelection: () => void;
  setEditingId: (id: string | null) => void;

  addObject: (obj: PDFObject) => void;
  updateObject: (id: string, patch: Partial<PDFObject>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;

  setZoom: (zoom: number, keepFit?: boolean) => void;
  setFitMode: (fit: "none" | "width" | "page") => void;
  setCurrentPage: (page: number) => void;
  setScrollPage: (page: number) => void;

  setGrid: (patch: Partial<GridSettings>) => void;
  setGridVisible: (visible: boolean) => void;
  setOverlays: (patch: Partial<OverlaySettings>) => void;

  setPropertiesOpen: (open: boolean) => void;
  setFindOpen: (open: boolean) => void;

  setStatus: (status: EditorStatus) => void;
  setError: (error: string | null) => void;
  markSaved: () => void;

  addExtracted: (pageIndex: number, uid: string, items: PDFObject[]) => void;
  updateObjectTransient: (id: string, patch: Partial<PDFObject>) => void;
}

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
  for (let i = 0; i < ids.length; i++) {
    const obj = objects[ids[i]];
    if (obj && obj.z !== i) {
      objects[ids[i]] = { ...obj, z: i };
    }
  }
  return ids;
}

const defaultOverlays: OverlaySettings = {
  header: "",
  footer: "",
  watermark: "",
  pageNumbers: false,
};

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
  editingId: null,

  zoom: 1,
  fitMode: "width",
  currentPage: 0,
  scrollPage: 0,

  grid: defaultGridSettings(),
  gridVisible: false,

  overlays: defaultOverlays,

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
    extractedUids.clear();
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
      editingId: null,
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
    extractedUids.clear();
    for (const u of snap.extractedUids ?? []) extractedUids.add(u);

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
      editingId: null,
      zoom: snap.zoom,
      fitMode: "none",
      currentPage: snap.currentPage,
      scrollPage: snap.currentPage,
      grid: snap.grid,
      gridVisible: false,
      overlays: snap.overlays ?? defaultOverlays,
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
      overlays: s.overlays,
      savedAt: Date.now(),
      extractedUids: Array.from(extractedUids),
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
      editingId: null,
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
      editingId: null,
      dirty: true,
    });
  },

  selectTool: (tool) =>
    set({ activeTool: tool, selectedIds: [], editingId: null }),
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
  setEditingId: (id) => set({ editingId: id }),

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
      const next = { ...current, ...patch } as PDFObject;

      if (next.kind === "text-run" || next.kind === "image-placement") {
        next.dirty = true;
        if (!next.origRect) {
          next.origRect = current.rect;
        }
      }

      d.objects[id] = next;
    });
  },

  deleteSelected: () => {
    const s = get();
    const toDelete = new Set(s.selectedIds);
    if (toDelete.size === 0) return;
    get().commit("Delete", (d) => {
      for (const id of toDelete) {
        const obj = d.objects[id];
        if (!obj) continue;

        if (obj.kind === "text-run" || obj.kind === "image-placement") {
          d.objects[id] = {
            ...obj,
            deleted: true,
            dirty: true,
            origRect: obj.origRect ?? obj.rect,
          } as PDFObject;
        } else {
          delete d.objects[id];
        }
      }
      d.pageObjectIds = d.pageObjectIds.map((ids) =>
        ids.filter((id) => d.objects[id]),
      );
    });
    set({ selectedIds: [], editingId: null });
  },

  duplicateSelected: () => {
    const s = get();
    const src = s.selectedIds
      .map((id) => s.objects[id])
      .filter((o): o is PDFObject => Boolean(o) && !o.deleted);
    if (src.length === 0) return;
    const newIds: string[] = [];
    get().commit("Duplicate", (d) => {
      for (const o of src) {
        const newId = `${o.kind}-${crypto.randomUUID()}`;
        const offset = 8;
        const dup: PDFObject = {
          ...o,
          id: newId,
          rect: { ...o.rect, x: o.rect.x + offset, y: o.rect.y - offset },
        };

        if (dup.kind === "text-run" || dup.kind === "image-placement") {
          dup.dirty = true;
          dup.origRect = undefined;
        }

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

  setZoom: (zoom, keepFit = false) => {
    const clamped = Math.max(0.25, Math.min(4, zoom));
    set(keepFit ? { zoom: clamped } : { zoom: clamped, fitMode: "none" });
  },

  addExtracted: (_pageIndex, uid, items) => {
    if (extractedUids.has(uid)) return;
    extractedUids.add(uid);
    if (items.length === 0) return;

    const inject = <
      T extends {
        objects: Record<string, PDFObject>;
        pageObjectIds: string[][];
        pages: PageInfo[];
      },
    >(
      snap: T,
    ): T => {
      const idx = snap.pages.findIndex((p) => pageUid(p) === uid);
      if (idx < 0) return snap;
      const fresh = items.filter((o) => !snap.objects[o.id]);
      if (fresh.length === 0) return snap;
      const objects = { ...snap.objects };
      for (const o of fresh) objects[o.id] = { ...o, page: idx };
      const pageObjectIds = snap.pageObjectIds.slice();
      const ids = [
        ...fresh.map((o) => o.id),
        ...(snap.pageObjectIds[idx] ?? EMPTY_IDS),
      ];
      pageObjectIds[idx] = normalizeZ(ids, objects);
      return { ...snap, objects, pageObjectIds };
    };

    const s = get();
    const live = inject({
      objects: s.objects,
      pageObjectIds: s.pageObjectIds,
      pages: s.pages,
    });
    set({
      objects: live.objects,
      pageObjectIds: live.pageObjectIds,
      history: {
        entries: s.history.entries.map((e) => inject(e)),
        index: s.history.index,
      },
    });
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
  setOverlays: (patch) => set({ overlays: { ...get().overlays, ...patch } }),

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

export function usePageObjects(pageIndex: number): PDFObject[] {
  const ids = usePdfEditor((s) => s.pageObjectIds[pageIndex] ?? EMPTY_IDS);
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

export function singleSelectedRect(state: PdfEditorState): RectPt | null {
  if (state.selectedIds.length !== 1) return null;
  const obj = state.objects[state.selectedIds[0]];
  return obj ? obj.rect : null;
}

export function selectionHasTextRun(state: PdfEditorState): boolean {
  return state.selectedIds.some((id) => state.objects[id]?.kind === "text-run");
}

export type { HistorySnapshot, HistoryState };
export { canRedo, canUndo, redoTarget, undoTarget };

export function peekUndo(): HistorySnapshot | null {
  return undoTarget(usePdfEditor.getState().history);
}
export function peekRedo(): HistorySnapshot | null {
  return redoTarget(usePdfEditor.getState().history);
}
