export interface SvgTextPoint { x: number; y: number }

export interface SvgTextGeometry {
  points: SvgTextPoint[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const contexts = new WeakMap<Document, CanvasRenderingContext2D>();

const contextFor = (document: Document): CanvasRenderingContext2D | null => {
  const cached = contexts.get(document);
  if (cached) return cached;
  const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas") as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (context) contexts.set(document, context);
  return context;
};

/** Measure painted glyphs rather than the font's ascender/descender line box. */
export const getSvgTextGeometry = (node: SVGTextElement, root: SVGSVGElement): SvgTextGeometry | null => {
  const text = node.textContent ?? "";
  const rootMatrix = root.getCTM();
  const nodeMatrix = node.getCTM();
  if (!text.trim() || !rootMatrix || !nodeMatrix) return null;
  const style = node.ownerDocument.defaultView?.getComputedStyle(node);
  if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  const box = node.getBBox();
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  const context = contextFor(node.ownerDocument);
  // Mixed runs, vertical writing and per-character rotations need a shaped-run
  // measurement; retain the conservative SVG bounds for those uncommon inputs.
  const simpleRun = !node.children.length && style.direction !== "rtl"
    && (!style.writingMode || style.writingMode === "horizontal-tb") && !node.hasAttribute("rotate");
  if (context && simpleRun && node.getNumberOfChars() > 0) {
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    context.direction = "ltr";
    context.fontKerning = style.fontKerning as CanvasFontKerning;
    const spacingContext = context as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
    if ("letterSpacing" in spacingContext) spacingContext.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    if ("wordSpacing" in spacingContext) spacingContext.wordSpacing = style.wordSpacing === "normal" ? "0px" : style.wordSpacing;
    const metrics = context.measureText(text);
    const fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const values = [metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxRight, metrics.actualBoundingBoxAscent,
      metrics.actualBoundingBoxDescent, metrics.width, fontHeight];
    if (values.every(Number.isFinite) && metrics.width > 0 && fontHeight > 0 && box.height > 0) {
      const origin = node.getStartPositionOfChar(0);
      const advanceScale = node.getComputedTextLength() / metrics.width;
      const verticalScale = box.height / fontHeight;
      // getStartPositionOfChar already resolves text-anchor. SVG's baseline can
      // be central/hanging, so recover the alphabetic baseline from its line box.
      const baseline = box.y + metrics.fontBoundingBoxAscent * verticalScale;
      left = origin.x - metrics.actualBoundingBoxLeft * advanceScale;
      right = origin.x + metrics.actualBoundingBoxRight * advanceScale;
      top = baseline - metrics.actualBoundingBoxAscent * verticalScale;
      bottom = baseline + metrics.actualBoundingBoxDescent * verticalScale;
    }
  }
  const stroke = style.stroke !== "none" ? Number.parseFloat(style.strokeWidth) / 2 || 0 : 0;
  const transform = rootMatrix.inverse().multiply(nodeMatrix);
  const points = [[left - stroke, top - stroke], [right + stroke, top - stroke], [right + stroke, bottom + stroke], [left - stroke, bottom + stroke]]
    .map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform))
    .map(({ x, y }) => ({ x, y }));
  return { points, x0: Math.min(...points.map((point) => point.x)), x1: Math.max(...points.map((point) => point.x)),
    y0: Math.min(...points.map((point) => point.y)), y1: Math.max(...points.map((point) => point.y)) };
};
