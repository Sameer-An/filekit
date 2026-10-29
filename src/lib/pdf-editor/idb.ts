    // src/lib/pdf-editor/idb.ts
    // Hand-rolled IndexedDB for the PDF Editor. Mirrors the pattern used by
    // `saveDocToDB/getDocFromDB` in the Word editor, but with its own database
    // so we never clash with `FileKitDocs`.
    //
    // Databases:
    //   FileKitPdfEditor
    //     store "handoff" — the initial bytes from the launcher (one row, key "current")
    //     store "session" — the autosaved editor snapshot (one row, key "current")

    import type { SessionSnapshot } from "./types";

    const DB_NAME = "FileKitPdfEditor";
    const DB_VERSION = 1;
    const HANDOFF_STORE = "handoff";
    const SESSION_STORE = "session";

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
        request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDOFF_STORE)) {
            db.createObjectStore(HANDOFF_STORE);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
            db.createObjectStore(SESSION_STORE);
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
