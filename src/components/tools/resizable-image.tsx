"use client";
import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useRef, useState } from "react";

function ResizableImageComponent(props: any) {
const { node, updateAttributes, selected } = props;
const [dragging, setDragging] = useState(false);
const imgRef = useRef<HTMLImageElement>(null);

const onMouseDown = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = node.attrs.width ?? imgRef.current?.width ?? 400;
    const startH = node.attrs.height ?? imgRef.current?.height ?? 300;

    const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let w = startW,
        h = startH;
    if (corner.includes("r")) w = Math.max(50, startW + dx);
    if (corner.includes("l")) w = Math.max(50, startW - dx);
    if (corner.includes("b")) h = Math.max(50, startH + dy);
    if (corner.includes("t")) h = Math.max(50, startH - dy);
    updateAttributes({ width: Math.round(w), height: Math.round(h) });
    };
    const onUp = () => {
    setDragging(false);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
};

return (
    <NodeViewWrapper className="relative inline-block my-2">
    <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        width={node.attrs.width}
        height={node.attrs.height}
        className={selected ? "ring-2 ring-blue-500" : ""}
    />
    {selected &&
        ["tl", "tr", "bl", "br"].map((corner) => (
        <span
            key={corner}
            onMouseDown={(e) => onMouseDown(e, corner)}
            className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nwse-resize"
            style={{
            top: corner.includes("t") ? -6 : "auto",
            bottom: corner.includes("b") ? -6 : "auto",
            left: corner.includes("l") ? -6 : "auto",
            right: corner.includes("r") ? -6 : "auto",
            cursor:
                corner === "tl" || corner === "br"
                ? "nwse-resize"
                : "nesw-resize",
            }}
        />
        ))}
    </NodeViewWrapper>
);
}

export const ResizableImage = Image.extend({
addAttributes() {
    return {
    ...this.parent?.(),
    width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
    },
    height: {
        default: null,
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
    },
    };
},
addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
},
});
