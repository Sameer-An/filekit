    // src/lib/pdf-editor/pdfjs.ts
    // Single pdfjs instance with a self-hosted worker. No unpkg, no CDN.
    // Import from client components only — pdfjs touches `document`/`window`.

    import type {
    PDFDocumentProxy,
    PDFPageProxy,
    PDFDocumentLoadingTask,
    } from "pdfjs-dist";
    import type { PageInfo } from "./types";

    let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

    /**
     * Lazily loads pdfjs-dist and configures the worker once. The worker URL
     * is produced by webpack from `import.meta.url`; no copy step is required.
     */
    export async function getPdfjs(): Promise<typeof import("pdfjs-dist")> {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
        // `?url`-less form: webpack rewrites this to a static asset URL.
        const workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
        ).toString();
        mod.GlobalWorkerOptions.workerSrc = workerSrc;
        return mod;
    });
    return pdfjsPromise;
    }

    export interface LoadedPdf {
    pdf: PDFDocumentProxy;
    loadingTask: PDFDocumentLoadingTask;
    numPages: number;
    pageInfos: PageInfo[];
    isEncrypted: boolean;
    }

    /**
     * Loads a PDF from raw bytes. Returns page info in *un-rotated* PDF points
     * (as pdf-lib would see them) with rotation taken from `page.rotate`.
     */
    export async function loadPdfDocument(bytes: Uint8Array): Promise<LoadedPdf> {
    const pdfjs = await getPdfjs();

    // `isEncrypted` on the loading task is set synchronously after `getDocument`.
    // If encryption needs a password, `pdf` throws — the caller shows the
    // friendly "encrypted PDFs are not supported" message.
    const loadingTask = pdfjs.getDocument({
        data: bytes.slice(0), // copy: pdfjs may detach the buffer
        // Keep default range behaviour. `disableAutoFetch` would disable
        // incremental fetch on server-hosted PDFs; we're always local.
        isEvalSupported: false,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pageInfos: PageInfo[] = [];

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        // Base viewport at scale 1, rotation 0 — gives the un-rotated box.
        const viewport = page.getViewport({ scale: 1, rotation: 0 });
        const rotate = ((page.rotate % 360) + 360) % 360;
        const normalizedRotation = (
        [0, 90, 180, 270].includes(rotate) ? rotate : 0
        ) as 0 | 90 | 180 | 270;
        pageInfos.push({
        index: i - 1,
        uid: `src-${i - 1}`,
        widthPt: viewport.width,
        heightPt: viewport.height,
        rotation: normalizedRotation,
        });
    }

    const isEncrypted =
        typeof (pdf as unknown as { isEncrypted?: boolean }).isEncrypted ===
        "boolean"
        ? Boolean((pdf as unknown as { isEncrypted?: boolean }).isEncrypted)
        : false;

    return { pdf, loadingTask, numPages, pageInfos, isEncrypted };
    }

    /**
     * Returns a `PDFPageProxy` by 0-based index. Cached by pdfjs internally;
     * a thin helper so callers don't have to remember the 1-based convention.
     */
    export function getPage(
    pdf: PDFDocumentProxy,
    index0: number,
    ): Promise<PDFPageProxy> {
    return pdf.getPage(index0 + 1);
    }

    /**
     * Extract the page's base viewport (scale 1, no rotation). Used by the
     * renderer to compute CSS sizes when multiplied by zoom.
     */
    export function getBaseViewport(
    page: PDFPageProxy,
    ): ReturnType<PDFPageProxy["getViewport"]> {
    return page.getViewport({ scale: 1, rotation: 0 });
    }
