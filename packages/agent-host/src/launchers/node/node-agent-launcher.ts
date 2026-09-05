/**
 * The Node launcher: the portable host core (W1-W6) assembled for a process
 * that owns a directory instead of an origin.
 *
 * Three things differ from the browser worker's assembly, and they are exactly
 * the three a daemon needs:
 *
 *   - the durable log is a real file under the workspace root
 *     (`.tau/chats/<chatId>/events.jsonl`) written through the Node appender;
 *   - the model transport carries a **bearer** (a daemon has no cookie jar);
 *   - there is no leader election. One daemon process owns its workspace, so
 *     the Web-Lock/BroadcastChannel machinery the browser needs for N tabs has
 *     no analogue here — the launcher is unconditionally the leader.
 *
 * What does *not* differ is the vocabulary: {@link executeAgentChannelCommand}
 * answers the same commands the browser worker answers over a MessagePort, so a
 * client projection cannot tell the two apart.
 *
 * Always-on is the defining property: `start` and `resume` return as soon as
 * the admission is **durable**, and the run then continues with zero attached
 * clients. Nothing here is tied to a socket lifetime.
 */

import { join } from 'node:path';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createTauAgentHost } from '#host/tau-agent-host.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createNodeEventLog } from '#node.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createPortableId } from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  InterruptApprovalPort,
  InterruptRequest,
  InterruptResolution,
  ToolRegistry,
} from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ExternalAgentPort, TauAgentHost } from '#host/tau-agent-host.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { admissionConfigFor } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentChannelCommand,
  AgentChannelEvent,
  AgentChannelLiveEvent,
  AgentChannelResponse,
} from '#launchers/node/agent-wire.js';

/** One segment, never a path: a chat id is a directory name under `.tau/chats`. */
const requirePathSegment = (value: string, label: string): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};

const terminalStates = new Set(['completed', 'failed', 'cancelled']);
const isTerminal = (state: HostRunSnapshot['state']): boolean => terminalStates.has(state);

/**
 * The durable approval inbox (PH13).
 *
 * A paused run's request is already a durable `interrupt.recorded` event in the
 * log — this is only the live index over it, so a resolution may arrive from a
 * client that was not attached when the run paused. After a daemon restart the
 * index is rebuilt by `resume`, which replays the unresolved request back
 * through `pause`.
 */
const createInterruptInbox = (): InterruptApprovalPort & {
  /** Resolves once `interruptId` is durably recorded and awaiting a decision. */
  readonly awaitRequest: (interruptId: string) => Promise<void>;
} => {
  const waiting = new Map<
    string,
    { readonly request: InterruptRequest; readonly settle: (resolution: InterruptResolution) => void }
  >();
  const arrivals = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  const arrivalFor = (interruptId: string) => {
    const current = arrivals.get(interruptId);
    if (current) {
      return current;
    }
    const created = Promise.withResolvers<void>();
    arrivals.set(interruptId, created);
    return created;
  };
  return {
    awaitRequest: async (interruptId) => arrivalFor(interruptId).promise,
    pause: async (request) =>
      new Promise<InterruptResolution>((resolve) => {
        waiting.set(request.interruptId, {
          request,
          settle: (resolution) => {
            waiting.delete(request.interruptId);
            arrivals.delete(request.interruptId);
            resolve(resolution);
          },
        });
        arrivalFor(request.interruptId).resolve();
      }),
    pending: async ({ runId }) =>
      [...waiting.values()].flatMap((entry) => (entry.request.runId === runId ? [entry.request] : [])),
    resume: async (resolution) => {
      const entry = waiting.get(resolution.interruptId);
      if (!entry) {
        throw Object.assign(new Error(`Interrupt ${resolution.interruptId} is not awaiting a resolution.`), {
          code: 'INTERRUPT_NOT_PENDING',
        });
      }
      entry.settle(resolution);
    },
  };
};

/** A multi-subscriber fan-out that never blocks the producer. */
const createFanOut = <Event>() => {
  const controllers = new Set<ReadableStreamDefaultController<Event>>();
  return {
    publish: (event: Event): void => {
      for (const controller of controllers) {
        /* A subscriber whose socket just died leaves a controller that throws
         * on `enqueue`. Publishing runs inside the durable-append path and
         * inside the model's delta callback, so letting that throw would let a
         * disconnecting client fail the run it was only watching — the exact
         * opposite of always-on. Drop the dead subscriber and carry on. */
        try {
          controller.enqueue(event);
        } catch {
          controllers.delete(controller);
        }
      }
    },
    subscribe: (signal: AbortSignal): AsyncIterable<Event> => {
      let cleanup = (): void => undefined;
      return new ReadableStream<Event>({
        start(controller) {
          let active = true;
          const close = (): void => {
            if (!active) {
              return;
            }
            active = false;
            controllers.delete(controller);
            controller.close();
            signal.removeEventListener('abort', close);
          };
          cleanup = close;
          controllers.add(controller);
          if (signal.aborted) {
            close();
          } else {
            signal.addEventListener('abort', close, { once: true });
          }
        },
        cancel: () => {
          cleanup();
        },
      });
    },
    close: (): void => {
      for (const controller of controllers) {
        controllers.delete(controller);
        controller.close();
      }
    },
  };
};

/** Options for {@link createNodeAgentLauncher}. @public */
export type NodeAgentLauncherOptions = {
  /** Absolute workspace root; every chat log lives under its `.tau/chats`. */
  readonly workspaceRoot: string;
  /** `${TAU_API_URL}/` — the base the model gateway hangs off. */
  readonly gatewayBaseUrl: string;
  /** Default model row; one admission may override it. */
  readonly model: AgentSessionModel;
  /** Default system prompt; one admission may override it. */
  readonly systemPrompt: string;
  /** Tools visible to every run. */
  readonly toolRegistry: ToolRegistry;
  /**
   * Bearer resolved per request, never captured: a daemon's paired credential
   * rotates, and a captured string would pin the host to a stale one.
   */
  readonly auth?: (() => string | undefined | Promise<string | undefined>) | undefined;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  readonly createId?: (() => string) | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  /**
   * External agents (W4-ACP). Omit and a `start` naming one is refused; the
   * daemon's own runs are unaffected either way.
   */
  readonly externalAgents?: ExternalAgentPort | undefined;
  /**
   * Mint a run-scoped Tau MCP capability for a client that cannot.
   *
   * A Paseo agent runs on the user's own machine and reaches Tau tools only
   * through a paired daemon's `/mcp` endpoint — but the page holding that
   * session cannot sign a capability, because the signing secret never
   * leaves this process. Omit it and the command is refused, which is what
   * a daemon with no MCP endpoint should say.
   */
  readonly mintMcpCapability?:
    | ((input: { readonly chatId: string; readonly runId: string }) => {
        readonly url: string;
        readonly headers: Readonly<Record<string, string>>;
        readonly expiresAt: string;
      })
    | undefined;
};

/** A running Node agent launcher. @public */
export type NodeAgentLauncher = {
  /** Answer one T0 command. Never tied to a client's socket lifetime. */
  execute(command: AgentChannelCommand): Promise<AgentChannelResponse>;
  /** Durable event stream for every chat this launcher owns. */
  events(signal: AbortSignal): AsyncIterable<AgentChannelEvent>;
  /** Ephemeral model-delta stream for every chat this launcher owns. */
  liveEvents(signal: AbortSignal): AsyncIterable<AgentChannelLiveEvent>;
  /** Unresolved approval requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /** The assembled host, for callers that need the lifecycle surface directly. */
  readonly host: TauAgentHost;
  close(): Promise<void>;
};

/**
 * Assemble one always-on agent host over a workspace directory.
 *
 * @param options - Workspace, gateway, model, tools, and credential source.
 * @returns A launcher answering the T0 command vocabulary.
 * @public
 *
 * @example <caption>Serve one workspace</caption>
 * ```typescript
 * import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const toolRegistry: ToolRegistry;
 * const launcher = createNodeAgentLauncher({
 *   workspaceRoot: process.cwd(),
 *   gatewayBaseUrl: 'https://api.tau.new/',
 *   model: { id: 'claude-sonnet-4-5', contextWindow: 200_000 },
 *   systemPrompt: 'You are Tau.',
 *   toolRegistry,
 *   auth: () => process.env['TAU_HOST_CREDENTIAL'],
 * });
 * await launcher.close();
 * ```
 */
export const createNodeAgentLauncher = (options: NodeAgentLauncherOptions): NodeAgentLauncher => {
  const createId = options.createId ?? createPortableId;
  const durable = createFanOut<AgentChannelEvent>();
  const live = createFanOut<AgentChannelLiveEvent>();
  const interruptPort = createInterruptInbox();
  const generations = new Map<string, string>();
  /** Runs still executing after their admission answered; drained by `close()`. */
  const background = new Set<Promise<void>>();
  let closed = false;

  /**
   * One appender per chat, shared by the pi host and any external run.
   *
   * Memoized deliberately: two handles on one `events.jsonl` would each hold
   * their own sequence cursor, and the second writer's first append would be
   * rejected `EVENT_OUT_OF_ORDER` — or worse, accepted out of order.
   */
  const logs = new Map<string, Promise<DurableEventLog>>();
  const openEventLog = async (chatId: string): Promise<DurableEventLog> => {
    const cached = logs.get(chatId);
    if (cached) {
      return cached;
    }
    const opened = (async (): Promise<DurableEventLog> => {
      const log = await createNodeEventLog({
        filePath: join(options.workspaceRoot, '.tau', 'chats', requirePathSegment(chatId, 'chatId'), 'events.jsonl'),
      });
      return {
        append: async (event: AgentLogEvent) => {
          const outcome = await log.append(event);
          if (outcome.appended) {
            durable.publish({ chatId, event });
          }
          return outcome;
        },
        read: async () => log.read(),
        readBatch: async (input) => log.readBatch(input),
        close: async () => log.close(),
      };
    })();
    logs.set(chatId, opened);
    try {
      return await opened;
    } catch (error) {
      /* A failed open must not poison the cache: the next attempt should retry
       * rather than replay a rejection nobody can act on. */
      if (logs.get(chatId) === opened) {
        logs.delete(chatId);
      }
      throw error;
    }
  };

  const host: TauAgentHost = createTauAgentHost({
    systemPrompt: options.systemPrompt,
    ...(options.systemPromptBlocks ? { systemPromptBlocks: options.systemPromptBlocks } : {}),
    model: options.model,
    modelTransport: createGatewayModelTransport({
      baseUrl: options.gatewayBaseUrl,
      model: options.model,
      ...(options.auth ? { auth: options.auth } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
    toolRegistry: options.toolRegistry,
    openEventLog,
    interruptPort,
    createId,
    /* W4-ACP's port, registered on the shared run-kind seam. The daemon's own
     * runs are unaffected either way; omit it and a `start` naming an external
     * agent is refused by the host with `EXTERNAL_AGENT_UNAVAILABLE`. */
    ...(options.externalAgents ? { externalRunners: { acp: options.externalAgents } } : {}),
    onLiveEvent: (event: AgentLiveEvent) => {
      live.publish({ chatId: event.chatId, event });
    },
  });

  /** One stable leader generation per chat; a daemon never contends for it. */
  const generationFor = (chatId: string): string => {
    const current = generations.get(chatId);
    if (current) {
      return current;
    }
    const generation = createId();
    generations.set(chatId, generation);
    host.assumeLeadership(chatId, generation);
    return generation;
  };

  /**
   * Watch one run to its end without re-raising: the reason it failed, or
   * `undefined` if it succeeded.
   *
   * @param completion - The run to observe.
   * @returns The failure, or `undefined`.
   */
  const failureOf = async (completion: Promise<unknown>): Promise<unknown> => {
    try {
      await completion;
      return undefined;
    } catch (error) {
      return error;
    }
  };

  /**
   * The same watch, as a racer that never wins with a value.
   *
   * @param settled - The watch to follow.
   * @returns `undefined`, once the run has settled either way.
   */
  const settledEmpty = async (settled: Promise<unknown>): Promise<undefined> => {
    await settled;
    return undefined;
  };

  /** Keep the run alive after its admission answered — the always-on invariant. */
  const detach = (completion: Promise<unknown>): void => {
    const track = async (): Promise<void> => {
      try {
        await completion;
      } catch {
        /* A failed run is already durable in its own log; nothing here to add. */
      }
      background.delete(task);
    };
    const task = track();
    background.add(task);
  };

  /**
   * Answer as soon as the turn is durable, then let it run unattended.
   *
   * The admission this waits for must be *this* call's. A chat holds one
   * reservation at a time, so a second `start` on a live chat would otherwise
   * be answered with the running run's snapshot while its own rejection was
   * never observed — an unhandled rejection in the daemon, and a client told a
   * run it never asked for had started. The run's own settlement is therefore
   * raced against the admission, and its failure is what answers.
   *
   * @param input - Chat, the run id this call admits (when it names one), and
   *   the full run, which outlives this answer.
   * @returns The projection at admission time.
   */
  const acknowledge = async (input: {
    readonly chatId: string;
    readonly runId?: string | undefined;
    readonly completion: Promise<unknown>;
  }): Promise<HostRunSnapshot> => {
    /* Observed unconditionally, and never re-raised from here: a rejection with
     * no handler would take the daemon down instead of answering the client. */
    const settled = failureOf(input.completion);
    const admitted = await Promise.race([host.waitForAdmission(input.chatId), settledEmpty(settled)]);
    if (!admitted || (input.runId !== undefined && admitted.runId !== input.runId)) {
      /* Nothing of ours was admitted: surface this run's own failure rather
       * than a generic one, so the client sees a typed reason. */
      const failure = await settled;
      if (failure !== undefined) {
        throw failure instanceof Error ? failure : new Error(`The run failed: ${JSON.stringify(failure)}`);
      }
      await input.completion;
      return host.snapshot(input.chatId);
    }
    detach(input.completion);
    return admitted;
  };

  const assertOpen = (): void => {
    if (closed) {
      throw Object.assign(new Error('The Tau agent launcher is closed.'), { code: 'LAUNCHER_CLOSED' });
    }
  };

  /**
   * Externally executed runs, by chat and by run.
   *
   * A second registry beside the pi host's own because the two run kinds share
   * a log, not a lifecycle: an ACP turn has no `AgentSession`, no model stream
   * and no tool loop for the host to abort — only a child process and a
   * protocol-level `session/cancel`.
   */
  /**
   * Re-project one chat for a reconnecting client, recovering it if needed.
   *
   * @param command - The client's attach window.
   * @returns The attach projection, its leadership marker and whether this call recovered the run.
   */
  const attach = async (
    command: Extract<AgentChannelCommand, { readonly type: 'attach' }>,
  ): Promise<Extract<AgentChannelResponse, { readonly type: 'attach' }>> => {
    const batch = await host.readEvents(command);
    if (batch.endCursor === 0) {
      return {
        type: 'attach',
        chatId: command.chatId,
        batch,
        leadership: { role: 'leader', generation: generationFor(command.chatId) },
        takeover: false,
      };
    }
    let snapshot = await host.snapshot(command.chatId);
    /* A run left non-terminal by a daemon restart is recovered here — the one
     * place every reconnecting client passes through. A run this process is
     * already executing needs no recovery: `resume` would be refused as an
     * admission conflict, and an external run is tracked separately. */
    let takeover = false;
    if (!isTerminal(snapshot.state) && !(await host.waitForAdmission(command.chatId))) {
      try {
        await acknowledge({ chatId: command.chatId, completion: host.resume(command.chatId) });
        takeover = true;
      } catch (error) {
        /* A run that cannot be recovered must not make `attach` fail: the
         * client still needs the transcript it reconnected for. */
        if (!(error instanceof Error) || (error as { code?: string }).code !== 'RUN_ADMISSION_CONFLICT') {
          throw error;
        }
      }
      snapshot = await host.snapshot(command.chatId);
    }
    return {
      type: 'attach',
      chatId: command.chatId,
      batch: await host.readEvents(command),
      leadership: { role: 'leader', generation: generationFor(command.chatId) },
      snapshot,
      takeover: takeover && !isTerminal(snapshot.state),
    };
  };

  const execute = async (command: AgentChannelCommand): Promise<AgentChannelResponse> => {
    assertOpen();
    generationFor(command.chatId);
    switch (command.type) {
      case 'tail': {
        return { type: 'tail', chatId: command.chatId, batch: await host.readEvents(command) };
      }
      case 'attach': {
        return attach(command);
      }
      case 'mint-mcp-capability': {
        if (!options.mintMcpCapability) {
          throw Object.assign(new Error('This Tau Host offers no MCP endpoint.'), {
            code: 'HOST_MCP_UNAVAILABLE',
          });
        }
        const minted = options.mintMcpCapability({ chatId: command.chatId, runId: command.runId });
        return { type: 'mcp-capability', chatId: command.chatId, ...minted };
      }
      case 'start': {
        const external = command.config?.agent;
        const base = {
          chatId: command.chatId,
          runId: command.runId,
          message: command.message,
          config: {
            ...admissionConfigFor(command.config, { systemPrompt: options.systemPrompt, model: options.model }),
            /* The host routes on this *before* it composes anything, so the Tau
             * fields above are inert for an external turn. */
            ...(external ? { agent: { kind: 'acp', id: external.id } } : {}),
          },
        };
        const completion = host.admit(
          command.trigger === 'submit'
            ? { ...base, trigger: 'submit' }
            : { ...base, trigger: command.trigger, retainedMessageIds: command.retainedMessageIds },
        );
        return {
          type: 'result',
          operation: 'start',
          snapshot: await acknowledge({ chatId: command.chatId, runId: command.runId, completion }),
        };
      }
      case 'resume': {
        return {
          type: 'result',
          operation: 'resume',
          snapshot: await acknowledge({ chatId: command.chatId, completion: host.resume(command.chatId) }),
        };
      }
      case 'steer': {
        await host.steer({ runId: command.runId, message: command.message });
        break;
      }
      case 'cancel': {
        await host.cancel({ runId: command.runId });
        break;
      }
      case 'interrupt': {
        const request: InterruptRequest = {
          interruptId: command.interruptId,
          runId: command.runId,
          kind: command.kind,
          prompt: command.prompt,
          ...(command.payload === undefined ? {} : { payload: command.payload }),
        };
        /* `host.interrupt` only settles when the approval is *decided*, which
         * may be days later and from another client. Answer as soon as the
         * request is durable instead, and let the pause outlive this call. */
        const paused = host.interrupt(request);
        const observeFailure = async (): Promise<void> => {
          await paused;
        };
        /* Tracked *and* raced: tracking absorbs a rejection that arrives after
         * this race is already won, and racing surfaces one that arrives first
         * as a typed refusal instead of a silent no-op. */
        const failure = observeFailure();
        detach(failure);
        await Promise.race([interruptPort.awaitRequest(command.interruptId), failure]);
        break;
      }
      case 'resolve-interrupt': {
        await host.resolveInterrupt({
          runId: command.runId,
          interruptId: command.interruptId,
          outcome: command.outcome,
          ...(command.payload === undefined ? {} : { payload: command.payload }),
        });
        break;
      }
    }
    return { type: 'result', operation: command.type, snapshot: await host.snapshot(command.chatId) };
  };

  return {
    host,
    execute,
    events: (signal) => durable.subscribe(signal),
    liveEvents: (signal) => live.subscribe(signal),
    pendingInterrupts: async (runId) => host.pendingInterrupts(runId),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await host.close();
      await Promise.allSettled(background);
      durable.close();
      live.close();
    },
  };
};
