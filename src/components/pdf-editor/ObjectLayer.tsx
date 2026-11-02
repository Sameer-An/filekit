// src/components/pdf-editor/ObjectLayer.tsx
"use client";
import { Lock } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { usePdfEditor, usePageObjects } from "@/lib/pdf-editor/store";
import type {
  PageInfo,
  PDFObject,
  RectPt,
  TextRunObject,
  NewTextObject,
  StyledTextRun,
  HighlightObject,
} from "@/lib/pdf-editor/types";
import {
  pdfRectToCss,
  cssRectToPdf,
  snapPt,
  cssToPdfPt,
} from "@/lib/pdf-editor/coords";
import {
  materializeRuns,
  replaceText,
} from "@/lib/pdf-editor/text-runs";

interface ObjectLayerProps {
  pageIndex: number;
  pageInfo: PageInfo;
  zoom: number;
  debug?: boolean;
}

function rectsIntersect(a: RectPt, b: RectPt): boolean {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

const DRAG_THRESHOLD = 4; // screen px
// +0.5pt on each side matches drawCover() in export.ts
const COVER_PAD = 0.5;

export function ObjectLayer({
  pageIndex,
  pageInfo,
  zoom,
  debug = false,
}: ObjectLayerProps) {
  const objects = usePageObjects(pageIndex);
  const {
    selectedIds,
    activeTool,
    gridSnap,
    editingId,
    currentPage,
    selectObjects,
    toggleObjectSelection,
    updateObject,
    addObject,
    selectTool,
    setEditingId,
    commit,
  } = usePdfEditor(
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      activeTool: s.activeTool,
      gridSnap: s.grid.snap,
      editingId: s.editingId,
      currentPage: s.currentPage,
      selectObjects: s.selectObjects,
      toggleObjectSelection: s.toggleObjectSelection,
      updateObject: s.updateObject,
      addObject: s.addObject,
      selectTool: s.selectTool,
      setEditingId: s.setEditingId,
      commit: s.commit,
    })),
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedSet = new Set(selectedIds);

  /** Local drag state: only set after threshold is exceeded */
  const [localDrag, setLocalDrag] = useState<{
    id: string;
    rect: RectPt;
  } | null>(null);
  const [localGroupDrag, setLocalGroupDrag] = useState<Record<
    string,
    RectPt
  > | null>(null);

  /** Drag candidate (not yet over threshold) */
  const pendingRef = useRef<{
    id: string;
    mode: "move" | "resize";
    handle?: string;
    startX: number;
    startY: number;
    startRect: RectPt;
    startRects: Record<string, RectPt>;
    started: boolean;
  } | null>(null);

  /** Marquee selection drag */
  const marqueeDragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
    additive: boolean;
    initialSelection: string[];
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  /** Highlight drag rect (screen coords) */
  const highlightDragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);
  const [highlightRect, setHighlightRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Image upload
  useEffect(() => {
    if (activeTool === "image" && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [activeTool]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const id = `new-image-${crypto.randomUUID()}`;
        const base = {
          id,
          page: pageIndex,
          rect: clampRect(
            { x: 50, y: 50, w: img.width / 2, h: img.height / 2 },
            pageInfo,
          ),
          rotation: 0,
          z: objects.length,
          locked: false,
          opacity: 1,
        };
        addObject({ ...base, kind: "new-image", dataUrl });
        selectTool("select");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /** Create a new object at a PDF-space rect */
  const createNewObjectAt = useCallback(
    (rectPt: RectPt) => {
      const id = `${activeTool}-${crypto.randomUUID()}`;
      const base = {
        id,
        page: pageIndex,
        rect: clampRect(rectPt, pageInfo),
        rotation: 0,
        z: objects.length,
        locked: false,
        opacity: 1,
      };
      let obj: PDFObject | null = null;
      switch (activeTool) {
        case "text":
          obj = {
            ...base,
            kind: "new-text",
            text: "",
            fontFamily: "Helvetica",
            fontSize: 14,
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            color: "#111111",
            align: "left",
            lineHeight: 1.2,
            letterSpacing: 0,
          };
          break;
        case "shape":
          obj = {
            ...base,
            kind: "shape",
            shape: "rect",
            stroke: "#111111",
            fill: null,
            strokeWidth: 1,
          };
          break;
        case "highlight":
          obj = { ...base, kind: "highlight", color: "#facc15" };
          break;
        case "underline":
          obj = {
            ...base,
            kind: "underline",
            color: "#111111",
            strokeWidth: 1.5,
          };
          break;
        case "strike":
          obj = {
            ...base,
            kind: "strike",
            color: "#111111",
            strokeWidth: 1.5,
          };
          break;
        case "whiteout":
          obj = { ...base, kind: "whiteout", color: "#ffffff" };
          break;
        case "redact":
          obj = { ...base, kind: "redact", color: "#000000" };
          break;
        case "note":
          obj = {
            ...base,
            kind: "note",
            author: "You",
            body: "Note",
            color: "#fbbf24",
          };
          break;
        case "link":
          obj = { ...base, kind: "link", href: "https://", color: "#2563eb" };
          break;
        case "stamp":
          obj = { ...base, kind: "stamp", label: "DRAFT", color: "#dc2626" };
          break;
        case "checkmark":
          obj = { ...base, kind: "checkmark", color: "#16a34a" };
          break;
        default:
          return;
      }
      addObject(obj);
      if (activeTool === "text") {
        setTimeout(() => usePdfEditor.getState().setEditingId(obj!.id), 50);
      }
    },
    [activeTool, pageIndex, pageInfo, objects.length, addObject],
  );

  /** Background pointer down: select / create / highlight drag */
  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return;

      if (activeTool === "highlight") {
        const root = rootRef.current;
        if (!root) return;
        const p = toLocal(root, e, zoom);
        highlightDragRef.current = {
          startX: p.x,
          startY: p.y,
          currentX: p.x,
          currentY: p.y,
          active: true,
        };
        setHighlightRect({ x: p.x, y: p.y, w: 0, h: 0 });
        root.setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "select") {
        const root = rootRef.current;
        if (!root) return;
        const p = toLocal(root, e, zoom);
        const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
        marqueeDragRef.current = {
          startX: p.x,
          startY: p.y,
          currentX: p.x,
          currentY: p.y,
          active: true,
          additive: isAdditive,
          initialSelection: isAdditive
            ? usePdfEditor.getState().selectedIds
            : [],
        };
        if (!isAdditive) {
          selectObjects([]);
        }
        (root as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }

      if (activeTool === "image") return;
      const root = rootRef.current;
      if (!root) return;
      const px = toLocal(root, e, zoom);
      const pt = cssRectToPdf(
        { left: px.x, top: px.y, width: 200, height: 40 },
        pageInfo,
        1,
      );
      createNewObjectAt(pt);
      return;
    },
    [activeTool, pageInfo, zoom, selectObjects, createNewObjectAt],
  );

  /** Object pointer down: register drag candidate (no capture yet) */
  const onObjectPointerDown = (
    e: React.PointerEvent,
    obj: PDFObject,
    mode: "move" | "resize",
    handle?: string,
  ) => {
    if (obj.deleted) return;
    e.stopPropagation();

    const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
    if (isMultiKey) {
      toggleObjectSelection(obj.id);
      return;
    }

    if (!selectedSet.has(obj.id)) {
      selectObjects([obj.id]);
    }

    // Locked: allow selection (so the panel can show "Unlock") but no drag.
    if (obj.locked) return;

    const idsToDrag = selectedSet.has(obj.id)
      ? Array.from(selectedSet)
      : [obj.id];
    const startRects: Record<string, RectPt> = {};
    for (const id of idsToDrag) {
      const o = objects.find((item) => item.id === id);
      if (o) startRects[id] = { ...o.rect };
    }

    pendingRef.current = {
      id: obj.id,
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...obj.rect },
      startRects,
      started: false,
    };
  };

  /** Global pointer move: start drag only after threshold */
  const onPointerMove = (e: React.PointerEvent) => {
    // Marquee selection drag
    if (marqueeDragRef.current?.active) {
      const drag = marqueeDragRef.current;
      const root = rootRef.current;
      if (!root) return;
      const { x, y } = toLocal(root, e, zoom);
      drag.currentX = x;
      drag.currentY = y;
      const left = Math.min(drag.startX, x);
      const top = Math.min(drag.startY, y);
      const w = Math.abs(x - drag.startX);
      const h = Math.abs(y - drag.startY);
      setMarqueeRect({ x: left, y: top, w, h });

      if (w >= 4 || h >= 4) {
        const cssRect = { left, top, width: w, height: h };
        const pdfRect = cssRectToPdf(cssRect, pageInfo, 1);
        const hits = objects
          .filter(
            (o) => !o.deleted && !o.locked && rectsIntersect(o.rect, pdfRect),
          )
          .map((o) => o.id);
        const nextSelected = drag.additive
          ? Array.from(new Set([...drag.initialSelection, ...hits]))
          : hits;
        selectObjects(nextSelected);
      }
      return;
    }

    // Highlight drag
    if (highlightDragRef.current?.active) {
      const root = rootRef.current;
      if (!root) return;
      const { x, y } = toLocal(root, e, zoom);
      highlightDragRef.current.currentX = x;
      highlightDragRef.current.currentY = y;
      const left = Math.min(highlightDragRef.current.startX, x);
      const top = Math.min(highlightDragRef.current.startY, y);
      const w = Math.abs(x - highlightDragRef.current.startX);
      const h = Math.abs(y - highlightDragRef.current.startY);
      setHighlightRect({ x: left, y: top, w, h });
      return;
    }

    const pending = pendingRef.current;
    if (!pending) return;

    if (!pending.started) {
      const dxScreen = e.clientX - pending.startX;
      const dyScreen = e.clientY - pending.startY;
      if (Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
      pending.started = true;
      // Capture only after threshold so dblclick is not swallowed
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }

    // Use the visual `zoom` prop, not the store zoom, so drag matches the
    // rendered canvas even if the store value lags behind.
    const z = zoom || 1;
    const dxScreen = (e.clientX - pending.startX) / z;
    const dyScreen = (e.clientY - pending.startY) / z;
    const p0 = cssToPdfPt({ x: 0, y: 0 }, pageInfo, 1);
    const p1 = cssToPdfPt({ x: dxScreen, y: dyScreen }, pageInfo, 1);
    const dxPt = p1.x - p0.x;
    const dyPt = p1.y - p0.y;
    let next = { ...pending.startRect };

    const idsToDrag = Object.keys(pending.startRects || {});
    if (pending.mode === "move" && idsToDrag.length > 1) {
      const groupDragRects: Record<string, RectPt> = {};
      for (const id of idsToDrag) {
        const start = pending.startRects[id];
        let x = start.x + dxPt;
        let y = start.y + dyPt;
        if (gridSnap && !e.altKey) {
          x = snapPt(x, 4);
          y = snapPt(y, 4);
        }
        groupDragRects[id] = clampRect({ ...start, x, y }, pageInfo);
      }
      setLocalGroupDrag(groupDragRects);
      setLocalDrag({ id: pending.id, rect: groupDragRects[pending.id] });
      return;
    }

    if (pending.mode === "move") {
      let x = pending.startRect.x + dxPt;
      let y = pending.startRect.y + dyPt;
      if (gridSnap && !e.altKey) {
        x = snapPt(x, 4);
        y = snapPt(y, 4);
      }
      next = { ...pending.startRect, x, y };
    } else {
      const h = pending.handle ?? "se";
      if (h.includes("e")) next.w = Math.max(4, pending.startRect.w + dxPt);
      if (h.includes("w")) {
        next.w = Math.max(4, pending.startRect.w - dxPt);
        next.x = pending.startRect.x + dxPt;
      }
      if (h.includes("s")) next.h = Math.max(4, pending.startRect.h + dyPt);
      if (h.includes("n")) {
        next.h = Math.max(4, pending.startRect.h - dyPt);
        next.y = pending.startRect.y + dyPt;
      }
      if (gridSnap && !e.altKey) {
        next.w = snapPt(next.w, 4);
        next.h = snapPt(next.h, 4);
      }
    }

    next = clampRect(next, pageInfo);
    setLocalDrag({ id: pending.id, rect: next });
  };

  /** Pointer up: commit drag / finish highlight */
  const onPointerUp = (e: React.PointerEvent) => {
    // Highlight
    if (highlightDragRef.current?.active) {
      const drag = highlightDragRef.current;
      highlightDragRef.current = null;
      setHighlightRect(null);
      const root = rootRef.current;
      if (!root) return;
      const left = Math.min(drag.startX, drag.currentX);
      const top = Math.min(drag.startY, drag.currentY);
      const w = Math.abs(drag.currentX - drag.startX);
      const h = Math.abs(drag.currentY - drag.startY);
      if (w < 4 || h < 4) return;

      const cssRect = { left, top, width: w, height: h };
      const pdfRect = cssRectToPdf(cssRect, pageInfo, 1);

      // Find text runs intersecting the drag area
      const intersecting = objects.filter((o) => {
        if (o.kind !== "text-run" || o.deleted) return false;
        const c = pdfRectToCss(o.rect, pageInfo, 1);
        return (
          c.left < cssRect.left + cssRect.width &&
          c.left + c.width > cssRect.left &&
          c.top < cssRect.top + cssRect.height &&
          c.top + c.height > cssRect.top
        );
      });

      if (intersecting.length > 0) {
        commit("Highlight text", (d) => {
          for (const o of intersecting) {
            const id = `highlight-${crypto.randomUUID()}`;
            const hl: HighlightObject = {
              id,
              kind: "highlight",
              page: pageIndex,
              rect: { ...o.rect },
              rotation: 0,
              z: (d.pageObjectIds[pageIndex]?.length ?? 0) + 1,
              locked: false,
              opacity: 0.4,
              color: "#facc15",
            };
            d.objects[id] = hl;
            (d.pageObjectIds[pageIndex] ??= []).push(id);
          }
        });
      } else {
        const id = `highlight-${crypto.randomUUID()}`;
        const hl: HighlightObject = {
          id,
          kind: "highlight",
          page: pageIndex,
          rect: pdfRect,
          rotation: 0,
          z: objects.length,
          locked: false,
          opacity: 0.4,
          color: "#facc15",
        };
        addObject(hl);
      }
      return;
    }

    // Marquee commit
    if (marqueeDragRef.current?.active) {
      const drag = marqueeDragRef.current;
      marqueeDragRef.current = null;
      setMarqueeRect(null);
      const w = Math.abs(drag.currentX - drag.startX);
      const h = Math.abs(drag.currentY - drag.startY);
      if (w < 4 && h < 4 && !drag.additive) {
        selectObjects([]);
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
      return;
    }

    // Drag commit
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      if (pending.started) {
        const ids = Object.keys(pending.startRects || {});
        if (pending.mode === "move" && ids.length > 1 && localGroupDrag) {
          commit("Move objects", (d) => {
            for (const id of ids) {
              const r = localGroupDrag[id];
              const o = d.objects[id];
              if (!r || !o) continue;
              const patch: Record<string, unknown> = { rect: r };
              if (o.kind === "text-run" || o.kind === "image-placement") {
                patch.dirty = true;
                if (!o.origRect) {
                  patch.origRect = { ...o.rect };
                }
              }
              d.objects[id] = { ...o, ...patch } as PDFObject;
            }
          });
        } else if (localDrag && localDrag.id === pending.id) {
          updateObject(pending.id, { rect: localDrag.rect });
        }
      }
      setLocalDrag(null);
      setLocalGroupDrag(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // Reset editingId when tool changes or this page is no longer the current page
  useEffect(() => {
    const st = usePdfEditor.getState();
    if (st.editingId) st.setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, pageIndex === currentPage ? null : currentPage]);

  // Also clear on unmount
  useEffect(() => {
    return () => {
      const st = usePdfEditor.getState();
      if (st.editingId) st.setEditingId(null);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20"
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: "none" }}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />

      {/* ─── COVER LAYER ────────────────────────────────────────────────────
          Hides the original canvas pixels for edited / moved / deleted /
          being-edited text runs and images. Rendered before the objects so
          the new content appears on top. Matches drawCover() in export.ts
          exactly: uses origRect ?? rect, expanded by COVER_PAD on each side,
          filled with backgroundColor (text) or white (image).
          pointer-events: none — never intercepts clicks.
      ──────────────────────────────────────────────────────────────────── */}
      {objects.map((obj) => {
        if (obj.kind === "text-run") {
          const isDragging =
            localDrag?.id === obj.id || Boolean(localGroupDrag?.[obj.id]);
          const needsCover =
            obj.dirty || obj.deleted || editingId === obj.id || isDragging;
          if (!needsCover) return null;
          // Cover at the ORIGINAL position (before any drag)
          const coverRect = obj.origRect ?? obj.rect;
          const padded: RectPt = {
            x: coverRect.x - COVER_PAD,
            y: coverRect.y - COVER_PAD,
            w: coverRect.w + COVER_PAD * 2,
            h: coverRect.h + COVER_PAD * 2,
          };
          const css = pdfRectToCss(padded, pageInfo, 1);
          return (
            <div
              key={`cover-${obj.id}`}
              className="absolute pointer-events-none"
              style={{
                zIndex: 9,
                left: css.left,
                top: css.top,
                width: css.width,
                height: css.height,
                background: obj.backgroundColor || "#ffffff",
              }}
            />
          );
        }
        if (obj.kind === "image-placement") {
          const canRedraw = !!(obj.replacementDataUrl ?? obj.dataUrl);
          const needsCover = obj.deleted || (obj.dirty && canRedraw);
          if (!needsCover) return null;
          const coverRect = obj.origRect ?? obj.rect;
          const padded: RectPt = {
            x: coverRect.x - COVER_PAD,
            y: coverRect.y - COVER_PAD,
            w: coverRect.w + COVER_PAD * 2,
            h: coverRect.h + COVER_PAD * 2,
          };
          const css = pdfRectToCss(padded, pageInfo, 1);
          return (
            <div
              key={`cover-${obj.id}`}
              className="absolute pointer-events-none"
              style={{
                zIndex: 9,
                left: css.left,
                top: css.top,
                width: css.width,
                height: css.height,
                background: "#ffffff",
              }}
            />
          );
        }
        return null;
      })}

      {/* Marquee selection preview */}
      {marqueeRect && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
            border: "1px dashed #10b981",
            background: "rgba(16, 185, 129, 0.12)",
          }}
        />
      )}

      {/* Highlight drag preview */}
      {highlightRect && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: highlightRect.x,
            top: highlightRect.y,
            width: highlightRect.w,
            height: highlightRect.h,
            background: "rgba(250,204,21,0.35)",
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* All objects */}
      {objects.map((obj) => {
        if (obj.deleted) return null;
        const rect =
          localGroupDrag?.[obj.id] ??
          (localDrag && localDrag.id === obj.id ? localDrag.rect : obj.rect);
        const css = pdfRectToCss(rect, pageInfo, 1);
        return (
          <div
            key={obj.id}
            className="absolute z-10"
            style={{
              left: css.left,
              top: css.top,
              width: css.width,
              height: css.height,
              transform: obj.rotation
                ? `rotate(${obj.rotation}deg)`
                : undefined,
              transformOrigin: "center",
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => onObjectPointerDown(e, obj, "move")}
          >
            {obj.locked && (
              <div className="absolute -top-2 -right-2 z-30 pointer-events-none bg-amber-500 text-white rounded-full p-1 shadow-md">
                <Lock className="w-3 h-3" />
              </div>
            )}
            <ObjectContent
              obj={obj}
              pageInfo={pageInfo}
              editingId={editingId}
              setEditingId={setEditingId}
              updateObject={updateObject}
              isDragging={localDrag?.id === obj.id}
            />
          </div>
        );
      })}

      {/* Selection frame + handles: separate overlay, always follows current rect */}
      {selectedIds.length > 0 && (
        <>
          {/* eslint-disable-next-line react-hooks/refs -- event handlers are
              deferred; the compiler's tracing flags them, but refs are only
              touched on pointer events, never during render. */}
          {selectedIds.map((id) => {
            const obj = objects.find((o) => o.id === id);
            if (!obj) return null;
            const rect =
              localGroupDrag?.[id] ??
              (localDrag && localDrag.id === id ? localDrag.rect : obj.rect);
            const css = pdfRectToCss(rect, pageInfo, 1);
            const border = 2 / zoom; // constant 2px on screen
            const handleSize = 8 / zoom;
            return (
              <React.Fragment key={`sel-${id}`}>
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: css.left,
                    top: css.top,
                    width: css.width,
                    height: css.height,
                    border: `${border}px solid #10b981`,
                    boxSizing: "border-box",
                  }}
                />
                {!obj.locked &&
                  !obj.deleted &&
                  (
                    [
                      ["nw", "nwse-resize", -handleSize / 2, -handleSize / 2],
                      [
                        "n",
                        "ns-resize",
                        css.width / 2 - handleSize / 2,
                        -handleSize / 2,
                      ],
                      [
                        "ne",
                        "nesw-resize",
                        css.width - handleSize / 2,
                        -handleSize / 2,
                      ],
                      [
                        "e",
                        "ew-resize",
                        css.width - handleSize / 2,
                        css.height / 2 - handleSize / 2,
                      ],
                      [
                        "se",
                        "nwse-resize",
                        css.width - handleSize / 2,
                        css.height - handleSize / 2,
                      ],
                      [
                        "s",
                        "ns-resize",
                        css.width / 2 - handleSize / 2,
                        css.height - handleSize / 2,
                      ],
                      [
                        "sw",
                        "nesw-resize",
                        -handleSize / 2,
                        css.height - handleSize / 2,
                      ],
                      [
                        "w",
                        "ew-resize",
                        -handleSize / 2,
                        css.height / 2 - handleSize / 2,
                      ],
                    ] as const
                  ).map(([h, cursor, dx, dy]) => (
                    <div
                      key={h}
                      className="absolute z-30"
                      onPointerDown={(e) =>
                        onObjectPointerDown(e, obj, "resize", h)
                      }
                      style={{
                        left: css.left + dx,
                        top: css.top + dy,
                        width: handleSize,
                        height: handleSize,
                        background: "#10b981",
                        border: `${1 / zoom}px solid white`,
                        cursor,
                        pointerEvents: "auto",
                      }}
                    />
                  ))}
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* debug boxes */}
      {debug &&
        objects.map((obj) => {
          if (obj.deleted) return null;
          const css = pdfRectToCss(obj.rect, pageInfo, 1);
          return (
            <div
              key={`debug-${obj.id}`}
              className="absolute border border-red-500/50 pointer-events-none z-40"
              style={{
                left: css.left,
                top: css.top,
                width: css.width,
                height: css.height,
              }}
            >
              <span className="text-[8px] text-red-500 bg-white/80 px-0.5">
                {obj.kind}
              </span>
            </div>
          );
        })}
    </div>
  );
}

/* ───────────── Object content renderer ───────────── */

interface ObjectContentProps {
  obj: PDFObject;
  pageInfo: PageInfo;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateObject: (id: string, patch: Partial<PDFObject>) => void;
  isDragging?: boolean;
}

type TextLike = TextRunObject | NewTextObject;

function isTextLikeObject(obj: PDFObject): obj is TextLike {
  return obj.kind === "text-run" || obj.kind === "new-text";
}

function textRunStyle(
  run: StyledTextRun,
  obj: TextLike,
): React.CSSProperties {
  return {
    fontFamily: run.fontFamily ?? obj.fontFamily,
    fontSize: run.fontSize ?? obj.fontSize,
    fontWeight: (run.bold ?? obj.bold) ? 700 : 400,
    fontStyle: (run.italic ?? obj.italic) ? "italic" : "normal",
    color: run.color ?? obj.color,
    letterSpacing: run.letterSpacing ?? obj.letterSpacing,
    textDecoration: [
      (run.underline ?? obj.underline) ? "underline" : "",
      (run.strike ?? obj.strike) ? "line-through" : "",
    ]
      .filter(Boolean)
      .join(" ") || "none",
  };
}

function writeRunsToEditor(
  editor: HTMLDivElement,
  runs: StyledTextRun[],
  obj: TextLike,
): void {
  const fragment = editor.ownerDocument.createDocumentFragment();

  for (const run of runs) {
    const span = editor.ownerDocument.createElement("span");
    span.textContent = run.text;
    const style = textRunStyle(run, obj);
    Object.assign(span.style, style);
    span.style.fontSize = `${run.fontSize ?? obj.fontSize}px`;
    span.style.letterSpacing = `${run.letterSpacing ?? obj.letterSpacing}px`;
    fragment.appendChild(span);
  }
  editor.replaceChildren(fragment);
}

function editorTextOffset(
  root: HTMLDivElement,
  target: Node,
  targetOffset: number,
): number {
  let count = 0;
  let result = 0;
  let found = false;

  const visit = (node: Node): void => {
    if (found) return;
    if (node === target) {
      if (node.nodeType === 3) {
        count += Math.max(
          0,
          Math.min(targetOffset, node.textContent?.length ?? 0),
        );
      } else {
        for (
          let i = 0;
          i < Math.min(targetOffset, node.childNodes.length);
          i++
        ) {
          visit(node.childNodes[i]);
        }
      }
      result = count;
      found = true;
      return;
    }

    if (node.nodeType === 3) {
      count += node.textContent?.length ?? 0;
      return;
    }
    if (node.nodeName === "BR") {
      count++;
      return;
    }
    for (const child of node.childNodes) visit(child);
  };

  visit(root);
  return result;
}

function readEditorSelection(
  editor: HTMLDivElement,
): { start: number; end: number } | null {
  const selection = editor.ownerDocument.getSelection();
  if (
    !selection?.rangeCount ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !editor.contains(selection.anchorNode) ||
    !editor.contains(selection.focusNode)
  ) {
    return null;
  }

  const anchor = editorTextOffset(
    editor,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focus = editorTextOffset(
    editor,
    selection.focusNode,
    selection.focusOffset,
  );
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

function setEditorSelection(
  editor: HTMLDivElement,
  start: number,
  end: number,
): void {
  const doc = editor.ownerDocument;
  const walker = doc.createTreeWalker(editor, 4);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  if (nodes.length === 0) {
    const node = doc.createTextNode("");
    editor.appendChild(node);
    nodes.push(node);
  }

  const locate = (offset: number): { node: Text; offset: number } => {
    let remaining = Math.max(0, offset);
    for (const node of nodes) {
      if (remaining <= node.length) return { node, offset: remaining };
      remaining -= node.length;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.length };
  };

  const from = locate(start);
  const to = locate(end);
  const range = doc.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertPlainTextAtSelection(editor: HTMLDivElement, text: string): void {
  const doc = editor.ownerDocument;
  const selection = doc.getSelection();
  const range =
    selection?.rangeCount && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0)
      : doc.createRange();

  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function ObjectContent({
  obj,
  pageInfo,
  editingId,
  setEditingId,
  updateObject,
  isDragging = false,
}: ObjectContentProps) {
  const isEditing = editingId === obj.id;
  const textObj = isTextLikeObject(obj) ? obj : null;
  const runs = useMemo(
    () => (textObj ? materializeRuns(textObj) : []),
    [textObj],
  );
  const textVal = runs.map((run) => run.text).join("");
  const runSignature = JSON.stringify(runs);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const renderedSignatureRef = useRef("");
  const wasEditingRef = useRef(false);
  const textDivRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!isEditing || !textObj || !editor) {
      if (!isEditing) renderedSignatureRef.current = "";
      wasEditingRef.current = false;
      return;
    }

    const changed = renderedSignatureRef.current !== runSignature;
    if (changed) {
      const currentSelection = usePdfEditor.getState().textSelection;
      const shouldRestore =
        wasEditingRef.current && currentSelection?.objectId === obj.id;
      writeRunsToEditor(editor, runs, textObj);
      renderedSignatureRef.current = runSignature;
      editor.focus();
      if (shouldRestore) {
        setEditorSelection(
          editor,
          currentSelection.start,
          currentSelection.end,
        );
      } else {
        setEditorSelection(editor, 0, textVal.length);
      }
    }
    wasEditingRef.current = true;
  }, [isEditing, obj.id, runSignature, runs, textObj, textVal]);

  useEffect(() => {
    if (!isEditing || !textObj) return;
    const editor = editorRef.current;
    if (!editor) return;

    const updateSelection = () => {
      const selection = readEditorSelection(editor);
      if (!selection) return;
      usePdfEditor.getState().setTextSelection({
        objectId: obj.id,
        ...selection,
      });
    };

    editor.ownerDocument.addEventListener("selectionchange", updateSelection);
    return () =>
      editor.ownerDocument.removeEventListener(
        "selectionchange",
        updateSelection,
      );
  }, [isEditing, obj.id, textObj]);

  const resizeTextBox = useCallback(
    (editor: HTMLDivElement) => {
      const width = editor.scrollWidth;
      const height = editor.scrollHeight;
      requestAnimationFrame(() => {
        const state = usePdfEditor.getState();
        const current = state.objects[obj.id];
        if (!current || !isTextLikeObject(current)) return;

        const nextWidth = Math.max(current.rect.w, width);
        const top = pageInfo.heightPt - current.rect.y - current.rect.h;
        const maxHeight = Math.max(0, pageInfo.heightPt - top);
        const nextHeight = Math.min(
          Math.max(current.rect.h, height),
          maxHeight,
        );
        if (
          nextWidth > current.rect.w + 0.5 ||
          nextHeight > current.rect.h + 0.5
        ) {
          const maxWidth = Math.max(
            current.rect.w,
            pageInfo.widthPt - current.rect.x,
          );
          state.updateObjectTransient(obj.id, {
            rect: {
              ...current.rect,
              y: current.rect.y + current.rect.h - nextHeight,
              w: Math.min(nextWidth, maxWidth),
              h: nextHeight,
            },
          });
        }
      });
    },
    [obj.id, pageInfo.heightPt, pageInfo.widthPt],
  );

  // Measure the same intrinsically-sized text surface used while editing.
  useLayoutEffect(() => {
    if (
      !textObj ||
      isEditing ||
      isDragging ||
      (textObj.kind === "text-run" && !textObj.dirty)
    ) {
      return;
    }

    const el = textDivRef.current;
    if (!el) return;
    resizeTextBox(el);
  }, [
    textVal,
    obj.id,
    textObj?.kind,
    runSignature,
    obj.rect.h,
    obj.rect.w,
    isEditing,
    isDragging,
    pageInfo.widthPt,
    pageInfo.heightPt,
    resizeTextBox,
    textObj,
  ]);

  if (textObj) {
    const isRun = textObj.kind === "text-run";
    if (isEditing) {
      const bg = isRun
        ? textObj.backgroundColor || "#ffffff"
        : "#ffffff";
      const updateFromEditor = (editor: HTMLDivElement) => {
        const current = usePdfEditor.getState().objects[obj.id];
        if (!current || !isTextLikeObject(current)) return;
        const next = replaceText(current, editor.textContent ?? "");
        const nextRuns = next.runs ?? materializeRuns(next);
        renderedSignatureRef.current = JSON.stringify(nextRuns);
        usePdfEditor.getState().updateObjectTransient(obj.id, {
          text: next.text,
          runs: nextRuns,
        });
        const selection = readEditorSelection(editor);
        if (selection) {
          usePdfEditor.getState().setTextSelection({
            objectId: obj.id,
            ...selection,
          });
        }
        resizeTextBox(editor);
      };

      const finishEditing = () => {
        const state = usePdfEditor.getState();
        const current = state.objects[obj.id];
        const snapshot =
          state.history.entries[state.history.index]?.objects[obj.id];
        if (!current || !isTextLikeObject(current)) {
          setEditingId(null);
          return;
        }

        if (current.kind === "new-text" && current.text.trim() === "") {
          state.commit("Remove empty text", (draft) => {
            delete draft.objects[obj.id];
            draft.pageObjectIds = draft.pageObjectIds.map((ids) =>
              ids.filter((id) => id !== obj.id),
            );
          });
        } else {
          const currentSignature = JSON.stringify({
            text: current.text,
            runs: current.runs ?? null,
            rect: current.rect,
          });
          const savedSignature =
            snapshot && isTextLikeObject(snapshot)
              ? JSON.stringify({
                  text: snapshot.text,
                  runs: snapshot.runs ?? null,
                  rect: snapshot.rect,
                })
              : "";
          if (currentSignature !== savedSignature) {
            updateObject(obj.id, {
              text: current.text,
              runs: current.runs,
              rect: current.rect,
            } as Partial<PDFObject>);
          }
        }
        setEditingId(null);
      };

      const cancelEditing = () => {
        const state = usePdfEditor.getState();
        const snapshot =
          state.history.entries[state.history.index]?.objects[obj.id];
        if (snapshot && isTextLikeObject(snapshot)) {
          state.updateObjectTransient(obj.id, {
            text: snapshot.text,
            runs: snapshot.runs,
            rect: snapshot.rect,
          } as Partial<PDFObject>);
        }
        setEditingId(null);
      };

      return (
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-label="Edit text"
          aria-multiline="true"
          suppressContentEditableWarning
          spellCheck={false}
          onInput={(e) => updateFromEditor(e.currentTarget)}
          onBlur={finishEditing}
          onPaste={(e) => {
            e.preventDefault();
            insertPlainTextAtSelection(
              e.currentTarget,
              e.clipboardData.getData("text/plain"),
            );
          }}
          onBeforeInput={(e) => {
            const inputType = (e.nativeEvent as InputEvent).inputType;
            if (
              inputType === "insertParagraph" ||
              inputType === "insertLineBreak"
            ) {
              e.preventDefault();
              insertPlainTextAtSelection(e.currentTarget, "\n");
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              insertPlainTextAtSelection(e.currentTarget, "\n");
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEditing();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => {
            const selection = readEditorSelection(e.currentTarget);
            if (selection) {
              usePdfEditor.getState().setTextSelection({
                objectId: obj.id,
                ...selection,
              });
            }
          }}
          onKeyUp={(e) => {
            const selection = readEditorSelection(e.currentTarget);
            if (selection) {
              usePdfEditor.getState().setTextSelection({
                objectId: obj.id,
                ...selection,
              });
            }
          }}
          style={{
            width: "max-content",
            minWidth: "100%",
            maxWidth: Math.max(1, pageInfo.widthPt - textObj.rect.x),
            minHeight: "100%",
            fontFamily: textObj.fontFamily,
            fontSize: textObj.fontSize,
            fontWeight: textObj.bold ? 700 : 400,
            fontStyle: textObj.italic ? "italic" : "normal",
            color: textObj.color,
            background: bg,
            border: "none",
            outline: "none",
            boxSizing: "border-box",
            padding: 0,
            margin: 0,
            caretColor: textObj.color || "#000000",
            lineHeight: textObj.lineHeight,
            textAlign: textObj.align,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            wordBreak: "break-word",
            textDecoration:
              [
                textObj.underline ? "underline" : "",
                textObj.strike ? "line-through" : "",
              ]
                .filter(Boolean)
                .join(" ") || "none",
            letterSpacing: textObj.letterSpacing,
          }}
        />
      );
    }

    const showText =
      textObj.kind === "new-text" || textObj.dirty || isDragging;
    return (
      <div
        ref={textDivRef}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingId(obj.id);
        }}
        style={{
          width: "max-content",
          minWidth: "100%",
          maxWidth: Math.max(1, pageInfo.widthPt - textObj.rect.x),
          minHeight: "100%",
          display: "block",
          fontFamily: textObj.fontFamily,
          fontSize: textObj.fontSize,
          fontWeight: textObj.bold ? 700 : 400,
          fontStyle: textObj.italic ? "italic" : "normal",
          color: showText ? textObj.color : "transparent",
          background: "transparent",
          cursor: "text",
          userSelect: "none",
          pointerEvents: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          textAlign: textObj.align,
          lineHeight: textObj.lineHeight,
          letterSpacing: textObj.letterSpacing,
          opacity: textObj.opacity,
          textDecoration:
            [
              textObj.underline ? "underline" : "",
              textObj.strike ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" ") || "none",
        }}
      >
        {showText
          ? runs.map((run, index) => (
              <span key={index} style={textRunStyle(run, textObj)}>
                {run.text}
              </span>
            ))
          : null}
      </div>
    );
  }

  if (obj.kind === "image-placement") {
    const src = obj.replacementDataUrl ?? obj.dataUrl;
    if (!src) return null;
    const crop = obj.crop || { l: 0, t: 0, r: 0, b: 0 };
    const cw = 1 - crop.l - crop.r;
    const ch = 1 - crop.t - crop.b;
    return (
      <div className="w-full h-full overflow-hidden relative">
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            width: `${100 / cw}%`,
            height: `${100 / ch}%`,
            left: `${-(crop.l * 100) / cw}%`,
            top: `${-(crop.t * 100) / ch}%`,
            objectFit: "fill",
            opacity: obj.opacity,
            maxWidth: "none",
          }}
        />
      </div>
    );
  }

  if (obj.kind === "new-image" || obj.kind === "signature") {
    return (
      <img
        src={(obj as { dataUrl: string }).dataUrl}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          opacity: obj.opacity,
        }}
      />
    );
  }

  if (obj.kind === "shape") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {obj.shape === "ellipse" ? (
          <ellipse
            cx={50}
            cy={50}
            rx={49}
            ry={49}
            fill={obj.fill ?? "transparent"}
            stroke={obj.stroke}
            strokeWidth={Math.max(0.5, obj.strokeWidth)}
            opacity={obj.opacity}
          />
        ) : obj.shape === "line" ? (
          <line
            x1={0}
            y1={100}
            x2={100}
            y2={0}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            opacity={obj.opacity}
          />
        ) : (
          <rect
            x={0.5}
            y={0.5}
            width={99}
            height={99}
            fill={obj.fill ?? "transparent"}
            stroke={obj.stroke}
            strokeWidth={Math.max(0.5, obj.strokeWidth)}
            opacity={obj.opacity}
          />
        )}
      </svg>
    );
  }

  if (
    obj.kind === "highlight" ||
    obj.kind === "whiteout" ||
    obj.kind === "redact"
  ) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: obj.color,
          opacity: obj.kind === "highlight" ? obj.opacity * 0.55 : obj.opacity,
          mixBlendMode: obj.kind === "highlight" ? "multiply" : undefined,
        }}
      />
    );
  }

  if (obj.kind === "underline" || obj.kind === "strike") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderBottom:
            obj.kind === "underline"
              ? `${obj.strokeWidth}px solid ${obj.color}`
              : undefined,
          borderTop:
            obj.kind === "strike"
              ? `${obj.strokeWidth}px solid ${obj.color}`
              : undefined,
          opacity: obj.opacity,
        }}
      />
    );
  }

  if (obj.kind === "note") {
    return (
      <div
        className="w-full h-full rounded p-1 text-[10px] leading-tight overflow-hidden"
        style={{ background: obj.color, color: "#111" }}
      >
        {obj.body}
      </div>
    );
  }

  if (obj.kind === "link") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          border: `1px solid ${obj.color}`,
          background: `${obj.color}18`,
          display: "grid",
          placeItems: "center",
          fontSize: 10,
          color: obj.color,
        }}
      >
        🔗 {obj.href}
      </div>
    );
  }

  if (obj.kind === "stamp") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          border: `2px solid ${obj.color}`,
          color: obj.color,
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {obj.label}
      </div>
    );
  }

  if (obj.kind === "checkmark") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline
          points="20,50 45,75 85,20"
          fill="none"
          stroke={obj.color}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={obj.opacity}
        />
      </svg>
    );
  }

  if (obj.kind === "draw") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {obj.strokes.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.points
              .map(([x, y]) => `${x * 100},${100 - y * 100}`)
              .join(" ")}
            fill="none"
            stroke={obj.stroke}
            strokeWidth={Math.max(0.5, obj.strokeWidth)}
            opacity={obj.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    );
  }

  return null;
}

/** Pointer position in page points: removes the visual CSS zoom scale. */
function toLocal(
  root: HTMLElement,
  e: { clientX: number; clientY: number },
  zoom: number,
) {
  const r = root.getBoundingClientRect();
  const z = zoom || 1;
  return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
}

function clampRect(rect: RectPt, page: PageInfo): RectPt {
  const w = Math.min(Math.max(4, rect.w), page.widthPt);
  const h = Math.min(Math.max(4, rect.h), page.heightPt);
  const x = Math.max(0, Math.min(rect.x, page.widthPt - w));
  const y = Math.max(0, Math.min(rect.y, page.heightPt - h));
  return { x, y, w, h };
}
