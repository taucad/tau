/*
 * `createProjectHost` (W6 RH-S4) over a real Node authority, composed the way the desktop utility composes it: a
 * project id, a private checkouts directory, a GeoSpec runner and no external agents.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createMachine } from 'xstate';
import { createGatewayModelTransport, emptyChatLedger } from '@taucad/agent-host';
import type { ChatLedger, RunEntry, ToolRegistry, TurnPlacementPort } from '@taucad/agent-host';
import type * as AgentHost from '@taucad/agent-host';
import type * as Launcher from '@taucad/agent-host/launcher';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import type * as SetMachine from '@taucad/parameters/set-machine';
import type { ParameterFiles, ParameterSetActor } from '@taucad/parameters/set-machine';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import * as agentTools from '#agent-tools.js';
import { closeParameterActor, createProjectHost, createProjectHostActor, openProjectHost } from '#project-host.js';
import type { ProjectFileSystem, ProjectHost, ProjectHostOptions, ProjectHostRuntimeClient } from '#project-host.js';
import type { TurnCheckout } from '#revisions.js';

const registrySpy = vi.spyOn(agentTools, 'createHostToolRegistry');

/* Seams for the drain test: a launcher whose commands a test answers, and a follow over ledgers it hands out. Both
 * pass through to the real ones unless a test sets them. */
const seams = vi.hoisted(() => ({
  execute: undefined as undefined | ((command: { type: string }) => Promise<unknown>),
  /* How many launcher closes still fail, and how many were asked for. */
  closeFailures: 0,
  closes: 0,
  closed: 0,
  ledger: undefined as undefined | unknown,
  /* A follow that fails at once, as a read of a store that broke does. */
  followFailure: undefined as undefined | Error,
  /* The files each parameter actor was built over, and the last authority channel a test opened. */
  parameterFiles: [] as unknown[],
  channel: undefined as undefined | { close(): void },
  /* The parameter actor the next creation returns instead of the real one. */
  parameterActor: undefined as undefined | (() => ParameterSetActor),
  /* The options the last launcher was built with. */
  launcherOptions: undefined as undefined | { turnPlacement?: unknown },
}));

vi.mock('@taucad/parameters/set-machine', async (importOriginal) => {
  const actual = await importOriginal<typeof SetMachine>();
  return {
    ...actual,
    createParameterSetActor: (input: Parameters<typeof actual.createParameterSetActor>[0]) => {
      seams.parameterFiles.push(input.files);
      return seams.parameterActor?.() ?? actual.createParameterSetActor(input);
    },
  };
});

vi.mock('@taucad/agent-host/launcher', async (importOriginal) => {
  const actual = await importOriginal<typeof Launcher>();
  return {
    ...actual,
    createAgentLauncher: (options: Parameters<typeof actual.createAgentLauncher>[0]): AgentLauncher => {
      seams.launcherOptions = options;
      const launcher = actual.createAgentLauncher(options);
      return {
        ...launcher,
        close: async () => {
          seams.closes += 1;
          await launcher.close();
          seams.closed += 1;
        },
        execute: async (command) =>
          seams.execute === undefined
            ? launcher.execute(command)
            : ((await seams.execute(command)) as Awaited<ReturnType<AgentLauncher['execute']>>),
      };
    },
  };
});

/* The launcher's own leadership port, so a close fails inside the real launcher (W6.r1 round 4). */
vi.mock('../../agent-host/src/launchers/node/node-leadership.ts', async (importOriginal) => {
  const actual = await importOriginal<{ createNodeLeadership: (host: unknown) => { close: () => Promise<void> } }>();
  return {
    createNodeLeadership: (host: unknown) => {
      const port = actual.createNodeLeadership(host);
      return {
        ...port,
        close: async () => {
          if (seams.closeFailures > 0) {
            seams.closeFailures -= 1;
            throw new Error('The launcher could not close.');
          }
          await port.close();
        },
      };
    },
  };
});

vi.mock('@taucad/agent-host', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentHost>();
  return {
    ...actual,
    /* The ledger a test hands out, once; then the follow waits, as a long poll does, until its signal ends it. */
    followChat: async function* follow(
      ...args: Parameters<typeof actual.followChat>
    ): ReturnType<typeof actual.followChat> {
      if (seams.followFailure !== undefined) {
        throw seams.followFailure;
      }
      if (seams.ledger === undefined) {
        return yield* actual.followChat(...args);
      }
      const { signal, until } = args[2];
      const ledger = seams.ledger as ChatLedger;
      yield { ledger, events: [] };
      if (until?.(ledger) === true) {
        return undefined;
      }
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
      return undefined;
    },
  };
});

const cleanups: Array<() => Promise<void>> = [];

/** Quit the actor and wait for its host to close, so the sandbox is removed only after git let go of it. */
const quit = async (actor: ReturnType<typeof createProjectHostActor>): Promise<void> => {
  if (actor.getSnapshot().status !== 'active') {
    return;
  }
  const answered = new Promise<void>((resolve) => {
    actor.on('released', ({ requestId }) => {
      if (requestId === 'quit') {
        resolve();
      }
    });
  });
  actor.send({ type: 'shutdown', requestId: 'quit' });
  await answered;
};

/** A client's start of `runId` in `chatId`. */
const startOf = (chatId: string, runId: string): Parameters<AgentLauncher['execute']>[0] => ({
  type: 'start',
  commandId: `start-${runId}`,
  payload: { trigger: 'submit', chatId, runId, message: { id: `user-${runId}`, role: 'user', content: 'Go.' } },
});

/** How long the host's drain takes, bounded at 5 s. Milliseconds. */
const drainTime = async (opened: ReturnType<typeof openProjectHost>): Promise<number> => {
  const began = performance.now();
  await opened.drained(AbortSignal.timeout(5000));
  return performance.now() - began;
};

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown runs in reverse creation order.
    await cleanup();
  }
});

/** One authority over a sandbox, admitting the project and whatever the host admits. */
const nodeFileSystem = async (sandbox: string, workspaceRoot: string): Promise<ProjectFileSystem> => {
  const authorityDirectory = join(sandbox, 'authority');
  await mkdir(authorityDirectory);
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityDirectory,
    authorityIdentity: () => 'project-host-test',
  });
  const admitted = new Set([workspaceRoot]);
  const ports = new MessageChannel();
  const stop = serveNodeFsProvider(toNodeFsPort(ports.port1), {
    authority,
    allowRoot: (root) => admitted.has(root),
    policy: tauPathPolicy,
  });
  const channel = new NodeFsChannel(toNodeFsPort(ports.port2));
  seams.channel = channel;
  cleanups.push(async () => {
    channel.close();
    await stop();
  });
  return {
    open: (root) => new NodeFsProviderClient(channel, root),
    admit: (root) => {
      admitted.add(root);
      return () => {
        admitted.delete(root);
      };
    },
    mutate: async (target, mutation) =>
      authority.run({ root: target.parentRoot, paths: [target.targetPath] }, mutation),
  };
};

/** A runtime whose parameter resolution names the source as undeclared. */
const unresolvedRuntime = (): ProjectHostRuntimeClient => ({
  capabilities: undefined,
  connect: async () => undefined,
  evaluate: async () => {
    throw new Error('Not rendered in this test.');
  },
  export: async () => {
    throw new Error('Not rendered in this test.');
  },
  transcode: async () => {
    throw new Error('Not rendered in this test.');
  },
  resolveParameters: async () => ({
    success: false,
    issues: [{ code: 'SEMANTICS_UNRESOLVED', message: 'No declared parameter semantics.', severity: 'error' }],
  }),
});

/** A project host's options, composed as the desktop utility composes them. */
const desktopProjectHostOptions = async (
  extra: Pick<ProjectHostOptions, 'turnPlacement'> = {},
): Promise<ProjectHostOptions> => {
  const sandbox = await mkdtemp(join(tmpdir(), 'tau-project-host-'));
  cleanups.push(async () => rm(sandbox, { recursive: true, force: true }));
  const workspaceRoot = join(sandbox, 'home', 'bracket');
  await mkdir(workspaceRoot, { recursive: true });
  const fileSystem = await nodeFileSystem(sandbox, workspaceRoot);
  return {
    workspaceRoot,
    projectId: 'proj_test',
    checkoutsDirectory: join(sandbox, 'home', '.tau', 'checkouts', 'proj_test'),
    fileSystem,
    runtimeClient: async () => unresolvedRuntime(),
    geospecRunner: async () => {
      throw new Error('No GeoSpec runner in this test.');
    },
    apiBaseUrl: 'http://127.0.0.1:1',
    systemPrompt: 'You are Tau.',
    modelTransport: createGatewayModelTransport({ baseUrl: 'http://127.0.0.1:1/', projectId: 'proj_test' }),
    credential: () => ({ mode: 'session' }),
    onRevisionEvent: () => undefined,
    ...extra,
  };
};

/** A project host composed as the desktop utility composes one. */
const desktopProjectHost = async (
  extra: Pick<ProjectHostOptions, 'turnPlacement'> = {},
): Promise<{ project: ProjectHost; registry: ToolRegistry }> => {
  const options = await desktopProjectHostOptions(extra);
  registrySpy.mockClear();
  const project = createProjectHost(options);
  cleanups.push(async () => project.close());
  const result = registrySpy.mock.results.at(-1);
  if (result?.type !== 'return') {
    throw new TypeError('Expected the project host to build its tool registry.');
  }
  return { project, registry: result.value };
};

/* An actor whose write never settles, and one whose write is uncertain before the close arrives, so the close finds
 * it there. */
const stuck = createMachine({ initial: 'open', states: { open: { initial: 'writing', states: { writing: {} } } } });
const uncertain = createMachine({
  initial: 'open',
  states: { open: { initial: 'uncertain', states: { uncertain: {} } } },
});
const parameterActor = (onClose?: 'uncertain'): ParameterSetActor =>
  (onClose === 'uncertain' ? createActor(uncertain) : createActor(stuck)).start() as unknown as ParameterSetActor;

describe('createProjectHost', () => {
  /* RH-S11 (W8 TS-S4): the host builds the placement port over its own revisions and hands it to the launcher. */
  /* W6.r1 finding 10: a drain waits for the runs this host admitted, not for an attempt a previous process left. */
  it('should drain the runs this host admitted, whatever an earlier process left unsettled', async () => {
    const run = (appendState: RunEntry['appendState'], lifecycle: RunEntry['lifecycle']): RunEntry => ({
      kind: 'tau',
      attempt: 1,
      lifecycle,
      appendState,
      committed: true,
      settlements: [],
      pendingInterrupts: {},
      opaque: false,
    });
    seams.execute = async () => ({
      commandId: 'command-1',
      generation: 0,
      status: 'applied',
      effect: 'durable',
      cursor: 1,
    });
    seams.ledger = {
      ...emptyChatLedger,
      currentRunId: 'run-new',
      /* `run-old` ended in a previous process and nothing here settles it until W8. */
      runs: { 'run-old': run('terminal', 'failed'), 'run-new': run('settled', 'completed') },
    } satisfies ChatLedger;
    cleanups.push(async () => {
      seams.execute = undefined;
      seams.ledger = undefined;
    });
    const opened = openProjectHost(await desktopProjectHostOptions());
    cleanups.push(async () => opened.host.close());
    await opened.host.launcher.execute({
      type: 'resume',
      commandId: 'command-1',
      payload: { chatId: 'chat-1', runId: 'run-new' },
    } as Parameters<AgentLauncher['execute']>[0]);

    const stop = new AbortController();
    const outcome = await Promise.race([
      (async () => {
        await opened.drained(stop.signal);
        return 'drained';
      })(),
      new Promise((resolve) => {
        setTimeout(resolve, 500, 'still waiting');
      }),
    ]);
    stop.abort();

    expect(outcome).toBe('drained');
  });

  /* T3 (W6.r1 round 3): a released host draining its runs refuses a new one HOST_CLOSED; a remount admits again. */
  it('should refuse a new run while draining and admit it again after a remount', async () => {
    const options = await desktopProjectHostOptions();
    const served: ProjectHost[] = [];
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => options,
      serve: (_connectionId, host) => {
        served.push(host);
      },
      refuse: () => undefined,
    });
    cleanups.push(async () => {
      seams.execute = undefined;
      seams.ledger = undefined;
      await quit(actor);
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    await vi.waitFor(
      () => {
        expect(served).toHaveLength(1);
      },
      { timeout: 15_000 },
    );
    const { launcher } = served[0]!;
    /* A run this host admitted and that is still running, so the release drains. */
    seams.execute = async () => ({
      commandId: 'start-1',
      generation: 0,
      status: 'applied',
      effect: 'durable',
      cursor: 1,
    });
    seams.ledger = {
      ...emptyChatLedger,
      currentRunId: 'run-1',
      runs: {
        'run-1': {
          kind: 'tau',
          attempt: 1,
          lifecycle: 'running',
          appendState: 'open',
          committed: true,
          settlements: [],
          pendingInterrupts: {},
          opaque: false,
        },
      },
    } satisfies ChatLedger;
    const start = async (chatId: string, runId: string) =>
      launcher.execute({
        type: 'start',
        commandId: `start-${runId}`,
        payload: { trigger: 'submit', chatId, runId, message: { id: `user-${runId}`, role: 'user', content: 'Go.' } },
      } as Parameters<AgentLauncher['execute']>[0]);
    await start('chat-1', 'run-1');
    seams.execute = undefined;

    actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().matches('draining')).toBe(true);
    });
    await expect(start('chat-2', 'run-2')).resolves.toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });

    actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().matches('serving')).toBe(true);
    });
    await expect(start('chat-2', 'run-2')).resolves.not.toMatchObject({ code: 'HOST_CLOSED' });
  }, 30_000);

  /* W6.r1 finding 17 (MC-R14, MC-R15): only the composition's own effects report `opened` and `closed`. */
  it('should take only its commands, so a forged close outcome opens no second host', async () => {
    const options = await desktopProjectHostOptions();
    let opens = 0;
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => {
        opens += 1;
        return options;
      },
      serve: () => undefined,
      refuse: () => undefined,
    });
    const forged: Array<Readonly<{ outcome: unknown; opens: number }>> = [];
    /* In the step the close begins, a remount is held and a forged `closed` claims the close ended. */
    const subscription = actor.subscribe((snapshot) => {
      if (snapshot.matches('closing') && forged.length === 0) {
        actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });
        try {
          // @ts-expect-error -- `closed` is the close effect's own report, not a command.
          actor.send({ type: 'closed', incarnation: 1, message: null });
          forged.push({ outcome: 'accepted', opens });
        } catch (error) {
          forged.push({ outcome: error, opens });
        }
      }
    });
    cleanups.push(async () => {
      subscription.unsubscribe();
      await quit(actor);
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    /* Opening a real project host (git, the revision root) takes longer than the default second under load. */
    await vi.waitFor(
      () => {
        expect(forged).toHaveLength(1);
      },
      { timeout: 15_000 },
    );

    /* Counted in the step the forgery was sent: the real close may have ended since, and reopened for the remount. */
    expect(forged[0]?.opens).toBe(1);
    expect(forged[0]?.outcome).toBeInstanceOf(TypeError);
  });

  /* W6.r1 round 4 (the re-check's drain-race probe): a start sent while the host served, still being placed when the
   * release came, is drained with the rest; the close never cuts it off before it is admitted. */
  it('should drain a start that was still being placed when the release came', async () => {
    const options = await desktopProjectHostOptions();
    const served: ProjectHost[] = [];
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => options,
      serve: (_connectionId, host) => {
        served.push(host);
      },
      refuse: () => undefined,
    });
    cleanups.push(async () => {
      seams.execute = undefined;
      seams.ledger = undefined;
      await quit(actor);
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    await vi.waitFor(
      () => {
        expect(served).toHaveLength(1);
      },
      { timeout: 15_000 },
    );
    const { launcher } = served[0]!;
    /* The launcher answers only once the case says so: the start is still being placed as the release arrives. */
    const admission = Promise.withResolvers<unknown>();
    seams.execute = async () => admission.promise;
    seams.ledger = {
      ...emptyChatLedger,
      currentRunId: 'run-late',
      runs: {
        'run-late': {
          kind: 'tau',
          attempt: 1,
          lifecycle: 'running',
          appendState: 'open',
          committed: true,
          settlements: [],
          pendingInterrupts: {},
          opaque: false,
        },
      },
    } satisfies ChatLedger;
    const started = launcher.execute({
      type: 'start',
      commandId: 'start-late',
      payload: {
        trigger: 'submit',
        chatId: 'chat-late',
        runId: 'run-late',
        message: { id: 'u', role: 'user', content: 'Go.' },
      },
    } as Parameters<AgentLauncher['execute']>[0]);

    actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(actor.getSnapshot().matches('draining')).toBe(true);
    admission.resolve({ commandId: 'start-late', generation: 0, status: 'applied', effect: 'durable', cursor: 1 });

    await expect(started).resolves.toMatchObject({ status: 'applied' });
    expect(actor.getSnapshot().matches('draining')).toBe(true);
  }, 30_000);

  /* W6.r1 round 5 (P1): a start that entered while the host served is admitted though the drain began before the
   * launcher's gate saw it; one sent after is refused. Driven through the real launcher's gate. */
  it('should admit a start that entered before the drain began, and refuse one sent after', async () => {
    let admitting = true;
    const opened = openProjectHost(await desktopProjectHostOptions(), () => admitting);
    cleanups.push(async () => opened.host.close());

    const early = opened.host.launcher.execute(startOf('chat-a', 'run-a'));
    admitting = false;
    const late = opened.host.launcher.execute(startOf('chat-b', 'run-b'));

    /* This host has no model, so the early start gets past the gate and is refused for that instead. */
    await expect(early).resolves.toMatchObject({ status: 'refused', code: 'HOST_MODEL_UNAVAILABLE' });
    await expect(late).resolves.toMatchObject({ status: 'refused', code: 'HOST_CLOSED' });
  }, 30_000);

  /* W6.r1 round 5 (P2): a drain that begins while a start is being answered waits for the answer; a refused start is
   * not a run to follow, so neither that drain nor a later one waits out its bound. */
  it('should not keep draining for a start that was refused while the drain began', async () => {
    const opened = openProjectHost(await desktopProjectHostOptions(), () => true);
    cleanups.push(async () => opened.host.close());

    const started = opened.host.launcher.execute(startOf('chat-r', 'run-r'));
    const began = performance.now();
    const drained = opened.drained(AbortSignal.timeout(5000));

    await expect(started).resolves.toMatchObject({ status: 'refused' });
    await drained;
    expect(performance.now() - began).toBeLessThan(2000);
    await expect(drainTime(opened)).resolves.toBeLessThan(2000);
  }, 30_000);

  /* W6.r1 round 5 (P3): a start whose placement threw is no run either. */
  it('should not keep draining for a start whose placement threw', async () => {
    seams.execute = async () => {
      throw Object.assign(new Error('Stopped serving before the turn was placed.'), {
        code: 'REVISION_PREPARE_FAILED',
      });
    };
    cleanups.push(async () => {
      seams.execute = undefined;
    });
    const opened = openProjectHost(await desktopProjectHostOptions(), () => true);
    cleanups.push(async () => opened.host.close());

    await expect(opened.host.launcher.execute(startOf('chat-t', 'run-t'))).rejects.toThrow('Stopped serving');

    await expect(drainTime(opened)).resolves.toBeLessThan(2000);
  }, 30_000);

  /* W6.r1 round 5 (P4): a refused start leaves the launcher no chat to follow, empty or not. */
  it('should leave no admitted run behind a refused start', async () => {
    const opened = openProjectHost(await desktopProjectHostOptions(), () => true);
    cleanups.push(async () => opened.host.close());

    await expect(opened.host.launcher.execute(startOf('chat-q', 'run-q'))).resolves.toMatchObject({
      status: 'refused',
    });

    await expect(opened.host.launcher.admittedRuns()).resolves.toEqual(new Map());
    await expect(drainTime(opened)).resolves.toBeLessThan(2000);
  }, 30_000);

  /* W6.r1 round 5 (P5a): a chat id no log could live under is refused before the host counts or records it, so
   * neither its drain nor its close trips over it. */
  it('should refuse an unstorable chat id before counting or recording it', async () => {
    const opened = openProjectHost(await desktopProjectHostOptions(), () => true);

    await expect(opened.host.launcher.execute(startOf('a/b', 'run-p'))).resolves.toMatchObject({
      status: 'refused',
      code: 'STORAGE_PATH_INVALID',
    });

    await expect(drainTime(opened)).resolves.toBeLessThan(2000);
    await expect(opened.host.close()).resolves.toBeUndefined();
  }, 30_000);

  /* W6.r1 round 5 (P5b): a start the launcher refuses for its chat id leaves the released host's drain nothing to
   * follow; the drain ends and the host closes, with no rejection left unhandled. */
  it('should release a host after a start with an unstorable chat id, with nothing unhandled', async () => {
    const options = await desktopProjectHostOptions();
    const served: ProjectHost[] = [];
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => options,
      serve: (_connectionId, host) => {
        served.push(host);
      },
      refuse: () => undefined,
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    cleanups.push(async () => {
      process.off('unhandledRejection', onUnhandled);
      await quit(actor);
    });
    const released = new Promise<void>((resolve) => {
      actor.on('released', ({ requestId }) => {
        if (requestId === 'release-1') {
          resolve();
        }
      });
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    await vi.waitFor(
      () => {
        expect(served).toHaveLength(1);
      },
      { timeout: 15_000 },
    );

    await expect(served[0]!.launcher.execute(startOf('a/b', 'run-p'))).resolves.toMatchObject({
      status: 'refused',
      code: 'STORAGE_PATH_INVALID',
    });
    actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    await released;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(unhandled).toEqual([]);
  }, 30_000);

  /* W6.r2 H5: a second close while the first runs waits for it; the host's resources close once. */
  it('should close once when two closes run together', async () => {
    const { project } = await desktopProjectHost();
    seams.closes = 0;
    seams.closed = 0;

    const both = Promise.all([project.close(), project.close()]);
    await vi.waitFor(() => {
      expect(seams.closed).toBeGreaterThanOrEqual(1);
    });

    expect(seams.closes).toBe(1);
    await both;
  });

  /* W6.r2 round 7: a released root's parameter write that stays uncertain is reported; the stopped actor then passes
   * the host's close silently, so nothing else would. */
  it("should report a released root's parameter write that did not close", async () => {
    const { project } = await desktopProjectHost();
    const [input] = registrySpy.mock.calls.at(-1)!;
    const checkouts = input.checkouts as Map<string, TurnCheckout>;
    // A candidate root beside the project: releasing the project root itself would unmount the live checkout.
    const root = `${input.workspaceRoot}-candidate`;
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    seams.parameterActor = () => parameterActor('uncertain');
    try {
      await input.parameterActor?.(root, 'main.ts');
    } finally {
      seams.parameterActor = undefined;
    }

    checkouts.set('run-1', { cwd: root, mode: 'candidate', baseRevisionId: '' });
    checkouts.delete('run-1');

    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalledWith(
        "[project host] a released root's parameter write did not close",
        new Error('Parameter write for main.ts remains uncertain.'),
      );
    });
    reported.mockRestore();
    await project.close();
  });

  /* W6.r2 H8: a released host whose drain cannot follow its runs reports that and still closes; nothing is left
   * unhandled. */
  it('should report a drain that failed and still close the released host', async () => {
    const options = await desktopProjectHostOptions();
    const served: ProjectHost[] = [];
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => options,
      serve: (_connectionId, host) => {
        served.push(host);
      },
      refuse: () => undefined,
    });
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    cleanups.push(async () => {
      seams.execute = undefined;
      seams.followFailure = undefined;
      process.off('unhandledRejection', onUnhandled);
      reported.mockRestore();
      await quit(actor);
    });
    const released = new Promise<void>((resolve) => {
      actor.on('released', ({ requestId }) => {
        if (requestId === 'release-1') {
          resolve();
        }
      });
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    await vi.waitFor(
      () => {
        expect(served).toHaveLength(1);
      },
      { timeout: 15_000 },
    );
    seams.execute = async () => ({
      commandId: 'start-run-f',
      generation: 0,
      status: 'applied',
      effect: 'durable',
      cursor: 1,
    });
    await expect(served[0]!.launcher.execute(startOf('chat-f', 'run-f'))).resolves.toMatchObject({ status: 'applied' });
    const failure = new Error('The chat store could not be read.');
    seams.followFailure = failure;

    actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    await released;
    expect(reported).toHaveBeenCalledWith(
      '[project host] a released project host could not follow its runs; it closes now',
      failure,
    );
    expect(unhandled).toEqual([]);
  }, 30_000);

  /* W6.r1 round 3: a close that failed leaves the host to close again, so what it holds is not lost. */
  it('should close again a host whose close failed', async () => {
    const options = await desktopProjectHostOptions();
    let served = 0;
    let project: ProjectHost | undefined;
    const actor = createProjectHostActor({
      root: options.workspaceRoot,
      host: () => options,
      serve: (_connectionId, host) => {
        served += 1;
        project = host;
      },
      refuse: () => undefined,
    });
    const answers: string[] = [];
    actor.on('released', ({ outcome }) => {
      answers.push(outcome);
    });
    seams.closes = 0;
    seams.closed = 0;
    seams.closeFailures = 1;
    cleanups.push(async () => {
      seams.closeFailures = 0;
    });
    actor.start();
    actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    /* Served: the project's revision root has finished opening, so nothing is still writing when the case ends. */
    await vi.waitFor(
      () => {
        expect(served).toBe(1);
      },
      { timeout: 15_000 },
    );
    /* W8.a2 round 2, item 7: the tree is released even when the launcher's close failed, so this root's liveness
     * mark (RM-R8) is freed and another host can reconcile its leases; the retry's release is a no-op. */
    const releasedAfterCloses: number[] = [];
    const { release } = project!.revisions;
    vi.spyOn(project!.revisions, 'release').mockImplementation(async () => {
      releasedAfterCloses.push(seams.closes);
      await release();
    });

    actor.send({ type: 'shutdown', requestId: 'quit' });

    await vi.waitFor(
      () => {
        expect(answers).toEqual(['failed']);
        /* The actor ended on the failed close; the host it left is closed again, and this time it closes. */
        expect(seams.closes).toBe(2);
        expect(seams.closed).toBe(1);
      },
      { timeout: 15_000 },
    );
    expect(releasedAfterCloses[0]).toBe(1);
    /* The launcher closed, but the retried close still records its revision: the memoised close is that retry, so
     * awaiting it ends the case only once nothing writes into the sandbox (W6.r2 round 8). */
    await project?.close();
    expect(seams.closes).toBe(2);
  }, 30_000);

  /* W6.r1 Low (library-API §11): a Node watch that ends with its channel is closed, not reset. */
  it('should close, not reset, a parameter watch whose authority channel closed', async () => {
    const options = await desktopProjectHostOptions();
    registrySpy.mockClear();
    const project = createProjectHost(options);
    /* The authority is gone, so the close records nothing; it still settles. */
    cleanups.push(async () => {
      try {
        await project.close();
      } catch {
        /* Expected: nothing is left to record into. */
      }
    });
    const registry = registrySpy.mock.results.at(-1)?.value as ToolRegistry;
    seams.parameterFiles.length = 0;
    await registry.invoke({
      toolCallId: 'call-1',
      toolName: 'get_parameters',
      input: { targetFile: 'main.ts' },
      signal: new AbortController().signal,
    });
    const files = seams.parameterFiles.at(-1) as ParameterFiles;
    const events: string[] = [];
    const watch = files.watchReady({ paths: ['main.parameters.json'] }, (event) => {
      events.push(event.type);
    });
    await watch.ready;

    seams.channel?.close();

    expect(watch.closed).toBeInstanceOf(Promise);
    await watch.closed;
    expect(events).toEqual([]);
  });

  /* D13 (W8.r1 MU13): with no factory, the host still places every turn, through its own revisions. */
  it('should hand the launcher a placement over its own revisions when no turnPlacement factory is given', async () => {
    seams.launcherOptions = undefined as typeof seams.launcherOptions;
    await desktopProjectHost();

    const placement = seams.launcherOptions?.turnPlacement as TurnPlacementPort | undefined;
    expect([placement?.admit, placement?.complete, placement?.acknowledge].map((verb) => typeof verb)).toEqual([
      'function',
      'function',
      'function',
    ]);
  });

  it('should hand the launcher the placement port its turnPlacement factory builds', async () => {
    const reconcile = vi.fn<TurnPlacementPort['reconcile']>(async ({ requestId }) => ({
      requestId,
      status: 'applied',
      held: [],
    }));
    const unused = async (): Promise<never> => {
      throw new Error('Not placed in this test.');
    };
    const turnPlacement = vi.fn<NonNullable<Parameters<typeof createProjectHost>[0]['turnPlacement']>>(() => ({
      admit: unused,
      complete: unused,
      abandon: unused,
      acknowledge: unused,
      reconcile,
      settlements: () => ({
        [Symbol.asyncIterator]: async function* nothing(): AsyncGenerator<never> {
          yield* [];
        },
      }),
    }));
    const { project } = await desktopProjectHost({ turnPlacement });

    expect(turnPlacement).toHaveBeenCalledOnce();
    const [input] = turnPlacement.mock.calls[0]!;
    expect(input.revisions).toBe(project.revisions);
    expect(
      input
        .toolRegistryFor('/checkouts/one')
        .list()
        .map(({ name }) => name),
    ).toContain('read_file');
    await vi.waitFor(() => {
      expect(reconcile).toHaveBeenCalledOnce();
    });
  });

  /* RH-A22: the desktop built its registry without parameter actors, so it offered no parameter tools. */
  it('should give the desktop project host parameter tools', async () => {
    const { registry } = await desktopProjectHost();

    expect(registry.list().map(({ name }) => name)).toEqual(
      expect.arrayContaining(['get_parameters', 'apply_parameter_operation']),
    );
    /* And the tool reads through the actor the host built over the root's runtime. */
    const answer = await registry.invoke({
      toolCallId: 'call-1',
      toolName: 'get_parameters',
      input: { targetFile: 'main.ts' },
      signal: new AbortController().signal,
    });
    expect(JSON.stringify(answer.content)).toContain('SEMANTICS_UNRESOLVED');
  });
});

/* W6.r2 M1 (D16): a parameter actor's close is bounded; one past the bound or left uncertain is stopped, and a
 * retried close passes a stopped actor instead of waiting the bound again. */
describe('closeParameterActor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const key = JSON.stringify(['/project', 'main.ts']);

  it('should stop an actor whose write outlives the bound, and pass it when the close is retried', async () => {
    vi.useFakeTimers();
    const actor = parameterActor();
    let outcome = 'pending';
    const closing = (async () => {
      try {
        await closeParameterActor(actor, key);
        outcome = 'closed';
      } catch (error) {
        outcome = error instanceof Error ? error.message : String(error);
      }
    })();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(outcome).toMatch(/Timeout/);
    expect(actor.getSnapshot().status).toBe('stopped');
    await closing;
    await expect(closeParameterActor(actor, key)).resolves.toBeUndefined();
  });

  it('should stop an actor whose write stays uncertain, and report it', async () => {
    const actor = parameterActor('uncertain');

    await expect(closeParameterActor(actor, key)).rejects.toThrow('Parameter write for main.ts remains uncertain.');
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});
