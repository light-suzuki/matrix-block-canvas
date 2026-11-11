import React, { forwardRef, useEffect, useMemo, useState } from "react";
import type { ColumnGroup, GraphConfig, GraphTrack, LegendConfig, OverlayShape, XAxisConfig } from "./ggtTemplates";
import { getAxisTrackMetrics, layoutAxisLabels } from "./axisLabelLayout";
import { createCanvasTextMeasurer, type MeasureTextW } from "./textMetrics";

export { createCanvasTextMeasurer, approxTextW } from "./textMetrics";

type Normalized = {
  width: number;
  height: number;
  background: string;
  columns: number;
  xBoundaries: number[];
  columnGroups: ColumnGroup[];
  xAxis?: XAxisConfig;
  guides?: { show: boolean; mode: "boundaries" | "centers"; stroke: string; strokeWidth: number; dash: string; opacity: number };
  annotationHeaders?: { left?: string; right?: string; fill: string; fontSize: number };
  overlays?: OverlayShape[];
  legend?: LegendConfig;
  plotX: number;
  plotY: number;
  plotWidth: number;
  annotationWidth: number;
  annotationColumnWidths: number[];
  rowHeight: number;
  rowGap: number;
  colLine: { stroke: string; strokeWidth: number; dash: string; opacity: number };
  text: { fontFamily: string; fontSize: number; fill: string };
  segment: { stroke: string; strokeWidth: number };
  tracks: GraphTrack[];
};

type EditorOverlayState = {
  enableOverlayPointerEvents?: boolean;
  selectedOverlayId?: string | null;
  draftOverlay?: OverlayShape | null;
  uiGuides?: EditorUiGuideLine[];
  uiHandles?: EditorUiHandle[];
};

export type EditorUiGuideLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
};

type EditorUiHandleBase = {
  id: string;
  title?: string;
  cursor?: string;
  opacity?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
};

export type EditorUiHandleCircle = EditorUiHandleBase & {
  kind: "circle";
  x: number;
  y: number;
  r: number;
};

export type EditorUiHandleRect = EditorUiHandleBase & {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
};

export type EditorUiHandle = EditorUiHandleCircle | EditorUiHandleRect;

const clamp = (v: number, min: number, max: number): number => {
  const n = Number.isFinite(v) ? v : min;
  return Math.max(min, Math.min(max, n));
};

const splitAnnotationColumns = (text: string | undefined | null): string[] => {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  if (raw.includes("\t")) return raw.split("\t").map((v) => v.trim());
  if (raw.includes("|")) return raw.split("|").map((v) => v.trim());
  return [raw];
};

const trimTrailingEmptyColumns = (cols: string[]): string[] => {
  let last = cols.length - 1;
  while (last >= 0 && !String(cols[last] ?? "").trim()) last -= 1;
  return cols.slice(0, last + 1);
};

const fitFontSizeToWidth = (text: string, maxWidth: number, fontSize: number, measureW: MeasureTextW, fontWeight = 400, minFontSize = 9): number => {
  const w = measureW(text, fontSize, fontWeight);
  if (w <= maxWidth) return fontSize;
  const denom = Math.max(1, w);
  const scale = maxWidth / denom;
  const next = Math.floor(fontSize * scale);
  return Math.max(minFontSize, Math.min(fontSize, next));
};

const normalizeConfig = (raw: GraphConfig): Normalized => {
  const width = Number.isFinite(raw.width) ? raw.width : 1600;
  const height = Number.isFinite(raw.height) ? raw.height : 900;
  const background = raw.background || "#000000";
  const rawBoundaries = Array.isArray(raw.xBoundaries)
    ? raw.xBoundaries.map((v) => (Number.isFinite(v) ? (v as number) : NaN)).filter((v) => Number.isFinite(v))
    : [];
  const columnsFromBoundaries = rawBoundaries.length >= 2 ? rawBoundaries.length - 1 : 0;
  const columns =
    columnsFromBoundaries ||
    (Number.isFinite(raw.columns) && (raw.columns as number) > 1 ? (raw.columns as number) : 0);
  const xBoundaries =
    columnsFromBoundaries > 0
      ? rawBoundaries
      : columns > 0
        ? Array.from({ length: columns + 1 }, (_, i) => i / columns)
        : [];
  const columnGroups = Array.isArray(raw.columnGroups) ? raw.columnGroups : [];
  const legend = raw.legend && Array.isArray(raw.legend.items) && raw.legend.items.length > 0 ? raw.legend : undefined;

  const plotX = raw.plot?.x ?? 120;
  const plotY = raw.plot?.y ?? 70;
  const annotationWidth = raw.plot?.annotationWidth ?? 260;
  const annotationColumnWidths = Array.isArray(raw.plot?.annotationColumnWidths)
    ? raw.plot!.annotationColumnWidths!.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];
  const rowHeight = raw.plot?.rowHeight ?? 48;
  const rowGap = raw.plot?.rowGap ?? 18;
  const plotWidth = raw.plot?.width ?? Math.max(200, width - plotX - annotationWidth - 30);

  const colLine = {
    stroke: raw.styles?.columnLine?.stroke || "#000000",
    strokeWidth: raw.styles?.columnLine?.strokeWidth ?? 1,
    dash: raw.styles?.columnLine?.dash || "2 4",
    opacity: raw.styles?.columnLine?.opacity ?? 0.55,
  };

  const text = {
    fontFamily: raw.styles?.text?.fontFamily || 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: raw.styles?.text?.fontSize ?? 18,
    fill: raw.styles?.text?.fill || "#ff2d2d",
  };

  const segment = {
    stroke: raw.styles?.segment?.stroke || "#000000",
    strokeWidth: raw.styles?.segment?.strokeWidth ?? 2,
  };

  const xAxisRaw = raw.xAxis;
  const ticksRaw = xAxisRaw && Array.isArray(xAxisRaw.ticks) ? xAxisRaw.ticks : [];
  const xAxis: XAxisConfig | undefined =
    xAxisRaw && xAxisRaw.show !== false && ticksRaw.length
      ? {
        show: true,
        placement: xAxisRaw.placement === "bottom" ? "bottom" : "top",
        offset: xAxisRaw.offset ?? 18,
        tickSize: xAxisRaw.tickSize ?? 7,
        stroke: xAxisRaw.stroke || colLine.stroke,
        strokeWidth: xAxisRaw.strokeWidth ?? colLine.strokeWidth,
        fontSize: xAxisRaw.fontSize ?? Math.max(10, Math.round(text.fontSize * 0.65)),
        fill: xAxisRaw.fill || text.fill,
        title: xAxisRaw.title,
        titleFill: xAxisRaw.titleFill || text.fill,
        titleFontSize: xAxisRaw.titleFontSize ?? Math.max(10, Math.round((xAxisRaw.fontSize ?? Math.round(text.fontSize * 0.65)) * 0.95)),
        ticks: ticksRaw
          .map((t) => ({
            x: Number.isFinite(t.x) ? (t.x as number) : NaN,
            label: typeof t.label === "string" ? t.label : undefined,
            major: Boolean(t.major),
          }))
          .filter((t) => Number.isFinite(t.x) && t.x >= 0 && t.x <= 1),
      }
      : undefined;

  const guidesRaw = raw.guides;
  const guides: Normalized["guides"] | undefined =
    guidesRaw && guidesRaw.show
      ? {
        show: true,
        mode: guidesRaw.mode === "boundaries" ? "boundaries" : "centers",
        stroke: guidesRaw.stroke || colLine.stroke,
        strokeWidth: guidesRaw.strokeWidth ?? colLine.strokeWidth,
        dash: guidesRaw.dash || colLine.dash,
        opacity: guidesRaw.opacity ?? colLine.opacity,
      }
      : undefined;

  const annotationHeadersRaw = raw.annotationHeaders;
  const annotationHeaders: Normalized["annotationHeaders"] | undefined =
    annotationHeadersRaw && (annotationHeadersRaw.left || annotationHeadersRaw.right)
      ? {
        left: annotationHeadersRaw.left,
        right: annotationHeadersRaw.right,
        fill: annotationHeadersRaw.fill || text.fill,
        fontSize: annotationHeadersRaw.fontSize ?? Math.max(12, Math.round(text.fontSize * 0.85)),
      }
      : undefined;

  const overlays: OverlayShape[] = Array.isArray(raw.overlays) ? (raw.overlays as OverlayShape[]) : [];

  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  return {
    width,
    height,
    background,
    columns,
    xBoundaries,
    columnGroups,
    xAxis,
    guides,
    annotationHeaders,
    overlays,
    legend,
    plotX,
    plotY,
    plotWidth,
    annotationWidth,
    annotationColumnWidths,
    rowHeight,
    rowGap,
    colLine,
    text,
    segment,
    tracks,
  };
};

export const GraphicalGenotypeSvg = forwardRef<SVGSVGElement, { config: GraphConfig; editor?: EditorOverlayState }>((props, ref) => {
  const cfg = useMemo(() => normalizeConfig(props.config), [props.config]);
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let active = true;
    const refresh = (): void => { if (active) setFontRevision((n) => n + 1); };
    void document.fonts.ready.then(refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    return () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", refresh);
    };
  }, []);
  const measureW = useMemo(() => createCanvasTextMeasurer(cfg.text.fontFamily), [cfg.text.fontFamily, fontRevision]);
  const editor = props.editor;
  const annotationAreaX = cfg.plotX + cfg.plotWidth + 24;
  const leftLabelX = Math.max(10, cfg.plotX - 14);

  let yCursor = cfg.plotY;
  const rows = cfg.tracks.map((t) => {
    const h = t.height ?? cfg.rowHeight;
    const y = yCursor;
    yCursor += h + (t.gapAfter ?? cfg.rowGap);
    return { track: t, y, h };
  });

  const plotYStart = rows.length ? rows[0].y : cfg.plotY;
  const plotYEnd = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : cfg.plotY;

  const annotationHeaderCols = trimTrailingEmptyColumns(splitAnnotationColumns(cfg.annotationHeaders?.left));
  const rowAnnotationCols = rows.map(({ track }) => trimTrailingEmptyColumns(splitAnnotationColumns(track.rightText?.text)));
  const annotationCols = Math.max(0, annotationHeaderCols.length, ...rowAnnotationCols.map((v) => v.length));
  const annotationColGap = 12;
  const annotationMarkGap = 18;
  const showMarkColumn = Boolean(cfg.annotationHeaders?.right) || rows.some((r) => Boolean(r.track.rightCircle || r.track.rightCross));

  let maxMarkHalf = 0;
  for (const { track } of rows) {
    const circle = track.rightCircle;
    if (circle) {
      const r = circle.r ?? 14;
      const sw = circle.strokeWidth ?? 6;
      maxMarkHalf = Math.max(maxMarkHalf, r + sw);
    }
    const cross = track.rightCross;
    if (cross) {
      const size = cross.size ?? 18;
      const sw = cross.strokeWidth ?? 6;
      maxMarkHalf = Math.max(maxMarkHalf, size * 0.5 + sw);
    }
  }
  if (showMarkColumn) maxMarkHalf = Math.max(maxMarkHalf, 20);
  const markHeaderW = measureW(cfg.annotationHeaders?.right || "", cfg.annotationHeaders?.fontSize ?? cfg.text.fontSize, 900);
  const markColW = showMarkColumn ? Math.max(44, Math.round(maxMarkHalf * 2 + 10), markHeaderW + 8) : 0;

  const desiredAnnoColWs: number[] = Array.from({ length: annotationCols }, () => 0);
  for (let i = 0; i < annotationCols; i += 1) {
    const headerText = annotationHeaderCols[i] || "";
    const headerFs = cfg.annotationHeaders?.fontSize ?? Math.max(12, Math.round(cfg.text.fontSize * 0.85));
    desiredAnnoColWs[i] = Math.max(desiredAnnoColWs[i], measureW(headerText, headerFs, 900));
  }
  for (let r = 0; r < rowAnnotationCols.length; r += 1) {
    const cols = rowAnnotationCols[r];
    if (!cols.length) continue;
    const track = rows[r].track;
    const fs = track.rightText?.fontSize ?? cfg.text.fontSize;
    for (let i = 0; i < Math.min(annotationCols, cols.length); i += 1) {
      desiredAnnoColWs[i] = Math.max(desiredAnnoColWs[i], measureW(cols[i] || "", fs, 700));
    }
  }

  const desiredAnnoColWsWithPad = desiredAnnoColWs.map((w, i) => {
    const explicit = cfg.annotationColumnWidths[i];
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(22, Math.round(explicit));
    return Math.max(24, Math.round(w + 6));
  });
  const availableTextW = Math.max(0, cfg.annotationWidth - (showMarkColumn ? markColW + annotationMarkGap : 0));
  const gapsW = Math.max(0, annotationCols - 1) * annotationColGap;
  const availableForCols = Math.max(0, availableTextW - gapsW);

  const minColW = 22;
  const annoColWs = desiredAnnoColWsWithPad.slice();
  if (annotationCols > 0) {
    const sumDesired = annoColWs.reduce((a, b) => a + b, 0);
    if (sumDesired > availableForCols) {
      const minSum = annotationCols * minColW;
      if (availableForCols <= minSum) {
        const eq = Math.max(10, Math.floor(availableForCols / annotationCols));
        for (let i = 0; i < annotationCols; i += 1) annoColWs[i] = eq;
      } else {
        const flex = annoColWs.map((w) => Math.max(0, w - minColW));
        const flexSum = flex.reduce((a, b) => a + b, 0) || 1;
        const remaining = availableForCols - minSum;
        for (let i = 0; i < annotationCols; i += 1) {
          const add = (remaining * flex[i]) / flexSum;
          annoColWs[i] = Math.max(minColW, Math.floor(minColW + add));
        }
      }
    }
  }

  const annoColXs: number[] = [];
  let annoCursor = annotationAreaX;
  for (let i = 0; i < annotationCols; i += 1) {
    annoColXs.push(annoCursor);
    annoCursor += annoColWs[i] + (i < annotationCols - 1 ? annotationColGap : 0);
  }
  const markXRaw = showMarkColumn ? annoCursor + (annotationCols > 0 ? annotationMarkGap : 0) + markColW * 0.5 : annoCursor;
  const markX = showMarkColumn
    ? clamp(markXRaw, annotationAreaX + markColW * 0.5, annotationAreaX + cfg.annotationWidth - markColW * 0.5)
    : markXRaw;

  const colLines = (y: number, h: number, enabled: boolean | undefined): React.ReactNode => {
    const boundaries = cfg.xBoundaries;
    if (!boundaries.length || boundaries.length < 3) return null;
    if (enabled === false) return null;
    const lines: React.ReactNode[] = [];
    for (let i = 1; i < boundaries.length - 1; i += 1) {
      const x = cfg.plotX + boundaries[i] * cfg.plotWidth;
      lines.push(
        <line
          key={i}
          x1={x}
          x2={x}
          y1={y}
          y2={y + h}
          stroke={cfg.colLine.stroke}
          strokeWidth={cfg.colLine.strokeWidth}
          strokeDasharray={cfg.colLine.dash}
          opacity={cfg.colLine.opacity}
        />,
      );
    }
    return <g>{lines}</g>;
  };

  const renderAxisTrack = (track: GraphTrack, y: number, h: number): React.ReactNode => {
    const axis = track.axis;
    if (!axis || !Array.isArray(axis.ticks) || axis.ticks.length === 0) return null;
    const axisY = y + (axis.yOffset ?? h * 0.5);
    const topRotation = Number.isFinite(axis.labelTopRotation) ? axis.labelTopRotation ?? 0 : 0;
    const bottomRotation = Number.isFinite(axis.labelBottomRotation) ? axis.labelBottomRotation ?? 0 : 0;
    const stroke = axis.stroke || cfg.colLine.stroke;
    const strokeWidth = axis.strokeWidth ?? Math.max(1, cfg.colLine.strokeWidth);
    const tickStroke = axis.tickStroke || stroke;
    const tickStrokeWidth = axis.tickStrokeWidth ?? strokeWidth;
    const metrics = getAxisTrackMetrics(axis, cfg.plotX, cfg.plotWidth, h, cfg.text.fontSize, measureW);
    const tickSize = metrics.tickSize;
    const topLabels = new Map(metrics.top.labels.map((label) => [label.index, label]));
    const bottomLabels = new Map(metrics.bottom.labels.map((label) => [label.index, label]));
    const topFill = axis.labelTopFill || cfg.text.fill;
    const bottomFill = axis.labelBottomFill || cfg.text.fill;
    const topFontSize = axis.labelTopFontSize ?? Math.max(10, Math.round(cfg.text.fontSize * 0.75));
    const bottomFontSize = axis.labelBottomFontSize ?? Math.max(10, Math.round(cfg.text.fontSize * 0.7));
    const title = (axis.title || "").trim();
    const titleFill = axis.titleFill || topFill;
    const titleFontSize = axis.titleFontSize ?? Math.max(topFontSize, Math.round(topFontSize * 1.0));

    return (
      <g data-ggt-axis-track={track.id}>
        <line x1={cfg.plotX} x2={cfg.plotX + cfg.plotWidth} y1={axisY} y2={axisY} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
	        {axis.ticks.map((t, i) => {
	          const x = cfg.plotX + clamp(t.x, 0, 1) * cfg.plotWidth;
	          const len = t.major ? tickSize : Math.max(6, Math.round(tickSize * 0.65));
	          const y1 = axisY - len * 0.5;
	          const y2 = axisY + len * 0.5;
	          const top = (t.labelTop || "").trim();
	          const bottom = (t.labelBottom || "").trim();
	          const tickTopFill = t.labelTopFill || topFill;
	          const tickBottomFill = t.labelBottomFill || bottomFill;
	          const topPlan = topLabels.get(i);
	          const bottomPlan = bottomLabels.get(i);
	          const topX = topRotation ? x : topPlan?.x ?? x;
	          const bottomX = bottomRotation ? x : bottomPlan?.x ?? x;
	          const topY = topRotation ? axisY - tickSize * 0.5 - 8 : y1 - 4 - (topPlan?.lane ?? 0) * metrics.top.lineHeight;
	          const bottomY = bottomRotation ? axisY + tickSize * 0.5 + 8 : y2 + 4 + (bottomPlan?.lane ?? 0) * metrics.bottom.lineHeight;
	          return (
	            <g key={i}>
	              <line x1={x} x2={x} y1={y1} y2={y2} stroke={tickStroke} strokeWidth={tickStrokeWidth} opacity={0.9} />
	              {top && !topRotation && (Math.abs(topX - x) > 1 || (topPlan?.lane ?? 0) > 0) ? (
	                <line data-ggt-label-leader="top" x1={x} y1={y1} x2={topX} y2={topY + 2} stroke={tickStroke} strokeWidth={Math.min(1, tickStrokeWidth)} />
	              ) : null}
	              {bottom && !bottomRotation && (Math.abs(bottomX - x) > 1 || (bottomPlan?.lane ?? 0) > 0) ? (
	                <line data-ggt-label-leader="bottom" x1={x} y1={y2} x2={bottomX} y2={bottomY - 2} stroke={tickStroke} strokeWidth={Math.min(1, tickStrokeWidth)} />
	              ) : null}
	              {top ? (
	                <text
	                  data-ggt-label="marker-name"
	                  data-ggt-marker-index={i}
	                  data-ggt-track-id={track.id}
	                  x={topX}
	                  y={topY}
	                  fill={tickTopFill}
	                  fontFamily={cfg.text.fontFamily}
	                  fontSize={topFontSize}
	                  fontWeight={800}
	                  textAnchor={topRotation ? "start" : "middle"}
	                  transform={topRotation ? `rotate(${topRotation}, ${topX}, ${topY})` : undefined}
	                  dominantBaseline="auto"
	                >
	                  {top}
	                </text>
	              ) : null}
	              {bottom ? (
	                <text
	                  data-ggt-label="marker-position"
	                  data-ggt-marker-index={i}
	                  data-ggt-track-id={track.id}
	                  x={bottomX}
	                  y={bottomY}
	                  fill={tickBottomFill}
	                  fontFamily={cfg.text.fontFamily}
	                  fontSize={bottomFontSize}
	                  fontWeight={800}
	                  textAnchor={bottomRotation ? "start" : "middle"}
	                  transform={bottomRotation ? `rotate(${bottomRotation}, ${bottomX}, ${bottomY})` : undefined}
	                  dominantBaseline="hanging"
                >
                  {bottom}
                </text>
              ) : null}
            </g>
          );
        })}
        {title ? (
          <text
            x={cfg.plotX + cfg.plotWidth + 10}
            y={axisY + tickSize * 0.5 + 4}
            fill={titleFill}
            fontFamily={cfg.text.fontFamily}
            fontSize={titleFontSize}
            fontWeight={900}
            textAnchor="start"
            dominantBaseline="hanging"
          >
            {title}
          </text>
        ) : null}
      </g>
    );
  };

  const renderAnnotationHeaders = (): React.ReactNode => {
    const headers = cfg.annotationHeaders;
    if (!headers || (!headers.left && !headers.right)) return null;

    const firstData = rows.find((r) => (Array.isArray(r.track.segments) ? r.track.segments : []).length > 0);
    if (!firstData) return null;
    const y = Math.max(12, firstData.y - 14);
    return (
      <g>
        {annotationHeaderCols.map((label, i) =>
          label ? (
            <text
              key={`anno-h-${i}`}
              data-ggt-label="annotation-header"
              x={(annoColXs[i] ?? annotationAreaX) + (annoColWs[i] ?? 120) * 0.5}
              y={y}
              fill={headers.fill}
              fontFamily={cfg.text.fontFamily}
              fontSize={fitFontSizeToWidth(label, annoColWs[i] ?? 120, headers.fontSize, measureW, 900, 10)}
              fontWeight={900}
              textAnchor="middle"
            >
              {label}
            </text>
          ) : null,
        )}
        {headers.right ? (
          <text
            data-ggt-label="mark-header"
            x={markX}
            y={y}
            fill={headers.fill}
            fontFamily={cfg.text.fontFamily}
            fontSize={headers.fontSize}
            fontWeight={900}
            textAnchor="middle"
          >
            {headers.right}
          </text>
        ) : null}
      </g>
    );
  };

  const renderColumnGroups = (): React.ReactNode => {
    if (!cfg.columns || cfg.columns < 2) return null;
    if (!cfg.columnGroups.length) return null;
    const boundaries = cfg.xBoundaries.length ? cfg.xBoundaries : Array.from({ length: cfg.columns + 1 }, (_, i) => i / cfg.columns);
    const axis = cfg.xAxis;
    const axisOnTop = Boolean(axis && axis.show !== false && axis.placement !== "bottom" && axis.ticks?.length);
    const axisLabels = axisOnTop && axis ? layoutAxisLabels(axis.ticks, cfg.plotX, cfg.plotWidth, axis.fontSize ?? 12, measureW, 700) : undefined;
    const axisPad = axisOnTop ? (axis?.offset ?? 18) + (axis?.tickSize ?? 7) + (axisLabels?.height ?? 12) + 14 : 16;
    const labelY = Math.max(12, cfg.plotY - axisPad);
    return (
      <g>
        {cfg.columnGroups.map((g, idx) => {
          const start = clamp(boundaries[g.start] ?? g.start / cfg.columns, 0, 1);
          const end = clamp(boundaries[g.end] ?? g.end / cfg.columns, 0, 1);
          const x0 = cfg.plotX + start * cfg.plotWidth;
          const x1 = cfg.plotX + end * cfg.plotWidth;
          const fill = g.fill;
          const fillOpacity = g.fillOpacity ?? 0;
          return (
            <g key={`${g.label}-${idx}`}>
              {fill && fillOpacity > 0 ? (
                <rect
                  x={x0}
                  y={plotYStart}
                  width={Math.max(0, x1 - x0)}
                  height={plotYEnd - plotYStart}
                  fill={fill}
                  opacity={fillOpacity}
                />
              ) : null}
              <text
                x={(x0 + x1) / 2}
                y={labelY}
                fill={cfg.text.fill}
                fontFamily={cfg.text.fontFamily}
                fontSize={Math.max(12, Math.round(cfg.text.fontSize * 0.9))}
                fontWeight={700}
                textAnchor="middle"
              >
                {g.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderXAxis = (): React.ReactNode => {
    const axis = cfg.xAxis;
    if (!axis || axis.show === false) return null;
    const ticks = Array.isArray(axis.ticks) ? axis.ticks : [];
    if (!ticks.length) return null;

    const placement = axis.placement === "bottom" ? "bottom" : "top";
    const tickDir = placement === "top" ? -1 : 1;
    const tickSize = axis.tickSize ?? 7;
    const fontSize = axis.fontSize ?? Math.max(10, Math.round(cfg.text.fontSize * 0.65));
    const offset = axis.offset ?? 18;

    const yBase = placement === "top" ? cfg.plotY - offset : plotYEnd + offset;
    const yLine = clamp(yBase, 0, cfg.height);

    const x0 = cfg.plotX;
    const x1 = cfg.plotX + cfg.plotWidth;

    const title = (axis.title || "").trim();
    const labelPlan = layoutAxisLabels(ticks, cfg.plotX, cfg.plotWidth, fontSize, measureW, 700);
    const labelsByIndex = new Map(labelPlan.labels.map((label) => [label.index, label]));

    return (
      <g>
        <line x1={x0} x2={x1} y1={yLine} y2={yLine} stroke={axis.stroke} strokeWidth={axis.strokeWidth ?? 1} opacity={0.85} />
        {ticks.map((t, i) => {
          const x = cfg.plotX + clamp(t.x, 0, 1) * cfg.plotWidth;
          const len = t.major ? tickSize : Math.max(3, Math.round(tickSize * 0.6));
          const y2 = yLine + tickDir * len;
          const label = (t.label || "").trim();
          const planned = labelsByIndex.get(i);
          const labelX = planned?.x ?? x;
          const labelY = yLine + tickDir * (len + 4 + (planned?.lane ?? 0) * labelPlan.lineHeight);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yLine} y2={y2} stroke={axis.stroke} strokeWidth={axis.strokeWidth ?? 1} opacity={0.85} />
              {label && (Math.abs(labelX - x) > 1 || (planned?.lane ?? 0) > 0) ? (
                <line data-ggt-label-leader="x-axis" x1={x} y1={y2} x2={labelX} y2={labelY - tickDir * 2} stroke={axis.stroke} strokeWidth={1} />
              ) : null}
              {label ? (
                <text
                  data-ggt-label="x-axis"
                  x={labelX}
                  y={labelY}
                  fill={axis.fill || cfg.text.fill}
                  fontFamily={cfg.text.fontFamily}
                  fontSize={fontSize}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline={placement === "top" ? "auto" : "hanging"}
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
        {title ? (
          <text
            x={x1 + 8}
            y={yLine + (placement === "top" ? tickDir * (tickSize + 4) : tickDir * (tickSize + 4))}
            fill={axis.titleFill || axis.fill || cfg.text.fill}
            fontFamily={cfg.text.fontFamily}
            fontSize={axis.titleFontSize ?? fontSize}
            fontWeight={800}
            textAnchor="start"
            dominantBaseline={placement === "top" ? "auto" : "hanging"}
          >
            {title}
          </text>
        ) : null}
      </g>
    );
  };

  const renderGuides = (): React.ReactNode => {
    const guides = cfg.guides;
    if (!guides || !guides.show) return null;
    const boundaries = cfg.xBoundaries;
    if (!boundaries.length || boundaries.length < 2) return null;

    const candidates = rows.filter(
      (r) => {
        const segs = Array.isArray(r.track.segments) ? r.track.segments : [];
        const hasAxis = Boolean((r.track as unknown as { axis?: unknown })?.axis);
        if (!segs.length && !hasAxis) return false;
        return r.track.showColumnLines !== false;
      },
    );
    if (!candidates.length) return null;
    const first = candidates[0];
    const y1 = first.track.axis ? first.y + (first.track.axis.yOffset ?? first.h * 0.5) : first.y;
    const y2 = candidates[candidates.length - 1].y + candidates[candidates.length - 1].h;

    const xs =
      guides.mode === "centers"
        ? boundaries.slice(0, -1).map((b, i) => (b + (boundaries[i + 1] ?? b)) / 2)
        : boundaries.slice(1, -1);

    return (
      <g>
        {xs.map((xNorm, i) => {
          if (!Number.isFinite(xNorm)) return null;
          const x = cfg.plotX + clamp(xNorm, 0, 1) * cfg.plotWidth;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={y1}
              y2={y2}
              stroke={guides.stroke}
              strokeWidth={guides.strokeWidth}
              strokeDasharray={guides.dash}
              opacity={guides.opacity}
            />
          );
        })}
      </g>
    );
  };

  const renderGroupBoundaries = (): React.ReactNode => {
    if (!cfg.columns || cfg.columns < 2) return null;
    if (!cfg.columnGroups.length) return null;
    const boundaries = cfg.xBoundaries.length ? cfg.xBoundaries : Array.from({ length: cfg.columns + 1 }, (_, i) => i / cfg.columns);
    const first = rows[0];
    const boundaryYStart = first?.track.axis ? first.y + (first.track.axis.yOffset ?? first.h * 0.5) : plotYStart;
    return (
      <g>
        {cfg.columnGroups.map((g, idx) => {
          const hasBoundary = g.end > 0 && g.end < cfg.columns;
          if (!hasBoundary) return null;
          const x1 = cfg.plotX + clamp(boundaries[g.end] ?? g.end / cfg.columns, 0, 1) * cfg.plotWidth;
          const stroke = g.stroke || cfg.colLine.stroke;
          const strokeWidth = g.strokeWidth ?? Math.max(2, cfg.colLine.strokeWidth * 2);
          return (
            <line
              key={`${g.label}-${idx}`}
              x1={x1}
              x2={x1}
              y1={boundaryYStart}
              y2={plotYEnd}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={0.9}
            />
          );
        })}
      </g>
    );
  };

  const renderLegend = (): React.ReactNode => {
    const legend = cfg.legend;
    if (!legend) return null;
    const items = Array.isArray(legend.items) ? legend.items : [];
    if (!items.length) return null;

    const x = Number.isFinite(legend.x as number) ? (legend.x as number) : annotationAreaX;
    const y = Number.isFinite(legend.y as number) ? (legend.y as number) : cfg.plotY;
    const padding = legend.padding ?? 10;
    const itemSize = legend.itemSize ?? 14;
    const itemGap = legend.itemGap ?? 8;
    const fontSizeWanted = legend.fontSize ?? Math.max(12, Math.round(cfg.text.fontSize * 0.85));
    const textFill = legend.textFill || cfg.text.fill;
    const title = (legend.title || "").trim();
    const maxAvailW = Math.max(120, Math.floor(cfg.width - x - 12));

    const computeBoxW = (fs: number): number => {
      const titleFs = Math.max(fs, Math.round(fs * 1.05));
      const titleW = title ? measureW(title, titleFs, 800) : 0;
      const labelW = Math.max(0, ...items.map((it) => measureW(it.label || "", fs, 700)));
      const textW = Math.max(titleW, labelW, measureW("XXXXXX", fs, 700));
      return padding * 2 + itemSize + 10 + textW;
    };

    let fontSize = fontSizeWanted;
    const minFontSize = 10;
    for (let guard = 0; guard < 40; guard += 1) {
      if (computeBoxW(fontSize) <= maxAvailW || fontSize <= minFontSize) break;
      fontSize -= 1;
    }

    const titleFontSize = Math.max(fontSize, Math.round(fontSize * 1.05));
    const boxW = computeBoxW(fontSize);
    const titleHeight = title ? Math.ceil(titleFontSize * 1.25) + 14 : 0;
    const itemHeight = Math.max(itemSize, Math.ceil(fontSize * 1.35));
    const boxH = padding * 2 + titleHeight + items.length * itemHeight + Math.max(0, items.length - 1) * itemGap;

    const bg = legend.background;
    const border = legend.border;
    const borderWidth = legend.borderWidth ?? 1;
    return (
      <g data-ggt-legend="true">
        {bg || border ? (
          <rect
            x={x}
            y={y}
            width={boxW}
            height={boxH}
            rx={10}
            ry={10}
            fill={bg || "none"}
            stroke={border || "none"}
            strokeWidth={border ? borderWidth : 0}
          />
        ) : null}
        {title ? (
          <text
            x={x + boxW * 0.5}
            y={y + padding}
            fill={textFill}
            fontFamily={cfg.text.fontFamily}
            fontSize={titleFontSize}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="hanging"
          >
            {title}
          </text>
        ) : null}
        {items.map((it, i) => {
          const y0 = y + padding + titleHeight + i * (itemHeight + itemGap);
          const stroke = it.stroke || "none";
          const strokeWidth = it.strokeWidth ?? 0;
          return (
            <g key={`${it.label}-${i}`}>
              <rect
                x={x + padding}
                y={y0 + (itemHeight - itemSize) * 0.5}
                width={itemSize}
                height={itemSize}
                fill={it.fill}
                stroke={strokeWidth > 0 ? stroke : "none"}
                strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
              />
              <text
                x={x + padding + itemSize + 10}
                y={y0 + itemHeight * 0.5}
                fill={textFill}
                fontFamily={cfg.text.fontFamily}
                fontSize={fontSize}
                fontWeight={700}
                dominantBaseline="middle"
              >
                {it.label || ""}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderOverlays = (layer: "under" | "over"): React.ReactNode => {
    const overlays = Array.isArray(cfg.overlays) ? cfg.overlays : [];
    const draft = editor?.draftOverlay;
    if (!overlays.length && (!draft || (draft.layer || "over") !== layer)) return null;
    const enablePointer = Boolean(editor?.enableOverlayPointerEvents);
    return (
      <g>
        {overlays.map((o, i) => {
          const target = (o.layer || "over") === layer;
          if (!target) return null;
          const opacity = (o as { opacity?: unknown }).opacity;
          const opacityNum = Number.isFinite(opacity as number) ? (opacity as number) : undefined;
          const overlayId = typeof (o as { id?: unknown }).id === "string" ? (o as { id: string }).id : undefined;
          const locked = Boolean((o as { locked?: unknown }).locked);
          const pointerEvents = enablePointer && overlayId && !locked ? "visiblePainted" : "none";

          if ((o as { kind?: unknown }).kind === "line") {
            const l = o as OverlayShape & { kind: "line" };
            const stroke = l.stroke || cfg.text.fill;
            const strokeWidth = l.strokeWidth ?? 2;
            const dash = l.dash;
            const cap = l.lineCap || "round";
            const markerStart = l.markerStart === "arrow" ? "url(#ggt-arrow)" : undefined;
            const markerEnd = l.markerEnd === "arrow" ? "url(#ggt-arrow)" : undefined;
            return (
              <line
                key={i}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={stroke}
                color={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                strokeLinecap={cap}
                opacity={opacityNum}
                markerStart={markerStart}
                markerEnd={markerEnd}
                data-ggt-overlay-id={overlayId}
                data-ggt-role={o.role}
                pointerEvents={pointerEvents}
              />
            );
          }
          if ((o as { kind?: unknown }).kind === "rect") {
            const r = o as OverlayShape & { kind: "rect" };
            return (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                rx={r.rx ?? 0}
                ry={r.ry ?? 0}
                fill={r.fill || "none"}
                stroke={r.stroke || "none"}
                strokeWidth={r.stroke ? r.strokeWidth ?? 1 : 0}
                opacity={opacityNum}
                data-ggt-overlay-id={overlayId}
                data-ggt-role={o.role}
                pointerEvents={pointerEvents}
              />
            );
          }
          if ((o as { kind?: unknown }).kind === "path") {
            const p = o as OverlayShape & { kind: "path" };
            return (
              <path
                key={i}
                d={p.d}
                fill={p.fill || "none"}
                stroke={p.stroke || "none"}
                strokeWidth={p.stroke ? p.strokeWidth ?? 1 : 0}
                strokeDasharray={p.dash}
                opacity={opacityNum}
                data-ggt-overlay-id={overlayId}
                data-ggt-role={o.role}
                pointerEvents={pointerEvents}
              />
            );
          }
          if ((o as { kind?: unknown }).kind === "text") {
            const t = o as OverlayShape & { kind: "text" };
            return (
              <text
                key={i}
                x={t.x}
                y={t.y}
                fill={t.fill || cfg.text.fill}
                fontFamily={t.fontFamily || cfg.text.fontFamily}
                fontSize={t.fontSize ?? cfg.text.fontSize}
                fontWeight={t.fontWeight ?? 800}
                fontStyle={t.fontStyle || "normal"}
                textAnchor={t.anchor || "start"}
                dominantBaseline={t.baseline || "auto"}
                transform={t.rotation ? `rotate(${t.rotation}, ${t.x}, ${t.y})` : undefined}
                opacity={opacityNum}
                data-ggt-overlay-id={overlayId}
                data-ggt-role={t.role}
                data-ggt-label={t.role}
                data-ggt-row-id={t.rowId}
                data-ggt-track-id={t.role === "marker-position" ? "__thesis_axis__" : undefined}
                data-ggt-marker-index={t.role === "marker-position" ? t.markerIndex : undefined}
                pointerEvents={t.rowId || t.markerIndex !== undefined ? "visiblePainted" : pointerEvents}
              >
                {t.text}
              </text>
            );
          }
          return null;
        })}
        {draft && (draft.layer || "over") === layer ? (
          <g data-export-exclude="true">
          {(() => {
            const opacity = (draft as { opacity?: unknown }).opacity;
            const opacityNum = Number.isFinite(opacity as number) ? (opacity as number) : 0.7;
            if ((draft as { kind?: unknown }).kind === "line") {
              const l = draft as OverlayShape & { kind: "line" };
              const stroke = l.stroke || "#3b82f6";
              const strokeWidth = l.strokeWidth ?? 3;
              const dash = l.dash || "6 6";
              const cap = l.lineCap || "round";
              const markerStart = l.markerStart === "arrow" ? "url(#ggt-arrow)" : undefined;
              const markerEnd = l.markerEnd === "arrow" ? "url(#ggt-arrow)" : undefined;
              return (
                <line
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={stroke}
                  color={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  strokeLinecap={cap}
                  opacity={opacityNum}
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                  pointerEvents="none"
                />
              );
            }
            if ((draft as { kind?: unknown }).kind === "rect") {
              const r = draft as OverlayShape & { kind: "rect" };
              return (
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  rx={r.rx ?? 0}
                  ry={r.ry ?? 0}
                  fill={r.fill || "none"}
                  stroke={r.stroke || "#3b82f6"}
                  strokeWidth={r.strokeWidth ?? 2}
                  opacity={opacityNum}
                  strokeDasharray={"6 6"}
                  pointerEvents="none"
                />
              );
            }
            if ((draft as { kind?: unknown }).kind === "text") {
              const t = draft as OverlayShape & { kind: "text" };
              return (
                <text
                  x={t.x}
                  y={t.y}
                  fill={t.fill || "#3b82f6"}
                  fontFamily={t.fontFamily || cfg.text.fontFamily}
                  fontSize={t.fontSize ?? cfg.text.fontSize}
                  fontWeight={t.fontWeight ?? 800}
                  fontStyle={t.fontStyle || "normal"}
                  textAnchor={t.anchor || "start"}
                  dominantBaseline={t.baseline || "auto"}
                  opacity={opacityNum}
                  pointerEvents="none"
                >
                  {t.text}
                </text>
              );
            }
            if ((draft as { kind?: unknown }).kind === "path") {
              const p = draft as OverlayShape & { kind: "path" };
              return (
                <path
                  d={p.d}
                  fill={p.fill || "none"}
                  stroke={p.stroke || "#3b82f6"}
                  strokeWidth={p.strokeWidth ?? 2}
                  strokeDasharray={p.dash || "6 6"}
                  opacity={opacityNum}
                  pointerEvents="none"
                />
              );
            }
            return null;
          })()}
          </g>
        ) : null}
      </g>
    );
  };

  const renderEditorSelection = (): React.ReactNode => {
    const selectedId = (editor?.selectedOverlayId || "").trim();
    if (!selectedId) return null;
    const overlays = Array.isArray(cfg.overlays) ? cfg.overlays : [];
    const selected = overlays.find((o) => (o as { id?: unknown }).id === selectedId);
    if (!selected) return null;

    const kind = (selected as { kind?: unknown }).kind;
    const stroke = "#3b82f6";
    const handleFill = "#ffffff";
    const handleStroke = "#1d4ed8";
    const handleSize = 10;
    const handleHalf = handleSize / 2;

    const rectHandle = (x: number, y: number, handle: string, cursor: string): React.ReactNode => (
      <rect
        x={x - handleHalf}
        y={y - handleHalf}
        width={handleSize}
        height={handleSize}
        fill={handleFill}
        stroke={handleStroke}
        strokeWidth={2}
        rx={2}
        ry={2}
        data-ggt-overlay-id={selectedId}
        data-ggt-overlay-handle={handle}
        pointerEvents="all"
        style={{ cursor }}
      />
    );

    const lineHandle = (x: number, y: number, handle: string): React.ReactNode => (
      <circle
        cx={x}
        cy={y}
        r={6}
        fill={handleFill}
        stroke={handleStroke}
        strokeWidth={2}
        data-ggt-overlay-id={selectedId}
        data-ggt-overlay-handle={handle}
        pointerEvents="all"
        style={{ cursor: "move" }}
      />
    );

    const selectionRect = (x: number, y: number, w: number, h: number): React.ReactNode => (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="4 4"
        data-ggt-overlay-id={selectedId}
        pointerEvents="visibleStroke"
        style={{ cursor: "move" }}
      />
    );

    if (kind === "rect") {
      const r = selected as OverlayShape & { kind: "rect" };
      const x0 = Math.min(r.x, r.x + r.width);
      const y0 = Math.min(r.y, r.y + r.height);
      const x1 = Math.max(r.x, r.x + r.width);
      const y1 = Math.max(r.y, r.y + r.height);
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      return (
        <g>
          {selectionRect(x0, y0, w, h)}
          {rectHandle(x0, y0, "rect-nw", "nwse-resize")}
          {rectHandle(x1, y0, "rect-ne", "nesw-resize")}
          {rectHandle(x0, y1, "rect-sw", "nesw-resize")}
          {rectHandle(x1, y1, "rect-se", "nwse-resize")}
        </g>
      );
    }

    if (kind === "line") {
      const l = selected as OverlayShape & { kind: "line" };
      const x0 = Math.min(l.x1, l.x2);
      const y0 = Math.min(l.y1, l.y2);
      const x1 = Math.max(l.x1, l.x2);
      const y1 = Math.max(l.y1, l.y2);
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      return (
        <g>
          {selectionRect(x0, y0, w, h)}
          {lineHandle(l.x1, l.y1, "line-start")}
          {lineHandle(l.x2, l.y2, "line-end")}
        </g>
      );
    }

    if (kind === "text") {
      const t = selected as OverlayShape & { kind: "text" };
      const fontSize = t.fontSize ?? cfg.text.fontSize;
      const text = (t.text || "").trim();
      const w = Math.max(16, measureW(text || "Text", fontSize, t.fontWeight ?? 700));
      const h = Math.max(12, Math.round(fontSize * 1.2));
      const x = t.anchor === "middle" ? t.x - w * 0.5 : t.anchor === "end" ? t.x - w : t.x;
      const y = t.baseline === "hanging" ? t.y : t.baseline === "middle" || t.baseline === "central" ? t.y - h * 0.5 : t.y - h;
      return <g>{selectionRect(x, y, w, h)}</g>;
    }

    return null;
  };

  const renderEditorUiGuides = (): React.ReactNode => {
    const guides = Array.isArray(editor?.uiGuides) ? editor!.uiGuides! : [];
    if (!guides.length) return null;
    return (
      <g>
        {guides.map((g) => (
          <line
            key={g.id}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={g.stroke || "#ec4899"}
            strokeWidth={g.strokeWidth ?? 1.5}
            strokeDasharray={g.dash}
            opacity={Number.isFinite(g.opacity as number) ? (g.opacity as number) : 0.9}
            pointerEvents="none"
          />
        ))}
      </g>
    );
  };

  const renderEditorUiHandles = (): React.ReactNode => {
    const handles = Array.isArray(editor?.uiHandles) ? editor!.uiHandles! : [];
    if (!handles.length) return null;

    const defaultFill = "#ffffff";
    const defaultStroke = "#2563eb";
    const defaultStrokeWidth = 2;
    return (
      <g>
        {handles.map((h) => {
          const opacity = Number.isFinite(h.opacity as number) ? (h.opacity as number) : undefined;
          const fill = h.fill ?? defaultFill;
          const stroke = h.stroke ?? defaultStroke;
          const strokeWidth = h.strokeWidth ?? defaultStrokeWidth;
          const dash = h.dash;
          const style = h.cursor ? ({ cursor: h.cursor } as React.CSSProperties) : undefined;
          if (h.kind === "circle") {
            return (
              <circle
                key={h.id}
                cx={h.x}
                cy={h.y}
                r={h.r}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                strokeDasharray={dash}
                pointerEvents="all"
                data-ggt-ui-handle={h.id}
                style={style}
              >
                {h.title ? <title>{h.title}</title> : null}
              </circle>
            );
          }
          return (
            <rect
              key={h.id}
              x={h.x}
              y={h.y}
              width={h.width}
              height={h.height}
              rx={h.rx ?? 0}
              ry={h.ry ?? 0}
              fill={fill}
              stroke={strokeWidth > 0 ? stroke : "none"}
              strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
              opacity={opacity}
              strokeDasharray={dash}
              pointerEvents="all"
              data-ggt-ui-handle={h.id}
              style={style}
            >
              {h.title ? <title>{h.title}</title> : null}
            </rect>
          );
        })}
      </g>
    );
  };

  return (
    <svg ref={ref} width={cfg.width} height={cfg.height} viewBox={`0 0 ${cfg.width} ${cfg.height}`} xmlns="http://www.w3.org/2000/svg" textRendering="geometricPrecision" style={{ letterSpacing: 0 }}>
      <defs>
        <marker
          id="ggt-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8.5"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
        <pattern id="ggt-pat-line-a" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect x="0" y="0" width="8" height="8" fill="#ffffff" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#000000" strokeWidth="2" />
        </pattern>
        <pattern id="ggt-pat-line-b" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect x="0" y="0" width="8" height="8" fill="#ffffff" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#000000" strokeWidth="2" />
        </pattern>
        <pattern id="ggt-pat-dot-h" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="6" height="6" fill="#ffffff" />
          <circle cx="3" cy="3" r="1.5" fill="#000000" />
        </pattern>
        <pattern id="ggt-pat-grid-h" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="8" height="8" fill="#ffffff" />
          <path d="M 0 0 L 8 0 M 0 0 L 0 8" stroke="#000000" strokeWidth="1" fill="none" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={cfg.width} height={cfg.height} fill={cfg.background} />

      {renderOverlays("under")}

      {renderColumnGroups()}
      {renderXAxis()}
      {renderAnnotationHeaders()}

      {rows.map(({ track, y, h }, rowIdx) => {
        const axisTrack = renderAxisTrack(track, y, h);
        const rightCols = rowAnnotationCols[rowIdx] ?? trimTrailingEmptyColumns(splitAnnotationColumns(track.rightText?.text));
        const rightFill = track.rightText?.fill || cfg.text.fill;
        const rightFontSize = track.rightText?.fontSize ?? cfg.text.fontSize;
        const leftText = track.leftText?.text?.trim();
        const leftFill = track.leftText?.fill || cfg.text.fill;
        const leftFontSize = track.leftText?.fontSize ?? cfg.text.fontSize;
        const circle = track.rightCircle;
        const circleR = circle?.r ?? 14;
        const circleStroke = circle?.stroke || cfg.text.fill;
        const circleStrokeWidth = circle?.strokeWidth ?? 6;
        const cross = track.rightCross;
        const crossSize = cross?.size ?? 18;
        const crossStroke = cross?.stroke || cfg.text.fill;
        const crossStrokeWidth = cross?.strokeWidth ?? 6;

        return (
          <g key={track.id} data-ggt-track={track.id} transform={`translate(0, 0)`}>
            {axisTrack}
            {(Array.isArray(track.segments) ? track.segments : []).map((seg, i) => {
              const start = clamp(seg.start, 0, 1);
              const end = clamp(seg.end, 0, 1);
              const x = cfg.plotX + Math.min(start, end) * cfg.plotWidth;
              const w = Math.abs(end - start) * cfg.plotWidth;
              const stroke = seg.stroke || cfg.segment.stroke;
              const strokeWidth = seg.strokeWidth ?? cfg.segment.strokeWidth;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={seg.fill}
                  stroke={strokeWidth > 0 && stroke !== "none" ? stroke : "none"}
                  strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
                />
              );
            })}
            {cfg.guides?.show ? null : colLines(y, h, track.showColumnLines)}
            {leftText ? (
              (() => {
                const maxW = Math.max(12, leftLabelX - 14);
                const maxFsByHeight = Math.max(10, Math.floor(h * 0.7));
                const fs0 = Math.min(leftFontSize, maxFsByHeight);
                const fs = fitFontSizeToWidth(leftText, maxW, fs0, measureW, 800, 10);
                return (
                  <text
                    data-ggt-label="sample"
                    data-ggt-row-id={track.id}
                    x={leftLabelX}
                    y={y + h * 0.5}
                    fill={leftFill}
                    fontFamily={cfg.text.fontFamily}
                    fontSize={fs}
                    fontWeight={800}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {leftText}
                  </text>
                );
              })()
            ) : null}
            {rightCols.map((txt, i) =>
              txt ? (
                (() => {
                  const colW = annoColWs[i] ?? 120;
                  const maxFsByHeight = Math.max(10, Math.floor(h * 0.7));
                  const fs0 = Math.min(rightFontSize, maxFsByHeight);
                  const fs = fitFontSizeToWidth(txt, colW, fs0, measureW, 700, 10);
                  return (
                <text
                  key={`anno-${track.id}-${i}`}
                  data-ggt-label="annotation"
                  data-ggt-row-id={track.id}
                  x={(annoColXs[i] ?? annotationAreaX) + colW * 0.5}
                  y={y + h * 0.5}
                  fill={rightFill}
                  fontFamily={cfg.text.fontFamily}
                  fontSize={fs}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {txt}
                </text>
                  );
                })()
              ) : null,
            )}
            {circle ? (
              <circle
                pointerEvents="all"
                data-ggt-mark-row={track.id}
                cx={markX}
                cy={y + h * 0.5}
                r={circleR}
                fill="none"
                stroke={circleStroke}
                strokeWidth={circleStrokeWidth}
              />
            ) : null}
            {cross ? (
              <g data-ggt-mark-row={track.id}>
                <line
                  x1={markX - crossSize * 0.5}
                  x2={markX + crossSize * 0.5}
                  y1={y + h * 0.5 - crossSize * 0.5}
                  y2={y + h * 0.5 + crossSize * 0.5}
                  stroke={crossStroke}
                  strokeWidth={crossStrokeWidth}
                />
                <line
                  x1={markX - crossSize * 0.5}
                  x2={markX + crossSize * 0.5}
                  y1={y + h * 0.5 + crossSize * 0.5}
                  y2={y + h * 0.5 - crossSize * 0.5}
                  stroke={crossStroke}
                  strokeWidth={crossStrokeWidth}
                />
              </g>
            ) : null}
          </g>
        );
      })}

      {renderGuides()}
      {renderGroupBoundaries()}
      {renderLegend()}

      {renderOverlays("over")}
      <g data-export-exclude="true">
        {renderEditorUiGuides()}
        {renderEditorSelection()}
        {renderEditorUiHandles()}
      </g>
    </svg>
  );
});

GraphicalGenotypeSvg.displayName = "GraphicalGenotypeSvg";
