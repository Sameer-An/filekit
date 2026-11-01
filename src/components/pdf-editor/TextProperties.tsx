// src/components/pdf-editor/TextProperties.tsx
// Full text-style properties panel for selected text-run / new-text objects.
// Shows detected values on selection; supports multi-selection with "Mixed".
// Keyboard shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+U (underline).
//
// IMPORTANT: ALL React hooks run before the early return (`if (selected.length === 0) return null`).
// This satisfies react-hooks/rules-of-hooks. Handlers are plain functions (no useCallback/useRef)
// so React Compiler can memoize them automatically.
"use client";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type {
  PDFObject,
  TextRunObject,
  NewTextObject,
} from "@/lib/pdf-editor/types";

// ─── Font catalogue ──────────────────────────────────────────────────────────

interface FontGroup {
  label: string;
  fonts: string[];
}

const FONT_GROUPS: FontGroup[] = [
  {
    label: "Sans-serif",
    fonts: [
      "Arial",
      "Helvetica",
      "Verdana",
      "Tahoma",
      "Trebuchet MS",
      "Segoe UI",
      "Calibri",
      "Roboto",
      "Open Sans",
      "Lato",
      "Montserrat",
      "Poppins",
      "Inter",
      "Noto Sans",
    ],
  },
  {
    label: "Serif",
    fonts: [
      "Times New Roman",
      "Georgia",
      "Cambria",
      "Garamond",
      "Palatino",
      "Merriweather",
      "Playfair Display",
    ],
  },
  {
    label: "Monospace",
    fonts: ["Courier New", "Consolas", "Roboto Mono"],
  },
  {
    label: "Display",
    fonts: ["Comic Sans MS", "Impact"],
  },
];

const ALL_FONTS = FONT_GROUPS.flatMap((g) => g.fonts);

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

function isTextLike(o: PDFObject | undefined): o is TextLike {
  return !!o && (o.kind === "text-run" || o.kind === "new-text");
}

function mixed<T>(arr: T[], key: keyof T): T[keyof T] | "Mixed" {
  if (arr.length === 0) return "Mixed";
  const first = arr[0][key];
  return arr.every((a) => a[key] === first) ? first : "Mixed";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TextProperties() {
  // ══════════════════════════════════════════════════════════════════════════
  // ALL HOOKS FIRST — no early return above this line
  // ══════════════════════════════════════════════════════════════════════════

  const { selectedIds, objects, commit } = usePdfEditor(
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      objects: s.objects,
      commit: s.commit,
    })),
  );

  const [fontSearch, setFontSearch] = useState("");

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

      const firstNow = sel[0];

      let key: "bold" | "italic" | "underline" | null = null;
      if (e.key === "b" || e.key === "B") key = "bold";
      else if (e.key === "i" || e.key === "I") key = "italic";
      else if (e.key === "u" || e.key === "U") key = "underline";
      if (!key) return;

      e.preventDefault();
      const patch = { [key]: !firstNow[key] } as Partial<TextLike>;

      st.commit("Text style", (d) => {
        for (const obj of sel) {
          const cur = d.objects[obj.id];
          if (!cur || (cur.kind !== "text-run" && cur.kind !== "new-text"))
            continue;
          const extra = cur.kind === "text-run" ? { dirty: true } : {};
          d.objects[obj.id] = { ...cur, ...extra, ...patch } as PDFObject;
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
        d.objects[obj.id] = { ...cur, ...extra, ...patch } as PDFObject;
      }
    });
  };

  const toggle = (key: "bold" | "italic" | "underline" | "strike") => {
    apply({ [key]: !first[key] } as Partial<TextLike>);
  };

  const applyFont = (font: string) => {
    apply({ fontFamily: font });
    pushRecentFont(font);
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
          origRect: undefined,
        } as PDFObject;
      }
    });
  };

  // ── Computed mixed-value display ─────────────────────────────────────────
  const ff = mixed(selected, "fontFamily");
  const fs = mixed(selected, "fontSize");
  const col = mixed(selected, "color");
  const al = mixed(selected, "align");
  const lh = mixed(selected, "lineHeight");
  const ls = mixed(selected, "letterSpacing");
  const op = mixed(selected, "opacity");
  const isBold = mixed(selected, "bold");
  const isItalic = mixed(selected, "italic");
  const isUnderline = mixed(selected, "underline");
  const isStrike = mixed(selected, "strike");

  const displayFontSize =
    fs === "Mixed" ? "" : String(Math.round((fs as number) * 10) / 10);
  const displayColor = col === "Mixed" ? "#000000" : (col as string);
  const displayLh = lh === "Mixed" ? "" : String(lh);
  const displayLs = ls === "Mixed" ? "" : String(ls);
  const displayOp =
    op === "Mixed" ? "" : String(Math.round((op as number) * 100));

  const filteredGroups = fontSearch.trim()
    ? [
        {
          label: "Results",
          fonts: ALL_FONTS.filter((f) =>
            f.toLowerCase().includes(fontSearch.toLowerCase()),
          ),
        },
      ]
    : [
        ...(recentFonts.length > 0
          ? [{ label: "Recently Used", fonts: recentFonts }]
          : []),
        ...FONT_GROUPS,
      ];

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
          style={{ fontFamily: ff === "Mixed" ? undefined : (ff as string) }}
          size={5}
        >
          {ff === "Mixed" && (
            <option value="" disabled>
              — Mixed —
            </option>
          )}
          {filteredGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fonts.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
