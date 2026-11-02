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
    headerAlign: "center",
    footerAlign: "center",
    pageNumberAlign: "right",
    leftMargin: 36,
    rightMargin: 36,
    topMargin: 36,
    bottomMargin: 36,
    };

    export function getOverlayRects(
    settings: OverlaySettings | undefined | null,
    page: PageInfo,
    pageIndex: number,
    totalPages: number,
    ): OverlayRect[] {
    const s = settings ?? DEFAULT_OVERLAYS;
    const rects: OverlayRect[] = [];
    const w = page.widthPt;
    const h = page.heightPt;
    const left = Math.max(0, Math.min(w, s.leftMargin ?? 36));
    const right = Math.max(0, Math.min(w - left, s.rightMargin ?? 36));
    const top = Math.max(0, Math.min(Math.max(0, h - 20), s.topMargin ?? 36));
    const bottom = Math.max(0, Math.min(Math.max(0, h - 20), s.bottomMargin ?? 36));
    const contentWidth = Math.max(0, w - left - right);

    const pageNumber = pageIndex + 1;
    const resolveText = (txt: string) =>
        txt
        .replace(/{page}/g, String(pageNumber))
        .replace(/{total}/g, String(totalPages));

    if (s.header) {
        rects.push({
        text: resolveText(s.header),
        rect: { x: left, y: h - top - 20, w: contentWidth, h: 20 },
        align: s.headerAlign ?? "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (s.footer) {
        rects.push({
        text: resolveText(s.footer),
        rect: { x: left, y: bottom, w: contentWidth, h: 20 },
        align: s.footerAlign ?? "center",
        rotation: 0,
        opacity: 1,
        fontSize: 10,
        color: "#666666",
        });
    }
    if (s.pageNumbers) {
        rects.push({
        text: `${pageNumber} / ${totalPages}`,
        rect: { x: left, y: bottom, w: contentWidth, h: 20 },
        align: s.pageNumberAlign ?? "right",
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
        