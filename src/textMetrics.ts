export const FIGURE_FONT = 'Arial, "Yu Gothic", "Meiryo", "Segoe UI", sans-serif';

export type MeasureTextW = (text: string, fontSize: number, fontWeight?: number) => number;

export const approxTextW: MeasureTextW = (text: string, fontSize: number): number => Math.max(0, Math.round(String(text ?? "").length * fontSize * 0.62));

export const createCanvasTextMeasurer = (fontFamily: string): MeasureTextW => {
  const MAX_CACHE_SIZE = 4000;
  const cache = new Map<string, number>();
  let ctx: CanvasRenderingContext2D | null = null;

  const getCtx = (): CanvasRenderingContext2D | null => {
    if (ctx) return ctx;
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    return ctx;
  };

  return (text: string, fontSize: number, fontWeight = 400): number => {
    const raw = String(text ?? "");
    if (!raw) return 0;
    const fs = Number.isFinite(fontSize) ? Math.max(1, Math.round(fontSize)) : 12;
    const fw = Number.isFinite(fontWeight) ? Math.max(100, Math.min(900, Math.round(fontWeight / 100) * 100)) : 400;
    const key = `${fw}|${fs}|${raw}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const c = getCtx();
    let w = 0;
    if (!c) {
      w = approxTextW(raw, fs, fw);
    } else {
      c.font = `${fw} ${fs}px ${fontFamily}`;
      w = c.measureText(raw).width;
    }
    const out = Math.max(0, Math.round(w));
    if (cache.size >= MAX_CACHE_SIZE) {
      // Evict oldest half of the entries to keep memory bounded
      const keys = Array.from(cache.keys());
      const evictCount = Math.floor(MAX_CACHE_SIZE / 2);
      for (let i = 0; i < evictCount; i += 1) cache.delete(keys[i]);
    }
    cache.set(key, out);
    return out;
  };
};
