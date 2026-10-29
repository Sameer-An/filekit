    // src/components/pdf-editor/SignatureDialog.tsx
    // Draw, type, or upload a signature, then place it on the current page.

    "use client";

    import React, { useCallback, useEffect, useRef, useState } from "react";
    import { X, Eraser, Type, Upload, Check } from "lucide-react";
    import { usePdfEditor } from "@/lib/pdf-editor/store";
    import type { SignatureObject } from "@/lib/pdf-editor/types";

    type Mode = "draw" | "type" | "upload";

    interface SignatureDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    }

    export function SignatureDialog({ open, onOpenChange }: SignatureDialogProps) {
    const [mode, setMode] = useState<Mode>("draw");
    const [typed, setTyped] = useState("");
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);

    const currentPage = usePdfEditor((s) => s.currentPage);
    const addObject = usePdfEditor((s) => s.addObject);

    const clearCanvas = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, c.width, c.height);
        setDataUrl(null);
    }, []);

    // FIX: Deferred the state updates using setTimeout to satisfy React 19 ESLint rules
    useEffect(() => {
        if (!open) return;

        const timer = setTimeout(() => {
        setDataUrl(null);
        setTyped("");
        setMode("draw");
        clearCanvas();
        }, 0);

        return () => clearTimeout(timer);
    }, [open, clearCanvas]);

    if (!open) return null;

    const startDraw = (e: React.PointerEvent) => {
        drawingRef.current = true;
        lastPointRef.current = {
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const moveDraw = (e: React.PointerEvent) => {
        if (!drawingRef.current) return;
        const c = canvasRef.current;
        const ctx = c?.getContext("2d");
        if (!c || !ctx) return;
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;
        const last = lastPointRef.current ?? { x, y };
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        lastPointRef.current = { x, y };
    };

    const endDraw = () => {
        drawingRef.current = false;
        lastPointRef.current = null;
        const c = canvasRef.current;
        if (c) setDataUrl(c.toDataURL("image/png"));
    };

    const renderTyped = (text: string) => {
        if (!text.trim()) {
        setDataUrl(null);
        return;
        }
        const c = document.createElement("canvas");
        c.width = 600;
        c.height = 200;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#111111";
        ctx.font = "64px 'Segoe Script', 'Comic Sans MS', cursive";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 20, c.height / 2);
        setDataUrl(c.toDataURL("image/png"));
    };

    const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => setDataUrl(String(reader.result));
        reader.readAsDataURL(f);
        e.target.value = "";
    };

    const place = () => {
        if (!dataUrl) return;
        const id = `signature-${crypto.randomUUID()}`;
        const obj: SignatureObject = {
        id,
        kind: "signature",
        page: currentPage,
        rect: { x: 80, y: 120, w: 220, h: 73 },
        rotation: 0,
        z: 999,
        locked: false,
        opacity: 1,
        dataUrl,
        };
        addObject(obj);
        onOpenChange(false);
    };

    return (
        <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={() => onOpenChange(false)}
        >
        <div
            className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-4 h-11 border-b border-zinc-800">
            <h2 className="text-sm font-semibold">Add signature</h2>
            <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded hover:bg-zinc-800"
                title="Close"
            >
                <X className="w-4 h-4" />
            </button>
            </div>

            <div className="flex gap-1 p-2 border-b border-zinc-800">
            <Tab active={mode === "draw"} onClick={() => setMode("draw")}>
                <Eraser className="w-3.5 h-3.5" /> Draw
            </Tab>
            <Tab active={mode === "type"} onClick={() => setMode("type")}>
                <Type className="w-3.5 h-3.5" /> Type
            </Tab>
            <Tab active={mode === "upload"} onClick={() => setMode("upload")}>
                <Upload className="w-3.5 h-3.5" /> Upload
            </Tab>
            </div>

            <div className="p-4 space-y-3">
            {mode === "draw" && (
                <>
                <canvas
                    ref={canvasRef}
                    width={480}
                    height={160}
                    className="w-full h-40 rounded-lg bg-white touch-none"
                    onPointerDown={startDraw}
                    onPointerMove={moveDraw}
                    onPointerUp={endDraw}
                    onPointerCancel={endDraw}
                />
                <div className="flex justify-end">
                    <button
                    onClick={clearCanvas}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
                    >
                    Clear
                    </button>
                </div>
                </>
            )}

            {mode === "type" && (
                <div className="space-y-2">
                <input
                    type="text"
                    value={typed}
                    onChange={(e) => {
                    setTyped(e.target.value);
                    renderTyped(e.target.value);
                    }}
                    placeholder="Type your name"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-2 text-sm"
                />
                {dataUrl && (
                    <img
                    src={dataUrl}
                    alt="preview"
                    className="w-full rounded border border-zinc-800 bg-white"
                    />
                )}
                </div>
            )}

            {mode === "upload" && (
                <div className="space-y-2">
                <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={onUpload}
                    className="block w-full text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-zinc-800 file:text-zinc-100"
                />
                {dataUrl && (
                    <img
                    src={dataUrl}
                    alt="preview"
                    className="w-full rounded border border-zinc-800 bg-white"
                    />
                )}
                </div>
            )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-zinc-800">
            <button
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 rounded text-xs border border-zinc-700 hover:bg-zinc-800"
            >
                Cancel
            </button>
            <button
                disabled={!dataUrl}
                onClick={place}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium"
            >
                <Check className="w-3.5 h-3.5" /> Place on page {currentPage + 1}
            </button>
            </div>
        </div>
        </div>
    );
    }

    function Tab({
    active,
    onClick,
    children,
    }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    }) {
    return (
        <button
        onClick={onClick}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
            active ? "bg-emerald-600 text-white" : "hover:bg-zinc-800 text-zinc-300"
        }`}
        >
        {children}
        </button>
    );
    }
