/**
 * One project's host (W6 RH-S4): the seven steps the daemon and the desktop utility each assembled in the same order —
 * checkouts, revisions, parameter actors, tool registry, ACP port, MCP endpoint and the launcher — composed once.
 *
 * The host builds the ACP port and the MCP endpoint over its own checkouts map and tool registry, so an external
 * candidate turn works in its own checkout (V19). The caller owns the filesystem authority and the runtime clients; it
 * learns when a candidate checkout's root is admitted and released through {@link ProjectFileSystem.admit}.
 */

import { randomBytes } from 'node:crypto';

import { followChat, unsettledAttempts } from '@taucad/agent-host';
import type { ChatLedger, ToolRegistry, TurnPlacementPort } from '@taucad/agent-host';
import { createAgentLauncher } from '@taucad/agent-host/launcher';
import { chatIdSchema } from '@taucad/agent-host/wire';
import type { AgentLauncher, AgentLauncherOptions } from '@taucad/agent-host/launcher';
import { createNodeChatStore } from '@taucad/agent-host/node';
import type { NodeFsProviderClient } from '@taucad/filesystem/backend';
import type { ParameterManifest } from '@taucad/parameters';
import { createParameterSetActor } from '@taucad/parameters/set-machine';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';
import type { Description } from '@taucad/runtime/client';
import type { RuntimeFileSystemBase } from '@taucad/runtime/types';
import { Actor, createActor, waitFor } from 'xstate';
import type { ActorOptions, AnyActorLogic } from 'xstate';

import { createAcpExternalAgentPort } from '#acp/index.js';
import type { AcpAdapter } from '#acp/index.js';
import { createHostToolRegistry } from '#agent-tools.js';
import type { HostRuntimeClient, HostToolFileSystem, HostToolRegistryOptions } from '#agent-tools.js';
import { keyedResource } from '#keyed-resource.js';
import { projectHostMachine } from '#project-host.machine.js';
import type { ProjectHostQueued } from '#project-host.schemas.js';
import { createHostMcpEndpoint } from '#mcp-server.js';
import type { HostMcpEndpoint } from '#mcp-server.js';
import { hostRevisionActor } from '#revision-actor.js';
import { createProjectRevisions } from '#revisions.js';
import type { HostRevisionEvent, ProjectRevisions, ProjectRevisionsOptions, TurnCheckout } from '#revisions.js';

/**
 * Admit a checkout's filesystem as the host tools' filesystem. Revision hosts type checkout filesystems loosely, so the
 * capabilities the host tools need are checked once, where an attempt's tools are opened: a filesystem without them
 * refuses the turn by name instead of every print tool failing later (blueprint x1c-start-confirmation F8).
 *
 * @param filesystem - The checkout's filesystem, as the revision host opened it.
 * @returns The same filesystem, typed for the host tools.
 * @throws When it cannot stream reads or write with a precondition.
 */
const asHostToolFileSystem = (filesystem: Omit<RuntimeFileSystemBase, 'watch'>): HostToolFileSystem => {
  if (typeof filesystem.readFileStream !== 'function' || typeof filesystem.writeFileChecked !== 'function') {
    throw Object.assign(
      new Error(
        "This checkout's filesystem cannot stream reads or write with a precondition, so Tau's tools cannot run on it.",
      ),
      { code: 'HOST_TOOL_FILESYSTEM_INCOMPLETE' },
    );
  }
  return filesystem as HostToolFileSystem;
};

/**
 * The process's filesystem authority as one project host uses it. The caller owns its lifetime.
 *
 * @public
 */
export type ProjectFileSystem = Readonly<{
  /** The rooted view of one admitted root. */
  open: (root: string) => NodeFsProviderClient;
  /**
   * Admit a candidate or linked checkout's root until the returned release runs. Admissions of one root nest; the
   * caller releases whatever it keeps for the root (its runtime client, its runtime grant) when the last one ends.
   */
  admit: (root: string) => () => void;
  /** Run one checkout mutation under the authority's claim. */
  mutate: NonNullable<ProjectRevisionsOptions['checkoutMutation']>;
}>;

/** The runtime client a project host's tools and parameter actors run on, for one root. @public */
export type ProjectHostRuntimeClient = HostRuntimeClient;

/** Options for {@link createProjectHost}. @public */
export type ProjectHostOptions = Pick<
  ProjectRevisionsOptions,
  'projectId' | 'checkoutsDirectory' | 'gitExecutable' | 'apiBaseUrl' | 'tauCredential' | 'syncTelemetryPlacement'
> &
  Pick<AgentLauncherOptions, 'systemPrompt' | 'model' | 'modelTransport' | 'credential'> &
  Pick<HostToolRegistryOptions, 'systemSkillBundles' | 'geospecRunner' | 'machines'> &
  Readonly<{
    /** Absolute project root: the live checkout, and where `.tau/chats/` lives. */
    workspaceRoot: string;
    fileSystem: ProjectFileSystem;
    /** The runtime client for the root the calling turn works in, which the caller memoizes. */
    runtimeClient: (root: string) => Promise<ProjectHostRuntimeClient>;
    /** The adapters this machine discovered; the host builds the ACP port over its own checkouts. */
    externalAgents?: Readonly<{ agents: readonly AcpAdapter[]; mcpUrl: () => string }> | undefined;
    /** Each revision fact; reporting only, never fatal. */
    onRevisionEvent: (event: HostRevisionEvent) => void;
    /**
     * W8 TS-S4: build this project's placement port. Every attempt is placed and settled through it and runs on its
     * grant's tools; the launcher reconciles the chats whose leases it holds (RH-R16). Absent: the in-process session
     * over this project's revisions ({@link ProjectRevisions.placement}), whose grants are the host's tool registry
     * over the attempt's revocable view of its checkout.
     */
    turnPlacement?:
      | ((
          input: Readonly<{
            revisions: ProjectRevisions;
            /** The host's tools over one root; over `filesystem` when given, the attempt's revocable view. */
            toolRegistryFor: (root: string, filesystem?: HostToolFileSystem) => ToolRegistry;
          }>,
        ) => TurnPlacementPort)
      | undefined;
  }>;

/** One project's host: the launcher, its revisions and the MCP endpoint it minted. @public */
export type ProjectHost = Readonly<{
  launcher: AgentLauncher;
  revisions: ProjectRevisions;
  /** Present when external agents were given; the caller mounts it on its loopback server. */
  mcp: HostMcpEndpoint | undefined;
  /**
   * Stop the runs, record their terminal rows and settlements, then release the parameter actors and the MCP endpoint.
   * Retryable: a second call re-attempts whatever the first could not finish (C70).
   */
  close: () => Promise<void>;
}>;

/** A project host and, for its lifecycle owner, the wait for its runs to settle. */
export type OpenedProjectHost = Readonly<{
  host: ProjectHost;
  /** Resolves once every run this host admitted has ended and its settlement is durable, or `signal` ends. */
  drained: (signal: AbortSignal) => Promise<void>;
}>;

/**
 * How long a released project host drains before its close begins anyway. The close still stops what is left and
 * records its terminal rows, so the bound cuts a run short rather than losing it. Milliseconds.
 */
const projectHostDrainBound = 15 * 60_000;

const liveStates: ReadonlySet<string | undefined> = new Set(['admitted', 'running']);

/* The runs this host admitted have ended and their attempts are settled (W8). An attempt another process left
 * unsettled is not this host's to wait for (W6.r1 finding 10). */
const settled =
  (runIds: ReadonlySet<string>) =>
  (ledger: ChatLedger): boolean => {
    const unsettled = new Set(unsettledAttempts(ledger).map(({ runId }) => runId));
    return [...runIds].every((runId) => {
      const entry = ledger.runs[runId];
      return entry !== undefined && !liveStates.has(entry.lifecycle) && !unsettled.has(runId);
    });
  };

const parameterKey = (root: string, entry: string): string => JSON.stringify([root, entry]);
const parameterRoot = (key: string): string => (JSON.parse(key) as [string, string])[0];

const manifestOf = (result: Description): ParameterManifest => {
  if (!result.success) {
    throw Object.assign(
      new Error(result.issues.map(({ message }) => message).join('; ') || 'Parameter resolution failed.'),
      { code: result.issues[0]?.code ?? 'PARAMETER_RESOLUTION_FAILED' },
    );
  }
  return result.parameters;
};

/** How long a parameter actor may take to finish its last write when its host closes (D16). Milliseconds. */
const parameterCloseBound = 10_000;

/* `ParameterSetActor` hides the runtime's `stop`; the actor `createActor` made has it. */
const stopParameterActor = (actor: ParameterSetActor): void => {
  if (actor instanceof Actor) {
    actor.stop();
  }
};

/**
 * Close one parameter actor once its last write is known. One whose write stays uncertain, or does not settle within
 * the bound, is stopped, not left running after its host, and reported; a stopped actor was closed and reported
 * already, so a retried close passes it (W6.r2 M1).
 *
 * @param actor - The parameter actor.
 * @param key - Its `[root, entry]` key.
 * @returns Once the actor is closed.
 * @internal
 */
export const closeParameterActor = async (actor: ParameterSetActor, key: string): Promise<void> => {
  if (actor.getSnapshot().status === 'stopped') {
    return;
  }
  actor.send({ type: 'close' });
  const state = await waitFor(
    actor,
    (snapshot) => snapshot.status === 'done' || snapshot.matches({ open: 'uncertain' }),
    { timeout: parameterCloseBound },
  ).catch((error: unknown) => {
    stopParameterActor(actor);
    throw error;
  });
  if (state.status !== 'done') {
    stopParameterActor(actor);
    throw new Error(`Parameter write for ${(JSON.parse(key) as [string, string])[1]} remains uncertain.`);
  }
};

/**
 * Compose a project host and keep its drain for the lifecycle owner (`projectHost` machine).
 *
 * @param options - The project, its authority, runtime clients, model transport and credential.
 * @param admitting - Whether the launcher admits new runs; `false` while the host drains (T3).
 * @returns The host and its drain.
 * @internal
 */
export const openProjectHost = (options: ProjectHostOptions, admitting?: () => boolean): OpenedProjectHost => {
  const { workspaceRoot, fileSystem } = options;
  /* The runs a client sent while this host served, by chat: counted before anything is awaited, so a drain that begins
   * while one is still being placed follows it, and the launcher admits it though it arrives during the drain (T3). */
  const entered = new Map<string, Set<string>>();
  /* The counted starts and resumes not yet answered: a drain waits for them, so it never follows a run it is still
   * unknown whether the launcher admitted (W6.r1 round 5). */
  const answering = new Set<Promise<unknown>>();
  /* Chat parameter actors, one per (root, entry), over that root's view and runtime (RH-S12). */
  const parameters = keyedResource<string, ParameterSetActor>(async (key) => {
    const [root, entry] = JSON.parse(key) as [string, string];
    const runtime = await options.runtimeClient(root);
    const provider = fileSystem.open(root);
    return createParameterSetActor({
      target: { authority: provider.id, root, entry },
      files: {
        watchReady: (request, onEvent) => {
          const closed = Promise.withResolvers<void>();
          /* A Node watch ends on its own only with its channel, which delivers a last `reset` and then refuses every
           * request: that watch closed (`WATCH_CLOSED`). A reset the channel outlives lost events (`WATCH_RESET`). */
          const forward = (event: Readonly<{ type: string }>): void => {
            if (event.type !== 'reset') {
              onEvent(event);
              return;
            }
            // async-iife: bootstrap -- a watch event has no caller; the probe decides which failure the actor sees.
            void (async (): Promise<void> => {
              try {
                await provider.exists(request.paths[0] ?? '');
              } catch (error) {
                if (error instanceof Error && error.name === 'NodeFsChannelClosedError') {
                  closed.resolve();
                  return;
                }
              }
              onEvent(event);
            })();
          };
          const opened = provider.watch(request, forward);
          const ready = async (): Promise<void> => {
            await opened;
          };
          return {
            ready: ready(),
            closed: closed.promise,
            unsubscribe: () => {
              // async-iife: bootstrap -- `unsubscribe` is synchronous; a watch that never opened has nothing to stop.
              void (async (): Promise<void> => {
                try {
                  const stop = await opened;
                  stop();
                } catch {
                  /* Never opened. */
                }
              })();
            },
          };
        },
        exists: async (path) => provider.exists(path),
        readFile: async (path) => provider.readFile(path),
        writeFileChecked: async (write) => provider.writeFileChecked(write),
      },
      resolve: async ({ entry: source }, signal, resolution) =>
        manifestOf(
          await runtime.describe({
            source: { path: source },
            ...(resolution === undefined ? {} : { resolution }),
            signal,
          }),
        ),
    });
  }, closeParameterActor);
  /* Close a released root's parameter actors, then release the root: they write through it. With none, at once. */
  const releaseRoot = (root: string, release: () => void): void => {
    const keys = parameters.keys().filter((key) => parameterRoot(key) === root);
    if (keys.length === 0) {
      release();
      return;
    }
    // async-iife: bootstrap -- a root release is synchronous; `close()` awaits these through `parameters.closeAll`.
    void (async (): Promise<void> => {
      const closes = await Promise.allSettled(keys.map(async (key) => parameters.close(key)));
      /* A write that did not close is stopped; the host's close passes it, so this is the one report (W6.r2). */
      for (const close of closes) {
        if (close.status === 'rejected') {
          console.error("[project host] a released root's parameter write did not close", close.reason);
        }
      }
      release();
    })();
  };

  /* Where each admitted turn runs, by run id (V19): the revision tree writes it, the tool registry and the ACP port
   * read it. A candidate checkout's root is admitted while any run holds it. */
  const admissions = new Map<string, () => void>();
  const checkouts = new (class extends Map<string, TurnCheckout> {
    public override set(runId: string, checkout: TurnCheckout): this {
      if (checkout.mode === 'candidate' && !admissions.has(runId)) {
        admissions.set(runId, fileSystem.admit(checkout.cwd));
      }
      return super.set(runId, checkout);
    }

    public override delete(runId: string): boolean {
      const checkout = this.get(runId);
      const deleted = super.delete(runId);
      const release = admissions.get(runId);
      admissions.delete(runId);
      if (release === undefined || checkout === undefined) {
        return deleted;
      }
      if ([...this.values()].some((held) => held.mode === 'candidate' && held.cwd === checkout.cwd)) {
        release();
        return deleted;
      }
      releaseRoot(checkout.cwd, release);
      return deleted;
    }
  })();

  const revisions = createProjectRevisions({
    workspaceRoot,
    checkouts,
    filesystem: (checkout) => fileSystem.open(checkout.kind === 'live' ? workspaceRoot : checkout.root),
    useFileSystem: async (checkout, operation) => {
      if (checkout.kind === 'live') {
        return operation(fileSystem.open(workspaceRoot));
      }
      const release = fileSystem.admit(checkout.root);
      try {
        return await operation(fileSystem.open(checkout.root));
      } finally {
        release();
      }
    },
    checkoutMutation: fileSystem.mutate,
    /* AC15: the person this machine belongs to, as Git already knows them. */
    actor: hostRevisionActor(),
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    ...(options.checkoutsDirectory === undefined ? {} : { checkoutsDirectory: options.checkoutsDirectory }),
    ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    ...(options.apiBaseUrl === undefined ? {} : { apiBaseUrl: options.apiBaseUrl }),
    ...(options.tauCredential === undefined ? {} : { tauCredential: options.tauCredential }),
    ...(options.syncTelemetryPlacement === undefined ? {} : { syncTelemetryPlacement: options.syncTelemetryPlacement }),
    events: options.onRevisionEvent,
  });

  /* One registry over every run's root (`checkouts`), or one rooted at a placed attempt's checkout. */
  const registryOptions = {
    revisions: revisions.history,
    filesystem: (root: string) => fileSystem.open(root),
    /* Per root: a candidate turn's kernel reads the tree that turn writes. */
    runtimeClient: async (root: string) => options.runtimeClient(root),
    parameterActor: async (root: string, entry: string) => parameters.get(parameterKey(root, entry)),
    ...(options.systemSkillBundles === undefined ? {} : { systemSkillBundles: options.systemSkillBundles }),
    ...(options.geospecRunner === undefined ? {} : { geospecRunner: options.geospecRunner }),
    /* The machine tools, over a facet this host already serves; a job names the project by its id. */
    ...(options.machines === undefined ? {} : { machines: options.machines }),
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
  };
  const toolRegistry = createHostToolRegistry({ ...registryOptions, workspaceRoot, checkouts });
  const toolRegistryFor = (root: string, filesystem?: HostToolFileSystem): ToolRegistry =>
    createHostToolRegistry({
      ...registryOptions,
      workspaceRoot: root,
      ...(filesystem === undefined ? {} : { filesystem: () => filesystem }),
    });
  /* The host process is the placement session (TS-R6 holds trivially); no Node host runs an attempt unplaced (D13). */
  const turnPlacement = (
    options.turnPlacement ??
    ((input) =>
      input.revisions.placement(({ root, filesystem }) =>
        input.toolRegistryFor(root, asHostToolFileSystem(filesystem)),
      ))
  )({ revisions, toolRegistryFor });

  const externalAgents =
    options.externalAgents !== undefined && options.externalAgents.agents.length > 0
      ? options.externalAgents
      : undefined;
  /* The capability secret travels into a vendor adapter's process, so it is never a channel token (VI4). */
  const mcp =
    externalAgents === undefined
      ? undefined
      : createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry: toolRegistry, workspaceRoot });

  const launcher = createAgentLauncher({
    chats: createNodeChatStore({ workspaceRoot }),
    modelTransport: options.modelTransport,
    credential: options.credential,
    systemPrompt: options.systemPrompt,
    ...(options.model === undefined ? {} : { model: options.model }),
    toolRegistry,
    turnPlacement,
    ...(admitting === undefined
      ? {}
      : { admitting: (run) => admitting() || entered.get(run.chatId)?.has(run.runId) === true }),
    ...(externalAgents === undefined || mcp === undefined
      ? {}
      : {
          externalAgents: createAcpExternalAgentPort({
            agents: externalAgents.agents,
            workspaceRoot,
            checkouts,
            ...(options.systemSkillBundles === undefined ? {} : { systemSkillBundles: options.systemSkillBundles }),
            mcp: {
              /* Read per run: the caller's listener may bind after this host exists. */
              get url(): string {
                return externalAgents.mcpUrl();
              },
              mint: (input) => mcp.mint(input),
              activate: (input) => mcp.activate(input),
            },
          }),
        }),
  });

  let mcpClosed = false;
  /* A second close waits for the first; one after a close that failed tries again. */
  let closing: Promise<void> | undefined;
  const closeHost = async (): Promise<void> => {
    const failures: unknown[] = [];
    const settle = async (step: () => Promise<unknown>): Promise<void> => {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    };
    await settle(async () => launcher.close());
    /* After the launcher: its attempts are settled, so the tree records what is on disk and stops. */
    await settle(async () => revisions.release());
    await settle(async () => parameters.closeAll());
    await settle(async () => {
      if (mcp !== undefined && !mcpClosed) {
        await mcp.close();
        mcpClosed = true;
      }
    });
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'The project host could not release every resource.');
    }
  };
  const host: ProjectHost = {
    launcher: {
      ...launcher,
      execute: async (command) => {
        if (command.type !== 'start' && command.type !== 'resume') {
          return launcher.execute(command);
        }
        const { chatId, runId } = command.payload;
        /* A chat id no log could live under is refused before anything counts or records it (W6.r1 round 5). */
        if (!chatIdSchema.safeParse(chatId).success) {
          return {
            commandId: command.commandId,
            generation: 0,
            status: 'refused',
            effect: 'not-applied',
            code: 'STORAGE_PATH_INVALID',
            message: 'chatId must be one storage path segment.',
          };
        }
        if (admitting?.() === false) {
          return launcher.execute(command);
        }
        const runs = entered.get(chatId) ?? new Set<string>();
        const counted = !runs.has(runId);
        entered.set(chatId, runs.add(runId));
        /* A run that was refused, or whose placement threw, is no run to drain. */
        const answered = (async () => {
          let admitted = false;
          try {
            const answer = await launcher.execute(command);
            admitted = answer.status !== 'refused';
            return answer;
          } finally {
            if (counted && !admitted) {
              runs.delete(runId);
              if (runs.size === 0 && entered.get(chatId) === runs) {
                entered.delete(chatId);
              }
            }
          }
        })();
        answering.add(answered);
        try {
          return await answered;
        } finally {
          answering.delete(answered);
        }
      },
    },
    revisions,
    mcp,
    close: async () => {
      closing ??= closeHost();
      const attempt = closing;
      try {
        await attempt;
      } catch (error) {
        if (closing === attempt) {
          closing = undefined;
        }
        throw error;
      }
    },
  };

  return {
    host,
    drained: async (signal) => {
      /* Every run a client sent while this host served, re-read until a pass adds none: one sent while the last pass
       * followed is followed too (W6.r1 round 4). */
      const ended = new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
      let followed = '';
      while (!signal.aborted) {
        /* Only answered admissions are followed: a refused or failed one is dropped before its answer settles. */
        // oxlint-disable-next-line no-await-in-loop -- each pass waits for the admissions it could still see.
        await Promise.race([Promise.allSettled(answering), ended]);
        const runs = [...entered]
          .filter(([, runIds]) => runIds.size > 0)
          .map(([chatId, runIds]) => [chatId, new Set(runIds)] as const);
        const pass = JSON.stringify(runs.map(([chatId, runIds]) => [chatId, [...runIds]]));
        if (pass === followed) {
          return;
        }
        followed = pass;
        // oxlint-disable-next-line no-await-in-loop -- each pass follows what the one before it could not see.
        await Promise.all(
          runs.map(async ([chatId, runIds]) => {
            // oxlint-disable-next-line no-empty-pattern -- only the follow's end matters.
            for await (const {} of followChat(launcher.read, chatId, { signal, until: settled(runIds) })) {
              /* Each batch moves the ledger; `until` ends the follow once the chat is settled. */
            }
          }),
        );
      }
    },
  };
};

/**
 * Compose one project's host: its checkouts, revisions, parameter actors, tool registry, ACP port, MCP endpoint and
 * launcher. The daemon and the desktop utility each call it once per project.
 *
 * @param options - The project, its authority, runtime clients, model transport and credential.
 * @returns The project host.
 * @public
 *
 * @example <caption>A project host over a daemon's authority</caption>
 * ```typescript
 * import { createGatewayModelTransport } from '@taucad/agent-host';
 * import { createProjectHost } from '@taucad/host';
 * import type { ProjectFileSystem, ProjectHostRuntimeClient } from '@taucad/host';
 *
 * declare const fileSystem: ProjectFileSystem;
 * declare const runtimeClient: (root: string) => Promise<ProjectHostRuntimeClient>;
 *
 * const project = createProjectHost({
 *   workspaceRoot: '/work/bracket',
 *   fileSystem,
 *   runtimeClient,
 *   systemPrompt: 'You are Tau.',
 *   modelTransport: createGatewayModelTransport({ baseUrl: 'https://api.tau.new/' }),
 *   credential: () => ({ mode: 'session' }),
 *   onRevisionEvent: () => undefined,
 * });
 * await project.close();
 * ```
 */
export const createProjectHost = (options: ProjectHostOptions): ProjectHost => openProjectHost(options).host;

/** Options for {@link createProjectHostActor}. @public */
export type ProjectHostActorOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The project root the actor owns. */
    root: string;
    /** The host's options, read each time a host opens. */
    host: () => ProjectHostOptions;
    /** Serve one held connection on the open host. */
    serve: (connectionId: string, host: ProjectHost) => void;
    /** Close one held connection that no host will serve. */
    refuse: (connectionId: string) => void;
  }>;

/** What a `projectHost` actor's composition sends it: one connection, one release, the quit (MC-R14). @public */
export type ProjectHostCommand = Readonly<ProjectHostQueued>;

/**
 * A `projectHost` actor. It takes only {@link ProjectHostCommand}s: its effects report `opened`, `quiescent` and
 * `closed` themselves, so no caller can claim a close ended and open a second host over a closing one (MC-R15).
 *
 * @public
 */
export type ProjectHostActor = Pick<Actor<typeof projectHostMachine>, 'getSnapshot' | 'on' | 'subscribe'> &
  Readonly<{
    start: () => void;
    /** Wait for close retries started by this actor, including one after it completed. */
    settled: () => Promise<void>;
    /** @throws TypeError for anything but a command. */
    send: (command: ProjectHostCommand) => void;
  }>;

const projectHostCommands: ReadonlySet<string> = new Set<ProjectHostCommand['type']>([
  'connect',
  'release',
  'shutdown',
]);

/**
 * The `projectHost` machine's composition root (MC-R4): one actor per project root, whose effects build, drain and
 * close that root's {@link ProjectHost}. Send `connect`, `release` and `shutdown`; each release and shutdown is
 * answered by one `released` emit. A drain lasts at most 15 minutes before the close begins. The actor is returned
 * unstarted.
 *
 * @param options - The root, the host's options, how to serve and refuse a connection, and the actor options.
 * @returns The unstarted actor.
 * @public
 *
 * @example <caption>One actor per root in a desktop utility</caption>
 * ```typescript
 * import { serveAgentChannel } from '@taucad/agent-host/launcher';
 * import type { AgentChannelEndpoint } from '@taucad/agent-host/launcher';
 * import { createProjectHostActor } from '@taucad/host';
 * import type { ProjectHostOptions } from '@taucad/host';
 *
 * declare const hostOptions: () => ProjectHostOptions;
 * declare const ports: Map<string, AgentChannelEndpoint & { close(): void }>;
 * const actor = createProjectHostActor({
 *   root: '/home/bracket',
 *   host: hostOptions,
 *   serve: (connectionId, host) => {
 *     serveAgentChannel(ports.get(connectionId)!, host.launcher, { build: '1.0.0', revisions: host.revisions.channel });
 *   },
 *   refuse: (connectionId) => ports.get(connectionId)?.close(),
 * });
 * actor.on('released', ({ requestId, outcome }) => console.log(requestId, outcome));
 * actor.start();
 * actor.send({ type: 'connect', gen: 1, connectionId: 'connection-1' });
 * ```
 */
export const createProjectHostActor = (options: ProjectHostActorOptions): ProjectHostActor => {
  const { root, host, serve, refuse, ...actorOptions } = options;
  const clock: NonNullable<ProjectHostActorOptions['clock']> = actorOptions.clock ?? { setTimeout, clearTimeout };
  /* The resource this actor's effects act on, never in the machine's context (MC-R5). */
  let opened: OpenedProjectHost | undefined;
  const pendingCloses = new Set<Promise<void>>();
  const trackClose = (closing: Promise<void>): void => {
    pendingCloses.add(closing);
    const forgetSettled = async (): Promise<void> => {
      try {
        await closing;
      } catch {
        /* Both callers report or deliberately discard close errors themselves. */
      } finally {
        pendingCloses.delete(closing);
      }
    };
    // async-iife: bootstrap -- this removes a completed retry; settled() owns the shutdown wait.
    void forgetSettled();
  };
  const self: { actor?: Actor<typeof projectHostMachine> } = {};
  const send = (event: Parameters<Actor<typeof projectHostMachine>['send']>[0]): void => {
    self.actor?.send(event);
  };
  /* The host is let go only once its close succeeded: a failed close leaves it for the next close to try again. */
  const closeOpened = async (): Promise<void> => {
    const closing = opened;
    await closing?.host.close();
    if (opened === closing) {
      opened = undefined;
    }
  };
  const machine = projectHostMachine.provide({
    actions: {
      open: ({ incarnation }) => {
        const left = opened;
        if (left !== undefined) {
          /* A close that failed left this host: it is tried once more as the fresh one replaces it. */
          // async-iife: bootstrap -- the effect is synchronous; the retry's failure is only reported.
          trackClose(
            (async (): Promise<void> => {
              try {
                await left.host.close();
              } catch (error) {
                console.error('[project host] a host whose close failed did not close again', error);
              }
            })(),
          );
        }
        try {
          /* T3: while released and draining, a new run is refused HOST_CLOSED; a remount serves it again. */
          opened = openProjectHost(host(), () => self.actor?.getSnapshot().matches('draining') !== true);
          send({ type: 'opened', incarnation });
        } catch (error) {
          send({ type: 'openFailed', incarnation, message: error instanceof Error ? error.message : String(error) });
        }
      },
      serve: ({ connectionId }) => {
        if (opened === undefined) {
          refuse(connectionId);
          return;
        }
        serve(connectionId, opened.host);
      },
      refuse: ({ connectionId }) => {
        refuse(connectionId);
      },
      drain: ({ drain }) => {
        const draining = opened;
        /* A drain that cannot observe the runs, or outlives its bound, falls back to the close, which still records
         * their terminal rows. A drain the machine left (a remount) follows until its runs settle or the bound. */
        const bound = new AbortController();
        const drainExpiry: unknown = clock.setTimeout(() => {
          bound.abort();
        }, projectHostDrainBound);
        // async-iife: bootstrap -- the machine's `quiescent` event is this effect's settlement.
        void (async (): Promise<void> => {
          try {
            await draining?.drained(bound.signal);
          } catch (error) {
            /* The close still records what is left (T3); a drain that could not follow is only reported. */
            console.error('[project host] a released project host could not follow its runs; it closes now', error);
          } finally {
            clock.clearTimeout(drainExpiry);
            send({ type: 'quiescent', drain });
          }
        })();
      },
      close: ({ incarnation }) => {
        // async-iife: bootstrap -- the machine's `closed` event is this effect's settlement.
        void (async (): Promise<void> => {
          try {
            await closeOpened();
            send({ type: 'closed', incarnation, message: null });
          } catch (error) {
            send({ type: 'closed', incarnation, message: error instanceof Error ? error.message : String(error) });
          }
        })();
      },
    },
  });
  const actor = createActor(machine, { input: { root }, ...actorOptions });
  self.actor = actor;
  /* A fault ends the actor without its close effect: the host it left open still closes. */
  const closeLeftOpen = (): void => {
    // async-iife: bootstrap -- the actor has ended, so nothing is left to answer; the host's close is best effort.
    trackClose(
      (async (): Promise<void> => {
        try {
          await closeOpened();
        } catch {
          /* Nothing left to report it to. */
        }
      })(),
    );
  };
  actor.subscribe({ error: closeLeftOpen, complete: closeLeftOpen });
  return {
    getSnapshot: () => actor.getSnapshot(),
    on: actor.on.bind(actor),
    subscribe: actor.subscribe.bind(actor),
    start: () => {
      actor.start();
    },
    settled: async () => {
      while (pendingCloses.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- a close can finish while another actor effect starts one.
        await Promise.allSettled(pendingCloses);
      }
    },
    send: (command) => {
      if (!projectHostCommands.has(command.type)) {
        throw new TypeError(`projectHost takes connect, release and shutdown; ${String(command.type)} is its own.`);
      }
      actor.send(command);
    },
  };
};
