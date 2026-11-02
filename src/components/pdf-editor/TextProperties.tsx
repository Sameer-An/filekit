// src/components/pdf-editor/TextProperties.tsx
// Full text-style properties panel for selected text-run / new-text objects.
// Shows detected values on selection; supports multi-selection with "Mixed".
// Keyboard shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+U (underline).
//
// IMPORTANT: ALL React hooks run before the early return (`if (selected.length === 0) return null`).
// This satisfies react-hooks/rules-of-hooks. Handlers are plain functions (no useCallback/useRef)
// so React Compiler can memoize them automatically.
"use client";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type {
  PDFObject,
  TextRunObject,
  NewTextObject,
  StyledTextRun,
} from "@/lib/pdf-editor/types";
import {
  applyStyleToRange,
  materializeRuns,
  styleForRange,
  type StyledRunPatch,
} from "@/lib/pdf-editor/text-runs";
import {
  FONT_CATALOGUE,
  getFontCandidateGroups,
  getFontCssStack,
} from "@/lib/pdf-editor/font-catalogue";
import {
  importUploadedFont,
  loadUploadedFontCatalogue,
} from "@/lib/pdf-editor/uploaded-fonts";
import type { UploadedFontMetadata } from "@/lib/pdf-editor/idb";

const COMMON_SIZES = [
  6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72,
];

// ─── Recently used fonts (localStorage, max 5) ───────────────────────────────

function getRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem("fk_recent_fonts");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecentFont(font: string): void {
  try {
    const existing = getRecentFonts().filter((f) => f !== font);
    localStorage.setItem(
      "fk_recent_fonts",
      JSON.stringify([font, ...existing].slice(0, 5)),
    );
  } catch {
    /* localStorage unavailable — ignore */
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TextLike = TextRunObject | NewTextObject;
type StyleKey = "bold" | "italic" | "underline" | "strike";
type StyleState = boolean | "Mixed";

function isTextLike(o: PDFObject | undefined): o is TextLike {
  return !!o && (o.kind === "text-run" || o.kind === "new-text");
}

function mixed<T>(arr: T[], key: keyof T): T[keyof T] | "Mixed" {
  if (arr.length === 0) return "Mixed";
  const first = arr[0][key];
  return arr.every((a) => a[key] === first) ? first : "Mixed";
}

function objectStyleValue(
  obj: TextLike,
  key: StyleKey,
  selection?: { objectId: string; start: number; end: number } | null,
): StyleState {
  if (
    selection?.objectId === obj.id &&
    selection.start < selection.end
  ) {
    return (
      styleForRange(obj, key, selection.start, selection.end) ??
      (obj[key] === true)
    );
  }

  const runs = obj.runs;
  if (runs && runs.length > 0) {
    let first: boolean | undefined;
    for (const run of runs) {
      const value = run[key] ?? obj[key] ?? false;
      if (first === undefined) {
        first = value;
      } else if (first !== value) {
        return "Mixed";
      }
    }
    return first ?? false;
  }
  return obj[key] === true;
}

function mixedStyle(
  selected: TextLike[],
  key: StyleKey,
  selection?: { objectId: string; start: number; end: number } | null,
): StyleState {
  const hasRange =
    selection !== null &&
    selection !== undefined &&
    selection.start < selection.end;
  const rangeTargets = hasRange
    ? selected.filter((obj) => obj.id === selection.objectId)
    : [];
  const targets = rangeTargets.length > 0 ? rangeTargets : selected;
  let first: boolean | undefined;
  for (const obj of targets) {
    const value = objectStyleValue(obj, key, selection);
    if (value === "Mixed") return "Mixed";
    if (first === undefined) {
      first = value;
    } else if (first !== value) {
      return "Mixed";
    }
  }
  return first ?? false;
}

function fontForRange(
  obj: TextLike,
  start: number,
  end: number,
): string | "Mixed" {
  const runs = materializeRuns(obj);
  let position = 0;
  let first: string | undefined;
  for (const run of runs) {
    const runEnd = position + run.text.length;
    if (runEnd > start && position < end) {
      const family = run.fontFamily ?? obj.fontFamily;
      if (first === undefined) first = family;
      else if (family !== first) return "Mixed";
    }
    position = runEnd;
  }
  return first ?? obj.fontFamily;
}

function mutateTextStyle(
  draft: { objects: Record<string, PDFObject> },
  id: string,
  key: StyleKey,
  value: boolean,
  selection?: { objectId: string; start: number; end: number } | null,
): void {
  const cur = draft.objects[id];
  if (!cur || (cur.kind !== "text-run" && cur.kind !== "new-text")) return;

  if (
    selection?.objectId === id &&
    selection.start < selection.end
  ) {
    const stylePatch: StyledRunPatch = { [key]: value };
    draft.objects[id] = applyStyleToRange(
      cur,
      selection.start,
      selection.end,
      stylePatch,
    ) as PDFObject;
    return;
  }

  const patch = { [key]: value } as Partial<TextLike>;
  let next = { ...cur, ...patch } as TextLike;

  if (next.runs && next.runs.length > 0) {
    const runPatch = { [key]: value } as Partial<StyledTextRun>;
    next = {
      ...next,
      runs: next.runs.map((run) => ({ ...run, ...runPatch })),
    };
  }

  if (next.kind === "text-run") {
    next = { ...next, dirty: true };
  }

  draft.objects[id] = next as PDFObject;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextProperties() {
  // ══════════════════════════════════════════════════════════════════════════
  // ALL HOOKS FIRST — no early return above this line
  // ══════════════════════════════════════════════════════════════════════════

  const { selectedIds, objects, commit, textSelection } = usePdfEditor(
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      objects: s.objects,
      commit: s.commit,
      textSelection: s.textSelection,
    })),
  );

  const [fontSearch, setFontSearch] = useState("");
  const [uploadedFonts, setUploadedFonts] = useState<UploadedFontMetadata[]>([]);
  const [fontError, setFontError] = useState<string | null>(null);
  const [fontUploading, setFontUploading] = useState(false);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void loadUploadedFontCatalogue()
      .then((fonts) => {
        if (active) setUploadedFonts(fonts);
      })
      .catch((error: unknown) => {
        if (active) {
          setFontError(
            error instanceof Error
              ? `Could not load imported fonts: ${error.message}`
              : "Could not load imported fonts.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Global Ctrl+B / Ctrl+I / Ctrl+U handler.
  // Reads live state from the store at event time — no refs, no stale closures.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const st = usePdfEditor.getState();
      const sel = st.selectedIds.map((id) => st.objects[id]).filter(isTextLike);
      if (sel.length === 0) return;

      let key: StyleKey | null = null;
      if (e.key === "b" || e.key === "B") key = "bold";
      else if (e.key === "i" || e.key === "I") key = "italic";
      else if (e.key === "u" || e.key === "U") key = "underline";
      if (!key) return;

      e.preventDefault();
      const range =
        st.textSelection && st.textSelection.start < st.textSelection.end
          ? st.textSelection
          : null;
      const nextValue = mixedStyle(sel, key, range) === true ? false : true;

      st.commit("Text style", (d) => {
        for (const obj of sel) {
          if (range && obj.id !== range.objectId) continue;
          mutateTextStyle(d, obj.id, key, nextValue, range);
        }
      });
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // EARLY RETURN — safe, all hooks above have already been called
  // ══════════════════════════════════════════════════════════════════════════

  const selected = selectedIds.map((id) => objects[id]).filter(isTextLike);
  if (selected.length === 0) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // Derived values (plain reads — no hooks)
  // ══════════════════════════════════════════════════════════════════════════

  const first = selected[0];

  // Cheap localStorage read on every render — no state, no effect.
  // After any style change, `commit` triggers a re-render so the list is fresh.
  const recentFonts = typeof window !== "undefined" ? getRecentFonts() : [];

  // ══════════════════════════════════════════════════════════════════════════
  // Event handlers (plain functions — React Compiler memoizes automatically)
  // ══════════════════════════════════════════════════════════════════════════

  const apply = (patch: Partial<TextLike>) => {
    commit("Text style", (d) => {
      for (const obj of selected) {
        const cur = d.objects[obj.id];
        if (!cur || (cur.kind !== "text-run" && cur.kind !== "new-text"))
          continue;
        const extra = cur.kind === "text-run" ? { dirty: true } : {};
        const runPatch: Partial<StyledTextRun> = {};
        if (patch.fontFamily !== undefined)
          runPatch.fontFamily = patch.fontFamily;
        if (patch.fontSize !== undefined) runPatch.fontSize = patch.fontSize;
        if (patch.color !== undefined) runPatch.color = patch.color;
        if (patch.letterSpacing !== undefined)
          runPatch.letterSpacing = patch.letterSpacing;
        d.objects[obj.id] = {
          ...cur,
          ...extra,
          ...patch,
          ...(cur.runs && Object.keys(runPatch).length > 0
            ? { runs: cur.runs.map((run) => ({ ...run, ...runPatch })) }
            : {}),
        } as PDFObject;
      }
    });
  };

  const toggle = (key: StyleKey) => {
    const range =
      textSelection && textSelection.start < textSelection.end
        ? textSelection
        : null;
    const nextValue =
      mixedStyle(selected, key, range) === true ? false : true;
    commit("Text style", (d) => {
      for (const obj of selected) {
        if (range && obj.id !== range.objectId) continue;
        mutateTextStyle(d, obj.id, key, nextValue, range);
      }
    });
  };

  const applyFont = (font: string) => {
    const activeRange =
      textSelection && textSelection.start < textSelection.end
        ? textSelection
        : null;
    commit("Change font family", (d) => {
      for (const obj of selected) {
        const cur = d.objects[obj.id];
        if (!isTextLike(cur)) continue;
        if (activeRange?.objectId === cur.id) {
          d.objects[cur.id] = applyStyleToRange(
            cur,
            activeRange.start,
            activeRange.end,
            { fontFamily: font },
          ) as PDFObject;
          continue;
        }
        if (activeRange) continue;
        d.objects[cur.id] = {
          ...cur,
          ...(cur.kind === "text-run" ? { dirty: true } : {}),
          fontFamily: font,
          ...(cur.runs
            ? {
                runs: cur.runs.map((run) => ({
                  ...run,
                  fontFamily: font,
                })),
              }
            : {}),
        } as PDFObject;
      }
    });
    pushRecentFont(font);
  };

  const handleFontUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFontUploading(true);
    setFontError(null);
    try {
      const imported = await importUploadedFont(file);
      setUploadedFonts(await loadUploadedFontCatalogue());
      applyFont(imported.family);
    } catch (error) {
      setFontError(
        error instanceof Error ? error.message : "The font could not be imported.",
      );
    } finally {
      setFontUploading(false);
    }
  };

  const handleReset = () => {
    commit("Reset style", (d) => {
      for (const obj of selected) {
        if (obj.kind !== "text-run") continue;
        const cur = d.objects[obj.id] as TextRunObject | undefined;
        if (!cur) continue;
        // Reset = clear dirty so the ORIGINAL PDF bytes show through again.
        d.objects[obj.id] = {
          ...cur,
          dirty: false,
          text: cur.originalText,
          runs: cur.originalRuns,
          origRect: undefined,
        } as PDFObject;
      }
    });
  };

  // ── Computed mixed-value display ─────────────────────────────────────────
  const range =
    textSelection && textSelection.start < textSelection.end
      ? textSelection
      : null;
  const rangeTargets = range
    ? selected.filter((obj) => obj.id === range.objectId)
    : [];
  const ff =
    range && rangeTargets.length > 0
      ? fontForRange(rangeTargets[0], range.start, range.end)
      : mixed(selected, "fontFamily");
  const fs = mixed(selected, "fontSize");
  const col = mixed(selected, "color");
  const al = mixed(selected, "align");
  const lh = mixed(selected, "lineHeight");
  const ls = mixed(selected, "letterSpacing");
  const op = mixed(selected, "opacity");
  const isBold = mixedStyle(selected, "bold", range);
  const isItalic = mixedStyle(selected, "italic", range);
  const isUnderline = mixedStyle(selected, "underline", range);
  const isStrike = mixedStyle(selected, "strike", range);

  const displayFontSize =
    fs === "Mixed" ? "" : String(Math.round((fs as number) * 10) / 10);
  const displayColor = col === "Mixed" ? "#000000" : (col as string);
  const displayLh = lh === "Mixed" ? "" : String(lh);
  const displayLs = ls === "Mixed" ? "" : String(ls);
  const displayOp =
    op === "Mixed" ? "" : String(Math.round((op as number) * 100));

  const fontGroups = getFontCandidateGroups().map((group) => ({
    label: group.label,
    fonts: group.fonts.map((font) => ({
      family: font.family,
      label: font.family,
    })),
  }));
  const uploadedGroup = {
    label: "Imported fonts",
    fonts: uploadedFonts.map((font) => ({
      family: font.family,
      label: font.family.replace(/\s+\(Imported\)$/, ""),
    })),
  };
  const search = fontSearch.trim().toLowerCase();
  const filteredGroups = search
    ? [...fontGroups, uploadedGroup]
        .map((group) => ({
          ...group,
          fonts: group.fonts.filter((font) =>
            font.label.toLowerCase().includes(search),
          ),
        }))
        .filter((group) => group.fonts.length > 0)
    : [
        ...(recentFonts.length > 0
          ? [
              {
                label: "Recently Used",
                fonts: recentFonts.map((family) => ({
                  family,
                  label: family.replace(/\s+\(Imported\)$/, ""),
                })),
              },
            ]
          : []),
        uploadedGroup,
        ...fontGroups,
      ];
  const knownFontFamilies = new Set([
    ...FONT_CATALOGUE.map((font) => font.family),
    ...uploadedFonts.map((font) => font.family),
  ]);
  const missingCurrentFont =
    typeof ff === "string" && !knownFontFamilies.has(ff) ? ff : null;

  const canReset = selected.some(
    (s) => s.kind === "text-run" && (s as TextRunObject).dirty,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="space-y-3 text-xs text-zinc-300 select-none"
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "SELECT") e.stopPropagation();
      }}
    >
      {/* ── Font selector ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-zinc-500">
          Font
        </label>
        <input
          type="text"
          placeholder="Search fonts…"
          value={fontSearch}
          onChange={(e) => setFontSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs mb-1"
        />
        <select
          value={ff === "Mixed" ? undefined : (ff as string)}
          onChange={(e) => applyFont(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
          style={{
            fontFamily:
              ff === "Mixed" ? undefined : getFontCssStack(ff as string),
          }}
          size={1}
        >
          {ff === "Mixed" && (
            <option value="" disabled>
              — Mixed —
            </option>
          )}
          {missingCurrentFont && (
            <optgroup label="Current document font">
              <option value={missingCurrentFont}>
                {missingCurrentFont} · unavailable in catalogue
              </option>
            </optgroup>
          )}
          {filteredGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((font) => (
                <option
                  key={font.family}
                  value={font.family}
                  style={{ fontFamily: getFontCssStack(font.family) }}
                >
                  {font.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf,application/x-font-opentype"
            className="hidden"
            aria-label="Choose a TTF or OTF font"
            onChange={handleFontUpload}
          />
          <button
            type="button"
            disabled={fontUploading}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fontInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {fontUploading ? "Importing…" : "Import TTF/OTF"}
          </button>
          <span className="text-[10px] text-zinc-500">
            10 MB max · saved locally
          </span>
        </div>
        <p className="text-[10px] text-zinc-500">
          Device fonts may be unavailable on another device; PDF export uses a
          standard-font substitute. Only Noto Sans is bundled. Import fonts
          only when you have permission to use and embed them.
        </p>
        {fontError && (
          <p role="alert" className="text-[11px] text-red-400">
            {fontError}
          </p>
        )}
      </div>

      {/* ── B I U S ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {(
          [
            ["bold", "B", "font-bold", "Ctrl+B"],
            ["italic", "I", "italic", "Ctrl+I"],
            ["underline", "U", "underline", "Ctrl+U"],
            ["strike", "S", "line-through", ""],
          ] as const
        ).map(([key, label, cls, shortcut]) => {
          const value =
            key === "bold"
              ? isBold
              : key === "italic"
                ? isItalic
                : key === "underline"
                  ? isUnderline
                  : isStrike;
          return (
            <button
              key={key}
              type="button"
              title={shortcut ? `${key} (${shortcut})` : key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(key)}
              aria-pressed={value === true}
              className={`px-2 py-1 rounded border ${cls} ${
                value === true
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : value === "Mixed"
                    ? "bg-zinc-700 border-zinc-600 text-zinc-400"
                    : "border-zinc-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Size + Colour ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              apply({
                fontSize: Math.max(
                  4,
                  (fs === "Mixed" ? (first.fontSize ?? 12) : (fs as number)) -
                    1,
                ),
              })
            }
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded-l text-zinc-400 hover:text-white"
            title="Decrease size"
          >
            −
          </button>
          <input
            type="number"
            value={displayFontSize}
            placeholder={fs === "Mixed" ? "Mixed" : ""}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) =>
              apply({
                fontSize: Math.max(4, parseFloat(e.target.value) || 12),
              })
            }
            className="w-12 bg-zinc-900 border-y border-zinc-700 px-1 py-0.5 text-center appearance-none"
            title="Font size"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              apply({
                fontSize: Math.min(
                  300,
                  (fs === "Mixed" ? (first.fontSize ?? 12) : (fs as number)) +
                    1,
                ),
              })
            }
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded-r text-zinc-400 hover:text-white"
            title="Increase size"
          >
            +
          </button>
        </div>

        <select
          value=""
          onChange={(e) => apply({ fontSize: parseFloat(e.target.value) })}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5"
          title="Common sizes"
        >
          <option value="" disabled>
            pt
          </option>
          {COMMON_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="relative flex items-center gap-1">
          <input
            type="color"
            value={displayColor}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => apply({ color: e.target.value })}
            className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer p-0.5"
            title={col === "Mixed" ? "Mixed colours" : `Text color: ${col}`}
          />
          <input
            type="text"
            value={col === "Mixed" ? "Mixed" : (col as string)}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(v)) apply({ color: v });
            }}
            className="w-20 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 font-mono"
            placeholder="#000000"
            title="Hex colour"
          />
        </div>
      </div>

      {/* ── Alignment ────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-zinc-500">
          Align
        </label>
        <div className="flex items-center gap-1">
          {(["left", "center", "right", "justify"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply({ align: a })}
              aria-pressed={al === a}
              className={`px-2 py-1 rounded border ${
                al === a
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : al === "Mixed" && a === "left"
                    ? "bg-zinc-700 border-zinc-600"
                    : "border-zinc-700"
              }`}
            >
              {a === "left"
                ? "⬅"
                : a === "center"
                  ? "☰"
                  : a === "right"
                    ? "➡"
                    : "⇔"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Line-height / Letter-spacing / Opacity ────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block">
            Line-h
          </label>
          <input
            type="number"
            step="0.05"
            min="0.5"
            max="5"
            value={displayLh}
            placeholder={lh === "Mixed" ? "—" : "1.2"}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) =>
              apply({
                lineHeight: Math.max(
                  0.5,
                  Math.min(5, parseFloat(e.target.value) || 1.2),
                ),
              })
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-center"
            title="Line height multiplier"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block">
            Spacing
          </label>
          <input
            type="number"
            step="0.5"
            min="-10"
            max="100"
            value={displayLs}
            placeholder={ls === "Mixed" ? "—" : "0"}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) =>
              apply({ letterSpacing: parseFloat(e.target.value) || 0 })
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-center"
            title="Letter spacing (pt)"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block">
            Opacity %
          </label>
          <input
            type="number"
            step="5"
            min="0"
            max="100"
            value={displayOp}
            placeholder={op === "Mixed" ? "—" : "100"}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) =>
              apply({
                opacity: Math.max(
                  0,
                  Math.min(1, (parseFloat(e.target.value) || 100) / 100),
                ),
              })
            }
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-center"
            title="Opacity 0–100%"
          />
        </div>
      </div>

      {/* ── Reset button ─────────────────────────────────────────────────── */}
      {canReset && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleReset}
          className="w-full py-1 rounded border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-[10px] uppercase tracking-wide transition-colors"
          title="Reset to original extracted style"
        >
          Reset to original style
        </button>
      )}

      {/* ── Substitution note ─────────────────────────────────────────────── */}
      {selected.length === 1 &&
        selected[0].kind === "text-run" &&
        (selected[0] as TextRunObject).substituted && (
          <p className="text-[10px] text-amber-400/80 leading-tight">
            ⚠ Font substituted in PDF export (original not available).
          </p>
        )}
    </div>
  );
}
