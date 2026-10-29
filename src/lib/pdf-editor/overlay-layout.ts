    // src/lib/pdf-editor/overlay-layout.ts
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

    /** 所有 overlay 都关闭/为空时的安全默认值。 */
    export const DEFAULT_OVERLAYS: OverlaySettings = {
    header: "",
    footer: "",
    watermark: "",
    pageNumbers: false,
    };

    export function getOverlayRects(
    settings: OverlaySettings | undefined | null,
    page: PageInfo,
    pageIndex: number,
    totalPages: number,
    ): OverlayRect[] {
    const s = settings ?? DEFAULT_OVERLAYS;
    const rects: OverlayRect[] = [];
    const margin = 36; // 0.5 inch
    const w = page.widthPt;
    const h = page.heightPt;

    const resolveText = (txt: string) =>
        txt
        .replace(/{page}/g, String(pageIndex + 1))
        .replace(/{total}/g, String(totalPages));

    if (s.header) {
        rects.push({
        text: resolveText(s.header),
        rect: { x: margin, y: h - margin - 20, w: w - margin * 2, h: 20 },
        align: "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (s.footer) {
        rects.push({
        text: resolveText(s.footer),
        rect: { x: margin, y: margin, w: w - margin * 2, h: 20 },
        align: "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (s.pageNumbers) {
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
    if (s.watermark) {
        rects.push({
        text: resolveText(s.watermark),
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
        