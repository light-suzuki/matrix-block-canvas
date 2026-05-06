/**
 * Matrix Block Canvas - Constants
 * 
 * Default values and example data extracted from App.tsx.
 */

import type { MarkerInfo } from "./ggtTemplates";

export const DEFAULT_TAB = "builder" as const;
export const DEFAULT_TEMPLATE_ID = "ggt_classic_light";

export const EXAMPLE_TSV =
    "sample\\tc01\\tc02\\tc03\\ngroup\\t1\\t1\\t2\\npos\\t1\\t2\\t3\\nrow_01\\tA\\tA\\tB\\nrow_02\\tB\\tB\\tB\\nrow_03\\tA\\tH\\tB\\nrow_04\\tB\\tA\\t-\\n";

export const EXAMPLE_FJ_MAP = "# fjFile = MAP\\nC01\\t1\\t1\\nC02\\t1\\t2\\nC03\\t2\\t1\\n";

export const EXAMPLE_FJ_GENO =
    "# fjFile = GENOTYPE\\n\\tC01\\tC02\\tC03\\nrow_01\\tA\\tG\\tG\\nrow_02\\tT\\tA\\tC\\nrow_03\\tA\\t-\\tG/T\\nrow_04\\tT\\tG\\tT\\n";

export const DEFAULT_FA_ZOOM_META: MarkerInfo[] = [
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

export const DEFAULT_FA_ZOOM_MAP_TSV =
    "column\\tgroup\\tpos\\n" +
    DEFAULT_FA_ZOOM_META.map((m) => `${m.name}\\t${m.chr ?? ""}\\t${Number.isFinite(m.pos ?? Number.NaN) ? m.pos : ""}`).join("\\n") +
    "\\n";
