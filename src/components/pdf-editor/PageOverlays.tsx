"use client";

import React from "react";
import { Hash, Type, Droplets, X } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf-editor/store";
import type { OverlaySettings } from "@/lib/pdf-editor/types";

interface PageOverlaysProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Align = "left" | "center" | "right";

export function PageOverlays({ open, onOpenChange }: PageOverlaysProps) {
  const overlays = usePdfEditor((s) => s.overlays);
  const setOverlays = usePdfEditor((s) => s.setOverlays);
  const pages = usePdfEditor((s) => s.pages);

  if (!open) return null;

  const update = (patch: Partial<OverlaySettings>) => setOverlays(patch);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-11 items-center justify-between border-b border-zinc-800 px-4">
          <div>
            <h2 className="text-sm font-semibold">Advanced page overlays</h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1.5 hover:bg-zinc-800"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4 text-xs">
          <section className="space-y-3">
            <h3 className="font-medium text-zinc-200">Content</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <OverlayTextField
                label="Header"
                value={overlays.header}
                placeholder="Header text"
                onChange={(header) => update({ header })}
              />
              <OverlayTextField
                label="Footer"
                value={overlays.footer}
                placeholder="Footer text"
                onChange={(footer) => update({ footer })}
              />
              <OverlayTextField
                label="Watermark"
                value={overlays.watermark}
                placeholder="Watermark text"
                onChange={(watermark) => update({ watermark })}
              />
              <label className="flex items-center gap-2 self-end rounded border border-zinc-800 px-3 py-2">
                <input
                  type="checkbox"
                  checked={overlays.pageNumbers}
                  onChange={(event) =>
                    update({ pageNumbers: event.target.checked })
                  }
                />
                <Hash className="h-3.5 w-3.5" />
                Page numbers
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              Use {"{page}"} and {"{total}"} in header, footer, or watermark text.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-zinc-200">Alignment</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <AlignmentSelect
                label="Header"
                value={overlays.headerAlign}
                onChange={(headerAlign) => update({ headerAlign })}
              />
              <AlignmentSelect
                label="Footer"
                value={overlays.footerAlign}
                onChange={(footerAlign) => update({ footerAlign })}
              />
              <AlignmentSelect
                label="Page numbers"
                value={overlays.pageNumberAlign}
                onChange={(pageNumberAlign) => update({ pageNumberAlign })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Type className="h-3.5 w-3.5 text-zinc-400" />
              <h3 className="font-medium text-zinc-200">Page margins</h3>
              <span className="text-zinc-500">(points)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MarginField
                label="Left"
                value={overlays.leftMargin}
                onChange={(leftMargin) => update({ leftMargin })}
              />
              <MarginField
                label="Right"
                value={overlays.rightMargin}
                onChange={(rightMargin) => update({ rightMargin })}
              />
              <MarginField
                label="Top"
                value={overlays.topMargin}
                onChange={(topMargin) => update({ topMargin })}
              />
              <MarginField
                label="Bottom"
                value={overlays.bottomMargin}
                onChange={(bottomMargin) => update({ bottomMargin })}
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              Default margins are 36 pt (0.5 in). These settings apply to the
              header, footer, and page numbers on all {pages.length} pages.
            </p>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 flex items-center gap-2 font-medium text-zinc-200">
              <Droplets className="h-3.5 w-3.5" />
              Watermark
            </div>
            <p className="text-[11px] text-zinc-400">
              Watermarks are centered on each page. Text overlays are exported
              as editable PDF content and included in the editor autosave.
            </p>
          </section>
        </div>

        <div className="flex h-12 items-center justify-end gap-2 border-t border-zinc-800 px-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function OverlayTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
      />
    </label>
  );
}

function AlignmentSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Align;
  onChange: (value: Align) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Align)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </label>
  );
}

function MarginField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        max={1000}
        step={1}
        value={Number.isFinite(value) ? value : 36}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(Math.max(0, parsed));
        }}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
      />
    </label>
  );
}
