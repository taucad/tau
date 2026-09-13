/**
 * Assistant message activity grouping.
 *
 * Groups consecutive message parts into logical "activity chunks" for the chat UI,
 * enabling Cursor-style two-level folding:
 *
 * - **Outer fold (per-run)**: a contiguous run of `reasoning` singletons +
 *   aggregated `research` groups can collapse into a single `ChatActivitySection`.
 *   Runs are scoped — `write`/`data`/`transfer`/`text` groups break the run and
 *   render at the top level so file diffs and the final answer are never tucked
 *   inside an activity fold.
 * - **Inner fold**: the aggregated `research` group (web + file exploration +
 *   CAD verification) shows a one-line combined summary that expands to the
 *   individual tool rows.
 *
 * Streaming bias: while a message is still in-flight, the trailing run stays
 * expanded so progress is visible. Earlier runs auto-collapse once any downstream
 * activity (more tools, file edits, text) follows them.
 *
 * Parts are never reordered — consecutive runs of aggregatable categories merge,
 * while text or reasoning between tools forces a split. Empty/whitespace text
 * parts and `step-start` are transparent (they neither render nor split).
 *
 * File edits and persisted interchange exports (`export_geometry`) render as
 * `write` singletons so rich cards stay top-level. CAD verification (kernel
 * checks, screenshots, tests) is part of the `research` exploration phase —
 * its tool cards still render their full diagnostics inline when the
 * aggregated group is expanded.
 */

import type { MyMessagePart } from '@taucad/chat';
import { fileUnchangedMarker } from '@taucad/chat/constants';

// ── Categories ───────────────────────────────────────────────────────────────

/**
 * Activity categories for message part classification.
 *
 * - `text` / `reasoning` / `data` / `transfer` → rendered as singletons (no aggregation).
 * - `write` → singleton preserving the rich per-call diff card (includes
 *   `export_geometry` deliverables persisted under `.tau/artifacts`).
 * - `research` → aggregatable (web search + file exploration + CAD verification combined).
 * - `skip` → invisible parts (`step-start`, `data-usage`, `data-context-usage`,
 *   empty/whitespace text).
 */
export type ActivityCategory = 'text' | 'reasoning' | 'research' | 'write' | 'transfer' | 'data' | 'skip';

const aggregatableCategories = new Set<ActivityCategory>(['research']);

/**
 * Bridging predicate: a bridging part is appended to a pending aggregated run
 * optimistically. At flush time, any *trailing* bridging parts are peeled off
 * and re-emitted as singletons, so only parts that end up sandwiched between
 * two same-category research parts get absorbed.
 *
 * Result: leading reasoning stays a singleton (no pending group exists yet),
 * trailing reasoning stays a singleton (peeled off at flush), and reasoning
 * sandwiched between two research parts is absorbed inline.
 */
const isBridging = (category: ActivityCategory): boolean => category === 'reasoning';

/**
 * Static category map for non-text part types. `text` is handled separately
 * because empty/whitespace strings classify as `skip`, not `text`.
 */
const partTypeCategoryMap = new Map<string, ActivityCategory>([
  ['reasoning', 'reasoning'],
  ['step-start', 'skip'],
  ['data-usage', 'skip'],
  ['data-context-usage', 'skip'],
  ['data-context-compaction', 'data'],
  ['file', 'text'],
  ['source-url', 'text'],
  ['source-document', 'text'],

  // Research: web + file exploration + CAD verification aggregate into one combined group
  ['tool-web_search', 'research'],
  ['tool-web_browser', 'research'],
  ['tool-read_file', 'research'],
  ['tool-list_directory', 'research'],
  ['tool-grep', 'research'],
  ['tool-glob_search', 'research'],
  ['tool-get_kernel_result', 'research'],
  ['tool-screenshot', 'research'],
  ['tool-test_model', 'research'],

  // Write tools: singletons (preserve rich per-call diff cards)
  ['tool-edit_file', 'write'],
  ['tool-create_file', 'write'],
  ['tool-delete_file', 'write'],
  ['tool-edit_tests', 'write'],
  ['tool-export_geometry', 'write'],

  // Transfer tools
  ['tool-transfer_to_cad_expert', 'transfer'],
  ['tool-transfer_to_research_expert', 'transfer'],
  ['tool-transfer_back_to_supervisor', 'transfer'],
]);

/**
 * Maps a message part to its activity category.
 */
export const classifyActivityPart = (part: MyMessagePart): ActivityCategory => {
  if (part.type === 'text') {
    return part.text.trim() === '' ? 'skip' : 'text';
  }
  return partTypeCategoryMap.get(part.type) ?? 'data';
};

// ── Group types ──────────────────────────────────────────────────────────────

export type SingletonGroup = {
  readonly kind: 'singleton';
  readonly part: MyMessagePart;
  readonly partIndex: number;
  readonly category: ActivityCategory;
};

export type AggregatedGroup = {
  readonly kind: 'aggregated';
  readonly category: ActivityCategory;
  readonly parts: readonly MyMessagePart[];
  readonly partIndices: readonly number[];
  /**
   * Combined summary string `${summaryVerbPast} ${summaryDetail}`. Kept for callers
   * (e.g. `ChatActivitySection` title) that want a single label.
   */
  readonly summary: string;
  /** Verb fragment, e.g. `"Explored"`. Rendered with emphasis in the header. */
  readonly summaryVerbPast: string;
  /**
   * Present-participle counterpart of {@link summaryVerbPast}, e.g. `"Exploring"`.
   * Rendered when the group's header is in the open/expanded state to signal
   * that the activity is being actively inspected.
   */
  readonly summaryVerbActive: string;
  /** Detail fragment, e.g. `"2 web searches, 1 file"`. Rendered de-emphasized. */
  readonly summaryDetail: string;
};

export type ActivityGroup = SingletonGroup | AggregatedGroup;

// ── Summary generation ───────────────────────────────────────────────────────

const pluralize = (count: number, singular: string, plural?: string): string =>
  `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;

type SummaryParts = { verb: string; verbActive: string; detail: string };

/**
 * Composite multi-angle screenshot expansion factor: a single output image
 * with `view: 'composite'` is rendered by the screenshot tool card as a
 * 6-angle capture, so it counts as 6 screenshots in the activity summary to keep
 * the summary in sync with the visible card label.
 */
const compositeImageCount = 6;

/**
 * Image count contributed by a single screenshot tool part. While the call is
 * still streaming we contribute `1` as a placeholder so the summary doesn't
 * stale-display "0 screenshots" mid-flight; once the output is available we count
 * actual screenshot outputs with composite expansion.
 */
const countScreenshotImages = (part: MyMessagePart): number => {
  if (part.type !== 'tool-screenshot') {
    return 0;
  }
  if (part.state !== 'output-available') {
    return 1;
  }
  const { images } = part.output;
  if (images.length === 1 && images[0]?.view === 'composite') {
    return compositeImageCount;
  }
  return images.length;
};

/**
 * Test case count contributed by a single test_model tool part. Pre-output
 * states contribute `0` (the test count is unknown until the runner finishes,
 * and a "1 test" placeholder would be misleading); the segment is omitted
 * from the summary until the count is known.
 */
const countTestCases = (part: MyMessagePart): number => {
  if (part.type !== 'tool-test_model') {
    return 0;
  }
  if (part.state !== 'output-available') {
    return 0;
  }
  return part.output.passes.length + part.output.failures.length;
};

/**
 * Combined summary for the unified `research` category.
 *
 * Mirrors Cursor's mixed-group behavior: web search and code search collapse
 * into a single `searches` count (they are conceptually the same operation
 * from the consumer's perspective). Web URL visits become `fetches`. File
 * reads + directory listings become `files`. CAD verification adds
 * `renders` (kernel checks), `screenshots` (viewer captures, with composite multi-angle =
 * 6), and `tests` (passes + failures across test_model calls).
 *
 * Segments are emitted in the stable order
 * `files → searches → fetches → renders → screenshots → tests`.
 */
const isCachedReadFilePart = (part: MyMessagePart): boolean => {
  if (part.type !== 'tool-read_file') {
    return false;
  }
  if (part.state !== 'output-available') {
    return false;
  }
  const { content } = part.output;
  return typeof content === 'string' && fileUnchangedMarker.matches(content);
};

const generateResearchSummary = (parts: readonly MyMessagePart[]): SummaryParts => {
  let files = 0;
  let cachedReads = 0;
  let searches = 0;
  let fetches = 0;
  let renders = 0;
  let images = 0;
  let tests = 0;

  for (const part of parts) {
    switch (part.type) {
      case 'tool-read_file': {
        files++;
        if (isCachedReadFilePart(part)) {
          cachedReads++;
        }
        break;
      }
      case 'tool-list_directory': {
        files++;
        break;
      }
      case 'tool-web_search':
      case 'tool-grep':
      case 'tool-glob_search': {
        searches++;
        break;
      }
      case 'tool-web_browser': {
        fetches++;
        break;
      }
      case 'tool-get_kernel_result': {
        renders++;
        break;
      }
      case 'tool-screenshot': {
        images += countScreenshotImages(part);
        break;
      }
      case 'tool-test_model': {
        tests += countTestCases(part);
        break;
      }
    }
  }

  const segments: string[] = [];
  if (files > 0) {
    const filesSegment = pluralize(files, 'file');
    segments.push(cachedReads > 0 ? `${filesSegment} (${cachedReads} cached)` : filesSegment);
  }
  if (searches > 0) {
    segments.push(pluralize(searches, 'search', 'searches'));
  }
  if (fetches > 0) {
    segments.push(pluralize(fetches, 'fetch', 'fetches'));
  }
  if (renders > 0) {
    segments.push(pluralize(renders, 'render'));
  }
  if (images > 0) {
    segments.push(pluralize(images, 'screenshot'));
  }
  if (tests > 0) {
    segments.push(pluralize(tests, 'test'));
  }

  return { verb: 'Explored', verbActive: 'Exploring', detail: segments.join(', ') };
};

const generateSummary = (category: ActivityCategory, parts: readonly MyMessagePart[]): SummaryParts => {
  switch (category) {
    case 'research': {
      return generateResearchSummary(parts);
    }
    default: {
      return { verb: '', verbActive: '', detail: `${parts.length} operations` };
    }
  }
};

const composeSummary = ({ verb, detail }: SummaryParts): string => (verb === '' ? detail : `${verb} ${detail}`);

// ── Section partitioning ─────────────────────────────────────────────────────

/**
 * Categories eligible for the outer `ChatActivitySection` fold. These are the
 * "background activity" categories: thinking and exploration. Concrete results
 * (write/cad/data/transfer) and the final answer (text) must always render at
 * the top level, never tucked inside a section.
 */
const sectionFoldableCategories = new Set<ActivityCategory>(['reasoning', 'research']);

/**
 * Whether `group` is allowed to live inside a `ChatActivitySection`.
 */
export const isSectionFoldable = (group: ActivityGroup): boolean => sectionFoldableCategories.has(group.category);

/**
 * A contiguous run of section-foldable groups. Carries `startIndex` so callers
 * can recover each inner group's absolute position in the original `groups`
 * array (used for `isLastGroup` semantics in the renderer).
 */
export type FoldableRun = {
  readonly kind: 'foldable-run';
  readonly groups: readonly ActivityGroup[];
  readonly startIndex: number;
};

/**
 * A single non-foldable group rendered at the top level. `groupIndex` is its
 * absolute position in the original `groups` array.
 */
export type StandaloneRun = {
  readonly kind: 'standalone';
  readonly group: ActivityGroup;
  readonly groupIndex: number;
};

export type ActivityRun = FoldableRun | StandaloneRun;

/**
 * Partitions `groups` into an ordered list of runs. Consecutive section-foldable
 * groups (reasoning singletons + aggregated research) coalesce into one
 * `FoldableRun`; every other group becomes its own `StandaloneRun`.
 *
 * The renderer then wraps foldable runs that contain at least one aggregated
 * research group in `ChatActivitySection`, while standalone runs always render
 * their group as-is. This guarantees file mutations, CAD operations, data,
 * transfers, and text never end up inside the outer fold.
 *
 * Wrap invariant: the renderer wraps any foldable run containing at least one
 * aggregated group in a `ChatActivitySection` (see {@link shouldWrapRun}).
 * Once wrapped, the section persists for the lifetime of the run. Do not gate
 * the wrapper on `groups.length` — group counts oscillate per part because
 * trailing reasoning is peeled at flush time (see {@link groupAssistantParts}),
 * which would cause the section to mount and unmount on every part arrival
 * and reset its open/close state.
 */
export const partitionActivityRuns = (groups: readonly ActivityGroup[]): ActivityRun[] => {
  const runs: ActivityRun[] = [];
  let pending: ActivityGroup[] = [];
  let pendingStart = 0;

  const flushPending = (): void => {
    if (pending.length === 0) {
      return;
    }
    runs.push({ kind: 'foldable-run', groups: pending, startIndex: pendingStart });
    pending = [];
  };

  for (const [i, group] of groups.entries()) {
    if (isSectionFoldable(group)) {
      if (pending.length === 0) {
        pendingStart = i;
      }
      pending.push(group);
      continue;
    }

    flushPending();
    runs.push({ kind: 'standalone', group, groupIndex: i });
  }

  flushPending();

  return runs;
};

/**
 * Returns whether a foldable run should render inside an outer
 * `ChatActivitySection` ("Exploring…") wrapper.
 *
 * The decision intentionally depends only on the **presence** of at least one
 * aggregated group — not on the total group count — so the wrapper's
 * visibility is monotonic across streaming part arrivals: once a research
 * aggregate exists in a run, the wrapper is mounted and stays mounted until a
 * non-foldable part (text, write, data, transfer) breaks the run and the
 * partitioner emits a different `FoldableRun`.
 *
 * Reasoning-only runs (no aggregate) intentionally stay un-wrapped so a
 * sequence of consecutive thinking blocks does not gain redundant chrome.
 */
export const shouldWrapRun = (run: FoldableRun): boolean => run.groups.some((group) => group.kind === 'aggregated');

/**
 * Returns the index of the last "meaningful" part in `parts` (highest index
 * where `classifyActivityPart` is not `'skip'`). Returns `-1` for empty input
 * or when every part is skipped.
 *
 * Used to drive per-part auto-collapse: a part at index `i` is considered the
 * trailing live part when `i === findLastMeaningfulPartIndex(parts)`. Reasoning
 * uses this so it auto-collapses as soon as any non-skip part follows it
 * (tool call, text, another reasoning, etc.) — not just text.
 */
export const findLastMeaningfulPartIndex = (parts: readonly MyMessagePart[]): number => {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (classifyActivityPart(parts[i]!) !== 'skip') {
      return i;
    }
  }
  return -1;
};

// ── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Groups an assistant message's parts into an ordered list of singletons and
 * aggregated tool groups for two-level folding in the chat UI.
 *
 * Consecutive parts in the aggregatable `research` category merge into one
 * `AggregatedGroup`. Non-aggregatable parts (text, write, cad, data,
 * transfer) pass through as `SingletonGroup`. Skipped parts (`step-start`,
 * `data-usage`, empty text) are transparent — they don't interrupt adjacent
 * groups and are omitted from output.
 *
 * Bridging: while a research run is pending, reasoning parts are appended to
 * it optimistically (see {@link isBridging}). When the run finalizes, any
 * trailing bridging parts are peeled off and re-emitted as singletons, so
 * only sandwiched reasoning ends up inside an aggregated group; leading and
 * trailing reasoning remain separate singletons.
 */
export const groupAssistantParts = (parts: readonly MyMessagePart[]): ActivityGroup[] => {
  const groups: ActivityGroup[] = [];

  let pendingCategory: ActivityCategory | undefined;
  let pendingParts: MyMessagePart[] = [];
  let pendingIndices: number[] = [];

  const flushPending = (): void => {
    if (pendingCategory === undefined || pendingParts.length === 0) {
      pendingCategory = undefined;
      pendingParts = [];
      pendingIndices = [];
      return;
    }

    const tail: Array<{ part: MyMessagePart; index: number }> = [];
    while (pendingParts.length > 0 && isBridging(classifyActivityPart(pendingParts.at(-1)!))) {
      const part = pendingParts.pop()!;
      const index = pendingIndices.pop()!;
      tail.unshift({ part, index });
    }

    if (pendingParts.length > 0) {
      const summaryParts = generateSummary(pendingCategory, pendingParts);
      groups.push({
        kind: 'aggregated',
        category: pendingCategory,
        parts: pendingParts,
        partIndices: pendingIndices,
        summary: composeSummary(summaryParts),
        summaryVerbPast: summaryParts.verb,
        summaryVerbActive: summaryParts.verbActive,
        summaryDetail: summaryParts.detail,
      });
    } else {
      // All pending parts were bridging — re-emit them as singletons in order.
      // (Cannot happen given current callers, but keeps the helper total.)
    }

    for (const { part, index } of tail) {
      groups.push({
        kind: 'singleton',
        part,
        partIndex: index,
        category: classifyActivityPart(part),
      });
    }

    pendingCategory = undefined;
    pendingParts = [];
    pendingIndices = [];
  };

  for (const [i, part] of parts.entries()) {
    const category = classifyActivityPart(part);

    if (category === 'skip') {
      continue;
    }

    if (isBridging(category)) {
      if (pendingCategory === undefined) {
        groups.push({ kind: 'singleton', part, partIndex: i, category });
      } else {
        pendingParts.push(part);
        pendingIndices.push(i);
      }
      continue;
    }

    if (aggregatableCategories.has(category)) {
      if (pendingCategory === category) {
        pendingParts.push(part);
        pendingIndices.push(i);
      } else {
        flushPending();
        pendingCategory = category;
        pendingParts = [part];
        pendingIndices = [i];
      }
    } else {
      flushPending();
      groups.push({
        kind: 'singleton',
        part,
        partIndex: i,
        category,
      });
    }
  }

  flushPending();

  return groups;
};
