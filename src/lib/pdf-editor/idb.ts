    // src/lib/pdf-editor/idb.ts
    // Hand-rolled IndexedDB for the PDF Editor. Mirrors the pattern used by
    // `saveDocToDB/getDocFromDB` in the Word editor, but with its own database
    // so we never clash with `FileKitDocs`.
    //
    // Databases:
    //   FileKitPdfEditor
    //     store "handoff" — the initial bytes from the launcher (one row, key "current")
    //     store "session" — the autosaved editor snapshot (one row, key "current")
    //     store "fonts" — imported font metadata keyed by stable family name
    //     store "font-binaries" — font bytes, separate from metadata

    import type { SessionSnapshot } from "./types";

    const DB_NAME = "FileKitPdfEditor";
    const DB_VERSION = 3;
    const HANDOFF_STORE = "handoff";
    const SESSION_STORE = "session";
    const FONT_STORE = "fonts";
    const FONT_BINARY_STORE = "font-binaries";

    export interface UploadedFontMetadata {
    family: string;
    fileName: string;
    format: "ttf" | "otf";
    size: number;
    importedAt: number;
    bold: boolean;
    italic: boolean;
    }

    export interface StoredUploadedFont extends UploadedFontMetadata {
    bytes: ArrayBuffer;
    }

    export interface HandoffPayload {
    bytes: Uint8Array;
    fileName: string;
    createdAt: number;
    }

    function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDOFF_STORE)) {
            db.createObjectStore(HANDOFF_STORE);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
            db.createObjectStore(SESSION_STORE);
        }
        if (!db.objectStoreNames.contains(FONT_STORE)) {
            db.createObjectStore(FONT_STORE);
        }
        if (!db.objectStoreNames.contains(FONT_BINARY_STORE)) {
            db.createObjectStore(FONT_BINARY_STORE);
        }
        if (event.oldVersion === 2) {
            const transaction = request.transaction;
            if (!transaction) {
            reject(new Error("Font storage migration could not start."));
            return;
            }
            const fonts = transaction.objectStore(FONT_STORE);
            const binaries = transaction.objectStore(FONT_BINARY_STORE);
            const cursorRequest = fonts.openCursor();
            cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const storedFont = cursor.value as StoredUploadedFont;
            if (storedFont.bytes instanceof ArrayBuffer) {
                const { bytes, ...metadata } = storedFont;
                binaries.put(bytes, storedFont.family);
                cursor.update(metadata);
            }
            cursor.continue();
            };
        }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
        reject(request.error ?? new Error("IDB open failed"));
        request.onblocked = () =>
        reject(new Error("IndexedDB upgrade blocked — close other tabs."));
    });
    }

    function writeOne<T>(store: string, value: T): Promise<void> {
    return openDb().then(
        (db) =>
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction(store, "readwrite");
            tx.objectStore(store).put(value, "current");
            tx.oncomplete = () => {
            db.close();
            resolve();
            };
            tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error("IDB write failed"));
            };
        }),
    );
    }

    function readOne<T>(store: string): Promise<T | null> {
    return openDb().then(
        (db) =>
        new Promise<T | null>((resolve, reject) => {
            const tx = db.transaction(store, "readonly");
            const req = tx.objectStore(store).get("current");
            req.onsuccess = () => {
            db.close();
            resolve((req.result as T | undefined) ?? null);
            };
            req.onerror = () => {
            db.close();
            reject(req.error ?? new Error("IDB read failed"));
            };
        }),
    );
    }

    function deleteOne(store: string): Promise<void> {
    return openDb().then(
        (db) =>
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction(store, "readwrite");
            tx.objectStore(store).delete("current");
            tx.oncomplete = () => {
            db.close();
            resolve();
            };
            tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error("IDB delete failed"));
            };
        }),
    );
    }

    /* ───────────── Handoff (launcher → /pdf-editor) ───────────── */

    export function saveHandoff(
    bytes: Uint8Array,
    fileName: string,
    ): Promise<void> {
    const payload: HandoffPayload = {
        bytes,
        fileName,
        createdAt: Date.now(),
    };
    return writeOne(HANDOFF_STORE, payload);
    }

    export function readHandoff(): Promise<HandoffPayload | null> {
    return readOne<HandoffPayload>(HANDOFF_STORE);
    }

    export function clearHandoff(): Promise<void> {
    return deleteOne(HANDOFF_STORE);
    }

    /* ───────────── Session snapshot (autosave) ───────────── */

    export function saveSession(snapshot: SessionSnapshot): Promise<void> {
    return writeOne(SESSION_STORE, snapshot);
    }

    export function readSession(): Promise<SessionSnapshot | null> {
    return readOne<SessionSnapshot>(SESSION_STORE);
    }

    export function clearSession(): Promise<void> {
    return deleteOne(SESSION_STORE);
    }

    /* ───────────── Imported fonts (binary data kept out of snapshots) ───── */

    export function saveUploadedFont(font: StoredUploadedFont): Promise<void> {
    return openDb().then(
        (db) =>
        new Promise<void>((resolve, reject) => {
            const tx = db.transaction(
                [FONT_STORE, FONT_BINARY_STORE],
                "readwrite",
            );
            const { bytes, ...metadata } = font;
            tx.objectStore(FONT_STORE).put(metadata, font.family);
            tx.objectStore(FONT_BINARY_STORE).put(bytes, font.family);
            tx.oncomplete = () => {
            db.close();
            resolve();
            };
            tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error("Font storage failed."));
            };
        }),
    );
    }

    export function readUploadedFont(
    family: string,
    ): Promise<StoredUploadedFont | null> {
    return openDb().then(
        (db) =>
        new Promise<StoredUploadedFont | null>((resolve, reject) => {
            const tx = db.transaction(
                [FONT_STORE, FONT_BINARY_STORE],
                "readonly",
            );
            const metadataRequest = tx.objectStore(FONT_STORE).get(family);
            const bytesRequest = tx.objectStore(FONT_BINARY_STORE).get(family);
            let metadata: UploadedFontMetadata | undefined;
            let bytes: ArrayBuffer | undefined;
            metadataRequest.onsuccess = () => {
            metadata = metadataRequest.result as UploadedFontMetadata | undefined;
            };
            bytesRequest.onsuccess = () => {
            bytes = bytesRequest.result as ArrayBuffer | undefined;
            };
            tx.oncomplete = () => {
            db.close();
            if (!metadata && !bytes) {
                resolve(null);
            } else if (metadata && bytes) {
                resolve({ ...metadata, bytes });
            } else {
                reject(new Error("Imported font metadata or font data is missing."));
            }
            };
            tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error("Font storage read failed."));
            };
        }),
    );
    }

    export function readUploadedFontMetadata(): Promise<UploadedFontMetadata[]> {
    return openDb().then(
        (db) =>
        new Promise<UploadedFontMetadata[]>((resolve, reject) => {
            const tx = db.transaction(FONT_STORE, "readonly");
            const request = tx.objectStore(FONT_STORE).getAll();
            request.onsuccess = () => {
            const fonts = request.result as UploadedFontMetadata[];
            db.close();
            resolve(fonts);
            };
            request.onerror = () => {
            db.close();
            reject(request.error ?? new Error("Font metadata read failed."));
            };
        }),
    );
    }
