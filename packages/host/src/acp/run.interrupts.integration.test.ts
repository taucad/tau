/**
 * What happens to an approval nobody is going to answer.
 *
 * Two ends of one seam, both of them terminal states a user has to be able to
 * reach: a run that dies with a `session/request_permission` outstanding, and a
 * cancel issued while the agent is waiting on one (V8). The cases live beside
 * `run.integration.test.ts` rather than in it — that file is already over
 * `max-lines` — and stand up the same composition it does, minus the MCP
 * endpoint and the stub API neither case reads.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { captureChatLogs, chatLogDestination } from '@taucad/formal/capture';

import type { AgentLauncher } from '@taucad/agent-host/launcher';

import { createNodeLauncher } from '#node-launcher.fixture.js';
import type { AgentLogEvent, ToolRegistry } from '@taucad/agent-host';

import { createAcpExternalAgentPort } from '#acp/run.js';
import type { AcpAdapter } from '#acp/registry.js';

const fakeAgent: AcpAdapter = {
  id: 'codex',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  displayName: 'Codex',
  modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
};

const registry: ToolRegistry = {
  list: () => [],
  invoke: async () => ({ content: {}, isError: false }),
};

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown order is the invariant under test.
    await close();
  }
  /* Field trace validation: keep each chat log before its root goes (formal:nightly). */
  const chatLogs = chatLogDestination('host', expect.getState().testPath);
  await Promise.all(roots.map(async (root) => captureChatLogs(root, chatLogs)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * One external-capable launcher over its own project root.
 *
 * @param from - A project root to copy first: the durable state a restarted host finds.
 */
const startHarness = async (
  from?: string,
): Promise<{ readonly launcher: AgentLauncher; readonly workspaceRoot: string }> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-interrupts-'));
  roots.push(workspaceRoot);
  await (from === undefined
    ? writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n', 'utf8')
    : cp(from, workspaceRoot, { recursive: true }));
  const launcher = createNodeLauncher({
    workspaceRoot,
    /* Never dialled: an external turn never reaches the gateway. */
    gatewayBaseUrl: 'http://127.0.0.1:1/',
    model: { id: 'unused-by-external-runs', contextWindow: 1000 },
    systemPrompt: 'unused by external runs',
    toolRegistry: registry,
    externalAgents: createAcpExternalAgentPort({ agents: [fakeAgent], workspaceRoot }),
  });
  closers.push(async () => launcher.close());
  return { launcher, workspaceRoot };
};

const readLog = async (workspaceRoot: string, chatId: string): Promise<readonly AgentLogEvent[]> => {
  const raw = await readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
  return (
    raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the log this test just wrote is the vocabulary by construction.
      .map((line) => JSON.parse(line) as AgentLogEvent)
  );
};

const lifecycleOf = (events: readonly AgentLogEvent[]): readonly string[] =>
  events.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []));

/**
 * Poll a condition, bounded, so a hung agent fails as a timeout and not a hang.
 *
 * @param predicate - Condition to wait for.
 * @param label - What is being waited on.
 * @param dump - Diagnostics for the failure message.
 */
const until = async (
  predicate: () => Promise<boolean>,
  label: string,
  dump: () => Promise<unknown> = async () => undefined,
): Promise<void> => {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    if (await predicate()) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}. Log: ${JSON.stringify(await dump())}`);
};

const interruptsOf = (
  events: readonly AgentLogEvent[],
): ReadonlyArray<Extract<AgentLogEvent, { readonly type: 'interrupt.recorded' }>> =>
  events.flatMap((event) => (event.type === 'interrupt.recorded' ? [event] : []));

describe('an approval nobody answers', () => {
  it('settles the interrupt an external run left outstanding when it died', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-abandoned-approval';
    const runId = 'run-abandoned-approval';

    await launcher.execute({
      type: 'start',
      commandId: 'cmd-1',
      payload: {
        trigger: 'submit',
        chatId,
        runId,
        message: { id: 'user-1', role: 'user', content: 'abandon this turn' },
        config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
      },
    });
    await until(
      async () => lifecycleOf(await readLog(workspaceRoot, chatId)).some((state) => state === 'failed'),
      'the failed lifecycle marker',
      async () => readLog(workspaceRoot, chatId),
    );

    const events = await readLog(workspaceRoot, chatId);
    const interrupts = interruptsOf(events);
    const requested = interrupts.find((event) => event.phase === 'requested');
    expect(requested).toBeDefined();
    /* The whole point: the durable record the four `approval-requested`
     * consumers read is settled, so the chat does not keep a dead run's
     * permission on screen forever (5-review S1). */
    expect(interrupts.filter((event) => event.phase === 'resolved')).toContainEqual(
      expect.objectContaining({ interruptId: requested?.interruptId, reason: 'cancelled' }),
    );
    /* Ahead of the terminal marker, because the drain runs before the record
     * that ends the run: a client stops reading on that marker. */
    expect(events.findIndex((event) => event.type === 'interrupt.recorded' && event.phase === 'resolved')).toBeLessThan(
      events.findIndex((event) => event.type === 'run.lifecycle' && event.state === 'failed'),
    );
    // Nothing is left in the live index either, so the `waiting` map does not leak.
    expect(await launcher.pendingInterrupts(runId)).toEqual([]);
  }, 90_000);

  it('reaches a terminal state when a cancel arrives with a permission outstanding', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-cancel-with-approval';
    const runId = 'run-cancel-with-approval';

    await launcher.execute({
      type: 'start',
      commandId: 'cmd-1',
      payload: {
        trigger: 'submit',
        chatId,
        runId,
        message: { id: 'user-1', role: 'user', content: 'write the file please' },
        config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
      },
    });
    await until(
      async () => {
        const pending = await launcher.pendingInterrupts(runId);
        return pending.length > 0;
      },
      'the approval request',
      async () => readLog(workspaceRoot, chatId),
    );

    /* Bounded on purpose: without the cancel settling the outstanding request
     * the runner's turn stays suspended inside `approve`, and `cancel` — which
     * observes settlement (D12) — never returns at all. */
    await expect(
      Promise.race([
        launcher.execute({ type: 'cancel', commandId: 'cmd-2', payload: { chatId, runId } }).then(() => 'settled'),
        delay(15_000, 'hung'),
      ]),
    ).resolves.toBe('settled');

    const events = await readLog(workspaceRoot, chatId);
    expect(lifecycleOf(events)).toContain('cancelled');
    expect(interruptsOf(events)).toContainEqual(expect.objectContaining({ phase: 'resolved', reason: 'cancelled' }));
    expect(await launcher.pendingInterrupts(runId)).toEqual([]);
  }, 90_000);

  /*
   * EA-S8 (W10 EA-A9): no child and no adapter survives a restart, so a durable `requested` row
   * without its `resolved` row is an orphan.
   */
  /**
   * @param samePath - Whether the restarted host finds the project where the first left it, as a real restart does:
   *   the copy's durable records then name its own root, so the remembered session's cwd still matches.
   */
  const orphan = async (samePath = false) => {
    const first = await startHarness();
    const chatId = 'chat-orphaned-approval';
    const runId = 'run-orphaned-approval';
    await first.launcher.execute({
      type: 'start',
      commandId: 'cmd-1',
      payload: {
        trigger: 'submit',
        chatId,
        runId,
        message: { id: 'user-1', role: 'user', content: 'write the file please' },
        config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
      },
    });
    await until(
      async () => lifecycleOf(await readLog(first.workspaceRoot, chatId)).includes('paused'),
      'the durable pause',
      async () => readLog(first.workspaceRoot, chatId),
    );
    /* The crash: the durable state at the pause, under a host that never saw the run. */
    const restarted = await startHarness(first.workspaceRoot);
    if (samePath) {
      const log = join(restarted.workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl');
      const copied = await readFile(log, 'utf8');
      await writeFile(log, copied.replaceAll(first.workspaceRoot, restarted.workspaceRoot));
    }
    /* `attach` is a read (RH-R1), but a paused external run with no driver is an orphan (M1's `isOrphaned`): the
     * attach asks leadership to claim, and the claim's rehydration settles it (W7 RA-S14, RH-R9). */
    await expect(
      restarted.launcher.execute({ type: 'attach', commandId: 'cmd-2', payload: { chatId } }),
    ).resolves.toMatchObject({ details: { takeover: true } });
    await until(
      async () => lifecycleOf(await readLog(restarted.workspaceRoot, chatId)).includes('failed'),
      'the claim settling the orphan',
      async () => readLog(restarted.workspaceRoot, chatId),
    );
    const events = await readLog(restarted.workspaceRoot, chatId);
    const requested = interruptsOf(events).find((event) => event.phase === 'requested');
    return { ...restarted, chatId, runId, events, interruptId: requested?.interruptId };
  };

  it('refuses a late answer to an orphaned approval with INTERRUPT_NOT_PENDING', async () => {
    const { launcher, chatId, runId, interruptId } = await orphan();

    expect(interruptId).toBeDefined();
    await expect(
      launcher.execute({
        type: 'resolve-interrupt',
        commandId: 'cmd-3',
        payload: { chatId, runId, interruptId: interruptId ?? '', outcome: 'approved' },
      }),
    ).resolves.toMatchObject({ status: 'refused', code: 'INTERRUPT_NOT_PENDING', effect: 'not-applied' });
  }, 90_000);

  /*
   * M1's rehydration (W7 RA-S14) resolves the orphan `cancelled` before the run's terminal row, and abandons the run
   * resumably: the agent's process died with its host, but its session did not (resume everywhere).
   */
  it('resolves an orphaned approval and abandons its run resumably after a restart', async () => {
    const { events, interruptId } = await orphan();
    const resolvedAt = events.findIndex(
      (event) =>
        event.type === 'interrupt.recorded' &&
        event.phase === 'resolved' &&
        event.interruptId === interruptId &&
        event.reason === 'cancelled',
    );
    const failedAt = events.findIndex((event) => event.type === 'run.lifecycle' && event.state === 'failed');

    expect(interruptId).toBeDefined();
    expect(events[resolvedAt]).toMatchObject({ payload: { code: 'RUN_ABANDONED' } });
    expect(events[failedAt]).toMatchObject({
      detail: { code: 'RUN_ABANDONED', details: { cause: 'awaiting-approval' } },
    });
    expect(resolvedAt).toBeLessThan(failedAt);
  }, 90_000);

  it('asks for the approval again when the person resumes an orphaned approval', async () => {
    const { launcher, workspaceRoot, chatId, runId } = await orphan(true);

    await expect(
      launcher.execute({ type: 'resume', commandId: 'cmd-resume', payload: { chatId, runId } }),
    ).resolves.toMatchObject({ status: 'applied' });
    /* The vendor session is reattached and told to continue; the agent's next step is the gated write it was
     * waiting on, so it asks again. The ask lands as `[requested, paused]`, one durable append per row (W1), so wait
     * for a lifecycle row after the second request: a read between the two sees the request under a run still
     * `running`. Any lifecycle row settles the wait, so a resume that fails still reaches the assertion below. */
    await until(
      async () => {
        const log = await readLog(workspaceRoot, chatId);
        const asked = log.findLastIndex((event) => event.type === 'interrupt.recorded' && event.phase === 'requested');
        return (
          interruptsOf(log).filter((event) => event.phase === 'requested').length === 2 &&
          log.slice(asked + 1).some((event) => event.type === 'run.lifecycle')
        );
      },
      'the approval asked again',
      async () => readLog(workspaceRoot, chatId),
    );
    const events = await readLog(workspaceRoot, chatId);
    expect(lifecycleOf(events).slice(-2)).toEqual(['running', 'paused']);
    await launcher.execute({ type: 'cancel', commandId: 'cmd-cancel', payload: { chatId, runId } });
  }, 90_000);
});
