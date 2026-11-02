export type FontCategory =
  | "Sans-serif"
  | "Serif"
  | "Monospaced"
  | "Handwriting and script"
  | "Decorative and display"
  | "Regional and multilingual";

export type FontSource = "built-in" | "system";
export type FontExportCapability =
  | "bundled-embedded"
  | "pdf-standard-substitute"
  | "system-dependent";

export interface FontDefinition {
  id: string;
  family: string;
  cssFontFamily: string;
  cssFontStack: string;
  category: FontCategory;
  sourceType: FontSource;
  availability: "verified-bundled" | "system-dependent";
  supportedWeights: readonly number[] | "system-dependent";
  supportedStyles: readonly ("normal" | "italic")[] | "system-dependent";
  assetReferences?: readonly string[];
  exportCapability: FontExportCapability;
}

const candidates: Array<[FontCategory, string[]]> = [
  [
    "Sans-serif",
    [
      "Arial",
      "Arial Black",
      "Arial Narrow",
      "Arial Nova",
      "Aptos",
      "Aptos Display",
      "Aptos Narrow",
      "Calibri",
      "Calibri Light",
      "Century Gothic",
      "Franklin Gothic",
      "Gadugi",
      "Microsoft Sans Serif",
      "Segoe UI",
      "Tahoma",
      "Trebuchet MS",
      "Verdana",
      "Agency FB",
      "Bahnschrift",
      "Helvetica",
      "Noto Sans",
      "Roboto",
      "Open Sans",
      "Lato",
      "Montserrat",
      "Poppins",
      "Inter",
    ],
  ],
  [
    "Serif",
    [
      "Times New Roman",
      "Georgia",
      "Georgia Pro",
      "Cambria",
      "Cambria Math",
      "Garamond",
      "Palatino Linotype",
      "Book Antiqua",
      "Baskerville Old Face",
      "Bodoni MT",
      "Calisto MT",
      "Century Schoolbook",
      "Constantia",
      "Perpetua",
      "Rockwell",
      "Sitka",
      "Bell MT",
      "Abadi",
      "Avenir Next LT Pro",
      "Grandview",
      "Neue Haas Grotesk Text Pro",
      "Posterama",
      "Quire Sans",
      "Tisa Offc Serif Pro",
      "Trade Gothic Next",
      "Merriweather",
      "Playfair Display",
      "Palatino",
      "Aptos Serif",
    ],
  ],
  [
    "Monospaced",
    [
      "Consolas",
      "Courier New",
      "Lucida Console",
      "Cascadia Code",
      "Cascadia Mono",
      "OCRB",
      "Roboto Mono",
      "Aptos Mono",
    ],
  ],
  [
    "Handwriting and script",
    [
      "Brush Script MT",
      "Segoe Script",
      "Segoe Print",
      "Comic Sans MS",
      "Lucida Handwriting",
      "Monotype Corsiva",
      "Freestyle Script",
      "French Script MT",
      "Kunstler Script",
      "Mistral",
      "Rage Italic",
      "Pristina",
      "Ink Free",
      "Gabriola",
      "Edwardian Script ITC",
    ],
  ],
  [
    "Decorative and display",
    [
      "Impact",
      "Algerian",
      "Broadway",
      "Castellar",
      "Chiller",
      "Cooper Black",
      "Copperplate Gothic",
      "Harlow Solid Italic",
      "Harrington",
      "Jokerman",
      "Magneto",
      "Old English Text MT",
      "Papyrus",
      "Stencil",
      "Showcard Gothic",
      "Snap ITC",
      "Ravie",
      "Rockwell Extra Bold",
    ],
  ],
  [
    "Regional and multilingual",
    [
      "Nirmala UI",
      "Nirmala Text",
      "Mangal",
      "Aparajita",
      "Kokila",
      "Gautami",
      "Raavi",
      "Shruti",
      "Latha",
      "Vijaya",
      "Tunga",
      "Kalinga",
      "Microsoft YaHei",
      "Microsoft JhengHei",
      "Meiryo",
      "Yu Gothic",
      "Malgun Gothic",
      "Gulim",
      "MS Gothic",
      "MS Mincho",
      "MingLiU",
    ],
  ],
];

function fontId(family: string): string {
  return `font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const bundledFamilies = new Set(["Noto Sans"]);
const pdfStandardSubstitutes = new Set([
  "Arial",
  "Arial Black",
  "Arial Narrow",
  "Arial Nova",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Georgia Pro",
  "Cambria",
  "Cambria Math",
  "Garamond",
  "Palatino",
  "Palatino Linotype",
  "Book Antiqua",
  "Courier New",
  "Consolas",
]);

const SYSTEM_FALLBACKS: Record<FontCategory, string> = {
  "Sans-serif": '"Segoe UI", Arial, "Noto Sans", sans-serif',
  Serif: 'Georgia, "Times New Roman", "Noto Sans", serif',
  Monospaced: 'Consolas, "Courier New", monospace',
  "Handwriting and script": '"Segoe Script", "Comic Sans MS", cursive',
  "Decorative and display": 'Impact, "Arial Black", fantasy',
  "Regional and multilingual": '"Noto Sans", "Segoe UI", sans-serif',
};

export const FONT_CATALOGUE: readonly FontDefinition[] = candidates.flatMap(
  ([category, families]) =>
    families.map((family) => {
      const isBundled = bundledFamilies.has(family);
      const sourceType: FontSource = isBundled ? "built-in" : "system";
      const exportCapability: FontExportCapability =
        isBundled
          ? "bundled-embedded"
          : pdfStandardSubstitutes.has(family)
            ? "pdf-standard-substitute"
            : "system-dependent";
      return {
        id: fontId(family),
        family,
        cssFontFamily: JSON.stringify(family),
        cssFontStack: `${JSON.stringify(family)}, ${SYSTEM_FALLBACKS[category]}`,
        category,
        sourceType,
        availability: isBundled ? "verified-bundled" : "system-dependent",
        supportedWeights: isBundled ? [400, 700] : "system-dependent",
        supportedStyles: isBundled ? ["normal"] : "system-dependent",
        ...(isBundled
          ? {
              assetReferences: [
                "/fonts/NotoSans-Regular.ttf",
                "/fonts/NotoSans-Bold.ttf",
                "/fonts/NotoSans-Regular.woff2",
                "/fonts/NotoSans-Bold.woff2",
              ],
            }
          : {}),
        exportCapability,
      };
    }),
);

export const FONT_CATEGORIES: readonly FontCategory[] = candidates.map(
  ([category]) => category,
);

export function getFontDefinition(family: string): FontDefinition | undefined {
  return FONT_CATALOGUE.find((font) => font.family === family);
}

export function getFontCssStack(family: string): string {
  const definition = getFontDefinition(family);
  const fallback = definition
    ? SYSTEM_FALLBACKS[definition.category]
    : SYSTEM_FALLBACKS["Sans-serif"];
  return definition?.cssFontStack ?? `${JSON.stringify(family)}, ${fallback}`;
}

export function getFontExportLabel(family: string): string {
  const definition = getFontDefinition(family);
  if (!definition) return "Imported font · export embedding requires its saved font file";
  if (definition.exportCapability === "bundled-embedded")
    return "Bundled · embeddable in PDF";
  if (definition.exportCapability === "pdf-standard-substitute")
    return "Device font · PDF uses a standard-font substitute";
  return "Device-dependent · PDF export uses a standard-font substitute";
}

export function getFontCandidateGroups(): Array<{
  label: FontCategory;
  fonts: FontDefinition[];
}> {
  return FONT_CATEGORIES.map((label) => ({
    label,
    fonts: FONT_CATALOGUE.filter((font) => font.category === label),
  }));
}
