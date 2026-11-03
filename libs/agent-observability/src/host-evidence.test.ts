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

const setup = (
  purposes: () => Response,
  principal: () => string | undefined = () => 'user-1',
  feedbackStore: ReturnType<typeof memoryPendingStore> | undefined = undefined,
) => {
  const submitted: Array<Readonly<{ url: string; authorization: string | undefined }>> = [];
  const planes: string[] = [];
  const facts: Array<Readonly<{ kind: string; occurredAt: number }>> = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/v1/telemetry-purposes')) {
      return purposes();
    }
    const envelope = JSON.parse(await new Response(init?.body).text()) as {
      payload: { plane: string; fact?: { kind: string } };
      clocks: { occurredAt: number };
    };
    planes.push(envelope.payload.plane);
    facts.push({ kind: envelope.payload.fact?.kind ?? '', occurredAt: envelope.clocks.occurredAt });
    submitted.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? undefined });
    return new Response(JSON.stringify({ receipt: 'r-1', disposition: 'accepted', duplicate: false }), { status: 200 });
  });
  /* A Node host's transport: the account's bearer on every request. */
  const withBearer: typeof fetch = async (input, init) =>
    fetchMock(input, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: 'Bearer t' } });
  const store = memoryPendingStore();
  const evidence = createHostEvidence({
    apiBaseUrl: 'https://api.test',
    principal,
    project: 'project-1',
    uploader: 'node-1',
    hostBuild: '1.2.3',
    fetch: withBearer,
    store,
    ...(feedbackStore === undefined ? {} : { feedbackStore }),
    observe: async () => ({ runs: [run], ownsEpoch: () => true }),
  });
  return { evidence, submitted, planes, facts, store };
};

const granted = (): Response =>
  new Response(
    JSON.stringify({ epoch: 'policy-1', projectId: 'project-1', purposes: [{ purpose: 'summary', allowed: true }] }),
    { status: 200 },
  );

const answering = (purposes: Readonly<{ summary: boolean; content: boolean }>) => (): Response =>
  new Response(
    JSON.stringify({
      epoch: 'policy-1',
      projectId: 'project-1',
      purposes: [
        { purpose: 'summary', allowed: purposes.summary },
        { purpose: 'content', allowed: purposes.content },
      ],
    }),
    { status: 200 },
  );

const allowing = (allowed: readonly string[]) => (): Response =>
  new Response(
    JSON.stringify({
      epoch: 'policy-1',
      projectId: 'project-1',
      purposes: ['summary', 'feedback'].map((purpose) => ({ purpose, allowed: allowed.includes(purpose) })),
    }),
    { status: 200 },
  );

describe('createHostEvidence', () => {
  /* The four permission modes (T03, T10): summaries follow the summary purpose alone, and this host never sends
   * content, whatever the content purpose says; content capture is not this reporter's to start. */
  it.each([
    { summary: true, content: false, sends: true },
    { summary: true, content: true, sends: true },
    { summary: false, content: true, sends: false },
    { summary: false, content: false, sends: false },
  ])('should send summaries only, and only when summaries are allowed: %o', async ({ summary, content, sends }) => {
    const { evidence, submitted, planes } = setup(answering({ summary, content }));

    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(sends ? submitted.length : evidence.reporter.coverage().ungranted).toBeGreaterThan(0);
    });

    expect(submitted.length > 0).toBe(sends);
    expect(planes.every((plane) => plane === 'summary')).toBe(true);
  });

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

  it('should report the first time the UI showed a run, and drop a later one or one from the future', async () => {
    const { evidence, submitted, facts } = setup(granted);
    /* Shown under the grant: a showing before this host first saw it is never sent. */
    await evidence.reporter.refresh();
    const shown = Date.now() + 1;

    evidence.onPresented('chat-1', 'run-1', shown + 60_000);
    evidence.onPresented('chat-1', 'run-1', shown);
    evidence.onPresented('chat-1', 'run-1', shown + 10);
    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(submitted).toHaveLength(2);
    });

    expect(facts).toEqual([
      { kind: 'outcome', occurredAt: endedAt },
      { kind: 'response', occurredAt: shown },
    ]);
  });

  it.each([
    { allowed: ['feedback'], planes: ['feedback'] },
    { allowed: ['summary'], planes: ['summary'] },
    { allowed: ['summary', 'feedback'], planes: ['feedback', 'summary'] },
  ])('should send a rating under the feedback grant alone: $allowed', async ({ allowed, planes: expected }) => {
    const { evidence, planes, facts } = setup(allowing(allowed), undefined, memoryPendingStore());
    await Promise.all([evidence.reporter.refresh(), evidence.feedback!.refresh()]);
    const at = Date.now() + 1;

    evidence.onRated({ chatId: 'chat-1', runId: 'run-1', value: 'negative', at });
    evidence.onRated({ chatId: 'chat-1', runId: 'run-1', value: 'positive', at: at + 10 });
    await vi.waitFor(() => {
      expect(planes.toSorted()).toEqual(expected);
    });

    expect(facts.filter((fact) => fact.kind === 'rating')).toEqual(
      allowed.includes('feedback') ? [{ kind: 'rating', occurredAt: at }] : [],
    );
  });

  it('should bind a grant given after the host opened when a run starts, and report that run', async () => {
    /* A new project: the host opens before the API knows it, so its first read is refused; the run then starts, ends
     * and goes quiescent. Bound only at quiescence, every fact of that run would predate the grant and be dropped. */
    let clock = 1000;
    let known = false;
    const submitted: string[] = [];
    const answer = (allowed: boolean): Response =>
      new Response(
        JSON.stringify({
          epoch: 'policy-1',
          projectId: 'project-1',
          purposes: [{ purpose: 'summary', allowed, ...(allowed ? {} : { refusal: 'project-not-owned' }) }],
        }),
        { status: 200 },
      );
    const evidence = createHostEvidence({
      apiBaseUrl: 'https://api.test',
      principal: () => 'user-1',
      project: 'project-1',
      uploader: 'node-1',
      hostBuild: undefined,
      fetch: async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/v1/telemetry-purposes')) {
          return answer(known);
        }
        submitted.push(url);
        return new Response(JSON.stringify({ receipt: 'r-1', disposition: 'accepted', duplicate: false }), {
          status: 200,
        });
      },
      store: memoryPendingStore(),
      now: () => clock,
      observe: async () => ({
        runs: [{ ...run, ending: { source: { chatId: 'chat-1', leaderEpoch: 'term-1', sequence: 3 }, at: 3000 } }],
        ownsEpoch: () => true,
      }),
    });
    await evidence.reporter.refresh();
    known = true;

    clock = 2000;
    evidence.onChatQuiescent('chat-1', false);
    await vi.waitFor(() => {
      expect(evidence.reporter.coverage().stop).toBeDefined();
    });
    clock = 4000;
    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(submitted).toHaveLength(1);
    });

    expect(evidence.reporter.coverage().beforeGrant).toBe(0);
  });

  it('should report no rating from a host composed without the feedback queue', async () => {
    const { evidence, facts } = setup(allowing(['summary', 'feedback']));
    await evidence.reporter.refresh();

    evidence.onRated({ chatId: 'chat-1', runId: 'run-1', value: 'positive', at: Date.now() + 1 });
    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(facts).toHaveLength(1);
    });

    expect(evidence.feedback).toBeUndefined();
    expect(facts.map((fact) => fact.kind)).toEqual(['outcome']);
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

  it('should purge what it held for one account when another signs in, and send it under neither', async () => {
    let account = 'user-1';
    const { evidence, submitted, store } = setup(granted, () => account);
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
    await evidence.reporter.refresh();
    account = 'user-2';
    await store.hold({ key: 'k', evidence: earlier.evidence[0]!, bytes: 2 });

    await evidence.reporter.refresh();

    expect(submitted).toEqual([]);
    const size = await store.size();
    expect(size.items).toBe(0);
  });
});
