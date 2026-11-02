    // src/lib/pdf-editor/export.ts
    // Serialise the editor's model into a real PDF using pdf-lib.

    import {
    PDFDocument,
    rgb,
    degrees,
    StandardFonts,
    PDFPage,
    PDFImage,
    BlendMode,
    } from "pdf-lib";
    import type {
    ExportOptions,
    ImagePlacementObject,
    PDFObject,
    PageInfo,
    PageOp,
    DrawObject,
    ShapeObject,
    NewTextObject,
    TextRunObject,
    StyledTextRun,
    LinkObject,
    NoteObject,
    StampObject,
    SignatureObject,
    CheckmarkObject,
    HighlightObject,
    UnderlineObject,
    StrikeObject,
    WhiteoutObject,
    RedactObject,
    NewImageObject,
    OverlaySettings,
    } from "./types";
    import {
    resolveFontForRun,
    hexToRgbTriplet,
    type UploadedPdfFont,
    } from "./fonts";
    import { applyPageOps } from "./page-ops";
    import { getOverlayRects, DEFAULT_OVERLAYS } from "./overlay-layout";

    interface ExportInput {
    originalBytes: Uint8Array;
    pages: PageInfo[];
    objects: Record<string, PDFObject>;
    pageObjectIds: string[][];
    pageOps: PageOp[];
    overlays: OverlaySettings;
    options: ExportOptions;
    uploadedFonts?: Record<string, UploadedPdfFont>;
    }

    /** Top-level entry point. Returns the bytes of the final PDF. */
    export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
    const { originalBytes, pages, objects, pageObjectIds, pageOps } = input;

    const overlays = input.overlays ?? DEFAULT_OVERLAYS;
    const options = input.options ?? {
        pageRange: "all",
        flatten: false,
        compress: true,
        requestedPassword: null,
    };

    // 1. Load source.
    const src = await PDFDocument.load(originalBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
    });

    // 2. Apply page ops in the model first (so page indices line up).
    const model = applyPageOps({ pages, pageObjectIds, objects }, pageOps);
    const finalPages = model.pages;
    const finalPageIds = model.pageObjectIds;
    const finalObjects = model.objects;

    // 3. Build target document.
    let target: PDFDocument;
    const hasStructuralOps = pageOps.some(
        (op) =>
        op.op === "move" ||
        op.op === "delete" ||
        op.op === "duplicate" ||
        op.op === "insert-blank" ||
        op.op === "extract" ||
        op.op === "merge",
    );

    const srcPageCount = src.getPageCount();

    const isIdentity =
        finalPages.length === srcPageCount &&
        finalPages.every((p, i) => p.index === i);

    if (!hasStructuralOps && isIdentity) {
        target = src;
    } else {
        target = await PDFDocument.create();

        const srcIndices = finalPages.map((p) => p.index); // -1 = blank
        const firstPos = new Map<number, number>();
        const unique: number[] = [];

        for (const idx of srcIndices) {
        if (idx >= 0 && idx < srcPageCount && !firstPos.has(idx)) {
            firstPos.set(idx, unique.length);
            unique.push(idx);
        }
        }

        const bulk = unique.length ? await target.copyPages(src, unique) : [];
        const used = new Set<number>();

        for (let i = 0; i < finalPages.length; i++) {
        const idx = srcIndices[i];
        if (idx >= 0 && idx < srcPageCount) {
            if (!used.has(idx)) {
            used.add(idx);
            target.addPage(bulk[firstPos.get(idx)!]);
            } else {
            const [dup] = await target.copyPages(src, [idx]);
            target.addPage(dup);
            }
        } else {
            target.addPage([finalPages[i].widthPt, finalPages[i].heightPt]);
        }
        }

        // 4. Merge appended bytes, if any.
        for (const op of pageOps) {
        if (op.op === "merge") {
            const appended = await PDFDocument.load(op.appendedBytes, {
            ignoreEncryption: true,
            });
            const copiedAppended = await target.copyPages(
            appended,
            appended.getPageIndices(),
            );
            copiedAppended.forEach((p) => target.addPage(p));
        }
        }
    }

    // 5. Apply rotation from the model.
    const targetPages = target.getPages();
    for (let i = 0; i < finalPages.length && i < targetPages.length; i++) {
        const want = finalPages[i].rotation;
        const cur = targetPages[i].getRotation().angle % 360;
        const delta = (want - cur + 360) % 360;
        if (delta !== 0) {
        targetPages[i].setRotation(degrees((cur + delta) % 360));
        }
    }

    // 6. Draw objects and overlays per page.
    for (let pageIdx = 0; pageIdx < finalPages.length; pageIdx++) {
        const page = targetPages[pageIdx];
        if (!page) continue;
        const ids = finalPageIds[pageIdx] ?? [];

        // Pass 1: cover ORIGINAL content of edited/moved/deleted items
        for (const id of ids) {
        const obj = finalObjects[id];
        if (obj) drawCover(page, obj, finalPages[pageIdx]);
        }

        // Pass 2: draw new content
        for (const id of ids) {
        const obj = finalObjects[id];
        if (!obj) continue;
        await drawObject(
        target,
        page,
        obj,
        finalPages[pageIdx],
        input.uploadedFonts ?? {},
        );
        }

        // Pass 3: draw overlays (Header, Footer, Watermark, Page Numbers)
        const overlayRects = getOverlayRects(
        overlays,
        finalPages[pageIdx],
        pageIdx,
        finalPages.length,
        );
        for (const r of overlayRects) {
        if (!r.text) continue;

        const font = await target.embedFont(StandardFonts.Helvetica);
        const textW = font.widthOfTextAtSize(r.text, r.fontSize);
        const [cr, cg, cb] = hexToRgbTriplet(r.color);
        const color = rgb(cr, cg, cb);

        let x = r.rect.x;
        if (r.align === "center") x += (r.rect.w - textW) / 2;
        else if (r.align === "right") x += r.rect.w - textW;

        const y = r.rect.y + r.rect.h / 2 - r.fontSize / 3;

        page.drawText(r.text, {
            x,
            y,
            size: r.fontSize,
            font,
            color,
            opacity: r.opacity,
            rotate: degrees(r.rotation),
        });
        }
    }

    // 7. Optional page-range crop on output.
    if (options.pageRange !== "all") {
        const { from, to } = options.pageRange;
        const total = target.getPageCount();
        const start = Math.max(0, Math.min(total - 1, from - 1));
        const end = Math.max(start, Math.min(total - 1, to - 1));
        if (start !== 0 || end !== total - 1) {
        const trimmed = await PDFDocument.create();
        const indices = [];
        for (let i = start; i <= end; i++) indices.push(i);
        const copied = await trimmed.copyPages(target, indices);
        copied.forEach((p) => trimmed.addPage(p));
        return trimmed.save({ useObjectStreams: options.compress });
        }
    }

    return target.save({ useObjectStreams: options.compress });
    }

    /* ───────────── Helpers ───────────── */

    async function drawObject(
    doc: PDFDocument,
    page: PDFPage,
    obj: PDFObject,
    pageInfo: PageInfo,
    uploadedFonts: Record<string, UploadedPdfFont>,
    ): Promise<void> {
    switch (obj.kind) {
        case "text-run":
        return drawTextRun(doc, page, obj, pageInfo, uploadedFonts);
        case "new-text":
        return drawNewText(doc, page, obj, uploadedFonts);
        case "image-placement":
        return drawImagePlacement(doc, page, obj);
        case "new-image":
        return drawNewImage(doc, page, obj);
        case "shape":
        return drawShape(page, obj);
        case "draw":
        return drawFreehand(page, obj);
        case "highlight":
        return drawHighlight(page, obj);
        case "underline":
        return drawUnderline(page, obj);
        case "strike":
        return drawStrike(page, obj);
        case "whiteout":
        return drawWhiteout(page, obj);
        case "redact":
        return drawRedact(page, obj);
        case "signature":
        return drawSignature(doc, page, obj);
        case "link":
        return drawLink(page, obj);
        case "note":
        return drawNote(page, obj);
        case "stamp":
        return drawStamp(page, obj);
        case "checkmark":
        return drawCheckmark(page, obj);
        default:
        return;
    }
    }

    /* ───────────── Text ───────────── */

    type ResolvedFontInfo = Awaited<ReturnType<typeof resolveFontForRun>>;

    /**
     * A single effective text segment after inheriting everything that a
     * `StyledTextRun` leaves undefined from its containing text object. Used by
     * the mixed-style renderer so per-character styling decisions only have to
     * look at one shape.
     */
    interface EffectiveTextSegment {
    text: string;
    font: ResolvedFontInfo;
    underline: boolean;
    strike: boolean;
    fontSize: number;
    colorR: number;
    colorG: number;
    colorB: number;
    letterSpacing: number;
    }

    /**
     * Build the ordered list of effective segments for a text object.
     *
     * - When `obj.runs` is present and non-empty, each styled run becomes its own
     *   effective segment: any property the run leaves `undefined` inherits from
     *   the object-level `obj` field, which is the legacy/plain-text formatting
     *   that used to apply to the whole object.
     * - When `obj.runs` is absent (legacy object) or empty, a single segment is
     *   built entirely from the object-level fields — behaviour identical to the
     *   pre-run export.
     * - Empty segments (text === "") are skipped, so a split-and-merge cycle that
     *   leaves a zero-length run doesn't produce ghost draws. Fully-empty text
     *   yields an empty list, and the caller short-circuits.
     *
     * The order of `obj.runs` is preserved exactly — no reordering, no merging.
     */
    async function buildEffectiveSegments(
    doc: PDFDocument,
    obj: TextRunObject | NewTextObject,
    uploadedFonts: Record<string, UploadedPdfFont>,
    ): Promise<EffectiveTextSegment[]> {
    const source: StyledTextRun[] =
        obj.runs && obj.runs.length > 0 ? obj.runs : [{ text: obj.text }];

    const result: EffectiveTextSegment[] = [];
    for (const seg of source) {
        if (seg.text.length === 0) continue;

        const bold = seg.bold ?? obj.bold;
        const italic = seg.italic ?? obj.italic;
        const underline = seg.underline ?? obj.underline;
        const strike = seg.strike ?? obj.strike ?? false;
        const fontFamily = seg.fontFamily ?? obj.fontFamily;
        const fontSize = seg.fontSize ?? obj.fontSize;
        const colorHex = seg.color ?? obj.color;
        const letterSpacing = seg.letterSpacing ?? obj.letterSpacing;
        const uploadedFont = uploadedFonts[fontFamily];
        if (fontFamily.endsWith(" (Imported)") && !uploadedFont) {
        throw new Error(
            `The imported font "${fontFamily}" is unavailable. Re-import it before exporting this document.`,
        );
        }

        const resolved = await resolveFontForRun(doc, {
        fontFamily,
        bold,
        italic,
        text: seg.text,
        uploadedFont,
        });
        const [cr, cg, cb] = hexToRgbTriplet(colorHex);

        result.push({
        text: seg.text,
        font: resolved,
        underline,
        strike,
        fontSize,
        colorR: cr,
        colorG: cg,
        colorB: cb,
        letterSpacing,
        });
    }
    return result;
    }

    /**
     * Render a text object that may mix regular, bold, italic, underline and
     * strike through segments. Wraps the combined text against `rect.w` at word
     * boundaries, then draws each visual group with its own font, size, colour,
     * and decorations. Positions the text inside `rect` following the object's
     * own `align`, `lineHeight`, and `opacity`.
     */
    async function drawMixedText(
    doc: PDFDocument,
    page: PDFPage,
    obj: TextRunObject | NewTextObject,
    rect: { x: number; y: number; w: number; h: number },
    uploadedFonts: Record<string, UploadedPdfFont>,
    ): Promise<void> {
    const segments = await buildEffectiveSegments(doc, obj, uploadedFonts);
    if (segments.length === 0) return;

    // Flatten to per-character run indices so we can walk the combined text in
    // order and ask "which segment does char i belong to?".
    const characters: string[] = [];
    const charRun: number[] = [];
    for (let ri = 0; ri < segments.length; ri++) {
        for (const character of segments[ri].text) {
        characters.push(character);
        charRun.push(ri);
        }
    }
    if (characters.length === 0) return;

    // Line height and baseline follow the object-level font size (so layout is
    // stable even if a segment overrides `fontSize`). This matches the previous
    // single-style behaviour.
    const lineH = obj.fontSize * (obj.lineHeight || 1.2);
    const baselineOffset = obj.kind === "text-run" ? 1.0 : 0.85;
    const baselineY = rect.y + rect.h - obj.fontSize * baselineOffset;
    const radians = (obj.rotation * Math.PI) / 180;
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const transformPoint = (point: { x: number; y: number }) => ({
        x:
        center.x +
        Math.cos(radians) * (point.x - center.x) -
        Math.sin(radians) * (point.y - center.y),
        y:
        center.y +
        Math.sin(radians) * (point.x - center.x) +
        Math.cos(radians) * (point.y - center.y),
    });

    const lines = wrapMixedText(characters, charRun, segments, rect.w);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineChars = lines[lineIdx];
        if (lineChars.length === 0) continue;
        const y = baselineY - lineIdx * lineH;

        // Total line width including per-character letter spacing.
        let totalW = 0;
        for (let lineIdx = 0; lineIdx < lineChars.length; lineIdx++) {
        const ci = lineChars[lineIdx];
        const seg = segments[charRun[ci]];
        totalW +=
            seg.font.widthOfTextAtSize(characters[ci], seg.fontSize) +
            (lineIdx < lineChars.length - 1 ? seg.letterSpacing : 0);
        }

        let startX = rect.x;
        if (obj.align === "center") startX = rect.x + (rect.w - totalW) / 2;
        else if (obj.align === "right") startX = rect.x + rect.w - totalW;

        let curX = startX;
        let i = 0;
        while (i < lineChars.length) {
        const groupRunIdx = charRun[lineChars[i]];
        const seg = segments[groupRunIdx];

        // Collect the largest run of chars on this line that share the same
        // effective segment — that becomes a single drawText call.
        let groupText = "";
        let groupCharacterCount = 0;
        while (i < lineChars.length && charRun[lineChars[i]] === groupRunIdx) {
            groupText += characters[lineChars[i]];
            groupCharacterCount++;
            i++;
        }
        if (groupText.length === 0) continue;

        const color = rgb(seg.colorR, seg.colorG, seg.colorB);
        const textW = seg.font.widthOfTextAtSize(groupText, seg.fontSize);
        let groupWidth = 0;
        for (const character of groupText) {
            groupWidth += seg.font.widthOfTextAtSize(character, seg.fontSize);
        }
        const hasFollowingCharacter = i < lineChars.length;
        const advanceW =
            groupWidth +
            seg.letterSpacing *
            (groupCharacterCount - (hasFollowingCharacter ? 0 : 1));
        const textPoint = transformPoint({ x: curX, y });

        if (seg.letterSpacing === 0) {
            page.drawText(groupText, {
            x: textPoint.x,
            y: textPoint.y,
            size: seg.fontSize,
            font: seg.font.font,
            color,
            opacity: obj.opacity,
            rotate: degrees(obj.rotation),
            });
        } else {
            let glyphX = curX;
            for (const character of groupText) {
            const glyphPoint = transformPoint({ x: glyphX, y });
            page.drawText(character, {
                x: glyphPoint.x,
                y: glyphPoint.y,
                size: seg.fontSize,
                font: seg.font.font,
                color,
                opacity: obj.opacity,
                rotate: degrees(obj.rotation),
            });
            glyphX +=
                seg.font.widthOfTextAtSize(character, seg.fontSize) +
                seg.letterSpacing;
            }
        }

        if (seg.underline) {
            const from = transformPoint({
            x: curX,
            y: y - seg.fontSize * 0.12,
            });
            const to = transformPoint({
            x:
                curX +
                textW +
                seg.letterSpacing * Math.max(0, groupCharacterCount - 1),
            y: y - seg.fontSize * 0.12,
            });
            page.drawLine({
            start: from,
            end: to,
            thickness: Math.max(0.5, seg.fontSize * 0.06),
            color,
            opacity: obj.opacity,
            });
        }
        if (seg.strike) {
            const from = transformPoint({
            x: curX,
            y: y + seg.fontSize * 0.3,
            });
            const to = transformPoint({
            x:
                curX +
                textW +
                seg.letterSpacing * Math.max(0, groupCharacterCount - 1),
            y: y + seg.fontSize * 0.3,
            });
            page.drawLine({
            start: from,
            end: to,
            thickness: Math.max(0.5, seg.fontSize * 0.06),
            color,
            opacity: obj.opacity,
            });
        }

        curX += advanceW;
        }
    }
    }

    /**
     * Word-wrap mixed-style text. Returns a list of lines, each line being the
     * ordered list of character indices that appear on that line. Whitespace at
     * the start of a wrapped line is skipped, and long words are never split
     * mid-glyph — they simply occupy their own line if they don't fit.
     */
    function wrapMixedText(
    text: string[],
    charRun: number[],
    segments: EffectiveTextSegment[],
    maxWidth: number,
    ): number[][] {
    if (text.length === 0) return [[]];

    const advanceAt = (idx: number): number => {
        const seg = segments[charRun[idx]];
        return (
        seg.font.widthOfTextAtSize(text[idx], seg.fontSize) + seg.letterSpacing
        );
    };

    // Tokenise into alternating word / whitespace blocks.
    interface Token {
        indices: number[];
        isWhitespace: boolean;
        lineBreak?: boolean;
    }
    const tokens: Token[] = [];
    let bucket: number[] = [];
    let bucketIsWs = false;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n" || text[i] === "\r") {
        if (bucket.length > 0) {
            tokens.push({ indices: bucket, isWhitespace: bucketIsWs });
            bucket = [];
        }
        if (text[i] === "\r" && text[i + 1] === "\n") i++;
        tokens.push({ indices: [], isWhitespace: true, lineBreak: true });
        continue;
        }
        const ws = /\s/.test(text[i]);
        if (bucket.length === 0) {
        bucketIsWs = ws;
        bucket.push(i);
        } else if (ws === bucketIsWs) {
        bucket.push(i);
        } else {
        tokens.push({ indices: bucket, isWhitespace: bucketIsWs });
        bucket = [i];
        bucketIsWs = ws;
        }
    }
    if (bucket.length > 0) {
        tokens.push({ indices: bucket, isWhitespace: bucketIsWs });
    }

    const lines: number[][] = [];
    let current: number[] = [];
    let currentW = 0;

    for (const tok of tokens) {
        if (tok.lineBreak) {
        lines.push(current);
        current = [];
        currentW = 0;
        continue;
        }
        let tokW = 0;
        for (const idx of tok.indices) tokW += advanceAt(idx);

        // Wrap before a non-whitespace token that no longer fits on a line that
        // already has content. Whitespace always attaches to the current line
        // rather than forcing a fresh one.
        if (current.length > 0 && currentW + tokW > maxWidth && !tok.isWhitespace) {
        lines.push(current);
        current = [];
        currentW = 0;
        }

        // Drop leading whitespace on a freshly wrapped line.
        if (tok.isWhitespace && current.length === 0) continue;

        for (const idx of tok.indices) current.push(idx);
        currentW += tokW;
    }
    if (
        current.length > 0 ||
        lines.length === 0 ||
        tokens[tokens.length - 1]?.lineBreak
    ) {
        lines.push(current);
    }

    return lines.length > 0 ? lines : [[]];
    }

    async function drawTextRun(
    doc: PDFDocument,
    page: PDFPage,
    run: TextRunObject,
    pageInfo: PageInfo,
    uploadedFonts: Record<string, UploadedPdfFont>,
    ): Promise<void> {
    if (!run.dirty || run.deleted) return;
    const rect = clampRect(run.rect, pageInfo);
    await drawMixedText(doc, page, run, rect, uploadedFonts);
    }

    async function drawNewText(
    doc: PDFDocument,
    page: PDFPage,
    obj: NewTextObject,
    uploadedFonts: Record<string, UploadedPdfFont>,
    ): Promise<void> {
    const rect = obj.rect;
    await drawMixedText(doc, page, obj, rect, uploadedFonts);
    }

    function clampRect(
    rect: { x: number; y: number; w: number; h: number },
    page: PageInfo,
    ) {
    const w = Math.max(1, Math.min(rect.w, page.widthPt));
    const h = Math.max(1, Math.min(rect.h, page.heightPt));
    const x = Math.max(0, Math.min(rect.x, page.widthPt - w));
    const y = Math.max(0, Math.min(rect.y, page.heightPt - h));
    return { x, y, w, h };
    }

    /* ───────────── Images ───────────── */

    async function preCropImage(
    src: string,
    crop: { l: number; t: number; r: number; b: number },
    ): Promise<string> {
    if (typeof document === "undefined") return src;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
        const cw = img.width * (1 - crop.l - crop.r);
        const ch = img.height * (1 - crop.t - crop.b);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(
            img,
            img.width * crop.l,
            img.height * crop.t,
            cw,
            ch,
            0,
            0,
            cw,
            ch,
        );
        resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });
    }

    async function drawImagePlacement(
    doc: PDFDocument,
    page: PDFPage,
    obj: ImagePlacementObject,
    ): Promise<void> {
    if (!obj.dirty || obj.deleted) return;
    let src = obj.replacementDataUrl ?? obj.dataUrl;
    if (!src) return;

    if (
        obj.crop &&
        (obj.crop.l > 0 || obj.crop.t > 0 || obj.crop.r > 0 || obj.crop.b > 0)
    ) {
        src = await preCropImage(src, obj.crop);
    }

    const img = await embedImageFromDataUrl(doc, src);
    if (!img) return;

    page.drawImage(img, {
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        opacity: obj.opacity,
    });
    }

    const COVER_PAD = 0.5; // pt padding each side to hide anti-aliased edges

    function drawCover(page: PDFPage, obj: PDFObject, pageInfo: PageInfo): void {
    if (obj.kind === "text-run") {
        if (!obj.dirty && !obj.deleted) return;
        const r = clampRect(obj.origRect ?? obj.rect, pageInfo);
        const [br, bg, bb] = hexToRgbTriplet(obj.backgroundColor || "#ffffff");
        page.drawRectangle({
        x: Math.max(0, r.x - COVER_PAD),
        y: Math.max(0, r.y - COVER_PAD),
        width: r.w + COVER_PAD * 2,
        height: r.h + COVER_PAD * 2,
        color: rgb(br, bg, bb),
        opacity: 1,
        });
    } else if (obj.kind === "image-placement") {
        const canRedraw = !!(obj.replacementDataUrl ?? obj.dataUrl);
        if (!obj.deleted && !(obj.dirty && canRedraw)) return;
        const r = clampRect(obj.origRect ?? obj.rect, pageInfo);
        page.drawRectangle({
        x: Math.max(0, r.x - COVER_PAD),
        y: Math.max(0, r.y - COVER_PAD),
        width: r.w + COVER_PAD * 2,
        height: r.h + COVER_PAD * 2,
        color: rgb(1, 1, 1),
        opacity: 1,
        });
    }
    }

    async function drawNewImage(
    doc: PDFDocument,
    page: PDFPage,
    obj: NewImageObject,
    ): Promise<void> {
    const img = await embedImageFromDataUrl(doc, obj.dataUrl);
    if (!img) return;
    page.drawImage(img, {
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        opacity: obj.opacity,
        rotate: degrees(obj.rotation),
    });
    }

    async function embedImageFromDataUrl(
    doc: PDFDocument,
    dataUrl: string,
    ): Promise<PDFImage | null> {
    try {
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return null;
        const mime = m[1];
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (mime === "image/png") return await doc.embedPng(bytes);
        if (mime === "image/jpeg" || mime === "image/jpg")
        return await doc.embedJpg(bytes);
        return await doc.embedPng(bytes);
    } catch {
        return null;
    }
    }

    /* ───────────── Shapes ───────────── */

    function drawShape(page: PDFPage, obj: ShapeObject): void {
    const { x, y, w, h } = obj.rect;
    const [sr, sg, sb] = hexToRgbTriplet(obj.stroke);
    const strokeColor = rgb(sr, sg, sb);
    const fillColor = obj.fill ? rgb(...hexToRgbTriplet(obj.fill)) : undefined;

    if (obj.shape === "rect") {
        page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: strokeColor,
        borderWidth: obj.strokeWidth,
        color: fillColor,
        opacity: obj.opacity,
        borderOpacity: obj.opacity,
        });
    } else if (obj.shape === "ellipse") {
        page.drawEllipse({
        x: x + w / 2,
        y: y + h / 2,
        xScale: w / 2,
        yScale: h / 2,
        borderColor: strokeColor,
        borderWidth: obj.strokeWidth,
        color: fillColor,
        opacity: obj.opacity,
        borderOpacity: obj.opacity,
        });
    } else if (obj.shape === "line") {
        page.drawLine({
        start: { x, y },
        end: { x: x + w, y: y + h },
        thickness: obj.strokeWidth,
        color: strokeColor,
        opacity: obj.opacity,
        });
    } else if (obj.shape === "arrow") {
        page.drawLine({
        start: { x, y },
        end: { x: x + w, y: y + h },
        thickness: obj.strokeWidth,
        color: strokeColor,
        opacity: obj.opacity,
        });
        const angle = Math.atan2(h, w);
        const headLen = Math.min(16, Math.hypot(w, h) / 3);
        for (const off of [Math.PI * 0.85, -Math.PI * 0.85]) {
        page.drawLine({
            start: { x: x + w, y: y + h },
            end: {
            x: x + w + Math.cos(angle + off) * headLen,
            y: y + h + Math.sin(angle + off) * headLen,
            },
            thickness: obj.strokeWidth,
            color: strokeColor,
            opacity: obj.opacity,
        });
        }
    }
    }

    /* ───────────── Freehand ───────────── */

    function drawFreehand(page: PDFPage, obj: DrawObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.stroke);
    const color = rgb(r, g, b);
    for (const stroke of obj.strokes) {
        if (stroke.points.length < 2) continue;
        for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1];
        const c = stroke.points[i];
        page.drawLine({
            start: {
            x: obj.rect.x + a[0] * obj.rect.w,
            y: obj.rect.y + a[1] * obj.rect.h,
            },
            end: {
            x: obj.rect.x + c[0] * obj.rect.w,
            y: obj.rect.y + c[1] * obj.rect.h,
            },
            thickness: obj.strokeWidth,
            color,
            opacity: obj.opacity,
        });
        }
    }
    }

    /* ───────────── Annotation overlays ───────────── */

    function drawHighlight(page: PDFPage, obj: HighlightObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);

    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        color: rgb(r, g, b),
        opacity: Math.min(0.6, obj.opacity * 0.6),
        blendMode: BlendMode.Multiply,
    });
    }
    function drawUnderline(page: PDFPage, obj: UnderlineObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawLine({
        start: { x: obj.rect.x, y: obj.rect.y },
        end: { x: obj.rect.x + obj.rect.w, y: obj.rect.y },
        thickness: obj.strokeWidth,
        color: rgb(r, g, b),
        opacity: obj.opacity,
    });
    }
    function drawStrike(page: PDFPage, obj: StrikeObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawLine({
        start: { x: obj.rect.x, y: obj.rect.y + obj.rect.h / 2 },
        end: { x: obj.rect.x + obj.rect.w, y: obj.rect.y + obj.rect.h / 2 },
        thickness: obj.strokeWidth,
        color: rgb(r, g, b),
        opacity: obj.opacity,
    });
    }
    function drawWhiteout(page: PDFPage, obj: WhiteoutObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        color: rgb(r, g, b),
        opacity: 1,
    });
    }
    function drawRedact(page: PDFPage, obj: RedactObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        color: rgb(r, g, b),
        opacity: 1,
    });
    }
    async function drawSignature(
    doc: PDFDocument,
    page: PDFPage,
    obj: SignatureObject,
    ): Promise<void> {
    const img = await embedImageFromDataUrl(doc, obj.dataUrl);
    if (!img) return;
    page.drawImage(img, {
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        opacity: obj.opacity,
        rotate: degrees(obj.rotation),
    });
    }
    function drawLink(page: PDFPage, obj: LinkObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        borderColor: rgb(r, g, b),
        borderWidth: 1,
        opacity: 0,
        borderOpacity: 1,
    });
    }
    function drawNote(page: PDFPage, obj: NoteObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        color: rgb(r, g, b),
        opacity: Math.min(0.35, obj.opacity),
        borderColor: rgb(r * 0.5, g * 0.5, b * 0.5),
        borderWidth: 1,
    });
    }
    function drawStamp(page: PDFPage, obj: StampObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    page.drawRectangle({
        x: obj.rect.x,
        y: obj.rect.y,
        width: obj.rect.w,
        height: obj.rect.h,
        borderColor: rgb(r, g, b),
        borderWidth: 2,
        opacity: 0,
    });
    }
    function drawCheckmark(page: PDFPage, obj: CheckmarkObject): void {
    const [r, g, b] = hexToRgbTriplet(obj.color);
    const { x, y, w, h } = obj.rect;
    page.drawLine({
        start: { x: x + w * 0.2, y: y + h * 0.5 },
        end: { x: x + w * 0.45, y: y + h * 0.25 },
        thickness: 2,
        color: rgb(r, g, b),
        opacity: obj.opacity,
    });
    page.drawLine({
        start: { x: x + w * 0.45, y: y + h * 0.25 },
        end: { x: x + w * 0.85, y: y + h * 0.8 },
        thickness: 2,
        color: rgb(r, g, b),
        opacity: obj.opacity,
    });
    }
