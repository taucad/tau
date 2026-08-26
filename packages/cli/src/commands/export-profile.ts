import { performance } from 'node:perf_hooks';
import type { TelemetryEntry } from '@taucad/runtime/types';

/**
 * One contiguous phase in a CLI export profile.
 *
 * @internal
 */
export type CliProfilePhase = {
  readonly name: string;
  /** Milliseconds since process time origin. */
  readonly startTime: number;
  /** Milliseconds. */
  readonly duration: number;
  /** Milliseconds since process time origin. */
  readonly endTime: number;
};

type ProfileArtifact = {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
};

type ExportProfileOptions = {
  readonly phases: readonly CliProfilePhase[];
  readonly telemetry: readonly TelemetryEntry[];
  readonly runtimeExportPhase: CliProfilePhase;
  readonly workload: {
    readonly inputPath: string;
    readonly outputPath: string;
    readonly format: string;
    readonly artifacts: readonly ProfileArtifact[];
  };
};

type TimeRange = {
  /** Milliseconds since process time origin. */
  readonly start: number;
  /** Milliseconds since process time origin. */
  readonly end: number;
};

type ProfileSpan = {
  readonly key: string;
  readonly parentKey?: string;
  readonly id?: string;
  readonly parentId?: string;
  readonly name: string;
  /** Milliseconds since Unix epoch. */
  readonly workerTimeOrigin: number;
  /** Milliseconds since process time origin. */
  readonly startTime: number;
  /** Milliseconds. */
  readonly duration: number;
  /** Milliseconds excluding direct-child coverage. */
  readonly selfDuration: number;
  /** Milliseconds since process time origin. */
  readonly endTime: number;
  readonly attributes: Record<string, unknown>;
};

type ProfileSummary = {
  readonly name: string;
  readonly count: number;
  /** Milliseconds, inclusive across matching spans. */
  readonly totalDuration: number;
  /** Milliseconds, exclusive across matching spans. */
  readonly selfDuration: number;
};

/**
 * Reconciled process and runtime telemetry written by the export command.
 *
 * @internal
 */
export type CliExportProfile = {
  readonly schema: 'taucad.cli-export-profile.v1';
  readonly generatedAt: string;
  readonly clock: {
    readonly unit: 'milliseconds';
    /** Milliseconds since Unix epoch. */
    readonly processTimeOrigin: number;
    readonly profileEmissionExcluded: true;
  };
  readonly process: {
    readonly node: string;
    readonly platform: NodeJS.Platform;
    readonly architecture: string;
    readonly pid: number;
    readonly nodeTiming: {
      /** Milliseconds. */
      readonly duration: number;
      /** Milliseconds since process time origin. */
      readonly nodeStart: number;
      /** Milliseconds since process time origin. */
      readonly v8Start: number;
      /** Milliseconds since process time origin. */
      readonly environment: number;
      /** Milliseconds since process time origin. */
      readonly bootstrapComplete: number;
      /** Milliseconds since process time origin. */
      readonly loopStart: number;
      /** Milliseconds since process time origin, or -1 before exit. */
      readonly loopExit: number;
      /** Milliseconds. */
      readonly idleTime: number;
    };
  };
  readonly workload: ExportProfileOptions['workload'];
  readonly accounting: {
    /** Milliseconds. */
    readonly profiledDuration: number;
    /** Milliseconds. */
    readonly phaseDurationSum: number;
    /** Milliseconds. */
    readonly unaccounted: number;
    readonly phases: readonly CliProfilePhase[];
  };
  readonly runtime: {
    /** Milliseconds. */
    readonly exportPhaseDuration: number;
    /** Milliseconds covered by root runtime spans. */
    readonly rootSpanCoverage: number;
    /** Milliseconds not covered by root runtime spans within runtime.export. */
    readonly unattributedWithinExport: number;
    /** Milliseconds summed across every span's exclusive duration. */
    readonly spanSelfDurationSum: number;
    /** Milliseconds added to exclusive span totals to reconcile overlap with root-span wall time. */
    readonly spanSelfReconciliation: number;
    readonly rootSpanKeys: readonly string[];
    /** Milliseconds since Unix epoch. */
    readonly workerTimeOrigins: readonly number[];
    readonly spans: readonly ProfileSpan[];
    readonly summary: readonly ProfileSummary[];
  };
};

type CliPhaseLedger = {
  readonly phases: CliProfilePhase[];
  readonly checkpoint: (name: string) => CliProfilePhase;
};

const spanIdOf = (entry: TelemetryEntry): string | undefined => {
  const spanId = entry.detail?.['spanId'];
  return typeof spanId === 'string' ? spanId : undefined;
};

const parentSpanIdOf = (entry: TelemetryEntry): string | undefined => {
  const parentSpanId = entry.detail?.['parentSpanId'];
  return typeof parentSpanId === 'string' ? parentSpanId : undefined;
};

const spanKey = (workerTimeOrigin: number, spanId: string): string => `${workerTimeOrigin}:${spanId}`;

const rangeUnionDuration = (ranges: readonly TimeRange[]): number => {
  if (ranges.length === 0) {
    return 0;
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  let covered = 0;
  let currentStart = sorted[0]!.start;
  let currentEnd = sorted[0]!.end;

  for (const spanRange of sorted.slice(1)) {
    if (spanRange.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, spanRange.end);
      continue;
    }

    covered += currentEnd - currentStart;
    currentStart = spanRange.start;
    currentEnd = spanRange.end;
  }

  return covered + currentEnd - currentStart;
};

const clippedRange = (spanRange: TimeRange, bounds: TimeRange): TimeRange | undefined => {
  const start = Math.max(spanRange.start, bounds.start);
  const end = Math.min(spanRange.end, bounds.end);
  return end > start ? { start, end } : undefined;
};

/**
 * Create a gap-free, process-relative phase ledger.
 *
 * @internal
 * @returns A ledger whose checkpoints form contiguous phases.
 */
export const createPhaseLedger = (): CliPhaseLedger => {
  const phases: CliProfilePhase[] = [];
  let cursor = 0;

  return {
    checkpoint(name: string): CliProfilePhase {
      const endTime = performance.now();
      const phase = {
        name,
        startTime: cursor,
        duration: endTime - cursor,
        endTime,
      };
      phases.push(phase);
      cursor = endTime;
      return phase;
    },
    phases,
  };
};

/**
 * Build a CLI/runtime profile with exclusive span time and explicit residuals.
 *
 * @internal
 * @param options - Completed CLI phases and runtime telemetry entries.
 * @returns A serializable reconciled export profile.
 */
export const buildExportProfile = (options: ExportProfileOptions): CliExportProfile => {
  const processTimeOrigin = performance.timeOrigin;
  const normalized = options.telemetry.map((entry, index) => {
    const spanId = spanIdOf(entry);
    const parentSpanId = parentSpanIdOf(entry);
    const startTime = entry.workerTimeOrigin - processTimeOrigin + entry.startTime;
    const attributes = Object.fromEntries(
      Object.entries(entry.detail ?? {}).filter(
        ([key]) => key !== 'spanId' && key !== 'parentSpanId' && key !== 'devtools',
      ),
    );

    return {
      key: spanId === undefined ? `unidentified:${index}` : spanKey(entry.workerTimeOrigin, spanId),
      parentKey: parentSpanId === undefined ? undefined : spanKey(entry.workerTimeOrigin, parentSpanId),
      id: spanId,
      parentId: parentSpanId,
      name: entry.name,
      workerTimeOrigin: entry.workerTimeOrigin,
      startTime,
      duration: entry.duration,
      endTime: startTime + entry.duration,
      attributes,
    };
  });
  const spansByKey = new Map(normalized.map((span) => [span.key, span]));
  const childRanges = new Map<string, TimeRange[]>();

  for (const span of normalized) {
    if (span.parentKey === undefined || !spansByKey.has(span.parentKey)) {
      continue;
    }
    const ranges = childRanges.get(span.parentKey) ?? [];
    ranges.push({ start: span.startTime, end: span.endTime });
    childRanges.set(span.parentKey, ranges);
  }

  const spans: ProfileSpan[] = normalized
    .map((span) => {
      const bounds = { start: span.startTime, end: span.endTime };
      const children = (childRanges.get(span.key) ?? [])
        .map((spanRange) => clippedRange(spanRange, bounds))
        .filter((spanRange): spanRange is TimeRange => spanRange !== undefined);
      const childCoverage = rangeUnionDuration(children);

      return {
        key: span.key,
        parentKey: span.parentKey,
        id: span.id,
        parentId: span.parentId,
        name: span.name,
        workerTimeOrigin: span.workerTimeOrigin,
        startTime: span.startTime,
        duration: span.duration,
        selfDuration: Math.max(0, span.duration - childCoverage),
        endTime: span.endTime,
        attributes: span.attributes,
      };
    })
    .sort((left, right) => left.startTime - right.startTime || right.duration - left.duration);

  const roots = normalized.filter((span) => span.parentKey === undefined || !spansByKey.has(span.parentKey));
  const runtimeBounds = {
    start: options.runtimeExportPhase.startTime,
    end: options.runtimeExportPhase.endTime,
  };
  const rootRanges = roots
    .map((span) => clippedRange({ start: span.startTime, end: span.endTime }, runtimeBounds))
    .filter((spanRange): spanRange is TimeRange => spanRange !== undefined);
  const rootSpanCoverage = rangeUnionDuration(rootRanges);
  const summaryByName = new Map<string, Omit<ProfileSummary, 'name'>>();

  for (const span of spans) {
    const current = summaryByName.get(span.name) ?? { count: 0, totalDuration: 0, selfDuration: 0 };
    summaryByName.set(span.name, {
      count: current.count + 1,
      totalDuration: current.totalDuration + span.duration,
      selfDuration: current.selfDuration + span.selfDuration,
    });
  }

  const profiledDuration = options.phases.at(-1)?.endTime ?? 0;
  const phaseDurationSum = options.phases.reduce((total, phase) => total + phase.duration, 0);
  const spanSelfDurationSum = spans.reduce((total, span) => total + span.selfDuration, 0);
  const { nodeTiming } = performance;

  return {
    schema: 'taucad.cli-export-profile.v1',
    generatedAt: new Date().toISOString(),
    clock: {
      unit: 'milliseconds',
      processTimeOrigin,
      profileEmissionExcluded: true,
    },
    process: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      pid: process.pid,
      nodeTiming: {
        duration: nodeTiming.duration,
        nodeStart: nodeTiming.nodeStart,
        v8Start: nodeTiming.v8Start,
        environment: nodeTiming.environment,
        bootstrapComplete: nodeTiming.bootstrapComplete,
        loopStart: nodeTiming.loopStart,
        loopExit: nodeTiming.loopExit,
        idleTime: nodeTiming.idleTime,
      },
    },
    workload: options.workload,
    accounting: {
      profiledDuration,
      phaseDurationSum,
      unaccounted: Math.max(0, profiledDuration - phaseDurationSum),
      phases: options.phases,
    },
    runtime: {
      exportPhaseDuration: options.runtimeExportPhase.duration,
      rootSpanCoverage,
      unattributedWithinExport: Math.max(0, options.runtimeExportPhase.duration - rootSpanCoverage),
      spanSelfDurationSum,
      spanSelfReconciliation: rootSpanCoverage - spanSelfDurationSum,
      rootSpanKeys: roots.map(({ key }) => key),
      workerTimeOrigins: [...new Set(spans.map(({ workerTimeOrigin }) => workerTimeOrigin))],
      spans,
      summary: [...summaryByName.entries()]
        .map(([name, summary]) => ({ name, ...summary }))
        .sort((left, right) => right.selfDuration - left.selfDuration),
    },
  };
};
