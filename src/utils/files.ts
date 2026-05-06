export const makeId = (): string => {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const timestampForFile = (): string => new Date().toISOString().replace(/[:.]/g, "-");

export const safeFileBase = (baseName: string): string => {
  const name = baseName.trim() || "export";
  const safe = name.replace(/[^\w\-]+/g, "_");
  return safe.replace(/^_+|_+$/g, "") || "export";
};

export const downloadTextFile = (text: string, fileName: string, mime: string): void => {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.download = fileName;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsText(file);
  });

export const basenameFromFilename = (name: string): string => name.replace(/\.[^.]+$/, "").trim() || "graphical_genotype";

