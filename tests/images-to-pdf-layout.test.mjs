import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePageLayout,
  normalizeRotation,
  PAGE_SIZES,
  MARGIN_PTS,
  moveItemUp,
  moveItemDown,
  moveItemToTop,
  moveItemToBottom,
  sortItemsByName,
  reverseItemList,
} from "../src/lib/images-to-pdf-layout.ts";

test("images-to-pdf layout math suite", async (t) => {
  await t.test("normalizeRotation correctly normalizes angles", () => {
    assert.equal(normalizeRotation(0), 0);
    assert.equal(normalizeRotation(90), 90);
    assert.equal(normalizeRotation(180), 180);
    assert.equal(normalizeRotation(270), 270);
    assert.equal(normalizeRotation(360), 0);
    assert.equal(normalizeRotation(-90), 270);
    assert.equal(normalizeRotation(450), 90);
  });

  await t.test("fit page size sets page dimensions to image dimensions", () => {
    const layout = calculatePageLayout(800, 600, 0, {
      pageSize: "fit",
      orientation: "auto",
      margin: "none",
      fit: "fit",
    });
    assert.equal(layout.pageWidth, 800);
    assert.equal(layout.pageHeight, 600);
    assert.equal(layout.x, 0);
    assert.equal(layout.y, 0);
    assert.equal(layout.width, 800);
    assert.equal(layout.height, 600);
  });

  await t.test("fit page size swaps dimensions when rotated 90 deg", () => {
    const layout = calculatePageLayout(800, 600, 90, {
      pageSize: "fit",
      orientation: "auto",
      margin: "none",
      fit: "fit",
    });
    assert.equal(layout.pageWidth, 600);
    assert.equal(layout.pageHeight, 800);
    assert.equal(layout.effectiveImgWidth, 600);
    assert.equal(layout.effectiveImgHeight, 800);
  });

  await t.test("orientation auto selects portrait for tall images", () => {
    const layout = calculatePageLayout(500, 1000, 0, {
      pageSize: "a4",
      orientation: "auto",
      margin: "none",
      fit: "fit",
    });
    assert.equal(layout.pageWidth, PAGE_SIZES.a4[0]);
    assert.equal(layout.pageHeight, PAGE_SIZES.a4[1]);
  });

  await t.test("orientation auto selects landscape for wide images", () => {
    const layout = calculatePageLayout(1000, 500, 0, {
      pageSize: "a4",
      orientation: "auto",
      margin: "none",
      fit: "fit",
    });
    assert.equal(layout.pageWidth, PAGE_SIZES.a4[1]);
    assert.equal(layout.pageHeight, PAGE_SIZES.a4[0]);
  });

  await t.test("margins reduce printable area and center image", () => {
    const marginKey = "medium";
    const marginPt = MARGIN_PTS[marginKey];
    const layout = calculatePageLayout(400, 400, 0, {
      pageSize: "letter",
      orientation: "portrait",
      margin: marginKey,
      fit: "fit",
    });
    assert.equal(layout.marginPt, marginPt);
    const printableW = PAGE_SIZES.letter[0] - 2 * marginPt;
    const printableH = PAGE_SIZES.letter[1] - 2 * marginPt;
    // Since 400x400 is square, it will scale to printableW (the shorter side)
    assert.ok(Math.abs(layout.width - printableW) < 0.01);
    assert.ok(Math.abs(layout.height - printableW) < 0.01);
    assert.ok(Math.abs(layout.x - marginPt) < 0.01);
    assert.ok(Math.abs(layout.y - (marginPt + (printableH - layout.height) / 2)) < 0.01);
  });

  await t.test("reordering and sorting helpers", () => {
    const list = [
      { id: "1", name: "banana.png" },
      { id: "2", name: "apple.png" },
      { id: "3", name: "cherry.png" },
    ];

    const up = moveItemUp(list, 1);
    assert.deepEqual(up.map((x) => x.id), ["2", "1", "3"]);

    const down = moveItemDown(list, 1);
    assert.deepEqual(down.map((x) => x.id), ["1", "3", "2"]);

    const toTop = moveItemToTop(list, 2);
    assert.deepEqual(toTop.map((x) => x.id), ["3", "1", "2"]);

    const toBottom = moveItemToBottom(list, 0);
    assert.deepEqual(toBottom.map((x) => x.id), ["2", "3", "1"]);

    const asc = sortItemsByName(list, "asc");
    assert.deepEqual(asc.map((x) => x.name), ["apple.png", "banana.png", "cherry.png"]);

    const desc = sortItemsByName(list, "desc");
    assert.deepEqual(desc.map((x) => x.name), ["cherry.png", "banana.png", "apple.png"]);

    const rev = reverseItemList(list);
    assert.deepEqual(rev.map((x) => x.id), ["3", "2", "1"]);
  });
});
