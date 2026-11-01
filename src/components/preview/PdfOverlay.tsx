"use client";

import React from "react";
import { PreviewEffects } from "./types";

interface PdfOverlayProps {
  effects?: PreviewEffects;
  currentPage: number;
}

function formatPageLabel(page: number, format?: string): string {
  switch (format) {
    case "roman":
      return toRoman(page);
    case "alpha":
      return String.fromCharCode(64 + ((page - 1) % 26) + 1);
    case "dash":
      return `- ${page} -`;
    case "page-n":
      return `Page ${page}`;
    case "numbers":
    default:
      return `${page}`;
  }
}

function toRoman(num: number): string {
  const lookup: [string, number][] = [
    ["m", 1000],
    ["cm", 900],
    ["d", 500],
    ["cd", 400],
    ["c", 100],
    ["xc", 90],
    ["l", 50],
    ["xl", 40],
    ["x", 10],
    ["ix", 9],
    ["v", 5],
    ["iv", 4],
    ["i", 1],
  ];
  let res = "";
  let n = num;
  for (const [letter, value] of lookup) {
    while (n >= value) {
      res += letter;
      n -= value;
    }
  }
  return res || "i";
}

export function PdfOverlay({ effects, currentPage }: PdfOverlayProps) {
  if (!effects?.watermarkText && !effects?.pageNumbers) return null;

  return (
    <>
      {/* Live Watermark Overlay */}
      {effects?.watermarkText && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          {effects.watermarkPosition === "tile" ? (
            <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-8 items-center justify-items-center opacity-30 select-none pointer-events-none">
              {Array.from({ length: 9 }).map((_, idx) => (
                <span
                  key={idx}
                  className="font-bold -rotate-45 truncate max-w-full"
                  style={{
                    color: effects.watermarkColor || "#999999",
                    fontSize: `${Math.max(12, (effects.watermarkFontSize || 44) * 0.4)}px`,
                    opacity: effects.watermarkOpacity ?? 0.3,
                  }}
                >
                  {effects.watermarkText}
                </span>
              ))}
            </div>
          ) : effects.watermarkPosition === "top" ? (
            <div className="absolute top-6 left-0 right-0 flex justify-center">
              <span
                className="font-bold select-none text-center"
                style={{
                  color: effects.watermarkColor || "#999999",
                  fontSize: `${effects.watermarkFontSize || 44}px`,
                  opacity: effects.watermarkOpacity ?? 0.3,
                }}
              >
                {effects.watermarkText}
              </span>
            </div>
          ) : effects.watermarkPosition === "bottom" ? (
            <div className="absolute bottom-6 left-0 right-0 flex justify-center">
              <span
                className="font-bold select-none text-center"
                style={{
                  color: effects.watermarkColor || "#999999",
                  fontSize: `${effects.watermarkFontSize || 44}px`,
                  opacity: effects.watermarkOpacity ?? 0.3,
                }}
              >
                {effects.watermarkText}
              </span>
            </div>
          ) : (
            <span
              className={`font-bold select-none text-center ${
                effects.watermarkPosition === "center" ? "" : "transform -rotate-45"
              }`}
              style={{
                color: effects.watermarkColor || "#999999",
                fontSize: `calc(1.5rem + 1.5vw)`,
                opacity: effects.watermarkOpacity ?? 0.3,
              }}
            >
              {effects.watermarkText}
            </span>
          )}
        </div>
      )}

      {/* Live Page Numbers Overlay */}
      {effects?.pageNumbers && (
        <div
          className={`absolute pointer-events-none text-xs font-mono select-none px-4 py-2 ${
            effects.pageNumbers.position === "top-center"
              ? "top-1 left-1/2 -translate-x-1/2"
              : effects.pageNumbers.position === "top-right"
                ? "top-1 right-2"
                : effects.pageNumbers.position === "bottom-right"
                  ? "bottom-1 right-2"
                  : "bottom-1 left-1/2 -translate-x-1/2"
          }`}
          style={{ color: "#4b5563" }}
        >
          {formatPageLabel(
            (effects.pageNumbers.start ?? 1) + (currentPage - 1),
            effects.pageNumbers.format,
          )}
        </div>
      )}
    </>
  );
}
