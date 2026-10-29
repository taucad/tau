import { describe, expect, it, vi } from 'vitest';
import { memoryPendingStore } from '#delivery.js';
import { createHostEvidence } from '#host-evidence.js';
import type { ProjectedRun } from '#projection.js';
import { projectRun } from '#projection.js';

const endedAt = Date.now() + 60_000;

const run: ProjectedRun = {
  chatId: 'chat-1',
  runId: 'run-1',
  termination: 'completed',
  tools: [],
  intervals: [],
  ending: { source: { chatId: 'chat-1', leaderEpoch: 'term-1', sequence: 3 }, at: endedAt },
};

const setup = (purposes: () => Response) => {
  const submitted: Array<Readonly<{ url: string; authorization: string | undefined }>> = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/v1/telemetry-purposes')) {
      return purposes();
    }
    submitted.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? undefined });
    return new Response(JSON.stringify({ receipt: 'r-1', disposition: 'accepted', duplicate: false }), { status: 200 });
  });
  /* A Node host's transport: the account's bearer on every request. */
  const withBearer: typeof fetch = async (input, init) =>
    fetchMock(input, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: 'Bearer t' } });
  const store = memoryPendingStore();
  const evidence = createHostEvidence({
    apiBaseUrl: 'https://api.test',
    principal: () => 'user-1',
    project: 'project-1',
    uploader: 'node-1',
    hostBuild: '1.2.3',
    fetch: withBearer,
    store,
    observe: async () => ({ runs: [run], ownsEpoch: () => true }),
  });
  return { evidence, submitted, store };
};

const granted = (): Response =>
  new Response(
    JSON.stringify({ epoch: 'policy-1', projectId: 'project-1', purposes: [{ purpose: 'summary', allowed: true }] }),
    { status: 200 },
  );

describe('createHostEvidence', () => {
  it('should report a quiescent chat’s settled facts over the host’s own transport', async () => {
    const { evidence, submitted } = setup(granted);

    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(submitted).toHaveLength(1);
    });

    expect(submitted[0]).toEqual({
      url: 'https://api.test/v1/agent-observability/evidence',
      authorization: 'Bearer t',
    });
  });

  it('should send nothing for a signed-out credential and purge what it held', async () => {
    const { evidence, submitted, store } = setup(() => new Response('{}', { status: 401 }));
    const earlier = await projectRun(run, {
      principal: 'user-1',
      project: 'project-1',
      policyEpoch: 'policy-1',
      protection: 'unknown',
      uploader: 'node-1',
      ownsEpoch: () => true,
      grantedAt: 0,
      hostBuild: undefined,
    });
    await store.hold({ key: 'k', evidence: earlier.evidence[0]!, bytes: 2 });

    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(evidence.reporter.coverage().ungranted).toBe(1);
    });

    expect(submitted).toEqual([]);
    const size = await store.size();
    expect(size.items).toBe(0);
  });
});
