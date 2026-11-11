// Synthetic labels and values only. These fixtures do not contain study data.
export const markerLabels = ['chr02_合成01_HindIII', 'chr02_合成02_EcoRI', 'chr02_合成03_BamHI'];

export const publicationConfig = {
  width: 1800,
  height: 850,
  background: '#ffffff',
  columns: 3,
  xBoundaries: [0, 0.0005, 0.5005, 1],
  plot: { x: 340, y: 160, width: 650, annotationWidth: 750, rowHeight: 40, rowGap: 18 },
  styles: {
    text: { fontFamily: 'Arial, "Yu Gothic", Meiryo, sans-serif', fontSize: 22, fill: '#111827' },
    segment: { stroke: '#111827', strokeWidth: 1 },
  },
  annotationHeaders: { left: '帯化の有無\t花序の形成位置', right: '厚壁組織の形成状態', fontSize: 20, fill: '#111827' },
  xAxis: {
    placement: 'top', offset: 36, tickSize: 8, fontSize: 17, stroke: '#111827',
    ticks: markerLabels.map((label, i) => ({ x: [0, 0.001, 1][i], label })),
  },
  tracks: [
    {
      id: 'marker-axis', height: 100, gapAfter: 48, segments: [],
      axis: {
        tickSize: 20, labelTopFontSize: 17, labelBottomFontSize: 17, title: '位置 (Mb)',
        ticks: markerLabels.map((labelTop, i) => ({ x: [0, 0.001, 1][i], labelTop, labelBottom: ['10.000', '10.010', '20.000'][i] })),
      },
    },
    ...['有\t腋生', '無\t頂生', '未判定\t未判定'].map((text, i) => ({
      id: `synthetic-${i + 1}`,
      leftText: { text: `合成個体F₂-00${i + 1}（組換え型）` },
      rightText: { text },
      rightCircle: i === 0 ? { r: 12, strokeWidth: 2 } : undefined,
      rightCross: i === 1 ? { size: 20, strokeWidth: 2 } : undefined,
      segments: ['#ffffff', '#111827', '#aaaaaa'].map((fill, j) => ({ start: j / 3, end: (j + 1) / 3, fill })),
    })),
  ],
  legend: {
    x: 1050, y: 550, fontSize: 26, itemSize: 12, itemGap: 8, title: '遺伝子型（合成データ）',
    textFill: '#111827', background: '#ffffff', border: '#111827',
    items: [
      { label: '親A由来のホモ型', fill: '#ffffff', stroke: '#111827', strokeWidth: 1 },
      { label: 'ヘテロ型 H', fill: '#aaaaaa' },
      { label: '親B由来のホモ型', fill: '#111827' },
      { label: '未判定（欠測値）', fill: '#dddddd' },
    ],
  },
};

export const builderProject = {
  version: 9,
  baseName: 'synthetic_publication',
  markers: 3,
  markerMeta: markerLabels.map((name, i) => ({ name, chr: '2', pos: [10, 10.01, 20][i] })),
  scaleByPosition: false,
  leftLabels: true,
  showMarkerAxis: true,
  guides: true,
  guideMode: 'centers',
  headerLeft: '帯化\t花序',
  headerRight: '表現型',
  annoCols: [{ header: '帯化', visible: true, width: 120 }, { header: '花序', visible: true, width: 120 }],
  posUnit: 'Mb',
  figureMode: 'simple',
  figureTitle: '合成データによる組換え個体の比較',
  genoLegendA: '親A由来',
  genoLegendB: '親B由来',
  genoLegendH: 'ヘテロ型 H',
  paletteId: 'okabe_ito',
  theme: 'light',
  compressRuns: false,
  canvasWidth: 1800,
  annotationWidth: 450,
  rowHeight: 44,
  rowGap: 16,
  userOverlays: [],
  rows: [
    { sample: '合成F₂-01', annotations: ['有', '腋生'], rightLabel: '有\t腋生', mark: 'circle', codes: ['A', 'H', 'B'] },
    { sample: '合成F₂-02', annotations: ['無', '頂生'], rightLabel: '無\t頂生', mark: 'cross', codes: ['B', '-', 'H'] },
  ],
};

export const makeZoomProject = (markers) => ({
  ...builderProject,
  markers,
  markerMeta: Array.from({ length: markers }, (_, i) => ({
    name: `chr02_合成${String(i + 1).padStart(2, '0')}_HindIII`, chr: '2', pos: 10 + i * 0.5,
  })),
  figureMode: 'fa_zoom',
  zoomStages: 2,
  chrLabel: '第2染色体',
  chrLenMb: 100,
  coarseMarkersDraft: '広域合成01_HindIII 5\n広域合成02_EcoRI 15\n広域合成03_BamHI 25',
  chrZoomStartMb: 5,
  chrZoomEndMb: 25,
  coarseZoomStartMb: 10,
  coarseZoomEndMb: 20,
  faLabel: '候補座位',
  locusLabelText: '候補区間（合成データ）',
  arrowLabel: '候補区間 5.00 Mb',
  arrowLabelAuto: false,
  arrowStartMb: 12,
  arrowEndMb: 17,
  arrowOffsetX: 0,
  arrowOffsetY: 0,
  arrowLabelDx: 0,
  arrowLabelDy: 0,
  // This historical palette uses white for both H and missing. The publication
  // preset must make them distinguishable while preserving their actual codes.
  paletteId: 'blue_yellow_white',
  theme: 'dark',
  rows: builderProject.rows.map((row, r) => ({
    ...row,
    codes: Array.from({ length: markers }, (_, i) => (r === 0 ? ['A', 'H', 'B'] : ['B', '-', 'H'])[i % 3]),
  })),
});
