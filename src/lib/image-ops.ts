export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob)
          reject(new Error("This browser could not encode the image."));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export async function fileToCanvas(
  file: File,
  options?: {
    width?: number;
    height?: number;
    rotateDeg?: number;
    flipH?: boolean;
    flipV?: boolean;
    filter?: string;
    crop?: { x: number; y: number; w: number; h: number };
  },
): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;

  if (options?.crop) {
    sx = Math.round((options.crop.x / 100) * bmp.width);
    sy = Math.round((options.crop.y / 100) * bmp.height);
    sw = Math.round((options.crop.w / 100) * bmp.width);
    sh = Math.round((options.crop.h / 100) * bmp.height);
    sw = Math.max(1, Math.min(sw, bmp.width - sx));
    sh = Math.max(1, Math.min(sh, bmp.height - sy));
  }

  const rotate = (((options?.rotateDeg || 0) % 360) + 360) % 360;
  const swap = rotate === 90 || rotate === 270;
  const sourceW = swap ? sh : sw;
  const sourceH = swap ? sw : sh;
  let targetW = options?.width || sourceW;
  let targetH = options?.height || sourceH;

  if (options?.width && !options?.height) {
    targetW = options.width;
    targetH = Math.max(1, Math.round((options.width * sourceH) / sourceW));
  } else if (options?.height && !options?.width) {
    targetH = options.height;
    targetW = Math.max(1, Math.round((options.height * sourceW) / sourceH));
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  if (options?.filter) ctx.filter = options.filter;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(options?.flipH ? -1 : 1, options?.flipV ? -1 : 1);
  const drawW = swap ? canvas.height : canvas.width;
  const drawH = swap ? canvas.width : canvas.height;
  ctx.drawImage(bmp, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  bmp.close();
  return canvas;
}

export async function fileToJpegBytes(
  file: File,
  quality = 0.92,
): Promise<Uint8Array> {
  const canvas = await fileToCanvas(file);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Minimal ICO container wrapping a PNG payload (supported by modern Windows/browsers). */
export function pngToIco(png: Uint8Array, size: number): Blob {
  const header = new ArrayBuffer(22);
  const view = new DataView(header);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, size >= 256 ? 0 : size);
  view.setUint8(7, size >= 256 ? 0 : size);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.byteLength, true);
  view.setUint32(18, 22, true);

  // FIX: TypeScript ko bataya ki ye normal ArrayBuffer hi hai, SharedArrayBuffer nahi
  return new Blob([header, png as unknown as Uint8Array<ArrayBuffer>], {
    type: "image/x-icon",
  });
}
