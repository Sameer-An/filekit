import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { DEFAULT_OVERLAYS, getOverlayRects } = require(
  "../src/lib/pdf-editor/overlay-layout.ts",
);
const { applyPageOp, pageIndexForPosition } = require("../src/lib/pdf-editor/page-ops.ts");

test("page overlay alignment and margin settings", () => {
  const page = { index: 0, widthPt: 612, heightPt: 792, rotation: 0 };
  const overlays = {
    ...DEFAULT_OVERLAYS,
    header: "Report {page}/{total}",
    footer: "Confidential",
    pageNumbers: true,
    headerAlign: "left",
    footerAlign: "center",
    pageNumberAlign: "right",
    leftMargin: 24,
    rightMargin: 48,
    topMargin: 60,
    bottomMargin: 30,
  };

  const [header, footer, pageNumber] = getOverlayRects(
    overlays,
    page,
    0,
    4,
  );

  assert.equal(header.text, "Report 1/4");
  assert.deepEqual(header.rect, { x: 24, y: 712, w: 540, h: 20 });
  assert.equal(header.align, "left");
  assert.deepEqual(footer.rect, { x: 24, y: 30, w: 540, h: 20 });
  assert.equal(footer.align, "center");
  assert.deepEqual(pageNumber.rect, { x: 24, y: 30, w: 540, h: 20 });
  assert.equal(pageNumber.align, "right");
});

test("page margins are clamped to the page bounds", () => {
  const rects = getOverlayRects(
    {
      ...DEFAULT_OVERLAYS,
      header: "Header",
      leftMargin: 900,
      rightMargin: 900,
      topMargin: 900,
    },
    { index: 0, widthPt: 612, heightPt: 792, rotation: 0 },
    0,
    1,
  );
  assert.deepEqual(rects[0].rect, { x: 612, y: 0, w: 0, h: 20 });
});

test("overlay numbering follows the current page order", () => {
  const page = {
    index: 0,
    pageLabel: 22,
    widthPt: 612,
    heightPt: 792,
    rotation: 0,
  };
  const [header, number] = getOverlayRects(
    {
      ...DEFAULT_OVERLAYS,
      header: "Page {page} of {total}",
      pageNumbers: true,
    },
    page,
    1,
    5,
  );
  assert.equal(header.text, "Page 2 of 5");
  assert.equal(number.text, "2 / 5");
});

test("page positions move pages and their objects together", () => {
  const pages = [0, 1, 2, 3, 4].map((index) => ({
    index,
    widthPt: 612,
    heightPt: 792,
    rotation: 0,
    uid: `page-${index}`,
  }));
  const objects = {
    object1: { id: "object1", page: 1, rect: { x: 0, y: 0, w: 1, h: 1 } },
    object2: { id: "object2", page: 2, rect: { x: 0, y: 0, w: 1, h: 1 } },
  };
  const result = applyPageOp(
    {
      pages,
      pageObjectIds: [[], ["object1"], ["object2"], [], []],
      objects,
    },
    { op: "move", fromIndex: 1, toIndex: 2 },
  );
  assert.deepEqual(result.pages.map((page) => page.uid), [
    "page-0",
    "page-2",
    "page-1",
    "page-3",
    "page-4",
  ]);
  assert.equal(result.objects.object1.page, 2);
  assert.equal(result.objects.object2.page, 1);
});

test("typed positions clamp to the first or last page and reject fractions", () => {
  assert.equal(pageIndexForPosition("0", 5), 0);
  assert.equal(pageIndexForPosition("-4", 5), 0);
  assert.equal(pageIndexForPosition("3", 5), 2);
  assert.equal(pageIndexForPosition("20", 5), 4);
  assert.equal(pageIndexForPosition("2.5", 5), null);
  assert.equal(pageIndexForPosition("", 5), null);
});
