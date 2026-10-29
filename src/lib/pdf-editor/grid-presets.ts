// src/lib/pdf-editor/grid-presets.ts
// Grid style catalog. Each preset renders to an SVG data URL for the
// "Edit grid style" gallery. `isCssPreset(id)` marks the styles we can
// also render as a CSS background (used by `GridOverlay` for 60fps).
//
// All rendering here is *reference only* and never appears in exports.

import type { GridSettings, GridStyleId } from "./types";

export interface GridPresetDef {
id: GridStyleId;
name: string;
description: string;
/** Draw a preview into the provided SVG fragment string. */
renderSvg: (width: number, height: number, settings: GridSettings) => string;
}

/** The 9 preset ids, in the order shown in the gallery. */
export const GRID_PRESET_IDS: GridStyleId[] = [
"square",
"dotted",
"horizontal",
"vertical",
"columns",
"isometric",
"margin-guides",
"rule-of-thirds",
"crosshair",
];

/* ───────────── Helpers ───────────── */

function presetOf(id: GridStyleId): GridPresetDef | undefined {
return GRID_PRESETS.find((p) => p.id === id);
}

export function getGridPreset(id: GridStyleId): GridPresetDef {
return presetOf(id) ?? GRID_PRESETS[0];
}

function safe(n: number, fallback: number): number {
return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp01(n: number): number {
return Math.max(0, Math.min(1, n));
}

/* ───────────── SVG previews ───────────── */

function svgWrap(width: number, height: number, body: string): string {
return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${body}</svg>`;
}

function squarePreview(w: number, h: number, s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const stroke = clamp01(s.opacity);
const t = Math.max(0.5, s.lineThicknessPx);
const major = Math.max(1, s.majorEvery || 1);
let body = "";
// minor
for (let x = 0; x <= w; x += cell) {
    body += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${stroke * 0.6}"/>`;
}
for (let y = 0; y <= h; y += cell) {
    body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${stroke * 0.6}"/>`;
}
// major
if (s.majorEvery > 1) {
    for (let x = 0, i = 0; x <= w; x += cell, i++) {
    if (i % major === 0) {
        body += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t * 1.6}" opacity="${stroke}"/>`;
    }
    }
    for (let y = 0, i = 0; y <= h; y += cell, i++) {
    if (i % major === 0) {
        body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${s.lineColor}" stroke-width="${t * 1.6}" opacity="${stroke}"/>`;
    }
    }
}
return svgWrap(w, h, body);
}

function dottedPreview(w: number, h: number, s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const r = Math.max(0.6, s.lineThicknessPx * 0.9);
const fill = s.lineColor;
const op = clamp01(s.opacity);
let body = "";
for (let x = cell / 2; x < w; x += cell) {
    for (let y = cell / 2; y < h; y += cell) {
    body += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${op}"/>`;
    }
}
return svgWrap(w, h, body);
}

function horizontalPreview(w: number, h: number, s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
let body = "";
for (let y = cell; y < h; y += cell) {
    body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>`;
}
return svgWrap(w, h, body);
}

function verticalPreview(w: number, h: number, s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
let body = "";
for (let x = cell; x < w; x += cell) {
    body += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>`;
}
return svgWrap(w, h, body);
}

function columnsPreview(w: number, h: number, s: GridSettings): string {
const cols = Math.max(1, s.columns ?? Math.floor(w / safe(s.cellSize, 24)));
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
let body = "";
for (let i = 0; i <= cols; i++) {
    const x = (i / cols) * w;
    const major = i === 0 || i === cols;
    body += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${major ? t * 1.8 : t}" opacity="${major ? op : op * 0.7}"/>`;
}
return svgWrap(w, h, body);
}

function isometricPreview(w: number, h: number, s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
const ang = Math.PI / 6; // 30°
const dx = Math.cos(ang) * cell;
const dy = Math.sin(ang) * cell;
let body = "";
// Lighter diagonals
for (let x = -h; x < w + h; x += cell * 2) {
    body += `<line x1="${x}" y1="0" x2="${x + h * Math.tan(ang)}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op * 0.6}"/>`;
    body += `<line x1="${x + h * Math.tan(ang)}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op * 0.6}"/>`;
}
// Darker main directions
for (let y = 0; y < h; y += cell) {
    body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op * 0.5}"/>`;
}
// Emphasise two principal diagonals to read as "isometric"
body += `<line x1="0" y1="0" x2="${w}" y2="${h * (Math.tan(ang) * (w / h))}" stroke="${s.lineColor}" stroke-width="${t * 1.5}" opacity="${op}"/>`;
body += `<line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${s.lineColor}" stroke-width="${t * 1.5}" opacity="${op}"/>`;
return svgWrap(w, h, body);
}

function marginGuidesPreview(w: number, h: number, s: GridSettings): string {
const m = Math.round(safe(s.cellSize, 24) * 2);
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
const dash = `${Math.max(4, s.lineThicknessPx * 4)} ${Math.max(4, s.lineThicknessPx * 3)}`;
const body = `
    <rect x="${m}" y="${m}" width="${Math.max(0, w - 2 * m)}" height="${Math.max(0, h - 2 * m)}" fill="none" stroke="${s.lineColor}" stroke-width="${t}" stroke-dasharray="${dash}" opacity="${op}"/>
    <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${s.lineColor}" stroke-width="${t * 0.7}" opacity="${op * 0.5}"/>
    <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t * 0.7}" opacity="${op * 0.5}"/>
`;
return svgWrap(w, h, body);
}

function ruleOfThirdsPreview(w: number, h: number, s: GridSettings): string {
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
let body = "";
for (let i = 1; i < 3; i++) {
    const x = (i / 3) * w;
    body += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>`;
}
for (let i = 1; i < 3; i++) {
    const y = (i / 3) * h;
    body += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>`;
}
return svgWrap(w, h, body);
}

function crosshairPreview(w: number, h: number, s: GridSettings): string {
const t = Math.max(0.5, s.lineThicknessPx);
const op = clamp01(s.opacity);
const cx = w / 2;
const cy = h / 2;
const arm = Math.min(w, h) * 0.35;
const body = `
    <line x1="${cx}" y1="${cy - arm}" x2="${cx}" y2="${cy + arm}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>
    <line x1="${cx - arm}" y1="${cy}" x2="${cx + arm}" y2="${cy}" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(3, s.lineThicknessPx * 3)}" fill="none" stroke="${s.lineColor}" stroke-width="${t}" opacity="${op}"/>
`;
return svgWrap(w, h, body);
}

export const GRID_PRESETS: GridPresetDef[] = [
{
    id: "square",
    name: "Square",
    description: "Even grid with major/minor lines.",
    renderSvg: squarePreview,
},
{
    id: "dotted",
    name: "Dotted",
    description: "Spaced dots — reads as a light guide.",
    renderSvg: dottedPreview,
},
{
    id: "horizontal",
    name: "Horizontal lines",
    description: "Baseline guides for body copy.",
    renderSvg: horizontalPreview,
},
{
    id: "vertical",
    name: "Vertical lines",
    description: "Column baseline without hierarchy.",
    renderSvg: verticalPreview,
},
{
    id: "columns",
    name: "Columns",
    description: "Editorial column layout.",
    renderSvg: columnsPreview,
},
{
    id: "isometric",
    name: "Isometric",
    description: "30°-ish grid for technical sketches.",
    renderSvg: isometricPreview,
},
{
    id: "margin-guides",
    name: "Margin guides",
    description: "Inset rectangle + centre lines.",
    renderSvg: marginGuidesPreview,
},
{
    id: "rule-of-thirds",
    name: "Rule of thirds",
    description: "Photography-style 3×3 composition.",
    renderSvg: ruleOfThirdsPreview,
},
{
    id: "crosshair",
    name: "Crosshair",
    description: "Centre target for aligning a focal point.",
    renderSvg: crosshairPreview,
},
];

/**
 * CSS background string for the fast-path presets. Returns `null` for
 * presets that must be rendered as SVG (dotted, isometric, margin-guides,
 * rule-of-thirds, crosshair).
 */
export function gridToCssBackground(s: GridSettings): string | null {
const cell = safe(s.cellSize, 24);
const px = Math.max(0.5, s.lineThicknessPx);
const color = s.lineColor;
const a = clamp01(s.opacity);
const major = Math.max(1, s.majorEvery || 1);
const majorEvery = major > 1 ? cell * major : 0;
const offset = `${s.offsetX}px ${s.offsetY}px`;

const line = (c: string, w: number, o: number) =>
    `linear-gradient(to right, ${c} ${w}px, transparent ${w}px)`;
const hline = (c: string, w: number, o: number) =>
    `linear-gradient(to bottom, ${c} ${w}px, transparent ${w}px)`;

const withAlpha = (hex: string, alpha: number): string => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const lineColor = withAlpha(color, a);
const majorColor = withAlpha(color, Math.min(1, a * 1.5));

switch (s.styleId) {
    case "square": {
    const parts = [line(lineColor, px, a), hline(lineColor, px, a)];
    if (majorEvery) {
        parts.unshift(line(majorColor, px * 1.6, a));
        parts.unshift(hline(majorColor, px * 1.6, a));
    }
    return parts.join(",") + `, transparent`;
    }
    case "horizontal":
    return hline(lineColor, px, a) + `, transparent`;
    case "vertical":
    return line(lineColor, px, a) + `, transparent`;
    case "columns": {
    const cols = Math.max(1, s.columns ?? 3);
    const parts: string[] = [];
    for (let i = 0; i < cols; i++) {
        const x = (i / cols) * 100;
        parts.push(
        `linear-gradient(to right, transparent calc(${x}% - ${px}px), ${lineColor} calc(${x}% - ${px}px), ${lineColor} ${x}%, transparent ${x}%)`,
        );
    }
    return parts.join(",") + `, transparent`;
    }
    case "dotted":
    case "isometric":
    case "margin-guides":
    case "rule-of-thirds":
    case "crosshair":
    return null;
    default:
    return null;
}
}

/** True if this preset can be drawn as a CSS background (fast path). */
export function isCssPreset(id: GridStyleId): boolean {
return (
    id === "square" ||
    id === "horizontal" ||
    id === "vertical" ||
    id === "columns"
);
}

/** Background-size CSS for `gridToCssBackground`. */
export function gridCssBackgroundSize(s: GridSettings): string {
const cell = safe(s.cellSize, 24);
const major = Math.max(1, s.majorEvery || 1);
const full = cell * major;
switch (s.styleId) {
    case "square":
    case "horizontal":
    case "vertical":
    return `${full}px ${full}px`;
    case "columns":
    return `100% 100%`;
    default:
    return `${full}px ${full}px`;
}
}

/** Background-position CSS for `gridToCssBackground`. */
export function gridCssBackgroundPosition(s: GridSettings): string {
return `${s.offsetX}px ${s.offsetY}px`;
}

/** Full style object ready to spread onto an element. */
export function gridCssStyle(s: GridSettings): {
backgroundImage?: string;
backgroundSize?: string;
backgroundPosition?: string;
} {
if (!isCssPreset(s.styleId)) return {};
const img = gridToCssBackground(s);
if (!img) return {};
return {
    backgroundImage: img,
    backgroundSize: gridCssBackgroundSize(s),
    backgroundPosition: gridCssBackgroundPosition(s),
};
}

/** Render a preset to an inline SVG data URL, for the gallery. */
export function renderPresetPreviewDataUrl(
id: GridStyleId,
widthPx: number,
heightPx: number,
settings: GridSettings,
): string {
const svg = getGridPreset(id).renderSvg(widthPx, heightPx, settings);
return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
