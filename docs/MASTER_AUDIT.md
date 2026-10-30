# FileKit — MASTER AUDIT & FIX GUIDE

Put this file at `docs/MASTER_AUDIT.md`. Repo: https://github.com/Sameer-An/filekit (audited commit `fd556b0`).

**How it was audited:** by reading the code. `tsc`, `eslint` and `next build` could NOT be run in the audit sandbox (npm registry unreachable). Step 0 below runs them on your PC; anything they report beats this list.

Severity: **P0** = breaks a feature or is a security hole. **P1** = fails under normal use or load. **P2** = quality / future risk.

---
## STEP 0 — Run these first (on your PC)
```
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm test
```
Fix every error before anything else. The goal is **0 errors in all four**.

---
## P0 — Fix now

### P0-1 `src/lib/pdf-editor/fonts.ts` — custom font files never load
`embedCustomFont` fetches `/fonts/<name>.ttf`, but `public/fonts` only holds `NotoSans-Regular.woff2`, `NotoSans-Bold.woff2`, `OFL.txt`. Result: 404 -> exception -> text with non-Latin characters (and the Roboto/Open Sans/Lato/Montserrat/Poppins choices) falls back or fails.
**Edit:**
- Try `.woff2`, then `.woff`, then `.ttf` (loop over extensions), and return a clear error only if all fail.
- Cache each embedded font **per PDFDocument** in a `WeakMap<PDFDocument, Map<string, PDFFont>>`, so a font is fetched and embedded once, not once per text run.
- Add the missing files to `public/fonts` (Regular + Bold for every family listed in `CUSTOM_FONT_FILE`), or remove families you don't ship from the dropdown.
- Wrap embedding in try/catch and fall back to `StandardFonts.Helvetica`, so Download never throws because of a font.
- Check that `@pdf-lib/fontkit` actually decodes WOFF2. If it does not, convert to `.ttf`.

### P0-2 `src/app/api/pdf/from-html/route.ts` — server-side request forgery + denial of service
It runs Playwright on **any** HTML posted by anyone: the page can fetch `http://localhost:*`, cloud metadata, or `file://`. There is also no size limit, and a browser is launched per request.
**Edit:**
- Validate the body: `typeof html === "string"` and `html.length <= 2_000_000`.
- Block all network and local access: `page.route("**/*", r => ["data:", "about:"].some(p => r.request().url().startsWith(p)) ? r.continue() : r.abort())`, and `javaScriptEnabled: false` in `newContext`.
- Use `waitUntil: "load"` (not `networkidle`), a hard `timeout`, and `try/catch` returning a 4xx/5xx JSON error.
- Limit concurrency (a semaphore of 1–2 browsers).

### P0-3 `src/app/api/docx/export/route.ts` — shell exec, concurrency bug, no validation
- It uses `exec` with an interpolated string. Switch to `execFile("soffice", [...args])`, with no shell.
- Run LibreOffice with a private profile per job: `-env:UserInstallation=file:///<workDir>/profile`. Without it, two simultaneous requests collide and fail (the same approach as `src/lib/convert-server.ts`).
- Use `process.env.SOFFICE_PATH ?? "soffice"` (the binary is named `soffice`, `libreoffice` may not exist on Windows).
- Validate `html` (string, max size), and always `rm(workDir, {recursive:true, force:true})` in `finally` (it is currently only cleaned on some paths).
- Remove the `@ts-expect-error` on `html-to-docx` by adding `declare module "html-to-docx";` in `src/types/html-to-docx.d.ts`.

### P0-4 All `src/app/api/**` routes — no abuse protection
No rate limit, no auth, no per-request upload cap on `docx/export`, `pdf/from-html` (and the media routes only cap size, not count).
**Edit:** add a tiny in-memory limiter `src/lib/rate-limit.ts` (token bucket per IP, e.g. 20 req/min) and call it first in every route; return `429`. Add `export const dynamic = "force-dynamic"` to API routes. Document that for production a shared store (Redis/Upstash) replaces the Map.

---
## P1 — Reliability

### P1-1 `src/lib/pdf-pages.ts` — pdf.js worker loaded from `unpkg.com` CDN
Offline, behind a firewall, or when unpkg is down, every tool that uses it breaks. The editor already does it right (`new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` in `lib/pdf-editor/pdfjs.ts`).
**Edit:** use the same local `new URL(...)` form here. Keep **one** shared `getPdfjs()` helper for the whole app.

### P1-2 Two PDF engines / two editors
`src/app/editor/page.tsx` (old annotation editor, 654 lines) and `src/app/pdf-editor` (new) both exist, and `pdf-text-extractor.ts` (1266 lines) duplicates what `lib/pdf-editor/text-runs.ts` does.
**Edit:** decide which one is the product. Make `/editor` redirect to `/pdf-editor` (`redirect()` in `page.tsx`), delete dead code after confirming no imports (`grep -rn "pdf-text-extractor"`), and keep one pdf.js loader.

### P1-3 Export must never fail silently — `components/pdf-editor/Toolbar.tsx` `handleDownload`
Wrap `exportPdf` in `try/catch/finally`: show an error toast/message with the real reason, reset the busy flag in `finally`, and do not call `markSaved()` on failure. Revoke the blob URL after the download (`setTimeout(() => URL.revokeObjectURL(url), 10_000)` in `downloadBlob`).
Also add a unit test: `exportPdf` with **empty** overlays, with a deleted text run, a moved image, a duplicated page and a blank page; it must produce a valid PDF (reload it with `PDFDocument.load`).

### P1-4 `lib/pdf-editor/store.ts` + `history.ts` — undo and memory
- `HISTORY_LIMIT = 100` snapshots: images stored as base64 `dataUrl` are shared by reference (fine), but `commit` must NEVER deep-clone them (`JSON.parse(JSON.stringify())` or `structuredClone` on the state would duplicate every image 100 times). Verify, and add a comment/test.
- Typing in a text box or dragging must create **one** history entry, not one per keystroke/pixel. Commit only on blur/pointer-up.
- `extractedUids` is a module-level `Set` (store.ts line ~35). Clear it in `initDocument`, `loadSession` and on "close file", or reopening a different PDF can skip extraction.

### P1-5 `lib/pdf-editor/autosave.ts` + `idb.ts`
- Save can exceed the IndexedDB quota for big PDFs (`QuotaExceededError`): catch it, stop autosaving, and show a "Autosave off (file too large)" notice.
- On load, validate the saved snapshot's shape and version (`snap.version`), and fall back to the empty state instead of throwing. This is what caused the `settings.header` crash class.
- Do `flushAutosave` on `visibilitychange`/`pagehide`, not only on unmount.

### P1-6 `ObjectLayer.tsx` (977 lines)
Too big to reason about. Split into `useDragResize.ts`, `InlineTextEditor.tsx`, `ObjectView.tsx`, `SelectionFrame.tsx`, `createObject.ts`. Rules to enforce:
- A click never moves an object (4px drag threshold).
- Pointer capture only after the drag starts (otherwise `dblclick` is swallowed).
- Opening the editor and committing unchanged text does NOT set `dirty`.
- Selection frame and handles are drawn from the same rect as the object, scaled by `1/zoom`.
- Reset `editingId` on page change, tool change and Esc.

### P1-7 Pages & rotation
Every place that converts pointer deltas or rects must go through `pdfRectToCss` / `cssRectToPdf`. Add tests in `coords.test.ts` for rotation 0/90/180/270 (round trip: `cssRectToPdf(pdfRectToCss(r)) ≈ r`).
The Draw tool is only correct at rotation 0 — convert its points through the same helpers.

---
## P2 — Quality & future risk

- **Testing:** `npm test` runs `node --test` on 3 `.mjs` files; `coords.test.ts` is not picked up. Add `vitest`, run `src/**/*.test.ts`, and add tests for `page-ops`, `export`, `overlay-layout`, `store` (undo/redo).
- **CI:** add `.github/workflows/ci.yml`: `npm ci && npx tsc --noEmit && npm run lint && npm test && npm run build` on every push/PR.
- **Types:** 3 uses of `any`, 4 `@ts-ignore/eslint-disable`. Remove them. Turn on `"strict": true`, `"noUncheckedIndexedAccess": true`.
- **Security headers (`next.config.ts`):** add a `Content-Security-Policy` (self + `blob:` + `data:` for images/workers), `Strict-Transport-Security`. Remove `X-XSS-Protection` (obsolete).
- **Error boundaries:** add `src/app/pdf-editor/error.tsx` and `global-error.tsx`, so a render error shows "Something went wrong — Reload" instead of a white screen.
- **Env/config:** one `.env.example` listing `SOFFICE_PATH`, `PYTHON_PATH`, `FFMPEG_PATH`, `QPDF_PATH`, `MAX_FILE_SIZE_MB`. Fail fast with a clear message when a binary is missing (the `/api/health` route already checks this; show it in the UI).
- **Large files:** `pdf-tool-engine.tsx` (1999 lines), `tools-registry.ts` (1067) and `document-tool-engine.tsx` (1060) should be split per tool. Do it one file at a time, with tests.
- **Accessibility:** icon-only buttons need `aria-label`; the editor's keyboard shortcuts are listed in a "?" dialog.
- **Performance:** cap canvas pixels (done: 16M), render only visible pages (done), cache fonts per document (P0-1), never `await` inside a per-object loop for a font that could be resolved once.
- **Docs:** `README.md` has the setup; keep `docs/PROJECT_AUDIT.md` updated or delete it.

---
## Definition of done ("zero errors")
1. `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` all pass with 0 errors / 0 warnings.
2. Manual test on a 50+ page PDF: open, edit text, move/crop/delete an image, add text, draw, shapes, highlight, header/footer/watermark visible live, rotate/duplicate/delete pages, undo/redo everything, reload (autosave restores), download. The result must look identical to the editor and open in Acrobat/Chrome with no errors.
3. No `console.error` in the browser during the above.

---
## MASTER PROMPT (give this to any AI, with the repo link)

```
You are a senior TypeScript/Next.js engineer. You know nothing about this project, so read first.
Repo: https://github.com/Sameer-An/filekit (Next.js 16 with webpack, React 19, Zustand 5, TypeScript, Tailwind 4, pdfjs-dist 6, pdf-lib + @pdf-lib/fontkit).
Read docs/MASTER_AUDIT.md completely. It lists every known bug, risk and fix with file paths. Also read AGENTS.md: this Next.js has breaking changes, so check node_modules/next/dist/docs before using any Next API.

GOAL: zero errors, reliable, secure, fast. Work through docs/MASTER_AUDIT.md in order: STEP 0, then P0, P1, P2.

RULES
1. Run `npm ci && npx tsc --noEmit && npm run lint && npm run build && npm test` first and after each group of changes. Report the real output. Never claim something passes without running it.
2. One issue per change. For each, give: file path, the problem in one line, the FULL changed file (not snippets), and how you tested it.
3. Do not change behaviour that is not listed. Do not add npm packages except vitest (tests). Keep the existing style. Never use `any` or `@ts-ignore`.
4. API routes (src/app/api/**): validate every input, cap sizes, never use a shell (use execFile/spawn with an argument array), use a unique temp dir per request and always delete it in `finally`, return JSON errors with proper status codes, add rate limiting.
5. The PDF editor must be WYSIWYG: what the user sees in the tab must equal what exportPdf() produces. Any new object/overlay feature needs both an on-screen renderer and an export renderer that use shared layout math (see overlay-layout.ts).
6. PDF coordinates are points, y-up. CSS is y-down. Always convert with pdfRectToCss/cssRectToPdf in src/lib/pdf-editor/coords.ts, and test all 4 page rotations.
7. Zustand: selectors must be stable (useShallow; never return a new object/array from a selector). One user action = one undo step.
8. Persisted data (IndexedDB session, autosave) must be validated and versioned on load. Missing fields get safe defaults and must never crash.
9. After finishing, add tests (vitest) for coords, page-ops, overlay-layout, export (empty overlays, deleted run, moved image, duplicated/blank pages) and store undo/redo, add .github/workflows/ci.yml, and finish with a table: issue -> file -> fixed? -> test.
10. Ask me if anything is ambiguous. Do not guess.

Start now with STEP 0 and report the results.
```
