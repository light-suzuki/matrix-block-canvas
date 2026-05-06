/**
 * GGT Viewer - Utility Functions
 * 
 * Helper functions extracted from App.tsx.
 */

/**
 * Guess parent names from sample names
 */
export const guessParents = (names: string[]): { a?: string; b?: string } => {
    const lowered = names.map((n) => ({ n, l: n.toLowerCase() }));
    const pick = (needles: string[]): string | undefined =>
        lowered.find((v) => needles.some((k) => v.l === k || v.l.includes(k)))?.n;
    const a = pick(["p1", "parent1", "par1", "a", "aa"]) || names[0];
    const b = pick(["p2", "parent2", "par2", "b", "bb"]) || names[1];
    if (a && b && a !== b) return { a, b };
    return { a: names[0], b: names[1] };
};

/**
 * Check if target element is editable (for keyboard event filtering)
 */
export const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};
