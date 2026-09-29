import { readFile } from 'node:fs/promises';

type TraceSpan = Readonly<{
  name?: string;
  detail?: { spanId?: string; parentSpanId?: string; kernelId?: string };
  origin?: { instance?: string; label?: string };
  epoch?: number;
  startTime?: number;
  duration?: number;
}>;

/** Selected producer's spans clipped to an action window; overlap is diagnostic, not critical-path time. */
export type RuntimeWindowObservation = Readonly<{
  origin: string;
  role: string;
  spanCount: number;
  overlappingMilliseconds: number;
  names: Readonly<Record<string, number>>;
  pidJoined: false;
}>;

/** Anchor marks relative to a monotonic sample start on the Unix wall clock. */
export const epochForRelativeMarks = (start: number, wallNow: number, monotonicNow: number): number =>
  wallNow - monotonicNow + start;

/** Read the selected kernel from a render span in the same utility origin. */
export const observedKernelSelection = async (traceFile: string | undefined): Promise<string | undefined> => {
  if (traceFile === undefined) {
    return undefined;
  }
  const body = await readFile(traceFile, 'utf8').catch(() => '');
  const spans = body.split('\n').flatMap((line): TraceSpan[] => {
    try {
      return [JSON.parse(line) as TraceSpan];
    } catch {
      return [];
    }
  });
  const renders = new Set(
    spans
      .filter((span) => span.name === 'kernel.render' && span.detail?.spanId && span.origin?.instance)
      .map((span) => `${span.origin!.instance}:${span.detail!.spanId}`),
  );
  return spans.findLast(
    (span) =>
      span.name === 'kernel.select' &&
      span.detail?.kernelId &&
      span.detail.parentSpanId &&
      span.origin?.instance &&
      renders.has(`${span.origin.instance}:${span.detail.parentSpanId}`),
  )?.detail?.kernelId;
};

/** Observe the selected render producer inside a wall-clock window without claiming PID or critical-path attribution. */
export const observedRuntimeWindow = async (input: {
  traceFile: string | undefined;
  kernelId: string;
  fromEpoch: number;
  toEpoch: number;
}): Promise<RuntimeWindowObservation | undefined> => {
  const { traceFile, kernelId, fromEpoch, toEpoch } = input;
  if (traceFile === undefined || !Number.isFinite(fromEpoch) || !Number.isFinite(toEpoch) || toEpoch <= fromEpoch) {
    return undefined;
  }
  const body = await readFile(traceFile, 'utf8').catch(() => '');
  const spans = body.split('\n').flatMap((line): TraceSpan[] => {
    try {
      return [JSON.parse(line) as TraceSpan];
    } catch {
      return [];
    }
  });
  const renders = new Set(
    spans
      .filter((span) => span.name === 'kernel.render' && span.detail?.spanId && span.origin?.instance)
      .map((span) => `${span.origin!.instance}:${span.detail!.spanId}`),
  );
  const selected = spans.findLast(
    (span) =>
      span.name === 'kernel.select' &&
      span.detail?.kernelId === kernelId &&
      span.detail.parentSpanId &&
      span.origin?.instance &&
      renders.has(`${span.origin.instance}:${span.detail.parentSpanId}`),
  );
  if (selected?.origin?.instance === undefined) {
    return undefined;
  }
  const names = new Map<string, number>();
  const intervals: Array<readonly [number, number]> = [];
  for (const span of spans) {
    if (span.origin?.instance !== selected.origin.instance || span.name === undefined) {
      continue;
    }
    const start = (span.epoch ?? Number.NaN) + (span.startTime ?? Number.NaN);
    const end = start + (span.duration ?? Number.NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const clippedStart = Math.max(start, fromEpoch);
    const clippedEnd = Math.min(end, toEpoch);
    if (clippedEnd <= clippedStart) {
      continue;
    }
    intervals.push([clippedStart, clippedEnd]);
    names.set(span.name, (names.get(span.name) ?? 0) + clippedEnd - clippedStart);
  }
  intervals.sort(([left], [right]) => left - right);
  let covered = 0;
  let coveredThrough = fromEpoch;
  for (const [start, end] of intervals) {
    covered += Math.max(0, end - Math.max(start, coveredThrough));
    coveredThrough = Math.max(coveredThrough, end);
  }
  return {
    origin: selected.origin.instance,
    role: selected.origin.label ?? 'unobserved',
    spanCount: intervals.length,
    overlappingMilliseconds: covered,
    names: Object.fromEntries([...names].sort(([, left], [, right]) => right - left).slice(0, 10)),
    pidJoined: false,
  };
};
