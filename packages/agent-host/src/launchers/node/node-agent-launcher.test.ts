/**
 * Launcher behaviour that only a real workspace directory can prove: the log is
 * a file under `.tau/chats`, a run outlives the caller that admitted it, an
 * approval survives as a durable event, and a reconnect replays from a cursor.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
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
    { status: 200, headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-daemon-1' } },
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
    modelTransport: createTauCloudGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model,
      auth: () => 'daemon-bearer',
      fetch: fetchImplementation,
    }),
  });
  return launcher;
};

/** The same launcher with no default model row: every turn must name its own. */
const makeModellessLauncher = async (fetchImplementation: typeof globalThis.fetch): Promise<NodeAgentLauncher> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
  roots.push(workspaceRoot);
  launcher = createNodeAgentLauncher({
    workspaceRoot,
    gatewayBaseUrl: 'https://gateway.example',
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    auth: () => 'daemon-bearer',
    fetch: fetchImplementation,
    modelTransport: createTauCloudGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      auth: () => 'daemon-bearer',
      fetch: fetchImplementation,
    }),
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
    const durableLog = await readFile(logPath, 'utf8');
    expect(durableLog).toContain('"type":"run.lifecycle"');
    expect(durableLog.indexOf('"type":"model.invocation-prepared"')).toBeLessThan(
      durableLog.indexOf('"type":"model.invocation-bound"'),
    );
    expect(durableLog).toContain('"operationId":"operation-daemon-1"');

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
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', runId: 'run-first', state: 'running' });
  });

  /*
   * V9 on the daemon: the run id is the idempotency key, so a client that
   * re-sends one `start` over a reconnected socket is answered with the run it
   * already has. The launcher went straight to `admit`, which refused the id as
   * taken and lost the turn; the browser worker reads the same replay check.
   */
  it('answers a re-sent start with the run it already admitted', async () => {
    const host = await makeLauncher(stalledGateway({}));
    const first = await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-replayed',
      runId: 'run-replayed',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });
    expect(first).toMatchObject({ type: 'result', snapshot: { runId: 'run-replayed' } });

    const replayed = await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-replayed',
      runId: 'run-replayed',
      message: { id: 'user-1', role: 'user', content: 'hello' },
    });
    expect(replayed).toMatchObject({ type: 'result', operation: 'start', snapshot: { runId: 'run-replayed' } });
  });

  it('reads a chat nobody wrote as empty without creating its log', async () => {
    const host = await makeLauncher(scriptedGateway());
    const workspaceRoot = roots.at(-1) ?? '';

    const tailed = await host.execute({ type: 'tail', chatId: 'chat-unwritten', cursor: 0, limit: 1 });
    const attached = await host.execute({ type: 'attach', chatId: 'chat-unwritten', cursor: 0, limit: 1 });

    expect(tailed).toMatchObject({ type: 'tail', batch: { endCursor: 0, events: [] } });
    expect(attached).toMatchObject({ type: 'attach', batch: { endCursor: 0, events: [] } });
    await expect(
      readFile(join(workspaceRoot, '.tau', 'chats', 'chat-unwritten', 'events.jsonl')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
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
      optionId: 'reject',
    });
    expect(await host.pendingInterrupts('run-2')).toEqual([]);
    const resolved = await readFile(join(currentRoot(), '.tau', 'chats', 'chat-2', 'events.jsonl'), 'utf8');
    expect(resolved).toContain('"phase":"resolved"');
    /* The exact option a human chose is durable, so a resumed run replays that decision. */
    expect(resolved).toContain('"optionId":"reject"');
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
          id: process.env['TAU_HOST_MODEL'] ?? 'openai-gpt-5.6-luna',
          providerKind: 'openai',
          contextWindow: 400_000,
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

  it('re-attaches to a run left non-terminal on a model-less launcher by reusing the committed model row', async () => {
    /* The previous host died mid-turn: its log holds the admission, the committed
     * turn context (which carries the model row) and a `running` marker. */
    const first = await makeModellessLauncher(scriptedGateway());
    const leaderEpoch = 'a'.repeat(32);
    const chatDirectory = join(currentRoot(), '.tau', 'chats', 'chat-interrupted');
    await mkdir(chatDirectory, { recursive: true });
    const recordedAt = new Date().toISOString();
    const base = { version: 1, leaderEpoch, recordedAt, runId: 'run-interrupted' };
    await writeFile(
      join(chatDirectory, 'events.jsonl'),
      [
        { ...base, sequence: 0, type: 'run.lifecycle', state: 'admitted' },
        {
          ...base,
          sequence: 1,
          type: 'turn.history-projection-committed',
          retainedMessageIds: [],
          message: { id: 'user-1', role: 'user', content: 'hello' },
          context: {
            version: 1,
            systemPrompt: 'You are Tau.',
            model,
            toolChoice: 'auto',
            initialMessages: [],
            postCompactionMessages: [],
          },
        },
        { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n') + '\n',
      'utf8',
    );

    /* I4: attach *records* the abandonment. Resuming it here re-asked the
     * provider for a turn nobody requested — a second full-price call for one
     * user turn, on nothing but a reconnect. */
    const attached = await first.execute({ type: 'attach', chatId: 'chat-interrupted', cursor: 0, limit: 16 });
    expect(attached.type === 'attach' && attached.snapshot).toMatchObject({
      runId: 'run-interrupted',
      state: 'failed',
      failure: { code: 'RUN_ABANDONED' },
    });
    expect(attached.type === 'attach' && attached.takeover).toBe(true);

    /* And the person's own Resume continues it on the model row the committed
     * turn context carries, which a model-less launcher has nowhere else. */
    const resumed = await first.execute({ type: 'resume', chatId: 'chat-interrupted' });
    expect(resumed).toMatchObject({ type: 'result', snapshot: { runId: 'run-interrupted' } });
    // Always-on: `resume` answers at admission, and the run finishes unattended.
    let settled = await first.execute({ type: 'attach', chatId: 'chat-interrupted', cursor: 0, limit: 16 });
    for (
      let attempt = 0;
      attempt < 200 && settled.type === 'attach' && settled.snapshot?.state !== 'completed';
      attempt++
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
      settled = await first.execute({ type: 'attach', chatId: 'chat-interrupted', cursor: 0, limit: 16 });
    }
    expect(settled.type === 'attach' && settled.snapshot?.state).toBe('completed');
  });

  /*
   * Observation is not recovery. `tail` and `attach` read the same window, and
   * only one of them may restart a run a restart left behind — otherwise every
   * viewer of a chat takes it over just by looking at it.
   */
  it('recovers a non-terminal run on attach and never on tail', async () => {
    const host = await makeLauncher(scriptedGateway());
    const leaderEpoch = 'b'.repeat(32);
    const logPath = join(currentRoot(), '.tau', 'chats', 'chat-viewer', 'events.jsonl');
    await mkdir(join(currentRoot(), '.tau', 'chats', 'chat-viewer'), { recursive: true });
    const base = {
      version: 1,
      leaderEpoch,
      recordedAt: new Date().toISOString(),
      runId: 'run-viewer',
    };
    const seeded =
      [
        { ...base, sequence: 0, type: 'run.lifecycle', state: 'admitted' },
        {
          ...base,
          sequence: 1,
          type: 'turn.history-projection-committed',
          retainedMessageIds: [],
          message: { id: 'user-1', role: 'user', content: 'hello' },
          context: {
            version: 1,
            systemPrompt: 'You are Tau.',
            model,
            toolChoice: 'auto',
            initialMessages: [],
            postCompactionMessages: [],
          },
        },
        { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n') + '\n';
    await writeFile(logPath, seeded, 'utf8');

    const tailed = await host.execute({ type: 'tail', chatId: 'chat-viewer', cursor: 0, limit: 16 });
    expect(tailed.type).toBe('tail');
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    // A viewer changed nothing: no resumed run, no new lifecycle marker.
    expect(await readFile(logPath, 'utf8')).toBe(seeded);

    const attached = await host.execute({ type: 'attach', chatId: 'chat-viewer', cursor: 0, limit: 16 });
    expect(attached).toMatchObject({ type: 'attach', takeover: true });
    let recovered = await readFile(logPath, 'utf8');
    for (let attempt = 0; attempt < 200 && !recovered.includes('"state":"completed"'); attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous read.
      recovered = await readFile(logPath, 'utf8');
    }
    // Exactly one recovery: the next attach observes a terminal run and takes nothing over.
    const settled = await host.execute({ type: 'attach', chatId: 'chat-viewer', cursor: 0, limit: 16 });
    expect(settled).toMatchObject({ type: 'attach', takeover: false });
  });

  /*
   * `allowedTools` narrows the daemon's registry; it never widens it (D17). A
   * client that names a tool this host does not expose gets the tools it does
   * expose, not a new one.
   */
  it('cannot widen the selected tool set with an allowedTools entry the host does not expose', async () => {
    const bodies: string[] = [];
    const registry: ToolRegistry = {
      list: () => [{ name: 'inspect', description: 'Inspect the model.', inputSchema: { type: 'object' } }],
      invoke: async () => ({ content: 'inspected', isError: false }),
    };
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const host = createNodeAgentLauncher({
      workspaceRoot,
      gatewayBaseUrl: 'https://gateway.example',
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: registry,
      auth: () => 'daemon-bearer',
      fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(typeof init?.body === 'string' ? init.body : '');
        return sseResponse(authoritativeGatewayWireFixtures.browserTurn);
      }) as unknown as typeof globalThis.fetch,
    });
    launcher = host;

    await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-narrowing',
      runId: 'run-narrowing',
      message: { id: 'user-1', role: 'user', content: 'hello' },
      config: {
        systemPrompt: 'You are Tau.',
        toolChoice: 'auto',
        allowedTools: ['inspect', 'ghost_tool'],
      },
    });
    for (let attempt = 0; attempt < 200 && bodies.length === 0; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- awaiting the first gateway request is sequential.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }

    expect(bodies[0]).toContain('inspect');
    expect(bodies[0]).not.toContain('ghost_tool');
    // The request is still committed verbatim: narrowing is applied, not rewritten.
    const durable = await readFile(join(workspaceRoot, '.tau', 'chats', 'chat-narrowing', 'events.jsonl'), 'utf8');
    expect(durable).toContain('"allowedTools":["inspect","ghost_tool"]');
  });

  it('refuses a Tau start when neither the launcher nor the admission names a model', async () => {
    const host = await makeModellessLauncher(scriptedGateway());
    await expect(
      host.execute({
        type: 'start',
        trigger: 'submit',
        chatId: 'chat-modelless',
        runId: 'run-modelless',
        message: { id: 'user-1', role: 'user', content: 'hello' },
      }),
    ).rejects.toMatchObject({ code: 'HOST_MODEL_UNAVAILABLE' });
  });

  it('runs a turn on a model-less launcher when the admission carries its own model row', async () => {
    const host = await makeModellessLauncher(scriptedGateway());
    const started = await host.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-own-model',
      runId: 'run-own-model',
      message: { id: 'user-1', role: 'user', content: 'hello' },
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    });
    expect(started.type).toBe('result');

    let attached = await host.execute({ type: 'attach', chatId: 'chat-own-model', cursor: 0, limit: 16 });
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
      attached = await host.execute({ type: 'attach', chatId: 'chat-own-model', cursor: 0, limit: 16 });
    }
    expect(attached.type === 'attach' && attached.snapshot?.state).toBe('completed');
  });
});
