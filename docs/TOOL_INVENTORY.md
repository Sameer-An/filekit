# Tool Inventory: FileKit

This document contains the authoritative inventory of all 61 tools registered and implemented in FileKit.

Status Legend:
- **Verified & Functional**: Feature implemented, tested with real files, and verified producing downloadable valid output.
- **Working with System Dependency**: Functional on host systems with external binaries (e.g. FFmpeg installed).

---

## 1. PDF Tools (14 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `pdf-compress` | Compress PDF | Browser | `.pdf` | `.pdf` | Multi-level compression: Extreme, Recommended, Low, Target Size (KB/MB), Grayscale toggle, metadata removal, and real-time savings analytics. | **Verified & Functional** |
| `pdf-merge` | Merge PDF | Browser | `.pdf` (multiple) | `.pdf` | Combines 2 or more PDF documents into a single ordered PDF file via `pdf-lib`. | **Verified & Functional** |
| `pdf-split` | Split PDF | Browser | `.pdf` | `.pdf` | Extracts user-specified page ranges (e.g. `1, 3, 5`) into a new PDF. | **Verified & Functional** |
| `pdf-to-images` | PDF to Images | Browser | `.pdf` | `.jpg`, `.png` | Extracts embedded images or renders pages to downloadable raster formats. | **Verified & Functional** |
| `images-to-pdf` | Images to PDF | Browser | `.jpg`, `.png`, `.webp` | `.pdf` | Assembles multiple image files into an aligned multi-page PDF document. | **Verified & Functional** |
| `pdf-rotate` | Rotate PDF Pages | Browser | `.pdf` | `.pdf` | Rotates all or targeted pages by 90°, 180°, or 270° with orientation preview. | **Verified & Functional** |
| `pdf-reorder` | Reorder PDF Pages | Browser | `.pdf` | `.pdf` | Reorganizes, deletes, or duplicates pages within a PDF. | **Verified & Functional** |
| `pdf-watermark` | Add Watermark to PDF | Browser | `.pdf` | `.pdf` | Stamps custom text watermarks across all pages with opacity and angle controls. | **Verified & Functional** |
| `pdf-page-numbers` | Add Page Numbers | Browser | `.pdf` | `.pdf` | Inserts "Page X of Y" pagination in header/footer (bottom-center or bottom-right). | **Verified & Functional** |
| `pdf-metadata` | PDF Metadata Inspector | Browser | `.pdf` | `.pdf` | Inspects and edits Title, Author, Subject, and Producer metadata tags. | **Verified & Functional** |
| `pdf-to-text` | Extract Text from PDF | Browser | `.pdf` | `.txt`, `.md` | Pure TS Flate/stream text extractor with word count, preview textarea, copy, and `.txt` download. | **Verified & Functional** |
| `pdf-ocr` | OCR Scanned PDF | Browser | `.pdf` | `.txt`, `.pdf` | Text extraction for standard and scanned document text layers. | **Verified & Functional** |
| `pdf-protect` | Protect PDF | Browser | `.pdf` | `.pdf` | Password encryption and security metadata stamping. | **Verified & Functional** |
| `pdf-editor` | PDF Annotation Editor | Browser | `.pdf` | `.pdf` | Interactive annotation stamping on page coordinates. | **Verified & Functional** |

---

## 2. Image Tools (13 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `image-convert` | Convert Image Format | Browser | `.jpg`, `.png`, `.webp`, `.gif`, `.bmp`, `.avif` | `.jpg`, `.png`, `.webp`, `.gif`, `.bmp` | Client-side Canvas/ImageBitmap converter supporting WebP, JPEG, PNG, BMP. | **Verified & Functional** |
| `image-compress` | Compress Image | Browser | `.jpg`, `.png`, `.webp` | `.jpg`, `.png`, `.webp` | Quality-based JPEG/WebP compression slider with before/after size savings card. | **Verified & Functional** |
| `image-resize` | Resize Image | Browser | `.jpg`, `.png`, `.webp`, `.gif`, `.bmp` | `.jpg`, `.png`, `.webp` | Exact pixel width & height resizing with aspect-ratio preservation switch. | **Verified & Functional** |
| `image-crop` | Crop Image | Browser | `.jpg`, `.png`, `.webp` | `.jpg`, `.png`, `.webp` | Visual cropping to target dimensions. | **Verified & Functional** |
| `image-rotate` | Rotate & Flip Image | Browser | `.jpg`, `.png`, `.webp`, `.gif` | `.jpg`, `.png`, `.webp` | 90°/180° rotation with horizontal and vertical flip mirroring. | **Verified & Functional** |
| `image-filters` | Image Filters | Browser | `.jpg`, `.png`, `.webp` | `.jpg`, `.png`, `.webp` | Sliders for Brightness, Contrast, Saturation, and Grayscale filters. | **Verified & Functional** |
| `image-watermark` | Watermark Image | Browser | `.jpg`, `.png`, `.webp` | `.jpg`, `.png`, `.webp` | Draws customizable text watermark with outline and fill on canvas. | **Verified & Functional** |
| `image-to-pdf` | Image to PDF | Browser | `.jpg`, `.png`, `.webp` | `.pdf` | Converts individual or multiple images into a standalone PDF document. | **Verified & Functional** |
| `image-metadata` | EXIF Metadata Viewer | Browser | `.jpg`, `.png`, `.tiff`, `.heic` | Display | Extracts and formats camera, lens, exposure, GPS, and date metadata via `exifr`. | **Verified & Functional** |
| `image-remove-exif` | Remove EXIF Data | Browser | `.jpg`, `.png`, `.webp` | `.jpg`, `.png` | Strips all metadata by redrawing pure image pixels to a clean canvas. | **Verified & Functional** |
| `image-batch-convert` | Batch Image Convert | Browser | `.jpg`, `.png`, `.webp`, `.gif` | `.zip` | Batch processes multiple images into target format and downloads a unified ZIP. | **Verified & Functional** |
| `image-batch-compress` | Batch Image Compress | Browser | `.jpg`, `.png`, `.webp` | `.zip` | Compresses multiple images simultaneously with quality slider into a ZIP file. | **Verified & Functional** |
| `ico-creator` | Create ICO File | Browser | `.jpg`, `.png`, `.webp` | `.ico` | Creates square icon assets (16x16, 32x32, 64x64, 128x128). | **Verified & Functional** |

---

## 3. Document Tools (10 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `docx-editor` | Word Document Editor | Browser | `.docx` | `.docx` | Extracts document text via `mammoth`, provides in-browser editing, and generates valid `.docx` via `docx` library. | **Verified & Functional** |
| `docx-to-pdf` | DOCX to PDF | Server/Browser | `.docx` | `.pdf` | Formats extracted document text into an A4 paginated vector PDF with typography hierarchy. | **Verified & Functional** |
| `pdf-to-docx` | PDF to DOCX | Browser | `.pdf` | `.docx` | Extracts text and structure from PDF and constructs a genuine Microsoft Word `.docx` file. | **Verified & Functional** |
| `txt-to-docx` | Text to DOCX | Browser | `.txt`, `.md` | `.docx` | Converts plain text or markdown files into styled Word `.docx` documents. | **Verified & Functional** |
| `markdown-editor` | Markdown Editor | Browser | `.md`, `.txt` | `.html`, `.pdf`, `.txt` | Live markdown editor compiling to clean HTML or printable documents via `marked`. | **Verified & Functional** |
| `html-to-pdf` | HTML to PDF | Browser | `.html`, `.htm` | `.pdf` | Exports HTML markup into clean printable/PDF format. | **Verified & Functional** |
| `docx-to-txt` | Extract Text from DOCX | Browser | `.docx` | `.txt` | Fast text extraction from `.docx` packages via `mammoth`. | **Verified & Functional** |
| `csv-to-xlsx` | CSV to Excel | Browser | `.csv` | `.xlsx` | Converts comma-separated values into binary Microsoft Excel `.xlsx` spreadsheets via `xlsx`. | **Verified & Functional** |
| `xlsx-editor` | Spreadsheet Editor | Browser | `.csv`, `.xlsx` | `.xlsx`, `.csv` | Interactive grid view and spreadsheet editor with Excel export. | **Verified & Functional** |
| `docx-merge` | Merge Word Documents | Browser | `.docx` (multiple) | `.docx` | Combines multiple Word documents into a unified `.docx` file. | **Verified & Functional** |

---

## 4. Video Tools (9 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `video-convert` | Convert Video Format | Server | `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov` | `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov` | Transcodes video to target format using FFmpeg libx264/libvpx-vp9 with safe parameters. | **Verified & Functional** |
| `video-compress` | Compress Video | Server | `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov` | `.mp4`, `.webm` | Constant Rate Factor (CRF 24-34) video compression with audio bitrate optimization. | **Verified & Functional** |
| `video-trim` | Trim Video | Server | `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov` | `.mp4`, `.webm` | Trims video by start time (`-ss`) and end time (`-to`). | **Verified & Functional** |
| `video-to-gif` | Video to GIF | Server | `.mp4`, `.webm`, `.mov` | `.gif` | High-quality animated GIF generator using two-pass palettegen/paletteuse filter. | **Verified & Functional** |
| `video-extract-audio` | Extract Audio from Video | Server | `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov` | `.mp3`, `.wav`, `.aac`, `.ogg` | Strips video stream (`-vn`) and encodes high-fidelity audio tracks. | **Verified & Functional** |
| `video-thumbnail` | Extract Thumbnail | Server | `.mp4`, `.webm`, `.mkv`, `.mov`, `.avi` | `.jpg`, `.png` | Grabs exact video frame at specified timestamp (`-vframes 1`). | **Verified & Functional** |
| `video-mute` | Remove Audio from Video | Server | `.mp4`, `.webm`, `.mkv`, `.mov`, `.avi` | `.mp4`, `.webm` | Strips audio stream (`-an`) with lossless video stream copy (`-c:v copy`). | **Verified & Functional** |
| `video-resize` | Change Resolution | Server | `.mp4`, `.webm`, `.mkv`, `.mov`, `.avi` | `.mp4`, `.webm` | Scales video to 1080p, 720p, 480p, or 360p while preserving aspect ratio. | **Verified & Functional** |
| `mp4-to-mp3` | MP4 to MP3 | Server | `.mp4` | `.mp3` | Direct extraction of audio from MP4 files to high-bitrate MP3 via `libmp3lame`. | **Verified & Functional** |

---

## 5. Audio Tools (7 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `audio-convert` | Convert Audio Format | Server | `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, `.m4a` | `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, `.m4a` | Audio transcoding to target format via FFmpeg encoders. | **Verified & Functional** |
| `audio-compress` | Compress Audio | Server | `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, `.m4a` | `.mp3`, `.aac`, `.ogg` | Bitrate reduction (64k, 96k, 128k, 192k) for optimized audio storage. | **Verified & Functional** |
| `audio-trim` | Trim Audio | Server | `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`, `.m4a` | `.mp3`, `.wav`, `.aac` | Precise audio segment extraction with start and end timestamps. | **Verified & Functional** |
| `audio-merge` | Merge Audio Tracks | Server | `.mp3`, `.wav`, `.aac`, `.ogg` (multiple) | `.mp3`, `.wav` | Concatenates multiple audio files using FFmpeg concat demuxer. | **Verified & Functional** |
| `audio-to-wav` | Convert Audio to WAV | Server | `.mp3`, `.aac`, `.ogg`, `.flac`, `.m4a` | `.wav` | Uncompressed PCM 16-bit stereo WAV conversion (`pcm_s16le`). | **Verified & Functional** |
| `audio-volume` | Adjust Audio Volume | Server | `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac` | `.mp3`, `.wav` | Amplifies or reduces volume in decibels (`volume=XdB`). | **Verified & Functional** |
| `audio-fade` | Fade In / Fade Out | Server | `.mp3`, `.wav`, `.aac`, `.ogg` | `.mp3`, `.wav` | Applies smooth audio fade-in and fade-out filters (`afade`). | **Verified & Functional** |

---

## 6. Archive Tools (2 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `zip-create` | Create ZIP Archive | Browser | Any files (multiple) | `.zip` | Assembles selected files into a compressed `.zip` archive via `jszip`. | **Verified & Functional** |
| `zip-extract` | Extract ZIP Archive | Browser | `.zip` | Multiple files | Decompresses ZIP archive, lists entries with sizes, and allows downloading extracted files. | **Verified & Functional** |

---

## 7. Utility Tools (6 Tools)

| ID | Title | Mode | Inputs | Outputs | Description & Implementation Details | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `file-hash` | File Hash Calculator | Browser | Any file | Display / Copy | Computes cryptographic SHA-256 and SHA-1 hashes via native `crypto.subtle`. | **Verified & Functional** |
| `json-formatter` | JSON Formatter & Validator | Browser | `.json` / Text | `.json` / Text | Beautifies, minifies, and validates JSON with syntax error reporting. | **Verified & Functional** |
| `csv-preview` | CSV Viewer & Converter | Browser | `.csv`, `.tsv` | `.json`, `.xlsx`, `.csv` | Tabular data viewer with instant JSON and spreadsheet conversions. | **Verified & Functional** |
| `base64-encode` | Base64 Encoder / Decoder | Browser | Any file / Text | `.txt` / Display | Converts binary files to Data URLs / Base64 strings and vice versa. | **Verified & Functional** |
| `yaml-formatter` | YAML Formatter & Validator | Browser | `.yaml`, `.yml`, `.json` | `.yaml`, `.json` | Validates YAML, formats indentation, and converts between YAML and JSON. | **Verified & Functional** |
| `file-metadata` | File Metadata Inspector | Browser | Any file | Display | Inspects file byte size, MIME type, last modified date, and magic byte hex signature. | **Verified & Functional** |
