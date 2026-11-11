import type { GraphConfig, GraphTrack, OverlayShape, OverlayText } from "./ggtTemplates";
import { createCanvasTextMeasurer, type MeasureTextW } from "./textMetrics";

export type ThesisGenotypeCode = "A" | "B" | "H" | "-";

export interface ThesisMarker {
  name: string;
  pos: number;
  chr?: string;
  label?: string;
  bold?: boolean;
}

export interface ThesisRow {
  id: string;
  sample: string;
  codes: readonly string[];
  annotations: readonly string[];
  bold?: boolean;
}

export interface ThesisFigureInput {
  markers: readonly ThesisMarker[];
  rows: readonly ThesisRow[];
  annotationHeaders: readonly string[];
  chromosomeLabel: string;
  chromosomeLength: number;
  candidate?: { start: number; end: number };
  gene?: { markerIndex: number; label: string; fontStyle?: "normal" | "italic" };
  parentRows?: number;
  widthMm?: number;
  fontPt?: number;
  rowPitchMm?: number;
  positionDecimals?: number;
  unit?: string;
  legendLabels?: Partial<{ A: string; B: string; H: string; missing: string }>;
  palette?: Partial<{ A: string; B: string; H: string; missing: string }>;
  measureText?: MeasureTextW;
}

export const THESIS_FONT = 'Meiryo, "Yu Gothic", "Noto Sans CJK JP", sans-serif';

const PT = 100 * 2.54 / 72;
const EDGE = "#4A6180";
const RED = "#D7191C";
const GUIDE = "#8C8C8C";

const positive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}には正の数を指定してください。`);
  return value;
};

const genotype = (value: string, row: number, column: number): ThesisGenotypeCode => {
  if (value === "A" || value === "B" || value === "H" || value === "-") return value;
  if (value === "Missing" || value === "MISSING" || value === "NA" || value === "") return "-";
  throw new Error(`${row + 1}行${column + 1}列の遺伝子型「${value}」を扱えません。A/B/H/-を指定してください。`);
};

const spreadLabels = (values: readonly number[], gap: number, left: number, right: number): number[] => {
  if (values.length > 1 && gap * (values.length - 1) > right - left) {
    throw new Error("修論形式の位置ラベルがこの幅に収まりません。表示マーカーを分けるか、図の幅を広げてください。");
  }
  const order = values.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x || a.index - b.index);
  const xs = order.map((entry) => entry.x);
  for (let step = 0; step < 200; step++) {
    let moved = false;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] < gap - 1e-9) {
        const delta = (gap - (xs[i] - xs[i - 1])) / 2;
        xs[i - 1] -= delta;
        xs[i] += delta;
        moved = true;
      }
    }
    if (xs[0] < left) {
      const delta = left - xs[0];
      for (let i = 0; i < xs.length; i++) xs[i] += delta;
      moved = true;
    }
    if (xs[xs.length - 1] > right) {
      const delta = xs[xs.length - 1] - right;
      for (let i = 0; i < xs.length; i++) xs[i] -= delta;
      moved = true;
    }
    if (!moved) break;
  }
  const valid = xs.every((value, index) => value >= left - 1e-6 && value <= right + 1e-6
    && (index === 0 || value - xs[index - 1] >= gap - 1e-6));
  if (!valid) {
    for (let index = 0; index < xs.length; index++) {
      xs[index] = Math.max(left + index * gap, Math.min(right - (xs.length - 1 - index) * gap, xs[index]));
      if (index > 0) xs[index] = Math.max(xs[index], xs[index - 1] + gap);
    }
  }
  const result = Array<number>(values.length);
  order.forEach((entry, i) => { result[entry.index] = xs[i]; });
  return result;
};

/** Compile the thesis figure's physical axis and equally spaced genotype cells separately. */
export const makeThesisFigure = (input: ThesisFigureInput): GraphConfig => {
  if (!input.markers.length) throw new Error("修論形式には1個以上のマーカーが必要です。");
  if (!input.rows.length) throw new Error("修論形式には1個以上の個体が必要です。");
  const chromosomeLength = positive(input.chromosomeLength, "染色体の長さ");
  const chromosomes = new Set(input.markers.map((marker) => marker.chr?.trim()).filter(Boolean));
  if (chromosomes.size > 1) throw new Error("修論形式は1本の染色体を描きます。染色体ごとに入力を分けてください。");
  input.markers.forEach((marker, index) => {
    if (!Number.isFinite(marker.pos) || marker.pos < 0 || marker.pos > chromosomeLength) {
      throw new Error(`${index + 1}番目のマーカー位置を確認してください。染色体の長さと同じ単位で指定してください。`);
    }
  });
  const rowIds = new Set(input.rows.map((row) => row.id));
  if (rowIds.size !== input.rows.length) throw new Error("個体の内部IDが重複しています。");
  input.rows.forEach((row, index) => {
    if (row.codes.length !== input.markers.length) throw new Error(`${index + 1}行目のマーカー数と遺伝子型の数が一致しません。`);
    if (row.annotations.length > input.annotationHeaders.length) throw new Error(`${index + 1}行目の注釈に対応する見出しが不足しています。`);
  });
  const matrix = input.rows.map((row, rowIndex) => row.codes.map((code, column) => genotype(code, rowIndex, column)));
  const parentRows = input.parentRows ?? 2;
  if (!Number.isInteger(parentRows) || parentRows < 0 || parentRows > input.rows.length) throw new Error("親として区切る行数を確認してください。");
  const gene = input.gene;
  if (gene && (!Number.isInteger(gene.markerIndex) || gene.markerIndex < 0 || gene.markerIndex >= input.markers.length)) {
    throw new Error("黒枠で示す遺伝子列を確認してください。");
  }
  const decimals = input.positionDecimals ?? 3;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) throw new Error("位置の小数桁数は0〜12で指定してください。");

  const width = positive(input.widthMm ?? 140, "図の幅(mm)") * 10;
  const fontSize = positive(input.fontPt ?? 7.5, "文字サイズ(pt)") * PT;
  const posFontSize = Math.max(1, (input.fontPt ?? 7.5) - 0.5) * PT;
  const pitch = positive(input.rowPitchMm ?? 3.6, "行の間隔(mm)") * 10;
  const measureContext = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  const fallbackMeasure = createCanvasTextMeasurer(THESIS_FONT);
  const metricsFor = (value: string, size: number, weight: number): TextMetrics | null => {
    if (!measureContext) return null;
    measureContext.font = `${weight} ${size}px ${THESIS_FONT}`;
    measureContext.textBaseline = "alphabetic";
    measureContext.textAlign = "left";
    return measureContext.measureText(value);
  };
  const measure: MeasureTextW = input.measureText ?? ((value, size, weight = 400) => metricsFor(value, size, weight)?.width ?? fallbackMeasure(value, size, weight));
  let maximumInkHeight = 0;
  input.rows.forEach((row, index) => {
    const labels = [{ text: row.sample, size: fontSize, weight: row.bold || index < parentRows ? 700 : 400 },
      ...row.annotations.map((value) => ({ text: value, size: fontSize + (/^[○〇×－]$/.test(value) ? PT : 0), weight: 400 }))];
    labels.forEach((label) => {
      if (!label.text.trim()) return;
      const metrics = metricsFor(label.text, label.size, label.weight);
      const inkHeight = metrics ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent : label.size;
      maximumInkHeight = Math.max(maximumInkHeight, inkHeight + label.size * 0.1);
    });
  });
  if (pitch < maximumInkHeight) throw new Error(`文字が行間に収まりません。行の間隔を${(Math.ceil(maximumInkHeight) / 10).toFixed(1)} mm以上に広げるか文字サイズを小さくしてください。`);
  const annotationWidths = input.annotationHeaders.map(() => input.annotationHeaders.length === 1 ? 150 : 105);
  const x0 = 175;
  const x1 = width - annotationWidths.reduce((sum, value) => sum + value, 0) - 25;
  if (x1 - x0 < 200) throw new Error("図の幅が不足しています。注釈列を減らすか図の幅を広げてください。");
  const plotWidth = x1 - x0;
  const cellWidth = plotWidth / input.markers.length;
  const columns = input.markers.map((_, index) => x0 + (index + 0.5) * cellWidth);
  const positions = input.markers.map((marker) => marker.pos);
  const low = Math.min(...positions);
  const high = Math.max(...positions);
  const tickX = positions.map((pos) => high === low ? (x0 + x1) / 2 : columns[0] + (pos - low) / (high - low) * (columns[columns.length - 1] - columns[0]));
  const labelX = spreadLabels(tickX, 40, x0 - 30, x1 - 15);
  if (input.candidate && (!Number.isFinite(input.candidate.start) || !Number.isFinite(input.candidate.end)
    || input.candidate.start < low || input.candidate.start > high || input.candidate.end < low || input.candidate.end > high)) {
    throw new Error("候補区間の両端を表示中のマーカー位置の範囲内で指定してください。");
  }
  const cellHeight = pitch * 0.62;
  const parentGap = pitch * 0.45;
  const firstCenter = 405 + pitch / 2;
  const centers = input.rows.map((_, index) => firstCenter + index * pitch + (parentRows > 0 && index >= parentRows ? parentGap : 0));
  const dataBottom = centers[centers.length - 1] + pitch / 2;
  const legendY = dataBottom + (gene ? 62 : 30) + 15;
  const height = legendY + 25;
  const palette: Record<ThesisGenotypeCode, string> = { A: input.palette?.A ?? "#8DB4E2", B: input.palette?.B ?? "#FFD966", H: input.palette?.H ?? "#FFFFFF", "-": input.palette?.missing ?? "#D9D9D9" };
  const overlays: OverlayShape[] = [];
  const text = (id: string, value: string, x: number, y: number, options: Partial<OverlayText> = {}): void => {
    overlays.push({ kind: "text", id, text: value, x, y, fill: "#000000", fontFamily: THESIS_FONT, fontSize, fontWeight: 400,
      anchor: "start", baseline: "central", layer: "over", ...options });
  };
  const line = (id: string, xa: number, ya: number, xb: number, yb: number, color = GUIDE, strokeWidth = 0.6 * PT, role?: string, markerIndex?: number): void => {
    overlays.push({ kind: "line", id, x1: xa, y1: ya, x2: xb, y2: yb, stroke: color, strokeWidth, lineCap: "butt", layer: "over", role, markerIndex });
  };
  const path = (id: string, points: Array<[number, number]>): void => {
    overlays.push({ kind: "path", id, d: points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" "),
      fill: "none", stroke: GUIDE, strokeWidth: 0.48 * PT, layer: "over" });
  };

  overlays.push({ kind: "rect", id: "thesis-chromosome", role: "chromosome", x: x0, y: 61, width: plotWidth, height: 28, rx: 14, ry: 14,
    fill: "#FFFFFF", stroke: "#333333", strokeWidth: 0.6 * PT, layer: "over" });
  const chrX = (pos: number): number => x0 + pos / chromosomeLength * plotWidth;
  const regionStart = chrX(low);
  const regionEnd = Math.max(chrX(high), regionStart + 8);
  overlays.push({ kind: "rect", id: "thesis-chromosome-region", role: "chromosome-region", x: regionStart, y: 61, width: regionEnd - regionStart, height: 28, fill: RED, layer: "over" });
  text("thesis-chromosome-label", input.chromosomeLabel, x0 - 15, 75, { anchor: "end", fontWeight: 700, fontSize: fontSize + 0.5 * PT, role: "chromosome-label" });
  const spanCenter = Math.min(Math.max((regionStart + regionEnd) / 2, x0 + 70), x1 - 70);
  text("thesis-chromosome-span", `約${(high - low).toFixed(1)} ${input.unit ?? "Mb"}`, spanCenter, 42, { anchor: "middle", role: "chromosome-span" });
  line("thesis-zoom-left", regionStart, 89, x0, 135);
  line("thesis-zoom-right", regionEnd, 89, x1, 135);

  line("thesis-position-axis", x0, 295, x1, 295, "#000000", 1.2 * PT, "position-axis");
  text("thesis-position-unit", `(${input.unit ?? "Mb"})`, x0 - 15, 295, { anchor: "end", role: "position-unit" });
  const toAxisX = (pos: number): number => high === low ? (x0 + x1) / 2 : columns[0] + (pos - low) / (high - low) * (columns[columns.length - 1] - columns[0]);
  if (input.candidate) {
    const boundaries = [toAxisX(input.candidate.start), toAxisX(input.candidate.end)].sort((a, b) => a - b);
    line("thesis-candidate-interval", boundaries[0], 295, boundaries[1], 295, RED, 3.2 * PT, "candidate");
  }
  input.markers.forEach((marker, index) => {
    const x = tickX[index];
    line(`thesis-marker-tick-${index}`, x, 286, x, 304, "#000000", 0.8 * PT, "marker-tick", index);
    path(`thesis-label-leader-${index}`, [[x, 286], [x, 278], [labelX[index], 255], [labelX[index], 249]]);
    text(`thesis-marker-position-${index}`, marker.label ?? marker.pos.toFixed(decimals), labelX[index] - 2, 245, {
      baseline: "auto", fontSize: posFontSize, fontWeight: marker.bold || gene?.markerIndex === index ? 700 : 400,
      rotation: -55, role: "marker-position", markerIndex: index,
    });
    path(`thesis-column-leader-${index}`, [[x, 304], [x, 317], [columns[index], 357], [columns[index], 375]]);
  });

  const tracks: GraphTrack[] = input.rows.map((row, index) => ({
    id: row.id,
    height: cellHeight,
    gapAfter: pitch - cellHeight + (parentRows > 0 && index === parentRows - 1 && index < input.rows.length - 1 ? parentGap : 0),
    showColumnLines: false,
    segments: matrix[index].map((code, column) => ({ start: column / input.markers.length, end: (column + 1) / input.markers.length,
      fill: palette[code], stroke: EDGE, strokeWidth: 0.4 * PT })),
  }));

  if (gene) {
    const top = centers[0] - pitch / 2;
    overlays.push({ kind: "rect", id: "thesis-gene-column", role: "gene-column", markerIndex: gene.markerIndex, x: x0 + gene.markerIndex * cellWidth, y: top,
      width: cellWidth, height: dataBottom - top, fill: "none", stroke: "#222222", strokeWidth: 1.2 * PT, layer: "over" });
    text("thesis-gene-label", gene.label, columns[gene.markerIndex], dataBottom + 8, { anchor: "middle", baseline: "hanging", fontStyle: gene.fontStyle ?? "normal", role: "gene-label", markerIndex: gene.markerIndex });
  }
  let annotationX = x1 + 15;
  input.annotationHeaders.forEach((header, column) => {
    const center = annotationX + annotationWidths[column] / 2;
    const lines = header.split(/\r?\n/);
    lines.forEach((label, lineIndex) => text(`thesis-annotation-header-${column}-${lineIndex}`, label, center,
      centers[0] - pitch / 2 - 12 - (lines.length - 1 - lineIndex) * fontSize * 1.15 - fontSize * 0.5,
      { anchor: "middle", role: "annotation-header" }));
    input.rows.forEach((row, rowIndex) => {
      const value = String(row.annotations[column] ?? "").replace(/〇/g, "○");
      const mark = value === "○" || value === "×" || value === "－";
      text(`thesis-annotation-${rowIndex}-${column}`, value, center, centers[rowIndex], { anchor: "middle",
        fill: value === "○" ? RED : "#000000", fontSize: fontSize + (mark ? PT : 0), role: "annotation", rowId: row.id });
    });
    annotationX += annotationWidths[column];
  });
  input.rows.forEach((row, index) => text(`thesis-sample-${index}`, row.sample, x0 - 15, centers[index], {
    anchor: "end", fontWeight: row.bold || index < parentRows ? 700 : 400, role: "sample", rowId: row.id,
  }));

  const legend = [
    { code: "A" as const, label: input.legendLabels?.A ?? "A型" },
    { code: "B" as const, label: input.legendLabels?.B ?? "B型" },
    { code: "H" as const, label: input.legendLabels?.H ?? "ヘテロ型" },
    { code: "-" as const, label: input.legendLabels?.missing ?? "未判定" },
  ];
  const labelWidths = legend.map((item) => measure(item.label, fontSize, 400));
  const legendWidth = labelWidths.reduce((sum, value) => sum + 45 + 12 + value, 0) + 55 * (legend.length - 1);
  if (legendWidth > width - 30) throw new Error("凡例の文字が図の幅に収まりません。凡例を短くするか、図の幅を広げてください。");
  let cursor = Math.max(15, Math.min(width - 15 - legendWidth, (x0 + x1) / 2 - legendWidth / 2));
  legend.forEach((item, index) => {
    overlays.push({ kind: "rect", id: `thesis-legend-swatch-${item.code}`, role: "legend-swatch", x: cursor, y: legendY - 11, width: 45, height: 22,
      fill: palette[item.code], stroke: EDGE, strokeWidth: 0.4 * PT, layer: "over" });
    text(`thesis-legend-label-${item.code}`, item.label, cursor + 57, legendY, { role: "legend-label" });
    cursor += 45 + 12 + labelWidths[index] + 55;
  });

  return {
    width,
    height,
    background: "#FFFFFF",
    columns: input.markers.length,
    xBoundaries: Array.from({ length: input.markers.length + 1 }, (_, index) => index / input.markers.length),
    plot: { x: x0, y: centers[0] - cellHeight / 2, width: plotWidth, annotationWidth: width - x1 - 25, rowHeight: cellHeight, rowGap: pitch - cellHeight },
    styles: { text: { fontFamily: THESIS_FONT, fontSize, fill: "#000000" }, segment: { stroke: EDGE, strokeWidth: 0.4 * PT } },
    tracks,
    overlays,
  };
};
