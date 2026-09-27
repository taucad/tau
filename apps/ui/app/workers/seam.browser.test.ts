// Under ui:test:e2e, not agent-host:test:e2e: it drives apps/ui/app/workers/**, and packages may not depend on apps.
/**
 * The seam conformance rows (S3 C1–C5, the keys-off control, SC-S7, S4's any-heartbeat trace and W0.14) on the
 * browser leg: the real page client over its real resident-worker transport (RH-S8), against this module's real
 * project host over a real OPFS log. The "worker" is served in the page, so a case can arm a fault at the one point it
 * names: an owner that dies goes silent, the page replaces it past its liveness bound (RH-R14), and the next worker
 * opens a fresh project host over the same log, so only the durable log can answer a re-send. The leader a follower
 * forwards to is a project host in this page running a held run (`leader()`: a chat is led only while it needs a
 * writer, RH-R8), or one the row plays on the chat's lock and channel with M2's frames (RH-R7).
 *
 * The daemon leg's rows are `packages/agent-host/src/test/seam/seam.daemon.test.ts`; these are the same rows, with
 * the page's own bounds (keepalive 1 s, liveness 3.5 s, T9 E3/E4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPFSProvider } from '@taucad/filesystem/backend';
import type { AgentLogEvent, ChannelServerHandle } from '@taucad/agent-host';
import { createAgentChannelClient, serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { agentWireLimits, agentWireVersion } from '@taucad/agent-host/wire';
import type { CommandAnswer, ReadAnswer } from '@taucad/agent-host/wire';
import {
  AgentHostWorkerError,
  createBrowserAgentHostClient,
  resendWhileSettling,
} from '#services/agent-host-client.js';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import {
  agentHostWorkerBuild,
  agentHostWorkerProtocolSchemas,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import type { BrowserProjectHost } from '#workers/agent-host.impl.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';
import { livePlacementPort } from '#workers/test/agent-host-resident.fixture.js';

/** Which fault the owner suffers on its next `start`. */
type Fault = 'none' | 'die-before-effect' | 'die-after-effect' | 'hang' | 'slow';

/** The worker's keepalive and the page's liveness bound, as production sets them (T9 E3, E4). Milliseconds. */
const keepaliveInterval = 1000;
const livenessTimeout = 3500;

const chatId = 'chat-seam';

/** The chat's cross-tab names, as `chatLeadershipNames` derives them (RH-R6). */
const namesOf = (projectId: string) => {
  const key = [projectId, chatId].map((part) => encodeURIComponent(part)).join(':');
  return { lock: `agent-host-log:${key}`, channel: `agent-host:${key}` };
};

/** One rpc frame as it crosses a `MessagePort` (`@taucad/rpc` wire v1). */
type WireFrame = Readonly<{ k?: string; i?: string; n?: string; a?: { commandId?: string }; d?: unknown }>;

type SeamWorker = {
  readonly worker: Worker;
  /** Every `start` answer this owner gave, in order. */
  readonly answers: CommandAnswer[];
  /** The project host this worker opened. */
  host(): BrowserProjectHost | undefined;
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
  /** Another tab's project host on the same project, leading the chat while its run `run-0` waits on the model. */
  leader(): Promise<void>;
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
  /** A worker's project host closes when it is terminated; the next one opens after it. */
  let succession: Promise<unknown> = Promise.resolve();

  const bootWorker = (): SeamWorker => {
    const answers: CommandAnswer[] = [];
    let server: ChannelServerHandle<AgentHostWorkerProtocol> | undefined;
    let host: BrowserProjectHost | undefined;
    let tabId: string = crypto.randomUUID();
    /** A dead or hung process sends nothing, not even keepalives, and hears nothing. */
    let silent = false;
    let dead = false;
    /** Rpc ids of `start` calls whose answer this owner dies before sending. */
    const dieBeforeAnswering = new Set<string>();
    const terminate = (): void => {
      if (dead) {
        return;
      }
      dead = true;
      silent = true;
      server?.dispose();
      const closing = host;
      const previous = succession;
      /* A terminated worker's locks are released with it: its host closes before the next one opens. */
      succession = (async () => {
        await previous;
        await closing?.close().catch(() => undefined);
      })();
    };
    /** Relay one stream between the page and the host, arming the fault on the first `start`. */
    const relay = (page: MessagePort): MessagePort => {
      const { port1: inner, port2: served } = new MessageChannel();
      page.addEventListener('message', ({ data }: MessageEvent<WireFrame>) => {
        if (silent) {
          return;
        }
        if (data.k !== 'rq' || (data.n !== 'start' && data.n !== 'cancel')) {
          inner.postMessage(data);
          return;
        }
        const { fault } = state;
        state.fault = 'none';
        if (fault === 'die-before-effect' || fault === 'hang') {
          silent = true;
          return;
        }
        state.effects.push(data.a?.commandId ?? '');
        if (fault === 'die-after-effect' && data.i !== undefined) {
          dieBeforeAnswering.add(data.i);
        }
        if (fault === 'slow') {
          setTimeout(() => {
            inner.postMessage(data);
          }, livenessTimeout * 1.5);
          return;
        }
        inner.postMessage(data);
      });
      inner.addEventListener('message', ({ data }: MessageEvent<WireFrame>) => {
        if (silent) {
          return;
        }
        if (data.k === 'rs' && data.i !== undefined && state.effects.length > 0) {
          const answer = (data as { d?: CommandAnswer }).d;
          if (answer?.commandId !== undefined && state.effects.includes(answer.commandId)) {
            answers.push(answer);
          }
          if (dieBeforeAnswering.has(data.i)) {
            silent = true;
            return;
          }
        }
        page.postMessage(data);
      });
      page.start();
      inner.start();
      return served;
    };
    const worker = {
      postMessage: (value: unknown) => {
        const connection = parseAgentHostWorkerConnect(value);
        const { port } = connection;
        /* A native port's methods and accessors need the port itself as `this`, never the proxy. */
        const silenceable = new Proxy(port, {
          get: (target, key) => {
            if (key === 'postMessage') {
              return (message: unknown, transfer?: Transferable[]) => {
                if (!silent) {
                  target.postMessage(message, transfer ?? []);
                }
              };
            }
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
          set: (target, key, value) => Reflect.set(target, key, value, target),
        });
        server = serveAgentWorkerChannel<AgentHostWorkerProtocol>(silenceable, {
          sessionKey: connection.sessionId,
          protocolSchemas: agentHostWorkerProtocolSchemas,
          hello: { wire: agentWireVersion, build: agentHostWorkerBuild },
          keepaliveInterval,
          impl: {
            // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
            call: async (_context, name, args) => {
              switch (name) {
                case 'init': {
                  ({ tabId } = args as AgentHostWorkerProtocol['calls']['init']['args']);
                  return undefined;
                }
                case 'provide': {
                  await succession;
                  const provide = args as AgentHostWorkerProtocol['calls']['provide']['args'];
                  const previous = host;
                  host = await openBrowserProjectHost(provide, {
                    tabId,
                    visibility: { visible: () => true, subscribe: () => () => undefined },
                  });
                  await previous?.close();
                  return previous === undefined ? {} : { replaced: previous.hostId };
                }
                case 'connect': {
                  const { hostId, port: stream } = args as AgentHostWorkerProtocol['calls']['connect']['args'];
                  const status: AgentHostWorkerProtocol['calls']['connect']['result']['status'] =
                    host?.hostId === hostId ? 'connected' : 'needs';
                  if (host === undefined || status === 'needs') {
                    stream.close();
                  } else {
                    host.connect(relay(stream));
                  }
                  return { status } satisfies AgentHostWorkerProtocol['calls']['connect']['result'];
                }
                case 'visibility': {
                  return undefined;
                }
                default: {
                  throw new Error(`The seam harness does not serve ${String(name)}.`);
                }
              }
            },
            listen: () => {
              throw new Error('The control channel has no streams.');
            },
          },
        });
      },
      terminate,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const booted = { worker: worker as unknown as Worker, answers, host: () => host };
    state.workers.push(booted);
    return booted;
  };

  const clientOptions = {
    openFileSystemBridge: () => createFileSystemBridgePort(fileSystemProvider),
    openProjectRootBridge: () => createFileSystemBridgePort(project),
    openPlacementPort: () => livePlacementPort(project, providerBasePath, createFileSystemBridgePort),
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
  } as const satisfies Parameters<typeof createBrowserAgentHostClient>[0];
  const state: Harness = {
    fault: 'none',
    projectId: providerBasePath,
    workers: [],
    effects: [],
    client: createBrowserAgentHostClient({ ...clientOptions, createWorker: () => bootWorker().worker }),
    leader: async () => {
      holdModel();
      const host = await openBrowserProjectHost(
        {
          ...clientOptions,
          projectId: providerBasePath,
          hostId: `leader-${crypto.randomUUID()}`,
          fileSystemPort: createFileSystemBridgePort(fileSystemProvider).port,
          projectRootPort: createFileSystemBridgePort(project).port,
          placementPort: livePlacementPort(project, providerBasePath, createFileSystemBridgePort),
          computeMode: 'off',
        },
        {
          tabId: `tab-leader-${crypto.randomUUID()}`,
          visibility: { visible: () => true, subscribe: () => () => undefined },
        },
      );
      const client = createAgentChannelClient({
        connect: () => {
          const { port1, port2 } = new MessageChannel();
          host.connect(port1);
          return port2;
        },
      });
      disposers.push(async () => {
        client.close();
        await host.close();
      });
      await client.execute({
        type: 'start',
        commandId: 'req_seam-leader',
        payload: { chatId, runId: 'run-0', trigger: 'submit', message: { id: 'user-0', role: 'user', content: 'hi' } },
      } as Parameters<AgentChannelClient['execute']>[0]);
      /* The start answers once the run is admitted; it is running only once that row follows (W6.r1 round 4). */
      await vi.waitFor(
        async () => {
          const rows = await state.rows();
          expect(
            rows.some((row) => row.type === 'run.lifecycle' && row.state === 'running' && row.runId === 'run-0'),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 25 },
      );
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

const start = async (seam: Harness) =>
  seam.client.start({ chatId, runId: 'run-1', trigger: 'submit', message: 'hello' });

const admittedRows = (rows: readonly AgentLogEvent[]): readonly AgentLogEvent[] =>
  rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId === 'run-1');

/** The chat's rows once run-1's settlement row, which the host appends after the terminal one, is durable (W8 TS-S6). */
const settledRows = async (seam: Harness): Promise<readonly AgentLogEvent[]> => {
  let rows: readonly AgentLogEvent[] = [];
  await vi.waitFor(
    async () => {
      rows = await seam.rows();
      expect(rows.some((row) => row.type === 'turn.finalized' && row.runId === 'run-1')).toBe(true);
    },
    { timeout: 10_000, interval: 50 },
  );
  return rows;
};

/** A turn the scripted gateway model actually completed (the config's `/v1/llm` fixture), not a vacuous terminal. */
const completedTurn = {
  runId: 'run-1',
  state: 'completed',
  messages: expect.arrayContaining([
    expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: 'Worker ready.' }] }),
  ]) as unknown,
};

/**
 * Hold every gateway model call until its signal aborts, as a real `fetch` does, so a run stays `running` until it is
 * cancelled. The page's own fetch is restored when the row ends.
 */
const holdModel = (): void => {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('/v1/llm/')) {
      return realFetch(input, init);
    }
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    signal?.throwIfAborted();
    const aborted = Promise.withResolvers<never>();
    signal?.addEventListener(
      'abort',
      () => {
        aborted.reject(signal.reason);
      },
      { once: true },
    );
    return aborted.promise;
  };
  disposers.push(() => {
    globalThis.fetch = realFetch;
  });
};

/** One forwarded command on the chat's channel (M2's `cmd`, RH-R7). */
type StartFrame = Readonly<{
  kind?: string;
  sender?: string;
  epoch?: number;
  body?: Readonly<{ corr?: string; commandId?: string; type?: string }>;
}>;

/** Every forwarded command of one verb on the chat's channel, whoever sent or answers it. */
const heardStarts = (projectId: string, type = 'start'): StartFrame[] => {
  const channel = new BroadcastChannel(namesOf(projectId).channel);
  const starts: StartFrame[] = [];
  channel.addEventListener('message', (event: MessageEvent<StartFrame>) => {
    if (event.data.kind === 'cmd' && event.data.body?.type === type) {
      starts.push(event.data);
    }
  });
  disposers.push(() => {
    channel.close();
  });
  return starts;
};

/**
 * A leader this test plays on the chat's own lock and channel: it heartbeats at `epoch` while `beating`, and answers a
 * forwarded command only when asked, so a row can hold a follower's wait open or let the leader die.
 */
/* Epoch 0: a played leader writes no term row, so a real successor claims epoch 1 from the empty log and is heard
 * above the follower's floor once epoch 0 falls silent. */
const playLeader = async (projectId: string, epoch: number) => {
  const names = namesOf(projectId);
  const channel = new BroadcastChannel(names.channel);
  const sender = `tab-${String(epoch)}`;
  const frame = (kind: string, body: unknown) => ({
    wire: agentWireVersion,
    build: agentHostWorkerBuild,
    kind,
    chatId,
    sender,
    epoch,
    body,
  });
  const starts: StartFrame[] = [];
  const heard = Promise.withResolvers<number>();
  channel.addEventListener('message', (event: MessageEvent<StartFrame>) => {
    if (event.data.kind === 'cmd' && event.data.body?.type === 'start' && event.data.epoch === epoch) {
      starts.push(event.data);
      heard.resolve(performance.now());
    }
  });
  const leased = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const lease = navigator.locks.request(names.lock, { mode: 'exclusive' }, async () => {
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
      for (const start of starts) {
        channel.postMessage(
          frame('ans', {
            to: start.sender,
            corr: start.body?.corr,
            answer: {
              commandId: start.body?.commandId,
              generation: epoch,
              status: 'refused',
              effect: 'not-applied',
              code: 'RUN_ID_TAKEN',
              message: 'The seam leader ran nothing.',
            },
          }),
        );
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
      channel.postMessage(frame('hb', { state: 'leading' }));
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

/** A stream straight to the page's current worker's project host, for the rows the page client cannot send. */
const currentClient = (seam: Harness): AgentChannelClient => {
  const host = seam.workers.at(-1)?.host();
  if (host === undefined) {
    throw new Error('No project host is open.');
  }
  const client = createAgentChannelClient({
    connect: () => {
      const { port1, port2 } = new MessageChannel();
      host.connect(port1);
      return port2;
    },
  });
  disposers.push(() => {
    client.close();
  });
  return client;
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
    const rows = await settledRows(seam);
    const client = currentClient(seam);

    await expect(
      client.execute({
        type: 'start',
        commandId: 'req_seam-bad',
        payload: { chatId, runId: 'run-2', mode: 'direct' },
      } as unknown as Parameters<AgentChannelClient['execute']>[0]),
    ).resolves.toMatchObject({ status: 'refused', effect: 'not-applied', code: 'COMMAND_UNREADABLE' });

    const read = async (input: Readonly<Record<string, unknown>>): Promise<ReadAnswer> =>
      client.read({
        chatId,
        cursor: 0,
        limit: agentWireLimits.batchRows,
        maxBytes: agentWireLimits.batchBytes,
        ...input,
      } as Parameters<AgentChannelClient['read']>[0]);
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
    await settledRows(seam);

    /* The settled attempt is acknowledged after its row; a start in between is refused `CHAT_RUN_LIVE{settling}`, which
     * the page re-sends with the product's own policy (W8.r1 item 6). */
    const second = async (): Promise<CommandAnswer> => {
      const answer = await currentClient(seam).execute({
        type: 'start',
        commandId: 'req_seam-second',
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-2', role: 'user', content: 'hi' } },
      } as Parameters<AgentChannelClient['execute']>[0]);
      if (answer.status === 'refused') {
        throw new AgentHostWorkerError(answer.code, answer.message, answer.details);
      }
      return answer;
    };
    const again: unknown = await resendWhileSettling(second).catch((error: unknown) => error);

    expect(again).not.toMatchObject({ status: 'replayed' });
    expect(again).toMatchObject({ name: 'AgentHostWorkerError', code: 'RUN_ID_TAKEN' });
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  /* A chat is led only while its run needs a writer (RH-R8), and a leader with a live run refuses a second `start`, so
   * the keyed command a follower forwards here is the leader's run's `cancel`. */
  it('SC-S7: should forward a keyed command to the leader, and answer its re-send replayed', async () => {
    const seam = await harness();
    const cancels = heardStarts(seam.projectId, 'cancel');
    await seam.leader();
    await expect(seam.client.attach({ chatId, cursor: 0 })).resolves.toMatchObject({
      snapshot: { runId: 'run-0', state: 'running' },
    });
    seam.fault = 'die-after-effect';

    await expect(seam.client.cancel('run-0')).resolves.toMatchObject({ runId: 'run-0', state: 'cancelled' });

    expect(seam.workers).toHaveLength(2);
    expect(new Set(seam.effects).size).toBe(1);
    expect(seam.workers[1]?.answers).toMatchObject([{ commandId: seam.effects[0], status: 'replayed' }]);
    // The first send was forwarded to the leader, which ran it; the log holds one cancel.
    expect(cancels[0]?.body?.commandId).toBe(seam.effects[0]);
    const rows = await seam.rows();
    expect(rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'cancelled')).toHaveLength(1);
  });

  /* S4 3.5, `LogLeadership.target-any-heartbeat-EveryCommandAnswered` (W0.14): the leader a command addressed dies
   * unanswered and a successor heartbeats. Only the addressed generation's heartbeat is liveness, so the follower
   * re-sends within the bound and the successor applies it once; any generation's kept the wait alive forever. */
  it('S4: should re-send to the successor once the addressed leader dies, not wait on its heartbeat', async () => {
    const seam = await harness();
    const starts = heardStarts(seam.projectId);
    const addressed = await playLeader(seam.projectId, 0);

    const started = expect(start(seam)).rejects.toMatchObject({ code: 'RUN_ID_TAKEN' });
    await addressed.heard;
    // Alive past the follower's first liveness check, so its wait is bound to this generation.
    await sleep(livenessTimeout + 1000);
    await addressed.crash();
    /* The successor takes the freed lock and heartbeats a newer epoch; `attach` alone leads nothing (RH-R1). */
    const successor = await playLeader(seam.projectId, 1);

    await expect(within(successor.heard, livenessTimeout * 3)).resolves.not.toBe('unanswered');
    successor.refuseAll();
    await started;
    expect(addressed.starts).toHaveLength(1);
    expect(successor.starts).toHaveLength(1);
    expect(starts).toHaveLength(2);
  }, 30_000);

  /* W0.14, L4 D-111: liveness reads the monotonic clock. A wall clock stepped +10 s between two heartbeats of a live
   * leader ended the follower's wait, and it re-sent a command the leader was still holding. */
  it('W0.14: should neither end nor re-send a forwarded wait when the wall clock steps 10 s', async () => {
    const seam = await harness();
    const realNow = Date.now.bind(Date);
    let step = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + step);
    const leader = await playLeader(seam.projectId, 0);

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
