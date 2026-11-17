import { describe, expect, it } from 'vitest';
import { unsettledLogRun } from '#log/unsettled-run.js';

const encoder = new TextEncoder();

/** One term's rows as a log's bytes, numbered from 0 in order. */
const logOf = (bodies: ReadonlyArray<Record<string, unknown>>, tail = ''): Uint8Array<ArrayBuffer> =>
  encoder.encode(
    bodies
      .map((body, sequence) =>
        JSON.stringify({
          version: 1,
          leaderEpoch: 'e01',
          epoch: 1,
          sequence,
          recordedAt: '2026-11-17T00:00:00.000Z',
          runId: 'run-1',
          ...body,
        }),
      )
      .map((line) => `${line}\n`)
      .join('') + tail,
  );

const life = (state: string, extra: Record<string, unknown> = {}) => ({ type: 'run.lifecycle', state, ...extra });

describe('unsettledLogRun', () => {
  it('should answer nothing for an empty log', () => {
    expect(unsettledLogRun(new Uint8Array())).toBeUndefined();
  });

  it('should answer the current run while it is admitted, running or paused', () => {
    expect(unsettledLogRun(logOf([life('admitted')]))).toEqual({ runId: 'run-1', state: 'admitted' });
    expect(unsettledLogRun(logOf([life('admitted'), life('running', { attempt: 1 })]))).toEqual({
      runId: 'run-1',
      state: 'running',
    });
    expect(
      unsettledLogRun(logOf([life('admitted'), life('running', { attempt: 1 }), life('paused', { attempt: 1 })])),
    ).toEqual({ runId: 'run-1', state: 'paused' });
  });

  it('should answer nothing once the run ended', () => {
    expect(
      unsettledLogRun(logOf([life('admitted'), life('running', { attempt: 1 }), life('completed', { attempt: 1 })])),
    ).toBeUndefined();
    expect(
      unsettledLogRun(
        logOf([
          life('admitted'),
          life('running', { attempt: 1 }),
          life('failed', { attempt: 1, detail: { message: 'gone', code: 'RUN_ABANDONED' } }),
        ]),
      ),
    ).toBeUndefined();
  });

  it('should drop a torn final line as a writer does, rather than refuse the log', () => {
    const torn = logOf([life('admitted'), life('running', { attempt: 1 })], '{"version":1,"leaderEp');
    expect(unsettledLogRun(torn)).toEqual({ runId: 'run-1', state: 'running' });
  });
});
