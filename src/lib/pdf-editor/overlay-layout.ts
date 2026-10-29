    import type { PageInfo, OverlaySettings } from "./types";

    export interface OverlayRect {
    text: string;
    rect: { x: number; y: number; w: number; h: number };
    align: "left" | "center" | "right";
    rotation: number;
    opacity: number;
    fontSize: number;
    color: string;
    }

    export function getOverlayRects(
    settings: OverlaySettings,
    page: PageInfo,
    pageIndex: number,
    totalPages: number,
    ): OverlayRect[] {
    const rects: OverlayRect[] = [];
    const margin = 36; // 0.5 inch
    const w = page.widthPt;
    const h = page.heightPt;

    const resolveText = (txt: string) =>
        txt
        .replace(/{page}/g, String(pageIndex + 1))
        .replace(/{total}/g, String(totalPages));

    if (settings.header) {
        rects.push({
        text: resolveText(settings.header),
        rect: { x: margin, y: h - margin - 20, w: w - margin * 2, h: 20 },
        align: "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (settings.footer) {
        rects.push({
        text: resolveText(settings.footer),
        rect: { x: margin, y: margin, w: w - margin * 2, h: 20 },
        align: "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (settings.pageNumbers) {
        rects.push({
        text: `${pageIndex + 1} / ${totalPages}`,
        rect: { x: w - margin - 50, y: margin, w: 50, h: 20 },
        align: "right",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (settings.watermark) {
        rects.push({
        text: resolveText(settings.watermark),
        rect: { x: 0, y: h / 2 - 40, w: w, h: 80 },
        align: "center",
        rotation: -45,
        opacity: 0.15,
        fontSize: 60,
        color: "#000000",
        });
    }
    return rects;
    }
