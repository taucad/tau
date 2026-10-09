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
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentLauncher } from '@taucad/agent-host/launcher';

import { createNodeLauncher } from '#node-launcher.fixture.js';
import type { ToolRegistry, TurnPlacementPort } from '@taucad/agent-host';
import type { CommandAnswer } from '@taucad/agent-host/wire';
import { RevisionPortError, createIsomorphicGitRevisionPort, readRevisionLog } from '@taucad/revisions';
import { createNativeGitRevisionPort } from '@taucad/revisions/node';
import type { RevisionPort, RevisionStatusProjection, TurnAttemptKey } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import type { RevisionId } from '@taucad/revisions/algorithms';

import {
  createProjectRevisionPort,
  createProjectRevisions,
  openProjectRevisions,
  requireRevisionToolchain,
} from '#revisions.js';
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
/* A launcher closes first, so its attempts settle; then the tree records what is on disk and stops. */
const launchers: Array<Readonly<{ close: () => Promise<void> }>> = [];

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* The same `git` + `git lfs` probe the host refuses on (OQ-B8), so a machine
 * without `git-lfs` skips these rows instead of failing them. */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

type Harness = {
  readonly launcher: AgentLauncher;
  readonly workspaceRoot: string;
  readonly checkoutsDirectory: string;
  /** Where each admitted run works, exactly as an external agent port reads it. */
  readonly checkouts: Map<string, TurnCheckout>;
  /** Every host revision event, in order. */
  readonly events: HostRevisionEvent[];
  readonly settlementFor: (runId: string) => Promise<TurnFinalizedEvent>;
  readonly leaseIds: () => Promise<readonly string[]>;
  readonly refs: () => Promise<readonly string[]>;
  readonly port: RevisionPort;
  readonly revisions: ProjectRevisions;
  /** Every attempt the placement session was asked to admit, in order. */
  readonly admitted: TurnAttemptKey[];
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
    /** A chat's `turn`th gateway answer in place of the scripted one, when it returns one. */
    readonly respond?: (turn: number) => Response | undefined;
    /** A project an earlier host left behind, reopened as it is, in place of a new one. */
    readonly reopen?: Readonly<{ workspaceRoot: string; checkoutsDirectory: string }>;
    /** Wrap the placement session the launcher is given. */
    readonly wrapPlacement?: (placement: TurnPlacementPort) => TurnPlacementPort;
  } = {},
): Promise<Harness> => {
  const workspaceRoot = options.reopen?.workspaceRoot ?? (await mkdtemp(join(tmpdir(), 'tau-host-revisions-')));
  const checkoutsDirectory =
    options.reopen?.checkoutsDirectory ?? (await mkdtemp(join(tmpdir(), 'tau-host-checkouts-')));
  if (options.reopen === undefined) {
    roots.push(workspaceRoot, checkoutsDirectory);
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
  }
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
  /* The root's settlement, once M1 has appended its row and acknowledged it: the lease is gone, so the chat is free. */
  const settlementFor = async (runId: string): Promise<TurnFinalizedEvent> => {
    const pending = settlements.get(runId) ?? Promise.withResolvers<TurnFinalizedEvent>();
    settlements.set(runId, pending);
    const settlement = await pending.promise;
    await expect
      .poll(() => existsSync(join(workspaceRoot, '.tau', 'runs', `${runId}.json`)), { timeout: 10_000 })
      .toBe(false);
    return settlement;
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
  const placement = revisions.placement(() => toolRegistry);
  const admitted: TurnAttemptKey[] = [];
  const launcher = createNodeLauncher({
    workspaceRoot,
    gatewayBaseUrl: 'https://gateway.example',
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry,
    /* The grant's tools are this registry: the probe writes the live tree whatever the checkout (W8 TS-S4). */
    turnPlacement: (options.wrapPlacement ?? ((port: TurnPlacementPort) => port))({
      ...placement,
      admit: async (input) => {
        admitted.push(input.key);
        return placement.admit(input);
      },
    }),
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
      const failed = options.respond?.(turn);
      if (failed !== undefined) {
        return failed;
      }
      return sse(scriptedTurn(turn, options.toolTurns === 'every' ? turn % 2 === 0 : turn === 0));
    }) as unknown as typeof globalThis.fetch,
  });
  launchers.push({
    close: async () => {
      await launcher.close();
      await revisions.release();
    },
  });
  return {
    launcher,
    workspaceRoot,
    checkoutsDirectory,
    checkouts,
    events,
    settlementFor,
    port,
    revisions,
    admitted,
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
 * One run of `chat-1` as the launcher's ledger holds it.
 *
 * @param launcher - The recording launcher.
 * @param runId - The run.
 * @returns The run's entry, if the log has one.
 */
const runOf = async (launcher: AgentLauncher, runId = 'run-1') => {
  const ledger = await launcher.host.ledger('chat-1');
  return ledger.runs[runId];
};

/**
 * The settlement rows of one run of `chat-1`.
 *
 * @param launcher - The recording launcher.
 * @param runId - The run.
 * @returns The run's settlements, if the log has the run.
 */
const settlementsOf = async (launcher: AgentLauncher, runId = 'run-1') => {
  const run = await runOf(launcher, runId);
  return run?.settlements;
};

/**
 * Admit one Tau turn the way a client does.
 *
 * A start that lands while the chat's last attempt is still settling is refused
 * `CHAT_RUN_LIVE{settling}` (retry class `wait`), which the page re-sends until
 * it is admitted; so does this client. The window is real: the attempt's lease
 * file is gone before M1 hears the placement's acknowledge, so a start sent
 * right after `settlementFor` can land in it.
 *
 * @param launcher - The recording launcher.
 * @param turn - The chat and the client's idempotency key for the run.
 * @param until - When to stop re-sending and return the refusal as it is.
 * @returns The first answer that is not the settling refusal.
 */
const startTurn = async (
  launcher: AgentLauncher,
  turn: { readonly chatId: string; readonly runId: string; readonly checkoutId?: string },
  until = Date.now() + 10_000,
): Promise<CommandAnswer> => {
  const answer = await launcher.execute({
    type: 'start',
    commandId: `start-${turn.runId}`,
    payload: {
      trigger: 'submit',
      chatId: turn.chatId,
      runId: turn.runId,
      /* The person's placement choice (TS-R12); absent, the chat's last checkout, then the live one. */
      ...(turn.checkoutId === undefined ? {} : { checkoutId: turn.checkoutId }),
      message: {
        id: `message-${turn.runId}`,
        role: 'user',
        content: 'Double the size.',
      },
      config: { systemPrompt: 'You are Tau.', toolChoice: 'auto', model },
    },
  });
  if (
    answer.status === 'refused' &&
    answer.code === 'CHAT_RUN_LIVE' &&
    answer.details?.['state'] === 'settling' &&
    Date.now() < until
  ) {
    await delay(50);
    return startTurn(launcher, turn, until);
  }
  return answer;
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
    enabled: gitToolchainOnPath,
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
describe.runIf(gitToolchainOnPath)('a disk host that cannot record', () => {
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
        await expect(missing.release()).rejects.toThrow('no live checkout to record at close');
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
      /* The start is the host's own, so the record is read as text rather than
       * matched against a value the test would have to mint. */
      expect(leaseRecord).toMatch(/"startedAt":\s*\d+/u);
      /* RM-R10: the lease retires after the settlement is announced, on its acknowledgement. */
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);

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

    // W4.r1: a start re-sent under its key after the turn settled is `replayed`; the lease this call took is retired.
    it('retires the lease a replayed start admitted', async () => {
      const held = await harness(row.create);
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await held.settlementFor('run-1');
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);

      const replay = await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

      expect(replay.status).toBe('replayed');
      await expect.poll(async () => held.leaseIds(), { timeout: 5000 }).toEqual([]);
    }, 30_000);

    it('should compare exact raw bytes over the host channel without hiding read failures', async () => {
      let unavailableHead: string | undefined;
      const held = await harness(row.create, {
        wrapPort: (port) => ({
          ...port,
          readTree: async (id) => (id === unavailableHead ? undefined : port.readTree(id)),
        }),
      });
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      const settlement = await held.settlementFor('run-1');
      if (settlement.revisionId === undefined) {
        throw new Error('The fixture turn did not record a revision.');
      }
      const original = new TextEncoder().encode('export const size = 2;\n');
      const parentComparison = await held.revisions.channel.request({
        command: 'compare',
        revisionId: settlement.revisionId,
        path: 'main.ts',
      });
      expect(parentComparison.result).toMatchObject({
        original: 'export const size = 1;\n',
        modified: 'export const size = 2;\n',
        change: 'modified',
        kind: 'text',
      });
      await expect(
        held.revisions.channel.request({ command: 'diff', revisionId: settlement.revisionId, against: 'saved' }),
      ).rejects.toMatchObject({ code: 'INVALID_REVISION_REQUEST' });
      await expect(
        held.revisions.channel.request({
          command: 'compare',
          revisionId: settlement.revisionId,
          path: 'main.ts',
          against: 12,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_REVISION_REQUEST' });
      const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...original]);
      await writeFile(join(held.workspaceRoot, 'main.ts'), bom);
      const request = { command: 'compare', revisionId: settlement.revisionId, path: 'main.ts', against: 'checkout' };
      const comparison = await held.revisions.channel.request(request);
      expect(comparison.result).toEqual({
        original: 'export const size = 2;\n',
        modified: 'export const size = 2;\n',
        kind: 'text',
        change: 'modified',
        notices: ['encoding'],
      });
      const staged = '.main.ts.tau-staged.00000000-0000-0000-0000-000000000001.tmp';
      const backup = '.main.ts.tau-backup.00000000-0000-0000-0000-000000000001.tmp';
      await writeFile(join(held.workspaceRoot, staged), 'staging');
      await writeFile(join(held.workspaceRoot, backup), 'backup');
      await writeFile(join(held.workspaceRoot, 'new.ts'), 'export {};');
      const live = await held.revisions.channel.request({
        command: 'diff',
        revisionId: settlement.revisionId,
        against: 'checkout',
      });
      expect(live.result).not.toEqual(expect.arrayContaining([{ path: staged, kind: 'added' }]));
      expect(live.result).not.toEqual(expect.arrayContaining([{ path: backup, kind: 'added' }]));
      expect(live.result).toEqual(
        expect.arrayContaining([
          { path: 'new.ts', kind: 'added' },
          { path: 'main.ts', kind: 'modified' },
        ]),
      );
      await writeFile(join(held.workspaceRoot, 'main.ts'), original);
      const reverted = await held.revisions.channel.request({
        command: 'diff',
        revisionId: settlement.revisionId,
        against: 'checkout',
      });
      expect(reverted.result).not.toEqual(expect.arrayContaining([{ path: 'main.ts', kind: 'modified' }]));
      await unlink(join(held.workspaceRoot, 'main.ts'));
      const compared1 = await held.revisions.channel.request(request);
      expect(compared1.result).toMatchObject({ change: 'deleted', modified: '' });
      await mkdir(join(held.workspaceRoot, 'main.ts'));
      await writeFile(join(held.workspaceRoot, 'main.ts', 'child.ts'), 'export {};');
      const directoryPaths = await held.revisions.channel.request({
        command: 'diff',
        revisionId: settlement.revisionId,
        against: 'checkout',
      });
      expect(directoryPaths.result).toEqual(
        expect.arrayContaining([
          { path: 'main.ts', kind: 'deleted' },
          { path: 'main.ts/child.ts', kind: 'added' },
        ]),
      );
      const directoryComparison = await held.revisions.channel.request(request);
      expect(directoryComparison.result).toMatchObject({
        change: 'deleted',
        original: 'export const size = 2;\n',
        modified: '',
      });
      await rm(join(held.workspaceRoot, 'main.ts'), { recursive: true });
      await writeFile(join(held.workspaceRoot, 'main.ts'), new Uint8Array());
      const compared2 = await held.revisions.channel.request(request);
      expect(compared2.result).toMatchObject({
        change: 'modified',
        modified: '',
      });
      await writeFile(join(held.workspaceRoot, 'empty.ts'), new Uint8Array());
      const compared3 = await held.revisions.channel.request({ ...request, path: 'empty.ts' });
      expect(compared3.result).toMatchObject({
        change: 'added',
        notices: ['empty-added'],
      });
      await writeFile(join(held.workspaceRoot, 'main.ts'), original);
      await chmod(join(held.workspaceRoot, 'main.ts'), 0o755);
      const compared4 = await held.revisions.channel.request(request);
      expect(compared4.result).toMatchObject({ notices: ['executable-added'] });
      await writeFile(join(held.workspaceRoot, 'main.ts'), new Uint8Array([0x80]));
      const compared5 = await held.revisions.channel.request(request);
      expect(compared5.result).toMatchObject({ kind: 'unsupported' });
      const [, older] = await held.revisions.history.log();
      unavailableHead = settlement.revisionId;
      await expect(held.revisions.channel.request({ ...request, revisionId: older!.revisionId })).rejects.toThrow(
        'checkout head',
      );
      await expect(
        held.revisions.channel.request({ command: 'diff', revisionId: older!.revisionId, against: 'checkout' }),
      ).rejects.toThrow('checkout head');
      unavailableHead = undefined;
      await expect(held.revisions.channel.request({ ...request, revisionId: 'unknown-revision' })).rejects.toThrow();
      await expect(
        held.revisions.channel.request({ command: 'compare', revisionId: 'unknown-revision', path: 'main.ts' }),
      ).rejects.toThrow();
      const failure = new Error('Device read failed');
      const providerRead = NodeFsProvider.prototype.readFile;
      const read = vi
        .spyOn(NodeFsProvider.prototype, 'readFile')
        .mockImplementation(async function (this: NodeFsProvider, path, options) {
          if (path === 'main.ts') {
            throw failure;
          }
          return providerRead.call(this, path, options);
        });
      await expect(held.revisions.channel.request(request)).rejects.toBe(failure);
      read.mockRestore();
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
        line: { kind: 'branch', name: 'main' },
      });
      /* One revision by id, and how far two heads have gone apart: History's
       * pinned rows and the Branches region, without reading a whole log. */
      const head = String(settlement.revisionId);
      const one = await held.revisions.channel.request({ command: 'log', from: head, limit: 1 });
      const record = await held.port.readRevision(revisionId(head));
      expect(one.result).toEqual([expect.objectContaining({ revisionId: head, treeId: record?.treeId })]);
      const parent = String(record?.parents[0]);
      await expect(
        held.revisions.channel.request({ command: 'divergence', head, base: parent }),
      ).resolves.toMatchObject({ result: { ahead: 1, behind: 0 } });
      await expect(held.revisions.channel.request({ command: 'open' })).resolves.toMatchObject({
        status: { projectId: 'project-1' },
      });

      /* B7 (W8 TS-S5): the verb answers with the checkout the registry made, never on a bound. */
      const created = (await held.revisions.channel.request({
        command: 'createBranch',
        name: 'isolated-run',
      })) as Readonly<{ result: unknown }>;
      expect(created.result).toMatchObject({
        branch: 'isolated-run',
        checkoutId: expect.any(String) as unknown,
        /* The registry's own root, as the branch toast carries it. */
        checkoutRoot: expect.any(String) as unknown,
      });
      await expect
        .poll(() => held.revisions.status().branches.map((branch) => branch.name), { timeout: 10_000 })
        .toContain('isolated-run');
      await held.revisions.channel.request({
        command: 'switch',
        branch: 'isolated-run',
      });
      await expect
        .poll(() => held.revisions.status().line, { timeout: 10_000 })
        .toEqual({ kind: 'branch', name: 'isolated-run' });
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

      /* The page sends the person's checkout with the start; the switch alone places nothing (TS-R12). */
      await startTurn(held.launcher, {
        chatId: 'chat-2',
        runId: 'run-2',
        ...(held.revisions.status().checkoutId === undefined ? {} : { checkoutId: held.revisions.status().checkoutId }),
      });
      await expect.poll(() => held.checkouts.get('run-2'), { timeout: 10_000 }).toBeDefined();
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
          value: { projectId: 'project-1', line: { kind: 'branch', name: 'isolated-run' } },
        },
      });
      abort.abort();
    }, 30_000);

    /* L2-F4: linked checkouts live in this host's data directory, outside the
     * workspace, so a watcher on the workspace alone never saw their writes —
     * no dirty state, no idle revision, no write-generation guard. Native only:
     * the isomorphic row's linked checkout is a route, not a directory. */
    it.runIf(row.name === 'native-git')(
      'raises a write under a linked checkout against that checkout (L2-F4)',
      async () => {
        const held = await harness(row.create);
        await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
        await held.settlementFor('run-1');
        await held.revisions.channel.request({ command: 'createBranch', name: 'isolated-run' });
        await expect
          .poll(() => held.revisions.status().branches.some((branch) => branch.name === 'isolated-run'), {
            timeout: 10_000,
          })
          .toBe(true);
        const checkouts = await held.port.listCheckouts?.();
        const linked = checkouts?.find((checkout) => checkout.kind === 'linked');
        expect(linked).toBeDefined();
        const changed = vi.spyOn(held.revisions, 'changed');

        await writeFile(join(linked?.root ?? '', 'part.ts'), 'export const part = 1;\n');

        /* Raised against the checkout whose root it landed in, never the live one. */
        await expect.poll(() => changed.mock.calls, { timeout: 10_000 }).toContainEqual([linked?.id, ['part.ts']]);
        expect(changed.mock.calls.filter(([, paths]) => paths.includes('part.ts'))).toEqual([
          [linked?.id, ['part.ts']],
        ]);
      },
      30_000,
    );

    /* The close ruling: letting a project go records every dirty checkout, live
     * and linked, not only the live one. Native only, like L2-F4 above. */
    it.runIf(row.name === 'native-git')(
      'records a dirty linked checkout when the host lets the project go (close ruling)',
      async () => {
        const held = await harness(row.create);
        await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
        await held.settlementFor('run-1');
        await held.revisions.channel.request({ command: 'createBranch', name: 'isolated-run' });
        await expect
          .poll(() => held.revisions.status().branches.some((branch) => branch.name === 'isolated-run'), {
            timeout: 10_000,
          })
          .toBe(true);
        const checkouts = await held.port.listCheckouts?.();
        const linked = checkouts?.find((checkout) => checkout.kind === 'linked');
        const changed = vi.spyOn(held.revisions, 'changed');
        const before = await readRevisionLog(held.port, { branch: 'isolated-run' });
        await writeFile(join(linked?.root ?? '', 'part.ts'), 'export const part = 1;\n');
        await expect.poll(() => changed.mock.calls, { timeout: 10_000 }).toContainEqual([linked?.id, ['part.ts']]);

        await held.revisions.channel.request({ command: 'quiesce' });

        const after = await readRevisionLog(held.port, { branch: 'isolated-run' });
        expect(after).toHaveLength(before.length + 1);
        expect(after[0]).toMatchObject({ trigger: 'close' });
      },
      30_000,
    );

    /* M3: the host's save channel is the worker's. A *Save* another writer beat
     * says so, and a close that loses its CAS lets the project go at once
     * rather than holding quit for the whole bound. */
    it('answers a lost save on the save channel, and settles a lost close at once (M3)', async () => {
      let lose = false;
      const held = await harness(row.create, {
        wrapPort: (port) => ({
          ...port,
          updateRef: async (input) =>
            lose
              ? {
                  status: 'conflicted',
                  name: input.name,
                  expectedHead: input.expectedHead,
                  actualHead: input.expectedHead,
                  proposedHead: input.head,
                }
              : port.updateRef(input),
        }),
      });
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await held.settlementFor('run-1');
      const abort = new AbortController();
      const frames: Array<Readonly<{ kind: string; value: unknown }>> = [];
      const reading = (async (): Promise<void> => {
        for await (const frame of held.revisions.channel.events(abort.signal)) {
          frames.push(frame);
        }
      })();
      try {
        lose = true;
        await writeFile(join(held.workspaceRoot, 'main.ts'), 'export const size = 42;\n');
        await held.revisions.channel.request({ command: 'saveRevision' });

        await expect
          .poll(() => frames.find((frame) => frame.kind === 'toast'), { timeout: 10_000 })
          .toMatchObject({ kind: 'toast', value: { type: 'error', subject: 'save', code: 'CAS_LOST' } });

        const started = Date.now();
        await expect(held.revisions.channel.request({ command: 'quiesce' })).rejects.toThrow(
          /moved this branch first/u,
        );
        expect(Date.now() - started).toBeLessThan(4000);
      } finally {
        lose = false;
        abort.abort();
        await reading.catch(() => undefined);
      }
    }, 30_000);

    /* RV-W2b #2: a terminally failed sync is already in the durable record and
     * on the Sync region; it must not hold every close for ever. */
    it('lets a project go when its sync has failed, keeping the refusal in the projection', async () => {
      const held = await harness(row.create, {
        wrapPort: (port) => ({
          ...port,
          listRemotes: async () => [{ name: 'origin', kind: 'git', url: 'https://git.example.invalid/project.git' }],
          listRemoteRefs: async () => {
            throw new RevisionPortError('REMOTE_DAMAGED', "Tau: this project's cloud copy is damaged");
          },
        }),
      });
      await expect.poll(() => held.revisions.status().sync.state, { timeout: 10_000 }).toBe('failed');

      await expect(held.revisions.channel.request({ command: 'quiesce' })).resolves.toMatchObject({ result: null });
      expect(held.revisions.status().sync).toMatchObject({ state: 'failed', reason: 'damaged' });
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
      /* The start is answered at its intent row; its placement follows (TS-R8). */
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toContain('run-2.json');
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
      /* RM-R10: the lease retires after the settlement is announced, on its acknowledgement. */
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);

      /* AC9's other half: the settlement names every lease on the checkout, and
       * the revision itself still carries the run that minted it — the case
       * where a naive "one lease, one run" rule would drop attribution. */
      // The settlement lists its lease run ids sorted (revision-effects), not in lease order.
      expect(secondSettlement.runIds).toEqual(['run-1', 'run-2']);
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

    /* TS-Q9, TS-R3: a result cut the store refuses keeps the lease while M1 backs off; the next cut settles it. */
    it('should keep the lease while the store refuses the turn revision, and settle once it takes it', async () => {
      let refusing = true;
      const held = await harness(row.create, {
        /* The turn's result mint fails; the dirty-base pre-mint before it succeeds, told apart by order. */
        wrapPort: (() => {
          let agentWrites = 0;
          return (port) => ({
            ...port,
            writeRevision: async (input) => {
              if (input.provenance.source === 'agent') {
                agentWrites += 1;
                if (agentWrites > 1 && refusing) {
                  throw new Error('the store refused the turn’s revision');
                }
              }
              return port.writeRevision(input);
            },
          });
        })(),
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

      await expect
        .poll(async () => runOf(held.launcher).then((run) => run?.lifecycle), { timeout: 10_000 })
        .toBe('completed');
      /* The cut is refused and retried: no settlement row, and the lease holds the checkout. */
      expect(await settlementsOf(held.launcher)).toEqual([]);
      expect(await held.leaseIds()).toEqual(['run-1.json']);

      refusing = false;
      const settlement = await held.settlementFor('run-1');

      expect(settlement.revisionId).toMatch(/^[\da-f]{40}$/u);
      expect(await settlementsOf(held.launcher)).toHaveLength(1);
      expect(held.events.filter((event) => event.type === 'turn.failed')).toEqual([]);
    }, 30_000);

    /* TS-A5, TS-S7, I25: no epoch sweep, so a second host over the project reads the live lease and leaves it. */
    it("should not retire a live tab's lease when a second tab opens the project", async () => {
      let leasesAfterSecondOpen: readonly string[] = [];
      const held = await harness(row.create, {
        duringTurn: async (workspaceRoot) => {
          const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-checkouts-'));
          roots.push(checkoutsDirectory);
          const second = createProjectRevisions({
            workspaceRoot,
            projectId: 'project-1',
            port: row.create(workspaceRoot, checkoutsDirectory),
          });
          /* The second registry has read the lease: what survives its open is measured, never waited out. */
          await expect
            .poll(() => second.status().branches.find((branch) => branch.name === 'main')?.leaseChatIds, {
              timeout: 10_000,
            })
            .toEqual(['chat-1']);
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

    /*
     * A host whose agent host dies after the root cut (W6 RH-R14): its launcher closes, its revisions root lives on and
     * holds the attempt's lease; the next host over the project opens beside it.
     */
    const holderAndNext = async (): Promise<Readonly<{ holder: Harness; next: Harness; refusals: string[] }>> => {
      const cut = Promise.withResolvers<void>();
      const holder = await harness(row.create, {
        wrapPlacement: (placement) => ({
          ...placement,
          complete: async (input) => {
            await placement.complete(input);
            cut.resolve();
            return { requestId: input.requestId, status: 'refused', code: 'SESSION_FENCED', message: 'The host died.' };
          },
        }),
      });
      await startTurn(holder.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await cut.promise;
      await holder.launcher.close();
      const refusals: string[] = [];
      const next = await harness(row.create, {
        reopen: { workspaceRoot: holder.workspaceRoot, checkoutsDirectory: holder.checkoutsDirectory },
        wrapPlacement: (placement) => ({
          ...placement,
          complete: async (input) => {
            const answer = await placement.complete(input);
            if (answer.status === 'refused') {
              refusals.push(answer.code);
            }
            return answer;
          },
        }),
      });
      return { holder, next, refusals };
    };

    /* TS-A14, I25, RM-R8 (W8.r1 H1): only the holder root settles its attempt; the next leader waits on its mark. */
    it("should not settle or retire another tab's attempt while that tab's revisions root lives, after a steal and after its agent-host worker dies", async () => {
      const { holder, next, refusals } = await holderAndNext();

      await expect.poll(() => refusals, { timeout: 20_000 }).toContain('LEASE_HELD_ELSEWHERE');
      expect(await settlementsOf(next.launcher)).toEqual([]);
      expect(await next.leaseIds()).toEqual(['run-1.json']);

      /* The holder's tab closes: its mark is free, the queued wait reports the lease, and the next leader settles it. */
      await holder.revisions.release();
      await expect
        .poll(async () => settlementsOf(next.launcher).then((settlements) => settlements?.length), { timeout: 20_000 })
        .toBe(1);
      await expect.poll(async () => next.leaseIds(), { timeout: 10_000 }).toEqual([]);
      const settled = await settlementsOf(next.launcher);
      expect(settled?.[0]).toMatchObject({
        attempt: 1,
        event: { type: 'turn.finalized' },
      });
    }, 60_000);

    /* TS-A5: a save the live lease refuses reports it; the lease is reconciled once its tab closes, and the save then mints. */
    it("should reconcile a closed tab's lease after the open tab's save is refused", async () => {
      const { holder, next, refusals } = await holderAndNext();
      await writeFile(join(next.workspaceRoot, 'main.ts'), 'export const size = 9;\n');
      await next.revisions.channel.request({ command: 'saveRevision', requestId: 'save-1' });

      /* The refused save and the opening both reconcile, and the live holder's lease refuses both. */
      await expect.poll(() => refusals, { timeout: 20_000 }).toContain('LEASE_HELD_ELSEWHERE');
      expect(await next.leaseIds()).toEqual(['run-1.json']);

      await holder.revisions.release();

      await expect.poll(async () => next.leaseIds(), { timeout: 20_000 }).toEqual([]);
      expect(await settlementsOf(next.launcher)).toHaveLength(1);
    }, 60_000);

    /* TS-A4, TS-S7: the next host's reconciliation, not a sweep, settles an attempt a host died holding. */
    it('should append the row and retire the lease when the host starts after a crash between the cut and the row', async () => {
      const cut = Promise.withResolvers<void>();
      const crashed = await harness(row.create, {
        wrapPlacement: (placement) => ({
          ...placement,
          complete: async (input) => {
            await placement.complete(input);
            cut.resolve();
            /* The host dies here: the root has cut and settled, and M1 hears only its session end, so no `turn.*` row. */
            return { requestId: input.requestId, status: 'refused', code: 'SESSION_FENCED', message: 'The host died.' };
          },
        }),
      });
      await startTurn(crashed.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await cut.promise;
      await crashed.launcher.close();
      await crashed.revisions.release();
      expect(await settlementsOf(crashed.launcher)).toEqual([]);
      expect(await crashed.leaseIds()).toEqual(['run-1.json']);

      const next = await harness(row.create, {
        reopen: { workspaceRoot: crashed.workspaceRoot, checkoutsDirectory: crashed.checkoutsDirectory },
      });

      await expect
        .poll(async () => settlementsOf(next.launcher).then((settlements) => settlements?.length), {
          timeout: 20_000,
        })
        .toBe(1);
      await expect.poll(async () => next.leaseIds(), { timeout: 10_000 }).toEqual([]);
      const [settlement] = (await settlementsOf(next.launcher)) ?? [];
      expect(settlement).toMatchObject({ attempt: 1, event: { type: 'turn.finalized' } });
      expect(next.admitted).toEqual([]);
    }, 60_000);

    /* HD-3, TS-R9: a refusal is `admit`'s answer, so the run ends with its code at once, not at a 30 s bound. */
    it('should answer a refused placement at once', async () => {
      const held = await harness(row.create, {
        /* The dirty base cannot be minted, so placement refuses before the agent could write (TS-R1). */
        wrapPort: (port) => ({
          ...port,
          writeRevision: async () => {
            throw new Error('the store is out of space');
          },
        }),
      });

      const answer = await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

      expect(answer.status).toBe('applied');
      await expect
        .poll(async () => runOf(held.launcher), { timeout: 5000 })
        .toMatchObject({ lifecycle: 'failed', failure: { code: 'BASE_CUT_FAILED' } });
      /* The `turn.failed` row may follow the lifecycle row in a later batch. */
      await expect
        .poll(async () => settlementsOf(held.launcher).then((settlements) => settlements?.length), {
          timeout: 5000,
        })
        .toBe(1);
      const ledger = await held.launcher.host.ledger('chat-1');
      expect(ledger.runs['run-1']?.settlements).toEqual([
        expect.objectContaining({
          attempt: 1,
          event: expect.objectContaining({ type: 'turn.failed', code: 'BASE_CUT_FAILED' }) as unknown,
        }),
      ]);
      expect(await held.leaseIds()).toEqual([]);
      expect(await readFile(join(held.workspaceRoot, 'main.ts'), 'utf8')).toBe('export const size = 1;\n');
      /* The close cut cannot mint either, and says why. */
      const closing = launchers.pop();
      await expect(closing?.close()).rejects.toThrow('out of space');
    }, 20_000);

    /* HD-4, TS-R8: a replayed start is answered from the ledger's applied set before any placement. */
    it('should answer a replayed start of a settled run without placing it', async () => {
      const held = await harness(row.create);
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await held.settlementFor('run-1');
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);

      const replay = await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });

      expect(replay.status).toBe('replayed');
      expect(held.admitted.map(({ runId, attempt }) => `${runId}/${String(attempt)}`)).toEqual(['run-1/1']);
      expect(await held.leaseIds()).toEqual([]);
      expect(held.events.filter((event) => event.type === 'turn.finalized')).toHaveLength(1);
    }, 30_000);

    /* HD-5, TS-R8: reservation comes before placement, so a busy chat is refused before any lease. */
    it('should refuse a busy chat before placement', async () => {
      const busy = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const held = await harness(row.create, {
        duringTurn: async () => {
          busy.resolve();
          await release.promise;
        },
      });
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await busy.promise;

      const second = await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-2' });

      expect(second).toMatchObject({ status: 'refused', code: 'CHAT_RUN_LIVE' });
      expect(await held.leaseIds()).toEqual(['run-1.json']);
      expect(held.admitted.map(({ runId }) => runId)).toEqual(['run-1']);
      release.resolve();
      await held.settlementFor('run-1');
    }, 30_000);

    /* HD-6, TS-R9: M1's terminal transition calls `complete` itself; the host follows no chat to settle it. */
    it('should settle every turn without an event watch', async () => {
      const held = await harness(row.create, { toolTurns: 'every' });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await held.settlementFor('run-1');
      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-2' });
      await held.settlementFor('run-2');
      await startTurn(held.launcher, { chatId: 'chat-2', runId: 'run-3' });
      await held.settlementFor('run-3');

      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);
      const first = await held.launcher.host.ledger('chat-1');
      const second = await held.launcher.host.ledger('chat-2');
      /* One settlement row per attempt, appended by M1 and acknowledged (TS-R18). */
      expect(
        [first, second].flatMap((ledger) =>
          Object.entries(ledger.runs).flatMap(([runId, entry]) =>
            entry.settlements.map((settlement) => `${runId}/${String(settlement.attempt)}:${settlement.event.type}`),
          ),
        ),
      ).toEqual(['run-1/1:turn.finalized', 'run-2/1:turn.finalized', 'run-3/1:turn.finalized']);
    }, 30_000);

    /* TS-A12, TS-R10: a resting attempt is settled; the resumed attempt is admitted again under a new lease. */
    it('should settle a paused attempt and admit its resumed attempt with a new lease', async () => {
      const held = await harness(row.create, {
        /* The turn's closing request fails after the tool wrote: the run rests, resumable. */
        respond: (turn) => (turn === 1 ? new Response('upstream unavailable', { status: 503 }) : undefined),
      });

      await startTurn(held.launcher, { chatId: 'chat-1', runId: 'run-1' });
      await expect
        .poll(async () => settlementsOf(held.launcher).then((settlements) => settlements?.length), {
          timeout: 10_000,
        })
        .toBe(1);
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);
      const rested = await held.launcher.host.ledger('chat-1');
      expect(rested.runs['run-1']).toMatchObject({ lifecycle: 'failed', attempt: 1 });

      const resumed = await held.launcher.execute({
        type: 'resume',
        commandId: 'resume-run-1',
        payload: { chatId: 'chat-1', runId: 'run-1' },
      });

      expect(resumed.status).toBe('applied');
      await expect
        .poll(async () => settlementsOf(held.launcher).then((settlements) => settlements?.length), {
          timeout: 10_000,
        })
        .toBe(2);
      await expect.poll(async () => held.leaseIds(), { timeout: 10_000 }).toEqual([]);
      const settled = await held.launcher.host.ledger('chat-1');
      expect(settled.runs['run-1']?.settlements.map(({ attempt, event }) => [attempt, event.type])).toEqual([
        [1, 'turn.finalized'],
        [2, 'turn.finalized'],
      ]);
      expect(held.admitted.map(({ attempt }) => attempt)).toEqual([1, 2]);
    }, 30_000);
  });
}

/* W9 pin (a): every disk host — the Electron utility, `tau serve` and the CLI —
 * records into the same store, because they all reach `createProjectRevisions`
 * without a port and that default is native Git over the project directory,
 * with linked checkouts in the host's own data directory. No mode exists to
 * choose (S12, A10, D9). */
describe.runIf(gitToolchainOnPath)('the disk-host default', () => {
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
  it.runIf(gitToolchainOnPath)(
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
  it.runIf(gitToolchainOnPath)(
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
  it.runIf(gitToolchainOnPath)(
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
      /* A branch the live checkout already holds is refused however soon the
         registry answers — any refused verb proves the relay, and this one
         needs no turn to have run. The verb itself is refused with the tree's
         code (B7), and the toast still reaches the pane. */
      await expect(revisions.channel.request({ command: 'createBranch', name: 'main' })).rejects.toMatchObject({
        code: expect.any(String) as unknown,
      });

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
            branch: 'main',
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

  /* Asked the moment the project opens, before its registry has loaded: the
     registry dropped the verb, and the pane waited out the 30 s bound (W4 a3b). */
  it('answers a branch from an unknown base asked for as the project opens', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-branch-early-'));
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
      /* The verb itself is refused with the tree's code (B7), and the toast still reaches the pane. */
      await expect(
        revisions.channel.request({ command: 'createBranch', name: 'feature', from: 'no-such-revision' }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_REVISION' });

      await expect
        .poll(() => frames.find((frame) => frame.kind === 'toast'), { timeout: 5000 })
        .toMatchObject({ kind: 'toast', value: { type: 'error', branch: 'feature', code: 'UNKNOWN_REVISION' } });
    } finally {
      abort.abort();
      await reading.catch(() => undefined);
      await revisions.release();
    }
  }, 30_000);
});

describe('a restore refusal over the host channel', () => {
  it('carries the refusal code, not only a sentence', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-restore-refusal-'));
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
      await expect.poll(() => revisions.status().checkoutId, { timeout: 10_000 }).toBeDefined();
      /* A revision this store never held: the cheapest refusal a restore mints. */
      await revisions.channel.request({ command: 'restore', revisionId: '0'.repeat(40) });

      await expect
        .poll(
          () =>
            frames.find(
              (frame) =>
                frame.kind === 'toast' && (frame.value as { type?: string; subject?: string }).subject === 'restore',
            ),
          { timeout: 10_000 },
        )
        .toMatchObject({
          kind: 'toast',
          value: {
            type: 'error',
            subject: 'restore',
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

describe('an editor conflict over the host channel (D14)', () => {
  it('records an unmergeable edit on this device’s conflict line, and says when there is nothing to record', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-editor-conflict-'));
    roots.push(workspaceRoot);
    const port = createIsomorphicGitRevisionPort({
      filesystem: new NodeFsProvider(workspaceRoot),
      checkouts: { projectId: 'project-1', root: () => new NodeFsProvider(workspaceRoot) },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const record = async (parents: readonly string[], content: string): Promise<RevisionId> => {
      const { commitId } = await port.writeRevision({
        parents: parents.map((parent) => revisionId(parent)),
        tree: new ImmutableRevisionTree([['a.txt', new TextEncoder().encode(content)]]),
        provenance: { source: 'user', actorId: 'test', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: content },
      });
      return revisionId(commitId);
    };
    const base = await record([], 'base\n');
    const head = await record([base], 'theirs\n');
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    await port.setHead('main');
    await writeFile(join(workspaceRoot, 'a.txt'), 'theirs\n');
    const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1', port });
    try {
      await revisions.channel.request({ command: 'open' });

      await expect(
        revisions.channel.request({ command: 'recordEditorConflict', path: 'a.txt', base: 'theirs\n', mine: 'x\n' }),
      ).resolves.toMatchObject({ result: { status: 'unchanged' } });
      const answer = (await revisions.channel.request({
        command: 'recordEditorConflict',
        path: 'a.txt',
        base: 'base\n',
        mine: 'mine\n',
      })) as unknown as { result: { status: string; line: string; into: string; revisionId: string } };

      expect(answer.result).toMatchObject({ status: 'recorded', into: 'main' });
      expect(answer.result.line).toMatch(/^conflicts\/main\/[\w.-]+$/u);
      expect(await port.readRef(answer.result.line)).toBe(answer.result.revisionId);
      const recorded = await port.readRevision(revisionId(answer.result.revisionId));
      expect(recorded?.parents[0]).toBe(head);
      /* Nothing reaches the files or main. */
      expect(await port.readRef('main')).toBe(head);
      expect(await readFile(join(workspaceRoot, 'a.txt'), 'utf8')).toBe('theirs\n');
    } finally {
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
describe.runIf(gitToolchainOnPath)('a Tau-managed remote credential over the host channel', () => {
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
