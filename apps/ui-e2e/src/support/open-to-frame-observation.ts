import { readFile } from 'node:fs/promises';

type TraceSpan = Readonly<{
  name?: string;
  detail?: { spanId?: string; parentSpanId?: string; kernelId?: string };
  origin?: { instance?: string };
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
