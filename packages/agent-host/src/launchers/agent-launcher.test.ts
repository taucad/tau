/**
 * Launcher behaviour that only a real workspace directory can prove: the log is
 * a file under `.tau/chats`, a run outlives the caller that admitted it, an
 * approval survives as a durable event, and a reconnect reads from a cursor.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import { agentChannelPort } from '#channel/endpoint.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import { followChat } from '#log/follow-chat.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import { createAgentLauncher, credentialPrincipal } from '#launchers/agent-launcher.js';
import { chatStoreBinding, createChatStore } from '#launchers/chat-store.js';
import { createNodeChatStore } from '#node.js';
import type { AgentLauncher, CredentialState } from '#launchers/agent-launcher.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import type {
  HostRunSnapshot,
  ModelStreamEvent,
  SourceLiveEvent,
  ToolRegistry,
  TurnPlacementFact,
  TurnPlacementPort,
} from '#waist/ports.js';
import type { CommandAnswer, CommandPayload } from '#wire/commands.schema.js';
import type { ReadAnswer } from '#wire/frames.schema.js';
import type * as TauAgentHostModule from '#host/tau-agent-host.js';

/* A seam on the launcher's host: while set, its `command` throws, as an admission that failed outright does. It
 * passes through otherwise. */
const hostSeams = vi.hoisted(() => ({ commandFailure: undefined as undefined | Error }));

vi.mock('#host/tau-agent-host.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TauAgentHostModule>();
  return {
    ...actual,
    createTauAgentHost: (...args: Parameters<typeof actual.createTauAgentHost>) => {
      const host = actual.createTauAgentHost(...args);
      return {
        ...host,
        command: async (command: Parameters<typeof host.command>[0]) => {
          if (hostSeams.commandFailure !== undefined) {
            throw hostSeams.commandFailure;
          }
          return host.command(command);
        },
      };
    },
  };
});

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
        const aborted = (): void => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        signalHolder.abort = aborted;
        /* As `fetch` does, a signal already aborted rejects at once: a close that beat the request would hang else. */
        if (init?.signal?.aborted === true) {
          aborted();
        }
        init?.signal?.addEventListener('abort', aborted);
      }),
  ) as unknown as typeof globalThis.fetch;

const roots: string[] = [];
let launcher: AgentLauncher | undefined;

const makeLauncher = async (fetchImplementation: typeof globalThis.fetch): Promise<AgentLauncher> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
  roots.push(workspaceRoot);
  launcher = createNodeLauncher({
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
const makeModellessLauncher = async (fetchImplementation: typeof globalThis.fetch): Promise<AgentLauncher> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
  roots.push(workspaceRoot);
  launcher = createNodeLauncher({
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

/** Details an `attach` answers with: the run's projection, whether its read found a driverless run, the end cursor
 * and this process's role (RH-R1, RH-R2). */
type AttachDetails = {
  readonly snapshot?: HostRunSnapshot | undefined;
  readonly takeover: boolean;
  readonly endCursor: number;
  readonly role: 'leader' | 'follower' | 'none';
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

const start = async (
  host: AgentLauncher,
  payload: Omit<CommandPayload<'start'>, 'trigger' | 'message'> & Partial<Pick<CommandPayload<'start'>, 'message'>>,
): Promise<CommandAnswer> =>
  host.execute({
    type: 'start',
    commandId: key(),
    payload: { trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'hello' }, ...payload },
  });

const attach = async (host: AgentLauncher, chatId: string): Promise<AttachDetails> => {
  const answer = await host.execute({ type: 'attach', commandId: key(), payload: { chatId } });
  if (answer.status !== 'applied' || answer.effect !== 'not-applied') {
    throw new Error(`attach must answer with details: ${JSON.stringify(answer)}`);
  }
  return answer.details as AttachDetails;
};

/** Poll `attach` until the chat's run reaches one of `states`. */
const settle = async (
  host: AgentLauncher,
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

const read = async (host: AgentLauncher, chatId: string, cursor = 0): Promise<ReadAnswer> =>
  host.read({ chatId, cursor, limit: 16, maxBytes: 1_048_576, signal: AbortSignal.abort() });

afterEach(async () => {
  await launcher?.close();
  launcher = undefined;
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('createAgentLauncher', () => {
  it('delivers held same-run Resume deltas over a reconnected actual channel and replacement writer', async (context) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-resume-live-channel-'));
    roots.push(workspaceRoot);
    const resumed = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let calls = 0;
    const host = createAgentLauncher({
      chats: createNodeChatStore({ workspaceRoot }),
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
      credential: () => ({ mode: 'session' }),
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          calls += 1;
          if (calls === 1) {
            yield { type: 'text-delta', text: 'Retained before failure.' };
            yield { type: 'tool-input', toolCallId: 'resume-tool', toolName: 'fixture_tool', input: {} };
            yield { type: 'completed', stopReason: 'toolUse' };
            return;
          }
          if (calls === 2) {
            yield { type: 'completed', stopReason: 'aborted' };
            return;
          }
          yield { type: 'text-delta', text: 'Held Resume alpha.' };
          resumed.resolve();
          await finish.promise;
          yield { type: 'text-delta', text: ' Resume beta.' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
    });
    launcher = host;
    const connections: Array<() => void> = [];
    const listen = vi.spyOn(host, 'liveEvents');
    context.onTestFinished(async () => {
      finish.resolve();
      for (const close of connections) {
        close();
      }
      listen.mockRestore();
    });
    const connect = () => {
      const channel = new MessageChannel();
      const server = serveAgentChannel(channel.port1, host, { build: 'resume-live' });
      const client = createAgentChannelClient({ connect: () => agentChannelPort(channel.port2) });
      const controller = new AbortController();
      const events: SourceLiveEvent[] = [];
      const consume = (async () => {
        for await (const event of client.liveEvents({ chatId: 'chat-resume-live', signal: controller.signal })) {
          events.push(event);
        }
      })();
      const close = () => {
        controller.abort();
        client.close();
        server.dispose();
        channel.port1.close();
        channel.port2.close();
      };
      connections.push(close);
      return { client, events, close, consume };
    };
    const first = connect();
    try {
      await vi.waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(1);
      });
      await first.client.execute({
        type: 'start',
        commandId: key(),
        payload: {
          chatId: 'chat-resume-live',
          runId: 'run-resume-live',
          trigger: 'submit',
          message: { id: 'resume-user', role: 'user', content: 'Fail then Resume.' },
        },
      });
      const failed = await settle(host, 'chat-resume-live', { states: ['failed'] });
      expect({ calls, failed }).toMatchObject({ calls: 2, failed: { snapshot: { state: 'failed' } } });
      await vi.waitFor(() => {
        expect(first.events.some((event) => event.type === 'text-delta')).toBe(true);
      });
      const oldGeneration = first.events[0]!.sourceGeneration;
      first.close();
      await first.consume;
      await host.host.relinquish('chat-resume-live');
      host.host.assumeLeadership('chat-resume-live', 2);
      const second = connect();
      await vi.waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(2);
      });
      await second.client.execute({
        type: 'resume',
        commandId: key(),
        payload: {
          chatId: 'chat-resume-live',
          runId: 'run-resume-live',
        },
      });
      await resumed.promise;
      await vi.waitFor(() => {
        expect(second.events).toContainEqual(
          expect.objectContaining({ type: 'text-delta', delta: 'Held Resume alpha.', runId: 'run-resume-live' }),
        );
      });
      const answer = await second.client.read({
        chatId: 'chat-resume-live',
        cursor: 0,
        limit: 16,
        maxBytes: 1_048_576,
      });
      expect(answer.status).toBe('batch');
      if (answer.status !== 'batch') {
        throw new Error('Replacement writer read refused.');
      }
      expect(second.events[0]!.sourceGeneration).toBe(answer.sourceGeneration);
      expect(answer.sourceGeneration).not.toBe(oldGeneration);
      finish.resolve();
      await settle(host, 'chat-resume-live');
      second.close();
      await second.consume;
    } finally {
      finish.resolve();
      for (const close of connections) {
        close();
      }
    }
  });

  it('delivers held same-run Resume deltas on the same actual channel across read owner fencing and replacement writer', async (context) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-resume-live-channel-'));
    roots.push(workspaceRoot);
    const resumed = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let calls = 0;
    const host = createAgentLauncher({
      chats: createNodeChatStore({ workspaceRoot }),
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
      credential: () => ({ mode: 'session' }),
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          calls += 1;
          if (calls === 1) {
            yield { type: 'text-delta', text: 'Retained before failure.' };
            yield { type: 'tool-input', toolCallId: 'resume-tool', toolName: 'fixture_tool', input: {} };
            yield { type: 'completed', stopReason: 'toolUse' };
            return;
          }
          if (calls === 2) {
            yield { type: 'completed', stopReason: 'aborted' };
            return;
          }
          yield { type: 'text-delta', text: 'Held Resume alpha.' };
          resumed.resolve();
          await finish.promise;
          yield { type: 'text-delta', text: ' Resume beta.' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
    });
    launcher = host;
    const connections: Array<() => void> = [];
    const listen = vi.spyOn(host, 'liveEvents');
    context.onTestFinished(async () => {
      finish.resolve();
      for (const close of connections) {
        close();
      }
      listen.mockRestore();
    });
    const connect = () => {
      const channel = new MessageChannel();
      const server = serveAgentChannel(channel.port1, host, { build: 'resume-live' });
      const client = createAgentChannelClient({ connect: () => agentChannelPort(channel.port2) });
      const controller = new AbortController();
      const events: SourceLiveEvent[] = [];
      const consume = (async () => {
        for await (const event of client.liveEvents({ chatId: 'chat-resume-live', signal: controller.signal })) {
          events.push(event);
        }
      })();
      const close = () => {
        controller.abort();
        client.close();
        server.dispose();
        channel.port1.close();
        channel.port2.close();
      };
      connections.push(close);
      return { client, events, close, consume };
    };
    const first = connect();
    const readEntered = Promise.withResolvers<void>();
    const releaseRead = Promise.withResolvers<void>();
    let restoreRead: (() => void) | undefined;
    try {
      await vi.waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(1);
      });
      await first.client.execute({
        type: 'start',
        commandId: key(),
        payload: {
          chatId: 'chat-resume-live',
          runId: 'run-resume-live',
          trigger: 'submit',
          message: { id: 'resume-user', role: 'user', content: 'Fail then Resume.' },
        },
      });
      const failed = await settle(host, 'chat-resume-live', { states: ['failed'] });
      expect({ calls, failed }).toMatchObject({ calls: 2, failed: { snapshot: { state: 'failed' } } });
      await vi.waitFor(() => {
        expect(first.events.some((event) => event.type === 'text-delta')).toBe(true);
      });
      const oldGeneration = first.events[0]!.sourceGeneration;
      const initial = await first.client.read({
        chatId: 'chat-resume-live',
        cursor: 0,
        limit: 16,
        maxBytes: 1_048_576,
      });
      if (initial.status !== 'batch' || initial.nextCursor !== initial.endCursor) {
        throw new Error('The failed fixture must be fully read before parking its follower.');
      }
      const originalRead = host.host.read.bind(host.host);
      const readOwner = vi.spyOn(host.host, 'read').mockImplementation(async (request) => {
        readEntered.resolve();
        await releaseRead.promise;
        return originalRead(request);
      });
      restoreRead = () => {
        readOwner.mockRestore();
      };
      const fencedRead = first.client.read({
        chatId: 'chat-resume-live',
        cursor: initial.endCursor,
        sourceGeneration: initial.sourceGeneration,
        limit: 16,
        maxBytes: 1_048_576,
      });
      await readEntered.promise;
      expect(readOwner).toHaveBeenCalledOnce();
      await host.host.relinquish('chat-resume-live');
      releaseRead.resolve();
      const fencedAnswer = await fencedRead;
      expect(fencedAnswer).toMatchObject({ status: 'refused', reason: 'owner-fenced' });
      readOwner.mockRestore();
      host.host.assumeLeadership('chat-resume-live', 2);
      await first.client.execute({
        type: 'resume',
        commandId: key(),
        payload: {
          chatId: 'chat-resume-live',
          runId: 'run-resume-live',
        },
      });
      await resumed.promise;
      await vi.waitFor(() => {
        expect(first.events).toContainEqual(
          expect.objectContaining({ type: 'text-delta', delta: 'Held Resume alpha.', runId: 'run-resume-live' }),
        );
      });
      const answer = await first.client.read({ chatId: 'chat-resume-live', cursor: 0, limit: 16, maxBytes: 1_048_576 });
      expect(answer.status).toBe('batch');
      if (answer.status !== 'batch') {
        throw new Error('Replacement writer read refused.');
      }
      expect(
        first.events.find((event) => event.type === 'text-delta' && event.delta === 'Held Resume alpha.')
          ?.sourceGeneration,
      ).toBe(answer.sourceGeneration);
      expect(listen).toHaveBeenCalledTimes(1);
      expect(answer.sourceGeneration).not.toBe(oldGeneration);
      finish.resolve();
      await settle(host, 'chat-resume-live');
      first.close();
      await first.consume;
    } finally {
      releaseRead.resolve();
      restoreRead?.();
      finish.resolve();
      for (const close of connections) {
        close();
      }
    }
  });

  it('qualifies live deltas with the same generation as their actual writer read', async () => {
    const host = await makeLauncher(scriptedGateway());
    const controller = new AbortController();
    const stream = host.liveEvents({ chatId: 'chat-qualified', signal: controller.signal })[Symbol.asyncIterator]();
    const pending = stream.next();
    try {
      await start(host, { chatId: 'chat-qualified', runId: 'run-qualified' });
      const first = await pending;
      expect(first.done).toBe(false);
      await settle(host, 'chat-qualified');
      const read = await host.read({
        chatId: 'chat-qualified',
        cursor: 0,
        limit: 1,
        maxBytes: 1_048_576,
        signal: AbortSignal.abort(),
      });
      expect(read.status).toBe('batch');
      if (read.status !== 'batch') {
        throw new Error('Writer read did not produce a batch.');
      }
      expect(first.value).toMatchObject({ sourceGeneration: read.sourceGeneration, runId: 'run-qualified' });
      expect(read.sourceGeneration).toEqual(expect.any(String));
    } finally {
      controller.abort();
      await stream.return?.();
    }
  });

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

    await expect(read(host, chatId)).resolves.toMatchObject({
      status: 'batch',
      chatId,
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      events: [],
    });
    await expect(attach(host, chatId)).resolves.toEqual({ takeover: false, endCursor: 0, role: 'none' });
    await expect(stat(join(currentRoot(), '.tau'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should settle a second concurrent close only after the first finishes', async () => {
    const host = await makeLauncher(scriptedGateway());
    await attach(host, '00000000-0000-4000-8000-000000000001');
    let firstDone = false;
    const closeFirst = async (): Promise<void> => {
      await host.close();
      firstDone = true;
    };
    const first = closeFirst();

    await host.close();

    expect(firstDone).toBe(true);
    await first;
  });

  /* RH-A15 (T7, C6): the Node leg leads every chat it opens and never lets go on quiescence, so only idle eviction
   * closes a finished chat's writer; the browser leg's EQ4 relinquish already does, before the eviction bound. */
  it("should close an idle chat's writer once the eviction bound passes, and reopen it on the next command", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const fetchImplementation = scriptedGateway();
    const host = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      delays: { idleEviction: 1000 },
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: fetchImplementation,
      }),
    });
    launcher = host;
    const lock = join(workspaceRoot, '.tau', 'chats', 'chat-idle', 'events.jsonl.lock');
    await start(host, { chatId: 'chat-idle', runId: 'run-idle' });
    await settle(host, 'chat-idle');
    const writing = await read(host, 'chat-idle');
    if (writing.status !== 'batch') {
      throw new Error('Expected writer source.');
    }

    await vi.waitFor(
      async () => {
        await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
      },
      { timeout: 5000, interval: 25 },
    );
    await expect(
      host.read({
        chatId: 'chat-idle',
        cursor: writing.nextCursor,
        sourceGeneration: writing.sourceGeneration,
        limit: 16,
        maxBytes: 1_048_576,
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
    const viewing = await read(host, 'chat-idle');
    if (viewing.status !== 'batch') {
      throw new Error('Expected read-only source.');
    }
    /* A fresh incarnation takes the writer again and admits the run (the fixture's one scripted turn is spent). */
    await expect(start(host, { chatId: 'chat-idle', runId: 'run-idle-2' })).resolves.toMatchObject({
      status: 'applied',
    });
    await expect(
      host.read({
        chatId: 'chat-idle',
        cursor: viewing.nextCursor,
        sourceGeneration: viewing.sourceGeneration,
        limit: 16,
        maxBytes: 1_048_576,
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
    await expect(settle(host, 'chat-idle', { states: ['completed', 'failed'] })).resolves.toMatchObject({
      snapshot: { runId: 'run-idle-2' },
    });
  });

  /* RH-R1 (RH-A18): a read opens the log with `read` access. It takes no writer lock and assumes no leadership, so
   * another process may still write the chat. */
  it('should not create a chat log when reading a missing chat', async () => {
    const host = await makeLauncher(scriptedGateway());
    await start(host, { chatId: 'chat-written', runId: 'run-written' });
    await settle(host, 'chat-written');
    await host.close();
    launcher = undefined;
    const lock = join(currentRoot(), '.tau', 'chats', 'chat-written', 'events.jsonl.lock');

    const reader = createNodeLauncher({
      workspaceRoot: currentRoot(),
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
    });
    const roles: unknown[] = [];
    for (const chatId of ['missing', 'chat-written']) {
      // oxlint-disable-next-line no-await-in-loop -- each read is checked before the next.
      await read(reader, chatId);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      const attached = await attach(reader, chatId);
      roles.push(attached.role);
    }
    await expect(stat(join(currentRoot(), '.tau', 'chats', 'missing'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    /* RH-R2: the role is leadership's, not a literal `leader`. */
    expect(roles).toEqual(['none', 'none']);
    await reader.close();
  });

  /* RH-R13 (RH-S6): a Tau admission on an unpaired host is refused before any row; reads and ACP are unaffected. */
  it('should refuse start with HOST_NOT_PAIRED while the host is unpaired and write no row', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    let credential: CredentialState = { mode: 'unpaired' };
    const host = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      fetch: scriptedGateway(),
      gatewayBaseUrl: 'https://gateway.example',
      credential: () => credential,
    });
    launcher = host;

    await expect(start(host, { chatId: 'chat-unpaired', runId: 'run-unpaired' })).resolves.toMatchObject({
      status: 'refused',
      effect: 'not-applied',
      code: 'HOST_NOT_PAIRED',
    });
    await expect(
      host.execute({ type: 'resume', commandId: key(), payload: { chatId: 'chat-unpaired', runId: 'run-unpaired' } }),
    ).resolves.toMatchObject({ status: 'refused', code: 'HOST_NOT_PAIRED' });
    await expect(stat(join(workspaceRoot, '.tau'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(read(host, 'chat-unpaired')).resolves.toMatchObject({ status: 'batch', endCursor: 0 });

    // Paired again: the same command id is admitted, since nothing was written under it.
    credential = { mode: 'paired', bearer: 'daemon-bearer' };
    await expect(start(host, { chatId: 'chat-unpaired', runId: 'run-unpaired' })).resolves.toMatchObject({
      status: 'applied',
      effect: 'durable',
    });
  });

  /* W6-owed (W11 GI-Q6): the credential port names the account, so every prepared attempt is stamped with it. */
  it('should stamp each prepared attempt with the account the credential names', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const credential = (): CredentialState => ({ mode: 'paired', bearer: 'daemon-bearer', principal: 'account-a' });
    const fetchImplementation = scriptedGateway();
    const host = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      credential,
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: fetchImplementation,
        principal: () => credentialPrincipal(credential()),
      }),
    });
    launcher = host;
    await start(host, { chatId: 'chat-principal', runId: 'run-principal' });
    await settle(host, 'chat-principal');
    const log = await readFile(join(workspaceRoot, '.tau', 'chats', 'chat-principal', 'events.jsonl'), 'utf8');
    const prepared = log
      .split('\n')
      .filter((line) => line.includes('"type":"model.invocation-prepared"'))
      .map((line) => JSON.parse(line) as { readonly principal?: string });
    expect(prepared.length).toBeGreaterThan(0);
    expect(prepared.every((row) => row.principal === 'account-a')).toBe(true);
  });

  /* GI-Q6: once the credential names a principal, an attempt another account funded is refused, not voided. */
  it('should refuse a resume of an attempt another signed-in account funded with MODEL_ATTEMPT_OTHER_ACCOUNT', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    const survivorRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot, survivorRoot);
    const signedIn = (root: string, principal: string, fetchImplementation: typeof globalThis.fetch): AgentLauncher => {
      const credential = (): CredentialState => ({ mode: 'paired', bearer: 'daemon-bearer', principal });
      return createNodeLauncher({
        workspaceRoot: root,
        model,
        systemPrompt: 'You are Tau.',
        toolRegistry: emptyTools,
        credential,
        modelTransport: createTauCloudGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          model,
          auth: () => 'daemon-bearer',
          fetch: fetchImplementation,
          principal: () => credentialPrincipal(credential()),
        }),
      });
    };
    const events = (root: string): string => join(root, '.tau', 'chats', 'chat-account', 'events.jsonl');
    const died = signedIn(workspaceRoot, 'account-a', stalledGateway({}));
    launcher = died;
    await start(died, { chatId: 'chat-account', runId: 'run-account' });
    await vi.waitFor(async () => {
      expect(await readFile(events(workspaceRoot), 'utf8')).toContain('"type":"model.invocation-prepared"');
    });
    /* The crash: the durable state mid-call, under a host signed in as another account that never saw the run. */
    await mkdir(join(survivorRoot, '.tau', 'chats', 'chat-account'), { recursive: true });
    await writeFile(events(survivorRoot), await readFile(events(workspaceRoot), 'utf8'));
    const other = signedIn(survivorRoot, 'account-b', scriptedGateway());
    await settle(other, 'chat-account', { states: ['failed'] });

    const answer = await other.execute({
      type: 'resume',
      commandId: key(),
      payload: { chatId: 'chat-account', runId: 'run-account' },
    });

    expect(answer).toMatchObject({ status: 'refused', code: 'MODEL_ATTEMPT_OTHER_ACCOUNT' });
    await other.close();
  });

  /* The pause settled before the denial (TS-R10); the denial's `cancelled` row ends the settled pause, which is
   * `paused-reopenable` (W8.a2 round 3, coordinator ruling). */
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
      launcher = createNodeLauncher({
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

  /* T3 (W6.r1 round 3): a draining host refuses a new run with a retryable code, and serves every other verb. */
  it('should refuse a start with HOST_CLOSED while it is not admitting, and serve attach', async () => {
    let admitting = true;
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    launcher = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      admitting: () => admitting,
    });
    admitting = false;

    await expect(start(launcher, { chatId: 'chat-draining', runId: 'run-1' })).resolves.toMatchObject({
      status: 'refused',
      code: 'HOST_CLOSED',
    });
    await expect(attach(launcher, 'chat-draining')).resolves.toMatchObject({ takeover: false });
    admitting = true;
    await expect(start(launcher, { chatId: 'chat-draining', runId: 'run-1' })).resolves.toMatchObject({
      status: 'applied',
    });
  });

  /* W6.r2 A1: a start whose admission threw outright is no run to drain. */
  it('should leave no admitted run behind a start whose admission threw', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    launcher = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: stalledGateway({}),
      }),
    });
    hostSeams.commandFailure = new Error('The admission failed outright.');

    try {
      await expect(start(launcher, { chatId: 'chat-thrown', runId: 'run-thrown' })).rejects.toThrow(
        'The admission failed outright.',
      );
    } finally {
      hostSeams.commandFailure = undefined;
    }

    expect(await launcher.admittedRuns()).toEqual(new Map());
  });

  /* W6.r2 L1 (probe PL1): a start counted while `admittedRuns()` waits for the last ones is waited for too, so one
   * whose admission then fails is not returned. */
  it('should wait for a start counted while it waits, and leave it out once refused', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const gates = new Map<string, Promise<void>>();
    const entered = new Set<string>();
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        openWriter: async (chatId) => {
          entered.add(chatId);
          await gates.get(chatId);
          return base.openWriter(chatId);
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: stalledGateway({}),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
    });
    const chatB = Promise.withResolvers<void>();
    const chatC = Promise.withResolvers<void>();
    gates.set('chat-b', chatB.promise);
    gates.set('chat-c', chatC.promise);

    const startedB = start(launcher, { chatId: 'chat-b', runId: 'run-b' });
    await vi.waitFor(() => {
      expect(entered.has('chat-b')).toBe(true);
    });
    const runs = launcher.admittedRuns();
    const startedX = start(launcher, { chatId: 'chat-c', runId: 'run-x' });
    await vi.waitFor(() => {
      expect(entered.has('chat-c')).toBe(true);
    });
    chatB.resolve();
    await expect(startedB).resolves.toMatchObject({ status: 'applied' });
    /* A macrotask: a single wait over the first starts would have answered by now, with run-x still counted. */
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    chatC.reject(new Error('The chat store failed.'));

    await expect(startedX).resolves.toMatchObject({ status: 'refused', code: 'HOST_FAULT' });
    expect(await runs).toEqual(new Map([['chat-b', new Set(['run-b'])]]));
  });

  /* W6.r1 round 4 (T3): draining changes nothing the host already answers: a live chat is still `CHAT_RUN_LIVE`, which
   * its sender waits out, and a re-send of an applied start is still `replayed`. */
  it('should answer CHAT_RUN_LIVE and replays as ever while it is not admitting', async () => {
    let admitting = true;
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const gateway = stalledGateway({});
    launcher = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: gateway,
      }),
      admitting: () => admitting,
    });
    const first = {
      type: 'start',
      commandId: 'cmd-live',
      payload: {
        chatId: 'chat-live',
        runId: 'run-live',
        trigger: 'submit',
        message: { id: 'user-1', role: 'user', content: 'hello' },
      },
    } as const;
    const applied = await launcher.execute(first);
    expect(applied).toMatchObject({ status: 'applied', effect: 'durable' });
    /* The run is asking the model before the case ends, so the close aborts that request. */
    await vi.waitFor(() => {
      expect(gateway).toHaveBeenCalled();
    });
    admitting = false;

    await expect(launcher.execute(first)).resolves.toEqual({ ...applied, status: 'replayed' });
    await expect(
      start(launcher, {
        chatId: 'chat-live',
        runId: 'run-second',
        message: { id: 'user-2', role: 'user', content: 'again' },
      }),
    ).resolves.toMatchObject({ status: 'refused', code: 'CHAT_RUN_LIVE' });
    await expect(start(launcher, { chatId: 'chat-idle-drain', runId: 'run-1' })).resolves.toMatchObject({
      status: 'refused',
      code: 'HOST_CLOSED',
    });
  });

  /* W6.r1 round 4 (T3): a drain follows every run the launcher admitted, a start another tab forwarded through
   * leadership included; a refused one is not followed. */
  it('should count a start another tab forwarded among its admitted runs, and not a refused one', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    let forwarded: Parameters<typeof base.leadership>[0] | undefined;
    const gateway = stalledGateway({});
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        leadership: (host) => {
          forwarded = host;
          return base.leadership(host);
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: gateway,
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
    });
    const startOf = (runId: string, messageId: string) =>
      ({
        type: 'start',
        commandId: `cmd-${runId}`,
        payload: {
          chatId: 'chat-fwd',
          runId,
          trigger: 'submit',
          message: { id: messageId, role: 'user', content: 'hello' },
        },
      }) as const;

    /* As the binding runs another tab's `cmd` frame here. */
    await expect(forwarded!.execute(startOf('run-fwd', 'user-1'), 1)).resolves.toMatchObject({ status: 'applied' });
    await vi.waitFor(() => {
      expect(gateway).toHaveBeenCalled();
    });
    await expect(forwarded!.execute(startOf('run-refused', 'user-2'), 1)).resolves.toMatchObject({
      status: 'refused',
      code: 'CHAT_RUN_LIVE',
    });

    expect(await launcher.admittedRuns()).toEqual(new Map([['chat-fwd', new Set(['run-fwd'])]]));

    /* W6.r1 round 5: asked while a start is still being answered, it waits for the answer, so a refused one is never
     * among the runs a drain follows. */
    const refusing = forwarded!.execute(startOf('run-late', 'user-3'), 1);
    const runs = launcher.admittedRuns();
    await expect(refusing).resolves.toMatchObject({ status: 'refused', code: 'CHAT_RUN_LIVE' });
    expect(await runs).toEqual(new Map([['chat-fwd', new Set(['run-fwd'])]]));
  });

  /* W6.r1 round 4: a close that failed is let go, so the owner's next close tries again instead of re-reading it. */
  it('should close again after a close that failed', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    let failures = 1;
    let portCloses = 0;
    const closing = createAgentLauncher({
      chats: createChatStore({
        ...base,
        leadership: (host) => {
          const port = base.leadership(host);
          return {
            ...port,
            close: async () => {
              portCloses += 1;
              if (failures > 0) {
                failures -= 1;
                throw new Error('The leadership port could not close.');
              }
              await port.close();
            },
          };
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
    });

    await expect(closing.close()).rejects.toThrow('The leadership port could not close.');
    await expect(closing.close()).resolves.toBeUndefined();
    expect(portCloses).toBe(2);
  });

  /* The browser's two-chat row (RH-A1): a read that found no rows parks for the chat's writer. A writer that opened
   * while the read was still reading the bytes woke nobody, so the read waited past every row it appended. */
  it('should answer a read whose chat writer opened while it read the bytes', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const reading = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    let hold = true;
    const fetchImplementation = scriptedGateway();
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async (chatId) => {
          const bytes = await base.readBytes(chatId);
          if (hold) {
            hold = false;
            reading.resolve();
            await held.promise;
          }
          return bytes;
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: fetchImplementation,
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
    });
    const waiting = launcher.read({ chatId: 'chat-woken', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await reading.promise;
    await start(launcher, { chatId: 'chat-woken', runId: 'run-woken' });
    held.resolve();

    const parked = new Promise<'parked'>((resolve) => {
      setTimeout(() => {
        resolve('parked');
      }, 2000);
    });
    await expect(Promise.race([waiting, parked])).resolves.toMatchObject({ status: 'batch', chatId: 'chat-woken' });
  });

  it('reacquires nonwriter bytes after a writer opens and closes while an old read is held', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const { observeBytes: _observeBytes, ...unobserved } = base;
    const reading = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    let hold = true;
    const fetchImplementation = scriptedGateway();
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...unobserved,
        readBytes: async (chatId) => {
          const bytes = await base.readBytes(chatId);
          if (hold) {
            hold = false;
            reading.resolve();
            await held.promise;
          }
          return bytes;
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: fetchImplementation,
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
      delays: { idleEviction: 1000 },
      turnPlacement: fakePlacement({ registry: emptyTools }).port,
    });
    const waiting = launcher.read({ chatId: 'chat-woken', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await reading.promise;
    await start(launcher, { chatId: 'chat-woken', runId: 'run-woken' });
    await vi.waitFor(async () => {
      expect(await readFile(join(workspaceRoot, '.tau', 'chats', 'chat-woken', 'events.jsonl'), 'utf8')).toContain(
        '"state":"completed"',
      );
    });
    const lock = join(workspaceRoot, '.tau', 'chats', 'chat-woken', 'events.jsonl.lock');
    await vi.waitFor(
      async () => {
        await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
      },
      { timeout: 5000, interval: 25 },
    );
    const replacement = launcher.read({ chatId: 'chat-woken', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    held.resolve();

    const parked = new Promise<'parked'>((resolve) => {
      setTimeout(() => {
        resolve('parked');
      }, 2000);
    });
    const current = await Promise.race([replacement, parked]);
    expect(current).toMatchObject({ status: 'batch', chatId: 'chat-woken' });
    if (typeof current === 'string' || current.status !== 'batch') {
      throw new Error('The new nonwriter did not receive current authoritative rows.');
    }
    expect(current.events.length).toBeGreaterThan(0);
    await waiting;
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

    /* I4: the claim *records* the abandonment, never a resume: resuming re-asked the provider for a turn nobody
     * requested. `attach` is a read (RH-R1): it reports the driverless run and asks leadership to claim the chat. */
    expect(await attach(first, 'chat-interrupted')).toMatchObject({ takeover: true, snapshot: { state: 'running' } });
    const attached = await settle(first, 'chat-interrupted', { states: ['failed'] });
    expect(attached.snapshot).toMatchObject({
      runId: 'run-interrupted',
      state: 'failed',
      failure: { code: 'RUN_ABANDONED' },
    });

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
   * RH-R1 (RH-A18): observation writes nothing itself. The first verb that names a chat and finds a run no driver
   * here holds asks leadership to claim it; the claim, never the read, writes the abandonment (RH-R9). A viewer that
   * reads again asks nothing more.
   */
  it('should ask leadership to reconcile when the first read of a chat finds a run with no driver', async () => {
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
    expect(tailed).toMatchObject({ status: 'batch', endCursor: 3 });
    // The claim the read asked for abandons the run as its term's claiming append (I13).
    // Acquiring leadership replaces the source incarnation; the shared follower resets and refolds its writer.
    const recordedRows: unknown[] = [];
    for await (const page of followChat(async (input) => host.read(input), 'chat-viewer', {
      signal: AbortSignal.timeout(2000),
      until: (ledger) => ledger.runs['run-viewer']?.lifecycle === 'failed',
    })) {
      recordedRows.push(...page.events);
      if (
        page.events.some(
          (event) =>
            typeof event === 'object' &&
            event !== null &&
            'type' in event &&
            event.type === 'run.lifecycle' &&
            'state' in event &&
            event.state === 'failed',
        )
      ) {
        break;
      }
    }
    expect(
      recordedRows.map(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          'type' in event &&
          event.type === 'run.lifecycle' &&
          'state' in event &&
          event.state,
      ),
    ).toContain('failed');
    expect(await readFile(logPath, 'utf8')).not.toBe(seeded);
    // Exactly one recovery: the next attach observes a terminal run and takes nothing over.
    await expect(attach(host, 'chat-viewer')).resolves.toMatchObject({
      takeover: false,
      snapshot: { state: 'failed' },
    });
  });

  /* RH-R16, TS-R16 (RH-S11): the chats whose leases the placement holds are reconciled when the launcher opens and on
   * each `leaseHeld` fact, without any client reading them. */
  it('should reconcile the chats the placement holds at open and on a leaseHeld fact', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const seed = async (chatId: string): Promise<string> => {
      const base = {
        version: 1,
        leaderEpoch: 'c'.repeat(32),
        recordedAt: new Date().toISOString(),
        runId: `run-${chatId}`,
      };
      const directory = join(workspaceRoot, '.tau', 'chats', chatId);
      await mkdir(directory, { recursive: true });
      const logPath = join(directory, 'events.jsonl');
      await writeFile(
        logPath,
        [
          { ...base, sequence: 0, type: 'run.lifecycle', state: 'admitted' },
          { ...base, sequence: 1, type: 'run.lifecycle', state: 'running' },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
        'utf8',
      );
      return logPath;
    };
    const atOpen = await seed('chat-held');
    const onFact = await seed('chat-fact');
    const facts = new Set<(fact: TurnPlacementFact) => void>();
    const key = (chatId: string) => ({ chatId, turnId: 'user-1', runId: `run-${chatId}`, attempt: 1 });
    const turnPlacement: TurnPlacementPort = {
      admit: async ({ requestId }) => ({ requestId, status: 'refused', code: 'REVISIONS_UNAVAILABLE', message: 'No.' }),
      complete: async ({ requestId, key: completed }) => {
        for (const push of facts) {
          push({
            kind: 'settled',
            key: completed,
            row: {
              type: 'turn.failed',
              runId: completed.runId,
              chatId: completed.chatId,
              turnId: completed.turnId,
              attempt: completed.attempt,
              reason: 'The attempt was released.',
              code: 'TURN_RELEASED',
            },
          });
        }
        return { requestId, status: 'applied' };
      },
      abandon: async ({ requestId }) => ({ requestId, status: 'applied' }),
      acknowledge: async ({ requestId }) => ({ requestId, status: 'applied' }),
      reconcile: async ({ requestId, chatId }) => ({
        requestId,
        status: 'applied',
        held: [
          { key: key('chat-held'), checkoutId: 'live' },
          { key: key('chat-fact'), checkoutId: 'live' },
        ].filter((held) => (chatId === undefined ? held.key.chatId === 'chat-held' : held.key.chatId === chatId)),
      }),
      settlements: ({ signal }) => ({
        [Symbol.asyncIterator]: async function* placementFacts(): AsyncGenerator<TurnPlacementFact> {
          const queue: TurnPlacementFact[] = [];
          let wake = (): void => undefined;
          const push = (fact: TurnPlacementFact): void => {
            queue.push(fact);
            wake();
          };
          facts.add(push);
          signal.addEventListener('abort', () => {
            wake();
          });
          try {
            while (!signal.aborted) {
              const fact = queue.shift();
              if (fact !== undefined) {
                yield fact;
                continue;
              }
              const next = Promise.withResolvers<void>();
              wake = next.resolve;
              // oxlint-disable-next-line no-await-in-loop -- one wait per fact.
              await next.promise;
            }
          } finally {
            facts.delete(push);
          }
        },
      }),
    };
    launcher = createNodeLauncher({
      workspaceRoot,
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      fetch: scriptedGateway(),
      turnPlacement,
    });
    /* Abandoned, then settled as the run's current attempt: its intent row names no command (TS-Q5). */
    const abandoned = async (logPath: string): Promise<boolean> => {
      const log = await readFile(logPath, 'utf8');
      return log.includes('"state":"failed"') && log.includes('"type":"turn.failed"');
    };

    await vi.waitFor(async () => {
      expect(await abandoned(atOpen)).toBe(true);
    });
    expect(await abandoned(onFact)).toBe(false);

    for (const push of facts) {
      push({ kind: 'leaseHeld', key: key('chat-fact'), checkoutId: 'live' });
    }
    await vi.waitFor(async () => {
      expect(await abandoned(onFact)).toBe(true);
    });
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
    const host = createNodeLauncher({
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
