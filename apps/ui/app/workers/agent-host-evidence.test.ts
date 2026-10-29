// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AgentLogEvent, TauAgentHost } from '@taucad/agent-host';
import { memoryPendingStore } from '@taucad/agent-observability/delivery';
import { createWorkerEvidence } from '#workers/agent-host-evidence.js';

const secret = 'SYNTHETIC_PERSON_TEXT_7d1';
const startedAt = Date.now() + 60_000;

/** One run that read a file and completed, a second apart, under one term. */
const rows = (leaderEpoch = 'term-1'): AgentLogEvent[] =>
  [
    { type: 'run.lifecycle', state: 'admitted' },
    {
      type: 'turn.history-projection-committed',
      retainedMessageIds: [],
      message: { id: 'turn-1', role: 'user', content: secret },
      context: { version: 1, systemPrompt: secret, initialMessages: [], postCompactionMessages: [] },
    },
    { type: 'run.lifecycle', state: 'running', attempt: 1 },
    {
      type: 'message.appended',
      message: { id: 'in-1', role: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', content: { secret } },
    },
    {
      type: 'message.appended',
      message: {
        id: 'out-1',
        role: 'tool-output',
        toolCallId: 'call-1',
        toolName: 'read_file',
        isError: false,
        content: secret,
      },
    },
    { type: 'run.lifecycle', state: 'completed', attempt: 1 },
  ].map((body, sequence) => {
    const row: unknown = {
      version: 1,
      leaderEpoch,
      sequence,
      recordedAt: new Date(startedAt + sequence * 1000).toISOString(),
      runId: 'run-1',
      ...body,
    };
    return row as AgentLogEvent;
  });

/** A host read over fixed rows, in pages of two. */
const readEventsOver =
  (events: readonly AgentLogEvent[]): TauAgentHost['readEvents'] =>
  async ({ cursor }) => ({
    cursor,
    nextCursor: Math.min(cursor + 2, events.length),
    endCursor: events.length,
    events: events.slice(cursor, cursor + 2),
  });

const purposes = (allowed: boolean) =>
  new Response(
    JSON.stringify({
      epoch: 'policy-1',
      projectId: 'project-1',
      purposes: [{ purpose: 'summary', allowed, decided: true, granted: allowed }],
    }),
    { status: 200 },
  );

const setup = (allowed: boolean) => {
  const sent: unknown[] = [];
  const urls: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    if (url.includes('/v1/telemetry-purposes')) {
      return purposes(allowed);
    }
    sent.push(JSON.parse(typeof init?.body === 'string' ? init.body : ''));
    return new Response(JSON.stringify({ receipt: `r-${sent.length}`, disposition: 'accepted', duplicate: false }), {
      status: 200,
    });
  });
  const evidence = createWorkerEvidence({
    apiBaseUrl: 'https://api.test',
    principal: 'user-1',
    projectId: 'project-1',
    hostBuild: 'abc1234',
    readEvents: readEventsOver(rows()),
    fetch: fetchMock,
    store: memoryPendingStore(),
  });
  return { evidence, fetchMock, sent, urls };
};

describe('createWorkerEvidence', () => {
  it('should report a settled run’s tool and outcome facts, with no person or tool text', async () => {
    const { evidence, sent } = setup(true);

    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });

    expect(sent).toMatchObject([
      { scope: { principal: 'user-1', project: 'project-1', policyEpoch: 'policy-1' }, semantic: { kind: 'tool' } },
      { semantic: { kind: 'outcome' }, versions: { hostBuild: 'abc1234' } },
    ]);
    expect(JSON.stringify(sent)).not.toContain(secret);
    expect(JSON.stringify(sent)).not.toContain('read_file');
  });

  it('should send nothing while the server grants no summaries', async () => {
    const { evidence, sent, urls } = setup(false);

    evidence.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(evidence.reporter.coverage().ungranted).toBe(1);
    });

    expect(sent).toEqual([]);
    expect(urls.every((url) => url.includes('/v1/telemetry-purposes'))).toBe(true);
  });

  it('should read nothing when the chat is not quiescent', async () => {
    const { evidence, fetchMock } = setup(true);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    evidence.onChatQuiescent('chat-1', false);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
