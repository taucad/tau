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
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { ToolRegistry } from '@taucad/agent-host';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { createNativeGitRevisionPort } from '@taucad/revisions/node';
import type { RevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';

import { createProjectRevisionPort, createProjectRevisions, openProjectRevisions } from '#revisions.js';
import type { HostRevisionEvent, TurnCheckout, TurnFinalizedEvent } from '#revisions.js';

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
      { name: 'write_probe', description: 'Write the probe file.', inputSchema: { type: 'object', properties: {} } },
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
    message: { id: `message-${turn.runId}`, role: 'user', content: 'Double the size.' },
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
        checkouts: { projectId: 'project-1', root: () => new NodeFsProvider(workspaceRoot) },
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
      await missing?.release();
    }
    const unavailable = events.find((event) => event.type === 'revision.unavailable');
    expect(unavailable).toMatchObject({ missing: ['git', 'git-lfs'] });
    expect(unavailable?.type === 'revision.unavailable' ? unavailable.reason : '').toContain('git-lfs');
    // Nothing was recorded: the store was never even created.
    expect(existsSync(join(workspaceRoot, '.git'))).toBe(false);

    /* The seam a packaged app uses (OQ-B8): named binaries, empty `PATH`. */
    const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const gitLfs = execFileSync('which', ['git-lfs'], { encoding: 'utf8' }).trim();
    const bundledRoot = await mkdtemp(join(tmpdir(), 'tau-host-toolchain-'));
    roots.push(bundledRoot);
    const bundledEvents: HostRevisionEvent[] = [];
    process.env['PATH'] = '';
    const bundled = createProjectRevisions({
      workspaceRoot: bundledRoot,
      projectId: 'project-1',
      gitExecutable: git,
      gitLfsExecutable: gitLfs,
      events: (event) => bundledEvents.push(event),
    });
    try {
      await expect.poll(async () => existsSync(join(bundledRoot, '.git')), { timeout: 10_000 }).toBe(true);
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
      expect(revision?.provenance).toMatchObject({ source: 'agent', runId: 'run-1' });
      const base = revision?.parents[0];
      const baseTree = base === undefined ? undefined : await held.port.readTree(base);
      expect(new TextDecoder().decode(baseTree?.get('main.ts'))).toBe('export const size = 1;\n');
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

      const first = startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
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
            .poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), { timeout: 10_000 })
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

      const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1', port });
      /* The registry sweeps on open, not on a heartbeat: a host restart is the
       * only thing that can tell a crashed turn's lease from a live one (F13). */
      await expect.poll(async () => readdir(join(workspaceRoot, '.tau', 'runs')), { timeout: 10_000 }).toEqual([]);
      await revisions.release();
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
      const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1', port: broken });
      const launcher = revisions.record(
        createNodeAgentLauncher({
          workspaceRoot,
          gatewayBaseUrl: 'https://gateway.example',
          model,
          systemPrompt: 'You are Tau.',
          toolRegistry: { list: () => [], invoke: async () => ({ content: '', isError: false }) },
          auth: () => 'daemon-bearer',
          fetch: (async () => sse(scriptedTurn(1, false))) as unknown as typeof globalThis.fetch,
        }),
      );
      launchers.push(launcher);

      await expect(startTurn(launcher, { chatId: 'chat-1', runId: 'run-1' })).rejects.toMatchObject({
        code: 'REVISION_PREPARE_FAILED',
      });
    }, 30_000);
  });
}

/* W9 pin (a): every disk host — the Electron utility, `tau serve` and the CLI —
 * records into the same store, because they all reach `createProjectRevisions`
 * without a port and that default is native Git over the project directory,
 * with linked checkouts in the host's own data directory. No mode exists to
 * choose (S12, A10, D9). */
describe.runIf(hasGit)('the disk-host default', () => {
  it('creates a native Git store in the project and keeps linked checkouts out of it', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-default-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-config-'));
    roots.push(workspaceRoot, configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    try {
      /* No `port`: exactly what `host-daemon.ts` and the Electron utility pass. */
      const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1' });
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

      const port = createProjectRevisionPort({ workspaceRoot, projectId: 'project-1' });
      const descriptor = await port.describe();
      expect(descriptor.engine).toBe('native-git');
      expect(descriptor.checkouts).toBe(true);

      const receipt = await port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 12) },
        summary: { generated: 'First' },
      });
      /* W9 pin (d): the port every disk host and `tau revisions` constructs
       * names the same tree as the browser leg for the same content (I4, AC5).
       * The conformance suite proves the two engines agree; this proves the
       * *host's own construction* is one of those two and not a third thing. */
      const browserPort = createIsomorphicGitRevisionPort({
        filesystem: new NodeFsProvider(await mkdtemp(join(tmpdir(), 'tau-host-browser-leg-'))),
      });
      await browserPort.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const browserReceipt = await browserPort.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 12) },
        summary: { generated: 'First' },
      });
      const diskRecord = await port.readRevision(revisionId(receipt.commitId));
      const browserRecord = await browserPort.readRevision(revisionId(browserReceipt.commitId));
      expect(diskRecord?.treeId).toBe(browserRecord?.treeId);
      expect(browserReceipt.commitId).toBe(receipt.commitId);

      const linked = await port.addCheckout?.({ branch: 'side', from: revisionId(receipt.commitId) });
      expect(linked?.root.startsWith(join(configDirectory, 'checkouts', 'project-1'))).toBe(true);
      expect(linked?.root.startsWith(workspaceRoot)).toBe(false);
      expect(existsSync(join(linked?.root ?? '', 'part.ts'))).toBe(true);
    } finally {
      delete process.env['TAU_CONFIG_DIR'];
    }
  }, 60_000);

  /* Retention, local half (A25, S36): *Discard* removes a branch's files and
   * keeps its revisions, and it refuses while those files hold work no revision
   * has. Nothing is ever collected: the revisions stay reachable either way. */
  it('discards a branch’s files only when they are all in a revision', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-discard-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-discard-config-'));
    roots.push(workspaceRoot, configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    const revisions = openProjectRevisions({ workspaceRoot, projectId: 'project-1' });
    try {
      const port = createProjectRevisionPort({ workspaceRoot, projectId: 'project-1' });
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      await port.setHead('main');
      const receipt = await port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 12) },
        summary: { generated: 'First' },
      });
      const head = revisionId(receipt.commitId);
      await port.updateRef({ name: 'main', expectedHead: undefined, head });
      const side = await port.addCheckout?.({ branch: 'side', from: head });

      // The project itself is never discardable.
      expect(await revisions.discard('main')).toMatchObject({ status: 'refused' });

      // Work that no revision holds stops the removal, and says why.
      await writeFile(join(side?.root ?? '', 'part.ts'), 'export const part = 2;\n');
      const dirty = await revisions.discard('side');
      expect(dirty.status).toBe('refused');
      expect(dirty.status === 'refused' && dirty.reason).toContain('not in a revision yet');
      expect(existsSync(join(side?.root ?? '', 'part.ts'))).toBe(true);

      // Put it back, and the same verb removes the files.
      await writeFile(join(side?.root ?? '', 'part.ts'), 'export const part = 1;\n');
      expect(await revisions.discard('side')).toMatchObject({ status: 'discarded' });
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
