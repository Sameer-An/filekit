// src/components/pdf-editor/ObjectLayer.tsx
"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import { usePdfEditor, usePageObjects } from "@/lib/pdf-editor/store";
import type {
  PageInfo,
  PDFObject,
  RectPt,
  TextRunObject,
} from "@/lib/pdf-editor/types";
import { pdfRectToCss, cssRectToPdf, snapPt } from "@/lib/pdf-editor/coords";

interface ObjectLayerProps {
  pageIndex: number;
  pageInfo: PageInfo;
  zoom: number;
  debug?: boolean;
}

export function ObjectLayer({
  pageIndex,
  pageInfo,
  zoom,
  debug = false,
}: ObjectLayerProps) {
  const objects = usePageObjects(pageIndex);
  const selectedIds = usePdfEditor((s) => s.selectedIds);
  const activeTool = usePdfEditor((s) => s.activeTool);
  const gridSnap = usePdfEditor((s) => s.grid.snap);
  const selectObjects = usePdfEditor((s) => s.selectObjects);
  const toggleObjectSelection = usePdfEditor((s) => s.toggleObjectSelection);
  const updateObject = usePdfEditor((s) => s.updateObject);
  const commit = usePdfEditor((s) => s.commit);
  const addObject = usePdfEditor((s) => s.addObject);
  const selectTool = usePdfEditor((s) => s.selectTool);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startRect: RectPt;
    handle?: string;
  } | null>(null);

  const [localDrag, setLocalDrag] = useState<{
    id: string;
    rect: RectPt;
  } | null>(null);

  const selectedSet = new Set(selectedIds);

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

  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return;

      if (activeTool !== "select") {
        if (activeTool === "image") return;

        const root = rootRef.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    [activeTool, pageInfo, selectObjects],
  );

  const createNewObjectAt = (rectPt: RectPt) => {
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
          text: "Double-click to edit",
          fontFamily: "Helvetica",
          fontSize: 14,
          bold: false,
          italic: false,
          underline: false,
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
  };

  const beginDrag = (
    e: React.PointerEvent,
    obj: PDFObject,
    mode: "move" | "resize",
    handle?: string,
  ) => {
    if (obj.locked) return;
    e.stopPropagation();
    // FIX: Removed e.preventDefault() so double-click events fire properly

    if (!selectedSet.has(obj.id)) {
      if (e.shiftKey) toggleObjectSelection(obj.id);
      else selectObjects([obj.id]);
    }
    const root = rootRef.current;
    if (!root) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: obj.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...obj.rect },
      handle,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const storeZoom = usePdfEditor.getState().zoom;
    const dxPt = (e.clientX - drag.startX) / storeZoom;
    const dyPt = -(e.clientY - drag.startY) / storeZoom;

    let next = { ...drag.startRect };
    if (drag.mode === "move") {
      let x = drag.startRect.x + dxPt;
      let y = drag.startRect.y + dyPt;
      if (gridSnap) {
        x = snapPt(x, 4);
        y = snapPt(y, 4);
      }
      next = { ...drag.startRect, x, y };
    } else if (drag.mode === "resize") {
      const h = drag.handle ?? "se";
      if (h.includes("e")) next.w = Math.max(4, drag.startRect.w + dxPt);
      if (h.includes("w")) {
        next.w = Math.max(4, drag.startRect.w - dxPt);
        next.x = drag.startRect.x + dxPt;
      }
      if (h.includes("s")) next.h = Math.max(4, drag.startRect.h + dyPt);
      if (h.includes("n")) {
        next.h = Math.max(4, drag.startRect.h - dyPt);
        next.y = drag.startRect.y + dyPt;
      }
      if (gridSnap) {
        next.w = snapPt(next.w, 4);
        next.h = snapPt(next.h, 4);
      }
    }
    next = clampRect(next, pageInfo);
    setLocalDrag({ id: drag.id, rect: next });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (localDrag && localDrag.id === drag.id) {
        updateObject(drag.id, { rect: localDrag.rect });
        setLocalDrag(null);
      }
    }
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

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

      {objects.map((obj) => {
        const rect =
          localDrag && localDrag.id === obj.id ? localDrag.rect : obj.rect;
        const css = pdfRectToCss(rect, pageInfo, 1);
        const selected = selectedSet.has(obj.id);
        return (
          <div
            key={obj.id}
            className="absolute"
            style={{
              left: css.left,
              top: css.top,
              width: css.width,
              height: css.height,
              transform: obj.rotation
                ? `rotate(${obj.rotation}deg)`
                : undefined,
              transformOrigin: "center",
              outline: selected ? "2px solid #10b981" : undefined,
              outlineOffset: selected ? 1 : undefined,
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => beginDrag(e, obj, "move")}
          >
            <ObjectContent obj={obj} />
            {selected && (
              <>
                {(
                  [
                    ["nw", "nwse-resize"],
                    ["n", "ns-resize"],
                    ["ne", "nesw-resize"],
                    ["e", "ew-resize"],
                    ["se", "nwse-resize"],
                    ["s", "ns-resize"],
                    ["sw", "nesw-resize"],
                    ["w", "ew-resize"],
                  ] as const
                ).map(([handle, cursor]) => (
                  <div
                    key={handle}
                    onPointerDown={(e) => beginDrag(e, obj, "resize", handle)}
                    style={{
                      position: "absolute",
                      width: 8,
                      height: 8,
                      background: "#10b981",
                      border: "1px solid white",
                      cursor,
                      ...handlePos(handle),
                    }}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}

      {debug &&
        objects.map((obj) => {
          const css = pdfRectToCss(obj.rect, pageInfo, 1);
          return (
            <div
              key={`debug-${obj.id}`}
              className="absolute border border-red-500/50 pointer-events-none"
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

function handlePos(handle: string): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 8,
    height: 8,
    background: "#10b981",
    border: "1px solid white",
    zIndex: 2,
  };
  switch (handle) {
    case "nw":
      return { ...base, left: -4, top: -4, cursor: "nwse-resize" };
    case "n":
      return {
        ...base,
        left: "50%",
        top: -4,
        transform: "translateX(-50%)",
        cursor: "ns-resize",
      };
    case "ne":
      return { ...base, right: -4, top: -4, cursor: "nesw-resize" };
    case "e":
      return {
        ...base,
        right: -4,
        top: "50%",
        transform: "translateY(-50%)",
        cursor: "ew-resize",
      };
    case "se":
      return { ...base, right: -4, bottom: -4, cursor: "nwse-resize" };
    case "s":
      return {
        ...base,
        left: "50%",
        bottom: -4,
        transform: "translateX(-50%)",
        cursor: "ns-resize",
      };
    case "sw":
      return { ...base, left: -4, bottom: -4, cursor: "nesw-resize" };
    case "w":
      return {
        ...base,
        left: -4,
        top: "50%",
        transform: "translateY(-50%)",
        cursor: "ew-resize",
      };
    default:
      return base;
  }
}

function ObjectContent({ obj }: { obj: PDFObject }) {
  const updateObject = usePdfEditor((s) => s.updateObject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  if (obj.kind === "text-run") {
    const run = obj as TextRunObject;
    return editing ? (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== run.text)
            updateObject(run.id, {
              text: draft,
              dirty: true,
            } as Partial<TextRunObject>);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          fontFamily: run.fontFamily,
          fontSize: run.fontSize,
          color: run.color,
          background: "rgba(16,185,129,0.12)",
          border: "1px solid #10b981",
          outline: "none",
          resize: "none",
          padding: 0,
          lineHeight: run.lineHeight,
        }}
      />
    ) : (
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(run.text);
          setEditing(true);
        }}
        style={{
          width: "100%",
          height: "100%",
          color: "transparent",
          background: "transparent",
          cursor: "text",
          userSelect: "none",
          pointerEvents: "auto",
        }}
      />
    );
  }

  if (obj.kind === "image-placement") {
    return obj.replacementDataUrl || obj.dataUrl ? (
      <img
        src={obj.replacementDataUrl ?? obj.dataUrl ?? ""}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          opacity: obj.opacity,
        }}
      />
    ) : (
      <div className="w-full h-full border border-dashed border-zinc-400/60 bg-zinc-100/40" />
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
