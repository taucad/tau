/**
 * Continuous story progress from chapter positions: chapter n is current once its top passes
 * the reading anchor, and progress interpolates toward the next chapter's top.
 * @internal
 * @param tops - Viewport tops of each chapter, in order.
 * @param anchor - Reading line in viewport pixels.
 * @returns Progress in [0, tops.length - 0.001].
 * @type {(tops: number[], anchor: number) => number}
 */
export const progressFromTops = (tops, anchor) => {
  const last = tops.length - 1;
  let index = 0;
  for (const [i, top] of tops.entries()) {
    if (i > 0 && top <= anchor) {
      index = i;
    }
  }
  const current = tops[index] ?? 0;
  const next = tops[index + 1];
  if (next === undefined) {
    // The last chapter plays out over the distance the reading line travels through it.
    return Math.min(last + 0.999, last + Math.max(0, (anchor - current) / Math.max(1, innerHeight * 0.6)));
  }
  if (next === current) return index;
  return Math.min(last + 0.999, Math.max(0, index + (anchor - current) / (next - current)));
};

/** @type {(chapters: Element[]) => number} */
export const readStoryProgress = (chapters) =>
  progressFromTops(
    chapters.map((chapter) => chapter.getBoundingClientRect().top),
    innerHeight * (innerWidth <= 760 ? 0.72 : 0.5),
  );
