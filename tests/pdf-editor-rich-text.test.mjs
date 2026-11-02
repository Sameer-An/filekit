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

const {
  applyStyleToRange,
  materializeRuns,
  mergeAdjacentRuns,
  replaceText,
  replaceTextRange,
  splitRunAt,
  styleForRange,
} = require("../src/lib/pdf-editor/text-runs.ts");

function textObject(overrides = {}) {
  return {
    id: "text-1",
    kind: "new-text",
    page: 0,
    rect: { x: 10, y: 20, w: 120, h: 24 },
    rotation: 0,
    z: 0,
    locked: false,
    opacity: 1,
    text: "abcdef",
    fontFamily: "Arial",
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: "#222222",
    align: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    ...overrides,
  };
}

function runTexts(obj) {
  return (obj.runs ?? []).map((run) => run.text);
}

test("rich-text run normalization and range transformations", async (t) => {
  await t.test("materializes legacy text and its object-level styles", () => {
    const obj = textObject({ bold: true, text: "Legacy text" });
    assert.deepEqual(materializeRuns(obj), [
      {
        text: "Legacy text",
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        fontFamily: "Arial",
        fontSize: 12,
        color: "#222222",
        letterSpacing: 0,
      },
    ]);
  });

  await t.test("keeps styled run content and order when materializing", () => {
    const obj = textObject({
      text: "wrong legacy mirror",
      runs: [
        { text: "One ", bold: true },
        { text: "Two", italic: true },
      ],
    });
    assert.equal(
      materializeRuns(obj).map((run) => run.text).join(""),
      "One Two",
    );
    assert.deepEqual(runTexts(applyStyleToRange(obj, 0, 3, { underline: true })), [
      "One",
      " ",
      "Two",
    ]);
  });

  await t.test("splits runs at the beginning, middle, and end", () => {
    const runs = [{ text: "abcd", bold: true }];
    assert.deepEqual(splitRunAt(runs, 0), {
      left: [],
      right: [{ text: "abcd", bold: true }],
    });
    assert.deepEqual(splitRunAt(runs, 2), {
      left: [{ text: "ab", bold: true }],
      right: [{ text: "cd", bold: true }],
    });
    assert.deepEqual(splitRunAt(runs, 4), {
      left: [{ text: "abcd", bold: true }],
      right: [],
    });
  });

  await t.test("applies styles only to selected characters and preserves other marks", () => {
    const obj = textObject({
      text: "plain bold",
      runs: [
        { text: "plain ", color: "#000000" },
        { text: "bold", bold: true, color: "#ff0000" },
      ],
    });
    const next = applyStyleToRange(obj, 2, 8, { italic: true });
    assert.equal(next.text, "plain bold");
    assert.deepEqual(next.runs, [
      { text: "pl", color: "#000000" },
      { text: "ain ", color: "#000000", italic: true },
      { text: "bo", bold: true, color: "#ff0000", italic: true },
      { text: "ld", bold: true, color: "#ff0000" },
    ]);
  });

  await t.test("combines bold, italic, underline, and strike", () => {
    const obj = textObject({
      text: "word",
      runs: [
        {
          text: "word",
          bold: true,
          italic: true,
        },
      ],
    });
    const underlined = applyStyleToRange(obj, 0, 4, { underline: true });
    const struck = applyStyleToRange(underlined, 0, 4, { strike: true });
    assert.deepEqual(struck.runs, [
      {
        text: "word",
        bold: true,
        italic: true,
        underline: true,
        strike: true,
      },
    ]);
  });

  await t.test("styles selections spanning differently formatted runs", () => {
    const obj = textObject({
      text: "abcd",
      runs: [{ text: "ab", bold: true }, { text: "cd", italic: true }],
    });
    const next = applyStyleToRange(obj, 1, 3, { underline: true });
    assert.equal(next.runs.map((run) => run.text).join(""), "abcd");
    assert.deepEqual(next.runs, [
      { text: "a", bold: true },
      { text: "b", bold: true, underline: true },
      { text: "c", italic: true, underline: true },
      { text: "d", italic: true },
    ]);
  });

  await t.test("reports mixed and uniform style in the selected range", () => {
    const obj = textObject({
      text: "abcd",
      runs: [{ text: "ab", bold: true }, { text: "cd", bold: false }],
    });
    assert.equal(styleForRange(obj, "bold", 1, 3), "Mixed");
    assert.equal(styleForRange(obj, "bold", 0, 2), true);
    assert.equal(styleForRange(obj, "bold", 2, 2), null);
  });

  await t.test("inserts and replaces text using nearby formatting", () => {
    const obj = textObject({
      text: "abcd",
      runs: [
        { text: "ab", bold: true, color: "#ff0000" },
        { text: "cd", italic: true, color: "#0000ff" },
      ],
    });
    const inserted = replaceText(obj, "abXcd");
    assert.equal(inserted.text, "abXcd");
    assert.deepEqual(inserted.runs, [
      { text: "abX", bold: true, color: "#ff0000" },
      { text: "cd", italic: true, color: "#0000ff" },
    ]);

    const replaced = replaceTextRange(obj, 1, 3, "XY");
    assert.equal(replaced.text, "aXYd");
    assert.deepEqual(replaced.runs, [
      { text: "aXY", bold: true, color: "#ff0000" },
      { text: "d", italic: true, color: "#0000ff" },
    ]);
  });

  await t.test("deletes across runs without duplicating text", () => {
    const obj = textObject({
      text: "abcd",
      runs: [{ text: "ab", bold: true }, { text: "cd", italic: true }],
    });
    const next = replaceTextRange(obj, 1, 3, "");
    assert.equal(next.text, "ad");
    assert.deepEqual(next.runs, [
      { text: "a", bold: true },
      { text: "d", italic: true },
    ]);
  });

  await t.test("merges only adjacent runs with identical formatting", () => {
    assert.deepEqual(
      mergeAdjacentRuns([
        { text: "a", bold: true },
        { text: "b", bold: true },
        { text: "c", italic: true },
      ]),
      [
        { text: "ab", bold: true },
        { text: "c", italic: true },
      ],
    );
  });

  await t.test("handles empty text, zero ranges, and Unicode boundaries", () => {
    const empty = textObject({ text: "", runs: [] });
    assert.equal(replaceText(empty, "").text, "");
    assert.deepEqual(applyStyleToRange(empty, 0, 0, { bold: true }), empty);
    const unicode = textObject({ text: "A😀B", runs: [{ text: "A😀B" }] });
    const next = replaceTextRange(unicode, 1, 3, "🙂");
    assert.equal(next.text, "A🙂B");
    assert.equal(next.runs.map((run) => run.text).join(""), "A🙂B");
  });
});

test("document history retains exact rich-text runs through undo and redo", () => {
  const { usePdfEditor } = require("../src/lib/pdf-editor/store.ts");
  const obj = textObject({
    text: "abc",
    runs: [{ text: "a" }, { text: "bc", bold: true }],
  });
  usePdfEditor.getState().initDocument({
    originalBytes: new Uint8Array([1]),
    fileName: "rich-text.pdf",
    pages: [
      { index: 0, widthPt: 300, heightPt: 400, rotation: 0 },
    ],
    objects: { [obj.id]: obj },
    pageObjectIds: [[obj.id]],
  });

  usePdfEditor.getState().commit("Underline selection", (draft) => {
    draft.objects[obj.id] = applyStyleToRange(
      draft.objects[obj.id],
      1,
      3,
      { underline: true },
    );
  });
  const formatted = usePdfEditor.getState().objects[obj.id];
  assert.deepEqual(formatted.runs, [
    { text: "a" },
    { text: "bc", bold: true, underline: true },
  ]);

  usePdfEditor.getState().undo();
  assert.deepEqual(usePdfEditor.getState().objects[obj.id].runs, obj.runs);

  usePdfEditor.getState().redo();
  assert.deepEqual(usePdfEditor.getState().objects[obj.id].runs, formatted.runs);
});

test("PDF export preserves mixed text order, font variants, and decorations", async () => {
  const { PDFDocument } = require("pdf-lib");
  const { exportPdf } = require("../src/lib/pdf-editor/export.ts");
  const source = await PDFDocument.create();
  source.addPage([600, 300]);
  const originalBytes = await source.save();
  const runs = [
    { text: "R" },
    { text: "B", bold: true },
    { text: "I", italic: true },
    { text: "U", underline: true },
    { text: "S", strike: true },
    {
      text: "C",
      bold: true,
      italic: true,
      underline: true,
      strike: true,
    },
  ];
  const object = textObject({
    id: "export-text",
    kind: "new-text",
    text: runs.map((run) => run.text).join(""),
    runs,
    rect: { x: 30, y: 250, w: 500, h: 40 },
    fontSize: 16,
    rotation: 90,
  });
  const legacy = textObject({
    id: "legacy-text",
    text: "Legacy",
    bold: true,
    rect: { x: 30, y: 40, w: 100, h: 24 },
  });
  const bytes = await exportPdf({
    originalBytes,
    pages: [{ index: 0, widthPt: 600, heightPt: 300, rotation: 0 }],
    objects: { [object.id]: object, [legacy.id]: legacy },
    pageObjectIds: [[object.id, legacy.id]],
    pageOps: [],
    overlays: {
      header: "",
      footer: "",
      watermark: "",
      pageNumbers: false,
    },
    options: {
      pageRange: "all",
      flatten: false,
      compress: true,
      requestedPassword: null,
    },
  });

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const parsed = await loadingTask.promise;
  try {
    const page = await parsed.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item && item.str);
    assert.equal(
      items.map((item) => item.str).join(""),
      "RBIUSCLegacy",
    );
    const fontFor = (text) => items.find((item) => item.str === text)?.fontName;
    assert.notEqual(fontFor("B"), fontFor("R"));
    assert.notEqual(fontFor("I"), fontFor("R"));
    assert.notEqual(fontFor("C"), fontFor("B"));
    assert.notEqual(fontFor("Legacy"), fontFor("R"));
    assert.ok(
      Math.abs(items[0].transform[1]) > 0.1 ||
        Math.abs(items[0].transform[2]) > 0.1,
      "rotated text should retain its PDF rotation",
    );

    const operations = await page.getOperatorList();
    const pathCount = operations.fnArray.filter(
      (operation) => operation === pdfjs.OPS.constructPath,
    ).length;
    assert.ok(
      pathCount >= 4,
      `underline and strike segments should draw line paths (${pathCount})`,
    );
  } finally {
    await loadingTask.destroy();
  }
});
