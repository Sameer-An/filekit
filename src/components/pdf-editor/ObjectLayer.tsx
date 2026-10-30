// src/components/pdf-editor/ObjectLayer.tsx
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePdfEditor, usePageObjects } from "@/lib/pdf-editor/store";
import type {
  PageInfo,
  PDFObject,
  RectPt,
  TextRunObject,
  NewTextObject,
  HighlightObject,
} from "@/lib/pdf-editor/types";
import { pdfRectToCss, cssRectToPdf, snapPt, cssToPdfPt } from "@/lib/pdf-editor/coords";

interface ObjectLayerProps {
  pageIndex: number;
  pageInfo: PageInfo;
  zoom: number;
  debug?: boolean;
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

  /** Drag candidate (not yet over threshold) */
  const pendingRef = useRef<{
    id: string;
    mode: "move" | "resize";
    handle?: string;
    startX: number;
    startY: number;
    startRect: RectPt;
    started: boolean;
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
          obj = { ...base, kind: "strike", color: "#111111", strokeWidth: 1.5 };
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
        const r = root.getBoundingClientRect();
        highlightDragRef.current = {
          startX: e.clientX - r.left,
          startY: e.clientY - r.top,
          currentX: e.clientX - r.left,
          currentY: e.clientY - r.top,
          active: true,
        };
        setHighlightRect({
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          w: 0,
          h: 0,
        });
        root.setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool !== "select") {
        if (activeTool === "image") return;
        const root = rootRef.current;
        if (!root) return;
        const r = root.getBoundingClientRect();
        const px = { x: e.clientX - r.left, y: e.clientY - r.top };
        const pt = cssRectToPdf(
          { left: px.x, top: px.y, width: 200, height: 40 },
          pageInfo,
          1,
        );
        createNewObjectAt(pt);
        return;
      }

      selectObjects([]);
    },
    [activeTool, pageInfo, selectObjects, createNewObjectAt],
  );

  /** Object pointer down: register drag candidate (no capture yet) */
  const onObjectPointerDown = (
    e: React.PointerEvent,
    obj: PDFObject,
    mode: "move" | "resize",
    handle?: string,
  ) => {
    if (obj.locked || obj.deleted) return;
    e.stopPropagation();

    if (!selectedSet.has(obj.id)) {
      if (e.shiftKey) toggleObjectSelection(obj.id);
      else selectObjects([obj.id]);
    }

    pendingRef.current = {
      id: obj.id,
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...obj.rect },
      started: false,
    };
  };

  /** Global pointer move: start drag only after threshold */
  const onPointerMove = (e: React.PointerEvent) => {
    // Highlight drag
    if (highlightDragRef.current?.active) {
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
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

    const storeZoom = usePdfEditor.getState().zoom;
    const dxScreen = (e.clientX - pending.startX) / storeZoom;
    const dyScreen = (e.clientY - pending.startY) / storeZoom;
    const p0 = cssToPdfPt({ x: 0, y: 0 }, pageInfo, 1);
    const p1 = cssToPdfPt({ x: dxScreen, y: dyScreen }, pageInfo, 1);
    const dxPt = p1.x - p0.x;
    const dyPt = p1.y - p0.y;
    let next = { ...pending.startRect };

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

    // Drag commit
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      if (pending.started && localDrag && localDrag.id === pending.id) {
        updateObject(pending.id, { rect: localDrag.rect });
      }
      setLocalDrag(null);
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
          const isDragging = localDrag?.id === obj.id;
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
          localDrag && localDrag.id === obj.id ? localDrag.rect : obj.rect;
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
          {selectedIds.map((id) => {
            const obj = objects.find((o) => o.id === id);
            if (!obj) return null;
            const rect =
              localDrag && localDrag.id === id ? localDrag.rect : obj.rect;
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
                {(
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

function ObjectContent({
  obj,
  editingId,
  setEditingId,
  updateObject,
  isDragging = false,
}: ObjectContentProps) {
  const isEditing = editingId === obj.id;
  const isText = obj.kind === "text-run" || obj.kind === "new-text";
  const textVal = isText ? (obj as TextRunObject | NewTextObject).text : "";
  const [draft, setDraft] = useState(textVal);
  const [prevEditing, setPrevEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync draft during render when editing starts (official React 19 pattern)
  if (isEditing && !prevEditing) {
    setPrevEditing(true);
    setDraft(textVal);
  } else if (!isEditing && prevEditing) {
    setPrevEditing(false);
  }

  // Focus and select all text when editor opens
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.select();
    }
  }, [isEditing]);

  if (obj.kind === "text-run" || obj.kind === "new-text") {
    const isRun = obj.kind === "text-run";
    const textObj = obj as TextRunObject | NewTextObject;
    if (isEditing) {
      // Opaque background matching the original page colour (no ghost)
      const bg =
        isRun
          ? ((obj as TextRunObject).backgroundColor || "#ffffff")
          : "#ffffff";

      return (
        <textarea
          ref={textareaRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditingId(null);
            if (draft !== textObj.text) {
              if (draft.trim() === "" && obj.kind === "new-text") {
                usePdfEditor.getState().commit("Remove empty text", (d) => {
                  delete d.objects[obj.id];
                  d.pageObjectIds = d.pageObjectIds.map((ids) =>
                    ids.filter((id) => id !== obj.id),
                  );
                });
              } else {
                updateObject(obj.id, { text: draft } as Partial<PDFObject>);
              }
            }
            // If text unchanged: no dirty, no commit — cover will disappear naturally
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Ctrl+Enter or Cmd+Enter = commit (blur)
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
            // Plain Enter = newline (default textarea behaviour; do nothing)
            if (e.key === "Escape") {
              e.preventDefault();
              // Cancel: restore original text, do not mark dirty
              setDraft(textObj.text);
              setEditingId(null);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            fontFamily: textObj.fontFamily,
            fontSize: textObj.fontSize,
            fontWeight: textObj.bold ? 700 : 400,
            fontStyle: textObj.italic ? "italic" : "normal",
            color: textObj.color,
            // Fully opaque background — no ghost from canvas below
            background: bg,
            border: "none",
            outline: "1.5px solid #10b981",
            outlineOffset: "0px",
            boxSizing: "border-box",
            resize: "none",
            padding: 0,
            margin: 0,
            caretColor: textObj.color || "#000000",
            lineHeight: textObj.lineHeight,
            textAlign: textObj.align,
            textDecoration:
              [
                textObj.underline ? "underline" : "",
                textObj.strike ? "line-through" : "",
              ]
                .filter(Boolean)
                .join(" ") || "none",
          }}
        />
      );
    }

    // On double-click: open editor, pre-fill with current text
    const showText = isRun ? ((obj as TextRunObject).dirty || isDragging) : true;
    return (
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(textObj.text);
          setEditingId(obj.id);
        }}
        style={{
          width: "100%",
          height: "100%",
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
        {showText ? textObj.text : ""}
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

function clampRect(rect: RectPt, page: PageInfo): RectPt {
  const w = Math.min(Math.max(4, rect.w), page.widthPt);
  const h = Math.min(Math.max(4, rect.h), page.heightPt);
  const x = Math.max(0, Math.min(rect.x, page.widthPt - w));
  const y = Math.max(0, Math.min(rect.y, page.heightPt - h));
  return { x, y, w, h };
}
