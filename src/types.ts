/**
 * GGT Viewer - Type Definitions
 * 
 * Extracted from App.tsx for better maintainability and reusability.
 */

export type TabKey = "quick" | "builder" | "tsv" | "flapjack" | "template" | "ops" | "export" | "advanced";

export type BuilderCode = "A" | "B" | "H" | "-";
export type BuilderMark = "none" | "circle" | "cross";

export interface BuilderRow {
  id: string;
  sample: string;
  rightLabel: string;
  labelRed: boolean;
  mark: BuilderMark;
  codes: BuilderCode[];
}

export type BuilderEditMode = "grid" | "preview";
export type BuilderFigureMode = "simple" | "fa_zoom";
export type BuilderZoomStages = 1 | 2;
export type BuilderTool = "brush" | "cycle";
export type BuilderCycleOrder = "AB-" | "AHB-";

export type BuilderCanvasEditKind =
  | "sample"
  | "rightLabel"
  | "figureTitle"
  | "chrLabel"
  | "headerLeft"
  | "headerRight"
  | "posUnit"
  | "faLabel"
  | "locusLabelText"
  | "arrowLabel"
  | "genoLegendA"
  | "genoLegendB"
  | "genoLegendH"
  | "detailMarkerName"
  | "detailMarkerPos"
  | "coarseMarkerName"
  | "coarseMarkerPos";

export interface BuilderCanvasEditTarget {
  kind: BuilderCanvasEditKind;
  rIdx?: number;
  cIdx?: number;
  mIdx?: number;
}

export interface BuilderCanvasEdit extends BuilderCanvasEditTarget {
  x: number;
  y: number;
  value: string;
}

export interface BuilderPreviewHotspot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  target: BuilderCanvasEditTarget;
}

export type BuilderPreviewHit =
  | { kind: "cell"; rIdx: number; cIdx: number }
  | { kind: "leftLabel"; rIdx: number }
  | { kind: "rightLabel"; rIdx: number }
  | { kind: "mark"; rIdx: number }
  | { kind: "canvasEdit"; target: BuilderCanvasEditTarget }
  | { kind: "rangeSet"; range: "chrPeak" | "zoom"; pos: number };

export type MatrixDataSource = "tsv" | "flapjack" | "builder";

export interface MatrixRenderOpts {
  paletteId: string;
  theme: "dark" | "light";
  sortMarkers: boolean;
  compressRuns: boolean;
  scaleByPosition: boolean;
}

export interface MatrixRowMeta {
  label: string;
  labelRed?: boolean;
  mark?: BuilderMark;
}

export interface MatrixData {
  source: MatrixDataSource;
  baseName: string;
  markers: import("./ggtTemplates").MarkerInfo[];
  rows: import("./ggtTemplates").MatrixRow[];
  rowMeta?: Record<string, MatrixRowMeta>;
  render: MatrixRenderOpts;
}

export type OpsRowSortMode = "input" | "id" | "region";

export interface BuilderHotkeysState {
  tab: TabKey;
  builderEditMode: BuilderEditMode;
  builderTool: BuilderTool;
  builderBrush: BuilderCode;
  builderCycleOrder: BuilderCycleOrder;
  builderPreviewZoom: number;
  isCanvasEditOpen: boolean;
  undoSize: number;
  redoSize: number;
  doUndoBuilder: () => void;
  doRedoBuilder: () => void;
  downloadBuilderProject: () => void;
  setBuilderEditMode: React.Dispatch<React.SetStateAction<BuilderEditMode>>;
  setBuilderTool: React.Dispatch<React.SetStateAction<BuilderTool>>;
  setBuilderBrush: React.Dispatch<React.SetStateAction<BuilderCode>>;
  setBuilderCycleOrder: React.Dispatch<React.SetStateAction<BuilderCycleOrder>>;
  setBuilderPreviewZoom: React.Dispatch<React.SetStateAction<number>>;
  cancelBuilderCanvasEdit: () => void;
}
