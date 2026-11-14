import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentLogEvent, OwnRowsRead } from '@taucad/agent-host';
import { desktopChatObserver } from '#services-host-evidence.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-evidence-'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  // The observer can still be writing evidence as the test ends: retry the teardown rather than fail on ENOTEMPTY.
  await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

const noRows = vi.fn(async ({ cursor }: { cursor: number }) => ({
  cursor,
  nextCursor: cursor,
  endCursor: 0,
  events: [],
}));

const at = Date.now() + 60_000;
/** One run whose turn wrote `main.ts`, a second apart, under one term. */
const runRows = [
  { type: 'run.lifecycle', state: 'admitted' },
  {
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: { id: 'turn-1', role: 'user', content: 'SYNTHETIC_PROMPT' },
    context: { version: 1, systemPrompt: 'SYNTHETIC_SYSTEM', initialMessages: [], postCompactionMessages: [] },
  },
  { type: 'run.lifecycle', state: 'running', attempt: 1 },
  { type: 'run.lifecycle', state: 'completed', attempt: 1 },
  {
    type: 'turn.finalized',
    turnId: 'turn-1',
    runId: 'run-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    revisionId: 'rev-1',
    changedPaths: ['main.ts'],
    trigger: 'turn',
    runIds: ['run-1'],
  },
].map((body, sequence) => ({
  version: 1,
  leaderEpoch: 'term-1',
  sequence,
  recordedAt: new Date(at + sequence * 1000).toISOString(),
  runId: 'run-1',
  ...body,
}));
const oneRun = vi.fn(async ({ cursor }: { cursor: number }) => ({
  cursor,
  nextCursor: runRows.length,
  endCursor: runRows.length,
  events: cursor === 0 ? (runRows as unknown as never[]) : [],
}));

describe('desktopChatObserver', () => {
  it('should report a run’s content and its design as the revision holds it, only while content is allowed (LW6)', async () => {
    const bodies: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/telemetry-purposes')) {
        return new Response(
          JSON.stringify({
            epoch: 'policy-1',
            projectId: 'project-1',
            purposes: [
              { purpose: 'summary', allowed: true },
              { purpose: 'content', allowed: true },
            ],
          }),
          { status: 200 },
        );
      }
      bodies.push(JSON.parse(await new Response(init?.body).text()));
      return new Response(JSON.stringify({ receipt: 'r-1', disposition: 'accepted', duplicate: false }), {
        status: 200,
      });
    });
    const design = vi.fn(async () => [{ path: 'main.ts', text: 'SYNTHETIC_DESIGN', bytes: 16 }]);
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
      fetch: fetchMock,
    })(oneRun, { design });

    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    observer.close();

    expect(design).toHaveBeenCalledWith({ revision: 'rev-1', paths: ['main.ts'] });
    expect(bodies).toMatchObject([
      { payload: { plane: 'content', fact: { kind: 'outcome', turn: { host: 'desktop' } } } },
    ]);
    expect(JSON.stringify(bodies)).toContain('SYNTHETIC_PROMPT');
    expect(JSON.stringify(bodies)).toContain('SYNTHETIC_DESIGN');
    expect(JSON.stringify(bodies)).not.toContain('SYNTHETIC_SYSTEM');
  });

  it('should ask for the grant with the session’s bearer', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }));
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test/',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
      fetch: fetchMock,
    })(noRows);

    /* One read for the summaries' grant and one for the ratings'. */
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    /* A refused grant purges the queue files; settle those writes before the directory is removed. */
    await Promise.all([observer.reporter.refresh(), observer.feedback?.refresh()]);
    observer.close();

    for (const [url, init] of fetchMock.mock.calls.slice(0, 2)) {
      expect(url).toBe('https://api.test/v1/telemetry-purposes?projectId=project-1');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer session-token');
    }
  });

  it('should send nothing while signed out', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => undefined,
      token: () => undefined,
      fetch: fetchMock,
    })(noRows);

    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(noRows).toHaveBeenCalled();
    });
    await observer.reporter.refresh();
    observer.close();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** The build id the release workflow's checkout stamps into this bundle (`tauDesktopHostBuild`). */
const desktopBuild = '0123456789ab';

/** One ended run of `chat-1` in this host's own rows, recorded after the grant is read. */
const endedRun = (recordedAt: number): AgentLogEvent[] =>
  (
    [
      { type: 'run.lifecycle', state: 'admitted' },
      {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: 'turn-1', role: 'user', content: 'SYNTHETIC_PERSON_TEXT' },
        context: { version: 1, systemPrompt: 'SYNTHETIC_SYSTEM', initialMessages: [], postCompactionMessages: [] },
      },
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'run.lifecycle', state: 'completed', attempt: 1 },
    ] as const
  ).map(
    (body, sequence) =>
      ({
        version: 1,
        leaderEpoch: 'term-1',
        sequence,
        recordedAt: new Date(recordedAt + sequence).toISOString(),
        runId: 'run-1',
        ...body,
      }) as unknown as AgentLogEvent,
  );

const rowsOf =
  (events: readonly AgentLogEvent[]): OwnRowsRead =>
  async ({ cursor }) => ({ cursor, nextCursor: events.length, endCursor: events.length, events: [...events] });

type Sent = Readonly<{ plane: string; kind: string | undefined; hostBuild: unknown }>;

/** The API: both purposes allowed; every envelope is recorded, and accepted only once the API is `up`. */
const api = (up: boolean) => {
  const sent: Sent[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/v1/telemetry-purposes')) {
      return Response.json({
        epoch: 'policy-1',
        projectId: 'project-1',
        purposes: [
          { purpose: 'summary', allowed: true },
          { purpose: 'feedback', allowed: true },
        ],
      });
    }
    const envelope = JSON.parse(await new Response(init?.body).text()) as {
      payload: { plane: string; fact?: { kind: string } };
      hostBuild?: unknown;
      versions?: { hostBuild?: unknown };
    };
    sent.push({
      plane: envelope.payload.plane,
      kind: envelope.payload.fact?.kind,
      hostBuild: envelope.versions?.hostBuild ?? envelope.hostBuild,
    });
    return up
      ? Response.json({ receipt: `r-${sent.length}`, disposition: 'accepted', duplicate: false })
      : new Response('{}', { status: 503 });
  });
  return { fetchMock, sent };
};

describe('desktopChatObserver — desktop parity (LW8)', () => {
  it('should report as the desktop build, with a rating plane beside the summaries', async () => {
    vi.stubGlobal('tauDesktopHostBuild', desktopBuild);
    const { fetchMock, sent } = api(true);
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
      fetch: fetchMock,
    })(rowsOf(endedRun(Date.now() + 1000)));

    expect(observer.feedback).toBeDefined();
    await Promise.all([observer.reporter.refresh(), observer.feedback!.refresh()]);
    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(sent.some(({ plane }) => plane === 'summary')).toBe(true);
    });
    observer.close();

    expect(sent.map(({ hostBuild }) => hostBuild)).toEqual(sent.map(() => desktopBuild));
  });

  it('should report no build for a bundle stamped with none', async () => {
    vi.stubGlobal('tauDesktopHostBuild', '');
    const { fetchMock, sent } = api(true);
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
      fetch: fetchMock,
    })(rowsOf(endedRun(Date.now() + 1000)));

    await observer.reporter.refresh();
    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(sent.length).toBeGreaterThan(0);
    });
    observer.close();

    expect(sent.every(({ hostBuild }) => hostBuild === undefined || hostBuild === null)).toBe(true);
  });

  it('should queue a rating made in the desktop app in its own file, and send it after a restart', async () => {
    vi.stubGlobal('tauDesktopHostBuild', desktopBuild);
    const rows = rowsOf(endedRun(Date.now() + 1000));
    const options = {
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
    } as const;
    const down = api(false);
    const before = desktopChatObserver({ ...options, fetch: down.fetchMock })(rows);
    await Promise.all([before.reporter.refresh(), before.feedback!.refresh()]);

    before.onRated({ chatId: 'chat-1', runId: 'run-1', value: 'positive', at: Date.now() });
    const feedbackFile = join(directory, 'feedback', 'project-1.json');
    await vi.waitFor(async () => {
      expect(down.sent.some(({ plane }) => plane === 'feedback')).toBe(true);
      expect(await readFile(feedbackFile, 'utf8')).toContain('"rating"');
    });
    await before.feedback!.refresh();
    before.close();

    /* The app restarts: a fresh observer over the same directory, and the API answers again. */
    const up = api(true);
    const after = desktopChatObserver({ ...options, fetch: up.fetchMock })(rows);
    await after.feedback!.refresh();
    await vi.waitFor(() => {
      expect(up.sent).toContainEqual({ plane: 'feedback', kind: 'rating', hostBuild: desktopBuild });
    });
    await after.reporter.refresh();
    after.close();
  });
});
