export const MAX_RASTER_DIMENSION = 16_384;
export const MAX_RASTER_PIXELS = 64_000_000;

export interface SvgDimensions {
  width: number;
  height: number;
}

export interface PublicationDimensions extends SvgDimensions {
  widthMm: number;
  heightMm: number;
  dpi: number;
}

export interface SvgExportOptions {
  baseName: string;
  width?: number;
  height?: number;
  widthMm?: number;
}

export interface RasterExportOptions extends SvgDimensions {
  baseName: string;
  quality?: number;
  background?: string;
  dpi?: number;
}

const positive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}は正の数で指定してください。`);
  return value;
};

const rasterDimensions = (width: number, height: number): SvgDimensions => {
  const w = Math.max(1, Math.round(positive(width, "幅")));
  const h = Math.max(1, Math.round(positive(height, "高さ")));
  if (w > MAX_RASTER_DIMENSION || h > MAX_RASTER_DIMENSION || w * h > MAX_RASTER_PIXELS) {
    throw new Error("画像が大きすぎます。各辺16,384 px以下、合計6,400万画素以下にしてください。");
  }
  return { width: w, height: h };
};

const validDpi = (dpi: number): number => {
  positive(dpi, "解像度(dpi)");
  if (dpi > 9600) throw new Error("解像度は9,600 dpi以下で指定してください。");
  return dpi;
};

export const getSvgDimensions = (svg: SVGSVGElement): SvgDimensions => {
  const box = svg.viewBox.baseVal;
  if (Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }
  const rect = svg.getBoundingClientRect();
  return { width: positive(rect.width, "図の幅"), height: positive(rect.height, "図の高さ") };
};

export const getPublicationDimensions = (opts: {
  widthMm: number;
  dpi: number;
  sourceWidth: number;
  sourceHeight: number;
  vector?: boolean;
}): PublicationDimensions => {
  const widthMm = positive(opts.widthMm, "印刷幅(mm)");
  const dpi = validDpi(opts.dpi);
  const ratio = positive(opts.sourceHeight, "図の高さ") / positive(opts.sourceWidth, "図の幅");
  const heightMm = widthMm * ratio;
  const width = widthMm / 25.4 * dpi;
  const height = heightMm / 25.4 * dpi;
  const dimensions = opts.vector ? { width: Math.round(width), height: Math.round(height) } : rasterDimensions(width, height);
  return { ...dimensions, widthMm, heightMm, dpi };
};

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const safeBaseName = (baseName: string): string => {
  const name = baseName.trim() || "export";
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/[. ]+$/, "_");
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.download = fileName;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to consume the download before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  const frame = requestAnimationFrame(() => {
    clearTimeout(timer);
    resolve();
  });
  const timer = setTimeout(() => {
    cancelAnimationFrame(frame);
    resolve();
  }, 100);
});

const PRESENTATION_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant",
  "font-feature-settings", "font-kerning", "letter-spacing", "word-spacing", "text-anchor",
  "dominant-baseline", "alignment-baseline", "text-decoration", "fill", "fill-opacity", "stroke",
  "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "opacity", "color", "paint-order", "shape-rendering",
  "text-rendering", "visibility", "display", "marker-start", "marker-mid", "marker-end",
] as const;

const localizeFragmentUrls = (value: string): string => value.replace(
  /url\(["']?[^)"']*#([^)["']+)["']?\)/g,
  "url(#$1)",
);

export const serializeSvgForExport = async (
  svg: SVGSVGElement,
  opts: { width?: number; height?: number; widthMm?: number } = {},
): Promise<string> => {
  await svg.ownerDocument.fonts?.ready;
  // The renderer recalculates label layout when fonts settle.
  await nextFrame();
  await nextFrame();

  const sourceSize = getSvgDimensions(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceNodes = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  const clonedNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];
  const view = svg.ownerDocument.defaultView;

  sourceNodes.forEach((source, index) => {
    const target = clonedNodes[index];
    // Definitions can inherit currentColor from the referencing shape.
    if (source.closest("defs")) return;
    const computed = view?.getComputedStyle(source);
    if (computed) {
      for (const property of PRESENTATION_PROPERTIES) {
        const value = computed.getPropertyValue(property);
        if (value) target.style.setProperty(property, localizeFragmentUrls(value));
      }
    }
    if (source.tagName.toLowerCase() === "text" && source.children.length === 0) {
      const length = (source as SVGTextElement).getComputedTextLength();
      if (Number.isFinite(length) && length > 0 && !source.hasAttribute("textLength")) {
        target.setAttribute("textLength", String(length));
        target.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    }
  });

  clone.querySelectorAll("[data-export-exclude], [data-ggt-export-exclude], [data-ggt-ui-handle], [data-ggt-overlay-handle]")
    .forEach((node) => node.remove());
  clone.removeAttribute("class");
  clone.style.removeProperty("display");
  if (!clone.hasAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${sourceSize.width} ${sourceSize.height}`);
  if (opts.widthMm !== undefined) {
    const widthMm = positive(opts.widthMm, "印刷幅(mm)");
    clone.setAttribute("width", `${widthMm}mm`);
    clone.setAttribute("height", `${widthMm * sourceSize.height / sourceSize.width}mm`);
  } else {
    clone.setAttribute("width", String(positive(opts.width ?? sourceSize.width, "幅")));
    clone.setAttribute("height", String(positive(opts.height ?? sourceSize.height, "高さ")));
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
};

export const downloadSvg = async (svg: SVGSVGElement, opts: SvgExportOptions): Promise<void> => {
  const xml = await serializeSvgForExport(svg, opts);
  downloadBlob(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), `${safeBaseName(opts.baseName)}_${timestamp()}.svg`);
};

const loadImageFromSvgXml = async (xml: string): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG の読み込みに失敗しました。"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const withPngDpi = async (blob: Blob, dpi: number): Promise<Blob> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const chunk = new Uint8Array(21);
  const data = new DataView(chunk.buffer);
  data.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs: pixels per metre, per the PNG specification.
  const pixelsPerMetre = Math.round(validDpi(dpi) / 0.0254);
  data.setUint32(8, pixelsPerMetre);
  data.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;
  data.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: BlobPart[] = [bytes.slice(0, 33), chunk];
  let offset = 33; // PNG signature followed by the mandatory IHDR chunk.
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("PNG の解像度情報を保存できませんでした。");
    const isPhys = bytes[offset + 4] === 112 && bytes[offset + 5] === 72 && bytes[offset + 6] === 89 && bytes[offset + 7] === 115;
    if (!isPhys) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  return new Blob(parts, { type: "image/png" });
};

const withJpegDpi = async (blob: Blob, dpi: number): Promise<Blob> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const density = Math.max(1, Math.round(validDpi(dpi)));
  const isJfif = bytes.length >= 20 && bytes[2] === 0xff && bytes[3] === 0xe0
    && bytes[6] === 74 && bytes[7] === 70 && bytes[8] === 73 && bytes[9] === 70 && bytes[10] === 0;
  if (isJfif) {
    bytes[13] = 1; // JFIF density units: dots per inch.
    const view = new DataView(bytes.buffer);
    view.setUint16(14, density);
    view.setUint16(16, density);
    return new Blob([bytes], { type: "image/jpeg" });
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0]);
  const view = new DataView(app0.buffer);
  view.setUint16(12, density);
  view.setUint16(14, density);
  return new Blob([bytes.slice(0, 2), app0, bytes.slice(2)], { type: "image/jpeg" });
};

export const renderSvgToRasterBlob = async (
  svg: SVGSVGElement,
  opts: RasterExportOptions & { format: "png" | "jpeg" },
): Promise<Blob> => {
  const { width, height } = rasterDimensions(opts.width, opts.height);
  if (opts.dpi !== undefined) validDpi(opts.dpi);
  const quality = opts.format === "png" || opts.quality === undefined
    ? 0.95 : Math.max(0.1, Math.min(1, positive(opts.quality, "JPEG品質")));
  // Keep the vector viewport at its exact source ratio. Integer raster dimensions
  // are applied only at the final draw; using them for the SVG adds letterboxing
  // whenever rounding changes the ratio by a fraction of a pixel.
  const xml = await serializeSvgForExport(svg);
  const image = await loadImageFromSvgXml(xml);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas が初期化できませんでした。");
    const background = opts.format === "jpeg" ? "#ffffff" : opts.background ?? "#ffffff";
    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("画像の生成に失敗しました。解像度を下げて再実行してください。")),
        opts.format === "png" ? "image/png" : "image/jpeg",
        quality,
      );
    });
    if (opts.dpi === undefined) return blob;
    return opts.format === "png" ? withPngDpi(blob, opts.dpi) : withJpegDpi(blob, opts.dpi);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

const downloadRaster = async (svg: SVGSVGElement, opts: RasterExportOptions, format: "png" | "jpeg"): Promise<void> => {
  const dimensions = rasterDimensions(opts.width, opts.height);
  const blob = await renderSvgToRasterBlob(svg, { ...opts, ...dimensions, format });
  const extension = format === "jpeg" ? "jpg" : "png";
  downloadBlob(blob, `${safeBaseName(opts.baseName)}_${timestamp()}_${dimensions.width}x${dimensions.height}.${extension}`);
};

export const downloadJpegFromSvg = (svg: SVGSVGElement, opts: RasterExportOptions): Promise<void> => downloadRaster(svg, opts, "jpeg");

export const downloadPngFromSvg = (svg: SVGSVGElement, opts: RasterExportOptions): Promise<void> => downloadRaster(svg, opts, "png");
