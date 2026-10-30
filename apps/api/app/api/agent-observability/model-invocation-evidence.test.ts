import { describe, expect, it } from 'vitest';
import { contractId } from '@taucad/agent-observability/identity';
import { executionOfAttempt } from '#api/agent-observability/model-invocation-evidence.js';

describe('executionOfAttempt', () => {
  it('names the host run a host attempt key carries, under the id the host gives that run', async () => {
    expect(await executionOfAttempt('run-1:2:0')).toBe(await contractId('run', 'run-1'));
    expect(await executionOfAttempt('run a/1:1:3')).toBe(await contractId('run', 'run a/1'));
    expect(await executionOfAttempt('run:with:colons:1:12')).toBe(await contractId('run', 'run:with:colons'));
  });

  it('keeps any other key as its own execution', async () => {
    const keys = ['attempt with spaces', 'helper-1', 'run-1:1', 'run-1:a:0', ':1:0'];

    expect(await Promise.all(keys.map(async (key) => executionOfAttempt(key)))).toEqual(
      await Promise.all(keys.map(async (key) => contractId('inv', key))),
    );
  });
});
