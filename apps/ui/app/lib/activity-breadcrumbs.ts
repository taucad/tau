/**
 * Activity breadcrumbs for the error tracker (browser observability SB1, principle 6): what the page
 * was doing, as fixed names, never project, file, chat or parameter text.
 *
 * Features name their work through `recordMemoryBreadcrumb` (`#lib/memory-kill-signal`), which
 * forwards here; the lazily loaded SDK installs the sink once it starts (`#lib/sentry.lib`), so no
 * feature calls the SDK. Until then the newest {@link activityBreadcrumbLimit} names wait for it.
 */

/** Names kept while the SDK is not running, at most (principle 3). */
export const activityBreadcrumbLimit = 20;

/** A structural name: lowercase words joined by `.`, `_` or `-`, never free text. */
const structuralName = /^[a-z][\d_a-z]*(?:[.-][\d_a-z]+){0,3}$/u;

/** Longest name accepted. */
const nameLengthLimit = 64;

/** Where a name goes once the SDK runs. */
type ActivitySink = (message: string) => void;

let sink: ActivitySink | undefined;
let pending: string[] = [];

/**
 * Whether a name carries structure only (principle 6).
 *
 * @param name - The proposed breadcrumb message.
 * @returns `true` for a short, lowercase, dotted name.
 */
export const isStructuralActivityName = (name: string): boolean =>
  name.length <= nameLengthLimit && structuralName.test(name);

/**
 * Record one activity breadcrumb (category `tau.activity`). A name that is not structural is
 * dropped, so content can never reach the trail.
 *
 * @param name - A fixed name such as `render` or `render.end`.
 */
export const recordActivityBreadcrumb = (name: string): void => {
  if (!isStructuralActivityName(name)) {
    return;
  }
  if (sink !== undefined) {
    sink(name);
    return;
  }
  pending = [...pending.slice(-(activityBreadcrumbLimit - 1)), name];
};

/**
 * Install (or remove) the SDK's sink; names recorded before it start are handed over first, in order.
 *
 * @param next - The sink, or `undefined` once the SDK stops.
 */
export const setActivityBreadcrumbSink = (next: ActivitySink | undefined): void => {
  sink = next;
  if (next !== undefined) {
    for (const name of pending.splice(0)) {
      next(name);
    }
  }
};
