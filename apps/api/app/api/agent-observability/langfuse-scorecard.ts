import type { RunScore, Scorecard } from '@taucad/agent-observability/scorecard';
import { phaseDurations, summarizeRuns } from '@taucad/agent-observability/scorecard';
import { observationMapperVersion } from '#api/agent-observability/langfuse-observation.js';

/**
 * T15: the scorecard read back from Langfuse, which keeps the full 180-day
 * history the API's outbox does not (a delivered payload is cleared). It reads
 * only the closed metadata {@link observationMapperVersion} writes: never an
 * input or output, so a content observation is counted and skipped exactly as
 * the evidence scorecard skips the content plane.
 */

/** One observation as Langfuse's v2 observations API returns it with the `core`, `basic` and `metadata` fields. */
export type LangfuseObservationRow = Readonly<{
  id: string;
  startTime: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

/** How the observations read were counted. @public */
export type ObservationReconciliation = Readonly<{
  /** Every row read. */
  read: number;
  /** A row naming a source already counted: the same fact under another projector version. */
  duplicates: number;
  /** A row naming a semantic fact already counted from another source. */
  replicas: number;
  /** Content observations, counted and never read. */
  content: number;
  /** Rows another mapper version wrote, without the attempt, identity and intervals a score needs. */
  unscorable: number;
}>;

/** The Langfuse scorecard: as the evidence scorecard, with run and chat as Langfuse's keyed groups. @public */
export type ObservationScorecard = Omit<Scorecard, 'reconciliation'> &
  Readonly<{ reconciliation: ObservationReconciliation }>;

type Interval = Parameters<typeof phaseDurations>[0][number];

type RunDraft = {
  run: string;
  chat: string;
  protection: RunScore['protection'];
  release: string;
  termination: RunScore['termination'];
  success: RunScore['success'];
  byClass: Record<string, number>;
  byOutcome: Record<string, number>;
  tools: number;
  firstUse: Array<Readonly<{ at: number; toolClass: string }>>;
  checks: Record<string, number>;
  intervals: Interval[];
  presented: boolean;
  rating: RunScore['rating'];
  judgement: RunScore['judgement'];
};

const protectionRank: Readonly<Record<RunScore['protection'], number>> = { free: 0, unknown: 1, pro: 2 };

const text = (metadata: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
};

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const protectionOf = (value: string | undefined): RunScore['protection'] =>
  value === 'free' || value === 'pro' ? value : 'unknown';

/* Langfuse stores the mapper's JSON string as the array it encodes; malformed intervals are no timing, never a guess. */
const parsedIntervals = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const intervalsOf = (value: unknown): Interval[] => {
  const parsed = parsedIntervals(value);
  return Array.isArray(parsed)
    ? parsed.flatMap((entry: unknown) => {
        if (!Array.isArray(entry)) {
          return [];
        }
        const [phase, domain, start, end] = entry as unknown[];
        return typeof phase === 'string' &&
          typeof domain === 'string' &&
          typeof start === 'number' &&
          (typeof end === 'number' || end === null)
          ? [{ phase: phase as Interval['phase'], domain, start, end }]
          : [];
      })
    : [];
};

/* The run a host fact belongs to: its response and rating name it; every other fact carries it as its attempt. */
const runOf = (metadata: Readonly<Record<string, unknown>>): string | undefined => {
  const family = text(metadata, 'family');
  return family === 'response' || family === 'rating' ? text(metadata, 'fact.evidence') : text(metadata, 'attempt');
};

const draftOf = (drafts: Map<string, RunDraft>, metadata: Readonly<Record<string, unknown>>, run: string): RunDraft => {
  let draft = drafts.get(run);
  if (draft === undefined) {
    draft = {
      run,
      chat: text(metadata, 'run') ?? 'unknown',
      protection: 'free',
      release: text(metadata, 'attributes.langfuse.release') ?? 'unknown',
      termination: 'unreported',
      success: 'unknown',
      byClass: {},
      byOutcome: {},
      tools: 0,
      firstUse: [],
      checks: {},
      intervals: [],
      presented: false,
      rating: 'none',
      judgement: 'none',
    };
    drafts.set(run, draft);
  }
  const protection = protectionOf(text(metadata, 'protection'));
  if (protectionRank[protection] > protectionRank[draft.protection]) {
    draft.protection = protection;
  }
  return draft;
};

const applyFeedback = (draft: RunDraft, metadata: Readonly<Record<string, unknown>>): void => {
  const value = text(metadata, 'fact.value');
  const action = text(metadata, 'fact.action');
  if (
    text(metadata, 'family') === 'rating' &&
    draft.rating === 'none' &&
    (value === 'positive' || value === 'negative')
  ) {
    draft.rating = value;
  } else if (draft.judgement === 'none' && (action === 'accepted' || action === 'rejected' || action === 'corrected')) {
    draft.judgement = action;
  }
};

const applySummary = (draft: RunDraft, row: LangfuseObservationRow, metadata: Readonly<Record<string, unknown>>) => {
  draft.intervals.push(...intervalsOf(metadata['intervals']));
  switch (text(metadata, 'family')) {
    case 'tool': {
      const toolClass = text(metadata, 'fact.toolClass') ?? 'unknown';
      draft.tools++;
      increment(draft.byClass, toolClass);
      increment(draft.byOutcome, text(metadata, 'fact.outcome') ?? 'unknown');
      draft.firstUse.push({ at: Date.parse(row.startTime), toolClass });
      break;
    }
    case 'cad': {
      increment(draft.checks, text(metadata, 'fact.result') ?? 'unknown');
      break;
    }
    case 'outcome': {
      draft.termination = (text(metadata, 'fact.termination') ?? 'unknown') as RunScore['termination'];
      draft.success = (text(metadata, 'fact.success') ?? 'unknown') as RunScore['success'];
      break;
    }
    case 'response': {
      draft.presented ||= text(metadata, 'fact.action') === 'presented';
      break;
    }
    default: {
      break;
    }
  }
};

const scoreOf = (draft: RunDraft): RunScore => {
  const pattern = [...new Set([...draft.firstUse].sort((a, b) => a.at - b.at).map((use) => use.toolClass))].join('>');
  const { durations, open } = phaseDurations(draft.intervals);
  return {
    run: draft.run,
    chat: draft.chat,
    protection: draft.protection,
    release: draft.release,
    termination: draft.termination,
    success: draft.success,
    tools: { total: draft.tools, byClass: draft.byClass, byOutcome: draft.byOutcome },
    pattern: pattern === '' ? 'none' : pattern,
    checks: draft.checks,
    phases: durations,
    openIntervals: open,
    presented: draft.presented,
    rating: draft.rating,
    judgement: draft.judgement,
  };
};

/**
 * Score Tau's Langfuse observations: count each fact once, score each run once and aggregate as the evidence
 * scorecard does.
 *
 * @param rows - Observations read from one environment, in any order.
 * @returns The scorecard; a run is named by its keyed group, never Tau's id.
 * @public
 */
export const scoreObservations = (rows: readonly LangfuseObservationRow[]): ObservationScorecard => {
  const sources = new Set<string>();
  const semantics = new Set<string>();
  const drafts = new Map<string, RunDraft>();
  let duplicates = 0;
  let replicas = 0;
  let content = 0;
  let unscorable = 0;
  /* Langfuse pages newest first; the earliest of two claims stands, as in the order the host reported them. */
  const ordered = [...rows].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  for (const row of ordered) {
    const metadata = row.metadata ?? {};
    const source = text(metadata, 'source');
    const semantic = text(metadata, 'semantic');
    if (text(metadata, 'plane') === 'content') {
      content++;
    } else if (
      text(metadata, 'mapper') !== observationMapperVersion ||
      source === undefined ||
      semantic === undefined
    ) {
      unscorable++;
    } else if (sources.has(source)) {
      duplicates++;
    } else if (semantics.has(semantic)) {
      sources.add(source);
      replicas++;
    } else {
      sources.add(source);
      semantics.add(semantic);
      const run = text(metadata, 'authority') === 'host-reported' ? runOf(metadata) : undefined;
      if (run !== undefined) {
        const draft = draftOf(drafts, metadata, run);
        if (text(metadata, 'plane') === 'feedback') {
          applyFeedback(draft, metadata);
        } else {
          applySummary(draft, row, metadata);
        }
      }
    }
  }
  const runs = [...drafts.values()].map((draft) => scoreOf(draft));
  return {
    reconciliation: { read: rows.length, duplicates, replicas, content, unscorable },
    ...summarizeRuns(runs),
    runs,
  };
};
