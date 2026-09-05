/**
 * Launcher behaviour that only a real workspace directory can prove: the log is
 * a file under `.tau/chats`, a run outlives the caller that admitted it, an
 * approval survives as a durable event, and a reconnect replays from a cursor.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createNodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ToolRegistry } from '#waist/ports.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;

const emptyTools: ToolRegistry = {
  list: () => [],
  invoke: async () => ({ content: 'no tools', isError: true }),
};

const sseResponse = (chunks: readonly string[]): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};

/** One gateway turn that answers with plain assistant text and stops. */
const scriptedGateway = (): typeof globalThis.fetch =>
  vi.fn(async () => sseResponse(authoritativeGatewayWireFixtures.browserTurn)) as unknown as typeof globalThis.fetch;

/** A gateway that never answers, so the run stays live for the whole case. */
const stalledGateway = (signalHolder: { abort?: () => void }): typeof globalThis.fetch =>
  vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signalHolder.abort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  ) as unknown as typeof globalThis.fetch;

const roots: string[] = [];
let launcher: NodeAgentLauncher | undefined;

const makeLauncher = async (fetchImplementation: typeof globalThis.fetch): Promise<NodeAgentLauncher> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
  roots.push(workspaceRoot);
  launcher = createNodeAgentLauncher({
    workspaceRoot,
    gatewayBaseUrl: 'https://gateway.example',
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    auth: () => 'daemon-bearer',
    fetch: fetchImplementation,
  });
  return launcher;
};

const currentRoot = (): string => roots.at(-1)!;

afterEach(async () => {
  await launcher?.close();
  launcher = undefined;
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('createNodeAgentLauncher', () => {
  it('writes the workspace event log and replays a completed transcript from a tail cursor', async () => {
    const host = await makeLauncher(scriptedGateway());
    const started = await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-1',
      runId: 'run-1',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });
    expect(started.type).toBe('result');

    // The run continues after admission answered; drive it to a terminal state.
    let attached = await host.execute({ type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    for (
      let attempt = 0;
      attempt < 200 && attached.type === 'attach' && attached.snapshot?.state !== 'completed';
      attempt++
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
      attached = await host.execute({ type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 });
    }
    if (attached.type !== 'attach') {
      throw new Error('attach must answer with an attach frame');
    }
    expect(attached.snapshot?.state).toBe('completed');
    expect(attached.leadership.role).toBe('leader');
    expect(typeof (attached.leadership.role === 'leader' ? attached.leadership.generation : '')).toBe('string');

    const logPath = join(currentRoot(), '.tau', 'chats', 'chat-1', 'events.jsonl');
    expect(await readFile(logPath, 'utf8')).toContain('"type":"run.lifecycle"');

    // A reconnecting client reads the same transcript from a cursor.
    const replayed = await host.execute({ type: 'tail', chatId: 'chat-1', cursor: 0, limit: 16 });
    if (replayed.type !== 'tail') {
      throw new Error('tail must answer with a tail frame');
    }
    expect(replayed.batch.events.length).toBeGreaterThan(0);
    expect(replayed.batch.cursor).toBe(0);
  });

  /*
   * A second `start` on a chat that already has an admitted run is a refusal,
   * not a second run. `acknowledge` answered it from whatever reservation the
   * chat held — the *other* run's snapshot — while the rejection of this call's
   * own admission was never observed at all, so the daemon carried an unhandled
   * rejection and the client was told a run it never asked for had started.
   */
  it('refuses a second start on a live chat with its own reason, not the running run', async () => {
    const host = await makeLauncher(stalledGateway({}));
    const first = await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-conflict',
      runId: 'run-first',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });
    expect(first).toMatchObject({ type: 'result', snapshot: { runId: 'run-first' } });

    await expect(
      host.execute({
        type: 'start',
        trigger: 'submit',
        chatId: 'chat-conflict',
        runId: 'run-second',
        message: { id: 'user-2', role: 'user', content: 'again' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_ADMISSION_CONFLICT' });
  });

  it('refuses a chat id that is not one storage path segment', async () => {
    const host = await makeLauncher(scriptedGateway());
    await expect(host.execute({ type: 'tail', chatId: '../escape', cursor: 0, limit: 16 })).rejects.toMatchObject({
      code: 'STORAGE_PATH_INVALID',
    });
  });

  it('records an approval as a durable interrupt and resolves it from a later caller', async () => {
    const host = await makeLauncher(stalledGateway({}));
    await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-2',
      runId: 'run-2',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });

    const paused = await host.execute({
      type: 'interrupt',
      chatId: 'chat-2',
      runId: 'run-2',
      interruptId: 'int-1',
      kind: 'approval',
      prompt: 'Write to disk?',
    });
    if (paused.type !== 'result') {
      throw new Error('interrupt must answer with a result frame');
    }
    expect(paused.snapshot.state).toBe('paused');
    expect(await host.pendingInterrupts('run-2')).toMatchObject([{ interruptId: 'int-1', kind: 'approval' }]);

    const log = await readFile(join(currentRoot(), '.tau', 'chats', 'chat-2', 'events.jsonl'), 'utf8');
    expect(log).toContain('"type":"interrupt.recorded"');
    expect(log).toContain('"phase":"requested"');

    await host.execute({
      type: 'resolve-interrupt',
      chatId: 'chat-2',
      runId: 'run-2',
      interruptId: 'int-1',
      outcome: 'denied',
    });
    expect(await host.pendingInterrupts('run-2')).toEqual([]);
    expect(await readFile(join(currentRoot(), '.tau', 'chats', 'chat-2', 'events.jsonl'), 'utf8')).toContain(
      '"phase":"resolved"',
    );
  });

  /*
   * The bearer leg against a real gateway. Every other case here stubs `fetch`,
   * so none of them would notice the gateway rejecting a daemon's device
   * credential — which is exactly the hand-off OQ-T1 rules on. Opt in with
   * `TAU_LLM_GATEWAY_LIVE_TESTS=true` plus a reachable gateway and a bearer it
   * accepts.
   */
  const liveGateway: string = process.env['TAU_HOST_GATEWAY_URL'] ?? '';
  const liveBearer: string = process.env['TAU_HOST_LIVE_BEARER'] ?? '';
  it.skipIf(!(process.env['TAU_LLM_GATEWAY_LIVE_TESTS'] === 'true' && liveGateway !== '' && liveBearer !== ''))(
    'runs one real gateway turn through the daemon bearer path',
    async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-live-'));
      roots.push(workspaceRoot);
      launcher = createNodeAgentLauncher({
        workspaceRoot,
        gatewayBaseUrl: liveGateway,
        model: {
          id: process.env['TAU_HOST_MODEL'] ?? 'claude-sonnet-4-5',
          providerKind: 'anthropic',
          contextWindow: 200_000,
          maxTokens: 1024,
        },
        systemPrompt: 'Answer with the single word: ready.',
        toolRegistry: emptyTools,
        auth: () => liveBearer,
      });
      await launcher.execute({
        type: 'start',
        trigger: 'submit',
        chatId: 'chat-live',
        runId: 'run-live',
        message: { id: 'user-1', role: 'user', content: 'Say ready.' },
      });
      let attached = await launcher.execute({ type: 'attach', chatId: 'chat-live', cursor: 0, limit: 16 });
      for (
        let attempt = 0;
        attempt < 600 &&
        attached.type === 'attach' &&
        !['completed', 'failed'].includes(attached.snapshot?.state ?? '');
        attempt++
      ) {
        // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
        attached = await launcher.execute({ type: 'attach', chatId: 'chat-live', cursor: 0, limit: 16 });
      }
      if (attached.type !== 'attach') {
        throw new Error('attach must answer with an attach frame');
      }
      expect(attached.snapshot?.state).toBe('completed');
      expect(attached.snapshot?.messages.at(-1)).toMatchObject({ role: 'assistant' });
    },
    120_000,
  );

  it('publishes every durable event to a subscriber that attached before the turn', async () => {
    const host = await makeLauncher(scriptedGateway());
    const observed: string[] = [];
    const subscription = new AbortController();
    const drain = (async () => {
      for await (const frame of host.events(subscription.signal)) {
        observed.push(frame.event.type);
      }
    })();

    await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-3',
      runId: 'run-3',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });
    for (let attempt = 0; attempt < 200 && !observed.includes('message.appended'); attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- awaiting the next durable append is sequential.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    subscription.abort();
    await drain;
    expect(observed).toContain('run.lifecycle');
    expect(observed).toContain('message.appended');
  });
});
