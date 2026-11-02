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
  FONT_CATALOGUE,
  getFontCssStack,
  getFontDefinition,
  getFontExportLabel,
} = require("../src/lib/pdf-editor/font-catalogue.ts");
const {
  assertPdfEmbeddableFont,
  validateFontFileHeader,
  MAX_UPLOADED_FONT_SIZE,
} = require("../src/lib/pdf-editor/uploaded-fonts.ts");
const { resolveFontForRun } = require("../src/lib/pdf-editor/fonts.ts");
const fontkit = require("@pdf-lib/fontkit");
const { PDFDocument } = require("pdf-lib");

const EXPECTED_CANDIDATES = [
  "Arial", "Arial Black", "Arial Narrow", "Arial Nova", "Aptos",
  "Aptos Display", "Aptos Mono", "Aptos Narrow", "Aptos Serif", "Calibri",
  "Calibri Light", "Century Gothic", "Franklin Gothic", "Gadugi",
  "Microsoft Sans Serif", "Segoe UI", "Tahoma", "Trebuchet MS", "Verdana",
  "Agency FB", "Bahnschrift", "Times New Roman", "Georgia", "Georgia Pro",
  "Cambria", "Cambria Math", "Garamond", "Palatino Linotype", "Book Antiqua",
  "Baskerville Old Face", "Bodoni MT", "Calisto MT", "Century Schoolbook",
  "Constantia", "Perpetua", "Rockwell", "Sitka", "Bell MT", "Abadi",
  "Avenir Next LT Pro", "Grandview", "Neue Haas Grotesk Text Pro", "Posterama",
  "Quire Sans", "Tisa Offc Serif Pro", "Trade Gothic Next", "Consolas",
  "Courier New", "Lucida Console", "Cascadia Code", "Cascadia Mono", "OCRB",
  "Brush Script MT", "Segoe Script", "Segoe Print", "Comic Sans MS",
  "Lucida Handwriting", "Monotype Corsiva", "Freestyle Script",
  "French Script MT", "Kunstler Script", "Mistral", "Rage Italic", "Pristina",
  "Ink Free", "Gabriola", "Edwardian Script ITC", "Impact", "Algerian",
  "Broadway", "Castellar", "Chiller", "Cooper Black", "Copperplate Gothic",
  "Harlow Solid Italic", "Harrington", "Jokerman", "Magneto",
  "Old English Text MT", "Papyrus", "Stencil", "Showcard Gothic", "Snap ITC",
  "Ravie", "Rockwell Extra Bold", "Nirmala UI", "Nirmala Text", "Mangal",
  "Aparajita", "Kokila", "Gautami", "Raavi", "Shruti", "Latha", "Vijaya",
  "Tunga", "Kalinga", "Microsoft YaHei", "Microsoft JhengHei", "Meiryo",
  "Yu Gothic", "Malgun Gothic", "Gulim", "MS Gothic", "MS Mincho", "MingLiU",
];

test("font catalogue and fallback metadata", async (t) => {
  await t.test("includes each requested family once with a stable unique id", () => {
    const families = FONT_CATALOGUE.map((font) => font.family);
    const ids = FONT_CATALOGUE.map((font) => font.id);
    for (const family of EXPECTED_CANDIDATES) {
      assert.equal(families.filter((entry) => entry === family).length, 1, family);
    }
    assert.equal(new Set(families).size, families.length);
    assert.equal(new Set(ids).size, ids.length);
  });

  await t.test("only reports the verified bundled font as bundled", () => {
    const bundled = FONT_CATALOGUE.filter((font) => font.sourceType === "built-in");
    assert.deepEqual(bundled.map((font) => font.family), ["Noto Sans"]);
    assert.equal(bundled[0].availability, "verified-bundled");
    assert.deepEqual(bundled[0].supportedWeights, [400, 700]);
    assert.ok(bundled[0].assetReferences.includes("/fonts/NotoSans-Regular.ttf"));
    const systemFont = getFontDefinition("Arial");
    assert.equal(systemFont.availability, "system-dependent");
    assert.equal(systemFont.supportedWeights, "system-dependent");
    assert.match(getFontExportLabel("Arial"), /standard-font substitute/);
    assert.match(getFontCssStack("Arial"), /sans-serif/);
  });
});

test("uploaded font validation and PDF embedding", async (t) => {
  const fontBytes = readFileSync("public/fonts/NotoSans-Regular.ttf");

  await t.test("accepts TTF/OTF signatures and rejects unsupported or malformed input", () => {
    assert.equal(
      validateFontFileHeader("font.ttf", fontBytes.length, fontBytes),
      "ttf",
    );
    assert.equal(validateFontFileHeader("font.otf", 4, Buffer.from("OTTO")), "otf");
    assert.throws(
      () => validateFontFileHeader("font.woff2", 4, Buffer.from("wOF2")),
      /Unsupported font format/,
    );
    assert.throws(
      () => validateFontFileHeader("broken.ttf", 4, Buffer.from("nope")),
      /does not contain/,
    );
    assert.throws(
      () =>
        validateFontFileHeader(
          "large.ttf",
          MAX_UPLOADED_FONT_SIZE + 1,
          fontBytes,
        ),
      /10 MB/,
    );
  });

  await t.test("rejects OTF files the PDF library cannot actually embed", async () => {
    await assert.rejects(
      assertPdfEmbeddableFont(Buffer.from("OTTO")),
    );
  });

  await t.test("embeds and saves a verified bundled TTF using pdf-lib/fontkit", async () => {
    await assertPdfEmbeddableFont(fontBytes);
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont(fontBytes, { subset: true });
    document.addPage().drawText("Custom font", { font, size: 12 });
    const output = await document.save();
    const reloaded = await PDFDocument.load(output);
    assert.equal(reloaded.getPageCount(), 1);
  });
});

test("PDF export resolves actual embedded faces and reports substitutions", async (t) => {
  const bytes = readFileSync("public/fonts/NotoSans-Regular.ttf");

  await t.test("uses bundled Noto Sans for supported text", async () => {
    const doc = await PDFDocument.create();
    const result = await resolveFontForRun(doc, {
      fontFamily: "Noto Sans",
      bold: false,
      italic: false,
      text: "Latin café",
    });
    assert.equal(result.substituted, false);
    assert.equal(result.face, "Noto Sans");
    const page = doc.addPage();
    page.drawText("Latin café", { font: result.font, size: 12 });
    assert.ok((await doc.save()).length > 0);
  });

  await t.test("reports that a system font is substituted by a PDF standard font", async () => {
    const doc = await PDFDocument.create();
    const result = await resolveFontForRun(doc, {
      fontFamily: "Arial",
      bold: true,
      italic: false,
      text: "Sample",
    });
    assert.equal(result.substituted, true);
    assert.match(result.face, /standard fallback/);
  });

  await t.test("does not export unsupported multilingual glyphs as if preserved", async () => {
    const doc = await PDFDocument.create();
    await assert.rejects(
      resolveFontForRun(doc, {
        fontFamily: "Noto Sans",
        bold: false,
        italic: false,
        text: "नमस्ते",
      }),
      /does not contain glyphs/,
    );
    const parsed = fontkit.create(bytes);
    assert.equal(parsed.familyName, "Noto Sans");
  });
});
