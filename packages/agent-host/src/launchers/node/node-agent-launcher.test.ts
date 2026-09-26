/**
 * Launcher behaviour that only a real workspace directory can prove: the log is
 * a file under `.tau/chats`, a run outlives the caller that admitted it, an
 * approval survives as a durable event, and a reconnect reads from a cursor.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import type { HostRunSnapshot, ToolRegistry } from '#waist/ports.js';
import type { CommandAnswer, CommandPayload } from '#wire/commands.schema.js';
import type { ReadAnswer } from '#wire/frames.schema.js';

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

/** Details an `attach` answers with: the run's projection, whether this call took it over, and the end cursor. */
type AttachDetails = {
  readonly snapshot?: HostRunSnapshot | undefined;
  readonly takeover: boolean;
  readonly endCursor: number;
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

const start = async (
  host: NodeAgentLauncher,
  payload: Omit<CommandPayload<'start'>, 'trigger' | 'message'> & Partial<Pick<CommandPayload<'start'>, 'message'>>,
): Promise<CommandAnswer> =>
  host.execute({
    type: 'start',
    commandId: key(),
    payload: { trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'hello' }, ...payload },
  });

const attach = async (host: NodeAgentLauncher, chatId: string): Promise<AttachDetails> => {
  const answer = await host.execute({ type: 'attach', commandId: key(), payload: { chatId } });
  if (answer.status !== 'applied' || answer.effect !== 'not-applied') {
    throw new Error(`attach must answer with details: ${JSON.stringify(answer)}`);
  }
  return answer.details as AttachDetails;
};

/** Poll `attach` until the chat's run reaches one of `states`. */
const settle = async (
  host: NodeAgentLauncher,
  chatId: string,
  until: Readonly<{ states?: readonly string[]; attempts?: number }> = {},
): Promise<AttachDetails> => {
  const { states = ['completed'], attempts = 200 } = until;
  let attached = await attach(host, chatId);
  for (let attempt = 0; attempt < attempts && !states.includes(attached.snapshot?.state ?? ''); attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    // oxlint-disable-next-line no-await-in-loop -- each poll depends on the previous projection.
    attached = await attach(host, chatId);
  }
  return attached;
};

const read = async (host: NodeAgentLauncher, chatId: string, cursor = 0): Promise<ReadAnswer> =>
  host.read({ chatId, cursor, limit: 16, maxBytes: 1_048_576, signal: AbortSignal.timeout(100) });

afterEach(async () => {
  await launcher?.close();
  launcher = undefined;
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('createNodeAgentLauncher', () => {
  it('writes the workspace event log and replays a completed transcript from a read cursor', async () => {
    const host = await makeLauncher(scriptedGateway());
    const started = await start(host, { chatId: 'chat-1', runId: 'run-1' });
    expect(started).toMatchObject({ status: 'applied', effect: 'durable', cursor: 0 });

    // The run continues after admission answered; drive it to a terminal state.
    const attached = await settle(host, 'chat-1');
    expect(attached.snapshot?.state).toBe('completed');

    const logPath = join(currentRoot(), '.tau', 'chats', 'chat-1', 'events.jsonl');
    const durableLog = await readFile(logPath, 'utf8');
    expect(durableLog).toContain('"type":"run.lifecycle"');
    // The Tau Cloud transport is funded: the prepared row lands before the bound one (RA-S11).
    expect(durableLog.indexOf('"type":"model.invocation-prepared"')).toBeLessThan(
      durableLog.indexOf('"type":"model.invocation-bound"'),
    );
    expect(durableLog).toContain('"operationId":"operation-daemon-1"');
    expect(durableLog).toContain(`"commandId":"${started.commandId}"`);

    // A reconnecting client reads the same transcript from a cursor.
    const replayed = await read(host, 'chat-1');
    expect(replayed).toMatchObject({ status: 'batch', cursor: 0 });
    expect(replayed.status === 'batch' && replayed.events.length > 0).toBe(true);
  });

  /*
   * A second `start` on a chat that already has an admitted run is a refusal,
   * not a second run, and it names the run in the way.
   */
  it('refuses a second start on a live chat with its own reason, not the running run', async () => {
    const host = await makeLauncher(stalledGateway({}));
    await expect(start(host, { chatId: 'chat-conflict', runId: 'run-first' })).resolves.toMatchObject({
      status: 'applied',
      effect: 'durable',
    });

    await expect(
      start(host, {
        chatId: 'chat-conflict',
        runId: 'run-second',
        message: { id: 'user-2', role: 'user', content: 'again' },
      }),
    ).resolves.toMatchObject({ status: 'refused', effect: 'not-applied', code: 'CHAT_RUN_LIVE' });
  });

  /* D15: the key, not the run id, is the idempotency key. A re-send of one `start` is answered from the applied set. */
  it('answers a re-sent start replayed at the cursor it was applied at', async () => {
    const host = await makeLauncher(stalledGateway({}));
    const command = {
      type: 'start',
      commandId: 'cmd-replayed',
      payload: {
        chatId: 'chat-replayed',
        runId: 'run-replayed',
        trigger: 'submit',
        message: { id: 'user-1', role: 'user', content: 'hello' },
      },
    } as const;
    const first = await host.execute(command);
    expect(first).toMatchObject({ status: 'applied', effect: 'durable' });

    const replayed = await host.execute(command);
    expect(replayed).toEqual({ ...first, status: 'replayed' });
  });

  it('refuses a chat id that is not one storage path segment', async () => {
    const host = await makeLauncher(scriptedGateway());
    await expect(
      host.execute({ type: 'attach', commandId: key(), payload: { chatId: '../escape' } }),
    ).resolves.toMatchObject({ status: 'refused', code: 'STORAGE_PATH_INVALID' });
  });

  /* W0.12 (L2b HD-8). The desktop registration probe reads a sentinel chat on
   * every project open, and the read opened its log: a chat directory, an
   * `events.jsonl` and a writer lock for a chat that does not exist. */
  it('should not create a chat log when reading or attaching a missing chat', async () => {
    const host = await makeLauncher(scriptedGateway());
    const chatId = '00000000-0000-4000-8000-000000000000';

    await expect(read(host, chatId)).resolves.toEqual({
      status: 'batch',
      chatId,
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      events: [],
    });
    await expect(attach(host, chatId)).resolves.toEqual({ takeover: false, endCursor: 0 });
    await expect(stat(join(currentRoot(), '.tau'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('records an approval as a durable interrupt and resolves it from a later caller', async () => {
    const host = await makeLauncher(stalledGateway({}));
    await start(host, { chatId: 'chat-2', runId: 'run-2' });

    const paused = await host.execute({
      type: 'interrupt',
      commandId: 'cmd-interrupt',
      payload: { chatId: 'chat-2', runId: 'run-2', interruptId: 'int-1', kind: 'approval', prompt: 'Write to disk?' },
    });
    expect(paused).toMatchObject({ status: 'applied', effect: 'durable' });
    const settled1 = await attach(host, 'chat-2');
    expect(settled1.snapshot?.state).toBe('paused');
    expect(await host.pendingInterrupts('run-2')).toMatchObject([{ interruptId: 'int-1', kind: 'approval' }]);

    const log = await readFile(join(currentRoot(), '.tau', 'chats', 'chat-2', 'events.jsonl'), 'utf8');
    expect(log).toContain('"type":"interrupt.recorded"');
    expect(log).toContain('"phase":"requested"');

    const resolved = await host.execute({
      type: 'resolve-interrupt',
      commandId: 'cmd-resolve',
      payload: { chatId: 'chat-2', runId: 'run-2', interruptId: 'int-1', outcome: 'denied', optionId: 'reject' },
    });
    // Answered only once the resolution row is durable (SC-R9).
    expect(resolved).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(await host.pendingInterrupts('run-2')).toEqual([]);
    const after = await readFile(join(currentRoot(), '.tau', 'chats', 'chat-2', 'events.jsonl'), 'utf8');
    expect(after).toContain('"phase":"resolved"');
    /* The exact option a human chose is durable, so a resumed run replays that decision. */
    expect(after).toContain('"optionId":"reject"');
    expect(after).toContain('"commandId":"cmd-resolve"');
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
      await start(launcher, {
        chatId: 'chat-live',
        runId: 'run-live',
        message: { id: 'user-1', role: 'user', content: 'Say ready.' },
      });
      const attached = await settle(launcher, 'chat-live', { states: ['completed', 'failed'], attempts: 1200 });
      expect(attached.snapshot?.state).toBe('completed');
      expect(attached.snapshot?.messages.at(-1)).toMatchObject({ role: 'assistant' });
    },
    120_000,
  );

  it('answers a read at the chat end once the next durable row lands (SC-R14)', async () => {
    const host = await makeLauncher(scriptedGateway());
    const waiting = host.read({ chatId: 'chat-3', cursor: 0, limit: 16, maxBytes: 1_048_576 });

    await start(host, { chatId: 'chat-3', runId: 'run-3' });

    const page = await waiting;
    expect(page).toMatchObject({ status: 'batch', cursor: 0 });
    expect(page.status === 'batch' && page.events[0]).toMatchObject({ type: 'run.lifecycle', state: 'admitted' });
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
    const attached = await attach(first, 'chat-interrupted');
    expect(attached.snapshot).toMatchObject({
      runId: 'run-interrupted',
      state: 'failed',
      failure: { code: 'RUN_ABANDONED' },
    });
    expect(attached.takeover).toBe(true);

    /* And the person's own Resume continues it on the model row the committed
     * turn context carries, which a model-less launcher has nowhere else. */
    const resumed = await first.execute({
      type: 'resume',
      commandId: 'cmd-resume',
      payload: { chatId: 'chat-interrupted', runId: 'run-interrupted' },
    });
    expect(resumed).toMatchObject({ status: 'applied', effect: 'durable' });
    // Always-on: `resume` answers at admission, and the run finishes unattended.
    const settled2 = await settle(first, 'chat-interrupted');
    expect(settled2.snapshot?.state).toBe('completed');
  });

  /*
   * Observation is not recovery. `read` and `attach` see the same log, and
   * only `attach` may record a run a restart left behind — otherwise every
   * viewer of a chat takes it over just by looking at it.
   */
  it('recovers a non-terminal run on attach and never on read', async () => {
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

    const tailed = await read(host, 'chat-viewer');
    expect(tailed.status).toBe('batch');
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    // A viewer changed nothing: no resumed run, no new lifecycle marker.
    expect(await readFile(logPath, 'utf8')).toBe(seeded);

    await expect(attach(host, 'chat-viewer')).resolves.toMatchObject({ takeover: true });
    // Exactly one recovery: the next attach observes a terminal run and takes nothing over.
    await expect(attach(host, 'chat-viewer')).resolves.toMatchObject({ takeover: false });
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

    await start(host, {
      chatId: 'chat-narrowing',
      runId: 'run-narrowing',
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
    // Refused before any row (RA-R4): the log is as it was, and the chat has no run to fail.
    await expect(start(host, { chatId: 'chat-modelless', runId: 'run-modelless' })).resolves.toMatchObject({
      status: 'refused',
      effect: 'not-applied',
      code: 'HOST_MODEL_UNAVAILABLE',
    });
    const settled3 = await attach(host, 'chat-modelless');
    expect(settled3.snapshot).toBeUndefined();
  });

  it('runs a turn on a model-less launcher when the admission carries its own model row', async () => {
    const host = await makeModellessLauncher(scriptedGateway());
    const started = await start(host, {
      chatId: 'chat-own-model',
      runId: 'run-own-model',
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    });
    expect(started).toMatchObject({ status: 'applied', effect: 'durable' });
    const settled4 = await settle(host, 'chat-own-model');
    expect(settled4.snapshot?.state).toBe('completed');
  });
});
