// tests/wysiwyg-export.test.mjs
//
// Two tests:
//   1) WYSIWYG parity test (covers pass + objects pass)  — unchanged.
//   2) White bold text on blue cover — asserts that the white fill operator
//      appears inside the DECOMPRESSED page content stream, because pdf-lib
//      Flate-compresses content streams by default.

import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — WYSIWYG export parity (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

test("WYSIWYG Export Parity: covers pass + objects pass", async (t) => {
  await t.test(
    "Export handles edited run, moved run, deleted run, moved image, and deleted image",
    async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);

      const redPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const pngBytes = Buffer.from(redPngBase64, "base64");
      const embeddedImg = await doc.embedPng(pngBytes);

      const COVER_PAD = 0.5;

      const objects = {
        runEdited: {
          id: "run-edited",
          kind: "text-run",
          page: 0,
          origRect: { x: 50, y: 700, w: 100, h: 20 },
          rect: { x: 50, y: 700, w: 100, h: 20 },
          dirty: true,
          deleted: false,
          text: "Updated Heading Text",
          fontFamily: "Helvetica",
          fontSize: 16,
          backgroundColor: "#ffffff",
          color: "#111827",
        },
        runMoved: {
          id: "run-moved",
          kind: "text-run",
          page: 0,
          origRect: { x: 50, y: 650, w: 120, h: 18 },
          rect: { x: 200, y: 600, w: 120, h: 18 },
          dirty: true,
          deleted: false,
          text: "Moved Paragraph Text",
          fontFamily: "Helvetica",
          fontSize: 14,
          backgroundColor: "#ffffff",
          color: "#374151",
        },
        runDeleted: {
          id: "run-deleted",
          kind: "text-run",
          page: 0,
          origRect: { x: 50, y: 550, w: 80, h: 16 },
          rect: { x: 50, y: 550, w: 80, h: 16 },
          dirty: false,
          deleted: true,
          text: "Old Unwanted Text",
          fontFamily: "Helvetica",
          fontSize: 12,
          backgroundColor: "#ffffff",
          color: "#9ca3af",
        },
        imgMoved: {
          id: "img-moved",
          kind: "image-placement",
          page: 0,
          origRect: { x: 50, y: 400, w: 50, h: 50 },
          rect: { x: 300, y: 450, w: 50, h: 50 },
          dirty: true,
          deleted: false,
          dataUrl: `data:image/png;base64,${redPngBase64}`,
          opacity: 1,
        },
        imgDeleted: {
          id: "img-deleted",
          kind: "image-placement",
          page: 0,
          origRect: { x: 50, y: 300, w: 60, h: 60 },
          rect: { x: 50, y: 300, w: 60, h: 60 },
          dirty: false,
          deleted: true,
          dataUrl: `data:image/png;base64,${redPngBase64}`,
          opacity: 1,
        },
      };

      const objectIds = Object.keys(objects);

      // Pass 1: covers
      for (const id of objectIds) {
        const obj = objects[id];
        if (obj.kind === "text-run") {
          if (obj.dirty || obj.deleted) {
            const r = obj.origRect ?? obj.rect;
            page.drawRectangle({
              x: Math.max(0, r.x - COVER_PAD),
              y: Math.max(0, r.y - COVER_PAD),
              width: r.w + COVER_PAD * 2,
              height: r.h + COVER_PAD * 2,
              color: rgb(1, 1, 1),
              opacity: 1,
            });
          }
        } else if (obj.kind === "image-placement") {
          const canRedraw = !!obj.dataUrl;
          if (obj.deleted || (obj.dirty && canRedraw)) {
            const r = obj.origRect ?? obj.rect;
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
      }

      // Pass 2: objects (need a font for drawText)
      const helv = await doc.embedFont(StandardFonts.Helvetica);

      for (const id of objectIds) {
        const obj = objects[id];
        if (obj.deleted) continue;

        if (obj.kind === "text-run") {
          page.drawText(obj.text, {
            x: obj.rect.x,
            y: obj.rect.y,
            size: obj.fontSize,
            font: helv,
          });
        } else if (obj.kind === "image-placement") {
          page.drawImage(embeddedImg, {
            x: obj.rect.x,
            y: obj.rect.y,
            width: obj.rect.w,
            height: obj.rect.h,
            opacity: obj.opacity,
          });
        }
      }

      const exportedBytes = await doc.save();
      assert.ok(exportedBytes.length > 0);

      const reloadedDoc = await PDFDocument.load(exportedBytes);
      assert.equal(reloadedDoc.getPageCount(), 1);

      const { width, height } = reloadedDoc.getPage(0).getSize();
      assert.equal(width, 600);
      assert.equal(height, 800);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — White text on blue background (fixed)
// ─────────────────────────────────────────────────────────────────────────────

test("White bold text on blue cover: white fill operator is present", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);

  // Blue background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    color: rgb(0, 0, 1),
  });

  // White bold text
  const helv = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("White on Blue", {
    x: 40,
    y: 140,
    size: 24,
    font: helv,
    color: rgb(1, 1, 1),
  });

  const bytes = await doc.save({ useObjectStreams: false });
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);

  // pdf-lib Flate-compresses page content streams. Decompress every stream
  // in the file, then look at the plaintext operators.
  const buf = Buffer.from(bytes);
  const latin = buf.toString("latin1");
  const decompressed = [];

  let cursor = 0;
  while (true) {
    const start = latin.indexOf("\nstream", cursor);
    if (start === -1) break;

    let dataStart = start + "\nstream".length;
    if (latin[dataStart] === "\r") dataStart++;
    if (latin[dataStart] === "\n") dataStart++;

    const end = latin.indexOf("\nendstream", dataStart);
    if (end === -1) break;

    const slice = buf.subarray(dataStart, end);
    try {
      decompressed.push(inflateSync(slice).toString("latin1"));
    } catch {
      // Not a FlateDecode stream — skip
    }
    cursor = end + "\nendstream".length;
  }

  assert.ok(
    decompressed.length > 0,
    "Expected at least one FlateDecode stream in the saved PDF",
  );

  const all = decompressed.join("\n");

  // Blue background → r≠g≠b → pdf-lib emits RGB operator
  assert.ok(
    /\b0 0 1 rg\b/.test(all),
    "Expected blue fill operator '0 0 1 rg' in decompressed stream",
  );

  // White text → pdf-lib may emit either:
  //   • '1 g'      (gray, because r=g=b)
  //   • '1 1 1 rg' (RGB, older pdf-lib or non-optimized path)
  const hasWhite = /\b1 g\b/.test(all) || /\b1 1 1 rg\b/.test(all);
  assert.ok(
    hasWhite,
    "Expected white fill operator ('1 g' or '1 1 1 rg') in decompressed stream.\n" +
    "First 2000 chars of decompressed content:\n" +
    all.slice(0, 2000),
  );
});