import { describe, expect, it } from 'vitest';
import { contractId } from '@taucad/agent-observability/identity';
import { apiBuildRelease, executionOfAttempt, providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';

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

describe('apiBuildRelease', () => {
  it('labels the build by the Fly image reference, as service.version and Sentry do', () => {
    expect(apiBuildRelease('registry.fly.io/tau-api-staging:deployment-01KSYNTHETIC')).toBe(
      'tau-api-staging:deployment-01KSYNTHETIC',
    );
  });

  it('makes a digest reference a valid evidence id', () => {
    expect(apiBuildRelease(`registry.fly.io/tau-api-staging@sha256:${'a'.repeat(64)}`)).toBe(
      `tau-api-staging_sha256:${'a'.repeat(64)}`,
    );
  });

  it('reports no build outside Fly', () => {
    expect(apiBuildRelease(undefined)).toBeUndefined();
    expect(apiBuildRelease('')).toBeUndefined();
  });
});

describe('providerAttemptEvidence call kind, purpose and model', () => {
  const attempt = (change: Partial<ObservedAttempt> = {}): ObservedAttempt => ({
    principal: 'user-a',
    project: 'project-a',
    attemptKey: 'run-1:1:0',
    chat: 'chat-1',
    surface: 'gateway',
    wire: 'openai-responses',
    activity: 'agent',
    requestedModel: 'catalogue-model',
    supplierModel: 'supplier-model',
    provider: 'openai',
    operation: undefined,
    startedAt: 1_800_000_000_000,
    duration: 10,
    stream: undefined,
    ended: 'failed',
    ...change,
  });
  const factOf = async (change: Partial<ObservedAttempt> = {}) => {
    const { payload } = await providerAttemptEvidence(attempt(change), { policyEpoch: 'epoch-a', protection: 'free' });
    if (payload.plane !== 'summary' || payload.fact.kind !== 'provider') {
      throw new Error('not a provider fact');
    }
    return payload.fact;
  };

  it('declares a host run, a helper endpoint and any other gateway call by kind', async () => {
    expect(await factOf()).toMatchObject({ callKind: 'run', purpose: 'generation' });
    expect(await factOf({ surface: 'project_name', attemptKey: 'name-1', activity: 'title' })).toMatchObject({
      callKind: 'helper',
      purpose: 'helper',
    });
    expect(await factOf({ attemptKey: 'attempt-1' })).toMatchObject({ callKind: 'direct', purpose: 'generation' });
  });

  it('takes the compaction purpose from the activity the host asserted', async () => {
    expect(await factOf({ activity: 'compaction' })).toMatchObject({ callKind: 'run', purpose: 'compaction' });
  });

  it("falls back to the supplier's model id for the route when the stream named none", async () => {
    expect(await factOf()).toMatchObject({ resolvedModel: 'supplier-model' });
    expect(await factOf({ supplierModel: 'model@2026-01-01' })).toMatchObject({ resolvedModel: null });
    expect(
      await factOf({
        stream: {
          stop: 'stop',
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: null, missing: 'none' },
          resolvedModel: 'streamed-model',
          response: undefined,
          firstChunk: 1,
          firstText: undefined,
        },
        ended: 'completed',
      }),
    ).toMatchObject({ resolvedModel: 'streamed-model' });
  });
});
