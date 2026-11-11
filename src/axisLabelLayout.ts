import type { GraphTrack } from "./ggtTemplates";

export type MeasureTextWidth = (text: string, fontSize: number, fontWeight?: number) => number;

export type AxisLabelPlan = {
  labels: Array<{ index: number; anchorX: number; x: number; width: number; lane: number }>;
  lanes: number;
  lineHeight: number;
  height: number;
};

/** Spread labels, retaining a separate anchor for the original marker position. */
export const layoutAxisLabels = (
  labels: Array<{ x: number; label?: string }>,
  left: number,
  width: number,
  fontSize: number,
  measureW: MeasureTextWidth,
  fontWeight = 800,
): AxisLabelPlan => {
  const gap = Math.max(6, fontSize * 0.5);
  const lineHeight = Math.ceil(fontSize * 1.35);
  const available = Math.max(1, width);
  const entries = labels.flatMap((label, index) => {
    if (!label.label?.trim() || !Number.isFinite(label.x)) return [];
    return [{ index, anchorX: left + Math.max(0, Math.min(1, label.x)) * available,
      x: 0, width: measureW(label.label.trim(), fontSize, fontWeight) + 2, lane: 0 }];
  }).sort((a, b) => a.anchorX - b.anchorX || a.index - b.index);
  const lanes: typeof entries[] = [];
  let used = 0;
  for (const entry of entries) {
    if (!lanes.length || (used > 0 && used + gap + entry.width > available)) {
      lanes.push([]);
      used = 0;
    }
    entry.lane = lanes.length - 1;
    lanes[entry.lane].push(entry);
    used += (used > 0 ? gap : 0) + entry.width;
  }
  for (const lane of lanes) {
    let edge = left;
    for (const entry of lane) {
      entry.x = Math.max(entry.anchorX, edge + entry.width / 2);
      edge = entry.x + entry.width / 2 + gap;
    }
    edge = left + available;
    for (let i = lane.length - 1; i >= 0; i -= 1) {
      const entry = lane[i];
      entry.x = Math.min(entry.x, edge - entry.width / 2);
      edge = entry.x - entry.width / 2 - gap;
    }
  }
  return { labels: entries, lanes: lanes.length, lineHeight, height: lanes.length * lineHeight };
};

export const getAxisTrackMetrics = (
  axis: NonNullable<GraphTrack["axis"]>,
  plotX: number,
  plotWidth: number,
  baseHeight: number,
  baseFontSize: number,
  measureW: MeasureTextWidth,
): { top: AxisLabelPlan; bottom: AxisLabelPlan; tickSize: number; height: number; yOffset: number } => {
  const topFontSize = axis.labelTopFontSize ?? Math.max(10, Math.round(baseFontSize * 0.75));
  const bottomFontSize = axis.labelBottomFontSize ?? Math.max(10, Math.round(baseFontSize * 0.7));
  const top = layoutAxisLabels(axis.ticks.map((t) => ({ x: t.x, label: t.labelTop })), plotX, plotWidth, topFontSize, measureW);
  const bottom = layoutAxisLabels(axis.ticks.map((t) => ({ x: t.x, label: t.labelBottom })), plotX, plotWidth, bottomFontSize, measureW);
  const tickSize = axis.tickSize ?? Math.max(10, Math.round(Math.min(baseHeight, 48) * 0.38));
  const rotation = Number.isFinite(axis.labelTopRotation) ? axis.labelTopRotation ?? 0 : 0;
  if (rotation && top.labels.length) {
    const maxWidth = Math.max(...axis.ticks.map((tick) => measureW(tick.labelTop?.trim() || "", topFontSize, 800)));
    top.height = Math.ceil(maxWidth * Math.abs(Math.sin(rotation * Math.PI / 180)) + topFontSize * 1.5);
  }
  const bottomRotation = Number.isFinite(axis.labelBottomRotation) ? axis.labelBottomRotation ?? 0 : 0;
  if (bottomRotation && bottom.labels.length) {
    const maxWidth = Math.max(...axis.ticks.map((tick) => measureW(tick.labelBottom?.trim() || "", bottomFontSize, 800)));
    bottom.height = Math.ceil(maxWidth * Math.abs(Math.sin(bottomRotation * Math.PI / 180)) + bottomFontSize * 1.5);
  }
  const height = Math.ceil(Math.max(baseHeight, top.height + bottom.height + tickSize + 16));
  const yOffset = Math.ceil(top.height + tickSize / 2 + 8);
  return { top, bottom, tickSize, height, yOffset };
};
