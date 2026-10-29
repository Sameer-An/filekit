// src/app/pdf-editor/page.tsx
// Route for the full-screen PDF editor. Loads handoff bytes from IndexedDB,
// renders the editor shell, and shows a friendly error for encrypted PDFs.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PdfEditorApp } from "@/components/pdf-editor/PdfEditorApp";
import { readHandoff, readSession, clearHandoff } from "@/lib/pdf-editor/idb";
import { loadPdfDocument } from "@/lib/pdf-editor/pdfjs";
import { usePdfEditor } from "@/lib/pdf-editor/store";

type Phase = "loading" | "ready" | "restore" | "empty" | "encrypted" | "error";

export default function PdfEditorPage() {
const [phase, setPhase] = useState<Phase>("loading");
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const [fileName, setFileName] = useState<string>("");

const initDocument = usePdfEditor((s) => s.initDocument);
const loadSession = usePdfEditor((s) => s.loadSession);

useEffect(() => {
    let cancelled = false;
    (async () => {
    try {
        // 1. Try the handoff payload first.
        const handoff = await readHandoff();
        if (cancelled) return;
        if (handoff) {
        setFileName(handoff.fileName);
        try {
            const loaded = await loadPdfDocument(handoff.bytes);
            if (loaded.isEncrypted) {
            setPhase("encrypted");
            await clearHandoff();
            return;
            }
            initDocument({
            originalBytes: handoff.bytes,
            fileName: handoff.fileName,
            pages: loaded.pageInfos,
            });
            setPhase("ready");
            await clearHandoff();
        } catch (err) {
            console.error(err);
            setErrorMessage(
            err instanceof Error ? err.message : "Could not open PDF.",
            );
            setPhase("error");
        }
        return;
        }

        // 2. Fall back to a recent autosave.
        const session = await readSession();
        if (cancelled) return;
        if (session && Date.now() - session.savedAt < 24 * 60 * 60 * 1000) {
        setFileName(session.fileName);
        setPhase("restore");
        return;
        }

        // 3. Nothing — show empty state.
        setPhase("empty");
    } catch (err) {
        console.error(err);
        setErrorMessage(
        err instanceof Error ? err.message : "Failed to load editor.",
        );
        setPhase("error");
    }
    })();
    return () => {
    cancelled = true;
    };
}, [initDocument, loadSession]);

const acceptRestore = async () => {
    const session = await readSession();
    if (!session) {
    setPhase("empty");
    return;
    }
    loadSession(session);
    setPhase("ready");
};

const declineRestore = async () => {
    // Wipe the session and show the empty state.
    const { clearSession } = await import("@/lib/pdf-editor/idb");
    await clearSession();
    setPhase("empty");
};

if (phase === "loading") {
    return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-zinc-400">Preparing editor…</span>
        </div>
    </div>
    );
}

if (phase === "encrypted") {
    return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100 p-6">
        <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">
            Encrypted PDFs are not supported
        </h1>
        <p className="text-sm text-zinc-400">
            &ldquo;{fileName}&rdquo; is protected by a password. Remove the
            password first, then open it in the editor.
        </p>
        <div className="flex gap-3 justify-center">
            <Link
            href="/tools/pdf-protect"
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
            Open password tool
            </Link>
            <Link
            href="/tools/pdf-editor"
            className="px-4 py-2 rounded-md border border-zinc-700 hover:bg-zinc-800 text-sm"
            >
            Choose another file
            </Link>
        </div>
        </div>
    </div>
    );
}

if (phase === "error") {
    return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100 p-6">
        <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Could not open the PDF</h1>
        <p className="text-sm text-zinc-400">
            {errorMessage ??
            "The file may be corrupted or in an unsupported format."}
        </p>
        <Link
            href="/tools/pdf-editor"
            className="inline-block px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
        >
            Back to upload
        </Link>
        </div>
    </div>
    );
}

if (phase === "empty") {
    return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100 p-6">
        <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">No PDF loaded</h1>
        <p className="text-sm text-zinc-400">
            Upload a PDF from the tools page to start editing.
        </p>
        <Link
            href="/tools/pdf-editor"
            className="inline-block px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
        >
            Open the PDF Editor
        </Link>
        </div>
    </div>
    );
}

if (phase === "restore") {
    return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100 p-6">
        <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Restore previous session?</h1>
        <p className="text-sm text-zinc-400">
            We found an autosaved session for &ldquo;{fileName}&rdquo;. Restore
            it?
        </p>
        <div className="flex gap-3 justify-center">
            <button
            onClick={acceptRestore}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
            Restore
            </button>
            <button
            onClick={declineRestore}
            className="px-4 py-2 rounded-md border border-zinc-700 hover:bg-zinc-800 text-sm"
            >
            Discard
            </button>
        </div>
        </div>
    </div>
    );
}

// phase === "ready"
return <PdfEditorApp />;
}
