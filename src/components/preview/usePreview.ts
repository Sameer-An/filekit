// src/components/preview/usePreview.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UsePreviewReturn {
  objectUrl: string | null;
  zoom: number;
  fitMode: "fit" | "100%";
  pan: { x: number; y: number };
  isDragging: boolean;
  showOriginal: boolean;
  setShowOriginal: (show: boolean) => void;
  setFitMode: (mode: "fit" | "100%") => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
}

export function usePreview(file: File | null): UsePreviewReturn {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [fitMode, setFitMode] = useState<"fit" | "100%">("fit");
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);

  // Sync / reset during render when file changes (React 19 pattern)
  const [prevFile, setPrevFile] = useState<File | null>(file);
  if (file !== prevFile) {
    setPrevFile(file);
    setZoom(1);
    setFitMode("fit");
    setPan({ x: 0, y: 0 });
    setShowOriginal(false);
    if (!file) {
      setObjectUrl(null);
    }
  }

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Object URL lifecycle: create on file change, always revoke on change & unmount
  useEffect(() => {
    if (!file) return;

    const url = URL.createObjectURL(file);
    let active = true;

    queueMicrotask(() => {
      if (active) setObjectUrl(url);
    });

    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const zoomIn = useCallback(() => {
    setFitMode("100%");
    setZoom((prev) => Math.min(4, +(prev + 0.25).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setFitMode("100%");
    setZoom((prev) => Math.max(0.25, +(prev - 0.25).toFixed(2)));
  }, []);

  const resetZoom = useCallback(() => {
    setFitMode("fit");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left click only
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      });
    },
    [isDragging],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = null;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored
    }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setFitMode("100%");
      setZoom((prev) => Math.min(4, Math.max(0.25, +(prev + delta).toFixed(2))));
    }
  }, []);

  return {
    objectUrl,
    zoom,
    fitMode,
    pan,
    isDragging,
    showOriginal,
    setShowOriginal,
    setFitMode,
    zoomIn,
    zoomOut,
    resetZoom,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  };
}
