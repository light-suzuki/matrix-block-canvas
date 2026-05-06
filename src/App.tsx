import React, { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ServiceQuickLinks } from "./components/ServiceQuickLinks";
import { GraphicalGenotypeSvg, type EditorUiGuideLine, type EditorUiHandle } from "./GraphicalGenotypeSvg";
import {
  makeConfigFromMatrix,
  markerInfoFromName,
  palettePresets,
  parseTsvToMatrix,
  prettyJson,
  sortMatrixByChrPos,
  templates,
  type GraphConfig,
  type GraphTrack,
  type MarkerInfo,
  type MatrixRow,
  type OverlayShape,
} from "./ggtTemplates";
import { downloadJpegFromSvg, downloadSvg } from "./exportImage";
import { makeAbhMatrixFromFlapjack, parseFlapjackGenotype, parseFlapjackMap } from "./flapjack";
import {
  applyImputeAndSmooth,
  matrixToTsv,
  resolveRegionByChrPos,
  resolveRegionByIndex,
  sliceMatrix,
  sortRowsByRegionFraction,
  sortRowsBySampleId,
  uniqueChromosomes,
  type Region,
} from "./matrixOps";
import { basenameFromFilename, downloadTextFile, makeId, safeFileBase, timestampForFile, readFileAsText } from "./utils/files";
import { readLocal, writeLocal } from "./utils/storage";

type TabKey = "quick" | "builder" | "tsv" | "flapjack" | "template" | "ops" | "export" | "advanced";
type BuilderCode = "A" | "B" | "H" | "-";
type BuilderMark = "none" | "circle" | "cross";
type BuilderRow = { id: string; sample: string; rightLabel: string; annotations: string[]; labelRed: boolean; mark: BuilderMark; codes: BuilderCode[] };
type BuilderAnnoCol = { id: string; header: string; visible: boolean; width: number };
type BuilderEditMode = "grid" | "preview";
type BuilderFigureMode = "simple" | "fa_zoom";
type BuilderZoomStages = 1 | 2;
type BuilderTool = "brush" | "cycle";
type BuilderObjectTool = "select" | "text" | "rect" | "line" | "arrow";
type BuilderCycleOrder = "AB-" | "AHB-";
type BuilderCanvasEditKind =
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
type BuilderCanvasEditTarget = { kind: BuilderCanvasEditKind; rIdx?: number; cIdx?: number; mIdx?: number };
type BuilderCanvasEdit = BuilderCanvasEditTarget & { x: number; y: number; value: string };
type BuilderPreviewHotspot = { x0: number; y0: number; x1: number; y1: number; target: BuilderCanvasEditTarget };
type BuilderPreviewHit =
  | { kind: "cell"; rIdx: number; cIdx: number }
  | { kind: "leftLabel"; rIdx: number }
  | { kind: "rightLabel"; rIdx: number }
  | { kind: "mark"; rIdx: number }
  | { kind: "canvasEdit"; target: BuilderCanvasEditTarget }
  | { kind: "rangeSet"; range: "chrPeak" | "zoom"; pos: number };

type MatrixDataSource = "tsv" | "flapjack" | "builder";
type MatrixRenderOpts = {
  paletteId: string;
  theme: "dark" | "light";
  sortMarkers: boolean;
  compressRuns: boolean;
  scaleByPosition: boolean;
};
type MatrixRowMeta = { label: string; labelRed?: boolean; mark?: BuilderMark };
type MatrixData = {
  source: MatrixDataSource;
  baseName: string;
  markers: MarkerInfo[];
  rows: MatrixRow[];
  rowMeta?: Record<string, MatrixRowMeta>;
  render: MatrixRenderOpts;
};
type OpsRowSortMode = "input" | "id" | "region";

const MAX_BUILDER_ROWS = 1000;

const splitAnnoColumnsText = (text: string): string[] => {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  if (raw.includes("\t")) return raw.split("\t").map((v) => v.trim());
  if (raw.includes("|")) return raw.split("|").map((v) => v.trim());
  return [raw];
};

const normalizeAnnoValues = (cols: string[], n: number): string[] => {
  const out = cols.map((v) => String(v ?? "").trim());
  while (out.length < n) out.push("");
  return out.slice(0, n);
};

const joinAnnoColumnsText = (cols: string[]): string => cols.map((v) => String(v ?? "").trim()).join(" | ").trim();

const buildVisibleAnnoText = (values: string[], cols: BuilderAnnoCol[]): string => {
  const out: string[] = [];
  for (let i = 0; i < cols.length; i += 1) {
    if (!cols[i]?.visible) continue;
    out.push(values[i] ?? "");
  }
  return joinAnnoColumnsText(out);
};

type BuilderHotkeysState = {
  tab: TabKey;
  builderEditMode: BuilderEditMode;
  builderTool: BuilderTool;
  builderBrush: BuilderCode;
  builderCycleOrder: BuilderCycleOrder;
  builderPreviewZoom: number;
  builderObjectMode: boolean;
  builderObjectTool: BuilderObjectTool;
  builderObjectSnap: boolean;
  selectedOverlayId: string | null;
  hasDraftOverlay: boolean;
  isCanvasEditOpen: boolean;
  undoSize: number;
  redoSize: number;
  doUndoBuilder: () => void;
  doRedoBuilder: () => void;
  downloadBuilderProject: () => void;
  deleteSelectedOverlay: () => void;
  duplicateSelectedOverlay: () => void;
  nudgeSelectedOverlay: (dx: number, dy: number) => void;
  copySelectedOverlay: () => void;
  pasteOverlay: () => void;
  cancelOverlayDraft: () => void;
  clearOverlaySelection: () => void;
  exitObjectMode: () => void;
  setBuilderEditMode: React.Dispatch<React.SetStateAction<BuilderEditMode>>;
  setBuilderTool: React.Dispatch<React.SetStateAction<BuilderTool>>;
  setBuilderBrush: React.Dispatch<React.SetStateAction<BuilderCode>>;
  setBuilderCycleOrder: React.Dispatch<React.SetStateAction<BuilderCycleOrder>>;
  setBuilderPreviewZoom: React.Dispatch<React.SetStateAction<number>>;
  setBuilderObjectTool: React.Dispatch<React.SetStateAction<BuilderObjectTool>>;
  cancelBuilderCanvasEdit: () => void;
};

const DEFAULT_TAB: TabKey = "builder";
const DEFAULT_TEMPLATE_ID = "ggt_classic_light";

const EXAMPLE_TSV =
  "sample\tc01\tc02\tc03\ngroup\t1\t1\t2\npos\t1\t2\t3\nrow_01\tA\tA\tB\nrow_02\tB\tB\tB\nrow_03\tA\tH\tB\nrow_04\tB\tA\t-\n";

const EXAMPLE_FJ_MAP = "# fjFile = MAP\nC01\t1\t1\nC02\t1\t2\nC03\t2\t1\n";

const EXAMPLE_FJ_GENO =
  "# fjFile = GENOTYPE\n\tC01\tC02\tC03\nrow_01\tA\tG\tG\nrow_02\tT\tA\tC\nrow_03\tA\t-\tG/T\nrow_04\tT\tG\tT\n";

const DEFAULT_FA_ZOOM_META: MarkerInfo[] = [
  { name: "C01", chr: "1", pos: 1 },
  { name: "C02", chr: "1", pos: 2 },
  { name: "C03", chr: "1", pos: 3 },
  { name: "C04", chr: "1", pos: 4 },
  { name: "C05", chr: "1", pos: 5 },
  { name: "C06", chr: "1", pos: 6 },
  { name: "C07", chr: "1", pos: 7 },
  { name: "C08", chr: "1", pos: 8 },
  { name: "C09", chr: "1", pos: 9 },
  { name: "C10", chr: "1", pos: 10 },
  { name: "C11", chr: "1", pos: 11 },
  { name: "C12", chr: "1", pos: 12 },
  { name: "C13", chr: "1", pos: 13 },
  { name: "C14", chr: "1", pos: 14 },
];

const DEFAULT_FA_ZOOM_MAP_TSV =
  "column\tgroup\tpos\n" +
  DEFAULT_FA_ZOOM_META.map((m) => `${m.name}\t${m.chr ?? ""}\t${Number.isFinite(m.pos ?? Number.NaN) ? m.pos : ""}`).join("\n") +
  "\n";

const guessParents = (names: string[]): { a?: string; b?: string } => {
  const lowered = names.map((n) => ({ n, l: n.toLowerCase() }));
  const pick = (needles: string[]): string | undefined =>
    lowered.find((v) => needles.some((k) => v.l === k || v.l.includes(k)))?.n;
  const a = pick(["p1", "parent1", "par1", "a", "aa"]) || names[0];
  const b = pick(["p2", "parent2", "par2", "b", "bb"]) || names[1];
  if (a && b && a !== b) return { a, b };
  return { a: names[0], b: names[1] };
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const App: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hotkeysRef = useRef<BuilderHotkeysState | null>(null);
  const builderDefaultPresetRef = useRef<boolean>(false);
  const builderPreviewHotspotsRef = useRef<BuilderPreviewHotspot[]>([]);
  const builderUiHandlesRef = useRef<EditorUiHandle[]>([]);
  const builderUiGuidesRef = useRef<EditorUiGuideLine[]>([]);
  type BuilderUiMeta = {
    plotX: number;
    plotWidth: number;
    chrLenMb: number;
    coarseTicks: Array<{ pos: number; x: number }>;
    detailCenters: Array<{ pos: number; x: number }>;
  };
  const builderUiMetaRef = useRef<BuilderUiMeta | null>(null);
  const builderUiDragRef = useRef<null | { id: string; startX: number; startY: number; initial: { arrowOffsetX: number; arrowOffsetY: number; labelDx: number; labelDy: number } }>(
    null,
  );

  const initialTab = useMemo(() => {
    const stored = (readLocal("ggt_viewer_tab") || "").trim();
    if (
      stored === "builder" ||
      stored === "tsv" ||
      stored === "flapjack" ||
      stored === "template" ||
      stored === "ops" ||
      stored === "export" ||
      stored === "advanced"
    ) {
      return stored as TabKey;
    }
    return DEFAULT_TAB;
  }, []);
  const [tab, setTab] = useState<TabKey>(initialTab);

  const initialTemplateId = useMemo(() => readLocal("ggt_viewer_template") || DEFAULT_TEMPLATE_ID, []);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId);

  const template = useMemo(() => templates.find((t) => t.id === templateId) || templates[0], [templateId]);
  const [configText, setConfigText] = useState<string>(() => prettyJson(template.config));
  const [config, setConfig] = useState<GraphConfig>(template.config);
  const [configTextStale, setConfigTextStale] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [jsonError, setJsonError] = useState<string>("");

  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);

  const [opsSmooth, setOpsSmooth] = useState<boolean>(() => readLocal("ggt_viewer_ops_smooth") === "1");
  const [opsSmoothH, setOpsSmoothH] = useState<boolean>(() => readLocal("ggt_viewer_ops_smooth_h") === "1");
  const [opsImpute, setOpsImpute] = useState<boolean>(() => readLocal("ggt_viewer_ops_impute") === "1");
  const [opsImputeH, setOpsImputeH] = useState<boolean>(() => readLocal("ggt_viewer_ops_impute_h") === "1");
  const [opsRowSort, setOpsRowSort] = useState<OpsRowSortMode>(() => {
    const v = (readLocal("ggt_viewer_ops_row_sort") || "").trim();
    if (v === "id" || v === "region") return v as OpsRowSortMode;
    return "input";
  });
  const [opsTargetCode, setOpsTargetCode] = useState<"A" | "B">(() => (readLocal("ggt_viewer_ops_target") === "B" ? "B" : "A"));
  const [opsRegionEnabled, setOpsRegionEnabled] = useState<boolean>(() => readLocal("ggt_viewer_ops_region") === "1");
  const [opsCropToRegion, setOpsCropToRegion] = useState<boolean>(() => readLocal("ggt_viewer_ops_crop") === "1");
  const [opsRegionChr, setOpsRegionChr] = useState<string>(() => readLocal("ggt_viewer_ops_region_chr") || "All");
  const [opsRegionStartPos, setOpsRegionStartPos] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_ops_region_start"));
    return Number.isFinite(n) ? n : 0;
  });
  const [opsRegionEndPos, setOpsRegionEndPos] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_ops_region_end"));
    return Number.isFinite(n) ? n : 0;
  });
  const [opsRegionStartIdx1, setOpsRegionStartIdx1] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_ops_region_start_idx1"));
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
  });
  const [opsRegionEndIdx1, setOpsRegionEndIdx1] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_ops_region_end_idx1"));
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
  });

  const initialSidebarWidth = useMemo(() => {
    const n = Number(readLocal("ggt_viewer_sidebar_w"));
    return Number.isFinite(n) && n >= 320 ? Math.min(900, Math.max(320, Math.round(n))) : 520;
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState<number>(initialSidebarWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
  const sidebarResizeRef = useRef<{ on: boolean; startX: number; startWidth: number }>({ on: false, startX: 0, startWidth: 0 });

  const clampSidebarWidth = (value: number): number => Math.min(900, Math.max(320, Math.round(value)));

  useEffect(() => {
    if (!isResizingSidebar) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isResizingSidebar]);

  const startResizeSidebar = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    sidebarResizeRef.current = { on: true, startX: e.clientX, startWidth: sidebarWidth };
    setIsResizingSidebar(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
  };

  const moveResizeSidebar = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!sidebarResizeRef.current.on) return;
    const dx = e.clientX - sidebarResizeRef.current.startX;
    setSidebarWidth(clampSidebarWidth(sidebarResizeRef.current.startWidth + dx));
  };

  const endResizeSidebar = (): void => {
    if (!sidebarResizeRef.current.on) return;
    sidebarResizeRef.current.on = false;
    setIsResizingSidebar(false);
  };

  const initialBuilderMarkers = useMemo(() => {
    const n = Number(readLocal("ggt_viewer_builder_markers"));
    return Number.isFinite(n) && n >= 3 ? Math.min(200, Math.max(3, Math.round(n))) : 14;
  }, []);
  const [builderMarkers, setBuilderMarkers] = useState<number>(initialBuilderMarkers);
  const [builderMarkerMeta, setBuilderMarkerMeta] = useState<MarkerInfo[]>(() => {
    const fallback =
      initialBuilderMarkers === DEFAULT_FA_ZOOM_META.length
        ? DEFAULT_FA_ZOOM_META.map((m) => ({ ...m }))
        : Array.from({ length: initialBuilderMarkers }, (_, i) => ({
          name: `m${i + 1}`,
          chr: undefined,
          pos: undefined,
        }));
    const raw = readLocal("ggt_viewer_builder_marker_meta");
    if (!raw) return fallback;
    try {
      const v = JSON.parse(raw) as unknown;
      if (!Array.isArray(v)) return fallback;
      const parsed = v
        .map((m, i) => {
          const mm = m as Partial<MarkerInfo>;
          const name = String(mm?.name ?? "").trim() || `m${i + 1}`;
          const chr = String(mm?.chr ?? "").trim() || undefined;
          const posNum = Number((mm as { pos?: unknown })?.pos);
          const pos = Number.isFinite(posNum) ? posNum : undefined;
          return { name, chr, pos };
        })
        .filter((m) => m.name.trim().length > 0);
      if (!parsed.length) return fallback;
      const out = parsed.slice(0, initialBuilderMarkers);
      while (out.length < initialBuilderMarkers) out.push({ name: `m${out.length + 1}`, chr: undefined, pos: undefined });
      return out;
    } catch {
      return fallback;
    }
  });
  const [builderScaleByPos, setBuilderScaleByPos] = useState<boolean>(() => readLocal("ggt_viewer_builder_scale_pos") === "1");
  const [builderMapDraft, setBuilderMapDraft] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_map_draft");
    if (raw === null) return DEFAULT_FA_ZOOM_MAP_TSV;
    return raw || "";
  });
  const [builderAutoChr, setBuilderAutoChr] = useState<string>(() => readLocal("ggt_viewer_builder_auto_chr") || "1");
  const [builderAutoStart, setBuilderAutoStart] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_auto_start"));
    return Number.isFinite(n) ? n : 0;
  });
  const [builderAutoStep, setBuilderAutoStep] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_auto_step"));
    return Number.isFinite(n) && n > 0 ? n : 10;
  });
  const [builderLeftLabels, setBuilderLeftLabels] = useState<boolean>(() => {
    const raw = readLocal("ggt_viewer_builder_left_labels");
    if (raw === null) return true;
    return raw === "1";
  });
  const [builderShowMarkerAxis, setBuilderShowMarkerAxis] = useState<boolean>(() => {
    const raw = readLocal("ggt_viewer_builder_marker_axis");
    if (raw === null) return true;
    return raw === "1";
  });
  const [builderGuides, setBuilderGuides] = useState<boolean>(() => {
    const raw = readLocal("ggt_viewer_builder_guides");
    if (raw === null) return true;
    return raw === "1";
  });
  const [builderGuideMode, setBuilderGuideMode] = useState<"centers" | "boundaries">(() =>
    readLocal("ggt_viewer_builder_guides_mode") === "boundaries" ? "boundaries" : "centers",
  );
  const [builderHeaderLeft, setBuilderHeaderLeft] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_header_left");
    if (raw === null) return "Value";
    return raw || "";
  });
  const [builderHeaderRight, setBuilderHeaderRight] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_header_right");
    if (raw === null) return "Flag";
    return raw || "";
  });
  const [builderAnnoCols, setBuilderAnnoCols] = useState<BuilderAnnoCol[]>(() => {
    const raw = readLocal("ggt_viewer_builder_anno_cols");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const cols = parsed
            .filter((v) => v && typeof v === "object")
            .map((v) => {
              const o = v as Record<string, unknown>;
              const header = String(o.header ?? "").trim();
              const visible = Boolean(o.visible ?? true);
              const widthRaw = Number(o.width ?? 0);
              const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.round(widthRaw) : 0;
              return { id: makeId(), header, visible, width } satisfies BuilderAnnoCol;
            });
          if (cols.length) return cols;
        }
      } catch {
        // ignore
      }
    }
    const headers = splitAnnoColumnsText(builderHeaderLeft).filter((v) => v.length > 0);
    const base = headers.length ? headers : [builderHeaderLeft || "Value"];
    return base.map((h) => ({ id: makeId(), header: h, visible: true, width: 0 }));
  });

  useEffect(() => writeLocal("ggt_viewer_builder_anno_cols", JSON.stringify(builderAnnoCols)), [builderAnnoCols]);
  const [builderPosUnit, setBuilderPosUnit] = useState<string>(() => readLocal("ggt_viewer_builder_pos_unit") || "Mb");
  const [builderFigureMode, setBuilderFigureMode] = useState<BuilderFigureMode>(() => {
    const raw = readLocal("ggt_viewer_builder_fig_mode");
    if (raw === null) return "fa_zoom";
    return raw === "fa_zoom" ? "fa_zoom" : "simple";
  });
  const [builderChrLabel, setBuilderChrLabel] = useState<string>(() => readLocal("ggt_viewer_builder_chr_label") || "Block 1");
  const [builderChrLenMb, setBuilderChrLenMb] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_chr_len_mb"));
    return Number.isFinite(n) && n > 0 ? n : 200;
  });
  const [builderCoarseMarkersDraft, setBuilderCoarseMarkersDraft] = useState<string>(() =>
    readLocal("ggt_viewer_builder_coarse_markers") ||
    "C01\t1\nC02\t4\nC03\t7\nC04\t10\nC05\t13\nC06\t16\n",
  );
  const [builderZoomStages, setBuilderZoomStages] = useState<BuilderZoomStages>(() => {
    const raw = readLocal("ggt_viewer_builder_zoom_stages");
    if (raw === null) return 2;
    return Number(raw) === 1 ? 1 : 2;
  });
  const [builderChrZoomStartMb, setBuilderChrZoomStartMb] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_chr_zoom_start_mb");
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  });
  const [builderChrZoomEndMb, setBuilderChrZoomEndMb] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_chr_zoom_end_mb");
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  });
  const [builderCoarseZoomStartMb, setBuilderCoarseZoomStartMb] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_coarse_zoom_start_mb");
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  });
  const [builderCoarseZoomEndMb, setBuilderCoarseZoomEndMb] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_coarse_zoom_end_mb");
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  });
  const [builderFaLabel, setBuilderFaLabel] = useState<string>(() => readLocal("ggt_viewer_builder_fa_label") || "Window");
  const [builderLocusLabelText, setBuilderLocusLabelText] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_locus_label_text");
    if (raw === null) return `${builderFaLabel} ~50`;
    return raw || "";
  });
  const [builderArrowLabel, setBuilderArrowLabel] = useState<string>(() => readLocal("ggt_viewer_builder_arrow_label") || "~8Mb");
  const [builderArrowLabelAuto, setBuilderArrowLabelAuto] = useState<boolean>(() => readLocal("ggt_viewer_builder_arrow_label_auto") === "1");
  const [builderArrowStartMb, setBuilderArrowStartMb] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_start_mb"));
    return Number.isFinite(n) ? n : 1;
  });
  const [builderArrowEndMb, setBuilderArrowEndMb] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_end_mb"));
    return Number.isFinite(n) ? n : 2;
  });
  const [builderArrowOffsetX, setBuilderArrowOffsetX] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_offset_x"));
    return Number.isFinite(n) ? n : 0;
  });
  const [builderArrowOffsetY, setBuilderArrowOffsetY] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_offset_y"));
    return Number.isFinite(n) ? n : 0;
  });
  const [builderArrowLabelDx, setBuilderArrowLabelDx] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_label_dx"));
    return Number.isFinite(n) ? n : 0;
  });
  const [builderArrowLabelDy, setBuilderArrowLabelDy] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_arrow_label_dy"));
    return Number.isFinite(n) ? n : 0;
  });
  const [builderFigureTitle, setBuilderFigureTitle] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_fig_title");
    if (raw === null) return "Numeric matrix example";
    return raw || "";
  });
  const [builderGenoLegendA, setBuilderGenoLegendA] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_geno_legend_a");
    if (raw === null) return "Code A";
    return raw || "";
  });
  const [builderGenoLegendB, setBuilderGenoLegendB] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_geno_legend_b");
    if (raw === null) return "Code B";
    return raw || "";
  });
  const [builderGenoLegendH, setBuilderGenoLegendH] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_geno_legend_h");
    if (raw === null) return "Code H";
    return raw || "";
  });
  const [builderHighlightMarkers, setBuilderHighlightMarkers] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_hi_markers");
    if (raw === null) return "C07";
    return raw || "";
  });
  const [builderPaletteId, setBuilderPaletteId] = useState<string>(() => {
    const raw = readLocal("ggt_viewer_builder_palette");
    if (raw === null) return "blue_yellow_white";
    return raw || "blue_yellow_white";
  });
  const [builderTheme, setBuilderTheme] = useState<"dark" | "light">(() => {
    const raw = readLocal("ggt_viewer_builder_theme");
    if (raw === null) return "light";
    return raw === "light" ? "light" : "dark";
  });
  const [builderCompressRuns, setBuilderCompressRuns] = useState<boolean>(() => readLocal("ggt_viewer_builder_compress") !== "0");
  const [builderCellSize, setBuilderCellSize] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_cell"));
    return Number.isFinite(n) && n >= 6 ? Math.min(40, Math.max(6, Math.round(n))) : 14;
  });
  const [builderCanvasWidth, setBuilderCanvasWidth] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_canvas_w"));
    return Number.isFinite(n) && n >= 800 ? Math.min(12000, Math.max(800, Math.round(n))) : 1600;
  });
  const [builderAnnotationWidth, setBuilderAnnotationWidth] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_anno_w");
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 120 ? Math.min(2000, Math.max(120, Math.round(n))) : 260;
  });
  const [builderRowHeight, setBuilderRowHeight] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_row_h");
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 10 ? Math.min(200, Math.max(10, Math.round(n))) : 44;
  });
  const [builderRowGap, setBuilderRowGap] = useState<number>(() => {
    const raw = readLocal("ggt_viewer_builder_row_gap");
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.min(200, Math.max(0, Math.round(n))) : 16;
  });
  const [builderBrush, setBuilderBrush] = useState<BuilderCode>(() => {
    const raw = readLocal("ggt_viewer_builder_brush") || "A";
    if (raw === "A" || raw === "B" || raw === "H" || raw === "-") return raw;
    return "A";
  });
  const [builderTool, setBuilderTool] = useState<BuilderTool>(() => {
    const raw = readLocal("ggt_viewer_builder_tool");
    if (raw === null) return "cycle";
    return raw === "cycle" ? "cycle" : "brush";
  });
  const [builderCycleOrder, setBuilderCycleOrder] = useState<BuilderCycleOrder>(() =>
    readLocal("ggt_viewer_builder_cycle_order") === "AB-" ? "AB-" : "AHB-",
  );
  const [builderEditMode, setBuilderEditMode] = useState<BuilderEditMode>(() =>
    readLocal("ggt_viewer_builder_edit_mode") === "grid" ? "grid" : "preview",
  );
  const [builderPreviewZoom, setBuilderPreviewZoom] = useState<number>(() => {
    const n = Number(readLocal("ggt_viewer_builder_preview_zoom"));
    return Number.isFinite(n) && n >= 0.25 ? Math.min(4, Math.max(0.25, n)) : 1;
  });
  const [builderObjectMode, setBuilderObjectMode] = useState<boolean>(() => readLocal("ggt_viewer_builder_object_mode") === "1");
  const [builderObjectTool, setBuilderObjectTool] = useState<BuilderObjectTool>(() => {
    const raw = (readLocal("ggt_viewer_builder_object_tool") || "").trim();
    if (raw === "text" || raw === "rect" || raw === "line" || raw === "arrow" || raw === "select") return raw as BuilderObjectTool;
    return "select";
  });
  const [builderObjectSnap, setBuilderObjectSnap] = useState<boolean>(() => readLocal("ggt_viewer_builder_object_snap") !== "0");
  const [builderSelectedOverlayId, setBuilderSelectedOverlayId] = useState<string | null>(null);
  const [builderDraftOverlay, setBuilderDraftOverlay] = useState<OverlayShape | null>(null);
  const [builderUserOverlays, setBuilderUserOverlays] = useState<OverlayShape[]>(() => {
    const raw = readLocal("ggt_viewer_builder_user_overlays");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((v) => v && typeof v === "object" && typeof (v as { kind?: unknown }).kind === "string" && typeof (v as { id?: unknown }).id === "string")
        .map((v) => v as OverlayShape);
    } catch {
      return [];
    }
  });
  const builderUserOverlaysRef = useRef<OverlayShape[]>(builderUserOverlays);
  const builderOverlayClipboardRef = useRef<OverlayShape | null>(null);
  const builderOverlayDragRef = useRef<
    | null
    | {
        id: string;
        kind: "move" | "rect-nw" | "rect-ne" | "rect-sw" | "rect-se" | "line-start" | "line-end";
        startX: number;
        startY: number;
        initial: OverlayShape;
      }
    | {
        kind: "draft";
        tool: "rect" | "line" | "arrow";
        startX: number;
        startY: number;
      }
  >(null);
  const [builderCanvasEdit, setBuilderCanvasEdit] = useState<BuilderCanvasEdit | null>(null);
  const builderCanvasEditRef = useRef<HTMLDivElement | null>(null);
  const builderCanvasEditInputRef = useRef<HTMLInputElement | null>(null);
  const [builderRows, setBuilderRows] = useState<BuilderRow[]>(() => {
    const n = initialBuilderMarkers;
    const fill = (code: BuilderCode): BuilderCode[] => Array.from({ length: n }, () => code);
    const mix = (codes: BuilderCode[]): BuilderCode[] => {
      while (codes.length < n) codes.push("-");
      return codes.slice(0, n);
    };
    // Default: show a neutral target-interval zoom figure.
    if (n === DEFAULT_FA_ZOOM_META.length) {
      const codesF23 = Array.from({ length: n }, (_, i) => (i <= 5 ? ("A" as const) : ("H" as const)));
      const codesF2333 = Array.from({ length: n }, (_, i) => (i <= 5 ? ("H" as const) : ("A" as const)));
      const codesF284 = Array.from({ length: n }, (_, i) => (i <= 2 ? ("A" as const) : ("H" as const)));
      return [
        { id: makeId(), sample: "Row 01", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: fill("A") },
        { id: makeId(), sample: "Row 02", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: fill("B") },
        { id: makeId(), sample: "Row 03", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: mix(codesF23) },
        { id: makeId(), sample: "Row 04", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: mix(codesF2333) },
        { id: makeId(), sample: "Row 05", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "circle", codes: mix(codesF284) },
      ];
    }
    return [
      { id: makeId(), sample: "Row 01", rightLabel: "Row 01", annotations: ["Row 01"], labelRed: false, mark: "none", codes: fill("A") },
      { id: makeId(), sample: "Row 02", rightLabel: "Row 02", annotations: ["Row 02"], labelRed: false, mark: "none", codes: fill("B") },
      { id: makeId(), sample: "Row 03", rightLabel: "Row 03", annotations: ["Row 03"], labelRed: false, mark: "none", codes: fill("H") },
      { id: makeId(), sample: "Row 04", rightLabel: "Row 04", annotations: ["Row 04"], labelRed: false, mark: "none", codes: mix(["A", "A", "A", "H", "H", "B", "B", "A", "A", "-", "-", "B", "B", "B"]) },
      { id: makeId(), sample: "Row 05", rightLabel: "Row 05", annotations: ["Row 05"], labelRed: true, mark: "circle", codes: mix(["-", "-", "A", "A", "A", "A", "H", "H", "B", "B", "B", "A", "A", "A"]) },
      { id: makeId(), sample: "Row 06", rightLabel: "Row 06", annotations: ["Row 06"], labelRed: false, mark: "none", codes: mix(["B", "B", "-", "-", "A", "A", "A", "H", "H", "B", "B", "B", "-", "-"]) },
    ];
  });

  const [builderRowBulkDraft, setBuilderRowBulkDraft] = useState<string>("");
  const [builderGridRowStart, setBuilderGridRowStart] = useState<number>(0);
  const [builderGridRowCount, setBuilderGridRowCount] = useState<number>(40);
  const [builderRowQuery, setBuilderRowQuery] = useState<string>(() => readLocal("ggt_viewer_builder_row_query") || "");
  const builderRowDragRef = useRef<number | null>(null);
  type BuilderAutosaveEntry = { id: string; savedAt: number; payload: Record<string, unknown> };
  const BUILDER_AUTOSAVE_KEY = "ggt_viewer_builder_autosave_history_v1";
  const [builderAutosaveEnabled, setBuilderAutosaveEnabled] = useState<boolean>(() => readLocal("ggt_viewer_builder_autosave_enabled") !== "0");
  const [builderAutosaves, setBuilderAutosaves] = useState<BuilderAutosaveEntry[]>(() => {
    const raw = readLocal(BUILDER_AUTOSAVE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((v) => v && typeof v === "object")
        .map((v) => {
          const o = v as Record<string, unknown>;
          const savedAt = Number(o.savedAt);
          const payload = (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<string, unknown>;
          return { id: makeId(), savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(), payload } satisfies BuilderAutosaveEntry;
        })
        .slice(0, 20);
    } catch {
      return [];
    }
  });
  const builderAutosaveTimerRef = useRef<number | null>(null);
  const builderAutosaveLastJsonRef = useRef<string | null>(null);

  useEffect(() => writeLocal("ggt_viewer_builder_row_query", builderRowQuery), [builderRowQuery]);
  useEffect(() => writeLocal("ggt_viewer_builder_autosave_enabled", builderAutosaveEnabled ? "1" : "0"), [builderAutosaveEnabled]);

  useEffect(() => {
    setBuilderGridRowStart((prev) => {
      const count = Math.max(1, Math.round(builderGridRowCount) || 1);
      const q = builderRowQuery.trim().toLowerCase();
      const total = q
        ? builderRows.filter((r) => {
            const hay = `${r.sample}\n${r.rightLabel}\n${r.annotations.join("\t")}`.toLowerCase();
            return hay.includes(q);
          }).length
        : builderRows.length;
      const maxStart = Math.max(0, total - count);
      return Math.max(0, Math.min(prev, maxStart));
    });
  }, [builderRows, builderRowQuery, builderGridRowCount]);

  const persistBuilderAutosaves = (next: BuilderAutosaveEntry[]): void => {
    if (next.length === 0) builderAutosaveLastJsonRef.current = null;
    setBuilderAutosaves(next);
    writeLocal(BUILDER_AUTOSAVE_KEY, JSON.stringify(next));
  };

  const pushBuilderAutosave = (payload: Record<string, unknown>): void => {
    const json = JSON.stringify(payload);
    if (builderAutosaveLastJsonRef.current === json) return;
    builderAutosaveLastJsonRef.current = json;

    const entry: BuilderAutosaveEntry = { id: makeId(), savedAt: Date.now(), payload };
    const keep = 8;
    setBuilderAutosaves((prev) => {
      const next = [entry, ...prev].slice(0, keep);
      writeLocal(BUILDER_AUTOSAVE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!builderAutosaveEnabled) return;
    if (tab !== "builder") return;
    if (builderAutosaveTimerRef.current !== null) window.clearTimeout(builderAutosaveTimerRef.current);
    builderAutosaveTimerRef.current = window.setTimeout(() => {
      builderAutosaveTimerRef.current = null;
      pushBuilderAutosave(buildBuilderProjectPayload());
    }, 1500);
    return () => {
      if (builderAutosaveTimerRef.current !== null) window.clearTimeout(builderAutosaveTimerRef.current);
      builderAutosaveTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    builderAutosaveEnabled,
    builderMarkers,
    builderMarkerMeta,
    builderRows,
    builderScaleByPos,
    builderUserOverlays,
    builderAnnoCols,
    builderHeaderRight,
    builderPosUnit,
    builderFigureMode,
    builderChrLabel,
    builderChrLenMb,
    builderCoarseMarkersDraft,
    builderZoomStages,
    builderChrZoomStartMb,
    builderChrZoomEndMb,
    builderCoarseZoomStartMb,
    builderCoarseZoomEndMb,
    builderFaLabel,
    builderLocusLabelText,
    builderArrowLabel,
    builderArrowLabelAuto,
    builderArrowStartMb,
    builderArrowEndMb,
    builderArrowOffsetX,
    builderArrowOffsetY,
    builderArrowLabelDx,
    builderArrowLabelDy,
    builderFigureTitle,
    builderGenoLegendA,
    builderGenoLegendB,
    builderGenoLegendH,
    builderHighlightMarkers,
    builderPaletteId,
    builderTheme,
    builderCompressRuns,
    builderCellSize,
    builderCanvasWidth,
    builderAnnotationWidth,
    builderRowHeight,
    builderRowGap,
    builderLeftLabels,
    builderShowMarkerAxis,
    builderGuides,
    builderGuideMode,
  ]);

  // Make the neutral target-interval figure the default visual preset (applied once per browser/profile).
  useEffect(() => {
    if (builderDefaultPresetRef.current) return;
    builderDefaultPresetRef.current = true;
    const key = "ggt_viewer_builder_default_preset_v";
    const want = "numeric_window_reference_v4";
    const cur = readLocal(key);
    if (cur === want) return;

    const n = DEFAULT_FA_ZOOM_META.length;
    const fill = (code: BuilderCode): BuilderCode[] => Array.from({ length: n }, () => code);
    const mix = (codes: BuilderCode[]): BuilderCode[] => {
      const out = codes.slice(0, n);
      while (out.length < n) out.push("-");
      return out;
    };

    const codesF23 = Array.from({ length: n }, (_, i) => (i <= 5 ? ("A" as const) : ("H" as const)));
    const codesF2333 = Array.from({ length: n }, (_, i) => (i <= 5 ? ("H" as const) : ("A" as const)));
    const codesF284 = Array.from({ length: n }, (_, i) => (i <= 2 ? ("A" as const) : ("H" as const)));

    setTab("builder");
    setBaseName("numeric_window");
    setBuilderMarkers(n);
    setBuilderMarkerMeta(DEFAULT_FA_ZOOM_META.map((m) => ({ ...m })));
    setBuilderMapDraft(DEFAULT_FA_ZOOM_MAP_TSV);
    setBuilderRows([
      { id: makeId(), sample: "Row 01", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: fill("A") },
      { id: makeId(), sample: "Row 02", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: fill("B") },
      { id: makeId(), sample: "Row 03", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: mix(codesF23) },
      { id: makeId(), sample: "Row 04", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: mix(codesF2333) },
      { id: makeId(), sample: "Row 05", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "circle", codes: mix(codesF284) },
    ]);

    setBuilderFigureMode("fa_zoom");
    setBuilderTheme("light");
    setBuilderPaletteId("blue_yellow_white");
    setBuilderScaleByPos(false);
    setBuilderLeftLabels(true);
    setBuilderShowMarkerAxis(true);
    setBuilderGuides(true);
    setBuilderGuideMode("centers");
    setBuilderPosUnit("Mb");
    setBuilderHeaderLeft("Value");
    setBuilderHeaderRight("Flag");
    setBuilderAnnoCols([{ id: makeId(), header: "Value", visible: true, width: 0 }]);
    setBuilderChrLabel("Block 1");
    setBuilderChrLenMb(200);
    setBuilderCoarseMarkersDraft("C01\t1\nC02\t4\nC03\t7\nC04\t10\nC05\t13\nC06\t16\n");
    setBuilderZoomStages(2);
    setBuilderChrZoomStartMb(1);
    setBuilderChrZoomEndMb(16);
    setBuilderCoarseZoomStartMb(1);
    setBuilderCoarseZoomEndMb(4);
    setBuilderFaLabel("Window");
    setBuilderLocusLabelText("Window ~50");
    setBuilderArrowLabel("~8");
    setBuilderArrowStartMb(1);
    setBuilderArrowEndMb(2);
    setBuilderFigureTitle("Numeric matrix example");
    setBuilderGenoLegendA("Code A");
    setBuilderGenoLegendB("Code B");
    setBuilderGenoLegendH("Code H");
    setBuilderHighlightMarkers("C07");
    setBuilderCanvasWidth(1600);
    setBuilderAnnotationWidth(260);
    setBuilderRowHeight(44);
    setBuilderRowGap(16);
    setBuilderEditMode("preview");
    setBuilderTool("cycle");
    setBuilderCycleOrder("AHB-");
    setBuilderPreviewZoom(1);

    writeLocal(key, want);
  }, []);

  const [tsvText, setTsvText] = useState<string>("");
  const [tsvPaletteId, setTsvPaletteId] = useState<string>(() => readLocal("ggt_viewer_tsv_palette") || "cyan_yellow_white");
  const [tsvTheme, setTsvTheme] = useState<"dark" | "light">(() => (readLocal("ggt_viewer_tsv_theme") === "light" ? "light" : "dark"));
  const [tsvSortMarkers, setTsvSortMarkers] = useState<boolean>(() => readLocal("ggt_viewer_tsv_sort") !== "0");
  const [tsvCompressRuns, setTsvCompressRuns] = useState<boolean>(() => readLocal("ggt_viewer_tsv_compress") !== "0");
  const [tsvScaleByPos, setTsvScaleByPos] = useState<boolean>(() => readLocal("ggt_viewer_tsv_scale_pos") !== "0");

  const [fjMapText, setFjMapText] = useState<string>("");
  const [fjGenoText, setFjGenoText] = useState<string>("");
  const [fjSampleNames, setFjSampleNames] = useState<string[]>([]);
  const [fjParentA, setFjParentA] = useState<string>("");
  const [fjParentB, setFjParentB] = useState<string>("");
  const [fjStats, setFjStats] = useState<{ mapMarkers: number; genoMarkers: number; matchedMarkers: number; samples: number } | null>(null);
  const [fjError, setFjError] = useState<string>("");
  const [fjPaletteId, setFjPaletteId] = useState<string>(() => readLocal("ggt_viewer_fj_palette") || "cyan_yellow_white");
  const [fjTheme, setFjTheme] = useState<"dark" | "light">(() => (readLocal("ggt_viewer_fj_theme") === "light" ? "light" : "dark"));
  const [fjCompressRuns, setFjCompressRuns] = useState<boolean>(() => readLocal("ggt_viewer_fj_compress") !== "0");
  const [fjScaleByPos, setFjScaleByPos] = useState<boolean>(() => readLocal("ggt_viewer_fj_scale_pos") !== "0");

  const [exportFormat, setExportFormat] = useState<"svg" | "jpeg">("jpeg");
  const [exportWidth, setExportWidth] = useState<number>(3840);
  const [exportHeight, setExportHeight] = useState<number>(2160);
  const [jpegQuality, setJpegQuality] = useState<number>(0.95);
  const [baseName, setBaseName] = useState<string>("graphical_genotype");
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => writeLocal("ggt_viewer_tab", tab), [tab]);
  useEffect(() => writeLocal("ggt_viewer_template", templateId), [templateId]);
  useEffect(() => writeLocal("ggt_viewer_sidebar_w", String(sidebarWidth)), [sidebarWidth]);

  useEffect(() => writeLocal("ggt_viewer_ops_smooth", opsSmooth ? "1" : "0"), [opsSmooth]);
  useEffect(() => writeLocal("ggt_viewer_ops_smooth_h", opsSmoothH ? "1" : "0"), [opsSmoothH]);
  useEffect(() => writeLocal("ggt_viewer_ops_impute", opsImpute ? "1" : "0"), [opsImpute]);
  useEffect(() => writeLocal("ggt_viewer_ops_impute_h", opsImputeH ? "1" : "0"), [opsImputeH]);
  useEffect(() => writeLocal("ggt_viewer_ops_row_sort", opsRowSort), [opsRowSort]);
  useEffect(() => writeLocal("ggt_viewer_ops_target", opsTargetCode), [opsTargetCode]);
  useEffect(() => writeLocal("ggt_viewer_ops_region", opsRegionEnabled ? "1" : "0"), [opsRegionEnabled]);
  useEffect(() => writeLocal("ggt_viewer_ops_crop", opsCropToRegion ? "1" : "0"), [opsCropToRegion]);
  useEffect(() => writeLocal("ggt_viewer_ops_region_chr", opsRegionChr), [opsRegionChr]);
  useEffect(() => writeLocal("ggt_viewer_ops_region_start", String(opsRegionStartPos)), [opsRegionStartPos]);
  useEffect(() => writeLocal("ggt_viewer_ops_region_end", String(opsRegionEndPos)), [opsRegionEndPos]);
  useEffect(() => writeLocal("ggt_viewer_ops_region_start_idx1", String(opsRegionStartIdx1)), [opsRegionStartIdx1]);
  useEffect(() => writeLocal("ggt_viewer_ops_region_end_idx1", String(opsRegionEndIdx1)), [opsRegionEndIdx1]);

  useEffect(() => {
    if (!matrixData) return;
    const total = Math.max(1, matrixData.markers.length);
    setOpsRegionStartIdx1(1);
    setOpsRegionEndIdx1(total);
    const chrs = uniqueChromosomes(matrixData.markers);
    if (!chrs.length) {
      setOpsRegionChr("All");
      return;
    }
    if (opsRegionChr !== "All" && !chrs.includes(opsRegionChr)) setOpsRegionChr(chrs[0]);
  }, [matrixData?.source, matrixData?.markers.length]);

  useEffect(() => writeLocal("ggt_viewer_builder_markers", String(builderMarkers)), [builderMarkers]);
  useEffect(() => writeLocal("ggt_viewer_builder_palette", builderPaletteId), [builderPaletteId]);
  useEffect(() => writeLocal("ggt_viewer_builder_theme", builderTheme), [builderTheme]);
  useEffect(() => writeLocal("ggt_viewer_builder_compress", builderCompressRuns ? "1" : "0"), [builderCompressRuns]);
  useEffect(() => writeLocal("ggt_viewer_builder_cell", String(builderCellSize)), [builderCellSize]);
  useEffect(() => writeLocal("ggt_viewer_builder_canvas_w", String(builderCanvasWidth)), [builderCanvasWidth]);
  useEffect(() => writeLocal("ggt_viewer_builder_anno_w", String(builderAnnotationWidth)), [builderAnnotationWidth]);
  useEffect(() => writeLocal("ggt_viewer_builder_row_h", String(builderRowHeight)), [builderRowHeight]);
  useEffect(() => writeLocal("ggt_viewer_builder_row_gap", String(builderRowGap)), [builderRowGap]);
  useEffect(() => writeLocal("ggt_viewer_builder_brush", builderBrush), [builderBrush]);
  useEffect(() => writeLocal("ggt_viewer_builder_tool", builderTool), [builderTool]);
  useEffect(() => writeLocal("ggt_viewer_builder_cycle_order", builderCycleOrder), [builderCycleOrder]);
  useEffect(() => writeLocal("ggt_viewer_builder_edit_mode", builderEditMode), [builderEditMode]);
  useEffect(() => writeLocal("ggt_viewer_builder_preview_zoom", String(builderPreviewZoom)), [builderPreviewZoom]);
  useEffect(() => writeLocal("ggt_viewer_builder_object_mode", builderObjectMode ? "1" : "0"), [builderObjectMode]);
  useEffect(() => writeLocal("ggt_viewer_builder_object_tool", builderObjectTool), [builderObjectTool]);
  useEffect(() => writeLocal("ggt_viewer_builder_object_snap", builderObjectSnap ? "1" : "0"), [builderObjectSnap]);
  useEffect(() => {
    builderUserOverlaysRef.current = builderUserOverlays;
    try {
      writeLocal("ggt_viewer_builder_user_overlays", JSON.stringify(builderUserOverlays));
    } catch {
      // ignore
    }
  }, [builderUserOverlays]);
  useEffect(() => writeLocal("ggt_viewer_builder_scale_pos", builderScaleByPos ? "1" : "0"), [builderScaleByPos]);
  useEffect(() => writeLocal("ggt_viewer_builder_map_draft", builderMapDraft), [builderMapDraft]);
  useEffect(() => writeLocal("ggt_viewer_builder_auto_chr", builderAutoChr), [builderAutoChr]);
  useEffect(() => writeLocal("ggt_viewer_builder_auto_start", String(builderAutoStart)), [builderAutoStart]);
  useEffect(() => writeLocal("ggt_viewer_builder_auto_step", String(builderAutoStep)), [builderAutoStep]);
  useEffect(() => writeLocal("ggt_viewer_builder_left_labels", builderLeftLabels ? "1" : "0"), [builderLeftLabels]);
  useEffect(() => writeLocal("ggt_viewer_builder_marker_axis", builderShowMarkerAxis ? "1" : "0"), [builderShowMarkerAxis]);
  useEffect(() => writeLocal("ggt_viewer_builder_guides", builderGuides ? "1" : "0"), [builderGuides]);
  useEffect(() => writeLocal("ggt_viewer_builder_guides_mode", builderGuideMode), [builderGuideMode]);
  useEffect(() => writeLocal("ggt_viewer_builder_header_left", builderHeaderLeft), [builderHeaderLeft]);
  useEffect(() => writeLocal("ggt_viewer_builder_header_right", builderHeaderRight), [builderHeaderRight]);
  useEffect(() => writeLocal("ggt_viewer_builder_pos_unit", builderPosUnit), [builderPosUnit]);
  useEffect(() => writeLocal("ggt_viewer_builder_fig_mode", builderFigureMode), [builderFigureMode]);
  useEffect(() => writeLocal("ggt_viewer_builder_chr_label", builderChrLabel), [builderChrLabel]);
  useEffect(() => writeLocal("ggt_viewer_builder_chr_len_mb", String(builderChrLenMb)), [builderChrLenMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_coarse_markers", builderCoarseMarkersDraft), [builderCoarseMarkersDraft]);
  useEffect(() => writeLocal("ggt_viewer_builder_zoom_stages", String(builderZoomStages)), [builderZoomStages]);
  useEffect(() => writeLocal("ggt_viewer_builder_chr_zoom_start_mb", String(builderChrZoomStartMb)), [builderChrZoomStartMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_chr_zoom_end_mb", String(builderChrZoomEndMb)), [builderChrZoomEndMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_coarse_zoom_start_mb", String(builderCoarseZoomStartMb)), [builderCoarseZoomStartMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_coarse_zoom_end_mb", String(builderCoarseZoomEndMb)), [builderCoarseZoomEndMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_fa_label", builderFaLabel), [builderFaLabel]);
  useEffect(() => writeLocal("ggt_viewer_builder_locus_label_text", builderLocusLabelText), [builderLocusLabelText]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_label", builderArrowLabel), [builderArrowLabel]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_label_auto", builderArrowLabelAuto ? "1" : "0"), [builderArrowLabelAuto]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_start_mb", String(builderArrowStartMb)), [builderArrowStartMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_end_mb", String(builderArrowEndMb)), [builderArrowEndMb]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_offset_x", String(builderArrowOffsetX)), [builderArrowOffsetX]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_offset_y", String(builderArrowOffsetY)), [builderArrowOffsetY]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_label_dx", String(builderArrowLabelDx)), [builderArrowLabelDx]);
  useEffect(() => writeLocal("ggt_viewer_builder_arrow_label_dy", String(builderArrowLabelDy)), [builderArrowLabelDy]);
  useEffect(() => writeLocal("ggt_viewer_builder_fig_title", builderFigureTitle), [builderFigureTitle]);
  useEffect(() => writeLocal("ggt_viewer_builder_geno_legend_a", builderGenoLegendA), [builderGenoLegendA]);
  useEffect(() => writeLocal("ggt_viewer_builder_geno_legend_b", builderGenoLegendB), [builderGenoLegendB]);
  useEffect(() => writeLocal("ggt_viewer_builder_geno_legend_h", builderGenoLegendH), [builderGenoLegendH]);
  useEffect(() => writeLocal("ggt_viewer_builder_hi_markers", builderHighlightMarkers), [builderHighlightMarkers]);
  useEffect(() => {
    try {
      writeLocal("ggt_viewer_builder_marker_meta", JSON.stringify(builderMarkerMeta));
    } catch {
      // ignore
    }
  }, [builderMarkerMeta]);

  useEffect(() => writeLocal("ggt_viewer_tsv_palette", tsvPaletteId), [tsvPaletteId]);
  useEffect(() => writeLocal("ggt_viewer_tsv_theme", tsvTheme), [tsvTheme]);
  useEffect(() => writeLocal("ggt_viewer_tsv_sort", tsvSortMarkers ? "1" : "0"), [tsvSortMarkers]);
  useEffect(() => writeLocal("ggt_viewer_tsv_compress", tsvCompressRuns ? "1" : "0"), [tsvCompressRuns]);
  useEffect(() => writeLocal("ggt_viewer_tsv_scale_pos", tsvScaleByPos ? "1" : "0"), [tsvScaleByPos]);

  useEffect(() => writeLocal("ggt_viewer_fj_palette", fjPaletteId), [fjPaletteId]);
  useEffect(() => writeLocal("ggt_viewer_fj_theme", fjTheme), [fjTheme]);
  useEffect(() => writeLocal("ggt_viewer_fj_compress", fjCompressRuns ? "1" : "0"), [fjCompressRuns]);
  useEffect(() => writeLocal("ggt_viewer_fj_scale_pos", fjScaleByPos ? "1" : "0"), [fjScaleByPos]);

  const applyConfig = (next: GraphConfig, sourceId?: string, opts?: { silent?: boolean; syncText?: boolean }): void => {
    if (sourceId && templates.some((t) => t.id === sourceId)) setTemplateId(sourceId);
    setConfig(next);
    if (opts?.syncText === false) {
      setConfigTextStale(true);
    } else {
      setConfigText(prettyJson(next));
      setConfigTextStale(false);
    }
    setJsonError("");
    if (!opts?.silent) setMessage("描画を更新しました。");
  };

  const selectTemplate = (id: string): void => {
    setTemplateId(id);
    if (id === "tsv_generated" || id === "flapjack_generated" || id === "builder_generated") return;
    const next = templates.find((t) => t.id === id)?.config;
    if (!next) return;
    applyConfig(next, id);
  };

  const applyJson = (): void => {
    try {
      const next = JSON.parse(configText) as GraphConfig;
      setConfig(next);
      setJsonError("");
      setConfigTextStale(false);
      setMessage("JSON を反映しました。");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (tab !== "advanced") return;
    if (!configTextStale) return;
    setConfigText(prettyJson(config));
    setConfigTextStale(false);
  }, [tab, configTextStale, config]);

  const builderPalette = useMemo(
    () => palettePresets.find((p) => p.id === builderPaletteId) || palettePresets[0],
    [builderPaletteId],
  );

  const builderCycleCodes = useMemo(() => {
    return builderCycleOrder === "AB-" ? (["A", "B", "-"] as const) : (["A", "H", "B", "-"] as const);
  }, [builderCycleOrder]);

  const cycleNextCode = (code: BuilderCode, dir: 1 | -1): BuilderCode => {
    const list = builderCycleCodes;
    const idx = list.indexOf(code as never);
    if (idx < 0) return list[0];
    const next = (idx + dir + list.length) % list.length;
    return list[next] as BuilderCode;
  };

  const cycleNextMark = (mark: BuilderMark, dir: 1 | -1): BuilderMark => {
    const list: BuilderMark[] = ["none", "circle", "cross"];
    const idx = list.indexOf(mark);
    if (idx < 0) return "none";
    const next = (idx + dir + list.length) % list.length;
    return list[next] as BuilderMark;
  };

  const builderDetailMarkerOptions = useMemo(() => {
    const meta = Array.isArray(builderMarkerMeta) ? builderMarkerMeta.slice(0, builderMarkers) : [];
    const out = meta.map((m, i) => {
      const name = String(m?.name ?? "").trim() || `m${i + 1}`;
      const posNum = Number((m as { pos?: unknown })?.pos);
      const pos = Number.isFinite(posNum) ? posNum : undefined;
      return { idx: i, name, pos };
    });
    while (out.length < builderMarkers) out.push({ idx: out.length, name: `m${out.length + 1}`, pos: undefined });
    return out;
  }, [builderMarkerMeta, builderMarkers]);

  const nearestDetailMarkerName = (value: number): string => {
    const opts = builderDetailMarkerOptions;
    if (!opts.length) return "";
    const hasPos = opts.some((o) => Number.isFinite(o.pos ?? Number.NaN));
    if (hasPos && Number.isFinite(value)) {
      let best = opts[0];
      let bestD = Number.POSITIVE_INFINITY;
      for (const o of opts) {
        const p = o.pos;
        if (!Number.isFinite(p ?? Number.NaN)) continue;
        const d = Math.abs((p as number) - value);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      return best.name;
    }
    if (Number.isFinite(value)) {
      const idx = Math.max(0, Math.min(opts.length - 1, Math.round(value - 1)));
      return opts[idx]?.name || opts[0].name;
    }
    return opts[0].name;
  };

  const builderColorFor = (code: BuilderCode): string => {
    if (code === "A") return builderPalette.colors.A;
    if (code === "B") return builderPalette.colors.B;
    if (code === "H") return builderPalette.colors.H;
    if (code === "-") return builderPalette.colors["-"];
    return builderPalette.colors.other;
  };

  const ensureBuilderMarkers = (nextRaw: number): void => {
    const next = Number.isFinite(nextRaw) ? Math.min(500, Math.max(3, Math.round(nextRaw))) : builderMarkers;
    setBuilderMarkers(next);
    setBuilderMarkerMeta((prev) => {
      const base = Array.isArray(prev) ? prev.map((m) => ({ ...m })) : [];
      const out = base.slice(0, next).map((m, i) => {
        const name = String(m?.name ?? "").trim() || `m${i + 1}`;
        const chr = String(m?.chr ?? "").trim() || undefined;
        const posNum = Number((m as { pos?: unknown })?.pos);
        const pos = Number.isFinite(posNum) ? posNum : undefined;
        return { name, chr, pos };
      });
      while (out.length < next) out.push({ name: `m${out.length + 1}`, chr: undefined, pos: undefined });
      return out;
    });
    setBuilderRows((prev) =>
      prev.map((r) => {
        const codes = r.codes.slice(0, next);
        while (codes.length < next) codes.push("-");
        return { ...r, codes };
      }),
    );
  };

  const ensureBuilderRowCount = (nextRaw: number): void => {
    const next = Number.isFinite(nextRaw) ? Math.min(MAX_BUILDER_ROWS, Math.max(1, Math.round(nextRaw))) : builderRows.length;
    setBuilderRows((prev) => {
      const out = prev.slice(0, next);
      while (out.length < next) {
        const idx = out.length + 1;
        out.push({
          id: makeId(),
          sample: `R${idx}`,
          rightLabel: `R${idx}`,
          annotations: [`R${idx}`],
          labelRed: false,
          mark: "none",
          codes: Array.from({ length: builderMarkers }, () => "-"),
        });
      }
      return out;
    });
  };

  const setBuilderCellSizeSafe = (nextRaw: number): void => {
    if (!Number.isFinite(nextRaw)) return;
    setBuilderCellSize(Math.min(40, Math.max(6, Math.round(nextRaw))));
  };

  const setBuilderCanvasWidthSafe = (nextRaw: number): void => {
    if (!Number.isFinite(nextRaw)) return;
    setBuilderCanvasWidth(Math.min(12000, Math.max(800, Math.round(nextRaw))));
  };

  const setBuilderAnnotationWidthSafe = (nextRaw: number): void => {
    if (!Number.isFinite(nextRaw)) return;
    setBuilderAnnotationWidth(Math.min(2000, Math.max(120, Math.round(nextRaw))));
  };

  const setBuilderRowHeightSafe = (nextRaw: number): void => {
    if (!Number.isFinite(nextRaw)) return;
    setBuilderRowHeight(Math.min(200, Math.max(10, Math.round(nextRaw))));
  };

  const setBuilderRowGapSafe = (nextRaw: number): void => {
    if (!Number.isFinite(nextRaw)) return;
    setBuilderRowGap(Math.min(200, Math.max(0, Math.round(nextRaw))));
  };

  type BuilderSnapshot = {
    markers: number;
    rows: BuilderRow[];
    markerMeta: MarkerInfo[];
    scaleByPosition: boolean;
    userOverlays: OverlayShape[];
    annoCols: BuilderAnnoCol[];
    headerLeft: string;
    headerRight: string;
  };

  const cloneBuilderRows = (rows: BuilderRow[]): BuilderRow[] =>
    rows.map((r) => ({
      id: r.id,
      sample: r.sample,
      rightLabel: r.rightLabel,
      annotations: [...(Array.isArray(r.annotations) ? r.annotations : [])],
      labelRed: Boolean(r.labelRed),
      mark: r.mark,
      codes: [...r.codes],
    }));

  const cloneAnnoCols = (cols: BuilderAnnoCol[]): BuilderAnnoCol[] =>
    cols.map((c) => ({ id: c.id, header: c.header, visible: Boolean(c.visible), width: Number(c.width) || 0 }));

  const cloneOverlays = (overlays: OverlayShape[]): OverlayShape[] => overlays.map((o) => ({ ...(o as Record<string, unknown>) } as OverlayShape));

  const normalizeBuilderRows = (rows: BuilderRow[], markers: number, annoCols: BuilderAnnoCol[]): BuilderRow[] =>
    rows.map((r) => {
      const codes = r.codes.slice(0, markers);
      while (codes.length < markers) codes.push("-");
      const annotations0 = Array.isArray(r.annotations) ? r.annotations : splitAnnoColumnsText(r.rightLabel || "");
      const annotations = normalizeAnnoValues(annotations0, Math.max(1, annoCols.length));
      const rightLabel = buildVisibleAnnoText(annotations, annoCols) || r.rightLabel || r.sample;
      return { ...r, codes, annotations, rightLabel };
    });

  const builderStateRef = useRef<{ markers: number; rows: BuilderRow[]; markerMeta: MarkerInfo[]; scaleByPosition: boolean }>({
    markers: builderMarkers,
    rows: builderRows,
    markerMeta: builderMarkerMeta,
    scaleByPosition: builderScaleByPos,
  });
  useEffect(() => {
    builderStateRef.current = { markers: builderMarkers, rows: builderRows, markerMeta: builderMarkerMeta, scaleByPosition: builderScaleByPos };
  }, [builderMarkers, builderRows, builderMarkerMeta, builderScaleByPos]);

  const builderRenderOptsRef = useRef<{
    paletteId: string;
    theme: "dark" | "light";
    compressRuns: boolean;
    canvasWidth: number;
    annotationWidth: number;
    rowHeight: number;
    rowGap: number;
    baseName: string;
    leftLabels: boolean;
    showMarkerAxis: boolean;
    guides: boolean;
    guideMode: "centers" | "boundaries";
    headerLeft: string;
    headerRight: string;
    posUnit: string;
    figureMode: BuilderFigureMode;
    chrLabel: string;
    chrLenMb: number;
    coarseMarkersDraft: string;
    zoomStages: BuilderZoomStages;
	    chrZoomStartMb: number;
	    chrZoomEndMb: number;
	    coarseZoomStartMb: number;
	    coarseZoomEndMb: number;
	    faLabel: string;
	    locusLabelText: string;
	    arrowLabel: string;
	    arrowLabelAuto: boolean;
	    arrowStartMb: number;
	    arrowEndMb: number;
	    arrowOffsetX: number;
	    arrowOffsetY: number;
	    arrowLabelDx: number;
	    arrowLabelDy: number;
	    figureTitle: string;
	    genoLegendA: string;
    genoLegendB: string;
    genoLegendH: string;
    highlightMarkers: string;
  }>({
    paletteId: builderPaletteId,
    theme: builderTheme,
    compressRuns: builderCompressRuns,
    canvasWidth: builderCanvasWidth,
    annotationWidth: builderAnnotationWidth,
    rowHeight: builderRowHeight,
    rowGap: builderRowGap,
    baseName,
    leftLabels: builderLeftLabels,
    showMarkerAxis: builderShowMarkerAxis,
    guides: builderGuides,
    guideMode: builderGuideMode,
    headerLeft: builderHeaderLeft,
    headerRight: builderHeaderRight,
    posUnit: builderPosUnit,
    figureMode: builderFigureMode,
    chrLabel: builderChrLabel,
    chrLenMb: builderChrLenMb,
    coarseMarkersDraft: builderCoarseMarkersDraft,
    zoomStages: builderZoomStages,
	    chrZoomStartMb: builderChrZoomStartMb,
	    chrZoomEndMb: builderChrZoomEndMb,
	    coarseZoomStartMb: builderCoarseZoomStartMb,
	    coarseZoomEndMb: builderCoarseZoomEndMb,
	    faLabel: builderFaLabel,
	    locusLabelText: builderLocusLabelText,
	    arrowLabel: builderArrowLabel,
	    arrowLabelAuto: builderArrowLabelAuto,
	    arrowStartMb: builderArrowStartMb,
	    arrowEndMb: builderArrowEndMb,
	    arrowOffsetX: builderArrowOffsetX,
	    arrowOffsetY: builderArrowOffsetY,
	    arrowLabelDx: builderArrowLabelDx,
	    arrowLabelDy: builderArrowLabelDy,
	    figureTitle: builderFigureTitle,
    genoLegendA: builderGenoLegendA,
    genoLegendB: builderGenoLegendB,
    genoLegendH: builderGenoLegendH,
    highlightMarkers: builderHighlightMarkers,
  });
  useEffect(() => {
    builderRenderOptsRef.current = {
      paletteId: builderPaletteId,
      theme: builderTheme,
      compressRuns: builderCompressRuns,
      canvasWidth: builderCanvasWidth,
      annotationWidth: builderAnnotationWidth,
      rowHeight: builderRowHeight,
      rowGap: builderRowGap,
      baseName,
      leftLabels: builderLeftLabels,
      showMarkerAxis: builderShowMarkerAxis,
      guides: builderGuides,
      guideMode: builderGuideMode,
      headerLeft: builderHeaderLeft,
      headerRight: builderHeaderRight,
      posUnit: builderPosUnit,
      figureMode: builderFigureMode,
      chrLabel: builderChrLabel,
      chrLenMb: builderChrLenMb,
      coarseMarkersDraft: builderCoarseMarkersDraft,
      zoomStages: builderZoomStages,
	      chrZoomStartMb: builderChrZoomStartMb,
	      chrZoomEndMb: builderChrZoomEndMb,
	      coarseZoomStartMb: builderCoarseZoomStartMb,
	      coarseZoomEndMb: builderCoarseZoomEndMb,
	      faLabel: builderFaLabel,
	      locusLabelText: builderLocusLabelText,
	      arrowLabel: builderArrowLabel,
	      arrowLabelAuto: builderArrowLabelAuto,
	      arrowStartMb: builderArrowStartMb,
	      arrowEndMb: builderArrowEndMb,
	      arrowOffsetX: builderArrowOffsetX,
	      arrowOffsetY: builderArrowOffsetY,
	      arrowLabelDx: builderArrowLabelDx,
	      arrowLabelDy: builderArrowLabelDy,
	      figureTitle: builderFigureTitle,
      genoLegendA: builderGenoLegendA,
      genoLegendB: builderGenoLegendB,
      genoLegendH: builderGenoLegendH,
      highlightMarkers: builderHighlightMarkers,
    };
  }, [
    builderPaletteId,
    builderTheme,
    builderCompressRuns,
    builderCanvasWidth,
    builderAnnotationWidth,
    builderRowHeight,
    builderRowGap,
    baseName,
    builderLeftLabels,
    builderShowMarkerAxis,
    builderGuides,
    builderGuideMode,
    builderHeaderLeft,
    builderHeaderRight,
    builderPosUnit,
    builderFigureMode,
    builderChrLabel,
    builderChrLenMb,
    builderCoarseMarkersDraft,
    builderZoomStages,
    builderChrZoomStartMb,
    builderChrZoomEndMb,
	    builderCoarseZoomStartMb,
	    builderCoarseZoomEndMb,
	    builderFaLabel,
	    builderLocusLabelText,
	    builderArrowLabel,
	    builderArrowLabelAuto,
	    builderArrowStartMb,
	    builderArrowEndMb,
	    builderArrowOffsetX,
	    builderArrowOffsetY,
	    builderArrowLabelDx,
	    builderArrowLabelDy,
	    builderFigureTitle,
    builderGenoLegendA,
    builderGenoLegendB,
    builderGenoLegendH,
    builderHighlightMarkers,
  ]);

  const undoStackRef = useRef<BuilderSnapshot[]>([]);
  const redoStackRef = useRef<BuilderSnapshot[]>([]);
  const [undoSize, setUndoSize] = useState<number>(0);
  const [redoSize, setRedoSize] = useState<number>(0);

  const snapshotBuilder = (): BuilderSnapshot => ({
    markers: builderStateRef.current.markers,
    rows: cloneBuilderRows(builderStateRef.current.rows),
    markerMeta: (builderStateRef.current.markerMeta || []).map((m) => ({ ...m })),
    scaleByPosition: builderStateRef.current.scaleByPosition,
    userOverlays: cloneOverlays(builderUserOverlaysRef.current || []),
    annoCols: cloneAnnoCols(builderAnnoCols),
    headerLeft: builderHeaderLeft,
    headerRight: builderHeaderRight,
  });

  const pushUndo = (snap: BuilderSnapshot): void => {
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 60) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoSize(undoStackRef.current.length);
    setRedoSize(0);
  };

  const applyBuilderSnapshot = (snap: BuilderSnapshot): void => {
    const markers = Math.min(500, Math.max(3, Math.round(snap.markers)));
    const annoColsIn = Array.isArray(snap.annoCols) && snap.annoCols.length ? snap.annoCols : cloneAnnoCols(builderAnnoCols);
    const annoCols = annoColsIn
      .filter((v) => v && typeof v === "object")
      .map((v) => {
        const header = String((v as { header?: unknown }).header ?? "").trim();
        const visible = Boolean((v as { visible?: unknown }).visible ?? true);
        const widthRaw = Number((v as { width?: unknown }).width ?? 0);
        const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.round(widthRaw) : 0;
        return { id: makeId(), header, visible, width } satisfies BuilderAnnoCol;
      });
    if (annoCols.length === 0) {
      annoCols.push({ id: makeId(), header: "Value", visible: true, width: 0 });
    }
    if (!annoCols.some((c) => c.visible)) annoCols[0].visible = true;
    const rows = normalizeBuilderRows(cloneBuilderRows(snap.rows), markers, annoCols);
    const metaIn = Array.isArray(snap.markerMeta) ? snap.markerMeta : [];
      const meta = metaIn
        .map((m, i) => {
          const name = String(m?.name ?? "").trim() || `m${i + 1}`;
          const chr = String(m?.chr ?? "").trim() || undefined;
          const posNum = Number((m as { pos?: unknown })?.pos);
          const pos = Number.isFinite(posNum) ? posNum : undefined;
          return { name, chr, pos };
        })
        .slice(0, markers);
    while (meta.length < markers) meta.push({ name: `m${meta.length + 1}`, chr: undefined, pos: undefined });
    setBuilderAnnoCols(annoCols);
    setBuilderHeaderLeft(String(snap.headerLeft ?? builderHeaderLeft));
    setBuilderHeaderRight(String(snap.headerRight ?? builderHeaderRight));
    setBuilderMarkers(markers);
    setBuilderRows(rows);
    setBuilderMarkerMeta(meta);
    setBuilderScaleByPos(Boolean(snap.scaleByPosition));
    setBuilderUserOverlays(Array.isArray(snap.userOverlays) ? cloneOverlays(snap.userOverlays) : []);
  };

  const doUndoBuilder = (): void => {
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    redoStackRef.current.push(snapshotBuilder());
    if (redoStackRef.current.length > 60) redoStackRef.current.shift();
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    applyBuilderSnapshot(snap);
  };

  const doRedoBuilder = (): void => {
    const snap = redoStackRef.current.pop();
    if (!snap) return;
    undoStackRef.current.push(snapshotBuilder());
    if (undoStackRef.current.length > 60) undoStackRef.current.shift();
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    applyBuilderSnapshot(snap);
  };

  const withBuilderUndo = (fn: () => void): void => {
    pushUndo(snapshotBuilder());
    fn();
  };

  const findUserOverlayById = (id: string): OverlayShape | undefined =>
    builderUserOverlays.find((o) => (o as { id?: unknown }).id === id);

  const updateUserOverlay = (id: string, updater: (o: OverlayShape) => OverlayShape): void => {
    setBuilderUserOverlays((prev) => prev.map((o) => ((o as { id?: unknown }).id === id ? updater(o) : o)));
  };

  const updateSelectedOverlay = (updater: (o: OverlayShape) => OverlayShape): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    withBuilderUndo(() => updateUserOverlay(id, updater));
  };

  const deleteSelectedOverlay = (): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    if (!findUserOverlayById(id)) {
      setBuilderSelectedOverlayId(null);
      return;
    }
    withBuilderUndo(() => setBuilderUserOverlays((prev) => prev.filter((o) => (o as { id?: unknown }).id !== id)));
    setBuilderSelectedOverlayId(null);
  };

  const duplicateSelectedOverlay = (): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    const src = findUserOverlayById(id);
    if (!src) return;
    const newId = `user:${makeId()}`;
    const offset = 20;
    const kind = (src as { kind?: unknown }).kind;
    const copy = { ...(src as Record<string, unknown>), id: newId } as OverlayShape;
    const moved: OverlayShape =
      kind === "rect"
        ? ({
          ...(copy as OverlayShape & { kind: "rect" }),
          x: (copy as OverlayShape & { kind: "rect" }).x + offset,
          y: (copy as OverlayShape & { kind: "rect" }).y + offset,
        } satisfies OverlayShape)
        : kind === "text"
          ? ({
            ...(copy as OverlayShape & { kind: "text" }),
            x: (copy as OverlayShape & { kind: "text" }).x + offset,
            y: (copy as OverlayShape & { kind: "text" }).y + offset,
          } satisfies OverlayShape)
          : kind === "line"
            ? ({
              ...(copy as OverlayShape & { kind: "line" }),
              x1: (copy as OverlayShape & { kind: "line" }).x1 + offset,
              y1: (copy as OverlayShape & { kind: "line" }).y1 + offset,
              x2: (copy as OverlayShape & { kind: "line" }).x2 + offset,
              y2: (copy as OverlayShape & { kind: "line" }).y2 + offset,
            } satisfies OverlayShape)
            : copy;
    withBuilderUndo(() => setBuilderUserOverlays((prev) => [...prev, moved]));
    setBuilderSelectedOverlayId(newId);
  };

  const nudgeSelectedOverlay = (dx: number, dy: number): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    const snap = (v: number): number => (builderObjectSnap ? Math.round(v / 5) * 5 : v);
    withBuilderUndo(() =>
      setBuilderUserOverlays((prev) =>
        prev.map((o) => {
          const oid = (o as { id?: unknown }).id;
          if (oid !== id) return o;
          const kind = (o as { kind?: unknown }).kind;
          if (kind === "rect") {
            const r = o as OverlayShape & { kind: "rect" };
            return { ...r, x: snap(r.x + dx), y: snap(r.y + dy) };
          }
          if (kind === "text") {
            const t = o as OverlayShape & { kind: "text" };
            return { ...t, x: snap(t.x + dx), y: snap(t.y + dy) };
          }
          if (kind === "line") {
            const l = o as OverlayShape & { kind: "line" };
            return { ...l, x1: snap(l.x1 + dx), y1: snap(l.y1 + dy), x2: snap(l.x2 + dx), y2: snap(l.y2 + dy) };
          }
          return o;
        }),
      ),
    );
  };

  const copySelectedOverlay = (): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    const src = findUserOverlayById(id);
    if (!src) return;
    builderOverlayClipboardRef.current = { ...(src as Record<string, unknown>) } as OverlayShape;
    setMessage("オブジェクトをコピーしました（Ctrl+V で貼り付け）。");
  };

  const pasteOverlay = (): void => {
    const src = builderOverlayClipboardRef.current;
    if (!src) return;
    const id = `user:${makeId()}`;
    const offset = 20;
    const copy = { ...(src as Record<string, unknown>), id } as OverlayShape;
    const kind = (copy as { kind?: unknown }).kind;
    const moved: OverlayShape =
      kind === "rect"
        ? ({ ...(copy as OverlayShape & { kind: "rect" }), x: (copy as OverlayShape & { kind: "rect" }).x + offset, y: (copy as OverlayShape & { kind: "rect" }).y + offset } satisfies OverlayShape)
        : kind === "text"
          ? ({ ...(copy as OverlayShape & { kind: "text" }), x: (copy as OverlayShape & { kind: "text" }).x + offset, y: (copy as OverlayShape & { kind: "text" }).y + offset } satisfies OverlayShape)
          : kind === "line"
            ? ({
              ...(copy as OverlayShape & { kind: "line" }),
              x1: (copy as OverlayShape & { kind: "line" }).x1 + offset,
              y1: (copy as OverlayShape & { kind: "line" }).y1 + offset,
              x2: (copy as OverlayShape & { kind: "line" }).x2 + offset,
              y2: (copy as OverlayShape & { kind: "line" }).y2 + offset,
            } satisfies OverlayShape)
            : copy;
    withBuilderUndo(() => setBuilderUserOverlays((prev) => [...prev, moved]));
    setBuilderSelectedOverlayId(id);
  };

  const moveSelectedOverlayLayer = (to: "front" | "back"): void => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    withBuilderUndo(() =>
      setBuilderUserOverlays((prev) => {
        const idx = prev.findIndex((o) => (o as { id?: unknown }).id === id);
        if (idx < 0) return prev;
        const next = [...prev];
        const [item] = next.splice(idx, 1);
        if (to === "front") next.push(item);
        else next.unshift(item);
        return next;
      }),
    );
  };

  const cancelOverlayDraft = (): void => {
    setBuilderDraftOverlay(null);
    builderOverlayDragRef.current = null;
  };

  const clearOverlaySelection = (): void => setBuilderSelectedOverlayId(null);

  const exitObjectMode = (): void => {
    setBuilderObjectMode(false);
    setBuilderDraftOverlay(null);
    builderOverlayDragRef.current = null;
    setBuilderSelectedOverlayId(null);
  };

  const addBuilderRow = (): void => {
    withBuilderUndo(() => ensureBuilderRowCount(builderRows.length + 1));
  };

  const removeBuilderLastRow = (): void => {
    if (builderRows.length <= 1) return;
    withBuilderUndo(() => ensureBuilderRowCount(builderRows.length - 1));
  };

  const parseBuilderRowBulkText = (text: string): Array<{ sample: string; rightLabel?: string }> =>
    text
      .split(/\r?\n/g)
      .map((v) => v.replace(/\r/g, ""))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith("#"))
      .map((line) => {
        const cols = line.split(/\t|,/g).map((v) => v.trim());
        const sample = String(cols[0] || "").trim();
        const rightCols = cols.slice(1);
        while (rightCols.length && !String(rightCols[rightCols.length - 1] ?? "").trim()) rightCols.pop();
        const rightLabel = rightCols.join("\t").trim();
        return { sample, rightLabel: rightLabel ? rightLabel : undefined };
      })
      .filter((v) => v.sample.length > 0);

  const applyBuilderRowBulkFromTop = (): void => {
    const entries = parseBuilderRowBulkText(builderRowBulkDraft);
    if (!entries.length) return;
    const maxColsIn = Math.max(
      1,
      ...entries.map((e) => (e.rightLabel ? splitAnnoColumnsText(e.rightLabel).length : 1)),
    );
    const nextAnnoCols: BuilderAnnoCol[] =
      maxColsIn > builderAnnoCols.length
        ? [
          ...builderAnnoCols,
          ...Array.from({ length: maxColsIn - builderAnnoCols.length }, (_, i) => ({
            id: makeId(),
            header: `Col${builderAnnoCols.length + i + 1}`,
            visible: true,
            width: 0,
          })),
        ]
        : builderAnnoCols;
    const truncated = entries.length > MAX_BUILDER_ROWS;
    withBuilderUndo(() =>
      (() => {
        setBuilderAnnoCols(nextAnnoCols);
        setBuilderRows((prev) => {
          const out = [...prev];
          while (out.length < Math.min(MAX_BUILDER_ROWS, entries.length)) {
            const idx = out.length + 1;
            const sample = `R${idx}`;
            out.push({
              id: makeId(),
              sample,
              rightLabel: sample,
              annotations: normalizeAnnoValues([sample], Math.max(1, nextAnnoCols.length)),
              labelRed: false,
              mark: "none",
              codes: Array.from({ length: builderMarkers }, () => "-"),
            });
          }
          const n = Math.min(out.length, entries.length);
          for (let i = 0; i < n; i += 1) {
            const row = out[i];
            const nextSample = entries[i].sample;
            const providedRight = entries[i].rightLabel;
            const providedAnno = providedRight ? normalizeAnnoValues(splitAnnoColumnsText(providedRight), Math.max(1, nextAnnoCols.length)) : null;
            const shouldSync = !buildVisibleAnnoText(row.annotations, nextAnnoCols).trim() || row.sample.trim() === buildVisibleAnnoText(row.annotations, nextAnnoCols).trim();
            const annotations = providedAnno
              ? providedAnno
              : shouldSync
                ? (() => {
                  const base = normalizeAnnoValues(row.annotations, Math.max(1, nextAnnoCols.length));
                  base[0] = nextSample;
                  return base;
                })()
                : normalizeAnnoValues(row.annotations, Math.max(1, nextAnnoCols.length));
            out[i] = {
              ...row,
              sample: nextSample,
              annotations,
              rightLabel: buildVisibleAnnoText(annotations, nextAnnoCols) || nextSample,
            };
          }
          return out.slice(0, MAX_BUILDER_ROWS);
        });
      })(),
    );
    if (truncated) setMessage(`Rows は最大 ${MAX_BUILDER_ROWS} までです（超過分は無視しました）。`);
    setBuilderGridRowStart(0);
  };

  const appendBuilderRowsFromBulk = (): void => {
    const entries = parseBuilderRowBulkText(builderRowBulkDraft);
    if (!entries.length) return;
    const maxColsIn = Math.max(
      1,
      ...entries.map((e) => (e.rightLabel ? splitAnnoColumnsText(e.rightLabel).length : 1)),
    );
    const nextAnnoCols: BuilderAnnoCol[] =
      maxColsIn > builderAnnoCols.length
        ? [
          ...builderAnnoCols,
          ...Array.from({ length: maxColsIn - builderAnnoCols.length }, (_, i) => ({
            id: makeId(),
            header: `Col${builderAnnoCols.length + i + 1}`,
            visible: true,
            width: 0,
          })),
        ]
        : builderAnnoCols;
    const curLen = builderRows.length;
    const canAdd = Math.max(0, MAX_BUILDER_ROWS - curLen);
    const willAdd = Math.min(entries.length, canAdd);
    const truncated = entries.length > willAdd;
    withBuilderUndo(() =>
      (() => {
        setBuilderAnnoCols(nextAnnoCols);
        setBuilderRows((prev) => {
          const out = [...normalizeBuilderRows(prev, builderMarkers, nextAnnoCols)];
        for (const e of entries) {
          if (out.length >= MAX_BUILDER_ROWS) break;
          const sample = e.sample;
          const annotations0 = e.rightLabel ? splitAnnoColumnsText(e.rightLabel) : [sample];
          const annotations = normalizeAnnoValues(annotations0, Math.max(1, nextAnnoCols.length));
          const rightLabel = buildVisibleAnnoText(annotations, nextAnnoCols) || sample;
          out.push({
            id: makeId(),
            sample,
            rightLabel,
            annotations,
            labelRed: false,
            mark: "none",
            codes: Array.from({ length: builderMarkers }, () => "-"),
          });
        }
        return out;
        });
      })(),
    );
    if (truncated) setMessage(`Rows は最大 ${MAX_BUILDER_ROWS} までです（超過分は無視しました）。`);
    const count = Math.max(1, Math.round(builderGridRowCount) || 1);
    const nextLen = curLen + willAdd;
    setBuilderGridRowStart(Math.max(0, nextLen - count));
  };

  const clearAllBuilder = (): void => {
    withBuilderUndo(() =>
      setBuilderRows((prev) =>
        prev.map((r) => ({
          ...r,
          codes: Array.from({ length: builderMarkers }, () => "-"),
        })),
      ),
    );
  };

  const setRightLabelsToNames = (): void => {
    const colsN = Math.max(1, builderAnnoCols.length);
    withBuilderUndo(() =>
      setBuilderRows((prev) =>
        prev.map((r) => {
          const annotations = normalizeAnnoValues(r.annotations, colsN);
          annotations[0] = r.sample;
          const rightLabel = buildVisibleAnnoText(annotations, builderAnnoCols) || r.sample;
          return { ...r, annotations, rightLabel };
        }),
      ),
    );
  };

  const setBuilderRowSample = (rIdx: number, nextSample: string): void => {
    setBuilderRows((prev) =>
      prev.map((v, i) => {
        if (i !== rIdx) return v;
        const colsN = Math.max(1, builderAnnoCols.length);
        const annotations = normalizeAnnoValues(v.annotations, colsN);
        const visibleText = buildVisibleAnnoText(annotations, builderAnnoCols).trim();
        const shouldSync = !visibleText || visibleText === v.sample.trim();
        if (shouldSync) annotations[0] = nextSample;
        const rightLabel = buildVisibleAnnoText(annotations, builderAnnoCols) || nextSample;
        return { ...v, sample: nextSample, annotations, rightLabel };
      }),
    );
  };

  const setBuilderRowAnnotations = (rIdx: number, updater: (prev: string[]) => string[]): void => {
    setBuilderRows((prev) =>
      prev.map((v, i) => {
        if (i !== rIdx) return v;
        const colsN = Math.max(1, builderAnnoCols.length);
        const base = normalizeAnnoValues(v.annotations, colsN);
        const next = normalizeAnnoValues(updater(base), colsN);
        const rightLabel = buildVisibleAnnoText(next, builderAnnoCols) || v.sample;
        return { ...v, annotations: next, rightLabel };
      }),
    );
  };

  const setBuilderRowAnnotationValue = (rIdx: number, colIdx: number, value: string): void => {
    setBuilderRowAnnotations(rIdx, (prev) => {
      const out = [...prev];
      if (colIdx < 0 || colIdx >= out.length) return out;
      out[colIdx] = value;
      return out;
    });
  };

  const setBuilderRowRightLabel = (rIdx: number, nextLabel: string): void => {
    const provided = splitAnnoColumnsText(nextLabel);
    const visibleIdxs = builderAnnoCols.map((c, i) => (c.visible ? i : -1)).filter((v) => v >= 0);
    setBuilderRowAnnotations(rIdx, (prev) => {
      const out = [...prev];
      if (visibleIdxs.length === 0) visibleIdxs.push(0);
      for (let j = 0; j < visibleIdxs.length; j += 1) {
        const idx = visibleIdxs[j];
        out[idx] = String(provided[j] ?? "").trim();
      }
      return out;
    });
  };

  const deriveBuilderHeaderLeft = (cols: BuilderAnnoCol[]): string => {
    const headers = cols
      .filter((c) => c.visible)
      .map((c) => String(c.header ?? "").trim())
      .filter((v) => v.length > 0);
    return headers.join(" | ");
  };

  const applyBuilderAnnoCols = (nextColsRaw: BuilderAnnoCol[], transformRows?: (rows: BuilderRow[]) => BuilderRow[]): void => {
    const colsIn = nextColsRaw
      .filter((v) => v && typeof v === "object")
      .map((v) => {
        const header = String((v as { header?: unknown }).header ?? "").trim();
        const visible = Boolean((v as { visible?: unknown }).visible ?? true);
        const widthRaw = Number((v as { width?: unknown }).width ?? 0);
        const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.round(widthRaw) : 0;
        return { id: makeId(), header, visible, width } satisfies BuilderAnnoCol;
      });
    const cols = colsIn.length ? colsIn : [{ id: makeId(), header: "Value", visible: true, width: 0 }];
    if (!cols.some((c) => c.visible)) cols[0].visible = true;
    setBuilderAnnoCols(cols);
    const nextHeaderLeft = deriveBuilderHeaderLeft(cols);
    if (nextHeaderLeft) setBuilderHeaderLeft(nextHeaderLeft);
    setBuilderRows((prev) => normalizeBuilderRows(transformRows ? transformRows(prev) : prev, builderMarkers, cols));
  };

  const addBuilderAnnoCol = (): void => {
    withBuilderUndo(() =>
      applyBuilderAnnoCols([
        ...builderAnnoCols,
        { id: makeId(), header: `Col${builderAnnoCols.length + 1}`, visible: true, width: 0 },
      ]),
    );
  };

  const deleteBuilderAnnoCol = (idx: number): void => {
    if (builderAnnoCols.length <= 1) return;
    withBuilderUndo(() =>
      applyBuilderAnnoCols(
        builderAnnoCols.filter((_, i) => i !== idx),
        (rows) =>
          rows.map((r) => ({
            ...r,
            annotations: normalizeAnnoValues(r.annotations, Math.max(1, builderAnnoCols.length)).filter((_, i) => i !== idx),
          })),
      ),
    );
  };

  const moveBuilderAnnoCol = (idx: number, dir: -1 | 1): void => {
    const j = idx + dir;
    if (idx < 0 || idx >= builderAnnoCols.length) return;
    if (j < 0 || j >= builderAnnoCols.length) return;
    const nextCols = builderAnnoCols.slice();
    [nextCols[idx], nextCols[j]] = [nextCols[j], nextCols[idx]];
    withBuilderUndo(() =>
      applyBuilderAnnoCols(nextCols, (rows) =>
        rows.map((r) => {
          const base = normalizeAnnoValues(r.annotations, Math.max(1, builderAnnoCols.length));
          [base[idx], base[j]] = [base[j], base[idx]];
          return { ...r, annotations: base };
        }),
      ),
    );
  };

  const setBuilderAnnoColHeader = (idx: number, header: string): void => {
    applyBuilderAnnoCols(builderAnnoCols.map((c, i) => (i === idx ? { ...c, header } : c)));
  };

  const setBuilderAnnoColVisible = (idx: number, visible: boolean): void => {
    const next = builderAnnoCols.map((c, i) => (i === idx ? { ...c, visible } : c));
    if (!next.some((c) => c.visible)) next[0].visible = true;
    withBuilderUndo(() => applyBuilderAnnoCols(next));
  };

  const setBuilderAnnoColWidth = (idx: number, width: number): void => {
    const w = Number.isFinite(width) && width > 0 ? Math.min(1200, Math.max(22, Math.round(width))) : 0;
    applyBuilderAnnoCols(builderAnnoCols.map((c, i) => (i === idx ? { ...c, width: w } : c)));
  };

  const setBuilderRowLabelRed = (rIdx: number, next: boolean): void => {
    setBuilderRows((prev) => prev.map((v, i) => (i === rIdx ? { ...v, labelRed: next } : v)));
  };

  const setBuilderRowMark = (rIdx: number, next: BuilderMark): void => {
    setBuilderRows((prev) => prev.map((v, i) => (i === rIdx ? { ...v, mark: next } : v)));
  };

  const fmtBuilderPos = (v: number | undefined): string => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const s = n.toFixed(n % 1 === 0 ? 0 : 2);
    return s.replace(/(\.\d*?)0+$/g, "$1").replace(/\.$/g, "");
  };

  const builderCanvasEditInitialValue = (target: BuilderCanvasEditTarget): string => {
    switch (target.kind) {
      case "sample": {
        const row = typeof target.rIdx === "number" ? builderRows[target.rIdx] : undefined;
        return row?.sample ?? "";
      }
      case "rightLabel": {
        const row = typeof target.rIdx === "number" ? builderRows[target.rIdx] : undefined;
        return row?.rightLabel ?? "";
      }
      case "figureTitle":
        return builderFigureTitle;
      case "chrLabel":
        return builderChrLabel;
      case "headerLeft":
        return builderHeaderLeft;
      case "headerRight":
        return builderHeaderRight;
      case "posUnit":
        return builderPosUnit;
      case "faLabel":
        return builderFaLabel;
      case "locusLabelText":
        return builderLocusLabelText;
      case "arrowLabel":
        return builderArrowLabelAuto ? builderArrowLabelAutoPreview : builderArrowLabel;
      case "genoLegendA":
        return builderGenoLegendA;
      case "genoLegendB":
        return builderGenoLegendB;
      case "genoLegendH":
        return builderGenoLegendH;
      case "detailMarkerName": {
        const idx = typeof target.cIdx === "number" ? target.cIdx : -1;
        const m = builderMarkerMeta[idx];
        return String(m?.name ?? "").trim() || `m${idx + 1}`;
      }
      case "detailMarkerPos": {
        const idx = typeof target.cIdx === "number" ? target.cIdx : -1;
        const m = builderMarkerMeta[idx];
        return fmtBuilderPos(Number.isFinite(m?.pos ?? Number.NaN) ? (m.pos as number) : undefined);
      }
      case "coarseMarkerName": {
        const idx = typeof target.mIdx === "number" ? target.mIdx : -1;
        const ms = parseCoarseMarkersText(builderCoarseMarkersDraft);
        return ms[idx]?.name ?? "";
      }
      case "coarseMarkerPos": {
        const idx = typeof target.mIdx === "number" ? target.mIdx : -1;
        const ms = parseCoarseMarkersText(builderCoarseMarkersDraft);
        return fmtBuilderPos(ms[idx]?.pos);
      }
    }
  };

  const openBuilderCanvasEditAt = (target: BuilderCanvasEditTarget, e: React.PointerEvent<HTMLDivElement>): void => {
    const container = e.currentTarget;
    const box = container.getBoundingClientRect();
    let x = e.clientX - box.left + container.scrollLeft + 12;
    let y = e.clientY - box.top + container.scrollTop + 12;
    // Clamp popup within container bounds (popup width ~300px, height ~180px)
    const popupW = 320;
    const popupH = 200;
    const maxX = container.scrollWidth - popupW - 8;
    const maxY = container.scrollHeight - popupH - 8;
    x = Math.max(8, Math.min(x, maxX));
    y = Math.max(8, Math.min(y, maxY));
    const value = builderCanvasEditInitialValue(target);
    setBuilderCanvasEdit({ ...target, x, y, value });
  };

  const commitBuilderCanvasEdit = (): void => {
    const edit = builderCanvasEdit;
    if (!edit) return;
    const value = edit.value;
    if (edit.kind === "sample") {
      const rIdx = typeof edit.rIdx === "number" ? edit.rIdx : -1;
      const row = builderRows[rIdx];
      if (row && row.sample !== value) withBuilderUndo(() => setBuilderRowSample(rIdx, value));
    } else if (edit.kind === "rightLabel") {
      const rIdx = typeof edit.rIdx === "number" ? edit.rIdx : -1;
      const row = builderRows[rIdx];
      if (row && row.rightLabel !== value) withBuilderUndo(() => setBuilderRowRightLabel(rIdx, value));
    } else if (edit.kind === "figureTitle") {
      if (builderFigureTitle !== value) setBuilderFigureTitle(value);
    } else if (edit.kind === "chrLabel") {
      if (builderChrLabel !== value) setBuilderChrLabel(value);
    } else if (edit.kind === "headerLeft") {
      const headers = splitAnnoColumnsText(value).map((v) => v.trim());
      const nextHeaders = headers.length ? headers : [value.trim() || "Value"];
      const nextCols: BuilderAnnoCol[] = [...builderAnnoCols];
      while (nextCols.length < nextHeaders.length) {
        nextCols.push({ id: makeId(), header: `Col${nextCols.length + 1}`, visible: true, width: 0 });
      }
      for (let i = 0; i < nextCols.length; i += 1) {
        if (i < nextHeaders.length) nextCols[i] = { ...nextCols[i], header: nextHeaders[i], visible: true };
        else nextCols[i] = { ...nextCols[i], visible: false };
      }
      applyBuilderAnnoCols(nextCols);
    } else if (edit.kind === "headerRight") {
      if (builderHeaderRight !== value) setBuilderHeaderRight(value);
    } else if (edit.kind === "posUnit") {
      const raw = value.trim();
      const cleaned = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1).trim() : raw;
      if (builderPosUnit !== cleaned) setBuilderPosUnit(cleaned);
    } else if (edit.kind === "faLabel") {
      if (builderFaLabel !== value) setBuilderFaLabel(value);
    } else if (edit.kind === "locusLabelText") {
      if (builderLocusLabelText !== value) setBuilderLocusLabelText(value);
    } else if (edit.kind === "arrowLabel") {
      if (builderArrowLabelAuto) setBuilderArrowLabelAuto(false);
      if (builderArrowLabel !== value) setBuilderArrowLabel(value);
    } else if (edit.kind === "genoLegendA") {
      if (builderGenoLegendA !== value) setBuilderGenoLegendA(value);
    } else if (edit.kind === "genoLegendB") {
      if (builderGenoLegendB !== value) setBuilderGenoLegendB(value);
    } else if (edit.kind === "genoLegendH") {
      if (builderGenoLegendH !== value) setBuilderGenoLegendH(value);
    } else if (edit.kind === "detailMarkerName") {
      const cIdx = typeof edit.cIdx === "number" ? edit.cIdx : -1;
      if (cIdx >= 0 && cIdx < builderMarkers) {
        const cur = String(builderMarkerMeta[cIdx]?.name ?? "").trim() || `m${cIdx + 1}`;
        if (cur !== value) withBuilderUndo(() => setBuilderMarkerName(cIdx, value));
      }
    } else if (edit.kind === "detailMarkerPos") {
      const cIdx = typeof edit.cIdx === "number" ? edit.cIdx : -1;
      if (cIdx >= 0 && cIdx < builderMarkers) {
        const trimmed = value.trim();
        const next = trimmed.length === 0 ? undefined : Number(trimmed);
        const nextPos = Number.isFinite(next) ? next : undefined;
        const curRaw = builderMarkerMeta[cIdx]?.pos;
        const curPos = Number.isFinite(curRaw ?? Number.NaN) ? (curRaw as number) : undefined;
        if (curPos !== nextPos) withBuilderUndo(() => setBuilderMarkerPos(cIdx, nextPos));
      }
    } else if (edit.kind === "coarseMarkerName" || edit.kind === "coarseMarkerPos") {
      const mIdx = typeof edit.mIdx === "number" ? edit.mIdx : -1;
      if (mIdx >= 0) {
        // axis表示はpos順に並ぶため、入力順のdraft行と一致しない。name/pos を元に最も近い行を更新。
        const coarseMarkers = parseCoarseMarkersText(builderCoarseMarkersDraft);
        const ref = coarseMarkers[mIdx];
        const rows = parseCoarseMarkersDraftRows(builderCoarseMarkersDraft);
        let bestIdx = -1;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i];
          const rName = (r.name || "").trim();
          const rPos = Number(r.pos);
          if (ref && rName && rName !== ref.name) continue;
          const d = ref && Number.isFinite(rPos) ? Math.abs(rPos - ref.pos) : 0;
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        if (bestIdx < 0 && rows.length) bestIdx = Math.min(rows.length - 1, Math.max(0, mIdx));
        if (bestIdx >= 0) {
          if (edit.kind === "coarseMarkerName") updateCoarseMarkerRow(bestIdx, { name: value });
          else updateCoarseMarkerRow(bestIdx, { pos: value });
        }
      }
    }
    setBuilderCanvasEdit(null);
  };

  const cancelBuilderCanvasEdit = (): void => setBuilderCanvasEdit(null);

  useEffect(() => {
    if (tab !== "builder" || builderEditMode !== "preview") setBuilderCanvasEdit(null);
  }, [tab, builderEditMode]);

  useEffect(() => {
    if (tab === "builder" && builderEditMode === "preview") return;
    setBuilderObjectMode(false);
    setBuilderDraftOverlay(null);
    builderOverlayDragRef.current = null;
    setBuilderSelectedOverlayId(null);
  }, [tab, builderEditMode]);

  useEffect(() => {
    if (builderObjectMode) return;
    setBuilderDraftOverlay(null);
    builderOverlayDragRef.current = null;
    setBuilderSelectedOverlayId(null);
  }, [builderObjectMode]);

  useEffect(() => {
    const id = (builderSelectedOverlayId || "").trim();
    if (!id) return;
    if (builderUserOverlays.some((o) => (o as { id?: unknown }).id === id)) return;
    setBuilderSelectedOverlayId(null);
  }, [builderSelectedOverlayId, builderUserOverlays]);

  useEffect(() => {
    if (!builderCanvasEdit) return;
    window.requestAnimationFrame(() => builderCanvasEditInputRef.current?.focus());
  }, [builderCanvasEdit?.kind, builderCanvasEdit?.rIdx, builderCanvasEdit?.cIdx, builderCanvasEdit?.mIdx]);

  useEffect(() => {
    if (!builderCanvasEdit) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const pop = builderCanvasEditRef.current;
      if (pop && ev.target instanceof Node && pop.contains(ev.target)) return;
      commitBuilderCanvasEdit();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [builderCanvasEdit, builderRows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = hotkeysRef.current;
      if (!s) return;
      if (isEditableTarget(e.target)) return;
      if (s.tab !== "builder") return;

      const key = e.key || "";
      const lower = key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && lower === "z") {
        e.preventDefault();
        if (e.shiftKey) s.doRedoBuilder();
        else s.doUndoBuilder();
        return;
      }
      if (mod && lower === "y") {
        e.preventDefault();
        s.doRedoBuilder();
        return;
      }
      if (mod && lower === "s") {
        e.preventDefault();
        s.downloadBuilderProject();
        return;
      }

      if (s.builderObjectMode) {
        if (key === "Escape" && s.isCanvasEditOpen) {
          e.preventDefault();
          s.cancelBuilderCanvasEdit();
          return;
        }
        if (key === "Escape") {
          e.preventDefault();
          if (s.hasDraftOverlay) s.cancelOverlayDraft();
          else if (s.selectedOverlayId) s.clearOverlaySelection();
          else s.exitObjectMode();
          return;
        }
        if (key === "Delete" || key === "Backspace") {
          e.preventDefault();
          s.deleteSelectedOverlay();
          return;
        }
        if (mod && lower === "d") {
          e.preventDefault();
          s.duplicateSelectedOverlay();
          return;
        }
        if (mod && lower === "c") {
          e.preventDefault();
          s.copySelectedOverlay();
          return;
        }
        if (mod && lower === "v") {
          e.preventDefault();
          s.pasteOverlay();
          return;
        }
        if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
          const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
          s.nudgeSelectedOverlay(dx, dy);
          return;
        }

        // Tool quick select (PowerPoint-like)
        if (!mod && lower === "v") {
          e.preventDefault();
          s.setBuilderObjectTool("select");
          return;
        }
        if (!mod && lower === "t") {
          e.preventDefault();
          s.setBuilderObjectTool("text");
          return;
        }
        if (!mod && lower === "r") {
          e.preventDefault();
          s.setBuilderObjectTool("rect");
          return;
        }
        if (!mod && lower === "l") {
          e.preventDefault();
          s.setBuilderObjectTool("line");
          return;
        }
        if (!mod && lower === "q") {
          e.preventDefault();
          s.setBuilderObjectTool("arrow");
          return;
        }
      }

      if (key === "Escape" && s.isCanvasEditOpen) {
        e.preventDefault();
        s.cancelBuilderCanvasEdit();
        return;
      }

      if (lower === "g") {
        e.preventDefault();
        s.setBuilderEditMode("grid");
        return;
      }
      if (lower === "p") {
        e.preventDefault();
        s.setBuilderEditMode("preview");
        return;
      }

      // Tool toggle (PowerPoint-like)
      if (lower === "c") {
        e.preventDefault();
        s.setBuilderTool((prev) => (prev === "brush" ? "cycle" : "brush"));
        return;
      }

      // Brush quick select
      if (lower === "a") {
        e.preventDefault();
        s.setBuilderBrush("A");
        return;
      }
      if (lower === "b") {
        e.preventDefault();
        s.setBuilderBrush("B");
        return;
      }
      if (lower === "h") {
        e.preventDefault();
        s.setBuilderBrush("H");
        return;
      }
      if (key === "-" || key === "_") {
        e.preventDefault();
        s.setBuilderBrush("-");
        return;
      }

      // Cycle order quick select
      if (key === "1") {
        e.preventDefault();
        s.setBuilderCycleOrder("AB-");
        return;
      }
      if (key === "2") {
        e.preventDefault();
        s.setBuilderCycleOrder("AHB-");
        return;
      }

      // Preview zoom
      if (key === "[" || key === "{") {
        e.preventDefault();
        s.setBuilderPreviewZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10));
        return;
      }
      if (key === "]" || key === "}") {
        e.preventDefault();
        s.setBuilderPreviewZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10));
        return;
      }
      if (key === "0") {
        e.preventDefault();
        s.setBuilderPreviewZoom(1);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fillRowWith = (rIdx: number, code: BuilderCode): void => {
    withBuilderUndo(() =>
      setBuilderRows((prev) => {
        const row = prev[rIdx];
        if (!row) return prev;
        const nextRows = [...prev];
        nextRows[rIdx] = { ...row, codes: Array.from({ length: builderMarkers }, () => code) };
        return nextRows;
      }),
    );
  };

  const clearRow = (rIdx: number): void => fillRowWith(rIdx, "-");

  const swapRowAB = (rIdx: number): void => {
    withBuilderUndo(() =>
      setBuilderRows((prev) => {
        const row = prev[rIdx];
        if (!row) return prev;
        const swapped = row.codes.map((c) => (c === "A" ? "B" : c === "B" ? "A" : c));
        const nextRows = [...prev];
        nextRows[rIdx] = { ...row, codes: swapped };
        return nextRows;
      }),
    );
  };

  const duplicateRow = (rIdx: number): void => {
    withBuilderUndo(() =>
      setBuilderRows((prev) => {
        const row = prev[rIdx];
        if (!row) return prev;
        const copy: BuilderRow = { ...row, id: makeId(), sample: `${row.sample}_copy`, codes: [...row.codes] };
        const nextRows = [...prev];
        nextRows.splice(rIdx + 1, 0, copy);
        return nextRows;
      }),
    );
  };

  const deleteRow = (rIdx: number): void => {
    if (builderRows.length <= 1) return;
    withBuilderUndo(() =>
      setBuilderRows((prev) => {
        const next = [...prev];
        next.splice(rIdx, 1);
        return next.length ? next : prev;
      }),
    );
  };

  const moveRow = (from: number, delta: -1 | 1): void => {
    const to = from + delta;
    if (to < 0 || to >= builderRows.length) return;
    withBuilderUndo(() =>
      setBuilderRows((prev) => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
    );
  };

  const exportBuilderTsv = (): string => {
    const snap = builderStateRef.current;
    const meta = Array.isArray(snap.markerMeta) ? snap.markerMeta.slice(0, snap.markers) : [];
    const markers = Array.from({ length: snap.markers }, (_, i) => String(meta[i]?.name ?? "").trim() || `m${i + 1}`);
    const header = ["sample", ...markers].join("\t");
    const hasChr = meta.some((m) => String(m?.chr ?? "").trim().length > 0);
    const hasPos = meta.some((m) => Number.isFinite(m?.pos ?? Number.NaN));
    const chrRow = hasChr ? ["chr", ...markers.map((_, i) => String(meta[i]?.chr ?? "").trim())].join("\t") : "";
    const posRow = hasPos ? ["pos", ...markers.map((_, i) => (Number.isFinite(meta[i]?.pos ?? Number.NaN) ? String(meta[i]?.pos) : ""))].join("\t") : "";
    const rows = snap.rows.map((r) => [r.sample || r.id, ...r.codes.slice(0, snap.markers)].join("\t"));
    return [header, ...(chrRow ? [chrRow] : []), ...(posRow ? [posRow] : []), ...rows].join("\n") + "\n";
  };

  const exportMarkerMapTsv = (meta: MarkerInfo[]): string => {
    const header = ["marker", "chr", "pos"].join("\t");
    const lines = meta.map((m) => [String(m.name ?? "").trim(), String(m.chr ?? "").trim(), Number.isFinite(m.pos ?? Number.NaN) ? String(m.pos) : ""].join("\t"));
    return [header, ...lines].join("\n") + "\n";
  };

  const parseMarkerMapText = (text: string): MarkerInfo[] => {
    const lines = text
      .split(/\r?\n/g)
      .map((v) => v.replace(/\r/g, ""))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith("#"));
    if (!lines.length) return [];

    const split = (line: string): string[] => line.split(/\t|,|\s+/g).map((v) => v.trim()).filter((v) => v.length > 0);
    let idx = 0;
    const first = split(lines[0]).map((v) => v.toLowerCase());
    if (first.includes("marker") || first.includes("name") || first.includes("id")) idx = 1;

    const out: MarkerInfo[] = [];
    for (; idx < lines.length; idx += 1) {
      const cells = split(lines[idx]);
      if (!cells.length) continue;
      const base = markerInfoFromName(cells[0]);
      let chr = base.chr;
      let pos = base.pos;
      if (cells.length >= 3) {
        chr = cells[1] || chr;
        const p = Number(cells[2]);
        pos = Number.isFinite(p) ? p : pos;
      } else if (cells.length === 2) {
        const p = Number(cells[1]);
        if (Number.isFinite(p)) pos = p;
        else chr = cells[1] || chr;
      }
      const name = String(base.name ?? "").trim();
      if (!name) continue;
      out.push({ name, chr: chr ? String(chr).trim() || undefined : undefined, pos: Number.isFinite(pos ?? Number.NaN) ? (pos as number) : undefined });
    }
    return out;
  };

  type CoarseMarker = { name: string; pos: number };
  type CoarseMarkerDraftRow = { name: string; pos: string };

  const parseCoarseMarkersDraftRows = (text: string): CoarseMarkerDraftRow[] => {
    const lines = text
      .split(/\r?\n/g)
      .map((v) => v.replace(/\r/g, ""))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith("#"));
    if (!lines.length) return [];

    const splitLoose = (line: string): string[] => {
      const byDelim = line.split(/\t|,/g).map((v) => v.trim());
      if (byDelim.length >= 2) return byDelim;
      return line.split(/\s+/g).map((v) => v.trim());
    };

    let idx = 0;
    const head = splitLoose(lines[0]).map((v) => v.toLowerCase());
    if (head.includes("marker") || head.includes("name") || head.includes("pos") || head.includes("mb")) idx = 1;

    const out: CoarseMarkerDraftRow[] = [];
    for (; idx < lines.length; idx += 1) {
      const cells = splitLoose(lines[idx]);
      const name = String(cells[0] || "").trim();
      const pos = String(cells[1] || "").trim();
      if (!name && !pos) continue;
      out.push({ name, pos });
    }
    return out;
  };

  const coarseMarkerRowsToText = (rows: CoarseMarkerDraftRow[]): string => {
    const out: string[] = [];
    for (const r of rows) {
      const name = String(r.name || "").trim();
      const pos = String(r.pos || "").trim();
      if (!name && !pos) continue;
      out.push(pos ? `${name}\t${pos}` : name);
    }
    return out.join("\n") + (out.length ? "\n" : "");
  };

  const parseCoarseMarkersText = (text: string): CoarseMarker[] => {
    const lines = text
      .split(/\r?\n/g)
      .map((v) => v.replace(/\r/g, ""))
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith("#"));
    if (!lines.length) return [];

    const split = (line: string): string[] => line.split(/\t|,|\s+/g).map((v) => v.trim()).filter((v) => v.length > 0);
    let idx = 0;
    const head = split(lines[0]).map((v) => v.toLowerCase());
    if (head.includes("marker") || head.includes("name") || head.includes("pos") || head.includes("mb")) idx = 1;

    const out: CoarseMarker[] = [];
    for (; idx < lines.length; idx += 1) {
      const cells = split(lines[idx]);
      if (cells.length < 2) continue;
      const name = String(cells[0] || "").trim();
      const pos = Number(cells[1]);
      if (!name) continue;
      if (!Number.isFinite(pos)) continue;
      out.push({ name, pos });
    }
    return out.sort((a, b) => a.pos - b.pos);
  };

  const updateCoarseMarkerRow = (idx: number, patch: Partial<CoarseMarkerDraftRow>): void => {
    const rows = parseCoarseMarkersDraftRows(builderCoarseMarkersDraft);
    while (rows.length <= idx) rows.push({ name: "", pos: "" });
    rows[idx] = { ...rows[idx], ...patch };
    setBuilderCoarseMarkersDraft(coarseMarkerRowsToText(rows));
  };

  const addCoarseMarkerRow = (): void => {
    const rows = parseCoarseMarkersDraftRows(builderCoarseMarkersDraft);
    rows.push({ name: "", pos: "" });
    setBuilderCoarseMarkersDraft(coarseMarkerRowsToText(rows));
  };

  const deleteCoarseMarkerRow = (idx: number): void => {
    const rows = parseCoarseMarkersDraftRows(builderCoarseMarkersDraft);
    if (idx < 0 || idx >= rows.length) return;
    rows.splice(idx, 1);
    setBuilderCoarseMarkersDraft(coarseMarkerRowsToText(rows));
  };

  const builderCoarseMarkerOptions = useMemo(() => parseCoarseMarkersText(builderCoarseMarkersDraft), [builderCoarseMarkersDraft]);

  const nearestCoarseMarkerPos = (value: number): number | null => {
    if (!builderCoarseMarkerOptions.length) return null;
    if (!Number.isFinite(value)) return builderCoarseMarkerOptions[0].pos;
    let best = builderCoarseMarkerOptions[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const o of builderCoarseMarkerOptions) {
      const d = Math.abs(o.pos - value);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best.pos;
  };

  const resolveChrPeakRange = (): { start: number; end: number; center: number; len: number; chrLen: number } => {
    const chrLen = Number.isFinite(builderChrLenMb) && builderChrLenMb > 0 ? builderChrLenMb : 1;
    const fallbackStart = builderCoarseMarkerOptions.length ? builderCoarseMarkerOptions[0].pos : 0;
    const fallbackEnd = builderCoarseMarkerOptions.length ? builderCoarseMarkerOptions[builderCoarseMarkerOptions.length - 1].pos : chrLen;
    const rawStart = Number.isFinite(builderChrZoomStartMb) ? builderChrZoomStartMb : fallbackStart;
    const rawEnd = Number.isFinite(builderChrZoomEndMb) ? builderChrZoomEndMb : fallbackEnd;
    const start = Math.max(0, Math.min(chrLen, Math.min(rawStart, rawEnd)));
    const end = Math.max(0, Math.min(chrLen, Math.max(rawStart, rawEnd)));
    const len = Math.max(0, end - start);
    const center = start + len * 0.5;
    return { start, end, center, len, chrLen };
  };

  const builderArrowLabelAutoPreview = useMemo(() => {
    const unit = String(builderPosUnit || "").trim();
    const len = Math.abs(builderArrowEndMb - builderArrowStartMb);
    if (!Number.isFinite(len)) return "";
    const approx = len >= 30 ? Math.round(len / 10) * 10 : len >= 10 ? Math.round(len) : Math.round(len * 10) / 10;
    return `~${approx}${unit}`;
  }, [builderArrowEndMb, builderArrowStartMb, builderPosUnit]);

  const setChrPeakByCenter = (nextCenterRaw: number): void => {
    const r = resolveChrPeakRange();
    const nextCenter = Number.isFinite(nextCenterRaw) ? nextCenterRaw : r.center;
    const half = r.len * 0.5;
    let start = nextCenter - half;
    let end = nextCenter + half;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > r.chrLen) {
      start -= end - r.chrLen;
      end = r.chrLen;
    }
    start = Math.max(0, Math.min(r.chrLen, start));
    end = Math.max(0, Math.min(r.chrLen, end));
    setBuilderChrZoomStartMb(start);
    setBuilderChrZoomEndMb(end);
  };

  const setChrPeakByLength = (nextLenRaw: number): void => {
    const r = resolveChrPeakRange();
    const nextLen = Math.max(0, Math.min(r.chrLen, Number.isFinite(nextLenRaw) ? nextLenRaw : r.len));
    const half = nextLen * 0.5;
    let start = r.center - half;
    let end = r.center + half;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > r.chrLen) {
      start -= end - r.chrLen;
      end = r.chrLen;
    }
    start = Math.max(0, Math.min(r.chrLen, start));
    end = Math.max(0, Math.min(r.chrLen, end));
    setBuilderChrZoomStartMb(start);
    setBuilderChrZoomEndMb(end);
  };

  const applyBuilderMarkerMap = (): void => {
    const parsed = parseMarkerMapText(builderMapDraft);
    if (!parsed.length) {
      setJsonError("マーカー表が空です。name pos（2列）または marker chr pos（3列）を貼り付けてください。");
      return;
    }
    const markers = Math.min(500, Math.max(3, parsed.length));
    const meta = parsed.slice(0, markers).map((m, i) => ({ name: String(m.name ?? "").trim() || `m${i + 1}`, chr: m.chr, pos: m.pos }));
    while (meta.length < markers) meta.push({ name: `m${meta.length + 1}`, chr: undefined, pos: undefined });

    withBuilderUndo(() => {
      setBuilderMarkers(markers);
      setBuilderMarkerMeta(meta);
      setBuilderRows((prev) => normalizeBuilderRows(prev, markers, builderAnnoCols));
    });
    setJsonError("");
    setMessage(`MAP を適用しました（${markers} markers）。`);
  };

  const updateBuilderMapDraftFromCurrent = (): void => {
    const meta = Array.isArray(builderMarkerMeta) ? builderMarkerMeta.slice(0, builderMarkers) : [];
    setBuilderMapDraft(exportMarkerMapTsv(meta));
    setMessage("現在の MAP をテキストに出力しました。");
  };

  const autoGenerateBuilderMap = (): void => {
    const chr = builderAutoChr.trim() || "1";
    const start = Number.isFinite(builderAutoStart) ? builderAutoStart : 0;
    const step = Number.isFinite(builderAutoStep) && builderAutoStep > 0 ? builderAutoStep : 10;
    const meta = Array.from({ length: builderMarkers }, (_, i) => ({
      name: `m${i + 1}`,
      chr,
      pos: start + step * i,
    }));
    withBuilderUndo(() => {
      setBuilderMarkerMeta(meta);
      setBuilderMapDraft(exportMarkerMapTsv(meta));
    });
    setMessage("MAP を自動生成しました。");
  };

  const setBuilderMarkerName = (idx: number, name: string): void => {
    if (idx < 0 || idx >= builderMarkers) return;
    setBuilderMarkerMeta((prev) => {
      const out = Array.isArray(prev) ? prev.map((m) => ({ ...m })) : [];
      while (out.length < builderMarkers) out.push({ name: `m${out.length + 1}` });
      const cur = out[idx] || { name: `m${idx + 1}` };
      out[idx] = { ...cur, name };
      return out.slice(0, builderMarkers);
    });
  };

  const setBuilderMarkerChr = (idx: number, chr: string): void => {
    if (idx < 0 || idx >= builderMarkers) return;
    setBuilderMarkerMeta((prev) => {
      const out = Array.isArray(prev) ? prev.map((m) => ({ ...m })) : [];
      while (out.length < builderMarkers) out.push({ name: `m${out.length + 1}` });
      const cur = out[idx] || { name: `m${idx + 1}` };
      out[idx] = { ...cur, chr };
      return out.slice(0, builderMarkers);
    });
  };

  const setBuilderMarkerPos = (idx: number, pos: number | undefined): void => {
    if (idx < 0 || idx >= builderMarkers) return;
    setBuilderMarkerMeta((prev) => {
      const out = Array.isArray(prev) ? prev.map((m) => ({ ...m })) : [];
      while (out.length < builderMarkers) out.push({ name: `m${out.length + 1}` });
      const cur = out[idx] || { name: `m${idx + 1}` };
      out[idx] = { ...cur, pos };
      return out.slice(0, builderMarkers);
    });
  };

  const applyFaZoomDefaults = (): void => {
    withBuilderUndo(() => {
      setBuilderFigureMode("fa_zoom");
      setBuilderTheme("light");
      setBuilderPaletteId("blue_yellow_white");
      setBuilderScaleByPos(false);
      setBuilderLeftLabels(true);
      setBuilderShowMarkerAxis(true);
      setBuilderGuides(true);
      setBuilderGuideMode("centers");
      setBuilderPosUnit("Mb");
      setBuilderHeaderLeft("Value");
      setBuilderHeaderRight("Flag");
      setBuilderAnnoCols([{ id: makeId(), header: "Value", visible: true, width: 0 }]);
      setBuilderChrLabel("Block 1");
      setBuilderChrLenMb(200);
      setBuilderCoarseMarkersDraft("C01\t1\nC02\t4\nC03\t7\nC04\t10\nC05\t13\nC06\t16\n");
      setBuilderZoomStages(2);
      setBuilderChrZoomStartMb(1);
      setBuilderChrZoomEndMb(16);
      setBuilderCoarseZoomStartMb(1);
      setBuilderCoarseZoomEndMb(4);
      setBuilderFaLabel("Window");
      setBuilderLocusLabelText("Window ~50");
      setBuilderArrowLabel("~8");
      setBuilderArrowLabelAuto(false);
      setBuilderArrowStartMb(1);
      setBuilderArrowEndMb(2);
      setBuilderArrowOffsetX(0);
      setBuilderArrowOffsetY(0);
      setBuilderArrowLabelDx(0);
      setBuilderArrowLabelDy(0);
      setBuilderFigureTitle("Numeric matrix example");
      setBuilderGenoLegendA("Code A");
      setBuilderGenoLegendB("Code B");
      setBuilderGenoLegendH("Code H");
      setBuilderHighlightMarkers("C07");
      setBuilderCanvasWidthSafe(1600);
      setBuilderAnnotationWidthSafe(260);
      setBuilderRowHeightSafe(44);
      setBuilderRowGapSafe(16);
    });
    setBuilderEditMode("preview");
    setBuilderTool("cycle");
    setBuilderCycleOrder("AHB-");
    setMessage("Numeric window defaults applied.");
  };

  const loadFaZoomExample = (): void => {
    const meta: MarkerInfo[] = [
      { name: "C01", chr: "1", pos: 1 },
      { name: "C02", chr: "1", pos: 2 },
      { name: "C03", chr: "1", pos: 3 },
      { name: "C04", chr: "1", pos: 4 },
      { name: "C05", chr: "1", pos: 5 },
      { name: "C06", chr: "1", pos: 6 },
      { name: "C07", chr: "1", pos: 7 },
      { name: "C08", chr: "1", pos: 8 },
      { name: "C09", chr: "1", pos: 9 },
      { name: "C10", chr: "1", pos: 10 },
      { name: "C11", chr: "1", pos: 11 },
      { name: "C12", chr: "1", pos: 12 },
      { name: "C13", chr: "1", pos: 13 },
      { name: "C14", chr: "1", pos: 14 },
    ];
    const markers = meta.length;
    const fill = (code: BuilderCode): BuilderCode[] => Array.from({ length: markers }, () => code);
    const mix = (codes: BuilderCode[]): BuilderCode[] => {
      while (codes.length < markers) codes.push("-");
      return codes.slice(0, markers);
    };
    const rows: BuilderRow[] = [
      { id: makeId(), sample: "Row 01", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: fill("A") },
      { id: makeId(), sample: "Row 02", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: fill("B") },
      { id: makeId(), sample: "Row 03", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "cross", codes: mix(Array.from({ length: markers }, (_, i) => (i <= 5 ? "A" : "H"))) },
      { id: makeId(), sample: "Row 04", rightLabel: "1", annotations: ["1"], labelRed: true, mark: "circle", codes: mix(Array.from({ length: markers }, (_, i) => (i <= 5 ? "H" : "A"))) },
      { id: makeId(), sample: "Row 05", rightLabel: "0", annotations: ["0"], labelRed: false, mark: "circle", codes: mix(Array.from({ length: markers }, (_, i) => (i <= 2 ? "A" : "H"))) },
    ];

    withBuilderUndo(() => {
      setBaseName("numeric_window");
      setBuilderMarkers(markers);
      setBuilderMarkerMeta(meta);
      setBuilderMapDraft(exportMarkerMapTsv(meta));
      setBuilderRows(rows);
    });
    applyFaZoomDefaults();
    setMessage("Numeric window example loaded.");
  };

  const downloadBuilderTsv = (): void => {
    const name = safeFileBase(baseName);
    downloadTextFile(exportBuilderTsv(), `${name}_builder_${timestampForFile()}.tsv`, "text/tab-separated-values;charset=utf-8");
  };

  const buildBuilderProjectPayload = (): Record<string, unknown> => {
    const opts = builderRenderOptsRef.current;
    const snap = builderStateRef.current;
    return {
      version: 9,
      baseName: opts.baseName,
      markers: snap.markers,
      markerMeta: (snap.markerMeta || []).slice(0, snap.markers),
      scaleByPosition: Boolean(snap.scaleByPosition),
      userOverlays: (builderUserOverlaysRef.current || []).map((o) => ({ ...(o as Record<string, unknown>) })),
      leftLabels: opts.leftLabels,
      showMarkerAxis: opts.showMarkerAxis,
      guides: opts.guides,
      guideMode: opts.guideMode,
      headerLeft: opts.headerLeft,
      headerRight: opts.headerRight,
      annoCols: builderAnnoCols.map((c) => ({ header: c.header, visible: Boolean(c.visible), width: Number(c.width) || 0 })),
      posUnit: opts.posUnit,
      figureMode: opts.figureMode,
      chrLabel: opts.chrLabel,
      chrLenMb: opts.chrLenMb,
      coarseMarkersDraft: opts.coarseMarkersDraft,
      zoomStages: opts.zoomStages,
      chrZoomStartMb: opts.chrZoomStartMb,
      chrZoomEndMb: opts.chrZoomEndMb,
      coarseZoomStartMb: opts.coarseZoomStartMb,
      coarseZoomEndMb: opts.coarseZoomEndMb,
      faLabel: opts.faLabel,
      locusLabelText: opts.locusLabelText,
      arrowLabel: opts.arrowLabel,
      arrowLabelAuto: opts.arrowLabelAuto,
      arrowStartMb: opts.arrowStartMb,
      arrowEndMb: opts.arrowEndMb,
      arrowOffsetX: opts.arrowOffsetX,
      arrowOffsetY: opts.arrowOffsetY,
      arrowLabelDx: opts.arrowLabelDx,
      arrowLabelDy: opts.arrowLabelDy,
      figureTitle: opts.figureTitle,
      genoLegendA: opts.genoLegendA,
      genoLegendB: opts.genoLegendB,
      genoLegendH: opts.genoLegendH,
      highlightMarkers: opts.highlightMarkers,
      rows: snap.rows.map((r) => ({
        sample: r.sample,
        rightLabel: r.rightLabel,
        annotations: Array.isArray(r.annotations) ? r.annotations.slice() : [],
        labelRed: Boolean(r.labelRed),
        mark: r.mark,
        circle: r.mark === "circle",
        codes: r.codes.slice(0, snap.markers),
      })),
      paletteId: opts.paletteId,
      theme: opts.theme,
      compressRuns: opts.compressRuns,
      cellSize: builderCellSize,
      canvasWidth: opts.canvasWidth,
      annotationWidth: opts.annotationWidth,
      rowHeight: opts.rowHeight,
      rowGap: opts.rowGap,
    };
  };

  const downloadBuilderProject = (): void => {
    const payload = buildBuilderProjectPayload();
    const name = safeFileBase(String(payload.baseName ?? baseName));
    downloadTextFile(JSON.stringify(payload, null, 2), `${name}_builder_${timestampForFile()}.json`, "application/json;charset=utf-8");
  };

  const normalizeBuilderCode = (raw: unknown): BuilderCode => {
    const s = String(raw ?? "").trim().toUpperCase();
    if (!s) return "-";
    if (s === "A" || s === "AA") return "A";
    if (s === "B" || s === "BB") return "B";
    if (s === "H" || s === "AB" || s === "BA") return "H";
    if (s === "-" || s === "." || s === "0" || s === "NA" || s === "N") return "-";
    return "-";
  };

  const loadBuilderProjectText = (text: string): void => {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object") throw new Error("JSON が不正です。");
    const obj = v as Record<string, unknown>;
    const markers = Math.min(500, Math.max(3, Math.round(Number(obj.markers ?? 0) || builderMarkers)));
    const metaRaw = Array.isArray(obj.markerMeta) ? obj.markerMeta : [];
    const markerMeta: MarkerInfo[] = metaRaw
      .map((m, i) => {
        const mm = m as Partial<MarkerInfo>;
        const name = String(mm?.name ?? "").trim() || `m${i + 1}`;
        const chr = String(mm?.chr ?? "").trim() || undefined;
        const posNum = Number((mm as { pos?: unknown })?.pos);
        const pos = Number.isFinite(posNum) ? posNum : undefined;
        return { name, chr, pos };
      })
      .slice(0, markers);
    while (markerMeta.length < markers) markerMeta.push({ name: `m${markerMeta.length + 1}` });

    const headerLeft = String(obj.headerLeft ?? builderHeaderLeft);
    const annoColsRaw = Array.isArray(obj.annoCols) ? obj.annoCols : [];
    const annoCols: BuilderAnnoCol[] =
      annoColsRaw.length > 0
        ? annoColsRaw
          .filter((v) => v && typeof v === "object")
          .map((v, i) => {
            const o = v as Record<string, unknown>;
            const header = String(o.header ?? o.name ?? "").trim() || `Col${i + 1}`;
            const visible = Boolean(o.visible ?? true);
            const widthRaw = Number(o.width ?? 0);
            const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.round(widthRaw) : 0;
            return { id: makeId(), header, visible, width } satisfies BuilderAnnoCol;
          })
        : (() => {
          const headers = splitAnnoColumnsText(headerLeft).filter((v) => v.length > 0);
          const base = headers.length ? headers : [headerLeft || "Trait"];
          return base.map((h) => ({ id: makeId(), header: h, visible: true, width: 0 }));
        })();

    const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
    const rows: BuilderRow[] = rowsRaw
      .map((r, idx) => {
        const rr = r as Record<string, unknown>;
        const sample = String(rr.sample ?? `R${idx + 1}`);
        const rightLabelRaw = String(rr.rightLabel ?? sample);
        const annotationsRaw = Array.isArray(rr.annotations) ? rr.annotations : splitAnnoColumnsText(rightLabelRaw);
        const annotations = normalizeAnnoValues(annotationsRaw.map((v) => String(v ?? "")), Math.max(1, annoCols.length));
        const rightLabel = buildVisibleAnnoText(annotations, annoCols) || sample;
        const labelRed = Boolean(rr.labelRed ?? rr.circle ?? false);
        const markRaw = String(rr.mark ?? "").trim().toLowerCase();
        const mark: BuilderMark =
          markRaw === "circle" || markRaw === "○"
            ? "circle"
            : markRaw === "cross" || markRaw === "x" || markRaw === "×"
              ? "cross"
              : Boolean(rr.circle ?? false)
                ? "circle"
                : "none";
        const codesRaw = Array.isArray(rr.codes) ? rr.codes : [];
        const codes = codesRaw.map(normalizeBuilderCode).slice(0, markers);
        while (codes.length < markers) codes.push("-");
        return { id: makeId(), sample, rightLabel, annotations, labelRed, mark, codes };
      })
      .filter(Boolean);

    if (!rows.length) throw new Error("rows が空です。");

    const paletteId = String(obj.paletteId ?? builderPaletteId);
    const theme = obj.theme === "light" ? "light" : "dark";
    const compressRuns = obj.compressRuns !== false;
    const scaleByPosition = Boolean(obj.scaleByPosition ?? builderScaleByPos);
    const userOverlaysRaw = Array.isArray(obj.userOverlays) ? obj.userOverlays : [];
    const userOverlays: OverlayShape[] =
      userOverlaysRaw.length > 0
        ? userOverlaysRaw
          .filter(
            (v) =>
              v &&
              typeof v === "object" &&
              typeof (v as { kind?: unknown }).kind === "string" &&
              typeof (v as { id?: unknown }).id === "string",
          )
          .map((v) => v as OverlayShape)
        : (builderUserOverlaysRef.current || []);
    const leftLabels = Boolean(obj.leftLabels ?? builderLeftLabels);
    const showMarkerAxis = Boolean(obj.showMarkerAxis ?? builderShowMarkerAxis);
    const guides = Boolean(obj.guides ?? builderGuides);
    const guideMode = obj.guideMode === "boundaries" ? "boundaries" : builderGuideMode;
    const headerRight = String(obj.headerRight ?? builderHeaderRight);
    const posUnit = String(obj.posUnit ?? builderPosUnit);
    const figureMode = obj.figureMode === "fa_zoom" ? "fa_zoom" : "simple";
    const chrLabel = String(obj.chrLabel ?? builderChrLabel);
    const chrLenMbRaw = Number(obj.chrLenMb ?? builderChrLenMb);
    const chrLenMb = Number.isFinite(chrLenMbRaw) && chrLenMbRaw > 0 ? chrLenMbRaw : builderChrLenMb;
    const coarseMarkersDraft = String(obj.coarseMarkersDraft ?? builderCoarseMarkersDraft);
    const zoomStages = Number(obj.zoomStages ?? builderZoomStages) === 1 ? 1 : 2;
    const chrZoomStartMbRaw = Number(obj.chrZoomStartMb ?? builderChrZoomStartMb);
    const chrZoomEndMbRaw = Number(obj.chrZoomEndMb ?? builderChrZoomEndMb);
    const coarseZoomStartMbRaw = Number(obj.coarseZoomStartMb ?? builderCoarseZoomStartMb);
    const coarseZoomEndMbRaw = Number(obj.coarseZoomEndMb ?? builderCoarseZoomEndMb);
    const chrZoomStartMb = Number.isFinite(chrZoomStartMbRaw) ? chrZoomStartMbRaw : Number.NaN;
    const chrZoomEndMb = Number.isFinite(chrZoomEndMbRaw) ? chrZoomEndMbRaw : Number.NaN;
    const coarseZoomStartMb = Number.isFinite(coarseZoomStartMbRaw) ? coarseZoomStartMbRaw : Number.NaN;
    const coarseZoomEndMb = Number.isFinite(coarseZoomEndMbRaw) ? coarseZoomEndMbRaw : Number.NaN;
    const faLabel = String(obj.faLabel ?? builderFaLabel);
    const locusLabelTextRaw = String(obj.locusLabelText ?? "").trim();
    const locusLabelText =
      locusLabelTextRaw ||
      (() => {
        const coarse = parseCoarseMarkersText(coarseMarkersDraft);
        const coarseStart = coarse.length >= 2 ? coarse[0].pos : 0;
        const coarseEnd = coarse.length >= 2 ? coarse[coarse.length - 1].pos : chrLenMb;
        const start = Number.isFinite(chrZoomStartMb) ? chrZoomStartMb : coarseStart;
        const end = Number.isFinite(chrZoomEndMb) ? chrZoomEndMb : coarseEnd;
        const len = Math.abs(end - start);
        const approx = len >= 30 ? Math.round(len / 10) * 10 : len >= 10 ? Math.round(len) : Math.round(len * 10) / 10;
        const unit = String(posUnit || "").trim();
        const gene = faLabel.trim() || "Target";
        return `${gene} window ~${approx}${unit}`;
      })();
    const arrowLabel = String(obj.arrowLabel ?? builderArrowLabel);
    const arrowLabelAuto = Boolean(obj.arrowLabelAuto ?? builderArrowLabelAuto);
    const arrowStartMbRaw = Number(obj.arrowStartMb ?? builderArrowStartMb);
    const arrowEndMbRaw = Number(obj.arrowEndMb ?? builderArrowEndMb);
    const arrowStartMb = Number.isFinite(arrowStartMbRaw) ? arrowStartMbRaw : builderArrowStartMb;
    const arrowEndMb = Number.isFinite(arrowEndMbRaw) ? arrowEndMbRaw : builderArrowEndMb;
    const arrowOffsetXRaw = Number(obj.arrowOffsetX ?? builderArrowOffsetX);
    const arrowOffsetYRaw = Number(obj.arrowOffsetY ?? builderArrowOffsetY);
    const arrowLabelDxRaw = Number(obj.arrowLabelDx ?? builderArrowLabelDx);
    const arrowLabelDyRaw = Number(obj.arrowLabelDy ?? builderArrowLabelDy);
    const arrowOffsetX = Number.isFinite(arrowOffsetXRaw) ? arrowOffsetXRaw : builderArrowOffsetX;
    const arrowOffsetY = Number.isFinite(arrowOffsetYRaw) ? arrowOffsetYRaw : builderArrowOffsetY;
    const arrowLabelDx = Number.isFinite(arrowLabelDxRaw) ? arrowLabelDxRaw : builderArrowLabelDx;
    const arrowLabelDy = Number.isFinite(arrowLabelDyRaw) ? arrowLabelDyRaw : builderArrowLabelDy;
    const figureTitle = String(obj.figureTitle ?? builderFigureTitle);
    const genoLegendA = String(obj.genoLegendA ?? builderGenoLegendA);
    const genoLegendB = String(obj.genoLegendB ?? builderGenoLegendB);
    const genoLegendH = String(obj.genoLegendH ?? builderGenoLegendH);
    const highlightMarkers = String(obj.highlightMarkers ?? builderHighlightMarkers);
    const cellSize = Math.min(40, Math.max(6, Math.round(Number(obj.cellSize ?? builderCellSize))));
    const canvasWidth = Math.min(12000, Math.max(800, Math.round(Number(obj.canvasWidth ?? builderCanvasWidth))));
    const annotationWidth = Math.min(2000, Math.max(120, Math.round(Number(obj.annotationWidth ?? builderAnnotationWidth))));
    const rowHeight = Math.min(200, Math.max(10, Math.round(Number(obj.rowHeight ?? builderRowHeight))));
    const rowGap = Math.min(200, Math.max(0, Math.round(Number(obj.rowGap ?? builderRowGap))));
    const nextBaseName = String(obj.baseName ?? baseName).trim() || baseName;
    const headerLeftVisible = joinAnnoColumnsText(annoCols.filter((c) => c.visible).map((c) => c.header));

    withBuilderUndo(() => {
      setBaseName(nextBaseName);
      setBuilderMarkers(markers);
      setBuilderMarkerMeta(markerMeta);
      setBuilderScaleByPos(scaleByPosition);
      setBuilderUserOverlays(userOverlays);
      setBuilderMapDraft(exportMarkerMapTsv(markerMeta));
      setBuilderAnnoCols(annoCols);
      setBuilderRows(normalizeBuilderRows(rows, markers, annoCols));
      setBuilderPaletteId(paletteId);
      setBuilderTheme(theme);
      setBuilderCompressRuns(Boolean(compressRuns));
      setBuilderCellSize(cellSize);
      setBuilderCanvasWidth(canvasWidth);
      setBuilderAnnotationWidth(annotationWidth);
      setBuilderRowHeight(rowHeight);
      setBuilderRowGap(rowGap);
      setBuilderLeftLabels(leftLabels);
      setBuilderShowMarkerAxis(showMarkerAxis);
      setBuilderGuides(guides);
      setBuilderGuideMode(guideMode);
      setBuilderHeaderLeft(headerLeftVisible || headerLeft);
      setBuilderHeaderRight(headerRight);
      setBuilderPosUnit(posUnit);
      setBuilderFigureMode(figureMode);
      setBuilderChrLabel(chrLabel);
      setBuilderChrLenMb(chrLenMb);
      setBuilderCoarseMarkersDraft(coarseMarkersDraft);
      setBuilderZoomStages(zoomStages);
      setBuilderChrZoomStartMb(chrZoomStartMb);
      setBuilderChrZoomEndMb(chrZoomEndMb);
      setBuilderCoarseZoomStartMb(coarseZoomStartMb);
      setBuilderCoarseZoomEndMb(coarseZoomEndMb);
      setBuilderFaLabel(faLabel);
      setBuilderLocusLabelText(locusLabelText);
      setBuilderArrowLabel(arrowLabel);
      setBuilderArrowLabelAuto(arrowLabelAuto);
      setBuilderArrowStartMb(arrowStartMb);
      setBuilderArrowEndMb(arrowEndMb);
      setBuilderArrowOffsetX(arrowOffsetX);
      setBuilderArrowOffsetY(arrowOffsetY);
      setBuilderArrowLabelDx(arrowLabelDx);
      setBuilderArrowLabelDy(arrowLabelDy);
      setBuilderFigureTitle(figureTitle);
      setBuilderGenoLegendA(genoLegendA);
      setBuilderGenoLegendB(genoLegendB);
      setBuilderGenoLegendH(genoLegendH);
      setBuilderHighlightMarkers(highlightMarkers);
    });
  };

  const makeConfigFromBuilder = (): GraphConfig => {
    builderPreviewHotspotsRef.current = [];
    builderUiHandlesRef.current = [];
    builderUiMetaRef.current = null;
    const snap = builderStateRef.current;
    const opts = builderRenderOptsRef.current;
    const markersCount = snap.markers;
    const rowsMeta = snap.rows;
    const rowById = new Map(rowsMeta.map((r) => [r.id, r]));

    const markers = Array.from({ length: markersCount }, (_, i) => {
      const m = snap.markerMeta?.[i];
      const name = String(m?.name ?? "").trim() || `m${i + 1}`;
      const chr = String(m?.chr ?? "").trim() || undefined;
      const posNum = Number((m as { pos?: unknown })?.pos);
      const pos = Number.isFinite(posNum) ? posNum : undefined;
      return { name, chr, pos };
    });
    const rows = rowsMeta.map((r) => ({ sample: r.id, codes: r.codes }));
    const showXAxis = opts.figureMode === "fa_zoom" ? false : !opts.showMarkerAxis;
    const scaleByPosition = opts.figureMode === "fa_zoom" ? false : snap.scaleByPosition;
    const next = makeConfigFromMatrix(markers, rows, {
      baseName: opts.baseName,
      paletteId: opts.paletteId,
      theme: opts.theme,
      sortMarkers: false,
      compressRuns: opts.compressRuns,
      scaleByPosition,
      showXAxis,
    });
    const textFill = opts.theme === "light" ? "#111827" : "#e5e7eb";
    const hi = "#ff2d2d";
    const visibleAnnoCols = builderAnnoCols.filter((c) => c.visible);
    const annoHeaderLeft = deriveBuilderHeaderLeft(builderAnnoCols) || (opts.headerLeft || "").trim();
    const annoColWidths = visibleAnnoCols.map((c) => (Number.isFinite(c.width) && c.width > 0 ? c.width : 0));

    const baseTracks: GraphTrack[] = next.tracks.map((t) => {
      const row = rowById.get(t.id);
      const rowName = (row?.sample || "").trim();
      const labelRaw = (row?.rightLabel || "").trim();
      const label = opts.leftLabels ? labelRaw : labelRaw || rowName || (t.rightText?.text || "");
      const mark: BuilderMark = row?.mark || "none";
      const labelFill = row?.labelRed ? hi : textFill;
      return {
        ...t,
        height: opts.rowHeight,
        leftText: opts.leftLabels && rowName ? { text: rowName, fill: textFill, fontSize: 16 } : undefined,
        rightText: label ? { ...(t.rightText || {}), text: label, fill: labelFill } : undefined,
        rightCircle: mark === "circle" ? { stroke: hi, strokeWidth: 6, r: 14 } : undefined,
        rightCross: mark === "cross" ? { stroke: textFill, strokeWidth: 6, size: 18 } : undefined,
        showColumnLines: opts.guides,
      };
    });

    const fmtPos = (v: number): string => {
      const n = Number(v);
      if (!Number.isFinite(n)) return "";
      const s = n.toFixed(n % 1 === 0 ? 0 : 2);
      return s.replace(/(\.\d*?)0+$/g, "$1").replace(/\.$/g, "");
    };

    if (opts.figureMode === "fa_zoom") {
      const hotspots: BuilderPreviewHotspot[] = [];
      const width = opts.canvasWidth;
      const approxTextW = (label: string, fontSize: number): number => label.length * fontSize * 0.62;
      const figureTitle = (opts.figureTitle || "").trim();
      const titleTop = 18;
      let titleFontSize = 24;
      let titleHeight = figureTitle ? titleFontSize + 8 : 0;
      const titleGap = figureTitle ? 16 : 0;
      const locusLabelFontSizeBase = 16;
      const locusLabelReserve = locusLabelFontSizeBase + 10;

      const chrLabel = (opts.chrLabel || "").trim() || "Chr";

      const leftFontSize = 16;
      const leftNames = opts.leftLabels
        ? rowsMeta
            .map((r) => String(r.sample || r.id || "").trim())
            .filter((v) => v.length > 0)
        : [];
      const maxLeftLen = Math.max(4, chrLabel.length, ...leftNames.map((s) => s.length));
      const approxLeftW = maxLeftLen * leftFontSize * 0.62;
      const plotX = opts.leftLabels ? Math.round(Math.min(320, Math.max(160, approxLeftW + 44))) : 140;

      const annotationWidth = opts.annotationWidth;
      const plotWidth = Math.max(200, width - plotX - annotationWidth - 30);
      if (figureTitle) {
        const maxTitleW = Math.max(120, plotWidth - 40);
        const w0 = approxTextW(figureTitle, titleFontSize);
        if (w0 > maxTitleW) {
          const s = maxTitleW / w0;
          titleFontSize = Math.max(14, Math.floor(titleFontSize * s));
        }
        titleHeight = titleFontSize + 8;
      }
      const plotY = Math.round(titleTop + titleHeight + titleGap + locusLabelReserve);
      const showAxes = opts.showMarkerAxis;
      const zoomStages: BuilderZoomStages = opts.zoomStages === 1 ? 1 : 2;
      const showCoarseAxis = showAxes && zoomStages >= 2;

      const coarseMarkers = parseCoarseMarkersText(opts.coarseMarkersDraft);
      const coarseTickX = (idx: number): number => {
        if (coarseMarkers.length <= 1) return 0.5;
        return idx / (coarseMarkers.length - 1);
      };
      const detailPositions = markers.map((m) => (Number.isFinite(m.pos ?? Number.NaN) ? (m.pos as number) : NaN)).filter((v) => Number.isFinite(v));
      const detailStartPos = detailPositions.length ? Math.min(...detailPositions) : 0;
      const detailEndPos = detailPositions.length ? Math.max(...detailPositions) : Math.max(1, detailStartPos + 1);
      const coarseStart =
        coarseMarkers.length >= 2
          ? coarseMarkers[0].pos
          : detailPositions.length
            ? Math.min(...detailPositions)
            : 0;
      const coarseEnd =
        coarseMarkers.length >= 2
          ? coarseMarkers[coarseMarkers.length - 1].pos
          : detailPositions.length
            ? Math.max(...detailPositions)
            : Math.max(1, coarseStart + 1);
	      const unitRaw = (opts.posUnit || "").trim();
	      const unitTitle = unitRaw ? (unitRaw.startsWith("(") ? unitRaw : `(${unitRaw})`) : "";

	      const chrLenMb = Number.isFinite(opts.chrLenMb) && opts.chrLenMb > 0 ? opts.chrLenMb : Math.max(1, coarseEnd);

	      const guideStroke = opts.theme === "light" ? "rgba(107, 114, 128, 0.9)" : "rgba(148, 163, 184, 0.9)";
	      const guideOpacity = opts.theme === "light" ? 0.55 : 0.5;

	      const boundaries = Array.isArray(next.xBoundaries) ? next.xBoundaries : [];
	      const minLabelGapPx = 10;

	      const highlightSet = new Set(
	        String(opts.highlightMarkers || "")
	          .split(/,|\s+/g)
	          .map((v) => v.trim())
	          .filter((v) => v.length > 0),
	      );

	      const chrTrack: GraphTrack = {
	        id: "__chr__",
	        height: 26,
	        gapAfter: 30,
	        showColumnLines: false,
	        segments: [],
	        leftText: { text: chrLabel, fill: textFill, fontSize: 16 },
	      };

	      const coarseAxisTopFontSize = 14;
	      const coarseAxisBottomFontSize = 13;
	      const coarseAxisTicks =
	        coarseMarkers.length >= 2
	          ? (() => {
	            const names = coarseMarkers.map((m) => m.name || "");
	            const posLabels = coarseMarkers.map((m) => fmtPos(m.pos));
	            const xs = coarseMarkers.map((_, i) => coarseTickX(i));
	            const widths = names.map((name, i) => Math.max(approxTextW(name, coarseAxisTopFontSize), approxTextW(posLabels[i] || "", coarseAxisBottomFontSize)) + 12);
	            const perTickPx = plotWidth / Math.max(1, coarseMarkers.length - 1);
	            const maxW = widths.length ? Math.max(...widths) : 0;
	            const tickEveryByWidth = Math.max(1, Math.ceil((maxW + minLabelGapPx) / Math.max(1, perTickPx)));
	            const showFlags = names.map((_, i) => i % tickEveryByWidth === 0 || i === 0 || i === names.length - 1);

	            const overlaps = (a: number, b: number): boolean =>
	              Math.abs(xs[a] * plotWidth - xs[b] * plotWidth) < (widths[a] + widths[b]) * 0.5 + minLabelGapPx;
	            const kept: number[] = [];
	            for (let i = 0; i < showFlags.length; i += 1) {
	              if (!showFlags[i]) continue;
	              while (kept.length) {
	                const j = kept[kept.length - 1];
	                if (!overlaps(j, i)) break;
	                // keep endpoints, drop intermediate labels
	                if (i !== 0 && i !== showFlags.length - 1) {
	                  showFlags[i] = false;
	                  break;
	                }
	                if (j !== 0 && j !== showFlags.length - 1) {
	                  showFlags[j] = false;
	                  kept.pop();
	                  continue;
	                }
	                break;
	              }
	              if (showFlags[i]) kept.push(i);
	            }

	            return coarseMarkers.map((m, i) => ({
	              x: xs[i],
	              major: Boolean(showFlags[i]),
	              labelTop: showFlags[i] ? (m.name || "") : undefined,
	              labelBottom: showFlags[i] ? fmtPos(m.pos) : undefined,
	            }));
	          })()
	          : [
	            { x: 0, major: true, labelTop: "A", labelBottom: fmtPos(coarseStart) },
	            { x: 1, major: true, labelTop: "F", labelBottom: fmtPos(coarseEnd) },
	          ];

	      const coarseAxisTrack: GraphTrack = {
	        id: "__coarse_axis__",
	        height: 66,
	        gapAfter: 18,
	        showColumnLines: false,
	        segments: [],
	        axis: {
	          title: unitTitle,
	          stroke: textFill,
	          strokeWidth: 2,
	          tickSize: 22,
	          labelTopFill: textFill,
	          labelBottomFill: textFill,
	          labelTopFontSize: coarseAxisTopFontSize,
	          labelBottomFontSize: coarseAxisBottomFontSize,
	          ticks: coarseAxisTicks,
	        },
	      };

	      const detailAxisTopFontSize = markersCount <= 60 ? 14 : markersCount <= 120 ? 13 : 12;
	      const detailAxisBottomFontSize = Math.max(10, detailAxisTopFontSize - 1);
	      const markerXs =
	        boundaries.length === markersCount + 1
	          ? markers.map((_, i) => {
	            const x0 = boundaries[i] ?? i / markersCount;
	            const x1 = boundaries[i + 1] ?? (i + 1) / markersCount;
	            return (x0 + x1) / 2;
	          })
	          : markers.map((_, i) => (i + 0.5) / markersCount);
	      const markerNames = markers.map((m, i) => (m.name || "").trim() || `m${i + 1}`);
	      const markerPosLabels = markers.map((m) => (Number.isFinite(m.pos ?? Number.NaN) ? fmtPos(m.pos as number) : ""));
	      const markerLabelWidths = markerNames.map(
	        (name, i) => Math.max(approxTextW(name, detailAxisTopFontSize), approxTextW(markerPosLabels[i] || "", detailAxisBottomFontSize)) + 12,
	      );
	      const perMarkerPx = plotWidth / Math.max(1, markersCount);
	      const maxLabelW = markerLabelWidths.length ? Math.max(...markerLabelWidths) : 0;
	      const tickEveryByCount = markersCount <= 25 ? 1 : markersCount <= 60 ? 2 : markersCount <= 120 ? 4 : 8;
	      const tickEveryByWidth = Math.max(1, Math.ceil((maxLabelW + minLabelGapPx) / Math.max(1, perMarkerPx)));
	      const tickEvery = Math.max(tickEveryByCount, tickEveryByWidth);

	      const isMandatoryMarkerLabel = (i: number): boolean => i === 0 || i === markersCount - 1 || highlightSet.has(markerNames[i] || "");
	      const overlaps = (a: number, b: number): boolean =>
	        Math.abs(markerXs[a] * plotWidth - markerXs[b] * plotWidth) < (markerLabelWidths[a] + markerLabelWidths[b]) * 0.5 + minLabelGapPx;

	      const showFlags = markerNames.map((name, i) => i % tickEvery === 0 || i === 0 || i === markersCount - 1 || highlightSet.has(name));
	      const kept: number[] = [];
	      for (let i = 0; i < showFlags.length; i += 1) {
	        if (!showFlags[i]) continue;
	        const mandatory = isMandatoryMarkerLabel(i);
	        while (kept.length) {
	          const j = kept[kept.length - 1];
	          if (!overlaps(j, i)) break;
	          const prevMandatory = isMandatoryMarkerLabel(j);
	          if (mandatory && !prevMandatory) {
	            showFlags[j] = false;
	            kept.pop();
	            continue;
	          }
	          if (!mandatory) showFlags[i] = false;
	          break;
	        }
	        if (showFlags[i]) kept.push(i);
	      }

		      const detailTicks = markers.map((m, i) => {
		        const show = Boolean(showFlags[i]);
		        const name = markerNames[i] || `m${i + 1}`;
		        return {
		          x: markerXs[i],
		          major: show,
		          labelTop: show ? name : undefined,
		          // highlight marker is mandatory for label visibility, but keep text color fixed (black) for paper figures
		          labelBottom: show ? markerPosLabels[i] : undefined,
		        };
		      });

	      const detailAxisTrack: GraphTrack = {
	        id: "__detail_axis__",
        height: 74,
        gapAfter: 14,
        showColumnLines: opts.guides,
        segments: [],
	        axis: {
	          title: "",
	          stroke: textFill,
	          strokeWidth: 2,
	          tickSize: 22,
	          labelTopFill: textFill,
	          labelBottomFill: textFill,
	          labelTopFontSize: detailAxisTopFontSize,
	          labelBottomFontSize: detailAxisBottomFontSize,
	          ticks: detailTicks,
	        },
	      };

      const tracks: GraphTrack[] = showAxes
        ? [chrTrack, ...(showCoarseAxis ? [coarseAxisTrack] : []), detailAxisTrack, ...baseTracks]
        : [chrTrack, ...baseTracks];

      const layout: Array<{ id: string; y: number; h: number }> = [];
      let yCursor = plotY;
      for (const t of tracks) {
        const h = t.height ?? opts.rowHeight;
        layout.push({ id: t.id, y: yCursor, h });
        yCursor += h + (t.gapAfter ?? opts.rowGap);
      }
      const byId = new Map(layout.map((v) => [v.id, v]));
      const chrBox = byId.get("__chr__");
      const coarseBox = byId.get("__coarse_axis__");
      const detailBox = byId.get("__detail_axis__");
      let lastData = layout[layout.length - 1];
      for (let i = layout.length - 1; i >= 0; i -= 1) {
        const v = layout[i];
        if (v && !v.id.startsWith("__")) {
          lastData = v;
          break;
        }
      }

      const highlightStart = Number.isFinite(opts.chrZoomStartMb) ? opts.chrZoomStartMb : coarseStart;
      const highlightEnd = Number.isFinite(opts.chrZoomEndMb) ? opts.chrZoomEndMb : coarseEnd;
      const highlightLen = Math.abs(highlightEnd - highlightStart);
      const highlightLenApprox =
        highlightLen >= 30 ? Math.round(highlightLen / 10) * 10 : highlightLen >= 10 ? Math.round(highlightLen) : Math.round(highlightLen * 10) / 10;
      const h0 = Math.max(0, Math.min(1, highlightStart / chrLenMb));
      const h1 = Math.max(0, Math.min(1, highlightEnd / chrLenMb));
	      const hx0 = plotX + Math.min(h0, h1) * plotWidth;
	      const hx1 = plotX + Math.max(h0, h1) * plotWidth;

      const firstMarkerX = markerXs.length ? markerXs[0] : 0;
      const lastMarkerX = markerXs.length ? markerXs[markerXs.length - 1] : 1;
      const detailX0 = plotX + Math.max(0, Math.min(1, firstMarkerX)) * plotWidth;
      const detailX1 = plotX + Math.max(0, Math.min(1, lastMarkerX)) * plotWidth;

      const coarseX0 = plotX + (coarseMarkers.length ? coarseTickX(0) : 0) * plotWidth;
      const coarseX1 = plotX + (coarseMarkers.length ? coarseTickX(coarseMarkers.length - 1) : 1) * plotWidth;
      const coarseAxisY = (coarseBox?.y ?? plotY) + (coarseBox?.h ?? 66) * 0.5;
      const detailAxisY = (detailBox?.y ?? plotY) + (detailBox?.h ?? 74) * 0.5;

      const coarseTicks = coarseMarkers.length
        ? coarseMarkers.map((m, i) => ({ pos: m.pos, x: coarseTickX(i) })).sort((a, b) => a.pos - b.pos)
        : [];

      const coarsePosToX = (pos: number): number => {
        if (!coarseTicks.length) return 0.5;
        if (pos <= coarseTicks[0].pos) return coarseTicks[0].x;
        if (pos >= coarseTicks[coarseTicks.length - 1].pos) return coarseTicks[coarseTicks.length - 1].x;
        for (let i = 0; i < coarseTicks.length - 1; i += 1) {
          const a = coarseTicks[i];
          const b = coarseTicks[i + 1];
          if (pos >= a.pos && pos <= b.pos) {
            const span = b.pos - a.pos || 1;
            const t = (pos - a.pos) / span;
            return a.x + (b.x - a.x) * t;
          }
        }
        return 0.5;
      };

      const centers = markers
        .map((m, i) => {
          const x0 = boundaries[i] ?? i / markersCount;
          const x1 = boundaries[i + 1] ?? (i + 1) / markersCount;
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

	      const coarseZoomStart = Number.isFinite(opts.coarseZoomStartMb) ? opts.coarseZoomStartMb : detailStartPos;
	      const coarseZoomEnd = Number.isFinite(opts.coarseZoomEndMb) ? opts.coarseZoomEndMb : detailEndPos;

	      const cz0 = plotX + coarsePosToX(coarseZoomStart) * plotWidth;
	      const cz1 = plotX + coarsePosToX(coarseZoomEnd) * plotWidth;
	      const coarseZoomX0 = Math.min(cz0, cz1);
	      const coarseZoomX1 = Math.max(cz0, cz1);

      const arrowStart = Number.isFinite(opts.arrowStartMb) ? opts.arrowStartMb : coarseStart;
      const arrowEnd = Number.isFinite(opts.arrowEndMb) ? opts.arrowEndMb : coarseEnd;
      const ax0 = plotX + posToX(arrowStart) * plotWidth;
      const ax1 = plotX + posToX(arrowEnd) * plotWidth;

	      const dataBottom = (lastData?.y ?? plotY) + (lastData?.h ?? opts.rowHeight);

	      const faLabel = (opts.faLabel || "").trim() || "Fa";
	      const locusLabelText = String(opts.locusLabelText || "").trim();
	      const arrowLabelManual = (opts.arrowLabel || "").trim();
      const arrowOffsetX = Number.isFinite(opts.arrowOffsetX) ? opts.arrowOffsetX : 0;
      const arrowOffsetY = Number.isFinite(opts.arrowOffsetY) ? opts.arrowOffsetY : 0;
      const arrowLabelDx = Number.isFinite(opts.arrowLabelDx) ? opts.arrowLabelDx : 0;
      const arrowLabelDy = Number.isFinite(opts.arrowLabelDy) ? opts.arrowLabelDy : 0;
      const arrowLen = Math.abs(arrowEnd - arrowStart);
      const arrowLenApprox = Number.isFinite(arrowLen)
        ? arrowLen >= 30
          ? Math.round(arrowLen / 10) * 10
          : arrowLen >= 10
            ? Math.round(arrowLen)
            : Math.round(arrowLen * 10) / 10
        : Number.NaN;
      const arrowLabelAutoText = Number.isFinite(arrowLenApprox) ? `~${arrowLenApprox}${unitRaw}` : "";
      const arrowLabel = opts.arrowLabelAuto ? arrowLabelAutoText : arrowLabelManual;
	      const locusLabel = locusLabelText || `${faLabel} window ~${highlightLenApprox}${unitRaw}`;
	      let locusLabelFontSize = locusLabelFontSizeBase;
	      {
	        const maxW = Math.max(120, plotWidth * 0.7);
	        const w0 = approxTextW(locusLabel, locusLabelFontSize);
        if (w0 > maxW) {
          const s = maxW / w0;
          locusLabelFontSize = Math.max(12, Math.floor(locusLabelFontSize * s));
        }
      }
      const legendA = (opts.genoLegendA || "").trim();
      const legendB = (opts.genoLegendB || "").trim();
      const legendH = (opts.genoLegendH || "").trim();
      const genoLegendItems = (
        [
          { code: "A", label: legendA || "A" },
          { code: "B", label: legendB || "B" },
          { code: "H", label: legendH || "H" },
        ] satisfies Array<{ code: BuilderCode; label: string }>
      ).filter((v) => v.label.trim().length > 0);

      const annotationX = plotX + plotWidth + 24;
      const circleX = annotationX + Math.max(90, annotationWidth - 120);
      const headerLeftText = annoHeaderLeft;
      const headerRightText = (opts.headerRight || "").trim();
      let annotationHeaderFontSize = 16;
      if (headerLeftText && headerRightText) {
        const gap = 18;
        const leftW0 = approxTextW(headerLeftText, annotationHeaderFontSize);
        const rightW0 = approxTextW(headerRightText, annotationHeaderFontSize);
        const avail = circleX - annotationX - gap;
        const need = leftW0 + rightW0 * 0.5;
        if (need > avail) {
          const s = avail / Math.max(1, need);
          annotationHeaderFontSize = Math.max(11, Math.floor(annotationHeaderFontSize * s));
        }
      }

      // Legend layout (bottom-right, PowerPoint-like boxes)
      const legendBoxH = 28;
      let legendFontSize = 16;
      const legendGapY = 10;
      const plotPad = 12;
      const plotLeft = plotX + plotPad;
      const plotRight = plotX + plotWidth - plotPad;
      const maxLegendLineW = Math.max(40, plotRight - plotLeft);

      if (genoLegendItems.length) {
        let best = legendFontSize;
        for (const it of genoLegendItems) {
          const label = it.label.trim();
          if (!label) continue;
          const denom = label.length * 0.62;
          if (denom <= 0) continue;
          const maxFs = Math.floor((maxLegendLineW - 18) / denom);
          if (Number.isFinite(maxFs)) best = Math.min(best, maxFs);
        }
        legendFontSize = Math.max(11, Math.min(16, best));
      }
      const legendGapX = Math.max(10, Math.round(legendFontSize * 0.9));

      const legendTextFillFor = (fill: string): string => {
        const hex = fill.trim();
        if (!hex.startsWith("#")) return textFill;
        const raw = hex.slice(1);
        const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
        if (full.length !== 6) return textFill;
        const n = Number.parseInt(full, 16);
        if (Number.isNaN(n)) return textFill;
        const r = (n >> 16) & 0xff;
        const g = (n >> 8) & 0xff;
        const b = n & 0xff;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return lum > 0.6 ? "#111827" : "#f9fafb";
      };

      const fitLegendLabel = (label: string): string => {
        const t = label.trim();
        if (!t) return "";
        const maxChars = Math.max(1, Math.floor((maxLegendLineW - 18) / Math.max(1, legendFontSize * 0.62)));
        if (t.length <= maxChars) return t;
        return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
      };
      const fittedLegendItems = genoLegendItems.map((it) => ({ ...it, label: fitLegendLabel(it.label) })).filter((it) => it.label.trim().length > 0);

      const legendItemWidth = (label: string): number => Math.max(92, Math.round(18 + approxTextW(label, legendFontSize)));
      const legendLineWidth = (items: typeof fittedLegendItems): number =>
        items.reduce((sum, it) => sum + legendItemWidth(it.label.trim()), 0) + Math.max(0, items.length - 1) * legendGapX;

      const legendLines = (() => {
        if (!fittedLegendItems.length) return [] as Array<typeof fittedLegendItems>;
        const lines: Array<typeof fittedLegendItems> = [];
        let line: typeof fittedLegendItems = [];
        let w = 0;
        for (const it of fittedLegendItems) {
          const itemW = legendItemWidth(it.label.trim());
          const add = line.length ? legendGapX + itemW : itemW;
          if (line.length && w + add > maxLegendLineW) {
            lines.push(line);
            line = [it];
            w = itemW;
          } else {
            line.push(it);
            w += add;
          }
        }
        if (line.length) lines.push(line);
        return lines;
      })();

      const legendHeight = legendLines.length ? legendLines.length * legendBoxH + (legendLines.length - 1) * legendGapY : 0;

      const baseArrowGap = Math.max(44, Math.round(opts.rowHeight * 1.15));
      const arrowGap = Math.max(baseArrowGap, legendHeight ? legendHeight + 20 : baseArrowGap);
      const arrowY = dataBottom + arrowGap;
      const arrowY0 = arrowY + arrowOffsetY;
      const arrowX0 = ax0 + arrowOffsetX;
      const arrowX1 = ax1 + arrowOffsetX;
      const arrowMid0 = (arrowX0 + arrowX1) / 2;
      const arrowLabelX = arrowMid0 + arrowLabelDx;
      const arrowLabelY = arrowY0 + 18 + arrowLabelDy;
      const geneLabelY = Math.round(arrowY0 - 38 - 12);

      const legendTop = legendHeight ? Math.round(arrowY - 10 - legendHeight) : 0;
      const genoLegendOverlays = (() => {
        if (!legendLines.length) return [] as OverlayShape[];
        const out: OverlayShape[] = [];
        for (let rowIdx = 0; rowIdx < legendLines.length; rowIdx += 1) {
          const line = legendLines[rowIdx];
          const lineW = legendLineWidth(line);
          const x0 = Math.max(plotLeft, plotRight - lineW);
          const y0 = legendTop + rowIdx * (legendBoxH + legendGapY);
          let x = x0;
          for (const it of line) {
            const label = it.label.trim();
            const w = legendItemWidth(label);
            const fill = builderColorFor(it.code);
            const targetKind: BuilderCanvasEditKind | null =
              it.code === "A" ? "genoLegendA" : it.code === "B" ? "genoLegendB" : it.code === "H" ? "genoLegendH" : null;
            if (targetKind) {
              hotspots.push({ target: { kind: targetKind }, x0: x, y0, x1: x + w, y1: y0 + legendBoxH });
            }
            out.push({
              kind: "rect",
              x,
              y: y0,
              width: w,
              height: legendBoxH,
              fill,
              stroke: textFill,
              strokeWidth: 2,
              rx: 6,
              ry: 6,
              layer: "over",
            });
            out.push({
              kind: "text",
              x: x + w * 0.5,
              y: y0 + legendBoxH * 0.5,
              text: label,
              fill: legendTextFillFor(fill),
              fontSize: legendFontSize,
              fontWeight: 900,
              anchor: "middle",
              baseline: "middle",
              layer: "over",
            });
            x += w + legendGapX;
          }
        }
        return out;
      })();

      // Click-to-edit hotspots (PowerPoint-like)
      if (figureTitle) {
        const titleW = Math.max(60, approxTextW(figureTitle, titleFontSize));
        hotspots.push({
          target: { kind: "figureTitle" },
          x0: plotX + plotWidth * 0.5 - titleW * 0.5 - 16,
          y0: titleTop - 6,
          x1: plotX + plotWidth * 0.5 + titleW * 0.5 + 16,
          y1: titleTop + titleFontSize + 16,
        });
      }
	      // Locus label (above red highlight)
	      {
	        const locusW = Math.max(60, approxTextW(locusLabel, locusLabelFontSize));
	        const lx = (hx0 + hx1) / 2;
	        const ly = (chrBox?.y ?? plotY) - 8;
	        hotspots.push({
	          target: { kind: "locusLabelText" },
	          x0: lx - locusW * 0.5 - 16,
	          y0: ly - locusLabelFontSize - 14,
	          x1: lx + locusW * 0.5 + 16,
	          y1: ly + 10,
	        });
	      }
      // Phenotype headers (right side above first data row)
      {
        const firstData = layout.find((v) => !v.id.startsWith("__"));
        const headerY = firstData ? Math.max(12, firstData.y - 14) : 0;
        const headerFontSize = annotationHeaderFontSize;
        const leftHeader = headerLeftText;
        const rightHeader = headerRightText;
        if (headerY > 0 && leftHeader) {
          const w = Math.max(30, approxTextW(leftHeader, headerFontSize));
          hotspots.push({
            target: { kind: "headerLeft" },
            x0: annotationX - 6,
            y0: headerY - headerFontSize - 12,
            x1: annotationX + w + 10,
            y1: headerY + 10,
          });
        }
        if (headerY > 0 && rightHeader) {
          const w = Math.max(30, approxTextW(rightHeader, headerFontSize));
          hotspots.push({
            target: { kind: "headerRight" },
            x0: circleX - w * 0.5 - 10,
            y0: headerY - headerFontSize - 12,
            x1: circleX + w * 0.5 + 10,
            y1: headerY + 10,
          });
        }
      }
      // Unit label (Mb) on coarse axis (right side)
      if (showCoarseAxis && unitTitle) {
        const titleW = Math.max(20, approxTextW(unitTitle, 14));
        hotspots.push({
          target: { kind: "posUnit" },
          x0: plotX + plotWidth + 6,
          y0: coarseAxisY - 40,
          x1: plotX + plotWidth + 6 + titleW + 36,
          y1: coarseAxisY + 10,
        });
      }
      // Fa label and arrow label
      {
        const faX = arrowMid0;
        const faY = geneLabelY;
        const faW = Math.max(40, approxTextW(faLabel, 38));
        hotspots.push({
          target: { kind: "faLabel" },
          x0: faX - faW * 0.5 - 14,
          y0: faY - 6,
          x1: faX + faW * 0.5 + 14,
          y1: faY + 46,
        });
      }
      if (arrowLabel) {
        const w = Math.max(40, approxTextW(arrowLabel, 16));
        hotspots.push({
          target: { kind: "arrowLabel" },
          x0: arrowLabelX - w * 0.5 - 14,
          y0: arrowLabelY - 6,
          x1: arrowLabelX + w * 0.5 + 14,
          y1: arrowLabelY + 28,
        });
      }
      builderPreviewHotspotsRef.current = hotspots;

      // Editor-only UI handles (not included in exported SVG)
      builderUiMetaRef.current = {
        plotX,
        plotWidth,
        chrLenMb,
        coarseTicks: coarseTicks.map((c) => ({ pos: c.pos, x: c.x })),
        detailCenters: centers.map((c) => ({ pos: c.pos, x: c.x })),
      };
      const uiHandles: EditorUiHandle[] = [];
      if (showAxes) {
        const chrHandleY = (chrBox?.y ?? plotY) + (chrBox?.h ?? 26) * 0.5;
        uiHandles.push({ kind: "circle", id: "ui-chr-start", x: hx0, y: chrHandleY, r: 9, title: "Chr赤バー start", cursor: "ew-resize" });
        uiHandles.push({ kind: "circle", id: "ui-chr-end", x: hx1, y: chrHandleY, r: 9, title: "Chr赤バー end", cursor: "ew-resize" });

		        if (showCoarseAxis) {
		          const coarseHandleY = coarseAxisY;
		          uiHandles.push({
		            kind: "circle",
		            id: "ui-coarse-zoom-start",
		            x: coarseZoomX0,
		            y: coarseHandleY,
		            r: 9,
		            title: "広域→詳細 start",
		            cursor: "ew-resize",
		          });
		          uiHandles.push({
		            kind: "circle",
		            id: "ui-coarse-zoom-end",
		            x: coarseZoomX1,
		            y: coarseHandleY,
		            r: 9,
		            title: "広域→詳細 end",
		            cursor: "ew-resize",
		          });
		        }
	      }
	      uiHandles.push({ kind: "circle", id: "ui-arrow-start", x: arrowX0, y: arrowY0, r: 8, title: "↔ start", cursor: "ew-resize" });
	      uiHandles.push({ kind: "circle", id: "ui-arrow-end", x: arrowX1, y: arrowY0, r: 8, title: "↔ end", cursor: "ew-resize" });
      uiHandles.push({
        kind: "rect",
        id: "ui-arrow-move",
        x: arrowMid0 - 8,
        y: arrowY0 - 8,
        width: 16,
        height: 16,
        rx: 4,
        ry: 4,
        title: "↔ 移動",
        cursor: "move",
        fill: "#dbeafe",
        stroke: "#2563eb",
      });
      if (arrowLabel) {
        const w = Math.max(40, approxTextW(arrowLabel, 16));
        uiHandles.push({
          kind: "rect",
          id: "ui-arrow-label-move",
          x: arrowLabelX + w * 0.5 + 10,
          y: arrowLabelY + 2,
          width: 12,
          height: 12,
          rx: 3,
          ry: 3,
          title: "↔ ラベル移動",
          cursor: "move",
          fill: "#fef9c3",
          stroke: "#a16207",
        });
      }
      builderUiHandlesRef.current = uiHandles;

      const overlays: OverlayShape[] = [
        ...(figureTitle
          ? ([
            {
	              kind: "text",
		              x: plotX + plotWidth * 0.5,
		              y: titleTop,
		              text: figureTitle,
		              fill: textFill,
		              fontSize: titleFontSize,
		              fontWeight: 900,
		              anchor: "middle",
		              baseline: "hanging",
		              layer: "over",
	            },
	          ] satisfies OverlayShape[])
	          : []),
        // chromosome bar (white fill) + red highlight + outline
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
	          text: locusLabel,
	          fill: textFill,
	          fontSize: locusLabelFontSize,
	          fontWeight: 900,
	          anchor: "middle",
	          layer: "over",
	        },
	        ...(showAxes
	          ? ([
		            // zoom connector lines
				            {
					              kind: "line",
					              x1: hx0,
					              y1: (chrBox?.y ?? plotY) + (chrBox?.h ?? 26),
					              x2: showCoarseAxis ? coarseX0 : detailX0,
					              y2: showCoarseAxis ? coarseAxisY : detailAxisY,
					              stroke: guideStroke,
					              strokeWidth: 2,
					              lineCap: "round",
			              opacity: guideOpacity,
			              layer: "under",
		            },
				            {
					              kind: "line",
					              x1: hx1,
					              y1: (chrBox?.y ?? plotY) + (chrBox?.h ?? 26),
					              x2: showCoarseAxis ? coarseX1 : detailX1,
					              y2: showCoarseAxis ? coarseAxisY : detailAxisY,
					              stroke: guideStroke,
					              strokeWidth: 2,
					              lineCap: "round",
			              opacity: guideOpacity,
			              layer: "under",
		            },
		            ...(showCoarseAxis
		              ? ([
		                  // zoom connector lines (coarse -> detail)
				                  {
					                    kind: "line",
					                    x1: coarseZoomX0,
					                    y1: coarseAxisY,
					                    x2: detailX0,
					                    y2: detailAxisY,
					                    stroke: guideStroke,
					                    strokeWidth: 2,
					                    lineCap: "round",
			                    opacity: guideOpacity,
			                    layer: "under",
				                  },
				                  {
					                    kind: "line",
					                    x1: coarseZoomX1,
					                    y1: coarseAxisY,
					                    x2: detailX1,
					                    y2: detailAxisY,
					                    stroke: guideStroke,
					                    strokeWidth: 2,
					                    lineCap: "round",
			                    opacity: guideOpacity,
			                    layer: "under",
				                  },
		                ] satisfies OverlayShape[])
		              : []),
	          ] satisfies OverlayShape[])
	          : []),
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
        // genotype legend (A/B/H)
        ...genoLegendOverlays,
        // Fa label + double arrow + approx length
        {
          kind: "text",
          x: arrowMid0,
          y: geneLabelY,
          text: faLabel,
          fill: textFill,
          fontSize: 38,
          fontWeight: 800,
          fontStyle: "italic",
          anchor: "middle",
          baseline: "hanging",
          layer: "over",
        },
        {
          kind: "line",
          x1: arrowX0,
          y1: arrowY0,
          x2: arrowX1,
          y2: arrowY0,
          stroke: textFill,
          strokeWidth: 2,
          markerStart: "arrow",
          markerEnd: "arrow",
          lineCap: "round",
          layer: "over",
        },
        ...(arrowLabel
          ? ([
            {
              kind: "text",
              x: arrowLabelX,
              y: arrowLabelY,
              text: arrowLabel,
              fill: textFill,
              fontSize: 16,
              fontWeight: 900,
              anchor: "middle",
              baseline: "hanging",
              layer: "over",
            },
          ] satisfies OverlayShape[])
          : []),
      ];

      const userOverlays = builderUserOverlaysRef.current || [];
      const mergedOverlays: OverlayShape[] = userOverlays.length ? [...overlays, ...userOverlays] : overlays;

      const scaleBottom = arrowLabel ? arrowLabelY + 16 : arrowY0 + 10;
      const height = Math.max(520, Math.ceil(scaleBottom + 44));

      return {
        ...next,
        width,
        height,
        legend: undefined,
        columnGroups: undefined,
        xAxis: undefined,
        plot: { x: plotX, y: plotY, width: plotWidth, annotationWidth, annotationColumnWidths: annoColWidths, rowHeight: opts.rowHeight, rowGap: opts.rowGap },
        styles: {
          columnLine: { stroke: guideStroke, strokeWidth: 1, dash: "2 4", opacity: guideOpacity },
          text: { fontFamily: 'Arial, "Segoe UI", system-ui, -apple-system, sans-serif', fontSize: 18, fill: textFill },
          segment: { stroke: "none", strokeWidth: 0 },
        },
	        guides: opts.guides ? { show: true, mode: opts.guideMode, stroke: guideStroke, strokeWidth: 1, dash: "2 4", opacity: guideOpacity } : undefined,
	        annotationHeaders:
	          headerLeftText || headerRightText
	            ? { left: headerLeftText, right: headerRightText, fill: textFill, fontSize: annotationHeaderFontSize }
	            : undefined,
        overlays: mergedOverlays,
        tracks,
      };
    }

    const plotY = next.plot?.y ?? 92;
    const plotX = next.plot?.x ?? 120;
    const plotWidth =
      Number.isFinite(next.plot?.width ?? Number.NaN) ? (next.plot?.width as number) : Math.max(200, opts.canvasWidth - plotX - opts.annotationWidth - 30);

    const axisTracks: GraphConfig["tracks"] =
      opts.showMarkerAxis && next.xBoundaries && next.xBoundaries.length === markersCount + 1
        ? [
          {
            id: "__marker_axis__",
            height: 64,
            gapAfter: 10,
            showColumnLines: opts.guides,
            segments: [],
            axis: {
              title: (opts.posUnit || "").trim(),
              stroke: textFill,
              strokeWidth: 2,
              tickSize: 20,
              labelTopFill: textFill,
              labelBottomFill: textFill,
              labelTopFontSize: 13,
              labelBottomFontSize: 12,
              ticks: markers.map((m, i) => {
                const x0 = next.xBoundaries?.[i] ?? i / markersCount;
                const x1 = next.xBoundaries?.[i + 1] ?? (i + 1) / markersCount;
                const x = (x0 + x1) / 2;
                const n = markersCount;
                const every = n <= 25 ? 1 : n <= 60 ? 2 : n <= 120 ? 4 : 8;
                const show = i % every === 0 || i === 0 || i === n - 1;
                const pos = Number.isFinite(m.pos ?? Number.NaN) ? fmtPos(m.pos as number) : "";
                return {
                  x,
                  major: show,
                  labelTop: show ? (m.name || `m${i + 1}`) : undefined,
                  labelBottom: show ? pos : undefined,
                };
              }),
            },
          },
        ]
        : [];

    const tracks = [...axisTracks, ...baseTracks];

    const layout: Array<{ id: string; y: number; h: number; isData: boolean }> = [];
    let yCursor = plotY;
    for (const t of tracks) {
      const h = t.height ?? opts.rowHeight;
      const isData = Array.isArray(t.segments) && t.segments.length > 0;
      layout.push({ id: t.id, y: yCursor, h, isData });
      yCursor += h + (t.gapAfter ?? opts.rowGap);
    }
    const barFrames: OverlayShape[] = layout
      .filter((v) => v.isData)
      .map((v) => ({
        kind: "rect",
        x: plotX,
        y: v.y,
        width: plotWidth,
        height: v.h,
        fill: "none",
        stroke: textFill,
        strokeWidth: 2,
        layer: "over",
      }));

    const height = Math.max(320, yCursor + 60);
    const userOverlays = builderUserOverlaysRef.current || [];
    const overlays = [...(Array.isArray(next.overlays) ? next.overlays : []), ...barFrames, ...userOverlays];

    return {
      ...next,
      width: opts.canvasWidth,
      height,
      plot: {
        x: plotX,
        y: plotY,
        width: plotWidth,
        annotationWidth: opts.annotationWidth,
        annotationColumnWidths: annoColWidths,
        rowHeight: opts.rowHeight,
        rowGap: opts.rowGap,
      },
      styles: { ...(next.styles || {}), segment: { stroke: "none", strokeWidth: 0 } },
      guides: opts.guides ? { show: true, mode: opts.guideMode } : undefined,
      annotationHeaders:
        (annoHeaderLeft || "").trim() || (opts.headerRight || "").trim()
          ? { left: annoHeaderLeft, right: opts.headerRight.trim(), fill: textFill, fontSize: 16 }
          : undefined,
      overlays,
      tracks,
    };
  };

  const captureBuilderToOps = (): void => {
    const snap = builderStateRef.current;
    const opts = builderRenderOptsRef.current;
    const markers = Array.from({ length: snap.markers }, (_, i) => {
      const m = snap.markerMeta?.[i];
      const name = String(m?.name ?? "").trim() || `m${i + 1}`;
      const chr = String(m?.chr ?? "").trim() || undefined;
      const posNum = Number((m as { pos?: unknown })?.pos);
      const pos = Number.isFinite(posNum) ? posNum : undefined;
      return { name, chr, pos };
    });
    const rows = snap.rows.map((r) => ({ sample: r.id, codes: r.codes.slice() }));
    const rowMeta: Record<string, MatrixRowMeta> = {};
    for (const r of snap.rows) {
      const label = r.rightLabel.trim() || r.sample.trim() || r.id;
      rowMeta[r.id] = { label, labelRed: Boolean(r.labelRed), mark: r.mark };
    }
    setMatrixData({
      source: "builder",
      baseName: opts.baseName,
      markers,
      rows,
      rowMeta,
      render: {
        paletteId: opts.paletteId,
        theme: opts.theme,
        sortMarkers: false,
        compressRuns: opts.compressRuns,
        scaleByPosition: snap.scaleByPosition,
      },
    });
    setMessage("Builder を操作対象に取り込みました。操作タブで平滑化/欠測補完/並び替えができます。");
    setTab("ops");
  };

  const paintRef = useRef<{ on: boolean; code: BuilderCode; last?: { r: number; c: number } }>({ on: false, code: "A" });

  const paintBuilderCell = (rIdx: number, cIdx: number, code: BuilderCode): void => {
    setBuilderRows((prev) => {
      const target = prev[rIdx];
      if (!target) return prev;
      if (cIdx < 0 || cIdx >= builderMarkers) return prev;
      if (target.codes[cIdx] === code) return prev;
      const nextCodes = [...target.codes];
      nextCodes[cIdx] = code;
      const nextRows = [...prev];
      nextRows[rIdx] = { ...target, codes: nextCodes };
      return nextRows;
    });
  };

  const cycleBuilderRun = (rIdx: number, cIdx: number, dir: 1 | -1): void => {
    setBuilderRows((prev) => {
      const row = prev[rIdx];
      if (!row) return prev;
      if (cIdx < 0 || cIdx >= builderMarkers) return prev;
      const codes = row.codes.slice(0, builderMarkers);
      while (codes.length < builderMarkers) codes.push("-");
      const cur = codes[cIdx] ?? "-";
      const nextCode = cycleNextCode(cur, dir);
      // マーカー (= 1セル) 単位で循環
      codes[cIdx] = nextCode;
      const nextRows = [...prev];
      nextRows[rIdx] = { ...row, codes };
      return nextRows;
    });
  };

  const handleBuilderPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const btn = (e.target as HTMLElement | null)?.closest("button.ggt-cell") as HTMLButtonElement | null;
    if (!btn) return;
    const rIdx = Number(btn.dataset.r);
    const cIdx = Number(btn.dataset.c);
    if (!Number.isFinite(rIdx) || !Number.isFinite(cIdx)) return;
    e.preventDefault();
    pushUndo(snapshotBuilder());
    if (builderTool === "cycle") {
      const dir: 1 | -1 = e.shiftKey ? -1 : 1;
      cycleBuilderRun(rIdx, cIdx, dir);
      return;
    }
    paintRef.current.on = true;
    paintRef.current.code = builderBrush;
    paintRef.current.last = { r: rIdx, c: cIdx };
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    paintBuilderCell(rIdx, cIdx, builderBrush);
  };

  const handleBuilderPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!paintRef.current.on) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const btn = el?.closest("button.ggt-cell") as HTMLButtonElement | null;
    if (!btn) return;
    const rIdx = Number(btn.dataset.r);
    const cIdx = Number(btn.dataset.c);
    if (!Number.isFinite(rIdx) || !Number.isFinite(cIdx)) return;
    const last = paintRef.current.last;
    if (last && last.r === rIdx && last.c === cIdx) return;
    paintRef.current.last = { r: rIdx, c: cIdx };
    paintBuilderCell(rIdx, cIdx, paintRef.current.code);
  };

  const handleBuilderPointerUp = (): void => {
    paintRef.current.on = false;
    paintRef.current.last = undefined;
  };

  const builderSvgPointFromClient = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const x = ((clientX - rect.left) / rect.width) * config.width;
    const y = ((clientY - rect.top) / rect.height) * config.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  };

  const pickBuilderPreviewHitFromSvgPoint = (clientX: number, clientY: number): BuilderPreviewHit | null => {
    const pt = builderSvgPointFromClient(clientX, clientY);
    if (!pt) return null;
    const x = pt.x;
    const y = pt.y;

    const hotspots = builderPreviewHotspotsRef.current;
    if (hotspots.length) {
      for (let i = hotspots.length - 1; i >= 0; i -= 1) {
        const h = hotspots[i];
        if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return { kind: "canvasEdit", target: h.target };
      }
    }

    const plotX = config.plot?.x ?? 120;
    const plotY = config.plot?.y ?? 92;
    const annotationWidth = config.plot?.annotationWidth ?? 340;
    const plotWidth = config.plot?.width ?? Math.max(200, config.width - plotX - annotationWidth - 30);
    const rowHeight = config.plot?.rowHeight ?? builderRowHeight;
    const rowGap = config.plot?.rowGap ?? builderRowGap;

    if (y < plotY) return null;

    const boundaries = Array.isArray(config.xBoundaries) ? config.xBoundaries : [];
    const boundariesOk = boundaries.length === builderMarkers + 1 && boundaries.every((v) => Number.isFinite(v));

    const pickColumnIndex = (xNorm: number): number => {
      if (!Number.isFinite(xNorm)) return -1;
      if (xNorm <= 0) return 0;
      if (xNorm >= 1) return builderMarkers - 1;
      let cIdx = -1;
      if (boundariesOk) {
        if (xNorm <= boundaries[0]) cIdx = 0;
        else if (xNorm >= boundaries[boundaries.length - 1]) cIdx = builderMarkers - 1;
        else {
          let lo = 0;
          let hi = builderMarkers - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const b0 = boundaries[mid];
            const b1 = boundaries[mid + 1];
            if (xNorm < b0) hi = mid - 1;
            else if (xNorm >= b1) lo = mid + 1;
            else {
              cIdx = mid;
              break;
            }
          }
        }
      } else {
        cIdx = Math.floor(xNorm * builderMarkers);
      }
      return cIdx;
    };

	    const rowIdToIndex = new Map(builderRows.map((r, i) => [r.id, i]));
	    const tracks = Array.isArray(config.tracks) ? config.tracks : [];
	    const hasCoarseAxis = tracks.some((t) => t.id === "__coarse_axis__");

	    const splitAnnotationColumns = (text: unknown): string[] => {
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
	    const approxTextW = (label: string, fontSize: number): number => Math.max(0, Math.round(label.length * fontSize * 0.62));
	    const annotationAreaX = plotX + plotWidth + 24;
	    const defaultTextFs = (config.styles?.text?.fontSize ?? 18) as number;
	    const headerFontSize = (config.annotationHeaders?.fontSize ?? Math.max(12, Math.round(defaultTextFs * 0.85))) as number;

	    const headerCols = trimTrailingEmptyColumns(splitAnnotationColumns(config.annotationHeaders?.left));
	    const rowCols = tracks.map((t) => trimTrailingEmptyColumns(splitAnnotationColumns(t.rightText?.text)));
	    const annotationCols = Math.max(0, headerCols.length, ...rowCols.map((v) => v.length));

	    const showMarkColumn = Boolean(config.annotationHeaders?.right) || tracks.some((t) => Boolean(t.rightCircle || t.rightCross));
	    const annotationColGap = 12;
	    const annotationMarkGap = 18;

	    let maxMarkHalf = 0;
	    for (const t of tracks) {
	      const circle = t.rightCircle;
	      if (circle) {
	        const r = circle.r ?? 14;
	        const sw = circle.strokeWidth ?? 6;
	        maxMarkHalf = Math.max(maxMarkHalf, r + sw);
	      }
	      const cross = t.rightCross;
	      if (cross) {
	        const size = cross.size ?? 18;
	        const sw = cross.strokeWidth ?? 6;
	        maxMarkHalf = Math.max(maxMarkHalf, size * 0.5 + sw);
	      }
	    }
	    if (showMarkColumn) maxMarkHalf = Math.max(maxMarkHalf, 20);
	    const markColW = showMarkColumn ? Math.max(44, Math.round(maxMarkHalf * 2 + 10)) : 0;

	    const desiredColWs: number[] = Array.from({ length: annotationCols }, () => 0);
	    for (let i = 0; i < annotationCols; i += 1) {
	      desiredColWs[i] = Math.max(desiredColWs[i], approxTextW(headerCols[i] || "", headerFontSize));
	    }
	    for (let r = 0; r < rowCols.length; r += 1) {
	      const cols = rowCols[r];
	      if (!cols.length) continue;
	      const t = tracks[r];
	      const fs = (t.rightText?.fontSize ?? defaultTextFs) as number;
	      for (let i = 0; i < Math.min(annotationCols, cols.length); i += 1) {
	        desiredColWs[i] = Math.max(desiredColWs[i], approxTextW(cols[i] || "", fs));
	      }
	    }

	    const desiredWithPad = desiredColWs.map((w) => Math.max(24, Math.round(w + 6)));
	    const availableTextW = Math.max(0, annotationWidth - (showMarkColumn ? markColW + annotationMarkGap : 0));
	    const gapsW = Math.max(0, annotationCols - 1) * annotationColGap;
	    const availableForCols = Math.max(0, availableTextW - gapsW);

	    const minColW = 22;
	    const colWs = desiredWithPad.slice();
	    if (annotationCols > 0) {
	      const sumDesired = colWs.reduce((a, b) => a + b, 0);
	      if (sumDesired > availableForCols) {
	        const minSum = annotationCols * minColW;
	        if (availableForCols <= minSum) {
	          const eq = Math.max(10, Math.floor(availableForCols / annotationCols));
	          for (let i = 0; i < annotationCols; i += 1) colWs[i] = eq;
	        } else {
	          const flex = colWs.map((w) => Math.max(0, w - minColW));
	          const flexSum = flex.reduce((a, b) => a + b, 0) || 1;
	          const remaining = availableForCols - minSum;
	          for (let i = 0; i < annotationCols; i += 1) {
	            const add = (remaining * flex[i]) / flexSum;
	            colWs[i] = Math.max(minColW, Math.floor(minColW + add));
	          }
	        }
	      }
	    }

	    let annoCursor = annotationAreaX;
	    for (let i = 0; i < annotationCols; i += 1) annoCursor += colWs[i] + (i < annotationCols - 1 ? annotationColGap : 0);
	    const markXRaw = showMarkColumn ? annoCursor + (annotationCols > 0 ? annotationMarkGap : 0) + markColW * 0.5 : annoCursor;
	    const markX = showMarkColumn
	      ? Math.max(annotationAreaX + markColW * 0.5, Math.min(annotationAreaX + annotationWidth - markColW * 0.5, markXRaw))
	      : markXRaw;
	    const markHitX0 = markX - markColW * 0.5;
	    const markHitX1 = markX + markColW * 0.5;
	    let yCursor = plotY;
		    for (const t of tracks) {
		      const h = t.height ?? rowHeight;
		      const y0 = yCursor;
	      const y1 = y0 + h;
	      if (y >= y0 && y <= y1) {
	        const axisY = y0 + h * 0.5;
	        const isTop = y < axisY;
	        const nearAxisLine = Math.abs(y - axisY) <= 14;

	        if (t.id === "__chr__") {
	          if (x < plotX) return { kind: "canvasEdit", target: { kind: "chrLabel" } };
	          if (x >= plotX && x <= plotX + plotWidth) {
	            const chrLen = Number.isFinite(builderChrLenMb) && builderChrLenMb > 0 ? builderChrLenMb : 1;
	            const pos = ((x - plotX) / plotWidth) * chrLen;
	            if (Number.isFinite(pos)) return { kind: "rangeSet", range: "chrPeak", pos: Math.max(0, Math.min(chrLen, pos)) };
	          }
	          return null;
	        }

	        if (t.id === "__coarse_axis__") {
	          if (x > plotX + plotWidth) return { kind: "canvasEdit", target: { kind: "posUnit" } };
	          if (x < plotX || x > plotX + plotWidth) return null;
	          const xNorm = (x - plotX) / plotWidth;
	          const ticks = Array.isArray(t.axis?.ticks) ? t.axis!.ticks : [];
	          let mIdx = 0;
	          if (ticks.length >= 2) {
	            let best = 0;
	            let bestD = Number.POSITIVE_INFINITY;
	            for (let i = 0; i < ticks.length; i += 1) {
	              const tx = Number.isFinite(ticks[i].x) ? (ticks[i].x as number) : NaN;
	              if (!Number.isFinite(tx)) continue;
	              const d = Math.abs(tx - xNorm);
	              if (d < bestD) {
	                bestD = d;
	                best = i;
	              }
	            }
	            mIdx = best;
	          }
	          if (nearAxisLine) {
	            const pos = builderCoarseMarkerOptions[mIdx]?.pos;
	            if (Number.isFinite(pos)) return { kind: "rangeSet", range: "zoom", pos };
	          }
	          return { kind: "canvasEdit", target: { kind: isTop ? "coarseMarkerName" : "coarseMarkerPos", mIdx } };
	        }

	        if (t.id === "__detail_axis__" || t.id === "__marker_axis__") {
	          if (x > plotX + plotWidth) {
	            if (t.id === "__marker_axis__") return { kind: "canvasEdit", target: { kind: "posUnit" } };
	            return null;
	          }
	          if (x < plotX || x > plotX + plotWidth) return null;
		          const xNorm = (x - plotX) / plotWidth;
		          const cIdx = pickColumnIndex(xNorm);
		          if (cIdx < 0 || cIdx >= builderMarkers) return null;
		          if (t.id === "__detail_axis__" && nearAxisLine) {
		            const posRaw = builderMarkerMeta[cIdx]?.pos;
		            const pos = Number.isFinite(posRaw ?? Number.NaN) ? (posRaw as number) : Number.NaN;
		            if (Number.isFinite(pos) && !hasCoarseAxis) return { kind: "rangeSet", range: "chrPeak", pos };
		          }
		          return { kind: "canvasEdit", target: { kind: isTop ? "detailMarkerName" : "detailMarkerPos", cIdx } };
		        }

        const rIdx = rowIdToIndex.get(t.id);
        if (rIdx === undefined) return null;

        if (x >= plotX && x <= plotX + plotWidth) {
          const xNorm = (x - plotX) / plotWidth;
          const cIdx = pickColumnIndex(xNorm);
          if (cIdx < 0 || cIdx >= builderMarkers) return null;
          return { kind: "cell", rIdx, cIdx };
        }

        if (x < plotX) return { kind: "leftLabel", rIdx };
        if (x > plotX + plotWidth) {
          if (showMarkColumn && x >= markHitX0 && x <= markHitX1) return { kind: "mark", rIdx };
          return { kind: "rightLabel", rIdx };
        }
        return null;
      }
      yCursor = y1 + (t.gapAfter ?? rowGap);
    }
    return null;
  };

  const handleBuilderPreviewPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;

    const targetEl = e.target instanceof Element ? e.target : null;
    const uiEl = targetEl?.closest("[data-ggt-ui-handle]") as HTMLElement | null;
    const uiId = (uiEl?.getAttribute("data-ggt-ui-handle") || "").trim();
    if (uiId) {
      const pt = builderSvgPointFromClient(e.clientX, e.clientY);
      if (!pt) return;
      builderUiGuidesRef.current = [];
      builderUiDragRef.current = {
        id: uiId,
        startX: pt.x,
        startY: pt.y,
        initial: { arrowOffsetX: builderArrowOffsetX, arrowOffsetY: builderArrowOffsetY, labelDx: builderArrowLabelDx, labelDy: builderArrowLabelDy },
      };
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }

    if (builderObjectMode) {
      const pt = builderSvgPointFromClient(e.clientX, e.clientY);
      if (!pt) return;
      e.preventDefault();

      const snap = (v: number): number => (builderObjectSnap ? Math.round(v / 5) * 5 : v);
      const color = builderTheme === "light" ? "#111827" : "#e5e7eb";

      const handleEl = targetEl?.closest("[data-ggt-overlay-handle]") as HTMLElement | null;
      const overlayEl = targetEl?.closest("[data-ggt-overlay-id]") as HTMLElement | null;
      const overlayId = (handleEl?.getAttribute("data-ggt-overlay-id") || overlayEl?.getAttribute("data-ggt-overlay-id") || "").trim();
      const handleKind = (handleEl?.getAttribute("data-ggt-overlay-handle") || "").trim() as
        | ""
        | "rect-nw"
        | "rect-ne"
        | "rect-sw"
        | "rect-se"
        | "line-start"
        | "line-end";

      if (overlayId) {
        const ov = builderUserOverlays.find((o) => (o as { id?: unknown }).id === overlayId);
        if (ov) {
          pushUndo(snapshotBuilder());
          builderUiGuidesRef.current = [];
          if (e.altKey && !handleKind) {
            const dupId = `user:${makeId()}`;
            const dup = { ...(ov as Record<string, unknown>), id: dupId } as OverlayShape;
            setBuilderUserOverlays((prev) => [...prev, dup]);
            setBuilderSelectedOverlayId(dupId);
            builderOverlayDragRef.current = { id: dupId, kind: "move", startX: pt.x, startY: pt.y, initial: { ...(dup as Record<string, unknown>) } as OverlayShape };
          } else {
            setBuilderSelectedOverlayId(overlayId);
            builderOverlayDragRef.current = {
              id: overlayId,
              kind: (handleKind || "move") as "move" | "rect-nw" | "rect-ne" | "rect-sw" | "rect-se" | "line-start" | "line-end",
              startX: pt.x,
              startY: pt.y,
              initial: { ...(ov as Record<string, unknown>) } as OverlayShape,
            };
          }
          (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
          return;
        }
      }

      if (builderObjectTool === "text") {
        const id = `user:${makeId()}`;
        const x = snap(pt.x);
        const y = snap(pt.y);
        withBuilderUndo(() =>
          setBuilderUserOverlays((prev) => [
            ...prev,
            {
              kind: "text",
              id,
              x,
              y,
              text: "テキスト",
              fill: color,
              fontSize: 24,
              fontWeight: 900,
              anchor: "start",
              baseline: "hanging",
              layer: "over",
            } satisfies OverlayShape,
          ]),
        );
        setBuilderSelectedOverlayId(id);
        return;
      }

      if (builderObjectTool === "rect" || builderObjectTool === "line" || builderObjectTool === "arrow") {
        const id = `user:${makeId()}`;
        const x0 = snap(pt.x);
        const y0 = snap(pt.y);
        const draft: OverlayShape =
          builderObjectTool === "rect"
            ? ({
              kind: "rect",
              id,
              x: x0,
              y: y0,
              width: 1,
              height: 1,
              fill: "none",
              stroke: color,
              strokeWidth: 3,
              layer: "over",
            } satisfies OverlayShape)
            : ({
              kind: "line",
              id,
              x1: x0,
              y1: y0,
              x2: x0,
              y2: y0,
              stroke: color,
              strokeWidth: 3,
              lineCap: "round",
              markerEnd: builderObjectTool === "arrow" ? "arrow" : undefined,
              layer: "over",
            } satisfies OverlayShape);
        setBuilderDraftOverlay(draft);
        builderOverlayDragRef.current = { kind: "draft", tool: builderObjectTool, startX: x0, startY: y0 };
        (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        return;
      }

      // Object-mode (select): allow existing click-to-edit, but disable painting.
      const hit = pickBuilderPreviewHitFromSvgPoint(e.clientX, e.clientY);
      if (!hit) {
        setBuilderSelectedOverlayId(null);
        return;
      }
      if (hit.kind === "canvasEdit") {
        openBuilderCanvasEditAt(hit.target, e);
        return;
      }
      if (hit.kind === "rangeSet") {
        const pos = hit.pos;
        if (!Number.isFinite(pos)) return;
        if (hit.range === "chrPeak") {
          if (e.shiftKey) setBuilderChrZoomEndMb(pos);
          else setBuilderChrZoomStartMb(pos);
        } else {
          if (e.shiftKey) setBuilderCoarseZoomEndMb(pos);
          else setBuilderCoarseZoomStartMb(pos);
        }
        return;
      }
      if (hit.kind === "leftLabel") {
        openBuilderCanvasEditAt({ kind: "sample", rIdx: hit.rIdx }, e);
        return;
      }
      if (hit.kind === "rightLabel") {
        openBuilderCanvasEditAt({ kind: "rightLabel", rIdx: hit.rIdx }, e);
        return;
      }
      if (hit.kind === "mark") {
        const dir: 1 | -1 = e.shiftKey ? -1 : 1;
        const cur = builderRows[hit.rIdx]?.mark ?? "none";
        const next = cycleNextMark(cur, dir);
        withBuilderUndo(() => setBuilderRowMark(hit.rIdx, next));
        return;
      }
      // cell click is ignored in object mode
      setBuilderSelectedOverlayId(null);
      return;
    }

    const hit = pickBuilderPreviewHitFromSvgPoint(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();

	    if (hit.kind === "canvasEdit") {
	      openBuilderCanvasEditAt(hit.target, e);
	      return;
	    }

	    if (hit.kind === "rangeSet") {
	      const pos = hit.pos;
	      if (!Number.isFinite(pos)) return;
	      if (hit.range === "chrPeak") {
	        if (e.shiftKey) setBuilderChrZoomEndMb(pos);
	        else setBuilderChrZoomStartMb(pos);
	      } else {
	        if (e.shiftKey) setBuilderCoarseZoomEndMb(pos);
	        else setBuilderCoarseZoomStartMb(pos);
	      }
	      return;
	    }

	    if (hit.kind === "cell") {
	      pushUndo(snapshotBuilder());
	      if (builderTool === "cycle") {
	        const dir: 1 | -1 = e.shiftKey ? -1 : 1;
        cycleBuilderRun(hit.rIdx, hit.cIdx, dir);
        return;
      }
      paintRef.current.on = true;
      paintRef.current.code = builderBrush;
      paintRef.current.last = { r: hit.rIdx, c: hit.cIdx };
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      paintBuilderCell(hit.rIdx, hit.cIdx, builderBrush);
      return;
    }

    if (hit.kind === "mark") {
      const dir: 1 | -1 = e.shiftKey ? -1 : 1;
      const cur = builderRows[hit.rIdx]?.mark ?? "none";
      const next = cycleNextMark(cur, dir);
      withBuilderUndo(() => setBuilderRowMark(hit.rIdx, next));
      return;
    }

    if (hit.kind === "leftLabel") {
      openBuilderCanvasEditAt({ kind: "sample", rIdx: hit.rIdx }, e);
      return;
    }
    if (hit.kind === "rightLabel") {
      openBuilderCanvasEditAt({ kind: "rightLabel", rIdx: hit.rIdx }, e);
      return;
    }
  };

  const handleBuilderPreviewPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const uiDrag = builderUiDragRef.current;
    if (uiDrag) {
      const pt = builderSvgPointFromClient(e.clientX, e.clientY);
      const meta = builderUiMetaRef.current;
      if (!pt || !meta) return;
      e.preventDefault();

      const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
      const xNormToDetailPos = (xNormRaw: number): number => {
        const xNorm = clamp(xNormRaw, 0, 1);
        const pts = meta.detailCenters;
        if (!pts.length) return xNorm * meta.chrLenMb;
        if (pts.length === 1) return pts[0].pos;
        if (xNorm <= pts[0].x) return pts[0].pos;
        if (xNorm >= pts[pts.length - 1].x) return pts[pts.length - 1].pos;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          const spanX = b.x - a.x;
          if (spanX <= 0) continue;
          if (xNorm >= a.x && xNorm <= b.x) {
            const t = (xNorm - a.x) / spanX;
            const spanPos = b.pos - a.pos || 1;
            return a.pos + spanPos * t;
          }
        }
        return pts[0].pos;
      };
      const xToDetailPos = (x: number): number => xNormToDetailPos((x - meta.plotX) / Math.max(1, meta.plotWidth));
      const xNormToCoarsePos = (xNormRaw: number): number => {
        const xNorm = clamp(xNormRaw, 0, 1);
        const pts = meta.coarseTicks;
        if (!pts.length) return xNormToDetailPos(xNorm);
        if (pts.length === 1) return pts[0].pos;
        if (xNorm <= pts[0].x) return pts[0].pos;
        if (xNorm >= pts[pts.length - 1].x) return pts[pts.length - 1].pos;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          const spanX = b.x - a.x;
          if (spanX <= 0) continue;
          if (xNorm >= a.x && xNorm <= b.x) {
            const t = (xNorm - a.x) / spanX;
            const spanPos = b.pos - a.pos || 1;
            return a.pos + spanPos * t;
          }
        }
        return pts[0].pos;
      };
      const xToCoarsePos = (x: number): number => xNormToCoarsePos((x - meta.plotX) / Math.max(1, meta.plotWidth));

      const dx = pt.x - uiDrag.startX;
      const dy = pt.y - uiDrag.startY;
      const chrLen = Number.isFinite(meta.chrLenMb) && meta.chrLenMb > 0 ? meta.chrLenMb : 1;

      if (uiDrag.id === "ui-chr-start") {
        const pos = clamp(((pt.x - meta.plotX) / Math.max(1, meta.plotWidth)) * chrLen, 0, chrLen);
        setBuilderChrZoomStartMb(pos);
        return;
      }
	      if (uiDrag.id === "ui-chr-end") {
	        const pos = clamp(((pt.x - meta.plotX) / Math.max(1, meta.plotWidth)) * chrLen, 0, chrLen);
	        setBuilderChrZoomEndMb(pos);
	        return;
	      }
	      if (uiDrag.id === "ui-coarse-zoom-start") {
	        setBuilderCoarseZoomStartMb(xToCoarsePos(pt.x));
	        return;
	      }
      if (uiDrag.id === "ui-coarse-zoom-end") {
        setBuilderCoarseZoomEndMb(xToCoarsePos(pt.x));
        return;
      }
      if (uiDrag.id === "ui-arrow-start") {
        setBuilderArrowStartMb(xToDetailPos(pt.x - uiDrag.initial.arrowOffsetX));
        return;
      }
      if (uiDrag.id === "ui-arrow-end") {
        setBuilderArrowEndMb(xToDetailPos(pt.x - uiDrag.initial.arrowOffsetX));
        return;
      }
      if (uiDrag.id === "ui-arrow-move") {
        setBuilderArrowOffsetX(uiDrag.initial.arrowOffsetX + dx);
        setBuilderArrowOffsetY(uiDrag.initial.arrowOffsetY + dy);
        return;
      }
      if (uiDrag.id === "ui-arrow-label-move") {
        setBuilderArrowLabelDx(uiDrag.initial.labelDx + dx);
        setBuilderArrowLabelDy(uiDrag.initial.labelDy + dy);
        return;
      }
      return;
    }

    if (builderObjectMode) {
      const drag = builderOverlayDragRef.current;
      if (!drag) return;
      const pt = builderSvgPointFromClient(e.clientX, e.clientY);
      if (!pt) return;
      e.preventDefault();
      const snap = (v: number): number => (builderObjectSnap ? Math.round(v / 5) * 5 : v);

      if ("kind" in drag && drag.kind === "draft") {
        setBuilderDraftOverlay((prev) => {
          if (!prev) return prev;
          if ((prev as { kind?: unknown }).kind === "rect") {
            const r = prev as OverlayShape & { kind: "rect" };
            const x1 = snap(pt.x);
            const y1 = snap(pt.y);
            const x0 = drag.startX;
            const y0 = drag.startY;
            const nx = Math.min(x0, x1);
            const ny = Math.min(y0, y1);
            const nw = Math.max(1, Math.abs(x1 - x0));
            const nh = Math.max(1, Math.abs(y1 - y0));
            return { ...r, x: nx, y: ny, width: nw, height: nh };
          }
          if ((prev as { kind?: unknown }).kind === "line") {
            const l = prev as OverlayShape & { kind: "line" };
            let x2 = snap(pt.x);
            let y2 = snap(pt.y);
            if (e.shiftKey) {
              const dx = x2 - drag.startX;
              const dy = y2 - drag.startY;
              const r = Math.hypot(dx, dy);
              if (r > 0) {
                const step = Math.PI / 4;
                const a0 = Math.atan2(dy, dx);
                const a1 = Math.round(a0 / step) * step;
                x2 = snap(drag.startX + Math.cos(a1) * r);
                y2 = snap(drag.startY + Math.sin(a1) * r);
              }
            }
            return { ...l, x2, y2 };
          }
          return prev;
        });
        return;
      }

      if (!("id" in drag)) return;
      const initial = drag.initial;
      const id = drag.id;
      const kind = drag.kind;
      let dx = pt.x - drag.startX;
      let dy = pt.y - drag.startY;
      if (kind === "move" && e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (kind === "move" && builderObjectSnap) {
        dx = Math.round(dx / 5) * 5;
        dy = Math.round(dy / 5) * 5;
      }

      let smartDx = 0;
      let smartDy = 0;
      if (kind === "move" && builderObjectSnap) {
        const canvasW = Number.isFinite(config.width) ? (config.width as number) : 1600;
        const canvasH = Number.isFinite(config.height) ? (config.height as number) : 900;
        const plotX = config.plot?.x ?? 120;
        const plotY = config.plot?.y ?? 92;
        const annotationWidth = config.plot?.annotationWidth ?? 260;
        const plotWidth = config.plot?.width ?? Math.max(200, canvasW - plotX - annotationWidth - 30);

        const textBox = (t: OverlayShape & { kind: "text" }): { x0: number; y0: number; x1: number; y1: number } => {
          const fontSize = t.fontSize ?? (config.styles?.text?.fontSize ?? 18);
          const text = String(t.text || "").trim();
          const w = Math.max(16, Math.round(text.length * fontSize * 0.62));
          const h = Math.max(12, Math.round(fontSize * 1.2));
          const x0 = t.anchor === "middle" ? t.x - w * 0.5 : t.anchor === "end" ? t.x - w : t.x;
          const y0 = t.baseline === "hanging" ? t.y : t.baseline === "middle" || t.baseline === "central" ? t.y - h * 0.5 : t.y - h;
          return { x0, y0, x1: x0 + w, y1: y0 + h };
        };
        const overlayBox = (o: OverlayShape): { x0: number; y0: number; x1: number; y1: number } | null => {
          const k = (o as { kind?: unknown }).kind;
          if (k === "rect") {
            const r = o as OverlayShape & { kind: "rect" };
            const x0 = Math.min(r.x, r.x + r.width);
            const y0 = Math.min(r.y, r.y + r.height);
            const x1 = Math.max(r.x, r.x + r.width);
            const y1 = Math.max(r.y, r.y + r.height);
            return { x0, y0, x1, y1 };
          }
          if (k === "line") {
            const l = o as OverlayShape & { kind: "line" };
            const x0 = Math.min(l.x1, l.x2);
            const y0 = Math.min(l.y1, l.y2);
            const x1 = Math.max(l.x1, l.x2);
            const y1 = Math.max(l.y1, l.y2);
            return { x0, y0, x1, y1 };
          }
          if (k === "text") return textBox(o as OverlayShape & { kind: "text" });
          return null;
        };

        const moved: OverlayShape | null = (() => {
          const k0 = (initial as { kind?: unknown }).kind;
          if (k0 === "rect") {
            const r0 = initial as OverlayShape & { kind: "rect" };
            return { ...r0, x: r0.x + dx, y: r0.y + dy };
          }
          if (k0 === "line") {
            const l0 = initial as OverlayShape & { kind: "line" };
            return { ...l0, x1: l0.x1 + dx, y1: l0.y1 + dy, x2: l0.x2 + dx, y2: l0.y2 + dy };
          }
          if (k0 === "text") {
            const t0 = initial as OverlayShape & { kind: "text" };
            return { ...t0, x: t0.x + dx, y: t0.y + dy };
          }
          return null;
        })();
        const box = moved ? overlayBox(moved) : null;
        if (box) {
          const threshold = 6;
          const x0 = box.x0;
          const x1 = box.x1;
          const y0 = box.y0;
          const y1 = box.y1;
          const xc = (x0 + x1) / 2;
          const yc = (y0 + y1) / 2;
          const otherBoxes = builderUserOverlays
            .filter((o) => String((o as { id?: unknown }).id ?? "") !== id)
            .map((o) => overlayBox(o))
            .filter((b): b is { x0: number; y0: number; x1: number; y1: number } => Boolean(b));

          const xGuides = [
            0,
            canvasW * 0.5,
            canvasW,
            plotX,
            plotX + plotWidth * 0.5,
            plotX + plotWidth,
            ...otherBoxes.flatMap((b) => [b.x0, (b.x0 + b.x1) / 2, b.x1]),
          ];
          const yGuides = [
            0,
            canvasH * 0.5,
            canvasH,
            plotY,
            ...otherBoxes.flatMap((b) => [b.y0, (b.y0 + b.y1) / 2, b.y1]),
          ];

          const pick = (targets: number[], guides: number[]): { delta: number; guide: number } | null => {
            let best: { delta: number; guide: number } | null = null;
            for (const g of guides) {
              if (!Number.isFinite(g)) continue;
              for (const t of targets) {
                if (!Number.isFinite(t)) continue;
                const d = g - t;
                if (Math.abs(d) > threshold) continue;
                if (!best || Math.abs(d) < Math.abs(best.delta)) best = { delta: d, guide: g };
              }
            }
            return best;
          };

          const bestX = pick([x0, xc, x1], xGuides);
          const bestY = pick([y0, yc, y1], yGuides);
          smartDx = bestX?.delta ?? 0;
          smartDy = bestY?.delta ?? 0;
          const guides: EditorUiGuideLine[] = [];
          if (bestX) guides.push({ id: "guide-x", x1: bestX.guide, y1: 0, x2: bestX.guide, y2: canvasH, dash: "4 4" });
          if (bestY) guides.push({ id: "guide-y", x1: 0, y1: bestY.guide, x2: canvasW, y2: bestY.guide, dash: "4 4" });
          builderUiGuidesRef.current = guides;
        } else {
          builderUiGuidesRef.current = [];
        }
      } else {
        builderUiGuidesRef.current = [];
      }
      const moveDx = kind === "move" ? dx + smartDx : dx;
      const moveDy = kind === "move" ? dy + smartDy : dy;

      setBuilderUserOverlays((prev) =>
        prev.map((o) => {
          const oid = (o as { id?: unknown }).id;
          if (oid !== id) return o;
          const oKind = (o as { kind?: unknown }).kind;
          if (oKind === "rect") {
            const r0 = initial as OverlayShape & { kind: "rect" };
            const ix0 = r0.x;
            const iy0 = r0.y;
            const ix1 = r0.x + r0.width;
            const iy1 = r0.y + r0.height;

            if (kind === "move") {
              return { ...r0, x: r0.x + moveDx, y: r0.y + moveDy };
            }

            let nx0 = ix0;
            let ny0 = iy0;
            let nx1 = ix1;
            let ny1 = iy1;
            if (kind === "rect-nw" || kind === "rect-ne" || kind === "rect-sw" || kind === "rect-se") {
              const ratio = Math.abs(r0.width) / Math.max(1, Math.abs(r0.height));
              const fixed =
                kind === "rect-nw" ? { x: ix1, y: iy1 } : kind === "rect-ne" ? { x: ix0, y: iy1 } : kind === "rect-sw" ? { x: ix1, y: iy0 } : { x: ix0, y: iy0 };
              let mx =
                kind === "rect-nw" || kind === "rect-sw" ? ix0 + dx : ix1 + dx;
              let my =
                kind === "rect-nw" || kind === "rect-ne" ? iy0 + dy : iy1 + dy;
              if (e.shiftKey) {
                const w = mx - fixed.x;
                const h = my - fixed.y;
                if (Math.abs(w) >= Math.abs(h) * ratio) my = fixed.y + Math.sign(h || 1) * (Math.abs(w) / ratio);
                else mx = fixed.x + Math.sign(w || 1) * (Math.abs(h) * ratio);
              }
              mx = snap(mx);
              my = snap(my);
              if (kind === "rect-nw") {
                nx0 = mx;
                ny0 = my;
              } else if (kind === "rect-ne") {
                nx1 = mx;
                ny0 = my;
              } else if (kind === "rect-sw") {
                nx0 = mx;
                ny1 = my;
              } else if (kind === "rect-se") {
                nx1 = mx;
                ny1 = my;
              }
            }
            const x = Math.min(nx0, nx1);
            const y = Math.min(ny0, ny1);
            const width = Math.max(1, Math.abs(nx1 - nx0));
            const height = Math.max(1, Math.abs(ny1 - ny0));
            return { ...r0, x, y, width, height };
          }
          if (oKind === "line") {
            const l0 = initial as OverlayShape & { kind: "line" };
            if (kind === "move") {
              return { ...l0, x1: l0.x1 + moveDx, y1: l0.y1 + moveDy, x2: l0.x2 + moveDx, y2: l0.y2 + moveDy };
            }
            if (kind === "line-start") {
              let x1 = pt.x;
              let y1 = pt.y;
              if (e.shiftKey) {
                const dx = x1 - l0.x2;
                const dy = y1 - l0.y2;
                const r = Math.hypot(dx, dy);
                if (r > 0) {
                  const step = Math.PI / 4;
                  const a0 = Math.atan2(dy, dx);
                  const a1 = Math.round(a0 / step) * step;
                  x1 = l0.x2 + Math.cos(a1) * r;
                  y1 = l0.y2 + Math.sin(a1) * r;
                }
              }
              return { ...l0, x1: snap(x1), y1: snap(y1) };
            }
            if (kind === "line-end") {
              let x2 = pt.x;
              let y2 = pt.y;
              if (e.shiftKey) {
                const dx = x2 - l0.x1;
                const dy = y2 - l0.y1;
                const r = Math.hypot(dx, dy);
                if (r > 0) {
                  const step = Math.PI / 4;
                  const a0 = Math.atan2(dy, dx);
                  const a1 = Math.round(a0 / step) * step;
                  x2 = l0.x1 + Math.cos(a1) * r;
                  y2 = l0.y1 + Math.sin(a1) * r;
                }
              }
              return { ...l0, x2: snap(x2), y2: snap(y2) };
            }
            return l0;
          }
          if (oKind === "text") {
            const t0 = initial as OverlayShape & { kind: "text" };
            if (kind !== "move") return t0;
            return { ...t0, x: t0.x + moveDx, y: t0.y + moveDy };
          }
          return o;
        }),
      );
      return;
    }

    if (builderTool === "cycle") return;
    if (!paintRef.current.on) return;
    const hit = pickBuilderPreviewHitFromSvgPoint(e.clientX, e.clientY);
    if (!hit || hit.kind !== "cell") return;
    const last = paintRef.current.last;
    if (last && last.r === hit.rIdx && last.c === hit.cIdx) return;
    paintRef.current.last = { r: hit.rIdx, c: hit.cIdx };
    paintBuilderCell(hit.rIdx, hit.cIdx, paintRef.current.code);
  };

  const handleBuilderPreviewPointerUp = (): void => {
    if (builderUiDragRef.current) {
      builderUiDragRef.current = null;
      builderUiGuidesRef.current = [];
      return;
    }

    if (builderObjectMode) {
      const drag = builderOverlayDragRef.current;
      if (drag && "kind" in drag && drag.kind === "draft") {
        const draft = builderDraftOverlay;
        if (draft) {
          const ok = (() => {
            const k = (draft as { kind?: unknown }).kind;
            if (k === "rect") {
              const r = draft as OverlayShape & { kind: "rect" };
              return r.width >= 4 && r.height >= 4;
            }
            if (k === "line") {
              const l = draft as OverlayShape & { kind: "line" };
              const dx = l.x2 - l.x1;
              const dy = l.y2 - l.y1;
              return Math.hypot(dx, dy) >= 6;
            }
            return true;
          })();
          if (ok) {
            withBuilderUndo(() => setBuilderUserOverlays((prev) => [...prev, draft]));
            setBuilderSelectedOverlayId(typeof (draft as { id?: unknown }).id === "string" ? (draft as { id: string }).id : null);
          }
        }
        setBuilderDraftOverlay(null);
      }
      builderOverlayDragRef.current = null;
      builderUiGuidesRef.current = [];
      return;
    }

    paintRef.current.on = false;
    paintRef.current.last = undefined;
    builderUiGuidesRef.current = [];
  };

  const builderRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (tab !== "builder") return;
    if (builderRafRef.current !== null) {
      window.cancelAnimationFrame(builderRafRef.current);
      builderRafRef.current = null;
    }
    builderRafRef.current = window.requestAnimationFrame(() => {
      builderRafRef.current = null;
      try {
        applyConfig(makeConfigFromBuilder(), "builder_generated", { silent: true, syncText: false });
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      if (builderRafRef.current !== null) {
        window.cancelAnimationFrame(builderRafRef.current);
        builderRafRef.current = null;
      }
    };
  }, [
    tab,
    builderMarkers,
    builderMarkerMeta,
    builderScaleByPos,
    builderLeftLabels,
    builderShowMarkerAxis,
    builderGuides,
    builderGuideMode,
    builderHeaderLeft,
    builderHeaderRight,
    builderPosUnit,
    builderFigureMode,
    builderChrLabel,
    builderChrLenMb,
    builderCoarseMarkersDraft,
    builderZoomStages,
    builderChrZoomStartMb,
    builderChrZoomEndMb,
    builderCoarseZoomStartMb,
    builderCoarseZoomEndMb,
    builderFaLabel,
    builderLocusLabelText,
    builderArrowLabel,
    builderArrowLabelAuto,
    builderArrowStartMb,
    builderArrowEndMb,
    builderArrowOffsetX,
    builderArrowOffsetY,
    builderArrowLabelDx,
    builderArrowLabelDy,
    builderFigureTitle,
    builderGenoLegendA,
    builderGenoLegendB,
    builderGenoLegendH,
    builderHighlightMarkers,
    builderRows,
    builderPaletteId,
    builderTheme,
    builderCompressRuns,
    builderCanvasWidth,
    builderAnnotationWidth,
    builderRowHeight,
    builderRowGap,
    builderUserOverlays,
    baseName,
  ]);

  useEffect(() => {
    if (tab !== "builder") return;
    if (builderEditMode !== "preview") return;
    try {
      applyConfig(makeConfigFromBuilder(), "builder_generated", { silent: true, syncText: false });
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  }, [tab, builderEditMode]);

  useEffect(() => {
    if (tab === "builder") return;
    if (builderRafRef.current !== null) {
      window.cancelAnimationFrame(builderRafRef.current);
      builderRafRef.current = null;
    }
  }, [tab]);

  useEffect(
    () => () => {
      if (builderRafRef.current !== null) {
        window.cancelAnimationFrame(builderRafRef.current);
        builderRafRef.current = null;
      }
    },
    [],
  );

  const generateFromTsv = (text: string, nameHint?: string): void => {
    try {
      const parsed = parseTsvToMatrix(text);
      const next = makeConfigFromMatrix(parsed.markers, parsed.rows, {
        baseName: nameHint || baseName,
        paletteId: tsvPaletteId,
        theme: tsvTheme,
        sortMarkers: tsvSortMarkers,
        compressRuns: tsvCompressRuns,
        scaleByPosition: tsvScaleByPos,
      });
      applyConfig(next, "tsv_generated");
      setMatrixData({
        source: "tsv",
        baseName: (nameHint || baseName).trim() || baseName,
        markers: parsed.markers,
        rows: parsed.rows,
        render: {
          paletteId: tsvPaletteId,
          theme: tsvTheme,
          sortMarkers: tsvSortMarkers,
          compressRuns: tsvCompressRuns,
          scaleByPosition: tsvScaleByPos,
        },
      });
      setTab("export");
    } catch (e) {
      setMessage("");
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  };

  const analyzeFlapjack = (): void => {
    try {
      const mapMarkers = parseFlapjackMap(fjMapText);
      const geno = parseFlapjackGenotype(fjGenoText);
      const names = geno.rows.map((r) => r.sample);
      setFjSampleNames(names);
      const { a, b } = guessParents(names);
      if (!fjParentA || !names.includes(fjParentA)) setFjParentA(a || "");
      if (!fjParentB || !names.includes(fjParentB)) setFjParentB(b || "");

      const genoSet = new Set(geno.markerNames);
      const matchedMarkers = mapMarkers.filter((m) => genoSet.has(m.name)).length;
      setFjStats({ mapMarkers: mapMarkers.length, genoMarkers: geno.markerNames.length, matchedMarkers, samples: names.length });
      setFjError("");
      setMessage("Flapjack を解析しました。親A/親Bを確認して生成してください。");
    } catch (e) {
      setFjError(e instanceof Error ? e.message : String(e));
      setFjStats(null);
    }
  };

  const generateFromFlapjack = (args?: { mapText?: string; genoText?: string; parentA?: string; parentB?: string; nameHint?: string }): void => {
    try {
      const parsed = makeAbhMatrixFromFlapjack({
        mapText: args?.mapText ?? fjMapText,
        genotypeText: args?.genoText ?? fjGenoText,
        parentA: args?.parentA ?? (fjParentA || undefined),
        parentB: args?.parentB ?? (fjParentB || undefined),
      });
      setFjSampleNames(parsed.sampleNames);
      const { a, b } = guessParents(parsed.sampleNames);
      if (!fjParentA && a) setFjParentA(a);
      if (!fjParentB && b) setFjParentB(b);

      const next = makeConfigFromMatrix(parsed.markers, parsed.rows, {
        baseName: args?.nameHint || baseName,
        paletteId: fjPaletteId,
        theme: fjTheme,
        sortMarkers: true,
        compressRuns: fjCompressRuns,
        scaleByPosition: fjScaleByPos,
      });
      applyConfig(next, "flapjack_generated");
      setMatrixData({
        source: "flapjack",
        baseName: (args?.nameHint || baseName).trim() || baseName,
        markers: parsed.markers,
        rows: parsed.rows,
        render: {
          paletteId: fjPaletteId,
          theme: fjTheme,
          sortMarkers: true,
          compressRuns: fjCompressRuns,
          scaleByPosition: fjScaleByPos,
        },
      });
      setTab("export");
      setFjError("");
    } catch (e) {
      setMessage("");
      setFjError(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async (): Promise<void> => {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      if (exportFormat === "svg") {
        downloadSvg(svgRef.current, { baseName, width: exportWidth, height: exportHeight });
        return;
      }
      await downloadJpegFromSvg(svgRef.current, {
        baseName,
        width: exportWidth,
        height: exportHeight,
        quality: jpegQuality,
      });
    } finally {
      setBusy(false);
    }
  };

  const setExportToConfigSize = (): void => {
    if (!Number.isFinite(config.width) || !Number.isFinite(config.height)) return;
    setExportWidth(Math.max(1, Math.floor(config.width)));
    setExportHeight(Math.max(1, Math.floor(config.height)));
  };

  const tabHint = useMemo(() => {
    if (tab === "quick") return { title: "Quick Start", desc: "まずは入力方法を選び、生成して保存します。" };
    if (tab === "builder") return { title: "Builder", desc: "段数（行）と遺伝子型を選んで、クリック/ドラッグで作ります。" };
    if (tab === "tsv") return { title: "TSV Import", desc: "A/B/H/- の表を貼り付ける or ファイル選択して生成します。" };
    if (tab === "flapjack") return { title: "Flapjack Import", desc: "MAP+GENOTYPE を貼り付け、親A/親B基準で ABH へ変換します。" };
    if (tab === "template") return { title: "Templates", desc: "見た目の雛形を選んで編集の起点にします。" };
    if (tab === "ops") return { title: "操作", desc: "平滑化/欠測補完/並び替えなどを GUI で適用します。" };
    if (tab === "export") return { title: "Export", desc: "SVG / JPEG（4Kなど）で保存します。" };
    return { title: "Advanced", desc: "JSON を直接編集して細かく調整します。" };
  }, [tab]);

  const stats = useMemo(() => {
    const tracks = Array.isArray(config.tracks) ? config.tracks.length : 0;
    const cols = config.columns ?? 0;
    const groups = Array.isArray(config.columnGroups) ? config.columnGroups.length : 0;
    return { tracks, cols, groups, w: config.width, h: config.height };
  }, [config]);

  const updateMatrixRender = (patch: Partial<MatrixRenderOpts>): void => {
    setMatrixData((prev) => (prev ? { ...prev, render: { ...prev.render, ...patch } } : prev));
  };

  const opsDerived = useMemo(() => {
    if (!matrixData) return null;

    const baseMarkers = matrixData.markers.map((m) => ({ ...m }));
    const baseRows = matrixData.rows.map((r) => ({ sample: r.sample, codes: r.codes.slice() }));
    const sorted = sortMatrixByChrPos(baseMarkers, baseRows, matrixData.render.sortMarkers);
    let markers = sorted.markers;
    let rows = sorted.rows;

    const hasChr = markers.some((m) => Boolean((m.chr || "").trim()));
    const hasPos = markers.some((m) => Number.isFinite(m.pos ?? Number.NaN));
    const chrs = uniqueChromosomes(markers);

    const allRegion: Region = { start: 0, end: markers.length };
    let region: Region = allRegion;
    let regionError = "";

    if (opsRegionEnabled) {
      if (hasChr && opsRegionChr !== "All") {
        const r = resolveRegionByChrPos(markers, { chr: opsRegionChr, startPos: opsRegionStartPos, endPos: opsRegionEndPos });
        if (r) region = r;
        else regionError = "指定領域が空です。";
      } else {
        const r = resolveRegionByIndex({ total: markers.length, start1: opsRegionStartIdx1, end1: opsRegionEndIdx1 });
        if (r) region = r;
        else regionError = "指定領域が空です。";
      }
    }

    const doCrop = opsRegionEnabled && opsCropToRegion;
    if (doCrop) {
      const sliced = sliceMatrix(markers, rows, region);
      markers = sliced.markers;
      rows = sliced.rows;
    }

    rows = applyImputeAndSmooth(markers, rows, {
      impute: opsImpute,
      imputeH: opsImputeH,
      smooth: opsSmooth,
      smoothH: opsSmoothH,
    });

    if (opsRowSort === "id") rows = sortRowsBySampleId(rows);
    if (opsRowSort === "region") {
      const r = doCrop ? { start: 0, end: markers.length } : region;
      rows = sortRowsByRegionFraction(rows, r, opsTargetCode);
    }

    return { markers, rows, hasChr, hasPos, chrs, region, doCrop, regionError };
  }, [
    matrixData,
    opsRegionEnabled,
    opsCropToRegion,
    opsRegionChr,
    opsRegionStartPos,
    opsRegionEndPos,
    opsRegionStartIdx1,
    opsRegionEndIdx1,
    opsImpute,
    opsImputeH,
    opsSmooth,
    opsSmoothH,
    opsRowSort,
    opsTargetCode,
  ]);

  const opsConfig = useMemo(() => {
    if (!matrixData || !opsDerived) return null;
    const next = makeConfigFromMatrix(opsDerived.markers, opsDerived.rows, {
      baseName: matrixData.baseName,
      paletteId: matrixData.render.paletteId,
      theme: matrixData.render.theme,
      sortMarkers: false,
      compressRuns: matrixData.render.compressRuns,
      scaleByPosition: matrixData.render.scaleByPosition,
    });

    if (!matrixData.rowMeta) return next;
    const textFill = matrixData.render.theme === "light" ? "#111827" : "#e5e7eb";
    const hi = "#ff2d2d";
    const tracks = next.tracks.map((t) => {
      const meta = matrixData.rowMeta?.[t.id];
      if (!meta) return t;
      const legacyCircle = Boolean((meta as unknown as { circle?: unknown })?.circle ?? false);
      const mark: BuilderMark = meta.mark || (legacyCircle ? "circle" : "none");
      const labelFill = meta.labelRed ? hi : textFill;
      return {
        ...t,
        rightText: { ...(t.rightText || {}), text: meta.label, fill: labelFill },
        rightCircle: mark === "circle" ? { stroke: hi, strokeWidth: 6, r: 14 } : undefined,
        rightCross: mark === "cross" ? { stroke: textFill, strokeWidth: 6, size: 18 } : undefined,
      };
    });
    return { ...next, tracks };
  }, [matrixData, opsDerived]);

  const opsRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (tab !== "ops") return;
    if (!opsConfig) return;
    if (opsRafRef.current !== null) {
      window.cancelAnimationFrame(opsRafRef.current);
      opsRafRef.current = null;
    }
    opsRafRef.current = window.requestAnimationFrame(() => {
      opsRafRef.current = null;
      applyConfig(opsConfig, undefined, { silent: true, syncText: false });
    });
    return () => {
      if (opsRafRef.current !== null) {
        window.cancelAnimationFrame(opsRafRef.current);
        opsRafRef.current = null;
      }
    };
  }, [tab, opsConfig]);

  const resetOps = (): void => {
    setOpsSmooth(false);
    setOpsSmoothH(false);
    setOpsImpute(false);
    setOpsImputeH(false);
    setOpsRowSort("input");
    setOpsTargetCode("A");
    setOpsRegionEnabled(false);
    setOpsCropToRegion(false);
    setOpsRegionChr("All");
    setOpsRegionStartPos(0);
    setOpsRegionEndPos(0);
  };

  const setOpsIndexToAll = (): void => {
    if (!matrixData) return;
    setOpsRegionStartIdx1(1);
    setOpsRegionEndIdx1(Math.max(1, matrixData.markers.length));
  };

  const setOpsPosToChrFull = (): void => {
    if (!matrixData) return;
    const chr = (opsRegionChr || "").trim();
    if (!chr || chr === "All") return;
    const poss = matrixData.markers
      .filter((m) => (m.chr || "").trim() === chr)
      .map((m) => m.pos)
      .filter((v) => Number.isFinite(v ?? Number.NaN)) as number[];
    if (!poss.length) return;
    setOpsRegionStartPos(Math.min(...poss));
    setOpsRegionEndPos(Math.max(...poss));
  };

  const downloadOpsTsv = (): void => {
    if (!matrixData || !opsDerived) return;
    const tsv = matrixToTsv(opsDerived.markers, opsDerived.rows, { includeMeta: true });
    const name = safeFileBase(matrixData.baseName);
    downloadTextFile(tsv, `${name}_ops_${timestampForFile()}.tsv`, "text/tab-separated-values;charset=utf-8");
  };

  const builderGridQuery = builderRowQuery.trim().toLowerCase();
  const builderGridAllIndices = builderGridQuery
    ? builderRows
        .map((_, idx) => idx)
        .filter((idx) => {
          const r = builderRows[idx];
          const hay = `${r.sample}\n${r.rightLabel}\n${r.annotations.join("\t")}`.toLowerCase();
          return hay.includes(builderGridQuery);
        })
    : builderRows.map((_, idx) => idx);
  const builderGridTotal = builderGridAllIndices.length;
  const builderGridVisibleCount = Math.max(1, Math.round(builderGridRowCount) || 1);
  const builderGridVisibleStart = Math.max(
    0,
    Math.min(builderGridRowStart, Math.max(0, builderGridTotal - builderGridVisibleCount)),
  );
  const builderGridVisibleEnd = Math.min(builderGridTotal, builderGridVisibleStart + builderGridVisibleCount);
  const builderGridVisibleIndices = builderGridAllIndices.slice(builderGridVisibleStart, builderGridVisibleEnd);
  const builderGridVisibleRows = builderGridVisibleIndices.map((i) => builderRows[i]);
  const builderVisibleAnnoCols = builderAnnoCols
    .map((col, idx) => ({ col, idx }))
    .filter((v) => v.col.visible);
  if (builderVisibleAnnoCols.length === 0 && builderAnnoCols.length > 0) builderVisibleAnnoCols.push({ col: builderAnnoCols[0], idx: 0 });

  const builderGrid = (
    <div
      className="ggt-builder-grid"
      onPointerDown={handleBuilderPointerDown}
      onPointerMove={handleBuilderPointerMove}
      onPointerUp={handleBuilderPointerUp}
	      onPointerCancel={handleBuilderPointerUp}
	      onPointerLeave={handleBuilderPointerUp}
	    >
	      {builderGridVisibleRows.map((row, localIdx) => {
	        const rIdx = builderGridVisibleIndices[localIdx] ?? -1;
	        if (rIdx < 0) return null;
	        return (
			        <div
			          key={row.id}
			          className="ggt-builder-row"
			          onDragOver={(e) => {
			            if (builderEditMode !== "grid") return;
			            e.preventDefault();
			            e.dataTransfer.dropEffect = "move";
			          }}
			          onDrop={(e) => {
			            if (builderEditMode !== "grid") return;
			            e.preventDefault();
			            const to = rIdx;
			            const fromDirect = builderRowDragRef.current;
			            const fromDt = Number(e.dataTransfer.getData("text/plain"));
			            const from = typeof fromDirect === "number" ? fromDirect : fromDt;
			            builderRowDragRef.current = null;
			            if (!Number.isFinite(from) || from < 0) return;
			            if (from === to) return;
			            withBuilderUndo(() =>
			              setBuilderRows((prev) => {
			                if (from < 0 || from >= prev.length) return prev;
			                const out = [...prev];
			                const [moved] = out.splice(from, 1);
			                if (!moved) return prev;
			                const insertAt = Math.max(0, Math.min(out.length, from < to ? to - 1 : to));
			                out.splice(insertAt, 0, moved);
			                return out;
			              }),
			            );
			          }}
			        >
			          <div className="ggt-builder-row-meta">
			            <button
			              type="button"
			              className="ggt-mini-btn"
			              title="ドラッグで行を並び替え"
			              draggable
			              onDragStart={(e) => {
			                builderRowDragRef.current = rIdx;
			                e.dataTransfer.setData("text/plain", String(rIdx));
			                e.dataTransfer.effectAllowed = "move";
			              }}
			              onDragEnd={() => {
			                builderRowDragRef.current = null;
			              }}
			              style={{ cursor: "grab", width: 44 }}
			            >
			              ↕
			            </button>
			            <input
			              className="seq-input ggt-builder-row-name"
			              value={row.sample}
		              onChange={(e) => setBuilderRowSample(rIdx, e.target.value)}
	              placeholder={`R${rIdx + 1}`}
	            />
	            {builderVisibleAnnoCols.map(({ col, idx }) => (
	              <input
	                key={`${row.id}-anno-${idx}`}
	                className="seq-input ggt-builder-row-label"
	                value={row.annotations[idx] ?? ""}
	                onChange={(e) => setBuilderRowAnnotationValue(rIdx, idx, e.target.value)}
	                placeholder={col.header ? col.header : `Col${idx + 1}`}
	              />
	            ))}
	            <div className="ggt-builder-row-flags">
	              <label className="ggt-builder-row-flag" title="右ラベルを赤">
	                <input
	                  type="checkbox"
                  checked={row.labelRed}
                  onChange={(e) => withBuilderUndo(() => setBuilderRowLabelRed(rIdx, e.target.checked))}
                />
                赤
              </label>
              <label className="ggt-builder-row-flag" title="右側の記号">
                <select
                  className="ggt-select ggt-builder-row-mark"
                  value={row.mark}
                  onChange={(e) => withBuilderUndo(() => setBuilderRowMark(rIdx, e.target.value as BuilderMark))}
                >
                  <option value="none">-</option>
                  <option value="circle">○</option>
                  <option value="cross">×</option>
                </select>
              </label>
            </div>
            <div className="ggt-builder-row-actions">
              <button type="button" className="ggt-mini-btn" title="行をブラシで塗りつぶし" onClick={() => fillRowWith(rIdx, builderBrush)}>
                Fill
              </button>
              <button type="button" className="ggt-mini-btn" title="行をクリア" onClick={() => clearRow(rIdx)}>
                Clear
              </button>
              <button type="button" className="ggt-mini-btn" title="A/B 入れ替え" onClick={() => swapRowAB(rIdx)}>
                Swap
              </button>
              <button type="button" className="ggt-mini-btn" title="行を複製" onClick={() => duplicateRow(rIdx)}>
                Dup
              </button>
              <button type="button" className="ggt-mini-btn" title="上へ" onClick={() => moveRow(rIdx, -1)} disabled={rIdx === 0}>
                ↑
              </button>
              <button type="button" className="ggt-mini-btn" title="下へ" onClick={() => moveRow(rIdx, 1)} disabled={rIdx === builderRows.length - 1}>
                ↓
              </button>
              <button type="button" className="ggt-mini-btn danger" title="行を削除" onClick={() => deleteRow(rIdx)} disabled={builderRows.length <= 1}>
                Del
              </button>
            </div>
          </div>

          <div
            className="ggt-builder-row-cells"
            style={{
              gridTemplateColumns: `repeat(${builderMarkers}, ${builderCellSize}px)`,
              gridAutoRows: `${builderCellSize}px`,
            }}
          >
            {row.codes.slice(0, builderMarkers).map((code, cIdx) => (
              (() => {
                const marker = builderMarkerMeta[cIdx];
                const name = (marker?.name || "").trim() || `m${cIdx + 1}`;
                const chr = (marker?.chr || "").trim();
                const pos = marker?.pos;
                const loc = chr
                  ? `${chr}${Number.isFinite(pos ?? Number.NaN) ? `:${pos}` : ""}`
                  : Number.isFinite(pos ?? Number.NaN)
                    ? String(pos)
                    : "";
                const rowLabel = (row.sample || "").trim() || row.id;
                const cellLabel = `${rowLabel} / ${name}${loc ? ` (${loc})` : ""} = ${code}`;
                return (
              <button
                key={`${row.id}-${cIdx}`}
                type="button"
                className="ggt-cell"
                data-r={rIdx}
                data-c={cIdx}
                title={cellLabel}
                aria-label={cellLabel}
                style={{ background: builderColorFor(code) }}
              />
                );
              })()
            ))}
          </div>

          <div className="ggt-builder-row-preview">
            <span className={`ggt-builder-row-preview-mark is-${row.mark}`}>
              {row.mark === "circle" ? "○" : row.mark === "cross" ? "×" : ""}
            </span>
	            <span className={`ggt-builder-row-preview-label ${row.labelRed ? "is-red" : ""}`}>
	              {(row.rightLabel || "").trim() || (row.sample || "").trim() || `Row ${rIdx + 1}`}
	            </span>
	          </div>
	        </div>
	      );
	    })}
    </div>
  );

  const builderCanvasToolbar = (
    <div className="ggt-builder-toolbar">
      <div className="ggt-actions">
        <button
          type="button"
          className="seq-button"
          onClick={() => setBuilderEditMode((prev) => (prev === "grid" ? "preview" : "grid"))}
        >
          {builderEditMode === "grid" ? "プレビューで編集" : "グリッド編集"}
        </button>

        <button
          type="button"
          className={`ggt-brush ${builderTool === "brush" ? "is-active" : ""}`}
          onClick={() => setBuilderTool("brush")}
          title="ブラシ（ドラッグで塗る）"
        >
          ブラシ
        </button>
        <button
          type="button"
          className={`ggt-brush ${builderTool === "cycle" ? "is-active" : ""}`}
          onClick={() => setBuilderTool("cycle")}
          title="クリックで色を順番に切替（Shiftで逆）"
        >
          クリック循環
        </button>
	        <select
	          className="ggt-select"
	          value={builderCycleOrder}
	          onChange={(e) => setBuilderCycleOrder(e.target.value as BuilderCycleOrder)}
          disabled={builderTool !== "cycle"}
          title="クリック循環の順番（1/2キーでも切替）"
          style={{ width: 220 }}
	        >
	          <option value="AB-">A→B→-（3色）</option>
	          <option value="AHB-">A→H→B→-（4色）</option>
	        </select>

		        {builderEditMode === "grid" ? (
		          <div className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
		            行 {builderGridTotal ? builderGridVisibleStart + 1 : 0}〜{builderGridVisibleEnd} / {builderGridTotal}
		            <button
		              type="button"
		              className="ggt-mini-btn"
		              title="前の行へ"
		              onClick={() => setBuilderGridRowStart((s) => Math.max(0, s - builderGridVisibleCount))}
		            >
		              ◀
		            </button>
		            <button
		              type="button"
		              className="ggt-mini-btn"
		              title="次の行へ"
		              onClick={() =>
		                setBuilderGridRowStart((s) => Math.min(Math.max(0, builderGridTotal - builderGridVisibleCount), s + builderGridVisibleCount))
		              }
		            >
		              ▶
		            </button>
		            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
		              開始
		              <input
		                className="seq-input"
		                type="number"
		                min={1}
		                max={Math.max(1, builderGridTotal)}
		                value={builderGridTotal ? builderGridVisibleStart + 1 : 1}
		                onChange={(e) => {
		                  const n = Number(e.target.value);
		                  if (!Number.isFinite(n)) return;
		                  setBuilderGridRowStart(Math.max(0, Math.min(builderGridTotal - 1, Math.round(n) - 1)));
		                }}
		                style={{ width: 86 }}
		              />
		            </label>
		            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
		              表示数
	              <input
	                className="seq-input"
	                type="number"
	                min={1}
	                max={200}
	                value={builderGridVisibleCount}
	                onChange={(e) => {
	                  const n = Number(e.target.value);
	                  if (!Number.isFinite(n)) return;
	                  setBuilderGridRowCount(Math.max(1, Math.min(200, Math.round(n))));
		                }}
		                style={{ width: 86 }}
		              />
		            </label>
		            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
		              検索
		              <input
		                className="seq-input"
		                value={builderRowQuery}
		                onChange={(e) => {
		                  setBuilderRowQuery(e.target.value);
		                  setBuilderGridRowStart(0);
		                }}
	                  placeholder="Sample/Trait"
		                style={{ width: 180 }}
		              />
		            </label>
		            <button
		              type="button"
		              className="ggt-mini-btn"
		              title="検索をクリア"
		              onClick={() => {
		                setBuilderRowQuery("");
		                setBuilderGridRowStart(0);
		              }}
		              disabled={!builderRowQuery.trim()}
		            >
		              クリア
		            </button>
		            <button
		              type="button"
		              className="ggt-mini-btn"
		              title="系統名で並び替え（Undo可）"
		              onClick={() =>
		                withBuilderUndo(() =>
		                  setBuilderRows((prev) =>
		                    [...prev].sort((a, b) =>
		                      String(a.sample || "").localeCompare(String(b.sample || ""), undefined, { numeric: true, sensitivity: "base" }),
		                    ),
		                  ),
		                )
		              }
		            >
		              名前順
		            </button>
		          </div>
		        ) : null}

	        <button
	          type="button"
		          className={`ggt-brush ${builderObjectMode ? "is-active" : ""}`}
	          onClick={() => {
	            setBuilderObjectMode((prev) => {
	              const next = !prev;
	              if (!next) setBuilderSelectedOverlayId(null);
	              return next;
	            });
	            setBuilderDraftOverlay(null);
	            builderOverlayDragRef.current = null;
	          }}
          title="PowerPoint風：テキスト/図形/矢印を配置して編集"
        >
          オブジェクト
        </button>
        {builderObjectMode ? (
          <>
            {([
              { id: "select", label: "選択" },
              { id: "text", label: "テキスト" },
              { id: "rect", label: "四角" },
              { id: "line", label: "線" },
              { id: "arrow", label: "矢印" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ggt-brush ${builderObjectTool === t.id ? "is-active" : ""}`}
                onClick={() => setBuilderObjectTool(t.id)}
                title="オブジェクトツール"
              >
                {t.label}
              </button>
            ))}
            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="座標を 5px 単位で吸着">
              <input type="checkbox" checked={builderObjectSnap} onChange={(e) => setBuilderObjectSnap(e.target.checked)} />
              スナップ
            </label>
          </>
        ) : null}

        <div className="ggt-actions" style={{ gap: 6 }}>
          {([
            { code: "A" as const, label: "A" },
            { code: "H" as const, label: "H" },
            { code: "B" as const, label: "B" },
            { code: "-" as const, label: "-" },
          ] as const).map((b) => (
            <button
              key={b.code}
              type="button"
              className={`ggt-brush ${builderBrush === b.code ? "is-active" : ""}`}
              onClick={() => setBuilderBrush(b.code)}
              title="ブラシ色"
            >
              <span className="ggt-brush-swatch" style={{ background: builderColorFor(b.code) }} />
              {b.label}
            </button>
          ))}
        </div>

        <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={builderGuides} onChange={(e) => setBuilderGuides(e.target.checked)} />
          ガイド
        </label>
        <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={builderShowMarkerAxis} onChange={(e) => setBuilderShowMarkerAxis(e.target.checked)} />
          軸
        </label>

        <div
          className="ggt-muted"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          title="プレビューの拡大率（編集しやすさ）"
        >
          Zoom {Math.round(builderPreviewZoom * 100)}%
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={builderPreviewZoom}
            onChange={(e) => setBuilderPreviewZoom(Math.min(3, Math.max(0.5, Number(e.target.value))))}
            style={{ width: 160 }}
          />
          <button type="button" className="ggt-mini-btn" onClick={() => setBuilderPreviewZoom(1)}>
            100%
          </button>
        </div>

        <button type="button" className="seq-button secondary" onClick={doUndoBuilder} disabled={undoSize <= 0}>
          Undo
        </button>
        <button type="button" className="seq-button secondary" onClick={doRedoBuilder} disabled={redoSize <= 0}>
          Redo
        </button>
      </div>
      <div className="ggt-muted">
        {builderObjectMode
	          ? "オブジェクト編集: ドラッグで移動、ハンドルでサイズ変更。Alt+ドラッグ=複製して移動。Shift=水平/垂直（線は45°）。スナップON=スマートガイド。Delete=削除、Ctrl+D=複製、矢印キー=微調整（Shiftで10px）。※セル塗りはオブジェクトOFFで行います。"
	          : builderTool === "cycle"
	            ? "クリック循環: クリック=次へ / Shift+クリック=逆順。テキスト（タイトル/Chr/マーカー/凡例など）はクリックで編集。Chrバー/軸の線クリックでズーム範囲を設定（Shiftでend）。青いハンドルをドラッグでChr赤バー/広域→詳細/↔を調整。1/2=循環順、C=ツール切替、Ctrl+Z/Y=Undo/Redo、Ctrl+S=プロジェクト保存。"
	            : "ショートカット: A/B/H/-=ブラシ、C=ツール切替、G/P=グリッド/プレビュー、Ctrl+Z/Y=Undo/Redo、Ctrl+S=プロジェクト保存、[/]=ズーム。テキスト（タイトル/Chr/マーカー/凡例など）はクリックで編集。Chrバー/軸の線クリックでズーム範囲を設定（Shiftでend）。青いハンドルをドラッグでChr赤バー/広域→詳細/↔を調整。"}
	      </div>
	    </div>
	  );

  const builderCanvasEditPopover = (() => {
    const edit = builderCanvasEdit;
    if (!edit) return null;

    const rIdx = typeof edit.rIdx === "number" ? edit.rIdx : -1;
    const row = rIdx >= 0 ? builderRows[rIdx] : undefined;
    const cIdx = typeof edit.cIdx === "number" ? edit.cIdx : -1;
    const mIdx = typeof edit.mIdx === "number" ? edit.mIdx : -1;

    const coarseMarkers = edit.kind === "coarseMarkerName" || edit.kind === "coarseMarkerPos" ? parseCoarseMarkersText(builderCoarseMarkersDraft) : [];
    const coarse = mIdx >= 0 ? coarseMarkers[mIdx] : undefined;
    const detail = cIdx >= 0 ? builderMarkerMeta[cIdx] : undefined;

    if ((edit.kind === "sample" || edit.kind === "rightLabel") && !row) return null;

    const title = (() => {
      switch (edit.kind) {
        case "sample":
          return `行名（左ラベル） • Row ${rIdx + 1}`;
        case "rightLabel":
      return `Trait/status label • Row ${rIdx + 1}`;
        case "figureTitle":
          return "タイトル";
        case "chrLabel":
          return "Chr ラベル";
        case "headerLeft":
      return "Annotation title (left)";
        case "headerRight":
      return "Annotation title (right)";
        case "posUnit":
          return "座標の単位";
	        case "faLabel":
	          return "遺伝子座ラベル（Fa）";
	        case "locusLabelText":
	          return "Chr赤バー上ラベル";
	        case "arrowLabel":
	          return "矢印ラベル";
        case "genoLegendA":
          return "凡例ラベル（A）";
        case "genoLegendB":
          return "凡例ラベル（B）";
        case "genoLegendH":
          return "凡例ラベル（H）";
        case "detailMarkerName":
          return `詳細マーカー名 • #${cIdx + 1}`;
        case "detailMarkerPos":
          return `詳細マーカー位置 • #${cIdx + 1}`;
        case "coarseMarkerName":
          return `広域マーカー名 • #${mIdx + 1}`;
        case "coarseMarkerPos":
          return `広域マーカー位置 • #${mIdx + 1}`;
      }
    })();

    const label = (() => {
      switch (edit.kind) {
        case "sample":
          return "行名";
        case "rightLabel":
          return "右ラベル";
        case "figureTitle":
          return "タイトル";
        case "chrLabel":
          return "Chr";
        case "headerLeft":
          return "左";
        case "headerRight":
          return "右";
        case "posUnit":
          return "単位（例: Mb）";
	        case "faLabel":
	          return "ラベル";
	        case "locusLabelText":
	          return "表示";
	        case "arrowLabel":
	          return "表示";
        case "genoLegendA":
        case "genoLegendB":
        case "genoLegendH":
          return "ラベル";
        case "detailMarkerName":
          return `name${detail?.name ? `（現在: ${detail.name}）` : ""}`;
        case "detailMarkerPos":
          return "pos";
        case "coarseMarkerName":
          return `name${coarse?.name ? `（現在: ${coarse.name}）` : ""}`;
        case "coarseMarkerPos":
          return "pos";
      }
    })();

    const isNumber = edit.kind === "detailMarkerPos" || edit.kind === "coarseMarkerPos";
    const step = edit.kind === "detailMarkerPos" || edit.kind === "coarseMarkerPos" ? 0.01 : undefined;

    return (
      <div
        ref={builderCanvasEditRef}
        className="ggt-canvas-popover"
        style={{ left: edit.x, top: edit.y }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ggt-canvas-popover-title">{title}</div>
        <label className="seq-label">
          <span>{label}</span>
          <input
            ref={builderCanvasEditInputRef}
            className="seq-input"
            type={isNumber ? "number" : "text"}
            step={step}
            value={edit.value}
            onChange={(e) => setBuilderCanvasEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitBuilderCanvasEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelBuilderCanvasEdit();
              }
            }}
          />
        </label>

        {edit.kind === "rightLabel" && row ? (
          <div className="ggt-actions" style={{ marginTop: 8 }}>
            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={row.labelRed} onChange={(e) => withBuilderUndo(() => setBuilderRowLabelRed(rIdx, e.target.checked))} />
              赤
            </label>
            <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              ○/×
              <select
                className="ggt-select"
                value={row.mark}
                onChange={(e) => withBuilderUndo(() => setBuilderRowMark(rIdx, e.target.value as BuilderMark))}
                style={{ width: 90 }}
              >
                <option value="none">-</option>
                <option value="circle">○</option>
                <option value="cross">×</option>
              </select>
            </label>
          </div>
        ) : null}

        <div className="ggt-actions" style={{ marginTop: 10 }}>
          <button type="button" className="seq-button" onClick={commitBuilderCanvasEdit}>
            OK
          </button>
          <button type="button" className="seq-button secondary" onClick={cancelBuilderCanvasEdit}>
            Cancel
          </button>
          <button
            type="button"
            className="seq-button secondary"
            onClick={() => setBuilderCanvasEdit((prev) => (prev ? { ...prev, value: "" } : prev))}
            title="テキストを消す"
          >
            Clear
          </button>
          <span className="ggt-muted">Enter=OK / Esc=Cancel</span>
        </div>
      </div>
    );
  })();

  hotkeysRef.current = {
    tab,
    builderEditMode,
    builderTool,
    builderBrush,
    builderCycleOrder,
    builderPreviewZoom,
    builderObjectMode,
    builderObjectTool,
    builderObjectSnap,
    selectedOverlayId: builderSelectedOverlayId,
    hasDraftOverlay: Boolean(builderDraftOverlay),
    isCanvasEditOpen: Boolean(builderCanvasEdit),
    undoSize,
    redoSize,
    doUndoBuilder,
    doRedoBuilder,
    downloadBuilderProject,
    deleteSelectedOverlay,
    duplicateSelectedOverlay,
    nudgeSelectedOverlay,
    copySelectedOverlay,
    pasteOverlay,
    cancelOverlayDraft,
    clearOverlaySelection,
    exitObjectMode,
    setBuilderEditMode,
    setBuilderTool,
    setBuilderBrush,
    setBuilderCycleOrder,
    setBuilderPreviewZoom,
    setBuilderObjectTool,
    cancelBuilderCanvasEdit,
  };

  const chrPeakUi = resolveChrPeakRange();

  return (
    <div className="app-shell">
      <header className="app-hero">
        <div className="hero-left">
          <p className="hero-kicker">Standalone • Graphical genotype</p>
          <div className="hero-title-row">
            <h1 className="hero-title">Genotype Canvas</h1>
            <span className="hero-pill">client-side</span>
          </div>
          <p className="app-subtitle">Build, inspect, and export genotype matrices from TSV or Flapjack-style text without uploading files.</p>
          <ServiceQuickLinks />
        </div>
        <div className="hero-meta">
          <span className="hero-pill">Templates</span>
          <span className="hero-pill">Builder</span>
          <span className="hero-pill">Flapjack</span>
          <span className="hero-pill">TSV</span>
          <span className="hero-pill">
            {stats.cols} markers • {stats.tracks} rows
          </span>
        </div>
      </header>

      <main className="app-main">
        <ErrorBoundary title="Genotype Canvas">
          <div className="panel-card">
            <div className="ggt-shell" style={{ ["--ggt-sidebar-width" as never]: `${sidebarWidth}px` } as React.CSSProperties}>
              <div className="ggt-sidebar">
              <nav className="tab-nav" style={{ marginTop: 0 }}>
                {([
                  { key: "quick", label: "Quick" },
                  { key: "builder", label: "Builder" },
                  { key: "tsv", label: "TSV" },
                  { key: "flapjack", label: "Flapjack" },
                  { key: "template", label: "Template" },
                  { key: "ops", label: "操作" },
                  { key: "export", label: "Export" },
                  { key: "advanced", label: "Advanced" },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`tab-button ${tab === t.key ? "is-active" : ""}`}
                    onClick={() => setTab(t.key)}
                  >
                    <span className="tab-label">{t.label}</span>
                  </button>
                ))}
              </nav>

              <div className="tab-active-hint">
                <span className="tab-active-pill">{tabHint.title}</span>
                <span className="tab-active-desc">{tabHint.desc}</span>
              </div>

              <details className="ggt-details">
                <summary>Layout</summary>
                <div className="ggt-row" style={{ marginTop: 8 }}>
                  <label className="seq-label">
                    <span>左パネル幅(px): {sidebarWidth}</span>
                    <input
                      className="seq-input"
                      type="range"
                      min={320}
                      max={900}
                      value={sidebarWidth}
                      onChange={(e) => setSidebarWidth(Math.min(900, Math.max(320, Math.round(Number(e.target.value)))))}
                    />
                  </label>
                  <div className="ggt-actions" style={{ alignItems: "flex-end" }}>
                    <button type="button" className="seq-button secondary" onClick={() => setSidebarWidth(420)}>
                      プレビュー広め
                    </button>
                    <button type="button" className="seq-button secondary" onClick={() => setSidebarWidth(520)}>
                      バランス
                    </button>
                    <button type="button" className="seq-button secondary" onClick={() => setSidebarWidth(680)}>
                      操作広め
                    </button>
                  </div>
                </div>
              </details>

              {tab === "quick" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-card">
                    <div className="ggt-card-title">1) 入力を選ぶ</div>
                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={() => setTab("tsv")}>
                        TSV（A/B/H）
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => setTab("builder")}>
                        Builder（手動）
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => setTab("flapjack")}>
                        Flapjack（MAP+GENOTYPE）
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => setTab("template")}>
                        テンプレから
                      </button>
                    </div>
                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">2) まずは例で試す</div>
                    <div className="ggt-actions">
                      <button
                        type="button"
                        className="seq-button secondary"
                        onClick={() => {
                          setTsvText(EXAMPLE_TSV);
                          generateFromTsv(EXAMPLE_TSV, "example_tsv");
                        }}
                      >
                        TSV 例 → 生成
                      </button>
                      <button
                        type="button"
                        className="seq-button secondary"
                        onClick={() => {
                          setFjMapText(EXAMPLE_FJ_MAP);
                          setFjGenoText(EXAMPLE_FJ_GENO);
                          generateFromFlapjack({ mapText: EXAMPLE_FJ_MAP, genoText: EXAMPLE_FJ_GENO, parentA: "row_01", parentB: "row_02", nameHint: "example_flapjack" });
                        }}
                      >
                        Flapjack 例 → 生成
                      </button>
                    </div>
                    <div className="ggt-muted">例が動いたら、TSV/Flapjack タブに実データを貼り付けて同じ手順で生成します。</div>
                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">3) 保存</div>
                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                        Export へ
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => (setExportWidth(3840), setExportHeight(2160), setTab("export"))}>
                        4K で保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "builder" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-card">
                    <div className="ggt-card-title">編集モード</div>
                    <div className="ggt-actions">
                      <button
                        type="button"
                        className={`ggt-brush ${builderEditMode === "grid" ? "is-active" : ""}`}
                        onClick={() => setBuilderEditMode("grid")}
                      >
                        グリッド
                      </button>
                      <button
                        type="button"
                        className={`ggt-brush ${builderEditMode === "preview" ? "is-active" : ""}`}
                        onClick={() => setBuilderEditMode("preview")}
                      >
                        プレビュー
                      </button>
                    </div>
                    <div className="ggt-help">
                      {builderTool === "cycle"
                        ? "クリック循環: クリック=次へ / Shift+クリック=逆順（1セル=マーカー1つ）。1/2 で循環順、C でツール切替。"
                        : "プレビュー編集では、右側の図をクリック/ドラッグで塗れます（A/B/H/- ブラシ。C=ツール切替、G/P=表示切替）。"}
                    </div>
                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">Builder 設定</div>
                    <div className="ggt-row">
                      <label className="seq-label">
                        <span>Markers（列）</span>
                        <input
                          className="seq-input"
                          type="number"
                          min={3}
                          max={500}
                          value={builderMarkers}
                          onChange={(e) => ensureBuilderMarkers(Number(e.target.value))}
                        />
                      </label>
	                      <label className="seq-label">
	                        <span>Rows（段数）</span>
	                        <input
	                          className="seq-input"
	                          type="number"
	                          min={1}
	                          max={MAX_BUILDER_ROWS}
	                          value={builderRows.length}
	                          onChange={(e) => ensureBuilderRowCount(Number(e.target.value))}
	                        />
	                      </label>
                    </div>

                    <div className="ggt-row">
                      <label className="seq-label">
                        <span>Palette</span>
                        <select className="ggt-select" value={builderPaletteId} onChange={(e) => setBuilderPaletteId(e.target.value)}>
                          {palettePresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="seq-label">
                        <span>Theme</span>
                        <select className="ggt-select" value={builderTheme} onChange={(e) => setBuilderTheme(e.target.value as "dark" | "light")}>
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      </label>
                    </div>

                    <div className="ggt-row">
                      <label className="seq-label">
                        <span>Zoom（cell px）</span>
                        <input
                          className="seq-input"
                          type="number"
                          min={6}
                          max={40}
                          value={builderCellSize}
                          onChange={(e) => setBuilderCellSizeSafe(Number(e.target.value))}
                        />
                      </label>
                      <label className="seq-label">
                        <span>Canvas 幅(px)</span>
                        <input
                          className="seq-input"
                          type="number"
                          min={800}
                          max={12000}
                          value={builderCanvasWidth}
                          onChange={(e) => setBuilderCanvasWidthSafe(Number(e.target.value))}
                        />
                      </label>
                    </div>

                    <details className="ggt-details">
                      <summary>レイアウト詳細</summary>
                      <div className="ggt-row" style={{ marginTop: 8 }}>
                        <label className="seq-label">
                          <span>Annotation 幅(px)</span>
                          <input
                            className="seq-input"
                            type="number"
                            min={120}
                            max={2000}
                            value={builderAnnotationWidth}
                            onChange={(e) => setBuilderAnnotationWidthSafe(Number(e.target.value))}
                          />
                        </label>
                        <label className="seq-label">
                          <span>Row 高さ(px)</span>
                          <input
                            className="seq-input"
                            type="number"
                            min={10}
                            max={200}
                            value={builderRowHeight}
                            onChange={(e) => setBuilderRowHeightSafe(Number(e.target.value))}
                          />
                        </label>
                      </div>
                      <div className="ggt-row">
                        <label className="seq-label">
                          <span>Row gap(px)</span>
                          <input
                            className="seq-input"
                            type="number"
                            min={0}
                            max={200}
                            value={builderRowGap}
                            onChange={(e) => setBuilderRowGapSafe(Number(e.target.value))}
                          />
                        </label>
                        <div />
                      </div>
                    </details>

                    <div className="ggt-row ggt-row-1">
                      <label className="ggt-muted">
                        <input type="checkbox" checked={builderCompressRuns} onChange={(e) => setBuilderCompressRuns(e.target.checked)} style={{ marginRight: 8 }} />
                        連続マーカーをまとめる（セグメント）
                      </label>
                    </div>

                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                        Export へ
                      </button>
                      <button type="button" className="seq-button secondary" onClick={addBuilderRow}>
                        + Row
                      </button>
                      <button type="button" className="seq-button secondary" onClick={removeBuilderLastRow} disabled={builderRows.length <= 1}>
                        - Row
                      </button>
                      <button type="button" className="seq-button secondary" onClick={clearAllBuilder}>
                        全消去
                      </button>
                      <button type="button" className="seq-button secondary" onClick={setRightLabelsToNames}>
                        右ラベル=行名
                      </button>
	                    </div>
	                    <div className="ggt-help">ショートカット: A/B/H/-（ブラシ）、Ctrl+Z（Undo）、Ctrl+Y（Redo）。</div>

	                    <details className="ggt-details" style={{ marginTop: 10 }}>
	                      <summary>系統（行）をまとめて追加/変更</summary>
	                      <div className="ggt-help" style={{ marginTop: 6 }}>
	                        One line per sample. With two or more tab-separated columns, the first column updates the sample label and the remaining columns update trait/status annotations.
	                      </div>
	                      <label className="seq-label" style={{ marginTop: 8 }}>
	                        <span>貼り付け欄</span>
	                        <textarea
	                          className="seq-textarea"
	                          rows={6}
	                          value={builderRowBulkDraft}
	                          onChange={(e) => setBuilderRowBulkDraft(e.target.value)}
	                          placeholder={"Row 01\t1\t1\nRow 02\t0\t0\nRow 03\t0\t1\n"}
	                        />
	                      </label>
	                      <div className="ggt-actions">
	                        <button type="button" className="seq-button secondary" onClick={applyBuilderRowBulkFromTop}>
	                          先頭から反映
	                        </button>
	                        <button type="button" className="seq-button secondary" onClick={appendBuilderRowsFromBulk}>
	                          末尾に追加
	                        </button>
	                        <button type="button" className="seq-button secondary" onClick={() => setBuilderRowBulkDraft("")}>
	                          クリア
	                        </button>
	                      </div>
	                    </details>
	                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">{builderFigureMode === "fa_zoom" ? "詳細マーカー（name / pos）" : "マーカー位置（chr/pos）"}</div>
                    <div className="ggt-row ggt-row-1">
                      <label className="ggt-muted">
                        <input
                          type="checkbox"
                          checked={builderScaleByPos}
                          onChange={(e) => setBuilderScaleByPos(e.target.checked)}
                          disabled={builderFigureMode === "fa_zoom"}
                          style={{ marginRight: 8 }}
                        />
                        {builderFigureMode === "fa_zoom" ? "均等配置（pos は表示用）" : "chr/pos でスケール（位置に比例）"}
                      </label>
                    </div>
                    <div className="ggt-help">
                      {builderFigureMode === "fa_zoom"
                        ? "Numeric window mode uses evenly spaced markers; pos is displayed as a label. The field below also accepts two columns: name and pos."
                        : "MAP を入れると、染色体区間（Chr）と位置目盛りが表示されます。スケールON時は「プレビュー」編集推奨（グリッドは等間隔）。"}
                    </div>

                    <details className="ggt-details">
                      <summary>自動生成（簡易）</summary>
                      <div className="ggt-row" style={{ marginTop: 8 }}>
                        <label className="seq-label">
                          <span>Chr</span>
                          <input className="seq-input" value={builderAutoChr} onChange={(e) => setBuilderAutoChr(e.target.value)} />
                        </label>
                        <label className="seq-label">
                          <span>start</span>
                          <input
                            className="seq-input"
                            type="number"
                            value={builderAutoStart}
                            onChange={(e) => setBuilderAutoStart(Number(e.target.value))}
                          />
                        </label>
                      </div>
                      <div className="ggt-row">
                        <label className="seq-label">
                          <span>step</span>
                          <input
                            className="seq-input"
                            type="number"
                            min={0}
                            value={builderAutoStep}
                            onChange={(e) => setBuilderAutoStep(Number(e.target.value))}
                          />
                        </label>
                        <div />
                      </div>
                      <div className="ggt-actions">
                        <button type="button" className="seq-button secondary" onClick={autoGenerateBuilderMap}>
                          自動生成
                        </button>
                      </div>
                    </details>

	                    <div className="ggt-actions">
	                      <button type="button" className="seq-button secondary" onClick={updateBuilderMapDraftFromCurrent}>
	                        現在のMAP→テキスト
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={applyBuilderMarkerMap}>
	                        MAP を適用
	                      </button>
	                    </div>

	                    <details className="ggt-details" style={{ marginTop: 10 }}>
	                      <summary>表で編集（GUI）</summary>
	                      <div className="ggt-help" style={{ marginTop: 6 }}>
                            Edit name/chr/pos directly. Empty values are allowed. Numeric window mode uses evenly spaced markers; pos is displayed as a label.
	                      </div>
	                      <div className="ggt-table-scroll">
	                        <table className="ggt-table">
	                          <thead>
	                            <tr>
	                              <th style={{ width: 44 }}>#</th>
	                              <th>name</th>
	                              <th style={{ width: 88 }}>chr</th>
	                              <th style={{ width: 120 }}>pos</th>
	                            </tr>
	                          </thead>
	                          <tbody>
	                            {Array.from({ length: builderMarkers }, (_, i) => {
	                              const m = builderMarkerMeta[i];
	                              const name = String(m?.name ?? "");
	                              const chr = String(m?.chr ?? "");
	                              const pos = Number.isFinite((m as { pos?: unknown })?.pos ?? Number.NaN) ? String((m as { pos?: number }).pos) : "";
	                              return (
	                                <tr key={`m-${i}`}>
	                                  <td className="ggt-muted">{i + 1}</td>
	                                  <td>
	                                    <input
	                                      className="seq-input ggt-table-input"
	                                      value={name}
	                                      onChange={(e) => setBuilderMarkerName(i, e.target.value)}
	                                      placeholder={`m${i + 1}`}
	                                    />
	                                  </td>
                                  <td>
                                    <input className="seq-input ggt-table-input" value={chr} onChange={(e) => setBuilderMarkerChr(i, e.target.value)} placeholder="" />
                                  </td>
	                                  <td>
	                                    <input
	                                      className="seq-input ggt-table-input"
	                                      type="number"
	                                      step="any"
	                                      value={pos}
	                                      onChange={(e) => {
	                                        const raw = e.target.value;
	                                        if (!raw.trim()) {
	                                          setBuilderMarkerPos(i, undefined);
	                                          return;
	                                        }
	                                        const n = Number(raw);
	                                        setBuilderMarkerPos(i, Number.isFinite(n) ? n : undefined);
	                                      }}
	                                      placeholder={builderPosUnit}
	                                    />
	                                  </td>
	                                </tr>
	                              );
	                            })}
	                          </tbody>
	                        </table>
	                      </div>
	                    </details>
	 
	                    <label className="seq-label" style={{ marginTop: 8 }}>
	                      <span>{builderFigureMode === "fa_zoom" ? "詳細マーカー（name pos / marker chr pos）" : "MAP（marker chr pos）"}</span>
	                      <textarea
	                        className="seq-textarea"
                        rows={6}
                        value={builderMapDraft}
                        onChange={(e) => setBuilderMapDraft(e.target.value)}
                        placeholder={
                          builderFigureMode === "fa_zoom"
                            ? "C01\t1\nC02\t2\nC03\t3\n...\nC14\t14\n"
                            : "marker\tchr\tpos\nm1\t1\t1\nm2\t1\t2\nm3\t2\t3\n"
                        }
                      />
                    </label>
                  </div>

	                  <div className="ggt-card">
	                    <div className="ggt-card-title">Numeric window</div>
	                    <div className="ggt-row">
	                      <label className="seq-label">
	                        <span>図モード</span>
	                        <select className="ggt-select" value={builderFigureMode} onChange={(e) => setBuilderFigureMode(e.target.value as BuilderFigureMode)}>
	                          <option value="simple">Standard</option>
	                          <option value="fa_zoom">Numeric window</option>
	                        </select>
	                      </label>
	                      {builderFigureMode === "fa_zoom" ? (
	                        <label className="seq-label">
	                          <span>段数</span>
	                          <select className="ggt-select" value={String(builderZoomStages)} onChange={(e) => setBuilderZoomStages(e.target.value === "1" ? 1 : 2)}>
	                            <option value="1">1段（Chr→詳細）</option>
	                            <option value="2">2段（Chr→広域→詳細）</option>
	                          </select>
	                        </label>
	                      ) : null}
	                      <div className="ggt-actions" style={{ alignItems: "flex-end" }}>
	                        <button type="button" className="seq-button secondary" onClick={applyFaZoomDefaults}>
	                          推奨設定
	                        </button>
                        <button type="button" className="seq-button secondary" onClick={loadFaZoomExample}>
                          例をロード
                        </button>
                      </div>
                    </div>

	                    <details className="ggt-details">
	                      <summary>設定</summary>
	                      <div className="ggt-row" style={{ marginTop: 8 }}>
	                        <label className="seq-label">
	                          <span>Chr 表示</span>
	                          <input className="seq-input" value={builderChrLabel} onChange={(e) => setBuilderChrLabel(e.target.value)} />
	                        </label>
	                        <label className="seq-label">
	                          <span>Chr 長さ({builderPosUnit})</span>
	                          <input className="seq-input" type="number" min={1} value={builderChrLenMb} onChange={(e) => setBuilderChrLenMb(Number(e.target.value))} />
	                        </label>
	                      </div>

                      <label className="seq-label" style={{ marginTop: 8 }}>
                        <span>広域マーカー（name pos）</span>
                        <textarea
                          className="seq-textarea"
                          rows={6}
                          value={builderCoarseMarkersDraft}
                          onChange={(e) => setBuilderCoarseMarkersDraft(e.target.value)}
                          placeholder={"C01\t1\nC02\t4\nC03\t7\nC04\t10\nC05\t13\nC06\t16\n"}
                        />
                      </label>
	                      <details className="ggt-details" style={{ marginTop: 10 }}>
	                        <summary>広域マーカーを表で編集（GUI）</summary>
                        <div className="ggt-help" style={{ marginTop: 6 }}>
                          name/pos を直接編集できます（pos が数値の行だけ軸に反映されます）。右側の「×」で行削除できます。
                        </div>
                        <div className="ggt-actions" style={{ marginTop: 8 }}>
                          <button type="button" className="seq-button secondary" onClick={addCoarseMarkerRow}>
                            + marker
                          </button>
                        </div>
                        <div className="ggt-table-scroll">
                          <table className="ggt-table">
                            <thead>
                              <tr>
                                <th style={{ width: 44 }}>#</th>
                                <th>name</th>
                                <th style={{ width: 140 }}>pos</th>
                                <th style={{ width: 70 }}> </th>
                              </tr>
                            </thead>
                            <tbody>
                              {parseCoarseMarkersDraftRows(builderCoarseMarkersDraft).map((r, i) => (
                                <tr key={`coarse-${i}`}>
                                  <td className="ggt-muted">{i + 1}</td>
                                  <td>
                                    <input
                                      className="seq-input ggt-table-input"
                                      value={r.name}
                                      onChange={(e) => updateCoarseMarkerRow(i, { name: e.target.value })}
                                      placeholder="A"
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className="seq-input ggt-table-input"
                                      type="number"
                                      step="any"
                                      value={r.pos}
                                      onChange={(e) => updateCoarseMarkerRow(i, { pos: e.target.value })}
                                      placeholder={builderPosUnit}
                                    />
                                  </td>
                                  <td>
                                    <button type="button" className="ggt-mini-btn danger" onClick={() => deleteCoarseMarkerRow(i)}>
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
	                      </details>

	                      <div className="ggt-row" style={{ marginTop: 10 }}>
			                        <label className="seq-label">
			                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} start marker</span>
			                          <select
			                            className="ggt-select"
			                            disabled={!builderCoarseMarkerOptions.length}
		                            value={
	                              Number.isFinite(builderChrZoomStartMb)
	                                ? String(nearestCoarseMarkerPos(builderChrZoomStartMb) ?? builderChrZoomStartMb)
	                                : "auto"
	                            }
	                            onChange={(e) => {
	                              const v = e.target.value;
	                              if (v === "auto") return setBuilderChrZoomStartMb(Number.NaN);
	                              const n = Number(v);
	                              setBuilderChrZoomStartMb(Number.isFinite(n) ? n : Number.NaN);
	                            }}
	                          >
	                            <option value="auto">（auto）</option>
	                            {builderCoarseMarkerOptions.map((m, i) => (
	                              <option key={`chrzoom-s-${i}-${m.name}`} value={String(m.pos)}>
	                                {m.name} ({m.pos})
	                              </option>
	                            ))}
	                          </select>
	                        </label>
			                        <label className="seq-label">
			                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} end marker</span>
			                          <select
			                            className="ggt-select"
			                            disabled={!builderCoarseMarkerOptions.length}
	                            value={
	                              Number.isFinite(builderChrZoomEndMb)
	                                ? String(nearestCoarseMarkerPos(builderChrZoomEndMb) ?? builderChrZoomEndMb)
	                                : "auto"
	                            }
	                            onChange={(e) => {
	                              const v = e.target.value;
	                              if (v === "auto") return setBuilderChrZoomEndMb(Number.NaN);
	                              const n = Number(v);
	                              setBuilderChrZoomEndMb(Number.isFinite(n) ? n : Number.NaN);
	                            }}
	                          >
	                            <option value="auto">（auto）</option>
	                            {builderCoarseMarkerOptions.map((m, i) => (
	                              <option key={`chrzoom-e-${i}-${m.name}`} value={String(m.pos)}>
	                                {m.name} ({m.pos})
	                              </option>
	                            ))}
	                          </select>
	                        </label>
	                      </div>

		                      <div className="ggt-row">
				                        <label className="seq-label">
				                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} start ({builderPosUnit})（手動 / 空=auto）</span>
				                          <input
				                            className="seq-input"
				                            type="number"
	                            step="any"
	                            value={Number.isFinite(builderChrZoomStartMb) ? String(builderChrZoomStartMb) : ""}
	                            onChange={(e) => {
	                              const raw = e.target.value;
	                              if (!raw.trim()) return setBuilderChrZoomStartMb(Number.NaN);
	                              const n = Number(raw);
	                              setBuilderChrZoomStartMb(Number.isFinite(n) ? n : Number.NaN);
	                            }}
	                          />
	                        </label>
			                        <label className="seq-label">
			                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} end ({builderPosUnit})（手動 / 空=auto）</span>
			                          <input
			                            className="seq-input"
			                            type="number"
	                            step="any"
	                            value={Number.isFinite(builderChrZoomEndMb) ? String(builderChrZoomEndMb) : ""}
	                            onChange={(e) => {
	                              const raw = e.target.value;
	                              if (!raw.trim()) return setBuilderChrZoomEndMb(Number.NaN);
	                              const n = Number(raw);
	                              setBuilderChrZoomEndMb(Number.isFinite(n) ? n : Number.NaN);
	                            }}
		                          />
		                        </label>
		                      </div>
		
		                      <div className="ggt-row">
			                        <label className="seq-label">
			                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} 位置（スライド）</span>
			                          <input
			                            type="range"
		                            min={0}
		                            max={chrPeakUi.chrLen}
		                            step="0.1"
		                            value={chrPeakUi.center}
		                            onChange={(e) => setChrPeakByCenter(Number(e.target.value))}
		                            style={{ width: "100%" }}
		                          />
		                          <div className="ggt-muted">
		                            start {fmtBuilderPos(chrPeakUi.start)} / end {fmtBuilderPos(chrPeakUi.end)}（{builderPosUnit}）
		                          </div>
		                        </label>
			                        <label className="seq-label">
			                          <span>{builderZoomStages === 1 ? "Chr赤バー（ズーム範囲）" : "Chr赤バー（QTL）"} 長さ</span>
			                          <input
			                            type="range"
		                            min={0}
		                            max={chrPeakUi.chrLen}
		                            step="0.1"
		                            value={chrPeakUi.len}
		                            onChange={(e) => setChrPeakByLength(Number(e.target.value))}
		                            style={{ width: "100%" }}
		                          />
		                          <div className="ggt-muted">
		                            {fmtBuilderPos(chrPeakUi.len)} {builderPosUnit}
		                          </div>
		                        </label>
		                      </div>

			                      {builderZoomStages === 2 ? (
			                        <>
			                          <div className="ggt-row">
			                            <label className="seq-label">
			                              <span>広域→詳細 start marker</span>
			                              <select
			                                className="ggt-select"
			                                disabled={!builderCoarseMarkerOptions.length}
			                                value={
			                                  Number.isFinite(builderCoarseZoomStartMb)
			                                    ? String(nearestCoarseMarkerPos(builderCoarseZoomStartMb) ?? builderCoarseZoomStartMb)
			                                    : "auto"
			                                }
			                                onChange={(e) => {
			                                  const v = e.target.value;
			                                  if (v === "auto") return setBuilderCoarseZoomStartMb(Number.NaN);
			                                  const n = Number(v);
			                                  setBuilderCoarseZoomStartMb(Number.isFinite(n) ? n : Number.NaN);
			                                }}
			                              >
			                                <option value="auto">（auto）</option>
			                                {builderCoarseMarkerOptions.map((m, i) => (
			                                  <option key={`coarsezoom-s-${i}-${m.name}`} value={String(m.pos)}>
			                                    {m.name} ({m.pos})
			                                  </option>
			                                ))}
			                              </select>
			                            </label>
			                            <label className="seq-label">
			                              <span>広域→詳細 end marker</span>
			                              <select
			                                className="ggt-select"
			                                disabled={!builderCoarseMarkerOptions.length}
			                                value={
			                                  Number.isFinite(builderCoarseZoomEndMb)
			                                    ? String(nearestCoarseMarkerPos(builderCoarseZoomEndMb) ?? builderCoarseZoomEndMb)
			                                    : "auto"
			                                }
			                                onChange={(e) => {
			                                  const v = e.target.value;
			                                  if (v === "auto") return setBuilderCoarseZoomEndMb(Number.NaN);
			                                  const n = Number(v);
			                                  setBuilderCoarseZoomEndMb(Number.isFinite(n) ? n : Number.NaN);
			                                }}
			                              >
			                                <option value="auto">（auto）</option>
			                                {builderCoarseMarkerOptions.map((m, i) => (
			                                  <option key={`coarsezoom-e-${i}-${m.name}`} value={String(m.pos)}>
			                                    {m.name} ({m.pos})
			                                  </option>
			                                ))}
			                              </select>
			                            </label>
			                          </div>

			                          <div className="ggt-row">
			                            <label className="seq-label">
			                              <span>広域→詳細 start ({builderPosUnit})（手動 / 空=auto）</span>
			                              <input
			                                className="seq-input"
			                                type="number"
			                                step="any"
			                                value={Number.isFinite(builderCoarseZoomStartMb) ? String(builderCoarseZoomStartMb) : ""}
			                                onChange={(e) => {
			                                  const raw = e.target.value;
			                                  if (!raw.trim()) return setBuilderCoarseZoomStartMb(Number.NaN);
			                                  const n = Number(raw);
			                                  setBuilderCoarseZoomStartMb(Number.isFinite(n) ? n : Number.NaN);
			                                }}
			                              />
			                            </label>
			                            <label className="seq-label">
			                              <span>広域→詳細 end ({builderPosUnit})（手動 / 空=auto）</span>
			                              <input
			                                className="seq-input"
                                type="number"
			                                step="any"
			                                value={Number.isFinite(builderCoarseZoomEndMb) ? String(builderCoarseZoomEndMb) : ""}
			                                onChange={(e) => {
			                                  const raw = e.target.value;
			                                  if (!raw.trim()) return setBuilderCoarseZoomEndMb(Number.NaN);
			                                  const n = Number(raw);
			                                  setBuilderCoarseZoomEndMb(Number.isFinite(n) ? n : Number.NaN);
			                                }}
			                              />
			                            </label>
			                          </div>
			                        </>
			                      ) : null}

		                      <div className="ggt-row">
		                        <label className="seq-label">
		                          <span>Window label</span>
	                          <input className="seq-input" value={builderFaLabel} onChange={(e) => setBuilderFaLabel(e.target.value)} />
	                        </label>
	                        <label className="seq-label">
	                          <span>Chromosome-bar label</span>
	                          <input
	                            className="seq-input"
	                            value={builderLocusLabelText}
	                            onChange={(e) => setBuilderLocusLabelText(e.target.value)}
	                            placeholder="e.g. Window ~50"
	                          />
	                        </label>
	                      </div>
		
	                      <div className="ggt-row">
	                        <label className="seq-label">
	                          <span>Bottom arrow label</span>
	                          <input
	                            className="seq-input"
	                            value={builderArrowLabelAuto ? builderArrowLabelAutoPreview : builderArrowLabel}
	                            onChange={(e) => setBuilderArrowLabel(e.target.value)}
	                            disabled={builderArrowLabelAuto}
	                          />
	                        </label>
	                        <label className="ggt-muted" style={{ alignSelf: "end" }}>
	                          <input
	                            type="checkbox"
	                            checked={builderArrowLabelAuto}
	                            onChange={(e) => setBuilderArrowLabelAuto(e.target.checked)}
	                            style={{ marginRight: 8 }}
	                          />
	                          自動
	                        </label>
	                      </div>

	                      <div className="ggt-row">
	                        <label className="seq-label">
	                          <span>↔ start marker</span>
                          <select
                            className="ggt-select"
                            value={nearestDetailMarkerName(builderArrowStartMb)}
                            onChange={(e) => {
                              const name = e.target.value;
                              const found = builderDetailMarkerOptions.find((m) => m.name === name);
                              if (!found) return;
                              setBuilderArrowStartMb(Number.isFinite(found.pos ?? Number.NaN) ? (found.pos as number) : found.idx + 1);
                            }}
                          >
                            {builderDetailMarkerOptions.map((m) => (
                              <option key={`start-${m.idx}-${m.name}`} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="seq-label">
                          <span>↔ end marker</span>
                          <select
                            className="ggt-select"
                            value={nearestDetailMarkerName(builderArrowEndMb)}
                            onChange={(e) => {
                              const name = e.target.value;
                              const found = builderDetailMarkerOptions.find((m) => m.name === name);
                              if (!found) return;
                              setBuilderArrowEndMb(Number.isFinite(found.pos ?? Number.NaN) ? (found.pos as number) : found.idx + 1);
                            }}
                          >
                            {builderDetailMarkerOptions.map((m) => (
                              <option key={`end-${m.idx}-${m.name}`} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="ggt-row">
                        <label className="seq-label">
                          <span>↔ start ({builderPosUnit})（手動）</span>
                          <input className="seq-input" type="number" value={builderArrowStartMb} onChange={(e) => setBuilderArrowStartMb(Number(e.target.value))} />
                        </label>
                        <label className="seq-label">
                          <span>↔ end ({builderPosUnit})（手動）</span>
                          <input className="seq-input" type="number" value={builderArrowEndMb} onChange={(e) => setBuilderArrowEndMb(Number(e.target.value))} />
                        </label>
                      </div>

                      <div className="ggt-row">
                        <label className="seq-label">
                          <span>↔ オフセットX (px)</span>
                          <input className="seq-input" type="number" value={builderArrowOffsetX} onChange={(e) => setBuilderArrowOffsetX(Number(e.target.value))} />
                        </label>
                        <label className="seq-label">
                          <span>↔ オフセットY (px)</span>
                          <input className="seq-input" type="number" value={builderArrowOffsetY} onChange={(e) => setBuilderArrowOffsetY(Number(e.target.value))} />
                        </label>
                      </div>
                      <div className="ggt-row">
                        <label className="seq-label">
                          <span>↔ ラベル dx (px)</span>
                          <input className="seq-input" type="number" value={builderArrowLabelDx} onChange={(e) => setBuilderArrowLabelDx(Number(e.target.value))} />
                        </label>
                        <label className="seq-label">
                          <span>↔ ラベル dy (px)</span>
                          <input className="seq-input" type="number" value={builderArrowLabelDy} onChange={(e) => setBuilderArrowLabelDy(Number(e.target.value))} />
                        </label>
                      </div>
                      <div className="ggt-row ggt-row-1">
                        <button
                          type="button"
                          className="seq-button secondary"
                          onClick={() => {
                            setBuilderArrowOffsetX(0);
                            setBuilderArrowOffsetY(0);
                            setBuilderArrowLabelDx(0);
                            setBuilderArrowLabelDy(0);
                          }}
                        >
                          ↔ 位置リセット
                        </button>
                      </div>
                    </details>

                    <div className="ggt-help">
                      Builds a chromosome bar, coarse interval, detailed marker zoom, vertical guides, and trait/status annotations. Use "Load example" for a quick starting point.
                    </div>
                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">表示（論文図）</div>
                    <div className="ggt-row ggt-row-1">
                      <label className="ggt-muted">
                        <input type="checkbox" checked={builderLeftLabels} onChange={(e) => setBuilderLeftLabels(e.target.checked)} style={{ marginRight: 8 }} />
                        左に系統名（行名）
                      </label>
                    </div>
                    <div className="ggt-row ggt-row-1">
                      <label className="ggt-muted">
                        <input type="checkbox" checked={builderShowMarkerAxis} onChange={(e) => setBuilderShowMarkerAxis(e.target.checked)} style={{ marginRight: 8 }} />
                        マーカー軸（名前 + pos）
                      </label>
                      <label className="ggt-muted">
                        <input type="checkbox" checked={builderGuides} onChange={(e) => setBuilderGuides(e.target.checked)} style={{ marginRight: 8 }} />
                        縦ガイド（破線）
                      </label>
                    </div>
                    <div className="ggt-row">
                      <label className="seq-label">
                        <span>ガイド位置</span>
                        <select className="ggt-select" value={builderGuideMode} onChange={(e) => setBuilderGuideMode(e.target.value as "centers" | "boundaries")}>
                          <option value="centers">マーカー中心</option>
                          <option value="boundaries">区切り（列境界）</option>
                        </select>
                      </label>
                      <label className="seq-label">
                        <span>pos unit</span>
                        <input className="seq-input" value={builderPosUnit} onChange={(e) => setBuilderPosUnit(e.target.value)} />
                      </label>
                    </div>
		                    <div className="ggt-row">
		                      <label className="seq-label">
		                        <span>Annotation header</span>
		                        <input className="seq-input" value={deriveBuilderHeaderLeft(builderAnnoCols) || builderHeaderLeft} disabled />
		                      </label>
		                      <label className="seq-label">
		                        <span>Flag header</span>
		                        <input className="seq-input" value={builderHeaderRight} onChange={(e) => setBuilderHeaderRight(e.target.value)} placeholder="e.g. Flag" />
		                      </label>
		                    </div>
		
		                    <details className="ggt-details" style={{ marginTop: 10 }}>
		                      <summary>Annotation columns</summary>
		                      <div className="ggt-actions" style={{ marginTop: 8 }}>
		                        <button type="button" className="seq-button secondary" onClick={addBuilderAnnoCol}>
		                          列を追加
		                        </button>
		                        <button
		                          type="button"
		                          className="seq-button secondary"
		                          onClick={() => builderAnnoCols.length > 1 && deleteBuilderAnnoCol(builderAnnoCols.length - 1)}
		                          disabled={builderAnnoCols.length <= 1}
		                        >
		                          最後の列を削除
		                        </button>
		                        <button
		                          type="button"
		                          className="seq-button secondary"
		                          onClick={() =>
		                            applyBuilderAnnoCols([{ id: makeId(), header: "Value", visible: true, width: 0 }])
		                          }
		                        >
		                          1列に戻す
		                        </button>
		                      </div>
		                      <div className="ggt-help" style={{ marginTop: 8 }}>
		                        Only visible columns are rendered on the right. Width is in px; 0 means automatic. Row values are edited in the Builder rows.
		                      </div>
		
		                      <div className="ggt-rowlist" style={{ marginTop: 10 }}>
		                        {builderAnnoCols.map((col, idx) => (
		                          <div key={col.id} className="ggt-rowlist-item">
		                            <div className="ggt-row">
		                              <label className="seq-label">
		                                <span>列{idx + 1} 見出し</span>
		                                <input
		                                  className="seq-input"
		                                  value={col.header}
		                                  onChange={(e) => setBuilderAnnoColHeader(idx, e.target.value)}
		                                  placeholder={`Col${idx + 1}`}
		                                />
		                              </label>
		                              <div className="ggt-actions" style={{ alignItems: "end", gap: 10 }}>
		                                <label className="ggt-muted" title="この列を表示">
		                                  <input
		                                    type="checkbox"
		                                    checked={col.visible}
		                                    onChange={(e) => setBuilderAnnoColVisible(idx, e.target.checked)}
		                                    style={{ marginRight: 8 }}
		                                  />
		                                  表示
		                                </label>
		                                <label className="seq-label" style={{ maxWidth: 140 }}>
		                                  <span>幅(px)</span>
		                                  <input
		                                    className="seq-input"
		                                    type="number"
		                                    min={0}
		                                    step={1}
		                                    value={col.width > 0 ? String(col.width) : ""}
		                                    onChange={(e) => {
		                                      const raw = e.target.value;
		                                      if (!raw.trim()) return setBuilderAnnoColWidth(idx, 0);
		                                      const n = Number(raw);
		                                      setBuilderAnnoColWidth(idx, n);
		                                    }}
		                                    placeholder="自動"
		                                  />
		                                </label>
		                                <button type="button" className="ggt-mini-btn" title="左へ" onClick={() => moveBuilderAnnoCol(idx, -1)} disabled={idx === 0}>
		                                  ←
		                                </button>
		                                <button
		                                  type="button"
		                                  className="ggt-mini-btn"
		                                  title="右へ"
		                                  onClick={() => moveBuilderAnnoCol(idx, 1)}
		                                  disabled={idx === builderAnnoCols.length - 1}
		                                >
		                                  →
		                                </button>
		                                <button
		                                  type="button"
		                                  className="ggt-mini-btn danger"
		                                  title="削除"
		                                  onClick={() => deleteBuilderAnnoCol(idx)}
		                                  disabled={builderAnnoCols.length <= 1}
		                                >
		                                  削除
		                                </button>
		                              </div>
		                            </div>
		                          </div>
		                        ))}
		                      </div>
		                    </details>
	
	                    {builderFigureMode === "fa_zoom" ? (
	                      <details className="ggt-details" style={{ marginTop: 10 }}>
	                        <summary>Numeric figure: title / legend / highlight</summary>
	                        <label className="seq-label" style={{ marginTop: 8 }}>
	                          <span>タイトル</span>
	                          <input
	                            className="seq-input"
	                            value={builderFigureTitle}
	                            onChange={(e) => setBuilderFigureTitle(e.target.value)}
	                            placeholder="e.g. Numeric matrix example"
	                          />
	                        </label>
	                        <label className="seq-label" style={{ marginTop: 8 }}>
	                          <span>強調マーカー（赤）</span>
	                          <input
	                            className="seq-input"
	                            value={builderHighlightMarkers}
	                            onChange={(e) => setBuilderHighlightMarkers(e.target.value)}
	                            placeholder="e.g. C07"
	                          />
	                        </label>
	                        <div className="ggt-row" style={{ marginTop: 8 }}>
	                          <label className="seq-label">
	                            <span>凡例 A</span>
	                            <input className="seq-input" value={builderGenoLegendA} onChange={(e) => setBuilderGenoLegendA(e.target.value)} placeholder="e.g. Code A" />
	                          </label>
	                          <label className="seq-label">
	                            <span>凡例 B</span>
	                            <input className="seq-input" value={builderGenoLegendB} onChange={(e) => setBuilderGenoLegendB(e.target.value)} placeholder="e.g. Code B" />
	                          </label>
	                        </div>
	                        <div className="ggt-row">
	                          <label className="seq-label">
	                            <span>凡例 H</span>
	                            <input className="seq-input" value={builderGenoLegendH} onChange={(e) => setBuilderGenoLegendH(e.target.value)} placeholder="e.g. Code H" />
	                          </label>
	                          <div />
	                        </div>
	                        <div className="ggt-actions">
	                          <button
	                            type="button"
	                            className="seq-button secondary"
	                            onClick={() => {
	                              setBuilderFigureTitle("Numeric matrix example");
	                              setBuilderGenoLegendA("Code A");
	                              setBuilderGenoLegendB("Code B");
	                              setBuilderGenoLegendH("Code H");
	                              setBuilderHighlightMarkers("C07");
	                            }}
	                          >
	                            Reset figure labels
	                          </button>
		                        </div>
		                      </details>
		                    ) : null}
		                    <div className="ggt-actions">
		                      <button
		                        type="button"
		                        className="seq-button secondary"
		                        onClick={() => (applyBuilderAnnoCols([{ id: makeId(), header: "Value", visible: true, width: 0 }]), setBuilderHeaderRight("Flag"))}
		                      >
		                        Headers=Value/Flag
		                      </button>
	                      <button type="button" className="seq-button secondary" onClick={() => (setBuilderLeftLabels(true), setBuilderShowMarkerAxis(true), setBuilderGuides(true))}>
                        Show guides
                      </button>
                    </div>
                    <div className="ggt-help">
                      Numeric ticks and guide lines make column changes easier to inspect. Use Export to check the final SVG or JPEG.
                    </div>
                  </div>

                  <div className="ggt-card">
                    <div className="ggt-card-title">ブラシ / Undo</div>
                    <div className="ggt-actions">
                      <button
                        type="button"
                        className={`ggt-brush ${builderTool === "brush" ? "is-active" : ""}`}
                        onClick={() => setBuilderTool("brush")}
                      >
                        ブラシ
                      </button>
                      <button
                        type="button"
                        className={`ggt-brush ${builderTool === "cycle" ? "is-active" : ""}`}
                        onClick={() => setBuilderTool("cycle")}
                      >
                        クリック循環
                      </button>
                      <select
                        className="ggt-select"
                        value={builderCycleOrder}
                        onChange={(e) => setBuilderCycleOrder(e.target.value as BuilderCycleOrder)}
                        title="クリック循環の順番"
                        disabled={builderTool !== "cycle"}
                      >
                        <option value="AB-">A→B→-（3色）</option>
                        <option value="AHB-">A→H→B→-（4色）</option>
                      </select>
                    </div>
                    <div className="ggt-actions">
                      {([
                        { code: "A" as const, label: "A" },
                        { code: "H" as const, label: "H" },
                        { code: "B" as const, label: "B" },
                        { code: "-" as const, label: "-" },
                      ] as const).map((b) => (
                        <button
                          key={b.code}
                          type="button"
                          className={`ggt-brush ${builderBrush === b.code ? "is-active" : ""}`}
                          onClick={() => setBuilderBrush(b.code)}
                        >
                          <span className="ggt-brush-swatch" style={{ background: builderColorFor(b.code) }} />
                          {b.label}
                        </button>
                      ))}
                    </div>
                    <div className="ggt-actions" style={{ marginTop: 6 }}>
                      <button type="button" className="seq-button secondary" onClick={doUndoBuilder} disabled={undoSize <= 0}>
                        Undo
                      </button>
                      <button type="button" className="seq-button secondary" onClick={doRedoBuilder} disabled={redoSize <= 0}>
                        Redo
                      </button>
                    </div>
                    <div className="ggt-help">
                      {builderTool === "cycle"
                        ? "クリックで色が順番に切り替わります（1セル=マーカー1つ）。Shift+クリックで逆順。"
                        : "ブラシを選んで、クリック/ドラッグで塗ります。"}
                    </div>
	                  </div>

	                  <div className="ggt-card">
	                    <div className="ggt-card-title">オブジェクト（注釈）</div>
	                    <div className="ggt-help">PowerPoint風にテキスト/図形/矢印を配置して、ドラッグで編集できます（プレビュー時のみ）。</div>
	                    <div className="ggt-actions">
	                      <button
	                        type="button"
	                        className={`ggt-brush ${builderObjectMode ? "is-active" : ""}`}
	                        onClick={() => setBuilderObjectMode((prev) => !prev)}
	                        disabled={builderEditMode !== "preview"}
	                      >
	                        {builderObjectMode ? "編集ON" : "編集OFF"}
	                      </button>
	                      {([
	                        { id: "select", label: "選択(V)" },
	                        { id: "text", label: "テキスト(T)" },
	                        { id: "rect", label: "四角(R)" },
	                        { id: "line", label: "線(L)" },
	                        { id: "arrow", label: "矢印(Q)" },
	                      ] as const).map((t) => (
	                        <button
	                          key={t.id}
	                          type="button"
	                          className={`ggt-brush ${builderObjectMode && builderObjectTool === t.id ? "is-active" : ""}`}
	                          onClick={() => {
	                            setBuilderObjectMode(true);
	                            setBuilderObjectTool(t.id);
	                          }}
	                          disabled={builderEditMode !== "preview"}
	                        >
	                          {t.label}
	                        </button>
	                      ))}
	                      <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="座標を 5px 単位で吸着">
	                        <input type="checkbox" checked={builderObjectSnap} onChange={(e) => setBuilderObjectSnap(e.target.checked)} disabled={builderEditMode !== "preview"} />
	                        スナップ
	                      </label>
	                    </div>

	                    <label className="seq-label" style={{ marginTop: 6 }}>
	                      <span>一覧</span>
	                      <select
	                        className="ggt-select"
	                        value={builderSelectedOverlayId || ""}
	                        onChange={(e) => setBuilderSelectedOverlayId(e.target.value || null)}
	                        disabled={!builderUserOverlays.length}
	                      >
	                        <option value="">（未選択）</option>
	                        {builderUserOverlays.map((o, i) => {
	                          const id = String((o as { id?: unknown }).id ?? "");
	                          const kind = String((o as { kind?: unknown }).kind ?? "");
	                          const name = String((o as { name?: unknown }).name ?? "").trim();
	                          const kindLabel =
	                            kind === "text"
	                              ? "テキスト"
	                              : kind === "rect"
	                                ? "四角"
	                                : kind === "line"
	                                  ? (o as { markerEnd?: unknown }).markerEnd === "arrow" || (o as { markerStart?: unknown }).markerStart === "arrow"
	                                    ? "矢印"
	                                    : "線"
	                                  : kind;
	                          const detail = kind === "text" ? String((o as { text?: unknown }).text ?? "").trim() : "";
	                          const detailShort = detail.length > 18 ? `${detail.slice(0, 18)}…` : detail;
	                          const label = name || `${kindLabel} #${i + 1}${detailShort ? `: ${detailShort}` : ""}`;
	                          return (
	                            <option key={id || `${kind}-${i}`} value={id}>
	                              {label}
	                            </option>
	                          );
	                        })}
	                      </select>
	                    </label>

	                    <div className="ggt-actions" style={{ marginTop: 6 }}>
	                      <button type="button" className="seq-button secondary" onClick={moveSelectedOverlayLayer.bind(null, "back")} disabled={!builderSelectedOverlayId}>
	                        背面へ
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={moveSelectedOverlayLayer.bind(null, "front")} disabled={!builderSelectedOverlayId}>
	                        前面へ
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={duplicateSelectedOverlay} disabled={!builderSelectedOverlayId}>
	                        複製
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={copySelectedOverlay} disabled={!builderSelectedOverlayId}>
	                        コピー
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={pasteOverlay}>
	                        貼り付け
	                      </button>
	                      <button type="button" className="seq-button secondary" onClick={deleteSelectedOverlay} disabled={!builderSelectedOverlayId}>
	                        削除
	                      </button>
	                    </div>

	                    {(() => {
	                      const selectedId = (builderSelectedOverlayId || "").trim();
	                      const ov = selectedId ? findUserOverlayById(selectedId) : undefined;
	                      if (!ov) return <div className="ggt-muted">オブジェクトを選択するとプロパティが出ます。</div>;
	                      const kind = String((ov as { kind?: unknown }).kind ?? "");
	                      const num = (v: string): number | null => {
	                        const n = Number(v);
	                        return Number.isFinite(n) ? n : null;
	                      };

	                      if (kind === "text") {
	                        const t = ov as OverlayShape & { kind: "text" };
	                        return (
	                          <>
	                            <div className="ggt-row" style={{ marginTop: 8 }}>
	                              <label className="seq-label">
	                                <span>テキスト</span>
	                                <input
	                                  className="seq-input"
	                                  value={t.text}
	                                  onChange={(e) => updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), text: e.target.value } as OverlayShape))}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>x</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(t.x)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), x: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>y</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(t.y)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), y: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>fontSize</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={8}
	                                  max={200}
	                                  value={t.fontSize ?? 24}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), fontSize: Math.max(8, Math.min(200, n)) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>fill</span>
	                                <input
	                                  className="seq-input"
	                                  value={t.fill ?? ""}
	                                  onChange={(e) => updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), fill: e.target.value } as OverlayShape))}
	                                  placeholder="#111827"
	                                />
	                              </label>
	                            </div>
	                          </>
	                        );
	                      }

	                      if (kind === "rect") {
	                        const r = ov as OverlayShape & { kind: "rect" };
	                        return (
	                          <>
	                            <div className="ggt-row" style={{ marginTop: 8 }}>
	                              <label className="seq-label">
	                                <span>x</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(r.x)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), x: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>y</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(r.y)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), y: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>width</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={1}
	                                  value={Math.round(r.width)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), width: Math.max(1, n) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>height</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={1}
	                                  value={Math.round(r.height)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), height: Math.max(1, n) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>fill</span>
	                                <input
	                                  className="seq-input"
	                                  value={r.fill ?? ""}
	                                  onChange={(e) => updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), fill: e.target.value } as OverlayShape))}
	                                  placeholder="none"
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>stroke</span>
	                                <input
	                                  className="seq-input"
	                                  value={r.stroke ?? ""}
	                                  onChange={(e) => updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), stroke: e.target.value } as OverlayShape))}
	                                  placeholder="#111827"
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>strokeWidth</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={0}
	                                  max={40}
	                                  value={r.strokeWidth ?? 3}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), strokeWidth: Math.max(0, Math.min(40, n)) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>opacity</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={0}
	                                  max={1}
	                                  step={0.05}
	                                  value={Number.isFinite((r as { opacity?: unknown }).opacity as number) ? ((r as { opacity?: number }).opacity as number) : 1}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), opacity: Math.max(0, Math.min(1, n)) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                          </>
	                        );
	                      }

	                      if (kind === "line") {
	                        const l = ov as OverlayShape & { kind: "line" };
	                        const isArrow = l.markerEnd === "arrow" || l.markerStart === "arrow";
	                        return (
	                          <>
	                            <div className="ggt-row" style={{ marginTop: 8 }}>
	                              <label className="seq-label">
	                                <span>x1</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(l.x1)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), x1: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>y1</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(l.y1)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), y1: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>x2</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(l.x2)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), x2: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>y2</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  value={Math.round(l.y2)}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), y2: n } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row">
	                              <label className="seq-label">
	                                <span>stroke</span>
	                                <input
	                                  className="seq-input"
	                                  value={l.stroke ?? ""}
	                                  onChange={(e) => updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), stroke: e.target.value } as OverlayShape))}
	                                  placeholder="#111827"
	                                />
	                              </label>
	                              <label className="seq-label">
	                                <span>strokeWidth</span>
	                                <input
	                                  className="seq-input"
	                                  type="number"
	                                  min={1}
	                                  max={40}
	                                  value={l.strokeWidth ?? 3}
	                                  onChange={(e) => {
	                                    const n = num(e.target.value);
	                                    if (n === null) return;
	                                    updateSelectedOverlay((cur) => ({ ...(cur as Record<string, unknown>), strokeWidth: Math.max(1, Math.min(40, n)) } as OverlayShape));
	                                  }}
	                                />
	                              </label>
	                            </div>
	                            <div className="ggt-row ggt-row-1">
	                              <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
	                                <input
	                                  type="checkbox"
	                                  checked={isArrow}
	                                  onChange={(e) => {
	                                    const on = e.target.checked;
	                                    updateSelectedOverlay((cur) => ({
	                                      ...(cur as Record<string, unknown>),
	                                      markerStart: undefined,
	                                      markerEnd: on ? "arrow" : undefined,
	                                    }) as OverlayShape);
	                                  }}
	                                />
	                                矢印（end）
	                              </label>
	                            </div>
	                          </>
	                        );
	                      }

	                      return null;
	                    })()}
	                  </div>

	                  {builderEditMode === "preview" ? (
	                    <div className="ggt-card">
	                      <div className="ggt-card-title">Rows（名前/注釈）</div>
                  <div className="ggt-help">Edit sample names, right-side trait/status labels, red emphasis, and symbols. Genotype cells are edited in the preview.</div>
                      <div className="ggt-rowlist">
                        {builderRows.map((row, rIdx) => (
                          <div key={row.id} className="ggt-rowlist-item">
                            <div className="ggt-row">
                              <label className="seq-label">
                                <span>Row {rIdx + 1}</span>
                                <input
                                  className="seq-input"
                                  value={row.sample}
                                  onChange={(e) => setBuilderRowSample(rIdx, e.target.value)}
                                  placeholder={`R${rIdx + 1}`}
                                />
                              </label>
                              <label className="seq-label">
                          <span>Right label (trait/status)</span>
                                <input
                                  className="seq-input"
                                  value={row.rightLabel}
                                  onChange={(e) => setBuilderRowRightLabel(rIdx, e.target.value)}
                                  placeholder="右ラベル(任意)"
                                />
                              </label>
                            </div>
                            <div className="ggt-builder-row-actions">
                              <label className="ggt-builder-row-flag" title="右ラベルを赤">
                                <input type="checkbox" checked={row.labelRed} onChange={(e) => withBuilderUndo(() => setBuilderRowLabelRed(rIdx, e.target.checked))} />
                                赤
                              </label>
                              <select
                                className="ggt-select ggt-builder-row-mark"
                                title="右側の記号"
                                value={row.mark}
                                onChange={(e) => withBuilderUndo(() => setBuilderRowMark(rIdx, e.target.value as BuilderMark))}
                              >
                                <option value="none">-</option>
                                <option value="circle">○</option>
                                <option value="cross">×</option>
                              </select>
                              <button type="button" className="ggt-mini-btn" title="行をブラシで塗りつぶし" onClick={() => fillRowWith(rIdx, builderBrush)}>
                                Fill
                              </button>
                              <button type="button" className="ggt-mini-btn" title="行をクリア" onClick={() => clearRow(rIdx)}>
                                Clear
                              </button>
                              <button type="button" className="ggt-mini-btn" title="A/B 入れ替え" onClick={() => swapRowAB(rIdx)}>
                                Swap
                              </button>
                              <button type="button" className="ggt-mini-btn" title="行を複製" onClick={() => duplicateRow(rIdx)}>
                                Dup
                              </button>
                              <button type="button" className="ggt-mini-btn" title="上へ" onClick={() => moveRow(rIdx, -1)} disabled={rIdx === 0}>
                                ↑
                              </button>
                              <button
                                type="button"
                                className="ggt-mini-btn"
                                title="下へ"
                                onClick={() => moveRow(rIdx, 1)}
                                disabled={rIdx === builderRows.length - 1}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="ggt-mini-btn danger"
                                title="行を削除"
                                onClick={() => deleteRow(rIdx)}
                                disabled={builderRows.length <= 1}
                              >
                                Del
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="ggt-card">
                    <div className="ggt-card-title">保存 / 読込</div>
                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={downloadBuilderProject}>
                        Project(JSON) 保存
                      </button>
                      <button type="button" className="seq-button secondary" onClick={downloadBuilderTsv}>
                        TSV 保存
                      </button>
                    </div>
                    <label className="ggt-file-label" style={{ marginTop: 8 }}>
                      <span>Project(.json) 読み込み</span>
                      <input
                        className="ggt-file"
                        type="file"
                        accept=".json"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const txt = await readFileAsText(f);
                            loadBuilderProjectText(txt);
                            setMessage(`Builder project を読み込みました: ${f.name}`);
                            setJsonError("");
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                      />
	                    </label>
	                    <div className="ggt-help">大量データは TSV / Flapjack から生成→必要部分だけ Builder で手修正が現実的です。</div>
	
	                    <div style={{ marginTop: 12, borderTop: "1px solid rgba(148, 163, 184, 0.35)", paddingTop: 12 }}>
	                      <div className="ggt-row ggt-row-1">
	                        <label className="ggt-muted" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
	                          <input
	                            type="checkbox"
	                            checked={builderAutosaveEnabled}
	                            onChange={(e) => setBuilderAutosaveEnabled(e.target.checked)}
	                          />
	                          自動バックアップ（ローカル）
	                        </label>
	                      </div>
	                      <div className="ggt-actions" style={{ marginTop: 8 }}>
	                        <button
	                          type="button"
	                          className="seq-button secondary"
	                          onClick={() => pushBuilderAutosave(buildBuilderProjectPayload())}
	                        >
	                          今すぐ保存
	                        </button>
	                        <button
	                          type="button"
	                          className="seq-button secondary"
	                          onClick={() => persistBuilderAutosaves([])}
	                          disabled={builderAutosaves.length === 0}
	                        >
	                          履歴を消す
	                        </button>
	                      </div>
	                      {builderAutosaves.length ? (
	                        <div className="ggt-rowlist" style={{ marginTop: 10 }}>
	                          {builderAutosaves.map((a) => {
	                            const payload = a.payload || {};
	                            const base = safeFileBase(String(payload.baseName ?? "builder"));
	                            const rows = Array.isArray(payload.rows) ? payload.rows.length : 0;
	                            const markers = Number(payload.markers ?? 0);
	                            const ts = new Date(a.savedAt).toLocaleString("ja-JP");
	                            return (
	                              <div key={a.id} className="ggt-rowlist-item">
	                                <div className="ggt-row">
	                                  <div>
	                                    <div style={{ fontWeight: 800 }}>{ts}</div>
	                                    <div className="ggt-muted">
	                                      {String(payload.baseName ?? "") || "Builder"} • rows {rows} • markers {Number.isFinite(markers) ? markers : 0}
	                                    </div>
	                                  </div>
	                                  <div className="ggt-actions" style={{ justifyContent: "flex-end" }}>
	                                    <button
	                                      type="button"
	                                      className="ggt-mini-btn"
	                                      onClick={() => {
	                                        try {
	                                          loadBuilderProjectText(JSON.stringify(payload));
	                                          setMessage(`自動バックアップから復元しました: ${ts}`);
	                                          setJsonError("");
	                                        } catch (err) {
	                                          setJsonError(err instanceof Error ? err.message : String(err));
	                                        }
	                                      }}
	                                    >
	                                      復元
	                                    </button>
	                                    <button
	                                      type="button"
	                                      className="ggt-mini-btn"
	                                      onClick={() =>
	                                        downloadTextFile(
	                                          JSON.stringify(payload, null, 2),
	                                          `${base}_autosave_${timestampForFile()}.json`,
	                                          "application/json;charset=utf-8",
	                                        )
	                                      }
	                                    >
	                                      JSON保存
	                                    </button>
	                                    <button
	                                      type="button"
	                                      className="ggt-mini-btn danger"
	                                      onClick={() => persistBuilderAutosaves(builderAutosaves.filter((x) => x.id !== a.id))}
	                                    >
	                                      削除
	                                    </button>
	                                  </div>
	                                </div>
	                              </div>
	                            );
	                          })}
	                        </div>
	                      ) : (
	                        <div className="ggt-help" style={{ marginTop: 8 }}>
	                          まだバックアップはありません（編集すると自動で保存されます）。
	                        </div>
	                      )}
	                    </div>
	                  </div>

                  {builderEditMode === "grid" ? (
                    <div className="ggt-card ggt-preview-mini">
                      <div className="ggt-card-title">Preview</div>
                      <div className="ggt-preview-mini-canvas">
                        <GraphicalGenotypeSvg ref={svgRef} config={config} />
                      </div>
                      <div className="ggt-actions">
                        <button type="button" className="seq-button secondary" onClick={() => setBuilderEditMode("preview")}>
                          プレビューで編集…
                        </button>
                        <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                          Export で拡大…
                        </button>
                      </div>
                      <div className="ggt-help">グリッド編集は右側の大きい領域で行います（クリック/ドラッグ）。</div>
                    </div>
                  ) : (
                    <div className="ggt-card">
                      <div className="ggt-card-title">Preview 編集</div>
                      <div className="ggt-actions">
                        <button type="button" className="seq-button secondary" onClick={() => setBuilderEditMode("grid")}>
                          グリッドに戻す
                        </button>
                        <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                          Export へ
                        </button>
                      </div>
                      <div className="ggt-help">
                        {builderTool === "cycle"
                          ? "クリック循環: クリック=次へ / Shift+クリック=逆順（1セル=マーカー1つ）。1/2 で循環順、C でツール切替。"
                          : "右側の図をクリック/ドラッグで塗れます（A/B/H/-。C=ツール切替、G/P=表示切替）。"}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "template" ? (
                <div className="ggt-tab-body">
                  <label className="seq-label">
                    <span>テンプレート</span>
                    <select className="ggt-select" value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {template.description ? <div className="ggt-help">{template.description}</div> : null}
                  <div className="ggt-actions">
                    <button type="button" className="seq-button secondary" onClick={() => setTab("advanced")}>
                      JSON で微調整…
                    </button>
                    <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                      このまま保存…
                    </button>
                  </div>
                </div>
              ) : null}

              {tab === "tsv" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-card">
                    <div className="ggt-card-title">TSV ファイル</div>
                    <input
                      className="ggt-file"
                      type="file"
                      accept=".tsv,.txt,.tab,.csv"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const txt = await readFileAsText(f);
                          setTsvText(txt);
                          setBaseName(basenameFromFilename(f.name));
                          setMessage(`TSV を読み込みました: ${f.name}`);
                          setJsonError("");
                        } catch (err) {
                          setJsonError(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    />
                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={() => setTsvText(EXAMPLE_TSV)}>
                        例を入れる
                      </button>
                      <button type="button" className="seq-button" onClick={() => generateFromTsv(tsvText)}>
                        TSV から生成
                      </button>
                    </div>
                  </div>

                  <div className="ggt-row">
                    <label className="seq-label">
                      <span>Palette</span>
                      <select className="ggt-select" value={tsvPaletteId} onChange={(e) => setTsvPaletteId(e.target.value)}>
                        {palettePresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="seq-label">
                      <span>Theme</span>
                      <select className="ggt-select" value={tsvTheme} onChange={(e) => setTsvTheme(e.target.value as "dark" | "light")}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </label>
                  </div>
                  <div className="ggt-row ggt-row-1">
                    <label className="ggt-muted">
                      <input type="checkbox" checked={tsvCompressRuns} onChange={(e) => setTsvCompressRuns(e.target.checked)} style={{ marginRight: 8 }} />
                      連続マーカーをまとめる（セグメント）
                    </label>
                    <label className="ggt-muted">
                      <input type="checkbox" checked={tsvScaleByPos} onChange={(e) => setTsvScaleByPos(e.target.checked)} style={{ marginRight: 8 }} />
                      pos があれば距離でスケール
                    </label>
                    <label className="ggt-muted">
                      <input type="checkbox" checked={tsvSortMarkers} onChange={(e) => setTsvSortMarkers(e.target.checked)} style={{ marginRight: 8 }} />
                      chr/pos があれば並べ替える
                    </label>
                  </div>

                  <div className="ggt-help">
                    1行目=マーカー、1列目=サンプル名。任意で2行目=chr、3行目=pos。セルは A/B/H/-（または AA/BB/AB）。
                  </div>
                  <textarea className="seq-textarea" value={tsvText} onChange={(e) => setTsvText(e.target.value)} rows={12} />
                </div>
              ) : null}

              {tab === "flapjack" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-card">
                    <div className="ggt-card-title">Flapjack ファイル</div>
                    <div className="ggt-file-row">
                      <label className="ggt-file-label">
                        <span>MAP</span>
                        <input
                          className="ggt-file"
                          type="file"
                          accept=".txt,.tsv,.tab,.map"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              const txt = await readFileAsText(f);
                              setFjMapText(txt);
                              setMessage(`MAP を読み込みました: ${f.name}`);
                              setFjError("");
                            } catch (err) {
                              setFjError(err instanceof Error ? err.message : String(err));
                            }
                          }}
                        />
                      </label>
                      <label className="ggt-file-label">
                        <span>GENOTYPE</span>
                        <input
                          className="ggt-file"
                          type="file"
                          accept=".txt,.tsv,.tab,.dat,.geno"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              const txt = await readFileAsText(f);
                              setFjGenoText(txt);
                              setBaseName(basenameFromFilename(f.name));
                              setMessage(`GENOTYPE を読み込みました: ${f.name}`);
                              setFjError("");
                            } catch (err) {
                              setFjError(err instanceof Error ? err.message : String(err));
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={() => (setFjMapText(EXAMPLE_FJ_MAP), setFjGenoText(EXAMPLE_FJ_GENO))}>
                        例を入れる
                      </button>
                      <button type="button" className="seq-button secondary" onClick={analyzeFlapjack}>
                        解析
                      </button>
                      <button type="button" className="seq-button" onClick={() => generateFromFlapjack()}>
                        生成（ABH）
                      </button>
                    </div>
                    {fjStats ? (
                      <div className="ggt-muted">
                        MAP: {fjStats.mapMarkers} markers / GENOTYPE: {fjStats.genoMarkers} markers / 一致: {fjStats.matchedMarkers} / samples: {fjStats.samples}
                      </div>
                    ) : null}
                    {fjError ? <div className="ggt-error">Flapjack error: {fjError}</div> : null}
                  </div>

                  <div className="ggt-row">
                    <label className="seq-label">
                      <span>Reference A</span>
                      <select className="ggt-select" value={fjParentA} onChange={(e) => setFjParentA(e.target.value)}>
                        <option value="">(auto)</option>
                        {fjSampleNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="seq-label">
                      <span>Reference B</span>
                      <select className="ggt-select" value={fjParentB} onChange={(e) => setFjParentB(e.target.value)}>
                        <option value="">(auto)</option>
                        {fjSampleNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="ggt-row">
                    <label className="seq-label">
                      <span>Palette</span>
                      <select className="ggt-select" value={fjPaletteId} onChange={(e) => setFjPaletteId(e.target.value)}>
                        {palettePresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="seq-label">
                      <span>Theme</span>
                      <select className="ggt-select" value={fjTheme} onChange={(e) => setFjTheme(e.target.value as "dark" | "light")}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </label>
                  </div>

                  <div className="ggt-row ggt-row-1">
                    <label className="ggt-muted">
                      <input type="checkbox" checked={fjCompressRuns} onChange={(e) => setFjCompressRuns(e.target.checked)} style={{ marginRight: 8 }} />
                      連続マーカーをまとめる（セグメント）
                    </label>
                    <label className="ggt-muted">
                      <input type="checkbox" checked={fjScaleByPos} onChange={(e) => setFjScaleByPos(e.target.checked)} style={{ marginRight: 8 }} />
                      pos でスケール
                    </label>
                  </div>

                  <label className="seq-label">
                    <span>MAP（marker chr pos）</span>
                    <textarea className="seq-textarea" value={fjMapText} onChange={(e) => setFjMapText(e.target.value)} rows={6} />
                  </label>
                  <label className="seq-label">
                    <span>GENOTYPE（sample + marker 列）</span>
                    <textarea className="seq-textarea" value={fjGenoText} onChange={(e) => setFjGenoText(e.target.value)} rows={10} />
                  </label>
                </div>
              ) : null}

              {tab === "ops" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-card">
                    <div className="ggt-card-title">操作対象</div>
                    {matrixData ? (
                      <div className="ggt-muted">
                        source: {matrixData.source} • {matrixData.markers.length} markers • {matrixData.rows.length} rows
                        {opsDerived?.hasChr ? " • chr" : ""}{opsDerived?.hasPos ? " • pos" : ""}
                      </div>
                    ) : (
                      <div className="ggt-help">TSV/Flapjack で生成するか、Builder を取り込んでください。</div>
                    )}
                    <div className="ggt-actions">
                      <button type="button" className="seq-button secondary" onClick={captureBuilderToOps}>
                        Builder を取り込む
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => setTab("tsv")}>
                        TSV へ
                      </button>
                      <button type="button" className="seq-button secondary" onClick={() => setTab("flapjack")}>
                        Flapjack へ
                      </button>
                      <button type="button" className="seq-button secondary" onClick={resetOps}>
                        操作リセット
                      </button>
                    </div>
                  </div>

                  {matrixData ? (
                    <>
                      <div className="ggt-card">
                        <div className="ggt-card-title">表示/描画</div>
                        <div className="ggt-row">
                          <label className="seq-label">
                            <span>ベース名（凡例/書き出し）</span>
                            <input
                              className="seq-input"
                              value={matrixData.baseName}
                              onChange={(e) => {
                                const v = e.target.value;
                                setMatrixData((prev) => (prev ? { ...prev, baseName: v } : prev));
                                setBaseName(v);
                              }}
                            />
                          </label>
                        </div>
                        <div className="ggt-row">
                          <label className="seq-label">
                            <span>Palette</span>
                            <select
                              className="ggt-select"
                              value={matrixData.render.paletteId}
                              onChange={(e) => updateMatrixRender({ paletteId: e.target.value })}
                            >
                              {palettePresets.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="seq-label">
                            <span>Theme</span>
                            <select
                              className="ggt-select"
                              value={matrixData.render.theme}
                              onChange={(e) => updateMatrixRender({ theme: e.target.value as "dark" | "light" })}
                            >
                              <option value="dark">Dark</option>
                              <option value="light">Light</option>
                            </select>
                          </label>
                        </div>
                        <div className="ggt-row ggt-row-1">
                          <label className="ggt-muted">
                            <input
                              type="checkbox"
                              checked={matrixData.render.compressRuns}
                              onChange={(e) => updateMatrixRender({ compressRuns: e.target.checked })}
                              style={{ marginRight: 8 }}
                            />
                            連続マーカーをまとめる（セグメント）
                          </label>
                          <label className="ggt-muted" title={opsDerived?.hasPos ? "" : "pos が無い場合は効果がありません"}>
                            <input
                              type="checkbox"
                              checked={matrixData.render.scaleByPosition}
                              onChange={(e) => updateMatrixRender({ scaleByPosition: e.target.checked })}
                              disabled={!opsDerived?.hasPos}
                              style={{ marginRight: 8 }}
                            />
                            pos でスケール
                          </label>
                          <label className="ggt-muted" title={opsDerived?.hasChr ? "" : "chr が無い場合は効果がありません"}>
                            <input
                              type="checkbox"
                              checked={matrixData.render.sortMarkers}
                              onChange={(e) => updateMatrixRender({ sortMarkers: e.target.checked })}
                              disabled={!opsDerived?.hasChr}
                              style={{ marginRight: 8 }}
                            />
                            chr/pos で並べ替え
                          </label>
                        </div>
                        <div className="ggt-actions">
                          <button type="button" className="seq-button secondary" onClick={() => setTab("export")}>
                            Export へ
                          </button>
                          <button type="button" className="seq-button secondary" onClick={downloadOpsTsv}>
                            TSV（処理済）保存
                          </button>
                        </div>
                      </div>

                      <div className="ggt-card">
                        <div className="ggt-card-title">平滑化 / 欠測補完（注記前提）</div>
                        <div className="ggt-row ggt-row-1">
                          <label className="ggt-muted">
                            <input type="checkbox" checked={opsSmooth} onChange={(e) => setOpsSmooth(e.target.checked)} style={{ marginRight: 8 }} />
                            平滑化（A-B-A→A / B-A-B→B）
                          </label>
                          <label className="ggt-muted" style={{ opacity: opsSmooth ? 1 : 0.55 }}>
                            <input
                              type="checkbox"
                              checked={opsSmoothH}
                              onChange={(e) => setOpsSmoothH(e.target.checked)}
                              disabled={!opsSmooth}
                              style={{ marginRight: 8 }}
                            />
                            H も挟み込み（A-H-A→A）
                          </label>
                        </div>
                        <div className="ggt-row ggt-row-1">
                          <label className="ggt-muted">
                            <input type="checkbox" checked={opsImpute} onChange={(e) => setOpsImpute(e.target.checked)} style={{ marginRight: 8 }} />
                            欠測補完（A--A→A / B--B→B）
                          </label>
                          <label className="ggt-muted" style={{ opacity: opsImpute ? 1 : 0.55 }}>
                            <input
                              type="checkbox"
                              checked={opsImputeH}
                              onChange={(e) => setOpsImputeH(e.target.checked)}
                              disabled={!opsImpute}
                              style={{ marginRight: 8 }}
                            />
                            H--H も補完
                          </label>
                        </div>
                        <div className="ggt-help">
                          平滑化/補完を行った図は、必ず図注にルールを書いて「元データ版」も残すのが安全です。
                        </div>
                      </div>

                      <div className="ggt-card">
                        <div className="ggt-card-title">並び替え / 領域</div>
                        <div className="ggt-row">
                          <label className="seq-label">
                            <span>行の並び</span>
                            <select className="ggt-select" value={opsRowSort} onChange={(e) => setOpsRowSort(e.target.value as OpsRowSortMode)}>
                              <option value="input">入力順</option>
                              <option value="id">ID 昇順</option>
                              <option value="region">領域で並べ替え（多い順）</option>
                            </select>
                          </label>
                          {opsRowSort === "region" ? (
                            <label className="seq-label">
                              <span>ターゲット</span>
                              <select className="ggt-select" value={opsTargetCode} onChange={(e) => setOpsTargetCode(e.target.value as "A" | "B")}>
                                <option value="A">A</option>
                                <option value="B">B</option>
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <div className="ggt-row ggt-row-1">
                          <label className="ggt-muted">
                            <input type="checkbox" checked={opsRegionEnabled} onChange={(e) => setOpsRegionEnabled(e.target.checked)} style={{ marginRight: 8 }} />
                            領域指定を使う
                          </label>
                          <label className="ggt-muted" style={{ opacity: opsRegionEnabled ? 1 : 0.55 }}>
                            <input
                              type="checkbox"
                              checked={opsCropToRegion}
                              onChange={(e) => setOpsCropToRegion(e.target.checked)}
                              disabled={!opsRegionEnabled}
                              style={{ marginRight: 8 }}
                            />
                            指定領域だけ表示（切り抜き）
                          </label>
                        </div>

                        {opsRegionEnabled ? (
                          <>
                            {opsDerived?.hasChr && opsDerived.chrs.length ? (
                              <label className="seq-label">
                                <span>chr</span>
                                <select className="ggt-select" value={opsRegionChr} onChange={(e) => setOpsRegionChr(e.target.value)}>
                                  <option value="All">All</option>
                                  {opsDerived.chrs.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div className="ggt-help">chr 情報が無いので、インデックス範囲で指定します。</div>
                            )}

                            {opsDerived?.hasChr && opsRegionChr !== "All" && opsDerived?.hasPos ? (
                              <>
                                <div className="ggt-row">
                                  <label className="seq-label">
                                    <span>start pos</span>
                                    <input
                                      className="seq-input"
                                      type="number"
                                      value={opsRegionStartPos}
                                      onChange={(e) => setOpsRegionStartPos(Number(e.target.value))}
                                    />
                                  </label>
                                  <label className="seq-label">
                                    <span>end pos</span>
                                    <input
                                      className="seq-input"
                                      type="number"
                                      value={opsRegionEndPos}
                                      onChange={(e) => setOpsRegionEndPos(Number(e.target.value))}
                                    />
                                  </label>
                                </div>
                                <div className="ggt-actions">
                                  <button type="button" className="seq-button secondary" onClick={setOpsPosToChrFull}>
                                    chr 全域にする
                                  </button>
                                </div>
                              </>
                            ) : opsDerived?.hasChr && opsRegionChr !== "All" ? (
                              <div className="ggt-help">pos が無いので chr 全体を対象にします。</div>
                            ) : (
                              <>
                                <div className="ggt-row">
                                  <label className="seq-label">
                                    <span>start idx (1-based)</span>
                                    <input
                                      className="seq-input"
                                      type="number"
                                      min={1}
                                      max={matrixData.markers.length}
                                      value={opsRegionStartIdx1}
                                      onChange={(e) => setOpsRegionStartIdx1(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                                    />
                                  </label>
                                  <label className="seq-label">
                                    <span>end idx (1-based)</span>
                                    <input
                                      className="seq-input"
                                      type="number"
                                      min={1}
                                      max={matrixData.markers.length}
                                      value={opsRegionEndIdx1}
                                      onChange={(e) => setOpsRegionEndIdx1(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                                    />
                                  </label>
                                </div>
                                <div className="ggt-actions">
                                  <button type="button" className="seq-button secondary" onClick={setOpsIndexToAll}>
                                    全範囲にする
                                  </button>
                                </div>
                              </>
                            )}
                            {opsDerived?.regionError ? <div className="ggt-error">{opsDerived.regionError}</div> : null}
                          </>
                        ) : null}

                        <div className="ggt-help">
                          ルール（左マーカー採用の区間など）を含む説明は `docs/GRAPHICAL_GENOTYPE_GUIDE_JA.md` を参照。
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {tab === "export" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-row">
                    <label className="seq-label">
                      <span>ベース名</span>
                      <input className="seq-input" value={baseName} onChange={(e) => setBaseName(e.target.value)} />
                    </label>
                    <label className="seq-label">
                      <span>形式</span>
                      <select className="ggt-select" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as "svg" | "jpeg")}>
                        <option value="jpeg">JPEG</option>
                        <option value="svg">SVG</option>
                      </select>
                    </label>
                    <label className="seq-label">
                      <span>幅(px)</span>
                      <input className="seq-input" type="number" min={1} value={exportWidth} onChange={(e) => setExportWidth(Number(e.target.value))} />
                    </label>
                    <label className="seq-label">
                      <span>高さ(px)</span>
                      <input className="seq-input" type="number" min={1} value={exportHeight} onChange={(e) => setExportHeight(Number(e.target.value))} />
                    </label>
                  </div>

                  {exportFormat === "jpeg" ? (
                    <label className="seq-label">
                      <span>JPEG quality (0〜1)</span>
                      <input className="seq-input" type="number" step={0.01} min={0.1} max={1} value={jpegQuality} onChange={(e) => setJpegQuality(Number(e.target.value))} />
                    </label>
                  ) : null}

                  <div className="ggt-actions">
                    <button type="button" className="seq-button secondary" onClick={() => (setExportWidth(3840), setExportHeight(2160))}>
                      4K (3840x2160)
                    </button>
                    <button type="button" className="seq-button secondary" onClick={() => (setExportWidth(1920), setExportHeight(1080))}>
                      1080p (1920x1080)
                    </button>
                    <button type="button" className="seq-button secondary" onClick={setExportToConfigSize}>
                      SVGサイズに合わせる ({Math.floor(config.width)}x{Math.floor(config.height)})
                    </button>
                    <button type="button" className="seq-button" onClick={doExport} disabled={busy}>
                      {busy ? "書き出し中..." : "保存"}
                    </button>
                  </div>
                  <div className="ggt-muted">保存できない場合は、まず SVG で保存 → 画像変換ツールで JPEG/PNG 化も可能です。</div>
                </div>
              ) : null}

              {tab === "advanced" ? (
                <div className="ggt-tab-body">
                  <div className="ggt-help">細かい調整をしたい場合は JSON を直接編集します（不正なJSONでも現在の描画は維持されます）。</div>
                  <textarea className="seq-textarea" value={configText} onChange={(e) => setConfigText(e.target.value)} rows={16} />
                  <div className="ggt-actions">
                    <button type="button" className="seq-button secondary" onClick={applyJson}>
                      JSON を反映
                    </button>
                    <button type="button" className="seq-button secondary" onClick={() => setConfigText(prettyJson(config))}>
                      現在の設定を整形
                    </button>
                  </div>
                </div>
              ) : null}

              {message ? <div className="ggt-muted" style={{ marginTop: 8 }}>{message}</div> : null}
              {jsonError ? <div className="ggt-error" style={{ marginTop: 8 }}>Error: {jsonError}</div> : null}
            </div>

            <div
              className={`ggt-resizer ${isResizingSidebar ? "is-dragging" : ""}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              title="ドラッグで左パネル幅を変更（ダブルクリックで 520px に戻す）"
              onPointerDown={startResizeSidebar}
              onPointerMove={moveResizeSidebar}
              onPointerUp={endResizeSidebar}
              onPointerCancel={endResizeSidebar}
              onPointerLeave={endResizeSidebar}
              onDoubleClick={() => setSidebarWidth(520)}
            />

            {tab === "builder" ? (
              <div className="ggt-editor-card">
                {builderCanvasToolbar}
                {builderEditMode === "grid" ? (
                  builderGrid
                ) : (
                  <div
                    className={`ggt-canvas-card ggt-builder-canvas ${builderTool === "cycle" ? "ggt-canvas-cycle" : ""} ${builderEditMode === "preview" ? "ggt-canvas-edit" : ""} ${builderObjectMode ? "ggt-canvas-object" : ""}`}
                    style={{ ["--ggt-preview-zoom" as never]: String(builderPreviewZoom) } as React.CSSProperties}
                    onPointerDown={builderEditMode === "preview" ? handleBuilderPreviewPointerDown : undefined}
                    onPointerMove={builderEditMode === "preview" ? handleBuilderPreviewPointerMove : undefined}
                    onPointerUp={builderEditMode === "preview" ? handleBuilderPreviewPointerUp : undefined}
                    onPointerCancel={builderEditMode === "preview" ? handleBuilderPreviewPointerUp : undefined}
                    onPointerLeave={builderEditMode === "preview" ? handleBuilderPreviewPointerUp : undefined}
                  >
                    <GraphicalGenotypeSvg
                      ref={svgRef}
                      config={config}
                      editor={
                        builderEditMode === "preview"
                          ? {
                            enableOverlayPointerEvents: builderObjectMode,
                            selectedOverlayId: builderObjectMode ? builderSelectedOverlayId : null,
                            draftOverlay: builderObjectMode ? builderDraftOverlay : null,
                            uiGuides: builderUiGuidesRef.current,
                            uiHandles: builderUiHandlesRef.current,
                          }
                          : undefined
                      }
                    />
                    {builderCanvasEditPopover}
                  </div>
                )}
              </div>
            ) : (
              <div className="ggt-canvas-card">
                <GraphicalGenotypeSvg ref={svgRef} config={config} />
              </div>
            )}
            </div>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  );
};
