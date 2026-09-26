// Under ui:test:e2e, not agent-host:test:e2e: it drives apps/ui/app/workers/**, and packages may not depend on apps.
/**
 * The seam conformance rows (S3 C1–C5, the keys-off control, SC-S7, S4's any-heartbeat trace and W0.14) on the
 * browser leg: the real page client over its real worker transport, against this module's real worker session over a
 * real OPFS log. The "worker" is served in the page, so a case can
 * arm a fault at the one point it names: an owner that dies loses its channel and its session, and the next worker
 * opens a fresh session over the same log, so only the durable log can answer a re-send. The leader a follower
 * forwards to is another page's real dedicated worker (`leader()`), or one the row plays on the chat's lock and channel.
 *
 * The daemon leg's rows are `packages/agent-host/src/test/seam/seam.daemon.test.ts`; these are the same rows, with
 * the page's own bounds (keepalive 1 s, liveness 3.5 s, T9 E3/E4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPFSProvider } from '@taucad/filesystem/backend';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { AgentLogEvent, ChannelServerHandle } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { agentWireLimits, agentWireVersion } from '@taucad/agent-host/wire';
import type { CommandAnswer, CommandVerb, ReadAnswer } from '@taucad/agent-host/wire';
import { createBrowserAgentHostClient } from '#services/agent-host-client.js';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import { agentHostWorkerProtocolSchemas, parseAgentHostWorkerConnect } from '#workers/agent-host.contract.js';
import { agentHostAuthorityName, agentHostProtocolVersion } from '#workers/agent-host-leader.js';
import { handleAgentHostWorkerCall, listenAgentHostWorkerLiveEvents } from '#workers/agent-host.impl.js';

/** Which fault the owner suffers on its next `start`. */
type Fault = 'none' | 'die-before-effect' | 'die-after-effect' | 'hang' | 'slow';

/** The worker's keepalive and the page's liveness bound, as production sets them (T9 E3, E4). Milliseconds. */
const keepaliveInterval = 1000;
const livenessTimeout = 3500;

const chatId = 'chat-seam';

const forever = async (): Promise<never> =>
  new Promise<never>(() => {
    // A dead or hung owner answers nothing, ever.
  });

type SeamWorker = {
  readonly worker: Worker;
  /** Every `start` answer this owner gave, in order. */
  readonly answers: CommandAnswer[];
  /** The session the page opened on this worker. */
  sessionId(): string | undefined;
};

type Harness = {
  fault: Fault;
  /** The project, and so the chat's lock and channel, every worker of this harness shares. */
  readonly projectId: string;
  /** Workers the page booted, the first and every replacement. */
  readonly workers: SeamWorker[];
  /** `start` commands an owner's effect ran, across owners. */
  readonly effects: string[];
  readonly client: ReturnType<typeof createBrowserAgentHostClient>;
  /** A second page's client over a real dedicated worker on the same project: the leader a follower forwards to. */
  leader(): ReturnType<typeof createBrowserAgentHostClient>;
  rows(): Promise<readonly AgentLogEvent[]>;
};

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered.
    await dispose();
  }
});

const harness = async (): Promise<Harness> => {
  const fileSystemProvider = new OPFSProvider();
  await fileSystemProvider.initialize();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const providerBasePath = `agent-host-seam-${crypto.randomUUID()}`;
  const storageRoot = await navigator.storage.getDirectory();
  await storageRoot.getDirectoryHandle(providerBasePath, { create: true });
  const project = rootedProvider(fileSystemProvider, providerBasePath);
  /** A worker's session closes when it is terminated; the next one opens after it. */
  let succession: Promise<unknown> = Promise.resolve();

  const bootWorker = (): SeamWorker => {
    const answers: CommandAnswer[] = [];
    let errorListener: ((event: ErrorEvent) => void) | undefined;
    let server: ChannelServerHandle<AgentHostWorkerProtocol> | undefined;
    let sessionId: string | undefined;
    let hung = false;
    let dead = false;
    const terminate = (): void => {
      if (dead) {
        return;
      }
      dead = true;
      server?.dispose();
      const closing = sessionId;
      const previous = succession;
      succession = (async () => {
        await previous;
        if (closing !== undefined) {
          await handleAgentHostWorkerCall('close', undefined, { sessionId: closing });
        }
      })();
    };
    /** Death as the page sees it: the worker's `error` event; the page terminates it and boots the next. */
    const die = (): void => {
      errorListener?.({ message: 'The seam harness killed this worker.' } as ErrorEvent);
    };
    const worker = {
      postMessage: (value: unknown) => {
        const connection = parseAgentHostWorkerConnect(value);
        sessionId = connection.sessionId;
        const { port } = connection;
        const caller = (signal: AbortSignal) => ({ sessionId: connection.sessionId, signal });
        // A hung process sends nothing, not even keepalives.
        const silenceable = new Proxy(port, {
          get: (target, key) =>
            key === 'postMessage'
              ? (message: unknown, transfer?: Transferable[]) => {
                  if (!hung) {
                    target.postMessage(message, transfer ?? []);
                  }
                }
              : (Reflect.get(target, key, target) as unknown),
        });
        server = serveAgentWorkerChannel<AgentHostWorkerProtocol>(silenceable, {
          sessionKey: connection.sessionId,
          protocolSchemas: agentHostWorkerProtocolSchemas,
          hello: { wire: agentWireVersion, build: 'seam-build' },
          keepaliveInterval,
          impl: {
            // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
            call: async (_context, name, args, signal) => {
              if (name === 'capabilities') {
                throw new Error('The seam harness is past placement.');
              }
              if (name === 'initialize') {
                await succession;
              }
              if (name !== 'start') {
                const result = await handleAgentHostWorkerCall(name, args, caller(signal));
                return result as AgentHostWorkerProtocol['calls'][typeof name]['result'];
              }
              const { fault } = state;
              state.fault = 'none';
              if (fault === 'die-before-effect') {
                die();
                return forever();
              }
              if (fault === 'hang') {
                hung = true;
                return forever();
              }
              if (fault === 'slow') {
                await new Promise((resolve) => {
                  setTimeout(resolve, livenessTimeout * 1.5);
                });
              }
              state.effects.push((args as { readonly commandId: string }).commandId);
              const answer = (await handleAgentHostWorkerCall(name, args, caller(signal))) as CommandAnswer;
              answers.push(answer);
              if (fault === 'die-after-effect') {
                die();
                return forever();
              }
              return answer;
            },
            // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
            listen: (_context, _name, args, signal) => listenAgentHostWorkerLiveEvents(args.chatId, signal),
          },
        });
      },
      terminate,
      addEventListener: (_type: 'error', listener: (event: ErrorEvent) => void) => {
        errorListener = listener;
      },
      removeEventListener: () => {
        errorListener = undefined;
      },
    };
    const booted = { worker: worker as unknown as Worker, answers, sessionId: () => sessionId };
    state.workers.push(booted);
    return booted;
  };

  const clientOptions = {
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(project),
    projectStorage: { projectId: providerBasePath, backend: 'opfs', providerBasePath },
    durability: 'exclusive-append',
    authority: { projectId: providerBasePath, workspaceId: providerBasePath },
    gatewayBaseUrl: location.origin,
    systemPrompt: 'Seam fixture.',
    systemPromptBlocks: [
      { type: 'text', text: 'Seam fixture.' },
      { type: 'text', text: 'Dynamic fixture.' },
    ],
    model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    closeTimeout: 1000,
  } as const satisfies Parameters<typeof createBrowserAgentHostClient>[0];
  const state: Harness = {
    fault: 'none',
    projectId: providerBasePath,
    workers: [],
    effects: [],
    client: createBrowserAgentHostClient({ ...clientOptions, createWorker: () => bootWorker().worker }),
    leader: () => {
      const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
      const leader = createBrowserAgentHostClient({ ...clientOptions, createWorker: () => worker });
      disposers.push(async () => {
        await leader.close().catch(() => undefined);
        worker.terminate();
      });
      return leader;
    },
    rows: async () => {
      const log = await fileSystemProvider.readFile(`${providerBasePath}/.tau/chats/${chatId}/events.jsonl`, 'utf8');
      return log
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AgentLogEvent);
    },
  };
  disposers.push(async () => {
    try {
      await state.client.close();
    } catch {
      // A case that killed its worker may leave nothing to close gracefully.
    }
    for (const { worker } of state.workers) {
      worker.terminate();
    }
    await succession;
    fileSystemProvider.dispose();
  });
  return state;
};

/* eslint-disable @typescript-eslint/promise-function-async -- This test facade forwards provider promises unchanged. */
const rootedProvider = (source: FileSystemProvider, root: string): FileSystemProvider => {
  const resolve = (path: string): string => `${root}/${path.replace(/^\/+/, '')}`;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? source.readFile(resolve(path), encoding) : source.readFile(resolve(path));
  }
  return {
    id: `rooted:${source.id}`,
    capabilities: source.capabilities,
    readFile,
    writeFile: (path, data) => source.writeFile(resolve(path), data),
    appendFile: (path, data) => source.appendFile!(resolve(path), data),
    readdir: (path) => source.readdir(resolve(path)),
    stat: (path) => source.stat(resolve(path)),
    lstat: (path) => source.lstat(resolve(path)),
    mkdir: (path, options) => source.mkdir(resolve(path), options),
    unlink: (path) => source.unlink(resolve(path)),
    rmdir: (path) => source.rmdir(resolve(path)),
    rename: (from, to) => source.rename(resolve(from), resolve(to)),
    exists: (path) => source.exists(resolve(path)),
    dispose: () => undefined,
  };
};
/* eslint-enable @typescript-eslint/promise-function-async -- Restore the project default after the forwarding facade. */

const start = async (seam: Harness) =>
  seam.client.start({ chatId, runId: 'run-1', trigger: 'submit', message: 'hello' });

const admittedRows = (rows: readonly AgentLogEvent[]): readonly AgentLogEvent[] =>
  rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId === 'run-1');

/** A turn the scripted gateway model actually completed (the config's `/v1/llm` fixture), not a vacuous terminal. */
const completedTurn = {
  runId: 'run-1',
  state: 'completed',
  messages: expect.arrayContaining([
    expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: 'Worker ready.' }] }),
  ]) as unknown,
};

type StartFrame = {
  readonly type?: string;
  readonly senderId?: string;
  readonly targetGeneration?: string;
  readonly command?: { readonly type: string; readonly requestId: string; readonly commandId: string };
};

/** Every forwarded `start` frame on the chat's channel, whoever sent or answers it. */
const heardStarts = (projectId: string): StartFrame[] => {
  const channel = new BroadcastChannel(agentHostAuthorityName({ projectId, chatId }));
  const starts: StartFrame[] = [];
  channel.addEventListener('message', (event: MessageEvent<StartFrame>) => {
    if (event.data.type === 'command' && event.data.command?.type === 'start') {
      starts.push(event.data);
    }
  });
  disposers.push(() => {
    channel.close();
  });
  return starts;
};

/**
 * A leader this test plays on the chat's own lock and channel: it heartbeats as `generation` while `beating`, and
 * answers a forwarded command only when asked, so a row can hold a follower's wait open or let the leader die.
 */
const playLeader = async (projectId: string, generation: string) => {
  const name = agentHostAuthorityName({ projectId, chatId });
  const channel = new BroadcastChannel(name);
  const binding = { version: agentHostProtocolVersion, projectId, workspaceId: projectId, chatId };
  const starts: StartFrame[] = [];
  const heard = Promise.withResolvers<number>();
  channel.addEventListener('message', (event: MessageEvent<StartFrame>) => {
    if (event.data.type === 'command' && event.data.command?.type === 'start') {
      starts.push(event.data);
      heard.resolve(performance.now());
    }
  });
  const leased = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const lease = navigator.locks.request(name, { mode: 'exclusive' }, async () => {
    leased.resolve();
    await released.promise;
  });
  await leased.promise;
  const leader = {
    beating: true,
    starts,
    /** When the first forwarded `start` reached this leader, on the page's monotonic clock. */
    heard: heard.promise,
    /** Answer every `start` heard so far with a refusal, as a leader that ran nothing. */
    refuseAll(): void {
      for (const frame of starts) {
        channel.postMessage({
          ...binding,
          type: 'response',
          targetId: frame.senderId,
          generation,
          response: {
            type: 'answer',
            requestId: frame.command!.requestId,
            answer: {
              commandId: frame.command!.commandId,
              generation: 0,
              status: 'refused',
              effect: 'not-applied',
              code: 'RUN_ID_TAKEN',
              message: 'The seam leader ran nothing.',
            },
          },
        });
      }
    },
    /** Die: no more heartbeats, no answers, and the lock goes to whoever asks next. */
    async crash(): Promise<void> {
      leader.beating = false;
      globalThis.clearInterval(beat);
      released.resolve();
      await lease;
      channel.close();
    },
  };
  const beat = globalThis.setInterval(() => {
    if (leader.beating) {
      channel.postMessage({ ...binding, type: 'leader', senderId: `tab-${generation}`, generation });
    }
  }, 250);
  disposers.push(async () => leader.crash());
  return leader;
};

const within = async <Value>(promise: Promise<Value>, bound: number): Promise<Value | 'unanswered'> =>
  Promise.race([
    promise,
    new Promise<'unanswered'>((resolve) => {
      setTimeout(() => {
        resolve('unanswered');
      }, bound);
    }),
  ]);

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The session the page's current worker opened, for the rows the page client cannot send. */
const currentSession = (seam: Harness): string => {
  const sessionId = seam.workers.at(-1)?.sessionId();
  if (sessionId === undefined) {
    throw new Error('No worker session is open.');
  }
  return sessionId;
};

describe('the seam on the browser leg', () => {
  it('C1: should answer the re-send replayed, with one row, when the worker died after the append', async () => {
    const seam = await harness();
    seam.fault = 'die-after-effect';

    await expect(start(seam)).resolves.toMatchObject({ runId: 'run-1' });

    expect(seam.workers).toHaveLength(2);
    expect(seam.effects).toHaveLength(2);
    expect(new Set(seam.effects).size).toBe(1);
    expect(seam.workers[1]?.answers).toMatchObject([
      { commandId: seam.effects[0], status: 'replayed', effect: 'durable' },
    ]);
    const admitted = admittedRows(await seam.rows());
    expect(admitted).toHaveLength(1);
    expect(admitted[0]).toMatchObject({ commandId: seam.effects[0] });
  });

  it('C2: should apply the re-send once when the worker died before the append', async () => {
    const seam = await harness();
    seam.fault = 'die-before-effect';

    await expect(start(seam)).resolves.toMatchObject(completedTurn);

    expect(seam.workers).toHaveLength(2);
    expect(seam.workers[1]?.answers).toMatchObject([{ status: 'applied', effect: 'durable' }]);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C3: should see a hung worker as silence within the bound, and apply the re-send on the next', async () => {
    const seam = await harness();
    seam.fault = 'hang';
    const began = performance.now();

    await expect(start(seam)).resolves.toMatchObject(completedTurn);

    expect(seam.workers).toHaveLength(2);
    expect(performance.now() - began).toBeGreaterThanOrEqual(livenessTimeout);
    expect(performance.now() - began).toBeLessThan(livenessTimeout * 4);
    expect(seam.workers[1]?.answers).toMatchObject([{ status: 'applied', effect: 'durable' }]);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C4: should keep waiting on a slow worker whose keepalives flow, with no re-send', async () => {
    const seam = await harness();
    seam.fault = 'slow';

    await expect(start(seam)).resolves.toMatchObject(completedTurn);

    expect(seam.workers).toHaveLength(1);
    expect(seam.effects).toHaveLength(1);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C5: should refuse an unreadable command, a cursor ahead and a wrong identity; page one row at 1 byte', async () => {
    const seam = await harness();
    await start(seam);
    const rows = await seam.rows();
    const sessionId = currentSession(seam);
    const call = async (name: CommandVerb | 'read', args: unknown): Promise<unknown> =>
      handleAgentHostWorkerCall(name, args, { sessionId, signal: AbortSignal.abort() });

    await expect(
      call('start', { commandId: 'req_seam-bad', payload: { chatId, runId: 'run-2', mode: 'direct' } }),
    ).resolves.toMatchObject({ status: 'refused', effect: 'not-applied', code: 'COMMAND_UNREADABLE' });

    const read = async (input: Readonly<Record<string, unknown>>): Promise<ReadAnswer> =>
      (await call('read', {
        chatId,
        limit: agentWireLimits.batchRows,
        maxBytes: agentWireLimits.batchBytes,
        ...input,
      })) as ReadAnswer;
    await expect(read({ cursor: rows.length + 5 })).resolves.toEqual({
      status: 'refused',
      chatId,
      reason: 'cursor-ahead',
      expected: { endCursor: rows.length },
    });
    await expect(read({ cursor: 1, last: { leaderEpoch: 'not-this-term', sequence: 0 } })).resolves.toMatchObject({
      status: 'refused',
      reason: 'identity-mismatch',
    });

    const paged: unknown[] = [];
    for (let cursor = 0; cursor < rows.length; ) {
      // oxlint-disable-next-line no-await-in-loop -- each page starts at the last one's end.
      const page = await read({ cursor, maxBytes: 1 });
      expect(page).toMatchObject({ status: 'batch', cursor, nextCursor: cursor + 1 });
      if (page.status !== 'batch') {
        throw new Error('Expected a batch.');
      }
      paged.push(...page.events);
      cursor = page.nextCursor;
    }
    expect(paged).toEqual(rows);
  });

  it('control: should refuse the same run under a fresh key, not replay it (keys off)', async () => {
    const seam = await harness();
    await start(seam);

    const again = await handleAgentHostWorkerCall(
      'start',
      {
        commandId: 'req_seam-second',
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-2', role: 'user', content: 'hi' } },
      },
      { sessionId: currentSession(seam) },
    );

    expect(again).not.toMatchObject({ status: 'replayed' });
    expect(again).toMatchObject({ status: 'refused', code: 'RUN_ID_TAKEN' });
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('SC-S7: should forward a keyed command to the leader, and answer its re-send through a follower replayed', async () => {
    const seam = await harness();
    const starts = heardStarts(seam.projectId);
    // A second page's real worker takes the chat's lock, so every worker this page boots follows it.
    await seam.leader().attach({ chatId, cursor: 0 });
    seam.fault = 'die-after-effect';

    await expect(start(seam)).resolves.toMatchObject(completedTurn);

    expect(seam.workers).toHaveLength(2);
    expect(new Set(seam.effects).size).toBe(1);
    expect(seam.workers[1]?.answers).toMatchObject([{ commandId: seam.effects[0], status: 'replayed' }]);
    // Both sends were forwarded, from two follower sessions, under the one key.
    expect(starts.map((frame) => frame.command?.commandId)).toEqual([seam.effects[0], seam.effects[0]]);
    expect(new Set(starts.map((frame) => frame.senderId)).size).toBe(2);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  /* S4 3.5, `LogLeadership.target-any-heartbeat-EveryCommandAnswered` (W0.14): the leader a command addressed dies
   * unanswered and a successor heartbeats. Only the addressed generation's heartbeat is liveness, so the follower
   * re-sends within the bound and the successor applies it once; any generation's kept the wait alive forever. */
  it('S4: should re-send to the successor once the addressed leader dies, not wait on its heartbeat', async () => {
    const seam = await harness();
    const starts = heardStarts(seam.projectId);
    const successor = seam.leader();
    await successor.attach({ chatId: 'chat-warm', cursor: 0 });
    const addressed = await playLeader(seam.projectId, 'generation-addressed');

    const started = start(seam);
    await addressed.heard;
    // Alive past the follower's first liveness check, so its wait is bound to this generation.
    await sleep(livenessTimeout + 1000);
    await addressed.crash();
    await successor.attach({ chatId, cursor: 0 });

    await expect(within(started, livenessTimeout * 3)).resolves.toMatchObject(completedTurn);
    expect(addressed.starts).toHaveLength(1);
    expect(starts).toHaveLength(2);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  }, 30_000);

  /* W0.14, L4 D-111: liveness reads the monotonic clock. A wall clock stepped +10 s between two heartbeats of a live
   * leader ended the follower's wait, and it re-sent a command the leader was still holding. */
  it('W0.14: should neither end nor re-send a forwarded wait when the wall clock steps 10 s', async () => {
    const seam = await harness();
    const realNow = Date.now.bind(Date);
    let step = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + step);
    const leader = await playLeader(seam.projectId, 'generation-live');

    try {
      const started = expect(start(seam)).rejects.toMatchObject({ code: 'RUN_ID_TAKEN' });
      const heardAt = await leader.heard;
      await sleep(heardAt + 2900 - performance.now());
      // A heartbeat gap well inside the bound, with the step in it and the follower's first check after it.
      leader.beating = false;
      await sleep(100);
      step = 10_000;
      await sleep(1200);
      leader.beating = true;
      await sleep(heardAt + livenessTimeout * 2 - performance.now());
      leader.refuseAll();

      await started;
      expect(leader.starts).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  }, 30_000);
});
