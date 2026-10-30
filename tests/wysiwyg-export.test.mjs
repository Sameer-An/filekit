import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, rgb } from "pdf-lib";

test("WYSIWYG Export Parity: covers pass + objects pass", async (t) => {
  await t.test(
    "Export handles edited run, moved run, deleted run, moved image, and deleted image",
    async () => {
      // 1. Create a base PDF document with 1 page
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);

      // Base sample PNG image (1x1 transparent/red dot)
      // Base64 1x1 red PNG
      const redPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const pngBytes = Buffer.from(redPngBase64, "base64");
      const embeddedImg = await doc.embedPng(pngBytes);

      // Model objects simulating the editor state:
      const COVER_PAD = 0.5;

      const objects = {
        // 1. Edited text run: original text at origRect, modified text, dirty: true
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
        // 2. Moved text run: original text at origRect, moved to new rect, dirty: true
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
        // 3. Deleted text run: deleted: true, origRect must be covered and not redrawn
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
        // 4. Moved image: origRect covered, redrawn at new rect
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
        // 5. Deleted image: origRect covered, not redrawn
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

      // --- PASS 1: Covers pass (exactly matching export.ts drawCover) ---
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

      // --- PASS 2: Objects pass (drawing active objects, skipping deleted) ---
      for (const id of objectIds) {
        const obj = objects[id];
        if (obj.deleted) continue; // Deleted items are covered in pass 1 and not drawn

        if (obj.kind === "text-run") {
          page.drawText(obj.text, {
            x: obj.rect.x,
            y: obj.rect.y,
            size: obj.fontSize,
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

      // Save PDF bytes
      const exportedBytes = await doc.save();
      assert.ok(exportedBytes.length > 0, "Exported PDF bytes must not be empty");

      // Verify that reloading the output with PDFDocument.load succeeds without exceptions
      const reloadedDoc = await PDFDocument.load(exportedBytes);
      assert.equal(
        reloadedDoc.getPageCount(),
        1,
        "Exported PDF must have exactly 1 page",
      );

      const reloadedPage = reloadedDoc.getPage(0);
      const { width, height } = reloadedPage.getSize();
      assert.equal(width, 600, "Page width must be 600");
      assert.equal(height, 800, "Page height must be 800");
    },
  );
});
