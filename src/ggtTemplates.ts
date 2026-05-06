export type GraphSegment = {
  start: number;
  end: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

export type GraphTrack = {
  id: string;
  height?: number;
  gapAfter?: number;
  showColumnLines?: boolean;
  segments: GraphSegment[];
  leftText?: { text: string; fill?: string; fontSize?: number };
  rightText?: { text: string; fill?: string; fontSize?: number };
  rightCircle?: { stroke?: string; strokeWidth?: number; r?: number };
  rightCross?: { stroke?: string; strokeWidth?: number; size?: number };
  axis?: {
    stroke?: string;
    strokeWidth?: number;
    tickSize?: number;
    tickStroke?: string;
    tickStrokeWidth?: number;
    labelTopFill?: string;
    labelBottomFill?: string;
    labelTopFontSize?: number;
    labelBottomFontSize?: number;
    title?: string;
    titleFill?: string;
    titleFontSize?: number;
    ticks: { x: number; major?: boolean; labelTop?: string; labelBottom?: string; labelTopFill?: string; labelBottomFill?: string }[];
  };
};

export type ColumnGroup = {
  label: string;
  start: number;
  end: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillOpacity?: number;
};

export type LegendItem = {
  label: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

export type LegendConfig = {
  x?: number;
  y?: number;
  title?: string;
  fontSize?: number;
  textFill?: string;
  itemSize?: number;
  itemGap?: number;
  padding?: number;
  background?: string;
  border?: string;
  borderWidth?: number;
  items: LegendItem[];
};

export type XAxisTick = { x: number; label?: string; major?: boolean };

export type XAxisConfig = {
  show?: boolean;
  placement?: "top" | "bottom";
  offset?: number;
  tickSize?: number;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  fill?: string;
  title?: string;
  titleFill?: string;
  titleFontSize?: number;
  ticks: XAxisTick[];
};

export type OverlayBase = {
  id?: string;
  name?: string;
  locked?: boolean;
  layer?: "under" | "over";
  opacity?: number;
};
export type OverlayLine = OverlayBase & {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  lineCap?: "butt" | "round" | "square";
  markerStart?: "arrow";
  markerEnd?: "arrow";
};
export type OverlayRect = OverlayBase & {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
};
export type OverlayText = OverlayBase & {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fill?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  anchor?: "start" | "middle" | "end";
  baseline?: "auto" | "hanging" | "middle" | "central";
};
export type OverlayPath = OverlayBase & {
  kind: "path";
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
};
export type OverlayShape = OverlayLine | OverlayRect | OverlayText | OverlayPath;

export type GraphConfig = {
  width: number;
  height: number;
  background?: string;
  columns?: number;
  xBoundaries?: number[];
  columnGroups?: ColumnGroup[];
  xAxis?: XAxisConfig;
  guides?: {
    show?: boolean;
    mode?: "boundaries" | "centers";
    stroke?: string;
    strokeWidth?: number;
    dash?: string;
    opacity?: number;
  };
  annotationHeaders?: { left?: string; right?: string; fill?: string; fontSize?: number };
  overlays?: OverlayShape[];
  legend?: LegendConfig;
  plot?: {
    x?: number;
    y?: number;
    width?: number;
    annotationWidth?: number;
    annotationColumnWidths?: number[];
    rowHeight?: number;
    rowGap?: number;
  };
  styles?: {
    columnLine?: { stroke?: string; strokeWidth?: number; dash?: string; opacity?: number };
    text?: { fontFamily?: string; fontSize?: number; fill?: string };
    segment?: { stroke?: string; strokeWidth?: number };
  };
  tracks: GraphTrack[];
};

export type GraphTemplate = { id: string; name: string; description?: string; config: GraphConfig };

export const prettyJson = (v: unknown): string => JSON.stringify(v, null, 2);

export type PalettePreset = {
  id: string;
  name: string;
  description?: string;
  colors: { A: string; B: string; H: string; "-": string; other: string };
  legend: LegendItem[];
};

export const palettePresets: PalettePreset[] = [
  {
    id: "cyan_yellow_white",
    name: "Cyan/Yellow/White",
    description: "A=cyan / B=yellow / H=white / missing=gray",
    colors: { A: "#06b6d4", B: "#fde047", H: "#ffffff", "-": "#cbd5e1", other: "#a78bfa" },
    legend: [
      { label: "A", fill: "#06b6d4" },
      { label: "B", fill: "#fde047" },
      { label: "H", fill: "#ffffff", stroke: "#111827", strokeWidth: 1 },
      { label: "Missing", fill: "#cbd5e1", stroke: "#111827", strokeWidth: 1 },
    ],
  },
  {
    id: "rqtl_like",
    name: "Blue/Green/Red",
    description: "A=blue / H=green / B=red（視認性優先）",
    colors: { A: "#2563eb", B: "#dc2626", H: "#16a34a", "-": "#e5e7eb", other: "#7c3aed" },
    legend: [
      { label: "AA", fill: "#2563eb" },
      { label: "AB", fill: "#16a34a" },
      { label: "BB", fill: "#dc2626" },
      { label: "Missing", fill: "#e5e7eb", stroke: "#111827", strokeWidth: 1 },
    ],
  },
  {
    id: "okabe_ito",
    name: "Okabe-Ito",
    description: "A=blue / B=orange / H=green / missing=gray",
    colors: { A: "#0072B2", B: "#E69F00", H: "#009E73", "-": "#9CA3AF", other: "#CC79A7" },
    legend: [
      { label: "A", fill: "#0072B2" },
      { label: "B", fill: "#E69F00" },
      { label: "H", fill: "#009E73" },
      { label: "Missing", fill: "#9CA3AF" },
    ],
  },
  {
    id: "blue_yellow_white",
    name: "Blue/Yellow/White",
    description: "A=blue / B=yellow / H=white / missing=white",
    colors: { A: "#00a8e8", B: "#fff200", H: "#ffffff", "-": "#ffffff", other: "#a78bfa" },
    legend: [
      { label: "A", fill: "#00a8e8" },
      { label: "B", fill: "#fff200" },
      { label: "H", fill: "#ffffff", stroke: "#111827", strokeWidth: 1 },
      { label: "-", fill: "#ffffff", stroke: "#111827", strokeWidth: 1 },
    ],
  },
  {
    id: "grayscale_patterns",
    name: "Grayscale Patterns",
    description: "Pattern fills for high-contrast monochrome output.",
    colors: { A: "url(#ggt-pat-line-a)", B: "url(#ggt-pat-line-b)", H: "url(#ggt-pat-dot-h)", "-": "#e5e7eb", other: "#9ca3af" },
    legend: [
      { label: "A", fill: "url(#ggt-pat-line-a)", stroke: "#111827", strokeWidth: 1 },
      { label: "B", fill: "url(#ggt-pat-line-b)", stroke: "#111827", strokeWidth: 1 },
      { label: "H", fill: "url(#ggt-pat-dot-h)", stroke: "#111827", strokeWidth: 1 },
      { label: "-", fill: "#e5e7eb", stroke: "#111827", strokeWidth: 1 },
    ],
  },
  {
    id: "high_contrast_bw",
    name: "High Contrast B/W",
    description: "Black, white, and gray for high-contrast printing.",
    colors: { A: "#111827", B: "#ffffff", H: "#9ca3af", "-": "#e5e7eb", other: "#6b7280" },
    legend: [
      { label: "A", fill: "#111827" },
      { label: "B", fill: "#ffffff", stroke: "#111827", strokeWidth: 1 },
      { label: "H", fill: "#9ca3af" },
      { label: "-", fill: "#e5e7eb", stroke: "#111827", strokeWidth: 1 },
    ],
  },
];

const getPalette = (paletteId?: string): PalettePreset =>
  palettePresets.find((p) => p.id === paletteId) || palettePresets[0];

const exampleLike: GraphConfig = {
  width: 1600,
  height: 900,
  background: "#000000",
  columns: 14,
  plot: {
    x: 130,
    y: 65,
    annotationWidth: 260,
    rowHeight: 60,
    rowGap: 34,
  },
  styles: {
    columnLine: { stroke: "#000000", strokeWidth: 1.2, dash: "2 4", opacity: 0.55 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 22, fill: "#ff2d2d" },
    segment: { stroke: "#000000", strokeWidth: 3 },
  },
  tracks: [
    {
      id: "top",
      height: 48,
      gapAfter: 220,
      showColumnLines: false,
      segments: [
        { start: 0.0, end: 0.08, fill: "#ffffff" },
        { start: 0.08, end: 0.28, fill: "#ff0000" },
        { start: 0.28, end: 1.0, fill: "#ffffff" },
      ],
    },
    {
      id: "row_01",
      segments: [{ start: 0, end: 1, fill: "#00a8e8" }],
      rightText: { text: "1", fill: "#ff2d2d" },
      rightCircle: { stroke: "#ff2d2d", strokeWidth: 6, r: 14 },
    },
    {
      id: "row_02",
      segments: [{ start: 0, end: 1, fill: "#fff200" }],
    },
    {
      id: "r1",
      segments: [
        { start: 0, end: 0.1, fill: "#00a8e8" },
        { start: 0.1, end: 1, fill: "#ffffff" },
      ],
    },
    {
      id: "r2",
      segments: [
        { start: 0, end: 0.09, fill: "#ffffff" },
        { start: 0.09, end: 1, fill: "#00a8e8" },
      ],
      rightText: { text: "1", fill: "#ff2d2d" },
      rightCircle: { stroke: "#ff2d2d", strokeWidth: 6, r: 14 },
    },
    {
      id: "r3",
      segments: [
        { start: 0, end: 0.1, fill: "#00a8e8" },
        { start: 0.1, end: 1, fill: "#ffffff" },
      ],
      rightCircle: { stroke: "#ff2d2d", strokeWidth: 6, r: 14 },
    },
  ],
};

const ggtClassicLight: GraphConfig = {
  width: 1600,
  height: 860,
  background: "#ffffff",
  columns: 40,
  columnGroups: [
    { label: "Block 1", start: 0, end: 22, stroke: "#111827", strokeWidth: 2 },
    { label: "Block 2", start: 22, end: 40, stroke: "#111827", strokeWidth: 2 },
  ],
  legend: {
    x: 120,
    y: 18,
    title: "Codes",
    fontSize: 14,
    textFill: "#111827",
    background: "#ffffff",
    border: "#d1d5db",
    borderWidth: 1,
    items: getPalette("okabe_ito").legend,
  },
  plot: { x: 120, y: 110, annotationWidth: 320, rowHeight: 30, rowGap: 10 },
  styles: {
    columnLine: { stroke: "#111827", strokeWidth: 1, dash: "2 4", opacity: 0.22 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 16, fill: "#111827" },
    segment: { stroke: "#111827", strokeWidth: 1.2 },
  },
  tracks: [
    { id: "Row 01", segments: [{ start: 0, end: 1, fill: "#0072B2" }], rightText: { text: "Row 01", fill: "#111827" } },
    { id: "Row 02", segments: [{ start: 0, end: 1, fill: "#E69F00" }], rightText: { text: "Row 02", fill: "#111827" } },
    { id: "Row 03", segments: [{ start: 0, end: 1, fill: "#009E73" }], rightText: { text: "Row 03 (H)", fill: "#111827" } },
    {
      id: "Row 04",
      segments: [
        { start: 0.0, end: 0.2, fill: "#0072B2" },
        { start: 0.2, end: 0.42, fill: "#009E73" },
        { start: 0.42, end: 0.55, fill: "#E69F00" },
        { start: 0.55, end: 0.78, fill: "#0072B2" },
        { start: 0.78, end: 1.0, fill: "#E69F00" },
      ],
      rightText: { text: "Row 04", fill: "#111827" },
    },
    {
      id: "Row 05",
      segments: [
        { start: 0.0, end: 0.12, fill: "#E69F00" },
        { start: 0.12, end: 0.55, fill: "#0072B2" },
        { start: 0.55, end: 0.7, fill: "#009E73" },
        { start: 0.7, end: 0.92, fill: "#E69F00" },
        { start: 0.92, end: 1.0, fill: "#9CA3AF" },
      ],
      rightText: { text: "Row 05", fill: "#111827" },
    },
  ],
};

const ggtClassicDark: GraphConfig = {
  width: 1600,
  height: 860,
  background: "#0b1020",
  columns: 40,
  columnGroups: [
    { label: "Block 1", start: 0, end: 22, stroke: "#1f2937", strokeWidth: 2 },
    { label: "Block 2", start: 22, end: 40, stroke: "#1f2937", strokeWidth: 2 },
  ],
  legend: {
    x: 120,
    y: 18,
    title: "Codes",
    fontSize: 14,
    textFill: "#e5e7eb",
    background: "#111827",
    border: "#334155",
    borderWidth: 1,
    items: getPalette("cyan_yellow_white").legend,
  },
  plot: { x: 120, y: 110, annotationWidth: 320, rowHeight: 30, rowGap: 10 },
  styles: {
    columnLine: { stroke: "#0b1222", strokeWidth: 1, dash: "2 4", opacity: 0.65 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 16, fill: "#e5e7eb" },
    segment: { stroke: "#0b1222", strokeWidth: 2 },
  },
  tracks: [
    { id: "Row 01", segments: [{ start: 0, end: 1, fill: "#06b6d4" }], rightText: { text: "Row 01", fill: "#e5e7eb" } },
    { id: "Row 02", segments: [{ start: 0, end: 1, fill: "#fde047" }], rightText: { text: "Row 02", fill: "#e5e7eb" } },
    {
      id: "Row 04",
      segments: [
        { start: 0.0, end: 0.2, fill: "#06b6d4" },
        { start: 0.2, end: 0.55, fill: "#ffffff" },
        { start: 0.55, end: 0.86, fill: "#fde047" },
        { start: 0.86, end: 1.0, fill: "#06b6d4" },
      ],
      rightText: { text: "Row 04", fill: "#e5e7eb" },
    },
    {
      id: "Row 05",
      segments: [
        { start: 0.0, end: 0.18, fill: "#fde047" },
        { start: 0.18, end: 0.38, fill: "#06b6d4" },
        { start: 0.38, end: 0.55, fill: "#cbd5e1" },
        { start: 0.55, end: 1.0, fill: "#fde047" },
      ],
      rightText: { text: "Row 05", fill: "#e5e7eb" },
    },
  ],
};

const rqtlLikeLight: GraphConfig = {
  width: 1600,
  height: 860,
  background: "#ffffff",
  columns: 40,
  columnGroups: [
    { label: "Block 1", start: 0, end: 22, stroke: "#111827", strokeWidth: 2 },
    { label: "Block 2", start: 22, end: 40, stroke: "#111827", strokeWidth: 2 },
  ],
  legend: {
    x: 120,
    y: 18,
    title: "Codes (R/qtl-like)",
    fontSize: 14,
    textFill: "#111827",
    background: "#ffffff",
    border: "#d1d5db",
    borderWidth: 1,
    items: getPalette("rqtl_like").legend,
  },
  plot: { x: 120, y: 110, annotationWidth: 320, rowHeight: 30, rowGap: 10 },
  styles: {
    columnLine: { stroke: "#111827", strokeWidth: 1, dash: "2 4", opacity: 0.18 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 16, fill: "#111827" },
    segment: { stroke: "none", strokeWidth: 0 },
  },
  tracks: [
    { id: "Row 01", segments: [{ start: 0, end: 1, fill: "#2563eb" }], rightText: { text: "Row 01 (AA)", fill: "#111827" } },
    { id: "Row 02", segments: [{ start: 0, end: 1, fill: "#dc2626" }], rightText: { text: "Row 02 (BB)", fill: "#111827" } },
    { id: "Row 03", segments: [{ start: 0, end: 1, fill: "#16a34a" }], rightText: { text: "Row 03 (AB)", fill: "#111827" } },
    {
      id: "Row 04",
      segments: [
        { start: 0.0, end: 0.2, fill: "#2563eb" },
        { start: 0.2, end: 0.42, fill: "#16a34a" },
        { start: 0.42, end: 0.55, fill: "#dc2626" },
        { start: 0.55, end: 0.78, fill: "#2563eb" },
        { start: 0.78, end: 1.0, fill: "#dc2626" },
      ],
      rightText: { text: "Row 04", fill: "#111827" },
    },
    {
      id: "Row 05",
      segments: [
        { start: 0.0, end: 0.12, fill: "#dc2626" },
        { start: 0.12, end: 0.55, fill: "#2563eb" },
        { start: 0.55, end: 0.7, fill: "#16a34a" },
        { start: 0.7, end: 0.92, fill: "#dc2626" },
        { start: 0.92, end: 1.0, fill: "#e5e7eb" },
      ],
      rightText: { text: "Row 05", fill: "#111827" },
    },
  ],
};

const denseMatrixDark: GraphConfig = {
  width: 1600,
  height: 860,
  background: "#0b1020",
  columns: 80,
  legend: {
    x: 120,
    y: 18,
    title: "Dense matrix",
    fontSize: 14,
    textFill: "#e5e7eb",
    background: "#111827",
    border: "#334155",
    borderWidth: 1,
    items: getPalette("cyan_yellow_white").legend,
  },
  plot: { x: 120, y: 92, annotationWidth: 260, rowHeight: 18, rowGap: 6 },
  styles: {
    columnLine: { stroke: "#0b1222", strokeWidth: 1, dash: "2 4", opacity: 0.55 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 14, fill: "#e5e7eb" },
    segment: { stroke: "none", strokeWidth: 0 },
  },
  tracks: [
    { id: "Row 01", segments: [{ start: 0, end: 1, fill: "#06b6d4" }], rightText: { text: "Row 01", fill: "#e5e7eb", fontSize: 14 } },
    { id: "Row 02", segments: [{ start: 0, end: 1, fill: "#fde047" }], rightText: { text: "Row 02", fill: "#e5e7eb", fontSize: 14 } },
    {
      id: "Row 04",
      segments: [
        { start: 0.0, end: 0.12, fill: "#06b6d4" },
        { start: 0.12, end: 0.2, fill: "#ffffff" },
        { start: 0.2, end: 0.36, fill: "#fde047" },
        { start: 0.36, end: 0.5, fill: "#06b6d4" },
        { start: 0.5, end: 0.74, fill: "#cbd5e1" },
        { start: 0.74, end: 1.0, fill: "#fde047" },
      ],
      rightText: { text: "Row 04", fill: "#e5e7eb", fontSize: 14 },
    },
    {
      id: "Row 05",
      segments: [
        { start: 0.0, end: 0.22, fill: "#fde047" },
        { start: 0.22, end: 0.4, fill: "#06b6d4" },
        { start: 0.4, end: 0.64, fill: "#ffffff" },
        { start: 0.64, end: 0.86, fill: "#06b6d4" },
        { start: 0.86, end: 1.0, fill: "#fde047" },
      ],
      rightText: { text: "Row 05", fill: "#e5e7eb", fontSize: 14 },
    },
  ],
};

const genotypeDemo: GraphConfig = {
  width: 1600,
  height: 900,
  background: "#111827",
  columns: 24,
  plot: { x: 120, y: 80, annotationWidth: 280, rowHeight: 40, rowGap: 14 },
  styles: {
    columnLine: { stroke: "#0b1222", strokeWidth: 1, dash: "2 4", opacity: 0.65 },
    text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 18, fill: "#f87171" },
    segment: { stroke: "#0b1222", strokeWidth: 2 },
  },
  tracks: [
    {
      id: "Row 01",
      segments: [{ start: 0, end: 1, fill: "#06b6d4" }],
      rightText: { text: "Row 01", fill: "#e5e7eb" },
    },
    {
      id: "Row 02",
      segments: [{ start: 0, end: 1, fill: "#fde047" }],
      rightText: { text: "Row 02", fill: "#e5e7eb" },
    },
    {
      id: "Row 04",
      segments: [
        { start: 0.0, end: 0.16, fill: "#06b6d4" },
        { start: 0.16, end: 0.36, fill: "#ffffff" },
        { start: 0.36, end: 0.8, fill: "#fde047" },
        { start: 0.8, end: 1.0, fill: "#06b6d4" },
      ],
      rightText: { text: "Row 04", fill: "#e5e7eb" },
    },
    {
      id: "Row 05",
      segments: [
        { start: 0.0, end: 0.22, fill: "#fde047" },
        { start: 0.22, end: 0.52, fill: "#06b6d4" },
        { start: 0.52, end: 0.62, fill: "#ffffff" },
        { start: 0.62, end: 1.0, fill: "#fde047" },
      ],
      rightText: { text: "Row 05", fill: "#e5e7eb" },
    },
  ],
};

const blank: GraphConfig = {
  width: 1600,
  height: 900,
  background: "#000000",
  columns: 20,
  plot: { x: 120, y: 80, annotationWidth: 260, rowHeight: 40, rowGap: 16 },
  tracks: [
    { id: "row1", segments: [{ start: 0, end: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 2 }] },
  ],
};

export type ParseTsvOpts = {
  baseName?: string;
  paletteId?: string;
  sortMarkers?: boolean;
  theme?: "light" | "dark";
  compressRuns?: boolean;
  scaleByPosition?: boolean;
  showXAxis?: boolean;
};

export type MarkerInfo = { name: string; chr?: string; pos?: number };
type ParsedWideTsv = { markers: MarkerInfo[]; rows: { sample: string; codes: string[] }[] };

const normalizeCode = (raw: string): string => {
  const s = raw.trim().toUpperCase();
  if (!s) return "-";
  if (s === "A" || s === "AA") return "A";
  if (s === "B" || s === "BB") return "B";
  if (s === "H" || s === "AB" || s === "BA" || s === "HET") return "H";
  if (s === "D" || s === "DEL") return "-";
  if (s === "MISS" || s === "MISSING") return "-";
  if (s === "." || s === "NA" || s === "N" || s === "NN" || s === "0") return "-";
  // よくある別表記（GGT/周辺ツール）
  if (s === "A/A") return "A";
  if (s === "B/B") return "B";
  if (s === "A/B" || s === "B/A") return "H";
  if (s === "-") return "-";
  return s.length <= 3 ? s : s.slice(0, 3);
};

const splitTsvLine = (line: string): string[] => line.split("\t").map((c) => c.trim());

const markerMetaFromName = (nameRaw: string): { name: string; chr?: string; pos?: number } => {
  const name = nameRaw.trim();
  if (!name) return { name: "" };
  const s = name.replace(/\s+/g, "");
  const m = /^(?:CHR)?([A-Za-z0-9]+)[:_\-]([0-9]+(?:\.[0-9]+)?)$/i.exec(s);
  if (!m) return { name };
  const chr = m[1];
  const pos = Number(m[2]);
  return { name, chr, pos: Number.isFinite(pos) ? pos : undefined };
};

export const markerInfoFromName = (nameRaw: string): MarkerInfo => markerMetaFromName(nameRaw);

const isMetaRow = (label: string, kinds: string[]): boolean => {
  const s = label.trim().toLowerCase().replace(/^#+/, "");
  return kinds.includes(s);
};

const chrSortKey = (chr: string): { kind: "num" | "str"; n: number; s: string } => {
  const cleaned = chr.trim().replace(/^chr/i, "");
  const n = Number.parseInt(cleaned, 10);
  if (Number.isFinite(n)) return { kind: "num", n, s: "" };
  return { kind: "str", n: Number.POSITIVE_INFINITY, s: cleaned };
};

const parseWideTsv = (text: string): ParsedWideTsv => {
  const lines = text
    .split(/\r?\n/g)
    .map((v) => v.replace(/\r/g, ""))
    .filter((v) => v.trim().length > 0);
  if (lines.length < 2) throw new Error("TSV はヘッダ+1行以上が必要です。");

  const header = splitTsvLine(lines[0]);
  if (header.length < 2) throw new Error("TSV ヘッダは sample + 1 marker 以上が必要です。");

  const markerNames = header.slice(1).map((v, i) => v || `m${i + 1}`);
  const markers: MarkerInfo[] = markerNames.map((name) => markerMetaFromName(name));

  let idx = 1;
  // Optional meta rows:
  // chr  <chr1> <chr1> <chr2> ...
  // pos  <10>   <20>   <5>   ...
  if (idx < lines.length) {
    const cells = splitTsvLine(lines[idx]);
    const tag = cells[0] || "";
    if (isMetaRow(tag, ["chr", "chrom", "chromosome"])) {
      for (let i = 0; i < markers.length; i += 1) markers[i].chr = (cells[i + 1] || markers[i].chr || "").trim() || markers[i].chr;
      idx += 1;
    }
  }
  if (idx < lines.length) {
    const cells = splitTsvLine(lines[idx]);
    const tag = cells[0] || "";
    if (isMetaRow(tag, ["pos", "position", "cm", "bp"])) {
      for (let i = 0; i < markers.length; i += 1) {
        const v = Number(cells[i + 1]);
        if (Number.isFinite(v)) markers[i].pos = v;
      }
      idx += 1;
    }
  }

  const rows = lines.slice(idx).map((line) => {
    const cols = splitTsvLine(line);
    const sample = (cols[0] || "").trim() || `sample_${Math.random().toString(16).slice(2, 8)}`;
    const rawCodes = cols.slice(1);
    const codes = markers.map((_, i) => normalizeCode(rawCodes[i] || "-"));
    return { sample, codes };
  });
  return { markers, rows };
};

const colorsForCode = (code: string, palette: PalettePreset): string => {
  if (code === "A") return palette.colors.A;
  if (code === "B") return palette.colors.B;
  if (code === "H") return palette.colors.H;
  if (code === "-") return palette.colors["-"];
  return palette.colors.other;
};

const equalBoundaries = (n: number): number[] => {
  if (!Number.isFinite(n) || n <= 0) return [0, 1];
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) out.push(i / n);
  return out;
};

const computeColumnGroupsFromMarkers = (markers: MarkerInfo[]): ColumnGroup[] => {
  if (!markers.some((m) => m.chr)) return [];
  const groups: ColumnGroup[] = [];
  let start = 0;
  let cur = markers[0]?.chr || "";
  for (let i = 1; i <= markers.length; i += 1) {
    const next = i < markers.length ? markers[i].chr || "" : "__END__";
    if (next !== cur) {
      groups.push({ label: cur || "Chr?", start, end: i, strokeWidth: 2 });
      start = i;
      cur = next;
    }
  }
  return groups;
};

const applyOrder = <T,>(arr: T[], order: number[]): T[] => order.map((i) => arr[i]);

const sortMarkersAndRows = (
  markersIn: MarkerInfo[],
  rowsIn: { sample: string; codes: string[] }[],
  enabled: boolean,
): { markers: MarkerInfo[]; rows: { sample: string; codes: string[] }[] } => {
  const markers = markersIn.map((m) => ({ ...m }));
  const rows = rowsIn.map((r) => ({ ...r, codes: [...r.codes] }));

  if (!enabled) return { markers, rows };
  if (!markers.some((m) => m.chr)) return { markers, rows };

  const order = markers
    .map((m, i) => ({ i, m }))
    .sort((a, b) => {
      const ca = a.m.chr || "ZZ";
      const cb = b.m.chr || "ZZ";
      const ka = chrSortKey(ca);
      const kb = chrSortKey(cb);
      if (ka.kind !== kb.kind) return ka.kind === "num" ? -1 : 1;
      if (ka.kind === "num" && ka.n !== kb.n) return ka.n - kb.n;
      if (ka.kind === "str" && ka.s !== kb.s) return ka.s.localeCompare(kb.s);
      const pa = Number.isFinite(a.m.pos ?? Number.NaN) ? (a.m.pos as number) : Number.POSITIVE_INFINITY;
      const pb = Number.isFinite(b.m.pos ?? Number.NaN) ? (b.m.pos as number) : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.i - b.i;
    })
    .map((v) => v.i);

  const sortedMarkers = applyOrder(markers, order);
  const sortedRows = rows.map((r) => ({ ...r, codes: applyOrder(r.codes, order) }));
  return { markers: sortedMarkers, rows: sortedRows };
};

export const sortMatrixByChrPos = (
  markersIn: MarkerInfo[],
  rowsIn: MatrixRow[],
  enabled: boolean,
): { markers: MarkerInfo[]; rows: MatrixRow[] } => sortMarkersAndRows(markersIn, rowsIn, enabled);

const computeXBoundaries = (
  markers: MarkerInfo[],
  columnGroups: ColumnGroup[],
  opts: { scaleByPosition: boolean },
): number[] => {
  const n = markers.length;
  if (n <= 0) return [0, 1];
  if (!opts.scaleByPosition) return equalBoundaries(n);
  if (!markers.some((m) => Number.isFinite(m.pos ?? Number.NaN))) return equalBoundaries(n);

  const groups = columnGroups.length ? columnGroups : [{ label: "All", start: 0, end: n }];
  const centers: number[] = [];
  let offset = 0;

  for (const g of groups) {
    const subset = markers.slice(g.start, g.end);
    const positions = subset.map((m) => (Number.isFinite(m.pos ?? Number.NaN) ? (m.pos as number) : NaN));
    const finite = positions.filter((v) => Number.isFinite(v));
    const hasPos = finite.length >= 2;

    if (hasPos) {
      const minPos = Math.min(...finite);
      const maxPos = Math.max(...finite);
      const span = maxPos > minPos ? maxPos - minPos : subset.length;
      for (let i = 0; i < subset.length; i += 1) {
        const p = positions[i];
        if (Number.isFinite(p)) {
          centers.push(offset + (p - minPos));
        } else if (subset.length > 1) {
          centers.push(offset + (i / (subset.length - 1)) * span);
        } else {
          centers.push(offset);
        }
      }
      offset += Math.max(1, span);
    } else {
      for (let i = 0; i < subset.length; i += 1) centers.push(offset + i);
      offset += Math.max(1, subset.length);
    }
  }

  if (centers.length !== n || offset <= 0) return equalBoundaries(n);
  const ratios = centers.map((v) => v / offset);
  const boundaries: number[] = [0];
  for (let i = 1; i < n; i += 1) boundaries.push((ratios[i - 1] + ratios[i]) / 2);
  boundaries.push(1);

  for (let i = 1; i < boundaries.length; i += 1) {
    if (!(boundaries[i] > boundaries[i - 1])) return equalBoundaries(n);
  }
  return boundaries;
};

const stripTrailingZeros = (s: string): string => s.replace(/(\.\d*?)0+$/g, "$1").replace(/\.$/g, "");

const inferPositionScale = (values: number[]): { scale: number; unit?: string; decimals: number } => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return { scale: 1, unit: undefined, decimals: 0 };
  const maxAbs = Math.max(...finite.map((v) => Math.abs(v)));
  const hasFrac = finite.some((v) => Math.abs(v - Math.round(v)) > 1e-6);
  if (maxAbs >= 1e6) return { scale: 1e6, unit: "", decimals: hasFrac ? 2 : 1 };
  if (maxAbs >= 1e4) return { scale: 1, unit: undefined, decimals: 0 };
  if (maxAbs >= 100) return { scale: 1, unit: undefined, decimals: hasFrac ? 1 : 0 };
  return { scale: 1, unit: undefined, decimals: hasFrac ? 2 : 0 };
};

const formatScaled = (v: number, scaleInfo: { scale: number; decimals: number }): string => {
  if (!Number.isFinite(v)) return "";
  const scaled = v / scaleInfo.scale;
  return stripTrailingZeros(scaled.toFixed(scaleInfo.decimals));
};

const dedupeTicks = (ticks: XAxisTick[]): XAxisTick[] => {
  const sorted = [...ticks].filter((t) => Number.isFinite(t.x)).sort((a, b) => a.x - b.x);
  const out: XAxisTick[] = [];
  const eps = 1e-6;
  for (const t of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - t.x) < eps) {
      prev.major = Boolean(prev.major || t.major);
      if (!prev.label && t.label) prev.label = t.label;
      continue;
    }
    out.push({ ...t });
  }
  return out;
};

const computeAutoXAxis = (
  markers: MarkerInfo[],
  columnGroups: ColumnGroup[],
  xBoundaries: number[],
  theme: "light" | "dark",
): XAxisConfig | undefined => {
  const n = markers.length;
  if (n <= 1) return undefined;
  if (!Array.isArray(xBoundaries) || xBoundaries.length !== n + 1) return undefined;
  const posValues = markers.map((m) => (Number.isFinite(m.pos ?? Number.NaN) ? (m.pos as number) : Number.NaN)).filter((v) => Number.isFinite(v));
  if (posValues.length < 2) return undefined;

  const scaleInfo = inferPositionScale(posValues);
  const groups = columnGroups.length ? columnGroups : [{ label: "All", start: 0, end: n }];

  const ticks: XAxisTick[] = [];
  for (const g of groups) {
    const start = Math.max(0, Math.min(n - 1, Math.floor(g.start)));
    const endExclusive = Math.max(start + 1, Math.min(n, Math.floor(g.end)));
    const count = endExclusive - start;
    if (count <= 0) continue;

    ticks.push({ x: xBoundaries[start], major: false });
    ticks.push({ x: xBoundaries[endExclusive], major: false });

    const last = endExclusive - 1;
    const pickIdx = (p: number): number => {
      const idx = start + Math.round((count - 1) * p);
      return Math.max(start, Math.min(last, idx));
    };

    const idxs =
      count >= 50
        ? [pickIdx(0), pickIdx(0.25), pickIdx(0.5), pickIdx(0.75), pickIdx(1)]
        : count >= 20
          ? [pickIdx(0), pickIdx(0.5), pickIdx(1)]
          : [pickIdx(0), pickIdx(1)];

    const seen = new Set<number>();
    for (const idx of idxs) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      const x0 = xBoundaries[idx];
      const x1 = xBoundaries[idx + 1];
      const x = (x0 + x1) / 2;
      const pos = markers[idx]?.pos;
      const label =
        Number.isFinite(pos ?? Number.NaN) ? formatScaled(pos as number, scaleInfo) : (markers[idx]?.name || String(idx + 1));
      ticks.push({ x, label, major: true });
    }
  }

  const textFill = theme === "light" ? "#111827" : "#e5e7eb";
  const stroke = theme === "light" ? "#111827" : "#0b1222";
  const unit = scaleInfo.scale !== 1 ? scaleInfo.unit : undefined;

  const merged = dedupeTicks(ticks).filter((t) => t.x >= 0 && t.x <= 1);
  if (!merged.some((t) => t.label)) return undefined;
  return {
    show: true,
    placement: "top",
    offset: 18,
    tickSize: 7,
    stroke,
    strokeWidth: 1,
    fontSize: 12,
    fill: textFill,
    title: unit,
    titleFill: textFill,
    titleFontSize: 12,
    ticks: merged,
  };
};

const codesToSegments = (
  codes: string[],
  palette: PalettePreset,
  xBoundaries: number[],
  compressRuns: boolean,
): GraphSegment[] => {
  const n = Math.min(codes.length, xBoundaries.length - 1);
  if (n <= 0) return [];

  if (!compressRuns) {
    const segs: GraphSegment[] = [];
    for (let i = 0; i < n; i += 1) {
      segs.push({
        start: xBoundaries[i],
        end: xBoundaries[i + 1],
        fill: colorsForCode(codes[i], palette),
      });
    }
    return segs;
  }

  const segs: GraphSegment[] = [];
  let runStart = 0;
  let current = codes[0];
  for (let i = 1; i <= n; i += 1) {
    const c = i < n ? codes[i] : "__END__";
    if (c !== current) {
      segs.push({ start: xBoundaries[runStart], end: xBoundaries[i], fill: colorsForCode(current, palette) });
      runStart = i;
      current = c;
    }
  }
  return segs;
};

export type MatrixRow = { sample: string; codes: string[] };

export const parseTsvToMatrix = (tsv: string): { markers: MarkerInfo[]; rows: MatrixRow[] } => {
  const parsed = parseWideTsv(tsv);
  return { markers: parsed.markers, rows: parsed.rows };
};

export const makeConfigFromMatrix = (markersRaw: MarkerInfo[], rowsRaw: MatrixRow[], opts?: ParseTsvOpts): GraphConfig => {
  const palette = getPalette(opts?.paletteId);
  const theme = opts?.theme || "dark";
  const sortMarkers = opts?.sortMarkers ?? true;
  const compressRuns = opts?.compressRuns ?? true;
  const scaleByPosition = opts?.scaleByPosition ?? true;

  const markersInput = Array.isArray(markersRaw) ? markersRaw : [];
  const rowsInput = Array.isArray(rowsRaw) ? rowsRaw : [];

  const markers0: MarkerInfo[] = markersInput.map((m) => ({ ...m }));
  const rows0: MatrixRow[] = rowsInput.map((r) => ({ sample: r.sample, codes: [...r.codes] }));

  const n = markers0.length;
  const rows = rows0.map((r) => {
    const codes = r.codes.slice(0, n);
    while (codes.length < n) codes.push("-");
    return { ...r, codes };
  });

  const sorted = sortMarkersAndRows(markers0, rows, sortMarkers);
  const markers = sorted.markers;
  const rowsSorted = sorted.rows;
  const columnGroups = computeColumnGroupsFromMarkers(markers);
  const xBoundaries = computeXBoundaries(markers, columnGroups, { scaleByPosition });

  const wantXAxis = opts?.showXAxis ?? (scaleByPosition && markers.some((m) => Number.isFinite(m.pos ?? Number.NaN)));
  const xAxis = wantXAxis ? computeAutoXAxis(markers, columnGroups, xBoundaries, theme) : undefined;

  const background = theme === "light" ? "#ffffff" : "#0b1020";
  const textFill = theme === "light" ? "#111827" : "#e5e7eb";
  const gridStroke = theme === "light" ? "#111827" : "#0b1222";

  const rowHeight = 30;
  const rowGap = 10;
  const plotYBase = columnGroups.length ? 110 : 92;
  const plotY = xAxis ? (columnGroups.length ? 150 : 132) : plotYBase;
  const width = 1600;

  const tracks: GraphTrack[] = rowsSorted.map((r) => ({
    id: r.sample,
    height: rowHeight,
    segments: codesToSegments(r.codes, palette, xBoundaries, compressRuns),
    leftText: { text: r.sample, fill: textFill, fontSize: 16 },
  }));

  const baseName = opts?.baseName?.trim() || "genotype";
  const height = Math.max(320, plotY + tracks.length * (rowHeight + rowGap) + 120);

  return {
    width,
    height,
    background,
    columns: n,
    xBoundaries,
    columnGroups: columnGroups.length
      ? columnGroups.map((g) => ({
        ...g,
        stroke: gridStroke,
        strokeWidth: g.strokeWidth ?? 2,
        fill: theme === "light" ? "#111827" : "#ffffff",
        fillOpacity: theme === "light" ? 0.035 : 0.06,
      }))
      : undefined,
    xAxis,
    legend: {
      y: 16,
      title: baseName,
      fontSize: 14,
      textFill,
      background: theme === "light" ? "#ffffff" : "#111827",
      border: theme === "light" ? "#d1d5db" : "#334155",
      borderWidth: 1,
      items: palette.legend,
    },
    plot: { x: 120, y: plotY, annotationWidth: 340, rowHeight, rowGap },
    styles: {
      columnLine: {
        stroke: gridStroke,
        strokeWidth: 1,
        dash: "2 4",
        opacity: theme === "light" ? 0.22 : 0.65,
      },
      text: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 18, fill: textFill },
      segment: { stroke: "none", strokeWidth: 0 },
    },
    tracks,
  };
};

export const makeConfigFromTsv = (tsv: string, opts?: ParseTsvOpts): GraphConfig => {
  const parsed = parseWideTsv(tsv);
  return makeConfigFromMatrix(parsed.markers, parsed.rows, opts);
};

const buildDemoMarkers = (layout: Array<{ chr: string; count: number; posStep?: number }>): MarkerInfo[] => {
  const markers: MarkerInfo[] = [];
  for (const chr of layout) {
    const step = Number.isFinite(chr.posStep ?? Number.NaN) ? (chr.posStep as number) : 5;
    for (let i = 0; i < chr.count; i += 1) {
      markers.push({
        name: `${chr.chr}_${i + 1}`,
        chr: chr.chr,
        pos: (i + 1) * step,
      });
    }
  }
  return markers;
};

const fillCodes = (n: number, code: string): string[] => Array.from({ length: n }, () => code);

const paintCodes = (codes: string[], start: number, end: number, code: string): void => {
  const s = Math.max(0, Math.floor(start));
  const e = Math.min(codes.length, Math.floor(end));
  for (let i = s; i < e; i += 1) codes[i] = code;
};

const applyTemplateLayout = (
  cfg: GraphConfig,
  opts: {
    width?: number;
    annotationWidth?: number;
    rowHeight: number;
    rowGap: number;
    fontSize: number;
    showColumnLines?: boolean;
    segmentStroke?: { stroke: string; strokeWidth: number };
    columnLine?: Partial<NonNullable<GraphConfig["styles"]>["columnLine"]>;
  },
): GraphConfig => {
  const plotY = cfg.plot?.y ?? 92;
  const plotX = cfg.plot?.x ?? 120;
  const annotationWidth = opts.annotationWidth ?? cfg.plot?.annotationWidth ?? 340;
  const width = opts.width ?? cfg.width ?? 1600;
  const plotWidth = cfg.plot?.width ?? Math.max(200, width - plotX - annotationWidth - 30);

  const tracks = (Array.isArray(cfg.tracks) ? cfg.tracks : []).map((t) => ({
    ...t,
    height: opts.rowHeight,
    showColumnLines: opts.showColumnLines ?? t.showColumnLines,
    rightText: t.rightText
      ? { ...t.rightText, fontSize: opts.fontSize }
      : { text: t.id, fontSize: opts.fontSize, fill: cfg.styles?.text?.fill },
  }));
  const height = Math.max(320, plotY + tracks.length * (opts.rowHeight + opts.rowGap) + 120);

  const mergedStyles: GraphConfig["styles"] = {
    ...(cfg.styles || {}),
    text: { ...(cfg.styles?.text || {}), fontSize: opts.fontSize },
    segment: opts.segmentStroke ? { ...opts.segmentStroke } : { ...(cfg.styles?.segment || {}) },
    columnLine: { ...(cfg.styles?.columnLine || {}), ...(opts.columnLine || {}) },
  };

  return {
    ...cfg,
    width,
    height,
    plot: { ...(cfg.plot || {}), x: plotX, y: plotY, width: plotWidth, annotationWidth, rowHeight: opts.rowHeight, rowGap: opts.rowGap },
    styles: mergedStyles,
    tracks,
  };
};

const addChromosomeBarTrack = (
  cfg: GraphConfig,
  opts: { height: number; gapAfter: number; fillA: string; fillB: string; stroke?: string; strokeWidth?: number },
): GraphConfig => {
  const boundaries = Array.isArray(cfg.xBoundaries) ? cfg.xBoundaries : [];
  const groups = Array.isArray(cfg.columnGroups) ? cfg.columnGroups : [];
  if (boundaries.length < 2 || groups.length === 0) return cfg;
  const segs: GraphSegment[] = groups.map((g, i) => {
    const start = Number.isFinite(boundaries[g.start] ?? Number.NaN) ? (boundaries[g.start] as number) : g.start / Math.max(1, (cfg.columns ?? 1));
    const end = Number.isFinite(boundaries[g.end] ?? Number.NaN) ? (boundaries[g.end] as number) : g.end / Math.max(1, (cfg.columns ?? 1));
    return {
      start,
      end,
      fill: i % 2 === 0 ? opts.fillA : opts.fillB,
      stroke: opts.stroke || "none",
      strokeWidth: opts.strokeWidth ?? 0,
    };
  });
  const track: GraphTrack = {
    id: "chr_bar",
    height: opts.height,
    gapAfter: opts.gapAfter,
    showColumnLines: false,
    segments: segs,
  };
  return { ...cfg, tracks: [track, ...(Array.isArray(cfg.tracks) ? cfg.tracks : [])] };
};

const demoChrLayout = [
  { chr: "Block 1", count: 26, posStep: 4 },
  { chr: "Block 2", count: 22, posStep: 5 },
  { chr: "Block 3", count: 18, posStep: 6 },
  { chr: "Block 4", count: 24, posStep: 4 },
  { chr: "Block 5", count: 16, posStep: 7 },
];

const demoMarkers = buildDemoMarkers(demoChrLayout);
const demoMarkerCount = demoMarkers.length;
const demoOffsets = (() => {
  const out: number[] = [0];
  for (const c of demoChrLayout) out.push(out[out.length - 1] + c.count);
  return out;
})();

const demoRowsForMatrix = (() => {
  const rows: MatrixRow[] = [
    { sample: "Row 01", codes: fillCodes(demoMarkerCount, "A") },
    { sample: "Row 02", codes: fillCodes(demoMarkerCount, "B") },
    { sample: "Row 03", codes: fillCodes(demoMarkerCount, "H") },
  ];
  for (let k = 1; k <= 12; k += 1) {
    const codes: string[] = [];
    for (let i = 0; i < demoMarkerCount; i += 1) {
      const v = (i * (k + 3) + k * 11) % 37;
      if (v < 16) codes.push("A");
      else if (v < 28) codes.push("B");
      else if (v < 33) codes.push("H");
      else codes.push("-");
    }
    rows.push({ sample: `Line-${k}`, codes });
  }
  return rows;
})();

const demoRowsIntrogression = (() => {
  const mk = (name: string, base: string) => ({ sample: name, codes: fillCodes(demoMarkerCount, base) });
  const il1 = mk("IL-1", "A");
  paintCodes(il1.codes, demoOffsets[0] + 6, demoOffsets[0] + 12, "B");
  paintCodes(il1.codes, demoOffsets[1] + 3, demoOffsets[1] + 6, "H");
  paintCodes(il1.codes, demoOffsets[3] + 10, demoOffsets[3] + 14, "-");

  const il2 = mk("IL-2", "A");
  paintCodes(il2.codes, demoOffsets[1] + 12, demoOffsets[1] + 18, "B");
  paintCodes(il2.codes, demoOffsets[2] + 2, demoOffsets[2] + 5, "H");
  paintCodes(il2.codes, demoOffsets[4] + 6, demoOffsets[4] + 12, "B");

  const il3 = mk("IL-3", "A");
  paintCodes(il3.codes, demoOffsets[0] + 1, demoOffsets[0] + 4, "H");
  paintCodes(il3.codes, demoOffsets[2] + 8, demoOffsets[2] + 16, "B");
  paintCodes(il3.codes, demoOffsets[3] + 4, demoOffsets[3] + 8, "H");

  const nil1 = mk("NIL-1", "A");
  paintCodes(nil1.codes, demoOffsets[3] + 14, demoOffsets[3] + 18, "B");
  paintCodes(nil1.codes, demoOffsets[0] + 18, demoOffsets[0] + 22, "B");

  const nil2 = mk("NIL-2", "A");
  paintCodes(nil2.codes, demoOffsets[1] + 1, demoOffsets[1] + 5, "B");
  paintCodes(nil2.codes, demoOffsets[4] + 10, demoOffsets[4] + 13, "H");

  return [
    { sample: "Row 01", codes: fillCodes(demoMarkerCount, "A") },
    { sample: "Row 02", codes: fillCodes(demoMarkerCount, "B") },
    { sample: "Row 03", codes: fillCodes(demoMarkerCount, "H") },
    il1,
    il2,
    il3,
    nil1,
    nil2,
  ];
})();

const flapjackLikeLight: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsForMatrix, {
    baseName: "Flapjack-like",
    paletteId: "okabe_ito",
    theme: "light",
    sortMarkers: true,
    compressRuns: false,
    scaleByPosition: false,
  });
  const tuned = applyTemplateLayout(cfg, {
    width: 2000,
    annotationWidth: 300,
    rowHeight: 14,
    rowGap: 3,
    fontSize: 12,
    showColumnLines: false,
    segmentStroke: { stroke: "none", strokeWidth: 0 },
    columnLine: { opacity: 0 },
  });
  return { ...tuned, legend: tuned.legend ? { ...tuned.legend, title: "Flapjack-like (haplotype view)" } : tuned.legend };
})();

const flapjackLikeDark: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsForMatrix, {
    baseName: "Flapjack-like",
    paletteId: "cyan_yellow_white",
    theme: "dark",
    sortMarkers: true,
    compressRuns: false,
    scaleByPosition: false,
  });
  const tuned = applyTemplateLayout(cfg, {
    width: 2000,
    annotationWidth: 300,
    rowHeight: 14,
    rowGap: 3,
    fontSize: 12,
    showColumnLines: false,
    segmentStroke: { stroke: "none", strokeWidth: 0 },
    columnLine: { opacity: 0 },
  });
  return { ...tuned, legend: tuned.legend ? { ...tuned.legend, title: "Flapjack-like (haplotype view)" } : tuned.legend };
})();

const denseMatrixLight: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsForMatrix, {
    baseName: "Dense matrix",
    paletteId: "rqtl_like",
    theme: "light",
    sortMarkers: true,
    compressRuns: false,
    scaleByPosition: false,
  });
  return applyTemplateLayout(cfg, {
    width: 2000,
    annotationWidth: 260,
    rowHeight: 12,
    rowGap: 2,
    fontSize: 11,
    showColumnLines: true,
    segmentStroke: { stroke: "none", strokeWidth: 0 },
    columnLine: { dash: "1 3", opacity: 0.12, strokeWidth: 1 },
  });
})();

const rqtlLikeDark: GraphConfig = (() => {
  const textFill = "#e5e7eb";
  const gridStroke = "#0b1222";
  const recolor = (fill: string): string => {
    if (fill === "#111827") return gridStroke;
    if (fill === "#ffffff") return "#0b1020";
    return fill;
  };
  const cfg: GraphConfig = {
    ...rqtlLikeLight,
    background: "#0b1020",
    legend: rqtlLikeLight.legend
      ? {
        ...rqtlLikeLight.legend,
        textFill,
        background: "#111827",
        border: "#334155",
      }
      : undefined,
    styles: {
      ...(rqtlLikeLight.styles || {}),
      columnLine: { stroke: gridStroke, strokeWidth: 1, dash: "2 4", opacity: 0.55 },
      text: { ...(rqtlLikeLight.styles?.text || {}), fill: textFill },
      segment: { stroke: "none", strokeWidth: 0 },
    },
    tracks: rqtlLikeLight.tracks.map((t) => ({
      ...t,
      rightText: t.rightText ? { ...t.rightText, fill: textFill } : undefined,
      segments: t.segments.map((s) => ({ ...s, fill: recolor(s.fill) })),
    })),
    columnGroups: rqtlLikeLight.columnGroups?.map((g) => ({ ...g, stroke: textFill, strokeWidth: g.strokeWidth ?? 2 })),
  };
  return cfg;
})();

const publicationCompactLight: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsIntrogression, {
    baseName: "Graphical genotype",
    paletteId: "okabe_ito",
    theme: "light",
    sortMarkers: true,
    compressRuns: true,
    scaleByPosition: true,
  });
  const withBar = addChromosomeBarTrack(cfg, { height: 16, gapAfter: 16, fillA: "#e5e7eb", fillB: "#cbd5e1" });
  return applyTemplateLayout(withBar, {
    width: 2200,
    annotationWidth: 320,
    rowHeight: 22,
    rowGap: 8,
    fontSize: 13,
    showColumnLines: true,
    segmentStroke: { stroke: "#111827", strokeWidth: 1 },
    columnLine: { dash: "2 6", opacity: 0.18, strokeWidth: 1 },
  });
})();

const publicationCompactDark: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsIntrogression, {
    baseName: "Graphical genotype",
    paletteId: "cyan_yellow_white",
    theme: "dark",
    sortMarkers: true,
    compressRuns: true,
    scaleByPosition: true,
  });
  const withBar = addChromosomeBarTrack(cfg, { height: 16, gapAfter: 16, fillA: "#111827", fillB: "#0b1222" });
  return applyTemplateLayout(withBar, {
    width: 2200,
    annotationWidth: 320,
    rowHeight: 22,
    rowGap: 8,
    fontSize: 13,
    showColumnLines: true,
    segmentStroke: { stroke: "#0b1222", strokeWidth: 2 },
    columnLine: { dash: "2 6", opacity: 0.55, strokeWidth: 1 },
  });
})();

const introgressionLinesLight: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsIntrogression, {
    baseName: "Introgression lines",
    paletteId: "okabe_ito",
    theme: "light",
    sortMarkers: true,
    compressRuns: true,
    scaleByPosition: true,
  });
  const withBar = addChromosomeBarTrack(cfg, { height: 18, gapAfter: 20, fillA: "#111827", fillB: "#111827", stroke: "#111827", strokeWidth: 1 });
  const tuned = applyTemplateLayout(withBar, {
    width: 2400,
    annotationWidth: 360,
    rowHeight: 26,
    rowGap: 10,
    fontSize: 14,
    showColumnLines: false,
    segmentStroke: { stroke: "#111827", strokeWidth: 1.2 },
    columnLine: { opacity: 0 },
  });
  return {
    ...tuned,
    background: "#ffffff",
    columnGroups: tuned.columnGroups?.map((g) => ({ ...g, fill: "#111827", fillOpacity: 0.02, stroke: "#111827", strokeWidth: 2 })),
  };
})();

const introgressionLinesDark: GraphConfig = (() => {
  const cfg = makeConfigFromMatrix(demoMarkers, demoRowsIntrogression, {
    baseName: "Introgression lines",
    paletteId: "cyan_yellow_white",
    theme: "dark",
    sortMarkers: true,
    compressRuns: true,
    scaleByPosition: true,
  });
  const withBar = addChromosomeBarTrack(cfg, { height: 18, gapAfter: 20, fillA: "#111827", fillB: "#111827", stroke: "#e5e7eb", strokeWidth: 1 });
  const tuned = applyTemplateLayout(withBar, {
    width: 2400,
    annotationWidth: 360,
    rowHeight: 26,
    rowGap: 10,
    fontSize: 14,
    showColumnLines: false,
    segmentStroke: { stroke: "#0b1222", strokeWidth: 2 },
    columnLine: { opacity: 0 },
  });
  return {
    ...tuned,
    background: "#0b1020",
    columnGroups: tuned.columnGroups?.map((g) => ({ ...g, fill: "#ffffff", fillOpacity: 0.05, stroke: "#e5e7eb", strokeWidth: 2 })),
  };
})();

// Simple paper-style IL/NIL visualization (classic layout)
const paperSimpleLight: GraphConfig = (() => {
  const textFill = "#111827";
  const plotX = 90;
  const plotWidth = 700;
  const annotationWidth = 180;
  const rowHeight = 32;
  const rowGap = 6;
  const plotY = 100;

  // Marker axis track with names and positions
  const markerAxisTrack: GraphTrack = {
    id: "__marker_axis__",
    height: 50,
    gapAfter: 10,
    showColumnLines: false,
    segments: [],
    axis: {
      title: "",
      stroke: textFill,
      strokeWidth: 2,
      tickSize: 16,
      labelTopFill: textFill,
      labelBottomFill: textFill,
      labelTopFontSize: 12,
      labelBottomFontSize: 11,
      ticks: [
        { x: 0, major: true, labelTop: "M1", labelBottom: "1" },
        { x: 0.1, major: true, labelTop: "M2", labelBottom: "2" },
        { x: 0.2, major: true, labelTop: "M3", labelBottom: "3" },
        { x: 0.3, major: true, labelTop: "M4", labelBottom: "4" },
        { x: 0.4, major: true, labelTop: "M5", labelBottom: "5" },
        { x: 0.5, major: true, labelTop: "M6", labelBottom: "6" },
        { x: 0.6, major: true, labelTop: "M7", labelBottom: "7" },
        { x: 0.7, major: true, labelTop: "M8", labelBottom: "8" },
        { x: 0.8, major: true, labelTop: "M9", labelBottom: "9" },
        { x: 0.9, major: true, labelTop: "M10", labelBottom: "10" },
        { x: 1, major: true, labelTop: "M11", labelBottom: "11" },
      ],
    },
  };

  const tracks: GraphTrack[] = [
    markerAxisTrack,
    { id: "Row 01", segments: [{ start: 0, end: 1, fill: "#00a8e8" }], leftText: { text: "Row 01", fill: textFill }, rightText: { text: "Row 01", fill: textFill } },
    { id: "Row 02", segments: [{ start: 0, end: 1, fill: "#fff200" }], leftText: { text: "Row 02", fill: textFill }, rightText: { text: "Row 02", fill: textFill } },
    { id: "Row 03", segments: [{ start: 0, end: 0.3, fill: "#00a8e8" }, { start: 0.3, end: 0.7, fill: "#009e73" }, { start: 0.7, end: 1, fill: "#fff200" }], leftText: { text: "Row 03", fill: textFill }, rightText: { text: "Row 03", fill: textFill } },
    { id: "__gap1", height: 10, segments: [] },
    { id: "Row 04", segments: [{ start: 0, end: 0.35, fill: "#00a8e8" }, { start: 0.35, end: 0.65, fill: "#fff200" }, { start: 0.65, end: 1, fill: "#00a8e8" }], leftText: { text: "Row 04", fill: textFill }, rightText: { text: "Row 04", fill: textFill } },
    { id: "Row 05", segments: [{ start: 0, end: 0.5, fill: "#fff200" }, { start: 0.5, end: 1, fill: "#00a8e8" }], leftText: { text: "Row 05", fill: textFill }, rightText: { text: "Row 05", fill: "#dc2626" }, rightCircle: { stroke: "#dc2626", strokeWidth: 3 } },
    { id: "Row 06", segments: [{ start: 0, end: 0.2, fill: "#00a8e8" }, { start: 0.2, end: 0.6, fill: "#fff200" }, { start: 0.6, end: 1, fill: "#00a8e8" }], leftText: { text: "Row 06", fill: textFill }, rightText: { text: "Row 06", fill: textFill } },
  ];

  const layout: { id: string; y: number; h: number }[] = [];
  let cy = plotY;
  for (const t of tracks) {
    const h = t.height ?? rowHeight;
    layout.push({ id: t.id, y: cy, h });
    cy += h + (t.gapAfter ?? rowGap);
  }

  return {
    width: 1000,
    height: cy + 80,
    background: "#ffffff",
    columns: 20,
    plot: { x: plotX, y: plotY, width: plotWidth, annotationWidth, rowHeight, rowGap },
    styles: {
      columnLine: { stroke: "#e5e7eb", strokeWidth: 1, dash: "2 4", opacity: 0.6 },
      text: { fontFamily: 'Arial, "Segoe UI", system-ui, sans-serif', fontSize: 16, fill: textFill },
      segment: { stroke: "#111827", strokeWidth: 2 },
    },
    guides: { show: true, mode: "boundaries", stroke: "#e5e7eb", strokeWidth: 1, dash: "2 4", opacity: 0.5 },
    annotationHeaders: { left: "Row", right: "Value", fill: textFill, fontSize: 14 },
    legend: {
      x: plotX,
      y: cy + 10,
      title: "Legend",
      fontSize: 14,
      items: [
        { label: "A", fill: "#00a8e8" },
        { label: "B", fill: "#fff200" },
        { label: "H", fill: "#009e73" },
      ],
    },
    tracks,
  };
})();

const faZoomFigureLight: GraphConfig = (() => {
  const chrLabel = "Block 1";
  const chrLen = 200;

  const coarseMarkers = [
    { name: "C01", pos: 1 },
    { name: "C02", pos: 4 },
    { name: "C03", pos: 7 },
    { name: "C04", pos: 10 },
    { name: "C05", pos: 13 },
    { name: "C06", pos: 16 },
  ];
  const coarseStart = coarseMarkers[0].pos;
  const coarseEnd = coarseMarkers[coarseMarkers.length - 1].pos;

  const markers: MarkerInfo[] = [
    { name: "C01", pos: 1 },
    { name: "C02", pos: 2 },
    { name: "C03", pos: 3 },
    { name: "C04", pos: 4 },
    { name: "C05", pos: 5 },
    { name: "C06", pos: 6 },
    { name: "C07", pos: 7 },
    { name: "C08", pos: 8 },
    { name: "C09", pos: 9 },
    { name: "C10", pos: 10 },
    { name: "C11", pos: 11 },
    { name: "C12", pos: 12 },
    { name: "C13", pos: 13 },
    { name: "C14", pos: 14 },
  ];
  const n = markers.length;

  const rows: MatrixRow[] = [
    { sample: "Row 01", codes: fillCodes(n, "A") },
    { sample: "Row 02", codes: fillCodes(n, "B") },
    { sample: "Row 03", codes: ["A", ...fillCodes(n - 1, "-")] },
    { sample: "Row 04", codes: ["-", ...fillCodes(n - 1, "A")] },
    { sample: "Row 05", codes: ["A", ...fillCodes(n - 1, "-")] },
  ];

  const cfg0 = makeConfigFromMatrix(markers, rows, {
    baseName: "Numeric window zoom",
    paletteId: "blue_yellow_white",
    theme: "light",
    sortMarkers: false,
    compressRuns: true,
    scaleByPosition: false,
    showXAxis: false,
  });

  const boundaries = Array.isArray(cfg0.xBoundaries) ? cfg0.xBoundaries : [];
  const ticks =
    boundaries.length === n + 1
      ? markers.map((m, i) => ({
        x: ((boundaries[i] ?? 0) + (boundaries[i + 1] ?? 0)) / 2,
        major: true,
        labelTop: m.name,
        labelBottom: Number.isFinite(m.pos ?? Number.NaN) ? String(m.pos) : "",
      }))
      : markers.map((m, i) => ({
        x: (i + 0.5) / n,
        major: true,
        labelTop: m.name,
        labelBottom: Number.isFinite(m.pos ?? Number.NaN) ? String(m.pos) : "",
      }));

  const hi = "#ff2d2d";
  const textFill = "#111827";
  const guideStroke = "rgba(107, 114, 128, 0.9)";
  const rowHeight = 44;
  const rowGap = 16;

  const width = 1600;
  const plotX = 190;
  const plotY = 76;
  const annotationWidth = 260;
  const plotWidth = Math.max(200, width - plotX - annotationWidth - 30);

  const pheno: Record<
    string,
    { status: string; statusRed: boolean; band: "circle" | "cross" }
  > = {
    "Row 01": { status: "1", statusRed: true, band: "circle" },
    "Row 02": { status: "0", statusRed: false, band: "cross" },
    "Row 03": { status: "0", statusRed: false, band: "cross" },
    "Row 04": { status: "1", statusRed: true, band: "circle" },
    "Row 05": { status: "0", statusRed: false, band: "circle" },
  };

  const dataTracks: GraphTrack[] = cfg0.tracks.map((t) => {
    const meta = pheno[t.id] || { status: "", statusRed: false, band: "cross" as const };
    return {
      ...t,
      height: rowHeight,
      leftText: { text: t.id, fill: textFill, fontSize: 16 },
      rightText: meta.status ? { text: meta.status, fill: meta.statusRed ? hi : textFill, fontSize: 16 } : undefined,
      rightCircle: meta.band === "circle" ? { stroke: hi, strokeWidth: 6, r: 14 } : undefined,
      rightCross: meta.band === "cross" ? { stroke: textFill, strokeWidth: 6, size: 18 } : undefined,
      showColumnLines: true,
    };
  });

  const chrTrack: GraphTrack = {
    id: "__chr__",
    height: 26,
    gapAfter: 36,
    showColumnLines: false,
    segments: [],
    leftText: { text: chrLabel, fill: textFill, fontSize: 16 },
  };

  const coarseAxisTrack: GraphTrack = {
    id: "__coarse_axis__",
    height: 66,
    gapAfter: 24,
    showColumnLines: false,
    segments: [],
    axis: {
      title: "",
      stroke: textFill,
      strokeWidth: 2,
      tickSize: 22,
      labelTopFill: textFill,
      labelBottomFill: textFill,
      labelTopFontSize: 14,
      labelBottomFontSize: 13,
      ticks: coarseMarkers.map((m, i) => ({
        x: coarseMarkers.length <= 1 ? 0.5 : i / (coarseMarkers.length - 1),
        major: true,
        labelTop: m.name,
        labelBottom: String(m.pos),
      })),
    },
  };

  const detailAxisTrack: GraphTrack = {
    id: "__detail_axis__",
    height: 74,
    gapAfter: 18,
    showColumnLines: true,
    segments: [],
    axis: {
      title: "",
      stroke: textFill,
      strokeWidth: 2,
      tickSize: 22,
      labelTopFill: textFill,
      labelBottomFill: textFill,
      labelTopFontSize: 14,
      labelBottomFontSize: 13,
      ticks,
    },
  };

  const tracks: GraphTrack[] = [chrTrack, coarseAxisTrack, detailAxisTrack, ...dataTracks];

  const layout: Array<{ id: string; y: number; h: number }> = [];
  let yCursor = plotY;
  for (const t of tracks) {
    const h = t.height ?? rowHeight;
    layout.push({ id: t.id, y: yCursor, h });
    yCursor += h + (t.gapAfter ?? rowGap);
  }

  const byId = new Map(layout.map((v) => [v.id, v]));
  const chrBox = byId.get("__chr__");
  const coarseBox = byId.get("__coarse_axis__");
  const lastData = layout[layout.length - 1];

  const highlightStart = coarseStart;
  const highlightEnd = coarseEnd;
  const highlightLenApprox = Math.max(1, Math.round((highlightEnd - highlightStart) / 10) * 10);
  const h0 = Math.max(0, Math.min(1, highlightStart / chrLen));
  const h1 = Math.max(0, Math.min(1, highlightEnd / chrLen));
  const hx0 = plotX + Math.min(h0, h1) * plotWidth;
  const hx1 = plotX + Math.max(h0, h1) * plotWidth;

  const coarseA = plotX;
  const coarseF = plotX + plotWidth;
  const coarseAxisY = (coarseBox?.y ?? plotY) + (coarseBox?.h ?? 60) * 0.5;

  const centers = markers
    .map((m, i) => {
      const x0 = boundaries[i] ?? i / n;
      const x1 = boundaries[i + 1] ?? (i + 1) / n;
      const x = (x0 + x1) / 2;
      const pos = Number.isFinite(m.pos ?? Number.NaN) ? (m.pos as number) : Number.NaN;
      return { pos, x };
    })
    .filter((v) => Number.isFinite(v.pos))
    .sort((a, b) => a.pos - b.pos);

  const posToX = (pos: number): number => {
    if (!centers.length) return 0.5;
    if (pos <= centers[0].pos) return centers[0].x;
    if (pos >= centers[centers.length - 1].pos) return centers[centers.length - 1].x;
    for (let i = 0; i < centers.length - 1; i += 1) {
      const a = centers[i];
      const b = centers[i + 1];
      if (pos >= a.pos && pos <= b.pos) {
        const span = b.pos - a.pos || 1;
        const t = (pos - a.pos) / span;
        return a.x + (b.x - a.x) * t;
      }
    }
    return 0.5;
  };

  const arrowStart = 1;
  const arrowEnd = 2;
  const ax0 = plotX + posToX(arrowStart) * plotWidth;
  const ax1 = plotX + posToX(arrowEnd) * plotWidth;
  const arrowY = (lastData?.y ?? plotY) + (lastData?.h ?? rowHeight) + 56;
  const arrowMid = (ax0 + ax1) / 2;

  const overlays: OverlayShape[] = [
    // Block 1 bar + highlight
    {
      kind: "rect",
      x: plotX,
      y: chrBox?.y ?? plotY,
      width: plotWidth,
      height: chrBox?.h ?? 26,
      fill: "#ffffff",
      layer: "over",
    },
    {
      kind: "rect",
      x: hx0,
      y: chrBox?.y ?? plotY,
      width: Math.max(0, hx1 - hx0),
      height: chrBox?.h ?? 26,
      fill: "#ff0000",
      layer: "over",
    },
    {
      kind: "rect",
      x: plotX,
      y: chrBox?.y ?? plotY,
      width: plotWidth,
      height: chrBox?.h ?? 26,
      fill: "none",
      stroke: textFill,
      strokeWidth: 2,
      layer: "over",
    },
    {
      kind: "text",
      x: (hx0 + hx1) / 2,
      y: (chrBox?.y ?? plotY) - 8,
      text: `Window ~${highlightLenApprox}`,
      fill: textFill,
      fontSize: 16,
      fontWeight: 900,
      anchor: "middle",
      layer: "over",
    },
    // zoom connector lines
    {
      kind: "line",
      x1: hx0,
      y1: (chrBox?.y ?? plotY) + (chrBox?.h ?? 26),
      x2: coarseA,
      y2: coarseAxisY - 8,
      stroke: textFill,
      strokeWidth: 2,
      lineCap: "round",
      layer: "over",
    },
    {
      kind: "line",
      x1: hx1,
      y1: (chrBox?.y ?? plotY) + (chrBox?.h ?? 26),
      x2: coarseF,
      y2: coarseAxisY + 2,
      stroke: textFill,
      strokeWidth: 2,
      lineCap: "round",
      layer: "over",
    },
    // slash under A (zoom)
    {
      kind: "text",
      x: coarseA,
      y: (coarseBox?.y ?? plotY) + (coarseBox?.h ?? 66) - 6,
      text: "/",
      fill: textFill,
      fontSize: 22,
      fontWeight: 900,
      anchor: "middle",
      layer: "over",
    },
    // bar frames
    ...layout
      .filter((v) => !v.id.startsWith("__"))
      .map(
        (v): OverlayShape => ({
          kind: "rect",
          x: plotX,
          y: v.y,
          width: plotWidth,
          height: v.h,
          fill: "none",
          stroke: textFill,
          strokeWidth: 2,
          layer: "over",
        }),
      ),
    // Window label + double arrow + approx length
    {
      kind: "text",
      x: plotX - 70,
      y: arrowY + 10,
      text: "Window",
      fill: textFill,
      fontSize: 38,
      fontWeight: 800,
      fontStyle: "italic",
      anchor: "start",
      layer: "over",
    },
    {
      kind: "line",
      x1: ax0,
      y1: arrowY,
      x2: ax1,
      y2: arrowY,
      stroke: textFill,
      strokeWidth: 2,
      markerStart: "arrow",
      markerEnd: "arrow",
      lineCap: "round",
      layer: "over",
    },
    {
      kind: "text",
      x: arrowMid,
      y: arrowY + 18,
      text: "~8",
      fill: textFill,
      fontSize: 16,
      fontWeight: 900,
      anchor: "middle",
      baseline: "hanging",
      layer: "over",
    },
  ];

  const height = Math.max(720, arrowY + 90);

  return {
    ...cfg0,
    width,
    height,
    legend: undefined,
    columnGroups: undefined,
    xAxis: undefined,
    plot: { x: plotX, y: plotY, width: plotWidth, annotationWidth, rowHeight, rowGap },
    styles: {
      columnLine: { stroke: guideStroke, strokeWidth: 1, dash: "2 4", opacity: 0.55 },
      text: { fontFamily: 'Arial, "Segoe UI", system-ui, -apple-system, sans-serif', fontSize: 18, fill: textFill },
      segment: { stroke: "none", strokeWidth: 0 },
    },
    guides: { show: true, mode: "centers", stroke: guideStroke, strokeWidth: 1, dash: "2 4", opacity: 0.55 },
    annotationHeaders: { left: "Value", right: "Flag", fill: textFill, fontSize: 16 },
    overlays,
    tracks,
  };
})();

export const templates: GraphTemplate[] = [
  {
    id: "ggt_classic_light",
    name: "GGT classic light",
    description: "Classic white-background matrix style with block labels and legend.",
    config: ggtClassicLight,
  },
  {
    id: "introgression_lines_light",
    name: "Segment matrix light",
    description: "Mosaic-style bars and segments for generic row/column matrices.",
    config: introgressionLinesLight,
  },
  {
    id: "publication_compact_light",
    name: "Publication compact light",
    description: "Compact layout with restrained spacing, lines, and type for manuscript figures.",
    config: publicationCompactLight,
  },
  {
    id: "rqtl_like_light",
    name: "Tri-state light",
    description: "Three-state color layout without cell borders.",
    config: rqtlLikeLight,
  },
  {
    id: "flapjack_like_light",
    name: "Compact haplotype light",
    description: "Matrix-like haplotype view with compact cells and no grid.",
    config: flapjackLikeLight,
  },
  {
    id: "dense_matrix_light",
    name: "Dense matrix light",
    description: "Dense display for many samples or markers with a subtle grid.",
    config: denseMatrixLight,
  },
  {
    id: "paper_simple_light",
    name: "Paper simple segments",
    description: "Simple row segment bars with a column axis and value labels.",
    config: paperSimpleLight,
  },
  {
    id: "example_like",
    name: "Segment figure example",
    description: "White-background segment bars with right-side trait labels and symbols.",
    config: exampleLike,
  },
  {
    id: "fa_zoom_figure_light",
    name: "Numeric window zoom",
    description: "Block bar, zoom connectors, column labels, numeric ticks, and value annotations.",
    config: faZoomFigureLight,
  },
  { id: "blank", name: "Blank", description: "Minimal JSON-first starting point.", config: blank },
  {
    id: "tsv_generated",
    name: "TSV generated",
    description: "Template generated from TSV input.",
    config: blank,
  },
  {
    id: "flapjack_generated",
    name: "Flapjack generated",
    description: "Template generated from Flapjack MAP and GENOTYPE input.",
    config: blank,
  },
  {
    id: "builder_generated",
    name: "Builder generated",
    description: "Template generated from the manual Builder.",
    config: blank,
  },
];
