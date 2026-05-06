import type { MarkerInfo, MatrixRow } from "./ggtTemplates";

export type ChrSpan = { chr: string; start: number; end: number };

export const computeChrSpans = (markers: MarkerInfo[]): ChrSpan[] => {
  const out: ChrSpan[] = [];
  if (!markers.length) return out;

  const hasChr = markers.some((m) => Boolean((m.chr || "").trim()));
  if (!hasChr) return [{ chr: "All", start: 0, end: markers.length }];

  let start = 0;
  let cur = (markers[0]?.chr || "").trim() || "Chr?";
  for (let i = 1; i <= markers.length; i += 1) {
    const next = i < markers.length ? (markers[i]?.chr || "").trim() || "Chr?" : "__END__";
    if (next !== cur) {
      out.push({ chr: cur, start, end: i });
      start = i;
      cur = next;
    }
  }
  return out;
};

export type Region = { start: number; end: number };

const clampInt = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor(n)));

export const resolveRegionByIndex = (args: { total: number; start1: number; end1: number }): Region | null => {
  const { total } = args;
  if (!Number.isFinite(total) || total <= 0) return null;
  const start = clampInt(args.start1 - 1, 0, total - 1);
  const end = clampInt(args.end1, start + 1, total);
  return { start, end };
};

export const uniqueChromosomes = (markers: MarkerInfo[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of markers) {
    const chr = (m.chr || "").trim();
    if (!chr) continue;
    if (seen.has(chr)) continue;
    seen.add(chr);
    out.push(chr);
  }
  return out;
};

export const resolveRegionByChrPos = (
  markers: MarkerInfo[],
  args: { chr: string; startPos?: number; endPos?: number },
): Region | null => {
  const chr = (args.chr || "").trim();
  if (!chr) return null;

  const indices: number[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    if ((markers[i]?.chr || "").trim() === chr) indices.push(i);
  }
  if (!indices.length) return null;

  const startPos = Number.isFinite(args.startPos ?? Number.NaN) ? (args.startPos as number) : Number.NEGATIVE_INFINITY;
  const endPos = Number.isFinite(args.endPos ?? Number.NaN) ? (args.endPos as number) : Number.POSITIVE_INFINITY;
  const lo = Math.min(startPos, endPos);
  const hi = Math.max(startPos, endPos);

  let startIdx: number | null = null;
  let endIdx: number | null = null;

  for (const i of indices) {
    const pos = markers[i]?.pos;
    if (!Number.isFinite(pos ?? Number.NaN)) continue;
    const p = pos as number;
    if (p < lo || p > hi) continue;
    if (startIdx === null || i < startIdx) startIdx = i;
    if (endIdx === null || i > endIdx) endIdx = i;
  }

  // pos が無い場合は chr 全体を選ぶ
  if (startIdx === null || endIdx === null) return { start: indices[0], end: indices[indices.length - 1] + 1 };
  return { start: startIdx, end: endIdx + 1 };
};

export const sliceMatrix = (markers: MarkerInfo[], rows: MatrixRow[], region: Region): { markers: MarkerInfo[]; rows: MatrixRow[] } => {
  const start = clampInt(region.start, 0, Math.max(0, markers.length));
  const end = clampInt(region.end, start, Math.max(0, markers.length));
  const nextMarkers = markers.slice(start, end).map((m) => ({ ...m }));
  const nextRows = rows.map((r) => ({ ...r, codes: r.codes.slice(start, end) }));
  return { markers: nextMarkers, rows: nextRows };
};

type SmoothOpts = { includeH?: boolean };
type ImputeOpts = { includeH?: boolean };

const isA = (c: string): boolean => c === "A";
const isB = (c: string): boolean => c === "B";
const isH = (c: string): boolean => c === "H";
const isMissing = (c: string): boolean => c === "-" || c === "" || c === "N";

export const smoothRowCodes3 = (codes: string[], spans: ChrSpan[], opts?: SmoothOpts): string[] => {
  const src = codes.slice();
  const dst = codes.slice();
  const includeH = Boolean(opts?.includeH);

  for (const span of spans) {
    const start = Math.max(0, span.start);
    const end = Math.min(src.length, span.end);
    if (end - start < 3) continue;
    for (let i = start + 1; i < end - 1; i += 1) {
      const left = src[i - 1] || "-";
      const mid = src[i] || "-";
      const right = src[i + 1] || "-";

      if (isMissing(left) || isMissing(right)) continue;
      if (left !== right) continue;

      if ((isA(left) || isB(left)) && ((isA(mid) || isB(mid)) && mid !== left)) {
        // A-B-A -> A, B-A-B -> B
        dst[i] = left;
        continue;
      }
      if (includeH && (isA(left) || isB(left)) && isH(mid)) {
        // A-H-A -> A, B-H-B -> B
        dst[i] = left;
      }
    }
  }
  return dst;
};

export const imputeMissing3 = (codes: string[], spans: ChrSpan[], opts?: ImputeOpts): string[] => {
  const src = codes.slice();
  const dst = codes.slice();
  const includeH = Boolean(opts?.includeH);

  for (const span of spans) {
    const start = Math.max(0, span.start);
    const end = Math.min(src.length, span.end);
    if (end - start < 3) continue;
    for (let i = start + 1; i < end - 1; i += 1) {
      const left = src[i - 1] || "-";
      const mid = src[i] || "-";
      const right = src[i + 1] || "-";
      if (!isMissing(mid)) continue;
      if (isMissing(left) || isMissing(right)) continue;
      if (left !== right) continue;
      if (isA(left) || isB(left) || (includeH && isH(left))) dst[i] = left;
    }
  }
  return dst;
};

export const applyImputeAndSmooth = (
  markers: MarkerInfo[],
  rows: MatrixRow[],
  opts: { impute?: boolean; imputeH?: boolean; smooth?: boolean; smoothH?: boolean },
): MatrixRow[] => {
  const spans = computeChrSpans(markers);
  const doImpute = Boolean(opts.impute);
  const doSmooth = Boolean(opts.smooth);
  if (!doImpute && !doSmooth) return rows.map((r) => ({ ...r, codes: r.codes.slice() }));

  return rows.map((r) => {
    let codes = r.codes.slice();
    if (doImpute) codes = imputeMissing3(codes, spans, { includeH: Boolean(opts.imputeH) });
    if (doSmooth) codes = smoothRowCodes3(codes, spans, { includeH: Boolean(opts.smoothH) });
    return { ...r, codes };
  });
};

export const sortRowsBySampleId = (rows: MatrixRow[]): MatrixRow[] =>
  rows
    .map((r) => ({ ...r, codes: r.codes.slice() }))
    .sort((a, b) => a.sample.localeCompare(b.sample, "en"));

export const sortRowsByRegionFraction = (
  rows: MatrixRow[],
  region: Region,
  targetCode: "A" | "B",
): MatrixRow[] => {
  const start = Math.max(0, Math.floor(region.start));
  const end = Math.max(start, Math.floor(region.end));
  const len = Math.max(1, end - start);
  const scored = rows.map((r, idx) => {
    const slice = r.codes.slice(start, end);
    const hit = slice.reduce((acc, c) => acc + (c === targetCode ? 1 : 0), 0);
    return { r, idx, score: hit / len, hit };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hit !== a.hit) return b.hit - a.hit;
    const id = a.r.sample.localeCompare(b.r.sample, "en");
    if (id !== 0) return id;
    return a.idx - b.idx;
  });
  return scored.map((v) => ({ ...v.r, codes: v.r.codes.slice() }));
};

export const matrixToTsv = (markers: MarkerInfo[], rows: MatrixRow[], opts?: { includeMeta?: boolean }): string => {
  const header = ["sample", ...markers.map((m) => m.name || "")].join("\t");
  const lines: string[] = [header];

  if (opts?.includeMeta) {
    const hasChr = markers.some((m) => (m.chr || "").trim().length > 0);
    const hasPos = markers.some((m) => Number.isFinite(m.pos ?? Number.NaN));
    if (hasChr) lines.push(["chr", ...markers.map((m) => (m.chr || "").trim())].join("\t"));
    if (hasPos) lines.push(["pos", ...markers.map((m) => (Number.isFinite(m.pos ?? Number.NaN) ? String(m.pos) : ""))].join("\t"));
  }

  for (const r of rows) lines.push([r.sample, ...r.codes].join("\t"));
  return lines.join("\n") + "\n";
};

// ============ NEW LOGIC FUNCTIONS ============

/** Calculate Hamming distance between two code arrays (ignoring missing data) */
export const hammingDistance = (a: string[], b: string[]): number => {
  if (a.length !== b.length) return Infinity;
  let diff = 0;
  let compared = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i] || "-";
    const cb = b[i] || "-";
    if (ca === "-" || cb === "-") continue;
    compared++;
    if (ca !== cb) diff++;
  }
  return compared > 0 ? diff / compared : 1;
};

/** Sort rows by genetic similarity to a reference row */
export const sortRowsBySimilarity = (
  rows: MatrixRow[],
  refSampleId: string,
): MatrixRow[] => {
  const refRow = rows.find((r) => r.sample === refSampleId);
  if (!refRow) return rows.map((r) => ({ ...r, codes: r.codes.slice() }));

  const scored = rows.map((r, idx) => ({
    r,
    idx,
    dist: r.sample === refSampleId ? -1 : hammingDistance(refRow.codes, r.codes),
  }));
  scored.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.r.sample.localeCompare(b.r.sample, "en");
  });
  return scored.map((v) => ({ ...v.r, codes: v.r.codes.slice() }));
};

/** Detect double crossovers (singletons) that may indicate genotyping errors */
export type SingletonInfo = { rIdx: number; cIdx: number; code: string };

export const detectSingletons = (
  rows: MatrixRow[],
  spans: ChrSpan[],
): SingletonInfo[] => {
  const result: SingletonInfo[] = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const codes = rows[rIdx].codes;
    for (const span of spans) {
      const start = Math.max(0, span.start);
      const end = Math.min(codes.length, span.end);
      if (end - start < 3) continue;
      for (let i = start + 1; i < end - 1; i++) {
        const left = codes[i - 1] || "-";
        const mid = codes[i] || "-";
        const right = codes[i + 1] || "-";
        if (mid === "-" || left === "-" || right === "-") continue;
        // Singleton: left == right but mid differs
        if (left === right && mid !== left && (mid === "A" || mid === "B" || mid === "H")) {
          result.push({ rIdx, cIdx: i, code: mid });
        }
      }
    }
  }
  return result;
};

