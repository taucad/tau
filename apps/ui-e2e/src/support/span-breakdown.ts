/**
 * What a budget spec prints when it fails: every `tau.load.*` and `tau.worker.*` measure the page's timeline holds
 * for the measured window, summed by name (tau #2014). The page writes its own load phases and the file-manager
 * worker's forwarded spans under those names, so a failed budget says where its time went instead of only by how much
 * it overran.
 *
 * @module
 */
import { formatMeasureBreakdown, summarizeMeasures } from '@taucad/filesystem';
import type { MeasureBreakdownRow } from '@taucad/filesystem';
import * as target from '#support/external-target.js';

/** A measured window on the page's clock. */
export type SpanWindow = Readonly<{
  /** The page's `performance.now()` when the window opened. */
  startedAt: number;
}>;

/**
 * Open a window on the page's clock; measures that start inside it are the breakdown's.
 *
 * @returns The window.
 */
export const openSpanWindow = async (): Promise<SpanWindow> => ({
  startedAt: await target.evaluate(() => performance.now()),
});

/**
 * Sum the page's Tau measures that started inside `window`, by name.
 *
 * @param window - The window.
 * @returns One row per measure name, the largest total first.
 */
export const readSpanBreakdown = async (window: SpanWindow): Promise<MeasureBreakdownRow[]> => {
  const entries = await target.evaluate(
    (startedAt: number) =>
      performance
        .getEntriesByType('measure')
        .filter(
          (entry) =>
            (entry.name.startsWith('tau.load.') || entry.name.startsWith('tau.worker.')) &&
            entry.startTime >= startedAt,
        )
        .map((entry) => ({ name: entry.name, duration: entry.duration })),
    window.startedAt,
  );
  return summarizeMeasures(entries);
};

/**
 * Run a budget's assertion; when it fails, append the window's span breakdown to its message and fail the same way.
 *
 * @param window - The window the budget measured.
 * @param assertion - The budget's `expect`s.
 */
export const expectWithinBudget = async (window: SpanWindow, assertion: () => void | Promise<void>): Promise<void> => {
  try {
    await assertion();
  } catch (error) {
    let breakdown: string;
    try {
      breakdown = formatMeasureBreakdown(await readSpanBreakdown(window));
    } catch (readError) {
      breakdown = `span breakdown unavailable: ${readError instanceof Error ? readError.message : String(readError)}`;
    }
    if (error instanceof Error) {
      error.message = `${error.message}\n\nSpan breakdown of the measured window:\n${breakdown}`;
    }
    throw error;
  }
};
