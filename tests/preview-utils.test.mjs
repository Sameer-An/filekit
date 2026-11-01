import test from "node:test";
import assert from "node:assert/strict";
import {
  getFileCategory,
  getEffectCss,
  calculateFitScale,
  getEstimatedSizeCacheKey,
} from "../src/components/preview/preview-utils.ts";

test("Preview Utils - Pure Function Suite", async (t) => {
  await t.test("getFileCategory categorizes images correctly", () => {
    const png = { name: "photo.png", type: "image/png" };
    const jpg = { name: "banner.jpeg", type: "image/jpeg" };
    const svg = { name: "icon.svg", type: "image/svg+xml" };
    assert.equal(getFileCategory(png), "image");
    assert.equal(getFileCategory(jpg), "image");
    assert.equal(getFileCategory(svg), "image");
  });

  await t.test("getFileCategory categorizes PDF correctly", () => {
    const pdf1 = { name: "document.pdf", type: "application/pdf" };
    const pdf2 = { name: "scan.PDF", type: "" };
    assert.equal(getFileCategory(pdf1), "pdf");
    assert.equal(getFileCategory(pdf2), "pdf");
  });

  await t.test("getFileCategory categorizes media and documents correctly", () => {
    const video = { name: "clip.mp4", type: "video/mp4" };
    const audio = { name: "track.mp3", type: "audio/mpeg" };
    const doc = { name: "report.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    assert.equal(getFileCategory(video), "video");
    assert.equal(getFileCategory(audio), "audio");
    assert.equal(getFileCategory(doc), "document");
  });

  await t.test("getEffectCss calculates CSS filters and transforms accurately", () => {
    // Default / no effects
    const empty = getEffectCss({});
    assert.equal(empty.filter, "none");
    assert.equal(empty.transform, "none");
    assert.equal(empty.hasEffects, false);

    // Filters only
    const filtered = getEffectCss({
      brightness: 120,
      contrast: 90,
      saturation: 150,
      grayscale: 50,
    });
    assert.equal(
      filtered.filter,
      "brightness(120%) contrast(90%) saturate(150%) grayscale(50%)",
    );
    assert.equal(filtered.hasEffects, true);

    // Transforms only
    const transformed = getEffectCss({
      rotateDeg: 90,
      flipH: true,
      flipV: false,
    });
    assert.equal(transformed.transform, "rotate(90deg) scaleX(-1)");
    assert.equal(transformed.hasEffects, true);
  });

  await t.test("calculateFitScale correctly computes scale factors", () => {
    // Exact fit with 16px padding on both sides (avail = 1000 - 32 = 968, 500 - 32 = 468)
    const scale = calculateFitScale(1000, 500, 1920, 1080, 16);
    const expected = Math.min(968 / 1920, 468 / 1080);
    assert.ok(Math.abs(scale - expected) < 0.001);

    // Edge cases: 0 or negative dimensions return fallback scale 1
    assert.equal(calculateFitScale(0, 0, 100, 100), 1);
    assert.equal(calculateFitScale(500, 500, 0, 0), 1);
  });

  await t.test("getEstimatedSizeCacheKey produces deterministic cache keys", () => {
    const key1 = getEstimatedSizeCacheKey("test.jpg", 10240, "webp", 80, 800, 600);
    const key2 = getEstimatedSizeCacheKey("test.jpg", 10240, "webp", 80, 800, 600);
    const key3 = getEstimatedSizeCacheKey("test.jpg", 10240, "png", 80, 800, 600);

    assert.equal(key1, key2);
    assert.notEqual(key1, key3);
    assert.equal(key1, "test.jpg_10240_webp_80_800x600");
  });
});
