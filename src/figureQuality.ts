export interface FigureQuality {
  minFontPt: number;
  clipped: number;
  overlaps: number;
}

export const inspectFigureQuality = (svg: SVGSVGElement, widthMm: number): FigureQuality => {
  const rootMatrix = svg.getCTM();
  const viewBox = svg.viewBox.baseVal;
  if (!rootMatrix || !viewBox.width) return { minFontPt: 0, clipped: 0, overlaps: 0 };
  const inverse = rootMatrix.inverse();
  const nodes = [...svg.querySelectorAll<SVGTextElement>("text")].filter((node) => node.textContent?.trim() && !node.closest("defs, [data-export-exclude]"));
  const boxes = nodes.flatMap((node) => {
    const matrix = node.getCTM();
    if (!matrix) return [];
    const bounds = node.getBBox();
    const transform = inverse.multiply(matrix);
    const points = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
    return [{ x0: Math.min(...points.map((point) => point.x)), x1: Math.max(...points.map((point) => point.x)),
      y0: Math.min(...points.map((point) => point.y)), y1: Math.max(...points.map((point) => point.y)), points }];
  });
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const polygons = [boxes[i].points, boxes[j].points];
      const separated = polygons.some((polygon) => polygon.some((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        if (!length) return false;
        const axis = { x: -(next.y - point.y) / length, y: (next.x - point.x) / length };
        const projections = polygons.map((points) => points.map((p) => p.x * axis.x + p.y * axis.y));
        return Math.min(Math.max(...projections[0]), Math.max(...projections[1]))
          - Math.max(Math.min(...projections[0]), Math.min(...projections[1])) <= 1;
      }));
      if (!separated) overlaps++;
    }
  }
  const minFont = Math.min(...nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  return {
    minFontPt: Number.isFinite(minFont) ? minFont * widthMm / viewBox.width * 72 / 25.4 : 0,
    clipped: boxes.filter((box) => box.x0 < -1 || box.y0 < -1 || box.x1 > viewBox.width + 1 || box.y1 > viewBox.height + 1).length,
    overlaps,
  };
};
