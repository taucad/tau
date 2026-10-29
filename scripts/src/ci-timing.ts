import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

/** A phase's inclusive elapsed wall time, in milliseconds, relative to the invocation start. */
export type TimingSpan = {
  id: number;
  parent: number | undefined;
  phase: string;
  start: number;
  duration: number;
  outcome: 'success' | 'failure' | 'skip';
};

/** Collect nested phases in a sequential CLI without changing its return values or exceptions. */
export const createTimingRecorder = (options: {
  directory: string | undefined;
  metadata: Record<string, unknown>;
  clock?: () => number;
}): {
  measure: <T>(phase: string, operation: () => Promise<T>) => Promise<T>;
  measureSync: <T>(phase: string, operation: () => T) => T;
  finish: (exitCode: number) => string | undefined;
} => {
  const clock = options.clock ?? (() => performance.now());
  const origin = clock();
  const startedAt = new Date().toISOString();
  const spans: TimingSpan[] = [];
  const stack: number[] = [];
  let finished = false;
  const begin = (phase: string): TimingSpan => {
    const span: TimingSpan = {
      id: spans.length,
      parent: stack.at(-1),
      phase,
      start: clock() - origin,
      duration: 0,
      outcome: 'failure',
    };
    spans.push(span);
    stack.push(span.id);
    return span;
  };
  const succeed = (span: TimingSpan, result: unknown): void => {
    // Validators may return a failed check rather than throwing it.
    const status = typeof result === 'object' && result !== null && 'status' in result ? result.status : undefined;
    span.outcome = status === 'fail' ? 'failure' : status === 'skip' ? 'skip' : 'success';
  };
  const end = (span: TimingSpan): void => {
    span.duration = clock() - origin - span.start;
    stack.pop();
  };
  return {
    async measure<T>(phase: string, operation: () => Promise<T>): Promise<T> {
      if (!options.directory) {
        return operation();
      }
      const span = begin(phase);
      try {
        const result = await operation();
        succeed(span, result);
        return result;
      } finally {
        end(span);
      }
    },
    measureSync<T>(phase: string, operation: () => T): T {
      if (!options.directory) {
        return operation();
      }
      const span = begin(phase);
      try {
        const result = operation();
        succeed(span, result);
        return result;
      } finally {
        end(span);
      }
    },
    finish(exitCode: number): string | undefined {
      if (!options.directory || finished) {
        return undefined;
      }
      finished = true;
      const duration = clock() - origin;
      // An exit inside a phase leaves an unfinished span: retain it as failure.
      for (const id of stack) {
        const span = spans[id]!;
        span.duration = duration - span.start;
      }
      const invocation = randomUUID();
      const path = join(options.directory, `${invocation}.json`);
      mkdirSync(options.directory, { recursive: true });
      writeFileSync(
        path,
        JSON.stringify(
          {
            schemaVersion: 1,
            unit: 'milliseconds',
            invocation,
            startedAt,
            duration,
            exitCode,
            metadata: options.metadata,
            spans,
          },
          undefined,
          2,
        ) + '\n',
      );
      return path;
    },
  };
};
