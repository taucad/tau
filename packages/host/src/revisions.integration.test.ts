/**
 * Launcher 1's turn boundary, over a real workspace directory and a scripted
 * gateway: the base is captured before the turn is admitted, and one finalized
 * revision lands when its durable lifecycle marker turns terminal (V17, N26).
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentLogEvent, ToolRegistry } from '@taucad/agent-host';
import {
  createBrowserRevisionPort,
  mainRevisionBranch,
  TurnRevisionRecorder,
  turnRevisionBranch,
} from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { RevisionPort } from '@taucad/revisions';

import { createHostToolRegistry } from '#agent-tools.js';
import { hostRevisionModes, withTurnRevisions } from '#revisions.js';
import type { TurnCheckout, TurnRevisionOutcome } from '#revisions.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;

const sse = (chunks: readonly string[]): Response =>
  new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-revisions-1' } },
  );

/** One `write_probe` call, then the closing assistant text. */
const scriptedTurn: ReadonlyArray<readonly string[]> = [
  [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"write_probe","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ],
  ['data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n'],
];

const terminal = new Set(['completed', 'failed', 'cancelled']);
const roots: string[] = [];
const launchers: NodeAgentLauncher[] = [];

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Harness = {
  readonly launcher: NodeAgentLauncher;
  readonly workspaceRoot: string;
  readonly settled: Promise<TurnRevisionOutcome>;
  /** The settlement of one run by id, for a harness that runs more than one turn. */
  readonly settledFor: (runId: string) => Promise<TurnRevisionOutcome>;
};

/**
 * One launcher over a temp workspace whose only tool writes `main.ts`.
 *
 * The write goes through the tool, not the test, so the ordering the recorder
 * has to get right — base captured before the agent writes — is the ordering
 * the product actually produces.
 *
 * @returns The launcher, its root, and the settlement its first turn reports.
 */
const harness = async (
  options: { readonly duringTurn?: (workspaceRoot: string) => Promise<void> } = {},
): Promise<Harness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-'));
  roots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
  const toolRegistry: ToolRegistry = {
    list: () => [
      { name: 'write_probe', description: 'Write the probe file.', inputSchema: { type: 'object', properties: {} } },
    ],
    invoke: async () => {
      await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 2;\n');
      return { content: 'written', isError: false };
    },
  };
  let responses = 0;
  const settlement = Promise.withResolvers<TurnRevisionOutcome>();
  const perRun = new Map<string, PromiseWithResolvers<TurnRevisionOutcome>>();
  const settledFor = async (runId: string): Promise<TurnRevisionOutcome> => {
    const pending = perRun.get(runId) ?? Promise.withResolvers<TurnRevisionOutcome>();
    perRun.set(runId, pending);
    return pending.promise;
  };
  const launcher = withTurnRevisions(
    createNodeAgentLauncher({
      workspaceRoot,
      gatewayBaseUrl: 'https://gateway.example',
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry,
      auth: () => 'daemon-bearer',
      fetch: (async () => {
        const turn = responses++;
        /* The gateway's second request is mid-turn by construction: the base is
         * captured and the tool has returned, and nothing has settled yet. */
        if (turn > 0) {
          await options.duringTurn?.(workspaceRoot);
        }
        return sse(scriptedTurn[turn] ?? scriptedTurn[1]!);
      }) as unknown as typeof globalThis.fetch,
    }),
    {
      workspaceRoot,
      onSettled: (outcome) => {
        settlement.resolve(outcome);
        const pending = perRun.get(outcome.runId) ?? Promise.withResolvers<TurnRevisionOutcome>();
        perRun.set(outcome.runId, pending);
        pending.resolve(outcome);
      },
    },
  );
  launchers.push(launcher);
  return { launcher, workspaceRoot, settled: settlement.promise, settledFor };
};

/**
 * Admit one Tau turn the way a client does.
 *
 * @param launcher - The recording launcher.
 * @param turn - The chat, the client's idempotency key for the run, and the
 *   revision placement (`direct` when omitted).
 */
const startTurn = async (
  launcher: NodeAgentLauncher,
  turn: { readonly chatId: string; readonly runId: string; readonly mode?: 'candidate' | 'direct' },
): Promise<void> => {
  const { chatId, runId, mode } = turn;
  await launcher.execute({
    type: 'start',
    trigger: 'submit',
    chatId,
    runId,
    ...(mode === undefined ? {} : { mode }),
    message: { id: `message-${runId}`, role: 'user', content: 'Double the size.' },
    config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
  });
};

describe('withTurnRevisions', () => {
  it('records one finalized revision per turn, with the turn base as its parent', async () => {
    const { launcher, workspaceRoot, settled } = await harness();

    await startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' });

    await expect(settled).resolves.toEqual({
      chatId: 'chat-1',
      runId: 'run-1',
      status: 'recorded',
      changedPaths: ['main.ts'],
    });

    /* Read back through a *second* recorder over the same root, not the one
       that wrote: the store is on disk under `.tau/revisions`, and
       what matters is that the next process — a restarted daemon, or R-W4's
       candidate porcelain — reopens this turn's graph. */
    const reopened = new TurnRevisionRecorder({ filesystem: new NodeFsProvider(workspaceRoot) });
    await reopened.revisions.ready;
    /* A direct turn records onto the branch the live tree tracks — `main`,
       created by this very turn (operator decisions 2026-09-09, question 11). */
    const head = reopened.revisions.getBranchHead(mainRevisionBranch);
    expect(head).toBeDefined();
    const revision = reopened.revisions.getRevision(head!);
    expect(revision?.parents).toHaveLength(1);
    expect(revision?.provenance).toMatchObject({ source: 'agent', runId: 'run-1' });

    /* The base is the tree as it stood *before* the turn: capturing it after
       admission would fold the agent's own write into its own parent. */
    const base = reopened.revisions.getRevision(revision!.parents[0]!);
    expect(new TextDecoder().decode(base!.tree.get('main.ts'))).toBe('export const size = 1;\n');
    expect(new TextDecoder().decode(revision!.tree.get('main.ts'))).toBe('export const size = 2;\n');

    /* Direct mode: the live tree is the agent tree, and it keeps the write. */
    expect(await readFile(join(workspaceRoot, 'main.ts'), 'utf8')).toBe('export const size = 2;\n');
  });

  it('parents a second chat’s first candidate base on the trunk, so the two share a merge base', async () => {
    const { launcher, workspaceRoot, settledFor } = await harness();

    await startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' });
    await expect(settledFor('run-1')).resolves.toMatchObject({ status: 'recorded' });
    await startTurn(launcher, { chatId: 'chat-2', runId: 'run-2', mode: 'candidate' });
    await expect(settledFor('run-2')).resolves.toMatchObject({ status: 'recorded' });

    const reopened = new TurnRevisionRecorder({ filesystem: new NodeFsProvider(workspaceRoot) });
    await reopened.revisions.ready;
    const trunk = reopened.revisions.getBranchHead(mainRevisionBranch);
    expect(trunk).toBeDefined();

    /* The candidate's base is the trunk head itself, not a parentless root:
       that is what gives two chats in one project a merge base, and without it
       every cross-chat merge of a common file could only be add/add (Q11). */
    const candidateHead = reopened.revisions.getBranchHead(turnRevisionBranch('chat-2'));
    expect(candidateHead).toBeDefined();
    const candidate = reopened.revisions.getRevision(candidateHead!);
    expect(candidate?.parents).toEqual([trunk]);
  }, 30_000);

  it('publishes where it prepared, even when the head reference moves mid-turn (c2-review S3)', async () => {
    /* A second document's Switch, or the renderer's, while this host process is
     * the writer: the head reference is store state, and nothing fences it
     * against a turn already open. */
    const { launcher, workspaceRoot, settled } = await harness({
      duringTurn: async (root) => {
        await createBrowserRevisionPort({ filesystem: new NodeFsProvider(root) }).setHead(
          turnRevisionBranch('chat-elsewhere'),
        );
      },
    });

    await startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' });
    await expect(settled).resolves.toMatchObject({ status: 'recorded' });
    await launcher.close();

    const log = await readFile(join(workspaceRoot, '.tau/chats/chat-1/events.jsonl'), 'utf8');
    const records = log
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AgentLogEvent)
      .filter((event) => event.type === 'revision.finalized');
    expect(records).toHaveLength(1);
    /* Re-deriving the branch here published onto `agent/chat-elsewhere` under
     * this turn's base as the expected old head — a branch that never held it,
     * so the turn landed nowhere any pane can see. */
    expect(records[0]).toMatchObject({
      branchName: mainRevisionBranch,
      publication: { status: 'updated', branchName: mainRevisionBranch },
    });
  }, 30_000);

  it('appends the turn record to the chat log, ahead of the terminal marker every client stops on', async () => {
    const { launcher, workspaceRoot, settled } = await harness();
    const watching = new AbortController();
    const streamed: AgentLogEvent[] = [];
    const drained = (async (): Promise<void> => {
      for await (const { event } of launcher.events(watching.signal)) {
        streamed.push(event);
      }
    })();

    await startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' });
    await expect(settled).resolves.toMatchObject({ status: 'recorded' });
    await launcher.close();
    await drained;

    const log = await readFile(join(workspaceRoot, '.tau/chats/chat-1/events.jsonl'), 'utf8');
    const written = log
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AgentLogEvent);
    const records = written.filter((event) => event.type === 'revision.finalized');
    expect(records).toHaveLength(1);
    /* The turn the transcript names, and the revision the store holds: a record
     * naming either one alone projects onto nothing the client can render. */
    const reopened = new TurnRevisionRecorder({ filesystem: new NodeFsProvider(workspaceRoot) });
    await reopened.revisions.ready;
    const head = reopened.revisions.getBranchHead(mainRevisionBranch);
    /* §6.6: `treeId` names the tree, not the commit that carries it. They are
     * two different objects and the record has to be able to tell them apart. */
    const recordedRevision = await reopened.port.readRevision(head!);
    const recordedTreeId = recordedRevision?.treeId;
    expect(recordedTreeId).toMatch(/^[\da-f]{40}$/u);
    expect(recordedTreeId).not.toBe(head);
    expect(records[0]).toMatchObject({
      type: 'revision.finalized',
      runId: 'run-1',
      turnId: 'message-run-1',
      workspaceId: 'tchat-1',
      revisionId: head,
      treeId: recordedTreeId,
      branchName: 'main',
      changedPaths: ['main.ts'],
      provenance: { source: 'agent', runId: 'run-1' },
      publication: { status: 'updated', headRevisionId: head },
      nativeGit: { status: 'stored', objectFormat: 'sha1', commitId: head },
    });

    /* The whole point of the ordering: a client unsubscribes on the terminal
     * marker, so a record published after it reaches nobody until the next
     * reattach — and the turn shows no revision in between. */
    const positionOf = (type: AgentLogEvent['type']): number =>
      streamed.findIndex(
        (event) => event.type === type && (event.type !== 'run.lifecycle' || terminal.has(event.state)),
      );
    expect(positionOf('revision.finalized')).toBeGreaterThanOrEqual(0);
    expect(positionOf('revision.finalized')).toBeLessThan(positionOf('run.lifecycle'));
    expect(streamed.filter((event) => event.type === 'revision.finalized')).toHaveLength(1);
  });

  it('advertises every mode a Node host can actually record', () => {
    expect(hostRevisionModes).toEqual(['direct', 'candidate']);
  });
});

/** One `create_file` call writing `probe.txt`, then the closing assistant text. */
const candidateTurn: ReadonlyArray<readonly string[]> = [
  [
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"create_file","arguments":${JSON.stringify(
      JSON.stringify({ targetFile: 'probe.txt', content: 'candidate\n' }),
    )}}}]},"finish_reason":"tool_calls"}]}\n\n`,
    'data: [DONE]\n\n',
  ],
  ['data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n'],
];

describe('withTurnRevisions in candidate mode', () => {
  /**
   * A Tau turn admitted as `candidate`, over the *real* host tool registry.
   *
   * The isolation claim is about Tau's own tools, so the turn writes through
   * `create_file` rather than through the test: what is under test is whether
   * `createHostToolRegistry` roots that write in the run's checkout.
   *
   * The mid-turn observation is the gateway's own second request — the host
   * only asks for a second completion once the tool has returned, so reading the
   * live root there is a deterministic "during the turn" and not a sleep.
   */
  it('writes only its checkout during the turn, and the live root at finalization (G-REV-MODE)', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-candidate-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    const checkouts = new Map<string, TurnCheckout>();
    const toolRegistry = createHostToolRegistry({ workspaceRoot, checkouts });
    const liveDuringTurn: Array<readonly string[]> = [];
    const checkoutDuringTurn: Array<readonly string[]> = [];
    const settlement = Promise.withResolvers<TurnRevisionOutcome>();
    let responses = 0;
    const launcher = withTurnRevisions(
      createNodeAgentLauncher({
        workspaceRoot,
        gatewayBaseUrl: 'https://gateway.example',
        model,
        systemPrompt: 'You are Tau.',
        toolRegistry,
        auth: () => 'daemon-bearer',
        fetch: (async () => {
          const turn = responses++;
          if (turn > 0) {
            liveDuringTurn.push(await readdir(workspaceRoot));
            checkoutDuringTurn.push(
              await readdir(join(workspaceRoot, '.tau', 'workspaces', 'tchat-candidate', 'tree')),
            );
          }
          return sse(candidateTurn[turn] ?? candidateTurn[1]!);
        }) as unknown as typeof globalThis.fetch,
      }),
      {
        workspaceRoot,
        checkouts,
        onSettled: (outcome) => {
          settlement.resolve(outcome);
        },
      },
    );
    launchers.push(launcher);

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-candidate',
      runId: 'run-candidate-1',
      mode: 'candidate',
      message: { id: 'message-candidate-1', role: 'user', content: 'Write the probe.' },
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    });

    await expect(settlement.promise).resolves.toEqual({
      chatId: 'chat-candidate',
      runId: 'run-candidate-1',
      status: 'recorded',
      changedPaths: ['probe.txt'],
    });

    /* During the turn: the write is in the checkout and the project folder has
       not been touched — which is the whole promise the mode makes. */
    expect(checkoutDuringTurn.at(0)).toContain('probe.txt');
    expect(liveDuringTurn.at(0)).not.toContain('probe.txt');
    expect(liveDuringTurn.at(0)).toContain('main.ts');

    /* And at finalization the merge brings it home, once. */
    expect(await readFile(join(workspaceRoot, 'probe.txt'), 'utf8')).toBe('candidate\n');
    const reopened = new TurnRevisionRecorder({ filesystem: new NodeFsProvider(workspaceRoot) });
    await reopened.revisions.ready;
    const head = reopened.revisions.getBranchHead(turnRevisionBranch('chat-candidate'));
    expect(head).toBeDefined();
    expect(new TextDecoder().decode(reopened.revisions.getRevision(head!)!.tree.get('probe.txt'))).toBe('candidate\n');
  }, 30_000);
});

/**
 * A launcher whose stream and whose durable append this test drives by hand.
 *
 * The wrapper's own settlement watch and every subscriber take independent
 * subscriptions, exactly as the real fan-out serves them, and `append` is the
 * last step of a settlement — so holding it there is a settlement stalled at a
 * point the wrapper genuinely reaches.
 */
const stubLauncher = (append: (event: AgentLogEvent) => Promise<void>) => {
  type Subscriber = {
    readonly queue: Array<{ chatId: string; event: AgentLogEvent }>;
    wake: PromiseWithResolvers<void>;
    ended: boolean;
    failure?: Error;
  };
  const subscribers = new Set<Subscriber>();
  const wakeAll = (): void => {
    for (const subscriber of subscribers) {
      subscriber.wake.resolve();
    }
  };
  const events = async function* (signal: AbortSignal): AsyncIterable<{ chatId: string; event: AgentLogEvent }> {
    const subscriber: Subscriber = { queue: [], wake: Promise.withResolvers(), ended: false };
    subscribers.add(subscriber);
    signal.addEventListener(
      'abort',
      () => {
        subscriber.ended = true;
        subscriber.wake.resolve();
      },
      { once: true },
    );
    try {
      while (!subscriber.ended || subscriber.queue.length > 0) {
        const item = subscriber.queue.shift();
        if (item !== undefined) {
          yield item;
          continue;
        }
        if (subscriber.failure) {
          throw subscriber.failure;
        }
        // oxlint-disable-next-line no-await-in-loop -- one subscriber's stream is ordered by construction.
        await subscriber.wake.promise;
        subscriber.wake = Promise.withResolvers();
      }
    } finally {
      subscribers.delete(subscriber);
    }
  };
  return {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wrapper reads four members of the launcher it wraps.
    launcher: {
      events,
      execute: async () => ({ type: 'result', operation: 'start' }),
      append: async (_chatId: string, event: AgentLogEvent) => {
        await append(event);
        return event;
      },
      close: async () => {
        for (const subscriber of subscribers) {
          subscriber.ended = true;
        }
        wakeAll();
      },
    } as unknown as NodeAgentLauncher,
    publish: (chatId: string, event: AgentLogEvent): void => {
      for (const subscriber of subscribers) {
        subscriber.queue.push({ chatId, event });
      }
      wakeAll();
    },
    fail: (error: Error): void => {
      for (const subscriber of subscribers) {
        subscriber.failure = error;
      }
      wakeAll();
    },
  };
};

let sequence = 0;
const logEvent = (runId: string, event: Partial<AgentLogEvent> & { readonly type: string }): AgentLogEvent => {
  sequence += 1;
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a durable record this test wrote is the vocabulary by construction.
  return {
    version: 1,
    leaderEpoch: 'leader-stub',
    sequence,
    recordedAt: new Date().toISOString(),
    runId,
    ...event,
  } as AgentLogEvent;
};

describe('withTurnRevisions composition', () => {
  it('records through the port its host composed, not a second store of its own (§6.2)', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-port-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    /* The seam a Node host selects `createJjRevisionPort` through. Proved with
     * a counting wrapper rather than the pinned binary: what is under test is
     * that the option reaches the recorder, not what any engine does with it. */
    const store = createBrowserRevisionPort({ filesystem: new NodeFsProvider(workspaceRoot) });
    let writes = 0;
    const port: RevisionPort = {
      ...store,
      writeRevision: async (input) => {
        writes += 1;
        return store.writeRevision(input);
      },
    };
    const settlement = Promise.withResolvers<TurnRevisionOutcome>();
    const stub = stubLauncher(async () => undefined);
    const launcher = withTurnRevisions(stub.launcher, {
      workspaceRoot,
      port,
      onSettled: (outcome) => {
        settlement.resolve(outcome);
      },
    });

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-port',
      runId: 'run-port',
      message: { id: 'message-port', role: 'user', content: 'Record through my port.' },
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    });
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 2;\n');
    stub.publish('chat-port', logEvent('run-port', { type: 'run.lifecycle', state: 'completed' }));
    await expect(settlement.promise).resolves.toMatchObject({ status: 'recorded' });
    await launcher.close();

    expect(writes).toBeGreaterThan(0);
  }, 30_000);
});

describe("withTurnRevisions' durable stream", () => {
  it('keeps another chat reading while one chat waits for its settlement', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-ordering-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    const held = Promise.withResolvers<void>();
    const stub = stubLauncher(async () => held.promise);
    const launcher = withTurnRevisions(stub.launcher, { workspaceRoot });

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-a',
      runId: 'run-a',
      message: { id: 'message-a', role: 'user', content: 'Settle slowly.' },
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    });

    const watching = new AbortController();
    const seen: Array<{ chatId: string; event: AgentLogEvent }> = [];
    const reading = (async (): Promise<void> => {
      for await (const item of launcher.events(watching.signal)) {
        seen.push(item);
      }
    })();

    /* Chat A ends, and its settlement stalls inside the append the wrapper
       finishes with. */
    stub.publish('chat-a', logEvent('run-a', { type: 'run.lifecycle', state: 'completed' }));
    /* Chat B keeps working. Past the fan-out's own 1024 the launcher does not
       pause a subscriber that is not reading — it errors it — so a client with
       nothing to do with chat A used to lose its stream mid-run (5-review S3). */
    for (let index = 0; index < 1100; index += 1) {
      stub.publish('chat-b', logEvent('run-b', { type: 'run.lifecycle', state: 'running' }));
    }

    await vi.waitFor(() => {
      expect(seen.filter((item) => item.chatId === 'chat-b')).toHaveLength(1100);
    });
    // And chat A's own marker is still held, which is what the wait is for.
    expect(seen.some((item) => item.chatId === 'chat-a')).toBe(false);

    held.resolve();
    await vi.waitFor(() => {
      expect(seen.some((item) => item.chatId === 'chat-a')).toBe(true);
    });
    watching.abort();
    await launcher.close();
    await reading;
  }, 30_000);

  it('re-raises a settlement watch its own stream killed, instead of crashing the process', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-watch-'));
    roots.push(workspaceRoot);
    const unhandled: unknown[] = [];
    const record = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', record);
    try {
      const stub = stubLauncher(async () => undefined);
      const launcher = withTurnRevisions(stub.launcher, { workspaceRoot });
      stub.fail(new Error('This subscriber fell too far behind; reattach from its cursor.'));
      /* A macrotask: Node reports an unhandled rejection at the checkpoint after
         the microtask queue drains, which is long before `close()` runs. */
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(unhandled).toEqual([]);
      await expect(launcher.close()).rejects.toThrow('fell too far behind');
    } finally {
      process.off('unhandledRejection', record);
    }
  }, 30_000);
});
