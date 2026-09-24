/**
 * Launcher 1's turn boundary as the Node composition of the revision actor
 * tree, over a real workspace directory and a scripted gateway (AC9, AC22).
 *
 * Every case runs on both ports: `isomorphic-git` always, and native Git
 * wherever `git` is on PATH. The two answer the same, which is the whole point
 * of the seam — and it is also what proves the host-side tree hash agrees with
 * each engine, since a cut whose id the engine disagreed with is refused.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { ToolRegistry } from '@taucad/agent-host';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { createNativeGitRevisionPort } from '@taucad/revisions/node';
import type { RevisionPort } from '@taucad/revisions';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';

import { createProjectRevisionPort, createProjectRevisions, openProjectRevisions } from '#revisions.js';
import type { HostRevisionEvent, ProjectRevisions, TurnCheckout, TurnFinalizedEvent } from '#revisions.js';
import type { RevisionOpenOutcome } from '#index.js';

const model = {
  id: 'fixture-model',
  providerKind: 'vertexai',
  contextWindow: 200_000,
  maxTokens: 4096,
} as const;

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
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-tau-operation-id': 'operation-revisions-1',
      },
    },
  );

/**
 * One turn's pair of gateway answers: a `write_probe` call, then the closing text.
 *
 * The tool call carries the request's own id, because a chat's second turn runs
 * on the same session as its first and an id it has already answered is not
 * called twice — which is how a sequential-turn case silently writes nothing.
 *
 * @param request - The request index on this launcher, counted from zero.
 * @param callsTool - Whether this request asks for the write, or closes the turn.
 * @returns The SSE chunks that answer it.
 */
const scriptedTurn = (request: number, callsTool: boolean): readonly string[] =>
  callsTool
    ? [
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-${String(request)}","function":{"name":"write_probe","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n`,
        'data: [DONE]\n\n',
      ]
    : ['data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n'];

const roots: string[] = [];
const launchers: NodeAgentLauncher[] = [];

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const hasGit = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

type Harness = {
  readonly launcher: NodeAgentLauncher;
  readonly workspaceRoot: string;
  /** Where each admitted run works, exactly as an external agent port reads it. */
  readonly checkouts: Map<string, TurnCheckout>;
  /** Every host revision event, in order. */
  readonly events: HostRevisionEvent[];
  readonly settlementFor: (runId: string) => Promise<TurnFinalizedEvent>;
  readonly leaseIds: () => Promise<readonly string[]>;
  readonly refs: () => Promise<readonly string[]>;
  readonly port: RevisionPort;
  readonly revisions: ProjectRevisions;
};

/**
 * One launcher over a temp workspace whose only tool writes `main.ts`.
 *
 * The write goes through the tool, not the test, so the ordering the tree has
 * to get right — the base is captured before the agent writes — is the ordering
 * the product actually produces.
 *
 * @param createPort - The port under test, over the workspace root.
 * @param options - A mid-turn hook, and a wrapper for the port under test.
 * @returns The recording launcher and the facts each case asserts on.
 */
const harness = async (
  createPort: (workspaceRoot: string, checkoutsDirectory: string) => RevisionPort,
  options: {
    /** Files the project already holds when the host opens it. */
    readonly seed?: (workspaceRoot: string) => Promise<void>;
    readonly duringTurn?: (workspaceRoot: string) => Promise<void>;
    readonly wrapPort?: (port: RevisionPort) => RevisionPort;
    /** Whether only the launcher's first turn calls the tool, or every turn. */
    readonly toolTurns?: 'first' | 'every';
  } = {},
): Promise<Harness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-'));
  const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
  roots.push(workspaceRoot, checkoutsDirectory);
  await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
  await options.seed?.(workspaceRoot);
  let written = 0;
  const toolRegistry: ToolRegistry = {
    list: () => [
      {
        name: 'write_probe',
        description: 'Write the probe file.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    invoke: async () => {
      written += 1;
      await writeFile(join(workspaceRoot, 'main.ts'), `export const size = ${String(written + 1)};\n`);
      return { content: 'written', isError: false };
    },
  };
  const responses = new Map<string, number>();
  const events: HostRevisionEvent[] = [];
  const settlements = new Map<string, PromiseWithResolvers<TurnFinalizedEvent>>();
  const settlementFor = async (runId: string): Promise<TurnFinalizedEvent> => {
    const pending = settlements.get(runId) ?? Promise.withResolvers<TurnFinalizedEvent>();
    settlements.set(runId, pending);
    return pending.promise;
  };
  const created = createPort(workspaceRoot, checkoutsDirectory);
  const port = options.wrapPort?.(created) ?? created;
  const checkouts = new Map<string, TurnCheckout>();
  const revisions = createProjectRevisions({
    workspaceRoot,
    projectId: 'project-1',
    port,
    checkouts,
    events: (event) => {
      events.push(event);
      if (event.type !== 'turn.finalized') {
        return;
      }
      const pending = settlements.get(event.runId) ?? Promise.withResolvers<TurnFinalizedEvent>();
      settlements.set(event.runId, pending);
      pending.resolve(event);
    },
  });
  const launcher = revisions.record(
    createNodeAgentLauncher({
      workspaceRoot,
      gatewayBaseUrl: 'https://gateway.example',
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry,
      auth: () => 'daemon-bearer',
      fetch: (async (_url: string, init: { body?: string }) => {
        const body = String(init.body ?? '');
        const chat = /"chatId":"([^"]+)"/u.exec(body)?.[1] ?? 'chat';
        const turn = responses.get(chat) ?? 0;
        responses.set(chat, turn + 1);
        /* Every turn is the same pair, so a chat's second turn writes as its
         * first did. The first turn's closing request is mid-turn by
         * construction: its base is captured and its tool has returned, and
         * nothing has settled yet — and it is the only one held, so a hook that
         * waits on a later turn cannot wait on itself. */
        if (turn === 1) {
          await options.duringTurn?.(workspaceRoot);
        }
        return sse(scriptedTurn(turn, options.toolTurns === 'every' ? turn % 2 === 0 : turn === 0));
      }) as unknown as typeof globalThis.fetch,
    }),
  );
  launchers.push(launcher);
  return {
    launcher,
    workspaceRoot,
    checkouts,
    events,
    settlementFor,
    port,
    revisions,
    leaseIds: async () => {
      try {
        const runs = await readdir(join(workspaceRoot, '.tau', 'runs'));
        return runs.toSorted();
      } catch {
        return [];
      }
    },
    refs: async () => {
      const listed = await port.listRefs();
      return listed.map((ref) => ref.name).toSorted();
    },
  };
};

/**
 * Admit one Tau turn the way a client does.
 *
 * @param launcher - The recording launcher.
 * @param turn - The chat and the client's idempotency key for the run.
 */
const startTurn = async (
  launcher: NodeAgentLauncher,
  turn: { readonly chatId: string; readonly runId: string },
): Promise<void> => {
  await launcher.execute({
    type: 'start',
    trigger: 'submit',
    chatId: turn.chatId,
    runId: turn.runId,
    message: {
      id: `message-${turn.runId}`,
      role: 'user',
      content: 'Double the size.',
    },
    config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
  });
};

const ports = [
  {
    name: 'isomorphic-git',
    enabled: true,
    create: (workspaceRoot: string): RevisionPort =>
      createIsomorphicGitRevisionPort({
        filesystem: new NodeFsProvider(workspaceRoot),
        checkouts: {
          projectId: 'project-1',
          root: () => new NodeFsProvider(workspaceRoot),
        },
      }),
  },
  {
    name: 'native-git',
    /* Never skipped: a machine with no `git` cannot answer for this row, and a
     * row that silently passed would be worse than one that did not run. */
    enabled: hasGit,
    create: (workspaceRoot: string, checkoutsDirectory: string): RevisionPort =>
      createNativeGitRevisionPort({
        repositoryPath: workspaceRoot,
        checkouts: { projectId: 'project-1', directory: checkoutsDirectory },
      }),
  },
];

/**
 * Review a1 R1: the early named refusal, on every disk host.
 *
 * A machine without `git`/`git-lfs` records nothing, and the failure used to be
 * invisible — the app opened, files edited, and no revision ever appeared. The
 * host now says so once, by name, when the project opens.
 */
describe.runIf(hasGit)('a disk host that cannot record', () => {
  it('reports the missing binaries once, and records with the executables it is given', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-toolchain-'));
    roots.push(workspaceRoot);
    const events: HostRevisionEvent[] = [];
    const previousPath = process.env['PATH'];
    process.env['PATH'] = '';
    let missing: ReturnType<typeof createProjectRevisions> | undefined;
    try {
      missing = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
        events: (event) => events.push(event),
      });
      await expect
        .poll(() => events.filter((event) => event.type === 'revision.unavailable').length, { timeout: 10_000 })
        .toBe(1);
    } finally {
      process.env['PATH'] = previousPath;
      if (missing !== undefined) {
        await expect(missing.release()).rejects.toThrow('checkout was not ready');
      }
    }
    const unavailable = events.find((event) => event.type === 'revision.unavailable');
    expect(unavailable).toMatchObject({ missing: ['git', 'git-lfs'] });
    expect(unavailable?.type === 'revision.unavailable' ? unavailable.reason : '').toContain('git-lfs');
    // Nothing was recorded: the store was never even created.
    expect(existsSync(join(workspaceRoot, '.git'))).toBe(false);

    /*
     * The seam a packaged app uses (OQ-B8, OQ3): one named `git`, empty `PATH`.
     *
     * The bundle ships `git-lfs` inside that git's own exec path, so `git lfs`
     * resolves through it and no second binary is ever named — which is what
     * the stand-in below reproduces, since a system git's exec path has none.
     */
    const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const gitLfs = execFileSync('which', ['git-lfs'], {
      encoding: 'utf8',
    }).trim();
    const bundledRoot = await mkdtemp(join(tmpdir(), 'tau-host-toolchain-'));
    roots.push(bundledRoot);
    const bundledGit = join(bundledRoot, 'bundled-git');
    await writeFile(bundledGit, `#!/bin/sh\nPATH="${dirname(gitLfs)}"\nexport PATH\nexec "${git}" "$@"\n`);
    await chmod(bundledGit, 0o755);
    const bundledEvents: HostRevisionEvent[] = [];
    process.env['PATH'] = '';
    const bundled = createProjectRevisions({
      workspaceRoot: bundledRoot,
      projectId: 'project-1',
      gitExecutable: bundledGit,
      events: (event) => bundledEvents.push(event),
    });
    try {
      await expect
        .poll(async () => existsSync(join(bundledRoot, '.git')), {
          timeout: 10_000,
        })
        .toBe(true);
      expect(bundledEvents.filter((event) => event.type === 'revision.unavailable')).toEqual([]);
    } finally {
      process.env['PATH'] = previousPath;
      await bundled.release();
    }
  }, 60_000);
});

for (const row of ports) {
  describe.runIf(row.enabled)(`turn revisions on a Node host over ${row.name}`, () => {
    it('records one revision per turn on the live checkout, and retires the turn’s lease', async () => {
      let leasesDuringTurn: readonly string[] = [];
      let leaseRecord = '';
      const held = await harness(row.create, {
        duringTurn: async (workspaceRoot) => {
          const runs = await readdir(join(workspaceRoot, '.tau', 'runs'));
          leasesDuringTurn = runs.toSorted();
          leaseRecord = await readFile(join(workspaceRoot, '.tau', 'runs', 'run-1.json'), 'utf8');
        },
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');

      /* S6: the lease is the record that a run is attached to a checkout, and
       * it lives for exactly as long as the turn does. */
      expect(leasesDuringTurn).toEqual(['run-1.json']);
      const lease: unknown = JSON.parse(leaseRecord);
      expect(lease).toMatchObject({
        runId: 'run-1',
        turnId: 'message-run-1',
        chatId: 'chat-1',
        checkoutId: 'live',
      });
      /* The epoch and the start are the host's own, so the record is read as
       * text rather than matched against a value the test would have to mint. */
      expect(leaseRecord).toMatch(/"authorityEpoch":\s*"[^"]+"/u);
      expect(leaseRecord).toMatch(/"startedAt":\s*\d+/u);
      await expect(held.leaseIds()).resolves.toEqual([]);

      /* The turn's write is in the live tree, and the revision is a record of
       * it: one revision on `main`, parented on the base the turn descended
       * from. */
      expect(await readFile(join(held.workspaceRoot, 'main.ts'), 'utf8')).toBe('export const size = 2;\n');
      await expect(held.refs()).resolves.toEqual(['main']);
      const head = await held.port.readRef('main');
      expect(head).toBe(settlement.revisionId);
      const revision = head === undefined ? undefined : await held.port.readRevision(head);
      expect(revision?.parents).toHaveLength(1);
      expect(revision?.provenance).toMatchObject({
        source: 'agent',
        runId: 'run-1',
      });
      const base = revision?.parents[0];
      const baseTree = base === undefined ? undefined : await held.port.readTree(base);
      expect(new TextDecoder().decode(baseTree?.get('main.ts'))).toBe('export const size = 1;\n');
    }, 30_000);

    it('serves the same revision graph and branch verbs over the host channel', async () => {
      const held = await harness(row.create);
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');

      const history = await held.revisions.channel.request({
        command: 'log',
        limit: 8,
      });
      expect(history.result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            revisionId: settlement.revisionId,
          }),
        ]),
      );
      expect(history.status).toMatchObject({
        projectId: 'project-1',
        branch: 'main',
      });
      await expect(held.revisions.channel.request({ command: 'open' })).resolves.toMatchObject({
        status: { projectId: 'project-1' },
      });

      await held.revisions.channel.request({
        command: 'createBranch',
        name: 'isolated-run',
      });
      await expect
        .poll(() => held.revisions.status().branches.map((branch) => branch.name), { timeout: 10_000 })
        .toContain('isolated-run');
      await held.revisions.channel.request({
        command: 'switch',
        branch: 'isolated-run',
      });
      await expect.poll(() => held.revisions.status().branch, { timeout: 10_000 }).toBe('isolated-run');
      const linkedStatusResponse: unknown = await held.revisions.channel.request({ command: 'status' });
      const linkedStatus = linkedStatusResponse as Readonly<{
        status: RevisionStatusProjection;
      }>;
      expect(linkedStatus.status.checkoutRoot).toMatch(/^\/checkouts\//u);
      expect(linkedStatus.status.branches.find((branch) => branch.name === 'main')?.checkoutRoot).toBe(
        '/projects/project-1',
      );
      expect(linkedStatus.status.branches.find((branch) => branch.name === 'isolated-run')?.checkoutRoot).toMatch(
        /^\/checkouts\//u,
      );

      await startTurn(held.launcher, { chatId: 'chat-2', runId: 'run-2' });
      const candidatePlacement = held.checkouts.get('run-2');
      await held.settlementFor('run-2');
      expect(candidatePlacement?.mode).toBe('candidate');
      const selectedRoot = held.revisions.status().checkoutRoot ?? '';
      expect(
        candidatePlacement?.cwd === selectedRoot ||
          (await realpath(candidatePlacement?.cwd ?? '')) === (await realpath(selectedRoot)),
      ).toBe(true);

      const abort = new AbortController();
      const stream = held.revisions.channel.events(abort.signal)[Symbol.asyncIterator]();
      await expect(stream.next()).resolves.toMatchObject({
        done: false,
        value: {
          kind: 'status',
          value: { projectId: 'project-1', branch: 'isolated-run' },
        },
      });
      abort.abort();
    }, 30_000);

    /* Red pin (attempt a2): a project that holds a large object records like any other.
     * The cut hashes the tree the store will record — pointers included — so the
     * I5 gate closes instead of refusing every turn with `ENGINE_FAILED`. */
    it('records a turn in a project that holds large objects, tracked and untracked', async () => {
      const large = (seed: number): Uint8Array<ArrayBuffer> =>
        Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, index) => (index * seed) % 256);
      const held = await harness(row.create, {
        seed: async (workspaceRoot) => {
          await writeFile(join(workspaceRoot, 'part.step'), large(7));
          await writeFile(join(workspaceRoot, 'notes.txt'), large(11));
        },
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');
      expect(settlement.revisionId).toMatch(/^[\da-f]{40}$/u);

      /* Whatever the store puts in the tree, a reader gets the bytes back. */
      const recorded = await held.port.readTree(revisionId(settlement.revisionId ?? ''));
      expect(recorded?.get('part.step')?.byteLength).toBe(2 * 1024 * 1024);
      expect(recorded?.get('notes.txt')?.byteLength).toBe(2 * 1024 * 1024);
    }, 60_000);

    it('emits one turn.finalized per turn, with the schema every host publishes', async () => {
      const held = await harness(row.create);

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');

      /* The two ids are the store's own; everything else is exactly the schema
       * a host publishes. */
      const { revisionId, treeId, ...schema } = settlement;
      expect(schema).toEqual({
        type: 'turn.finalized',
        turnId: 'message-run-1',
        runId: 'run-1',
        chatId: 'chat-1',
        projectId: 'project-1',
        checkoutId: 'live',
        branch: 'main',
        changedPaths: ['main.ts'],
        trigger: 'turn',
        runIds: ['run-1'],
      });
      expect(revisionId).toMatch(/^[\da-f]{40}$/u);
      /* The tree id, not the revision id: two turns whose bytes are identical
       * share a tree and differ in their revisions. */
      expect(treeId).toMatch(/^[\da-f]{40}$/u);
      expect(treeId).not.toBe(revisionId);
      expect(held.events.filter((event) => event.type === 'turn.finalized')).toHaveLength(1);
    }, 30_000);

    it('keeps two chats on one checkout, with no branch created for either (AC9)', async () => {
      const admitted = Promise.withResolvers<void>();
      const second = Promise.withResolvers<void>();
      let leasesDuringTurns: readonly string[] = [];
      const held = await harness(row.create, {
        duringTurn: async (workspaceRoot) => {
          /* Chat 1 holds here while chat 2 is admitted, so the two genuinely
           * hold the live checkout at the same moment. */
          admitted.resolve();
          await second.promise;
          const runs = await readdir(join(workspaceRoot, '.tau', 'runs'));
          leasesDuringTurns = runs.toSorted();
        },
      });

      const first = startTurn(held.launcher, {
        chatId: 'chat-1',
        runId: 'run-1',
      });
      await admitted.promise;
      await startTurn(held.launcher, { chatId: 'chat-2', runId: 'run-2' });
      second.resolve();
      await first;
      const firstSettlement = await held.settlementFor('run-1');
      const secondSettlement = await held.settlementFor('run-2');

      /* Leases are plural: both chats hold the live checkout, and neither
       * placement created a branch of its own (D7/I18). */
      expect(leasesDuringTurns).toEqual(['run-1.json', 'run-2.json']);
      expect(firstSettlement.checkoutId).toBe('live');
      expect(secondSettlement.checkoutId).toBe('live');
      await expect(held.refs()).resolves.toEqual(['main']);
      await expect(held.leaseIds()).resolves.toEqual([]);

      /* AC9's other half: the settlement names every lease on the checkout, and
       * the revision itself still carries the run that minted it — the case
       * where a naive "one lease, one run" rule would drop attribution. */
      expect(secondSettlement.runIds).toEqual(['run-2', 'run-1']);
      expect(firstSettlement.runIds).toContain('run-1');
      /* Which of the two mints the shared content is not fixed — the later
       * chat's *base* mint records whatever the earlier one has already written,
       * and the earlier turn then has nothing of its own to save. What the
       * settlement must carry either way is the lease set. (A mint under two
       * leases is pinned on the effects module, where it is scriptable.) */

      /* Two revisions on the one branch, the second parented on the first. */
      const head = await held.port.readRef('main');
      const revision = head === undefined ? undefined : await held.port.readRevision(head);
      expect(revision?.parents).toHaveLength(1);
      const log = await held.port.log();
      expect(log.length).toBeGreaterThanOrEqual(2);
    }, 30_000);

    it('descends a chat’s next turn from the revision its last turn recorded', async () => {
      const held = await harness(row.create, { toolTurns: 'every' });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const first = await held.settlementFor('run-1');
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-2' });
      const second = await held.settlementFor('run-2');

      /* The claim the deleted `turn-revision` suite held as "descends the next
       * turn in a lane from the previous turn": one chat, two turns, one line. */
      expect(second.revisionId).not.toBe(first.revisionId);
      const record =
        second.revisionId === undefined ? undefined : await held.port.readRevision(revisionId(second.revisionId));
      expect(record?.parents).toEqual([first.revisionId]);
      await expect(held.refs()).resolves.toEqual(['main']);
    }, 30_000);

    it('reports a turn that failed after it was leased, and lets go of its run', async () => {
      const held = await harness(row.create, {
        /* The turn's own mint fails; the dirty-base pre-mint that precedes it
         * still has to succeed, or the turn would fail before it was ever
         * leased. Both carry the turn's own trigger since W6 — the base mint is
         * the turn's first act, not a user save — so they are told apart by
         * order rather than by attribution. */
        wrapPort: (() => {
          let agentWrites = 0;
          return (port) => ({
            ...port,
            writeRevision: async (input) => {
              if (input.provenance.source === 'agent') {
                agentWrites += 1;
                if (agentWrites > 1) {
                  throw new Error('the store refused the turn’s revision');
                }
              }
              return port.writeRevision(input);
            },
          });
        })(),
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

      /* No outcome is silent: a turn that ran and recorded nothing is reported
       * exactly once, and leaves nothing of itself behind (a2 R2). */
      await expect
        .poll(() => held.events.filter((event) => event.type === 'turn.failed'), { timeout: 20_000 })
        .toHaveLength(1);
      expect(held.events.find((event) => event.type === 'turn.failed')).toMatchObject({
        turnId: 'message-run-1',
        runId: 'run-1',
        chatId: 'chat-1',
        checkoutId: 'live',
      });
      expect(held.events.filter((event) => event.type === 'turn.finalized')).toHaveLength(0);
      expect(held.checkouts.size).toBe(0);
      await expect(held.leaseIds()).resolves.toEqual([]);
    }, 30_000);

    it('does not retire a live lease when a second host opens the same project', async () => {
      let leasesAfterSecondOpen: readonly string[] = [];
      const held = await harness(row.create, {
        duringTurn: async (workspaceRoot) => {
          /* A second window in this process, over the same project. Its registry
           * sweeps on open — and with an epoch of its own it would retire the
           * lease the running turn is holding right now (a2 R4). */
          const stale = new NodeFsProvider(workspaceRoot);
          await stale.writeFile(
            '.tau/runs/run-dead.json',
            JSON.stringify({
              runId: 'run-dead',
              turnId: 'message-dead',
              chatId: 'chat-dead',
              checkoutId: 'live',
              authorityEpoch: 'epoch-of-a-process-that-died',
              startedAt: 1,
            }),
          );
          const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
          roots.push(checkoutsDirectory);
          const second = createProjectRevisions({
            workspaceRoot,
            projectId: 'project-1',
            port: row.create(workspaceRoot, checkoutsDirectory),
          });
          /* The stale lease disappearing is the proof that the second host's
           * own sweep ran, so what survives it is measured, never waited out. */
          await expect
            .poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), {
              timeout: 10_000,
            })
            .not.toContain('run-dead.json');
          const surviving = await readdir(join(workspaceRoot, '.tau', 'runs'));
          leasesAfterSecondOpen = surviving.toSorted();
          await second.release();
        },
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');

      expect(leasesAfterSecondOpen).toEqual(['run-1.json']);
      expect(settlement.checkoutId).toBe('live');
      expect(settlement.revisionId).toMatch(/^[\da-f]{40}$/u);
    }, 30_000);

    it('retires a lease a superseded authority epoch left behind, when the project opens', async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-stale-'));
      const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
      roots.push(workspaceRoot, checkoutsDirectory);
      await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
      const port = row.create(workspaceRoot, checkoutsDirectory);
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const stale = new NodeFsProvider(workspaceRoot);
      await stale.writeFile(
        '.tau/runs/run-dead.json',
        JSON.stringify({
          runId: 'run-dead',
          turnId: 'message-dead',
          chatId: 'chat-dead',
          checkoutId: 'live',
          authorityEpoch: 'epoch-of-a-process-that-died',
          startedAt: 1,
        }),
      );

      const revisions = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
        port,
      });
      /* The registry sweeps on open, not on a heartbeat: a host restart is the
       * only thing that can tell a crashed turn's lease from a live one (F13). */
      await expect
        .poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), {
          timeout: 10_000,
        })
        .toEqual([]);
      await revisions.release();
    }, 30_000);

    /*
     * C71: the lease of a host that is still running is never swept.
     *
     * The epoch used to be one per *process*, so a second process over the same
     * project — `tau serve` beside the app, or `tau revisions` beside either —
     * opened with an epoch of its own and retired the live lease of a turn that
     * was running right then, taking its run id out of the revision's
     * provenance. The epoch is now the project's, adopted from the host that
     * still owns it; only a dead owner's epoch is superseded.
     */
    it('keeps the lease of a host that is still running, and retires a dead one’s', async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-epoch-'));
      const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-epoch-config-'));
      roots.push(workspaceRoot, checkoutsDirectory, configDirectory);
      process.env['TAU_CONFIG_DIR'] = configDirectory;
      await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
      const port = row.create(workspaceRoot, checkoutsDirectory);
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const records = new NodeFsProvider(workspaceRoot);
      const lease = async (runId: string, authorityEpoch: string): Promise<void> =>
        records.writeFile(
          `.tau/runs/${runId}.json`,
          JSON.stringify({
            runId,
            turnId: `message-${runId}`,
            chatId: 'chat-1',
            checkoutId: 'live',
            authorityEpoch,
            startedAt: 1,
          }),
        );
      await lease('run-1', 'epoch-of-the-running-host');
      await lease('run-dead-a', 'epoch-of-a-process-that-died');

      /* The host that owns this project right now, with an epoch of its own. */
      const owner = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
        port,
        authorityEpoch: 'epoch-of-the-running-host',
      });
      let second: ReturnType<typeof createProjectRevisions> | undefined;
      try {
        await expect
          .poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), { timeout: 10_000 })
          .not.toContain('run-dead-a.json');
        /* Written after the owner's own sweep, so what disappears next is the
         * second host's sweep and nothing else. */
        await lease('run-dead-b', 'epoch-of-a-process-that-died');

        second = createProjectRevisions({
          workspaceRoot,
          projectId: 'project-1',
          port: row.create(workspaceRoot, checkoutsDirectory),
        });
        await expect
          .poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), { timeout: 10_000 })
          .not.toContain('run-dead-b.json');

        expect(await readdir(join(workspaceRoot, '.tau', 'runs'))).toStrictEqual(['run-1.json']);
      } finally {
        await second?.release();
        await owner.release();
        delete process.env['TAU_CONFIG_DIR'];
      }
    }, 30_000);

    it('refuses a turn it cannot place, instead of running it unrecorded', async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-refused-'));
      const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
      roots.push(workspaceRoot, checkoutsDirectory);
      const port = row.create(workspaceRoot, checkoutsDirectory);
      const broken: RevisionPort = {
        ...port,
        listCheckouts: async () => {
          throw new Error('the store is unreadable');
        },
      };
      const revisions = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
        port: broken,
      });
      const launcher = revisions.record(
        createNodeAgentLauncher({
          workspaceRoot,
          gatewayBaseUrl: 'https://gateway.example',
          model,
          systemPrompt: 'You are Tau.',
          toolRegistry: {
            list: () => [],
            invoke: async () => ({ content: '', isError: false }),
          },
          auth: () => 'daemon-bearer',
          fetch: (async () => sse(scriptedTurn(1, false))) as unknown as typeof globalThis.fetch,
        }),
      );
      launchers.push(launcher);

      await expect(startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' })).rejects.toMatchObject({
        code: 'REVISION_PREPARE_FAILED',
      });
      launchers.splice(launchers.indexOf(launcher), 1);
      await expect(launcher.close()).rejects.toThrow('checkout was not ready');
    }, 30_000);

    it('answers a turn that ended before its lease with the reason, not with the bound (W19-b-a2)', async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-revisions-unleased-'));
      const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
      roots.push(workspaceRoot, checkoutsDirectory);
      /*
       * Placement succeeds and the *base* cut fails, which is the shape every
       * pre-lease terminal path shares (D17: the turn may not lease a dirty
       * tree, so it asks the checkout to mint one first). The turn reaches
       * `#turn.failed` and announces its release; before W19-b-a2 nothing on
       * this leg settled the admission, so the caller waited out the host's
       * whole 30 s patience and then heard "it was never leased" — a sentence
       * naming nothing, which is the I12 failure the browser leg already fixed.
       */
      const port = row.create(workspaceRoot, checkoutsDirectory);
      const unwritable: RevisionPort = {
        ...port,
        writeRevision: async () => {
          throw new Error('the store is out of space');
        },
      };
      const revisions = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
        port: unwritable,
      });
      const launcher = revisions.record(
        createNodeAgentLauncher({
          workspaceRoot,
          gatewayBaseUrl: 'https://gateway.example',
          model,
          systemPrompt: 'You are Tau.',
          toolRegistry: {
            list: () => [],
            invoke: async () => ({ content: '', isError: false }),
          },
          auth: () => 'daemon-bearer',
          fetch: (async () => sse(scriptedTurn(1, false))) as unknown as typeof globalThis.fetch,
        }),
      );
      launchers.push(launcher);

      await expect(startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' })).rejects.toMatchObject({
        code: 'REVISION_PREPARE_FAILED',
        message: expect.stringContaining('out of space') as unknown as string,
      });
      launchers.splice(launchers.indexOf(launcher), 1);
      await expect(launcher.close()).rejects.toThrow('out of space');
      /* The test's own bound is the pin: 20 s is shorter than the host's
       * `admissionMilliseconds`, so a run that only the timer settles fails
       * here rather than passing slowly. */
    }, 20_000);

    /*
     * The two rows that follow run on one port, and deliberately.
     *
     * They need the host's 30 s patience to elapse, which means faking the
     * clock — and a fake clock also fires the native port's own `git lfs` start
     * deadline, failing the row for a reason that has nothing to do with what
     * it asserts. What it asserts is `packages/host` bookkeeping — the
     * `admissions` and `turns` maps around one `admitTurn` — which is identical
     * whichever port records underneath. One port proves it; every other row in
     * this describe still runs on both.
     */
    const clockSafePort = row.name === 'isomorphic-git';

    /**
     * One turn the host stopped waiting for, on a registry that answers too late.
     *
     * The root buffers an admission that arrives before the registry has
     * answered and replays it the moment it does (A38) — here, after the host's
     * 30 s patience has expired and the caller has been refused. That is where
     * both rows below start, with the registry released and the run refused.
     *
     * @returns The harness whose `run-1` the bound gave up on.
     */
    const refusedByTheBound = async (): Promise<Harness> => {
      const registry = Promise.withResolvers<void>();
      const held = await harness(row.create, {
        wrapPort: (port) => ({
          ...port,
          listCheckouts: async () => {
            await registry.promise;
            return (await port.listCheckouts?.()) ?? [];
          },
        }),
      });

      /*
       * Only `setTimeout` is faked, and the real one is kept: `execute` reads
       * the chat record off the real disk before it admits anything, so the
       * bound this row fires does not exist yet when the clock is first
       * advanced. Each step sleeps for real to let that read land, then jumps
       * the host's patience again, so whichever step arms the bound, the next
       * one fires it.
       */
      const realSetTimeout = globalThis.setTimeout;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const refused = expect(startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' })).rejects.toMatchObject({
          code: 'REVISION_PREPARE_FAILED',
        });
        for (let step = 0; step < 40; step += 1) {
          vi.advanceTimersByTime(5000);
          // oxlint-disable-next-line no-await-in-loop -- one real pause per step, by design.
          await new Promise<void>((resolve) => {
            realSetTimeout(resolve, 25);
          });
        }
        await refused;
      } finally {
        /* Real timers before the registry lands: everything the root starts on
         * its first announcement schedules its own, and a fake clock advancing
         * through them proves nothing these rows are about. */
        vi.useRealTimers();
      }

      registry.resolve();
      return held;
    };

    /*
     * T4-02, the daemon leg: the host's patience is bounded, the root's queue
     * is not.
     *
     * The replay happens after the caller has been refused: a turn spawns,
     * takes the checkout's lease, and nothing is left to send it
     * `turnCompleted`, so the checkout reads as held for the life of the
     * process and every later save on it records nothing. A lease has no
     * heartbeat by policy (§8), so this host giving up is the only liveness
     * signal it has — it has to tell the root, not only its caller.
     */
    it.runIf(clockSafePort)(
      'abandons an admission its own bound refused, rather than leasing the checkout for nobody',
      async () => {
        const held = await refusedByTheBound();

        /* The lease an orphan takes lands a few ticks after the registry does, so
         * this polls for it: the row fails the moment one appears rather than
         * passing on a race. */
        for (let attempt = 0; attempt < 40; attempt += 1) {
          // oxlint-disable-next-line no-await-in-loop -- polling for the lease this row must never see.
          const leased = await held.leaseIds();
          if (leased.length > 0) {
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
          });
        }

        expect(await held.leaseIds()).toEqual([]);
      },
      30_000,
    );

    /*
     * The other half of the same give-up: the run id has to become admittable
     * again.
     *
     * `execute` skips admission for a run it has already admitted
     * (`turns.has(runId)`), which is how a turn's own later commands stay out
     * of the placement path. Every other way an admission ends drops that
     * record — the release announcement does, the failed `execute` does — but
     * the bound did not, so a client retrying the run id it was just refused
     * went straight to the launcher: the agent ran with no lease, wrote into
     * the live checkout unfenced, and its turn recorded no revision at all.
     * That is the one thing a host may never do (I-EDIT).
     */
    it.runIf(clockSafePort)(
      'admits a retry of the run its bound refused, rather than running it with no lease',
      async () => {
        const held = await refusedByTheBound();

        await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

        /* The settlement lands after `execute` resolves: the launcher's terminal
         * marker is what completes the turn. */
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (held.events.some((event) => event.type === 'turn.finalized' && event.runId === 'run-1')) {
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
          });
        }

        const finalized = held.events.flatMap((event) => (event.type === 'turn.finalized' ? [event.runId] : []));
        expect(finalized).toEqual(['run-1']);
      },
      30_000,
    );
  });
}

/* W9 pin (a): every disk host — the Electron utility, `tau serve` and the CLI —
 * records into the same store, because they all reach `createProjectRevisions`
 * without a port and that default is native Git over the project directory,
 * with linked checkouts in the host's own data directory. No mode exists to
 * choose (S12, A10, D9). */
describe.runIf(hasGit)('the disk-host default', () => {
  it('gives browser, desktop and CLI identical revision identity and keeps desktop checkouts outside the project', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-default-'));
    const cliRoot = await mkdtemp(join(tmpdir(), 'tau-cli-default-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-config-'));
    roots.push(workspaceRoot, cliRoot, configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    try {
      /* No `port`: exactly what `host-daemon.ts` and the Electron utility pass. */
      const revisions = createProjectRevisions({
        workspaceRoot,
        projectId: 'project-1',
      });
      try {
        for (let attempt = 0; attempt < 200 && !existsSync(join(workspaceRoot, '.git')); attempt += 1) {
          // oxlint-disable-next-line no-await-in-loop -- polling for the store the tree creates on open.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 25);
          });
        }
      } finally {
        await revisions.release();
      }

      /* The store is this project's own `.git`, and git itself says so. */
      expect(
        execFileSync('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
      ).toBe(await realpath(workspaceRoot));
      /* With the two generated, versioned files beside it (S16, S35, D24). */
      expect(await readFile(join(workspaceRoot, '.gitignore'), 'utf8')).toContain('/.tau/runs/');
      expect(await readFile(join(workspaceRoot, '.gitattributes'), 'utf8')).toContain(
        '*.step filter=lfs diff=lfs merge=lfs -text',
      );

      const desktopPort = createProjectRevisionPort({
        workspaceRoot,
        projectId: 'project-1',
      });
      const desktopDescriptor = await desktopPort.describe();
      expect(desktopDescriptor.engine).toBe('native-git');
      expect(desktopDescriptor.checkouts).toBe(true);

      const revision = {
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: {
          source: 'user',
          actorId: 'ada',
          createdAt: Date.UTC(2026, 8, 12),
        },
        summary: { generated: 'First' },
      } as const;
      const desktopReceipt = await desktopPort.writeRevision(revision);
      /* W9 pin (d): the port every disk host and `tau revisions` constructs
       * names the same tree as the browser leg for the same content (I4, AC5).
       * The conformance suite proves the two engines agree; this proves the
       * *host's own construction* is one of those two and not a third thing. */
      const browserPort = createIsomorphicGitRevisionPort({
        filesystem: new NodeFsProvider(await mkdtemp(join(tmpdir(), 'tau-host-browser-leg-'))),
      });
      await browserPort.init({
        author: { name: 'Tau', email: 'noreply@tau.new' },
      });
      const browserReceipt = await browserPort.writeRevision(revision);

      /* `tau revisions` opens this same public host surface without supplying a
       * port. Initializing through the exported factory first gives it the
       * history a read-only CLI command requires, then the verb itself proves
       * that its default resolves to native Git rather than a test-only alias. */
      const cliPort = createProjectRevisionPort({
        workspaceRoot: cliRoot,
        projectId: 'cli-project',
      });
      await cliPort.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const cliReceipt = await cliPort.writeRevision(revision);
      await cliPort.setHead('main');
      await cliPort.updateRef({
        name: 'refs/heads/main',
        expectedHead: undefined,
        head: revisionId(cliReceipt.commitId),
      });
      const cli = openProjectRevisions({
        workspaceRoot: cliRoot,
        projectId: 'cli-project',
      });
      try {
        expect(await cli.describeEngine()).toMatchObject({
          engine: 'native-git',
        });
        const cliLog = await cli.log();
        expect(cliLog[0]?.revisionId).toBe(cliReceipt.commitId);
      } finally {
        await cli.close();
      }

      const desktopRecord = await desktopPort.readRevision(revisionId(desktopReceipt.commitId));
      const browserRecord = await browserPort.readRevision(revisionId(browserReceipt.commitId));
      const cliRecord = await cliPort.readRevision(revisionId(cliReceipt.commitId));
      expect(browserRecord).toBeDefined();
      expect(desktopRecord).toBeDefined();
      expect(cliRecord).toBeDefined();
      expect(browserRecord?.treeId).toMatch(/^[\da-f]{40}$/u);
      expect(desktopRecord?.treeId).toMatch(/^[\da-f]{40}$/u);
      expect(cliRecord?.treeId).toMatch(/^[\da-f]{40}$/u);
      expect({
        browser: {
          revisionId: browserReceipt.commitId,
          treeId: browserRecord?.treeId,
        },
        desktop: {
          revisionId: desktopReceipt.commitId,
          treeId: desktopRecord?.treeId,
        },
        cli: { revisionId: cliReceipt.commitId, treeId: cliRecord?.treeId },
      }).toStrictEqual({
        browser: {
          revisionId: desktopReceipt.commitId,
          treeId: desktopRecord?.treeId,
        },
        desktop: {
          revisionId: desktopReceipt.commitId,
          treeId: desktopRecord?.treeId,
        },
        cli: {
          revisionId: desktopReceipt.commitId,
          treeId: desktopRecord?.treeId,
        },
      });

      const linked = await desktopPort.addCheckout?.({
        branch: 'side',
        from: revisionId(desktopReceipt.commitId),
      });
      expect(linked?.root.startsWith(join(configDirectory, 'checkouts', 'project-1'))).toBe(true);
      expect(linked?.root.startsWith(workspaceRoot)).toBe(false);
      expect(existsSync(join(linked?.root ?? '', 'part.ts'))).toBe(true);
    } finally {
      delete process.env['TAU_CONFIG_DIR'];
    }
  }, 60_000);

  /*
   * W18 DEF-2 red pin: `tau open` on a machine that has never held the project.
   *
   * The remote here is a bare repository on disk, which native git speaks to
   * exactly as it speaks to the Tau Hosted Remote — what is being proved is the
   * *verb*, not the transport (the transport is `sync.integration.test.ts`'s,
   * over a real `git http-backend`). Device A records and offers; device B is an
   * empty directory with nothing but the project's id and where its remote is,
   * and `openFromRemote` is the whole gesture.
   */
  it.runIf(hasGit)(
    'opens a project this machine has never held from its remote',
    async () => {
      const bare = await mkdtemp(join(tmpdir(), 'tau-host-open-remote-'));
      const first = await mkdtemp(join(tmpdir(), 'tau-host-open-a-'));
      const second = await mkdtemp(join(tmpdir(), 'tau-host-open-b-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-open-config-'));
      roots.push(bare, first, second, configDirectory);
      process.env['TAU_CONFIG_DIR'] = configDirectory;
      execFileSync('git', ['init', '--bare', '--initial-branch=main', bare], {
        stdio: 'ignore',
      });

      const author = { name: 'Tau', email: 'noreply@tau.new' };
      const port = createProjectRevisionPort({
        workspaceRoot: first,
        projectId: 'project-1',
      });
      await port.init({ author });
      await port.setHead('main');
      const receipt = await port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: {
          source: 'user',
          actorId: 'ada',
          createdAt: Date.UTC(2026, 8, 13),
        },
        summary: { generated: 'Device A' },
      });
      await port.updateRef({
        name: 'refs/heads/main',
        expectedHead: undefined,
        head: revisionId(receipt.commitId),
      });
      await port.setRemote({ name: 'tau', url: bare });
      await port.push({
        remote: 'tau',
        atomic: true,
        refs: [{ name: 'refs/heads/main' }],
      });

      const revisions = openProjectRevisions({
        workspaceRoot: second,
        projectId: 'project-1',
        remoteUrl: () => bare,
      });
      try {
        expect(existsSync(join(second, 'part.ts'))).toBe(false);
        /* Named through the package entrypoint, not through `#revisions.js`
           (review R1): the verb is `@public`, so a consumer of
           `ProjectRevisionVerbs` has to be able to name what it answers. */
        const outcome: RevisionOpenOutcome = await revisions.openFromRemote();

        expect(outcome).toMatchObject({ status: 'opened', branch: 'main' });
        /* The live checkout, not only the graph: the file is on disk with device
         A's bytes, and `main` is where A left it. */
        expect(await readFile(join(second, 'part.ts'), 'utf8')).toBe('export const part = 1;\n');
        expect(await revisions.describe()).toMatchObject({
          branch: 'main',
          revisionNumber: 1,
        });
      } finally {
        await revisions.close();
        delete process.env['TAU_CONFIG_DIR'];
      }
    },
    120_000,
  );

  /*
   * Review R2: a registered project whose repository is still empty.
   *
   * `GET /v1/projects` lists rows the *register* verb created, and registering
   * creates an empty bare repository — so "this account has a project" and
   * "there is anything to open" are different facts. An empty remote must not
   * be reported as opened over an empty directory.
   */
  it.runIf(hasGit)(
    'refuses to open a project whose Tau Cloud repository is still empty',
    async () => {
      const bare = await mkdtemp(join(tmpdir(), 'tau-host-open-empty-'));
      const second = await mkdtemp(join(tmpdir(), 'tau-host-open-empty-b-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-open-empty-config-'));
      roots.push(bare, second, configDirectory);
      process.env['TAU_CONFIG_DIR'] = configDirectory;
      execFileSync('git', ['init', '--bare', '--initial-branch=main', bare], {
        stdio: 'ignore',
      });

      const revisions = openProjectRevisions({
        workspaceRoot: second,
        projectId: 'project-1',
        remoteUrl: () => bare,
      });
      try {
        expect(await revisions.openFromRemote()).toStrictEqual({
          status: 'refused',
          reason: 'This project has nothing on Tau Cloud yet.',
        });
        /* Nothing of a project arrived: what is on disk is only the store and
           durable-sync control directories created for any opened project. */
        const present = await readdir(second);
        expect(present.filter((entry) => entry !== '.tau' && !entry.startsWith('.git'))).toStrictEqual([]);
      } finally {
        await revisions.close();
        delete process.env['TAU_CONFIG_DIR'];
      }
    },
    120_000,
  );

  /*
   * Review R3, corrected by the run: a device that already has work of its own.
   *
   * The review expected `sync.state: 'conflicted'`. What actually happens one
   * state earlier is that *Connect*'s own initial sync offers this machine's
   * branch, the remote refuses it non-fast-forward, and `remote.phase` is
   * `failed` — which this verb already answered. What the row pins is that the
   * refusal is prompt and in the remote's own words, and is never the "did not
   * answer in time" sentence the unhandled states used to produce.
   */
  it.runIf(hasGit)(
    'refuses an open that collides with work this machine already has',
    async () => {
      const bare = await mkdtemp(join(tmpdir(), 'tau-host-open-clash-'));
      const first = await mkdtemp(join(tmpdir(), 'tau-host-open-clash-a-'));
      const second = await mkdtemp(join(tmpdir(), 'tau-host-open-clash-b-'));
      const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-open-clash-config-'));
      roots.push(bare, first, second, configDirectory);
      process.env['TAU_CONFIG_DIR'] = configDirectory;
      execFileSync('git', ['init', '--bare', '--initial-branch=main', bare], {
        stdio: 'ignore',
      });

      const author = { name: 'Tau', email: 'noreply@tau.new' };
      const record = async (root: string, body: string, summary: string): Promise<void> => {
        const port = createProjectRevisionPort({
          workspaceRoot: root,
          projectId: 'project-1',
        });
        await port.init({ author });
        await port.setHead('main');
        const receipt = await port.writeRevision({
          parents: [],
          tree: new ImmutableRevisionTree([['part.ts', body]]),
          provenance: {
            source: 'user',
            actorId: 'ada',
            createdAt: Date.UTC(2026, 8, 13),
          },
          summary: { generated: summary },
        });
        await port.updateRef({
          name: 'refs/heads/main',
          expectedHead: undefined,
          head: revisionId(receipt.commitId),
        });
      };
      await record(first, 'export const part = 1;\n', 'Device A');
      const offering = createProjectRevisionPort({
        workspaceRoot: first,
        projectId: 'project-1',
      });
      await offering.setRemote({ name: 'tau', url: bare });
      await offering.push({
        remote: 'tau',
        atomic: true,
        refs: [{ name: 'refs/heads/main' }],
      });
      /* The second machine's own line, on the same path and unrelated to A's. */
      await record(second, 'export const part = 2;\n', 'This machine');
      /* On disk as well as in the graph, so "untouched" is a claim about files. */
      await writeFile(join(second, 'part.ts'), 'export const part = 2;\n');

      const revisions = openProjectRevisions({
        workspaceRoot: second,
        projectId: 'project-1',
        remoteUrl: () => bare,
      });
      try {
        const outcome = await revisions.openFromRemote();

        expect(outcome).toMatchObject({ status: 'refused' });
        expect(outcome.status === 'refused' && outcome.reason).toMatch(/refused refs\/heads\/main/u);
        expect(outcome.status === 'refused' && outcome.reason).not.toMatch(/did not answer in time/u);
        /* This machine's own work is untouched by the refusal. */
        expect(await readFile(join(second, 'part.ts'), 'utf8')).toBe('export const part = 2;\n');
      } finally {
        await revisions.close();
        delete process.env['TAU_CONFIG_DIR'];
      }
    },
    120_000,
  );

  /* Retention, local half (A25, S36): *Discard* removes a branch's files and
   * keeps its revisions, and it refuses while those files hold work no revision
   * has. Nothing is ever collected: the revisions stay reachable either way. */
  it('discards a branch’s files only when they are all in a revision', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-discard-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-discard-config-'));
    roots.push(workspaceRoot, configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    const revisions = openProjectRevisions({
      workspaceRoot,
      projectId: 'project-1',
    });
    try {
      const port = createProjectRevisionPort({
        workspaceRoot,
        projectId: 'project-1',
      });
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      await port.setHead('main');
      const receipt = await port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: {
          source: 'user',
          actorId: 'ada',
          createdAt: Date.UTC(2026, 8, 12),
        },
        summary: { generated: 'First' },
      });
      const head = revisionId(receipt.commitId);
      await port.updateRef({ name: 'main', expectedHead: undefined, head });
      const side = await port.addCheckout?.({ branch: 'side', from: head });

      /* The project itself is never discardable — and the refusal is the
       * machine's own, checked against the tree, not one this host composed
       * from a registry record before asking anybody (I20, C72). Here the
       * project's files are not the ones its head holds, which is the first
       * thing `removeCheckout` refuses over. */
      const live = await revisions.discard('main');
      expect(live.status).toBe('refused');
      expect(live.status === 'refused' && live.reason).toContain('not in a revision yet');

      // Work that no revision holds stops the removal, and says why.
      await writeFile(join(side?.root ?? '', 'part.ts'), 'export const part = 2;\n');
      const dirty = await revisions.discard('side');
      expect(dirty.status).toBe('refused');
      expect(dirty.status === 'refused' && dirty.reason).toContain('not in a revision yet');
      expect(existsSync(join(side?.root ?? '', 'part.ts'))).toBe(true);

      // Put it back, and the same verb removes the files.
      await writeFile(join(side?.root ?? '', 'part.ts'), 'export const part = 1;\n');
      expect(await revisions.discard('side')).toMatchObject({
        status: 'discarded',
      });
      expect(existsSync(side?.root ?? '')).toBe(false);
      // The branch's revisions are still here: no local collection, ever.
      expect(await port.readRevision(head)).toBeDefined();
      const remaining = await revisions.log();
      expect(remaining.map((row) => row.revisionNumber)).toStrictEqual([1]);
    } finally {
      await revisions.close();
      delete process.env['TAU_CONFIG_DIR'];
    }
  }, 60_000);
});

/*
 * The daemon leg relays a branch refusal whole (review finding 2).
 *
 * A *New branch* on this leg is correlated on the toast stream by verb and
 * branch, and the page phrases it from the code. Relayed as a message alone,
 * the refusal settled nothing: the caller waited out its bound and the person
 * read "this project did not answer in time" for a branch that was refused.
 */
describe('a branch refusal over the host channel', () => {
  it('carries the code, the verb and the branch, not only a sentence', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-branch-refusal-'));
    roots.push(workspaceRoot);
    const revisions = createProjectRevisions({
      workspaceRoot,
      projectId: 'project-1',
      port: createIsomorphicGitRevisionPort({
        filesystem: new NodeFsProvider(workspaceRoot),
        checkouts: { projectId: 'project-1', root: () => new NodeFsProvider(workspaceRoot) },
      }),
    });
    const abort = new AbortController();
    const frames: Array<Readonly<{ kind: string; value: unknown }>> = [];
    const reading = (async (): Promise<void> => {
      for await (const frame of revisions.channel.events(abort.signal)) {
        frames.push(frame);
      }
    })();
    try {
      await revisions.channel.request({ command: 'open' });
      /* A project with nothing recorded has nothing to branch from, which is
         the cheapest refusal this tree mints — any refused verb proves the
         relay, and this one needs no turn to have run. */
      await revisions.channel.request({ command: 'createBranch', name: 'isolated-run' });

      await expect
        .poll(
          () => frames.find((frame) => frame.kind === 'toast' && (frame.value as { type?: string }).type === 'error'),
          { timeout: 10_000 },
        )
        .toMatchObject({
          kind: 'toast',
          value: {
            type: 'error',
            subject: 'branch',
            operation: 'create',
            branch: 'isolated-run',
            code: expect.any(String) as unknown as string,
            message: expect.any(String) as unknown as string,
          },
        });
    } finally {
      abort.abort();
      await reading.catch(() => undefined);
      await revisions.release();
    }
  }, 30_000);
});

/**
 * The host half of D4/D16b and D3.
 *
 * A frame the page marked `unavailable` used to be dropped, which left native
 * git free to reach the repository with the person's own credential helper.
 * Held, it refuses the repository with reconnect-required before git starts,
 * so none of this row touches the network. `authorizeRemote` is how the page
 * re-validates once it has re-minted.
 */
describe.runIf(hasGit)('a Tau-managed remote credential over the host channel', () => {
  it('should hold an unavailable frame and re-validate on authorizeRemote', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-remote-credential-'));
    roots.push(workspaceRoot);
    const repositoryUrl = 'https://git.example.invalid/owner/repository.git';
    const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1' });
    const frame = (unavailable: string): Record<string, string> => ({
      command: 'remoteCredential',
      apiBaseUrl: 'https://api.tau.test',
      origin: 'https://git.example.invalid',
      repositoryUrl,
      unavailable,
    });
    try {
      await revisions.channel.request({ command: 'open' });
      await revisions.channel.request(frame('Your GitHub connection needs to be renewed.'));
      await revisions.channel.request({ command: 'connectRemote', kind: 'git', url: repositoryUrl });

      await expect
        .poll(() => revisions.status().remote, { timeout: 20_000 })
        .toMatchObject({ phase: 'reconnectRequired', error: 'Your GitHub connection needs to be renewed.' });

      await revisions.channel.request(frame('Still not renewed.'));
      await revisions.channel.request({ command: 'authorizeRemote' });

      await expect
        .poll(() => revisions.status().remote, { timeout: 20_000 })
        .toMatchObject({ phase: 'reconnectRequired', error: 'Still not renewed.' });
    } finally {
      await revisions.release();
    }
  }, 60_000);
});
