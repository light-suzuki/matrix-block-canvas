const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const safeBaseName = (baseName: string): string => {
  const name = baseName.trim() || "export";
  return name.replace(/[^\w\-]+/g, "_");
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const a = document.createElement("a");
  a.download = fileName;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

const serializeSvg = (svg: SVGSVGElement, opts?: { width?: number; height?: number }): string => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (opts?.width && Number.isFinite(opts.width)) clone.setAttribute("width", String(opts.width));
  if (opts?.height && Number.isFinite(opts.height)) clone.setAttribute("height", String(opts.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  return xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
};

export const downloadSvg = (
  svg: SVGSVGElement,
  opts: { baseName: string; width?: number; height?: number },
): void => {
  const xml = serializeSvg(svg, { width: opts.width, height: opts.height });
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const name = safeBaseName(opts.baseName);
  downloadBlob(blob, `${name}_${timestamp()}.svg`);
};

const loadImageFromSvgXml = async (xml: string): Promise<HTMLImageElement> => {
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG の読み込みに失敗しました。"));
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const downloadJpegFromSvg = async (
  svg: SVGSVGElement,
  opts: { baseName: string; width: number; height: number; quality?: number },
): Promise<void> => {
  const w = Math.max(1, Math.floor(opts.width));
  const h = Math.max(1, Math.floor(opts.height));
  const q = typeof opts.quality === "number" ? Math.max(0.1, Math.min(1, opts.quality)) : 0.95;

  const xml = serializeSvg(svg, { width: w, height: h });
  const img = await loadImageFromSvgXml(xml);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas が初期化できませんでした。");

  // JPEG は透過を持てないため、背景が "none" の SVG でも黒にならないよう白で埋める。
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG 生成に失敗しました。"))),
      "image/jpeg",
      q,
    );
  });

  // Release the canvas bitmap memory as early as possible
  canvas.width = 0;
  canvas.height = 0;

  const name = safeBaseName(opts.baseName);
  downloadBlob(blob, `${name}_${timestamp()}_${w}x${h}.jpg`);
};
