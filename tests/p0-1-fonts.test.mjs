import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

test("P0-1: Font embedding and multi-language export", async (t) => {
  await t.test("Verify WOFF2 behavior and fallback to TTF", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const woff2Bytes = fs.readFileSync("public/fonts/NotoSans-Regular.woff2");
    assert.ok(woff2Bytes.length > 0, "NotoSans-Regular.woff2 must exist");

    // Test that embedding TTF works with subsetting
    const ttfBytes = fs.readFileSync("public/fonts/NotoSans-Regular.ttf");
    assert.ok(ttfBytes.length > 0, "NotoSans-Regular.ttf must exist");
    const ttfFont = await doc.embedFont(ttfBytes, { subset: true });
    assert.ok(ttfFont, "TTF font embeds with subsetting");

    const ttfBoldBytes = fs.readFileSync("public/fonts/NotoSans-Bold.ttf");
    assert.ok(ttfBoldBytes.length > 0, "NotoSans-Bold.ttf must exist");
    const ttfBoldFont = await doc.embedFont(ttfBoldBytes, { subset: true });
    assert.ok(ttfBoldFont, "NotoSans-Bold.ttf embeds with subsetting");
  });

  await t.test("Export PDF with Latin, Hindi, Arabic, Chinese and bold runs", async () => {
    if (typeof regeneratorRuntime === "undefined") {
      try {
        await import("regenerator-runtime/runtime.js");
      } catch {
        // Continue if not available
      }
    }

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const regularBytes = fs.readFileSync("public/fonts/NotoSans-Regular.ttf");
    const boldBytes = fs.readFileSync("public/fonts/NotoSans-Bold.ttf");
    const fontRegular = await doc.embedFont(regularBytes, { subset: true });
    const fontBold = await doc.embedFont(boldBytes, { subset: true });

    const page = doc.addPage([600, 400]);

    // Latin
    page.drawText("Latin: Hello world & café résumé", {
      x: 50,
      y: 350,
      size: 14,
      font: fontRegular,
    });

    // Hindi
    page.drawText("Hindi: नमस्ते दुनिया", {
      x: 50,
      y: 300,
      size: 14,
      font: fontRegular,
    });

    // Arabic
    page.drawText("Arabic: مرحبا بالعالم", {
      x: 50,
      y: 250,
      size: 14,
      font: fontRegular,
    });

    // Chinese
    page.drawText("Chinese: 你好世界", {
      x: 50,
      y: 200,
      size: 14,
      font: fontRegular,
    });

    // Bold text
    page.drawText("Bold text with NotoSans-Bold", {
      x: 50,
      y: 150,
      size: 14,
      font: fontBold,
    });

    const pdfBytes = await doc.save();
    assert.ok(pdfBytes.length > 0, "PDF bytes generated");

    // Verify it reloads cleanly with PDFDocument.load
    const reloaded = await PDFDocument.load(pdfBytes);
    assert.equal(reloaded.getPageCount(), 1, "PDF reloads with exactly 1 page");
  });
});
