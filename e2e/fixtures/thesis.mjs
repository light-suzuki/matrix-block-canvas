// Synthetic inputs only. No labels, genotypes, or coordinates from the study.
export const thesisColors = { A: '#8DB4E2', B: '#FFD966', H: '#FFFFFF', '-': '#D9D9D9' };

export const makeThesisProject = (markerCount = 6, annotationCount = 2) => {
  const positions = markerCount === 6 ? [10, 10.01, 10.015, 12, 18, 20]
    : Array.from({ length: markerCount }, (_, i) => 10 + 10 * (i / Math.max(1, markerCount - 1)) ** 2);
  const markerMeta = positions.map((pos, i) => ({ name: `synthetic_M${String(i + 1).padStart(2, '0')}`, chr: '2', pos }));
  const sampleNames = ['合成親A', '合成親B', '合成F₂-01', '合成F₂-02', '合成F₂-03', '合成F₂-04'];
  const phenotypes = [['○', '頂生'], ['×', '腋生'], ['○', '腋生'], ['×', '頂生'], ['未判定', '未判定'], ['○', '頂生']];
  return {
    version: 9,
    baseName: 'synthetic_thesis_figure',
    markers: markerCount,
    markerMeta,
    scaleByPosition: false,
    leftLabels: true,
    showMarkerAxis: true,
    guides: false,
    guideMode: 'centers',
    headerLeft: annotationCount === 1 ? '厚壁組織\nの有無' : '茎の\n帯化\t花の\n位置',
    headerRight: '',
    annoCols: (annotationCount === 1 ? ['厚壁組織\nの有無'] : ['茎の\n帯化', '花の\n位置'])
      .map((header) => ({ header, visible: true, width: 0 })),
    posUnit: 'Mb',
    figureMode: 'thesis',
    chrLabel: 'Chr2',
    chrLenMb: 100,
    chrZoomStartMb: 10,
    chrZoomEndMb: 20,
    figureTitle: '',
    faLabel: '合成候補区間',
    arrowStartMb: 12,
    arrowEndMb: 20,
    arrowOffsetX: 0,
    arrowOffsetY: 0,
    arrowLabelDx: 0,
    arrowLabelDy: 0,
    arrowLabel: '',
    arrowLabelAuto: false,
    genoLegendA: '親A型',
    genoLegendB: '親B型',
    genoLegendH: 'ヘテロ型',
    thesisParentRows: 2,
    thesisGeneMarker: markerMeta[Math.min(4, markerCount - 1)].name,
    thesisGeneLabel: 'SyntheticGene',
    thesisCandidateEnabled: true,
    thesisPositionDecimals: 3,
    thesisFontPt: 7.5,
    thesisRowPitchMm: 3.6,
    thesisWidthMm: 140,
    paletteId: 'paper_blue_yellow',
    theme: 'light',
    compressRuns: false,
    canvasWidth: 1400,
    annotationWidth: annotationCount === 1 ? 150 : 210,
    rowHeight: 22.32,
    rowGap: 13.68,
    userOverlays: [],
    rows: sampleNames.map((sample, row) => ({
      sample,
      annotations: phenotypes[row].slice(0, annotationCount),
      rightLabel: phenotypes[row].slice(0, annotationCount).join('\t'),
      labelRed: false,
      mark: 'none',
      codes: Array.from({ length: markerCount }, (_, column) => row === 0 ? 'A' : row === 1 ? 'B' : ['H', '-', 'A', 'B'][(row + column) % 4]),
    })),
  };
};
