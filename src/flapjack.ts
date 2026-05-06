import type { MarkerInfo, MatrixRow } from "./ggtTemplates";

type FlapjackGenotype = { markerNames: string[]; rows: { sample: string; alleles: string[] }[] };

const isCommentLine = (line: string): boolean => /^\s*#/.test(line);

const splitCols = (line: string): string[] => {
  const tab = line.split(/\t+/).map((v) => v.trim());
  if (tab.length >= 3) return tab.filter((v) => v.length > 0 || tab.length > 1);
  return line.trim().split(/\s+/g);
};

export const parseFlapjackMap = (text: string): MarkerInfo[] => {
  const lines = text.split(/\r?\n/g).map((v) => v.trim()).filter(Boolean);
  const markers: MarkerInfo[] = [];
  for (const line of lines) {
    if (isCommentLine(line)) continue;
    const cols = splitCols(line);
    if (cols.length < 3) continue;
    const name = cols[0];
    const chr = cols[1];
    const pos = Number(cols[2]);
    markers.push({ name, chr, pos: Number.isFinite(pos) ? pos : undefined });
  }
  if (!markers.length) throw new Error("Flapjack MAP が空/不正です（marker chr pos のTSVを貼ってください）。");
  return markers;
};

export const parseFlapjackGenotype = (text: string): FlapjackGenotype => {
  const lines = text.split(/\r?\n/g).map((v) => v.replace(/\r/g, "")).filter((v) => v.trim().length > 0);
  const data = lines.filter((l) => !isCommentLine(l));
  if (data.length < 2) throw new Error("Flapjack GENOTYPE はヘッダ+1行以上が必要です。");

  const header = splitCols(data[0]);
  if (header.length < 2) throw new Error("Flapjack GENOTYPE ヘッダが不正です（1列目=サンプル名、以降=marker）。");
  const markerNames = header.slice(1).map((v, i) => v || `m${i + 1}`);

  const rows = data.slice(1).map((line) => {
    const cols = splitCols(line);
    const sample = (cols[0] || "").trim();
    if (!sample) throw new Error(`Flapjack GENOTYPE の行にサンプル名がありません: ${line.slice(0, 60)}`);
    const alleles = cols.slice(1);
    while (alleles.length < markerNames.length) alleles.push("-");
    return { sample, alleles: alleles.slice(0, markerNames.length) };
  });
  return { markerNames, rows };
};

const chrSortKey = (chr: string): { kind: "num" | "str"; n: number; s: string } => {
  const cleaned = chr.trim().replace(/^chr/i, "");
  const n = Number.parseInt(cleaned, 10);
  if (Number.isFinite(n)) return { kind: "num", n, s: "" };
  return { kind: "str", n: Number.POSITIVE_INFINITY, s: cleaned };
};

const parseAlleleSet = (raw: string): Set<string> => {
  const s = raw.trim().toUpperCase();
  if (!s) return new Set();
  if (s === "-" || s === "NA" || s === "N" || s === "NN" || s === "." || s === "0") return new Set();
  const compact = s.replace(/\s+/g, "");
  const parts = compact.split(/[\/|]/g).map((v) => v.trim()).filter(Boolean);
  return new Set(parts);
};

const classifyAbh = (alleles: Set<string>, parentA: Set<string>, parentB: Set<string>): string => {
  if (!alleles.size) return "-";
  if (!parentA.size || !parentB.size) return "-";
  const hasA = [...alleles].some((v) => parentA.has(v));
  const hasB = [...alleles].some((v) => parentB.has(v));
  if (hasA && hasB) return "H";
  if (hasA) return "A";
  if (hasB) return "B";
  return "-";
};

export const makeAbhMatrixFromFlapjack = (args: {
  mapText: string;
  genotypeText: string;
  parentA?: string;
  parentB?: string;
}): { markers: MarkerInfo[]; rows: MatrixRow[]; sampleNames: string[] } => {
  const mapMarkers = parseFlapjackMap(args.mapText);
  const geno = parseFlapjackGenotype(args.genotypeText);

  const genoIndex = new Map<string, number>();
  for (let i = 0; i < geno.markerNames.length; i += 1) genoIndex.set(geno.markerNames[i], i);

  const common = mapMarkers.filter((m) => genoIndex.has(m.name));
  if (!common.length) throw new Error("MAP と GENOTYPE のマーカーが一致しません（同じ marker 名が必要です）。");

  const markers = common
    .map((m) => ({ ...m }))
    .sort((a, b) => {
      const ca = a.chr || "ZZ";
      const cb = b.chr || "ZZ";
      const ka = chrSortKey(ca);
      const kb = chrSortKey(cb);
      if (ka.kind !== kb.kind) return ka.kind === "num" ? -1 : 1;
      if (ka.kind === "num" && ka.n !== kb.n) return ka.n - kb.n;
      if (ka.kind === "str" && ka.s !== kb.s) return ka.s.localeCompare(kb.s);
      const pa = Number.isFinite(a.pos ?? Number.NaN) ? (a.pos as number) : Number.POSITIVE_INFINITY;
      const pb = Number.isFinite(b.pos ?? Number.NaN) ? (b.pos as number) : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });

  const markerOrder = markers.map((m) => genoIndex.get(m.name) as number);
  const alleleRows = geno.rows.map((r) => ({
    sample: r.sample,
    alleles: markerOrder.map((idx) => r.alleles[idx] || "-"),
  }));

  const sampleNames = alleleRows.map((r) => r.sample);
  const parentA = args.parentA && sampleNames.includes(args.parentA) ? args.parentA : sampleNames[0];
  const parentB = args.parentB && sampleNames.includes(args.parentB) ? args.parentB : sampleNames[1];
  if (!parentA || !parentB) throw new Error("GENOTYPE に親（2サンプル）を含めるか、親A/親Bを指定してください。");

  const rowA = alleleRows.find((r) => r.sample === parentA);
  const rowB = alleleRows.find((r) => r.sample === parentB);
  if (!rowA || !rowB) throw new Error("親A/親B が GENOTYPE に見つかりません。");

  const parentASets = rowA.alleles.map(parseAlleleSet);
  const parentBSets = rowB.alleles.map(parseAlleleSet);

  const rows: MatrixRow[] = alleleRows.map((r) => {
    const codes = r.alleles.map((v, i) => classifyAbh(parseAlleleSet(v), parentASets[i], parentBSets[i]));
    return { sample: r.sample, codes };
  });

  return { markers, rows, sampleNames };
};

