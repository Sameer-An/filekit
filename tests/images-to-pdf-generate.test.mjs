import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { generateImagesPdf } from "../src/lib/images-to-pdf-generate.ts";
import { PAGE_SIZES } from "../src/lib/images-to-pdf-layout.ts";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("images-to-pdf generate suite", async (t) => {
  await t.test("generates multi-page PDF from 3 PNGs in specified order and reloads with PDFDocument.load", async () => {
    const pngBuffer = Buffer.from(PNG_1X1_BASE64, "base64");

    const file1 = new File([pngBuffer], "image1.png", { type: "image/png" });
    const file2 = new File([pngBuffer], "image2.png", { type: "image/png" });
    const file3 = new File([pngBuffer], "image3.png", { type: "image/png" });

    const items = [
      { id: "1", file: file1, name: "image1.png", size: file1.size, width: 1, height: 1, rotation: 0 },
      { id: "2", file: file2, name: "image2.png", size: file2.size, width: 1, height: 1, rotation: 0 },
      { id: "3", file: file3, name: "image3.png", size: file3.size, width: 1, height: 1, rotation: 0 },
    ];

    const { blob, size } = await generateImagesPdf(items, {
      pageSize: "a4",
      orientation: "portrait",
      margin: "small",
      fit: "fit",
      backgroundColor: "#ffffff",
      quality: "high",
      outputFilename: "output.pdf",
    });

    assert.ok(size > 0, "PDF size should be greater than 0");
    assert.equal(blob.type, "application/pdf");

    // Reload with PDFDocument.load to verify integrity
    const arrayBuffer = await blob.arrayBuffer();
    const doc = await PDFDocument.load(arrayBuffer);

    assert.equal(doc.getPageCount(), 3, "PDF should have exactly 3 pages");

    const page1 = doc.getPage(0);
    const { width: p1W, height: p1H } = page1.getSize();

    assert.ok(Math.abs(p1W - PAGE_SIZES.a4[0]) < 0.1, "Page 1 width should match A4");
    assert.ok(Math.abs(p1H - PAGE_SIZES.a4[1]) < 0.1, "Page 1 height should match A4");
  });
});
