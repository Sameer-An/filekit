# FileKit

Free online tools to convert, edit, compress, merge, and manage files in one place. No sign-up, no login.

Built with Next.js (App Router), React, TypeScript, and Tailwind CSS. Most tools run in the browser. Tools that need exact output (DOCX to PDF, PDF to DOCX, media processing) run on the server using real engines.

---

## Features

| Category | Examples |
|---|---|
| PDF | merge, split, protect, page tools, text extraction |
| Image | compress, resize, convert, EXIF |
| Video / Audio | convert, process, merge (FFmpeg) |
| Document | Word editor, DOCX to PDF, PDF to DOCX, TXT/Markdown/HTML to DOCX or PDF, CSV/XLSX |
| Archive / Utility | zip tools and misc utilities |

The full list lives in `src/lib/tools-registry.ts` (also see `docs/TOOL_INVENTORY.md`).

---

## Tech Stack

- **Framework:** Next.js 16 (webpack), React 19, TypeScript 5
- **UI:** Tailwind CSS 4, Radix UI, lucide-react
- **Editor:** Tiptap v3 (+ `tiptap-pagination-plus` for the paginated full-screen editor)
- **Documents:** mammoth, docx, xlsx, marked
- **PDF:** pdf-lib, pdfjs-dist, Playwright (HTML to PDF)
- **Images / media:** sharp, browser-image-compression, fluent-ffmpeg, tesseract.js
- **Server conversion engines:** LibreOffice (DOCX to PDF), pdf2docx (PDF to DOCX)

---

## Requirements

Install these once on your machine.

| Tool | Needed for | Download |
|---|---|---|
| Node.js 20+ | running the app | nodejs.org |
| LibreOffice | DOCX to PDF, DOCX export | libreoffice.org |
| Python 3.9+ | PDF to DOCX | python.org (tick "Add to PATH") |
| pdf2docx | PDF to DOCX | `pip install pdf2docx` |
| FFmpeg | video/audio tools | ffmpeg.org (must be on PATH) |
| Chromium for Playwright | HTML/Markdown to PDF | `npx playwright install chromium` |

---

## Getting Started

```bash
git clone https://github.com/Sameer-An/filekit.git
cd filekit
npm install
pip install pdf2docx
npx playwright install chromium
npm run dev
```

Open http://localhost:3000.

Always run the commands from the **project root** (the folder containing `package.json`). The PDF to DOCX route finds `scripts/pdf_to_docx.py` relative to that folder.

### Optional environment variables

Create `.env.local` in the project root if the engines are not found automatically:

```env
# Full path to LibreOffice's soffice binary
SOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe

# Python command or full path (default: "python" on Windows, "python3" elsewhere)
PYTHON_PATH=python
```

Restart `npm run dev` after changing `.env.local`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | start the dev server |
| `npm run build` | production build |
| `npm start` | run the production build |
| `npm run lint` | ESLint |
| `npm test` | run tests in `tests/` (`node --test`) |

---

## How the Document Conversions Work

### DOCX to PDF and PDF to DOCX (exact conversion)

These two tools do **not** use the editor. The original file is uploaded to the server and converted by a real engine, so layout, fonts, tables, and images are preserved.

```
Browser (DirectConvertEngine)
   │  POST multipart/form-data  { file }
   ▼
/api/convert/docx-to-pdf   →  LibreOffice (headless)  →  PDF
/api/convert/pdf-to-docx   →  scripts/pdf_to_docx.py (pdf2docx)  →  DOCX
```

- Routes validate file size (max 100 MB) and file signature (DOCX = ZIP header, PDF = `%PDF`).
- Each conversion runs in its own temp folder, which is deleted afterwards.
- LibreOffice runs with a private profile folder, so parallel conversions do not lock each other.

### Other document tools (editor based)

`txt-to-docx`, `docx-merge`, `markdown-editor`, `html-to-pdf`, and `docx-to-txt` load content into a Tiptap editor, then export:

- DOCX export: `/api/docx/export` (LibreOffice, with a client-side `docx` fallback)
- PDF export: `/api/pdf/from-html` (Playwright Chromium, A4, 1-inch margins)

`docx-editor` and `word-editor` open the full-screen paginated editor at `/editor`. The converted HTML is handed over through IndexedDB (database `FileKitDocs`).

---

## Project Structure

```
filekit/
├── scripts/
│   └── pdf_to_docx.py            # pdf2docx wrapper (called by the API route)
├── src/
│   ├── app/
│   │   ├── page.tsx              # landing page
│   │   ├── tools/                # tools list + [toolId] pages
│   │   ├── editor/page.tsx       # full-screen paginated Word editor
│   │   └── api/
│   │       ├── convert/
│   │       │   ├── docx-to-pdf/route.ts
│   │       │   └── pdf-to-docx/route.ts
│   │       ├── docx/export/route.ts
│   │       ├── pdf/from-html/route.ts
│   │       ├── pdf/protect/route.ts
│   │       ├── media/{merge,process}/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── tools/
│   │   │   ├── tool-page-router.tsx     # picks the engine for each tool
│   │   │   ├── direct-convert-engine.tsx# DOCX<->PDF (server conversion)
│   │   │   ├── document-tool-engine.tsx # editor-based document tools
│   │   │   ├── pdf-tool-engine.tsx
│   │   │   ├── image-tool-engine.tsx
│   │   │   ├── media-tool-engine.tsx
│   │   │   └── utility-tool-engine.tsx
│   │   ├── ui/ layout/ sections/        # shared UI
│   │   └── file-upload-zone.tsx, processing-panel.tsx
│   └── lib/
│       ├── tools-registry.ts     # every tool: id, formats, mode, limits
│       ├── convert-server.ts     # LibreOffice + pdf2docx runners
│       ├── job-store.ts          # job/progress types
│       └── pdf-text-extractor.ts, docx-export.ts, image-ops.ts, ...
├── tests/                        # node --test suites + audit scripts
└── docs/                         # PROJECT_AUDIT.md, TOOL_INVENTORY.md
```

---

## Adding a New Tool

1. Add an entry in `src/lib/tools-registry.ts` (`id`, `category`, `inputFormats`, `outputFormats`, `mode`, `maxFileSizeMB`).
2. Implement the logic in the matching engine in `src/components/tools/`. For a server job, add a route under `src/app/api/`.
3. If the tool needs its own UI, route it in `tool-page-router.tsx`, as `docx-to-pdf` and `pdf-to-docx` are.
4. Run `npm run lint` and `npm test`.

---

## Known Limits

- **PDF to DOCX:** works best on digital PDFs. Heavily designed layouts can shift slightly. Scanned PDFs have no text layer and need OCR first.
- **DOCX to PDF:** if the DOCX uses fonts that are not installed, LibreOffice substitutes them. Install the fonts for an exact match.
- **Server tools need the engines installed.** They will not work on serverless hosts such as Vercel unless the engines are provided (use Docker, a VPS, Railway, or Render).
- `/api/docx/export` falls back to the `html-to-docx` package when LibreOffice fails. That package is not in `package.json`, so run `npm i html-to-docx` if you want that fallback.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `spawn soffice ENOENT` | Install LibreOffice or set `SOFFICE_PATH` |
| `No module named pdf2docx` | `pip install pdf2docx` (or `py -m pip install pdf2docx`) |
| `python` not recognized | Reinstall Python with "Add to PATH", or set `PYTHON_PATH` |
| `pdf_to_docx.py` not found | Run `npm run dev` from the project root; the file must be at `scripts/pdf_to_docx.py` |
| HTML to PDF fails | `npx playwright install chromium` |
| Video/audio tools fail | Install FFmpeg and add it to PATH |
| Conversion times out | Large or complex files: the limit is about 2 to 3 minutes per file |

---

## Context for AI Assistants and Contributors

- Tool definitions are data-driven. Start from `tools-registry.ts` and `tool-page-router.tsx`.
- Tiptap is v3. `StarterKit` already includes Link and Underline, so disable them in `StarterKit.configure` before adding configured versions. Toolbar state needs `useEditorState`.
- Never rebuild DOCX/PDF through HTML when exact fidelity is required. Use the `/api/convert/*` routes.
- API routes use `runtime = "nodejs"`. Use `execFile` (not `exec`) with argument arrays when spawning processes.
- Uploaded files must be written to temp folders and cleaned up. Nothing is stored permanently.
- `/editor` expects its document in IndexedDB under database `FileKitDocs`, store `docs`, key `current`.

---

## License

Add your license here (for example MIT).



## Tech Stack

### Core
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.4.1 | App Router, API routes, server rendering (runs with webpack) |
| React / React DOM | 19.3.0 | UI |
| TypeScript | 5.x | Type safety |
| Node.js | 20+ | Runtime for API routes |
| Python | 3.9+ | Runs `scripts/pdf_to_docx.py` |

### Styling and UI
| Library | Purpose |
|---|---|
| Tailwind CSS 4 (`@tailwindcss/postcss`, `autoprefixer`) | Utility-first styling |
| Radix UI (`accordion`, `checkbox`, `dialog`, `dropdown-menu`, `label`, `popover`, `progress`, `select`, `separator`, `slider`, `switch`, `tabs`, `toast`, `tooltip`) | Accessible UI primitives |
| lucide-react | Icons |
| class-variance-authority, clsx, tailwind-merge | Component variants and class merging |
| next-themes | Light/dark theme |
| react-colorful | Color picker |
| @dnd-kit (`core`, `sortable`, `utilities`) | Drag and drop reordering |

### Forms and State
| Library | Purpose |
|---|---|
| react-hook-form, @hookform/resolvers | Forms |
| zod | Validation |
| zustand | Client state |
| uuid | Unique IDs |

### Rich-Text / Word Editor
| Library | Purpose |
|---|---|
| @tiptap/react, @tiptap/pm, @tiptap/starter-kit | Editor core (Tiptap v3) |
| Tiptap extensions: `underline`, `text-align`, `text-style`, `color`, `font-family`, `highlight`, `image`, `link`, `table`, `placeholder`, `subscript`, `superscript`, `task-list`, `task-item`, `character-count` | Formatting, tables, images, lists, word count |
| tiptap-pagination-plus, tiptap-community-pages | Page-style layout (A4 pages) in `/editor` |

### Documents and Spreadsheets
| Library | Purpose |
|---|---|
| mammoth | Reads DOCX and converts it to HTML (editor import) |
| docx | Builds DOCX in the browser (fallback export) |
| docxtemplater, pizzip | DOCX template filling |
| xlsx | Reads and writes Excel and CSV |
| marked | Markdown to HTML |
| js-yaml | YAML parsing |

### PDF
| Library | Purpose |
|---|---|
| pdf-lib | Merge, split, edit PDFs |
| pdfjs-dist | Render and read PDFs, text extraction |
| qpdf | PDF protection and encryption |
| playwright (Chromium) | HTML to PDF (`/api/pdf/from-html`) |

### Images and OCR
| Library | Purpose |
|---|---|
| sharp | Server-side image processing |
| browser-image-compression | Client-side image compression |
| exifr | EXIF metadata reading |
| tesseract.js | OCR (text from images) |

### Video / Audio and Files
| Library | Purpose |
|---|---|
| fluent-ffmpeg (+ FFmpeg binary) | Video and audio conversion |
| archiver, jszip | Create and read ZIP archives |
| multer | Multipart upload handling |
| file-saver | Trigger file downloads |

### External Engines (installed separately, not npm)
| Engine | Purpose |
|---|---|
| LibreOffice (headless) | DOCX to PDF, DOCX export |
| pdf2docx (Python) | PDF to DOCX with layout preserved |
| FFmpeg | Media processing |
| Chromium (via Playwright) | HTML to PDF |

### Dev Tooling
ESLint 9 (`eslint-config-next`), TypeScript, `@types/node`, `@types/react`, `@types/react-dom`, and Node's built-in test runner (`node --test`).