import type {
  AgentChannelAdmissionConfig,
  AgentChannelClient,
  AgentChannelCommand,
  AgentChannelResponse,
} from '@taucad/agent-host';
import type { AgentHostAdmissionConfig, AgentHostWorkerStartRequest } from '#workers/agent-host.contract.js';
import { AgentHostWorkerError } from '#services/agent-host-client.js';
import type {
  AgentHostTransport,
  AgentHostTransportCloseReason,
  AgentHostTransportRequest,
  AgentHostTransportResponse,
  AgentHostTransportStreams,
} from '#services/agent-host-transport.js';

/**
 * Project the browser's admission config onto the daemon's.
 *
 * Two fields deliberately do not travel:
 * - `testingEnabled` — the daemon's tool registry is assembled from its own
 *   CLI; a client cannot switch a daemon's tools on.
 * - `systemPromptBlocks` when there are fewer than two — the T0 schema takes a
 *   2- or 3-tuple, and the browser never composes fewer.
 *
 * `model` *does* travel: the T0 field is optional so a headless daemon can run
 * on its own default, but a page that has picked a model expects that model.
 */
const daemonAdmissionConfig = (config: AgentHostAdmissionConfig): AgentChannelAdmissionConfig => ({
  systemPrompt: config.systemPrompt,
  // Copied out of their readonly tuples; the wire shape is mutable by construction.
  systemPromptBlocks: [...config.systemPromptBlocks] as AgentChannelAdmissionConfig['systemPromptBlocks'],
  model: config.model,
  toolChoice: typeof config.toolChoice === 'string' ? config.toolChoice : [...config.toolChoice],
  allowedTools: [...config.allowedTools],
  ...(config.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  /* Client-authored payloads are deeply `readonly`; the wire shape is deeply
   * mutable. Same values, opposite variance — copied in, asserted once. */
  ...(config.contextPayload === undefined
    ? {}
    : { contextPayload: config.contextPayload as AgentChannelAdmissionConfig['contextPayload'] }),
  ...(config.contextMessages === undefined
    ? {}
    : { contextMessages: [...config.contextMessages] as AgentChannelAdmissionConfig['contextMessages'] }),
});

/**
 * Narrow one client command onto the T0 vocabulary.
 *
 * The two vocabularies are the same by construction (see `agent-wire.ts`), so
 * this is a projection, not a translation: only `start`'s admission config
 * needs reshaping, and `close` never reaches the wire at all.
 */
/**
 * The admission an external-agent turn carries (W4-ACP).
 *
 * Nothing a Tau turn negotiates travels: the daemon routes on `agent` *before*
 * it composes a Tau admission, so the model, prompt blocks and tool grant would
 * be read by nobody. `systemPrompt` and `toolChoice` are still required by the
 * T0 schema, so they are sent empty rather than fabricated from a model this
 * run will never use.
 */
const externalAdmissionConfig = (
  agent: NonNullable<AgentHostWorkerStartRequest['agent']>,
): AgentChannelAdmissionConfig => {
  if (agent.kind !== 'acp') {
    /* A Paseo session is held by the page, not by a daemon: there is no channel
     * command that would make one run there, and silently sending it as an ACP
     * agent would ask the daemon to spawn an adapter that does not exist. */
    throw new Error(`A ${agent.kind} agent cannot run on a Tau Host.`);
  }
  return { agent, systemPrompt: '', toolChoice: 'auto' };
};

const daemonCommand = (request: Exclude<AgentHostTransportRequest, { type: 'close' }>): AgentChannelCommand => {
  if (request.type !== 'start') {
    return request;
  }
  const base: Omit<Extract<AgentChannelCommand, { type: 'start' }>, 'trigger' | 'retainedMessageIds'> = {
    type: 'start',
    chatId: request.chatId,
    runId: request.runId,
    message: request.message,
    ...(request.agent
      ? { config: externalAdmissionConfig(request.agent) }
      : request.config
        ? { config: daemonAdmissionConfig(request.config) }
        : {}),
  };
  return request.trigger === 'submit'
    ? { ...base, trigger: 'submit' }
    : { ...base, trigger: request.trigger, retainedMessageIds: request.retainedMessageIds };
};

/**
 * A daemon's answers already carry the shapes the projection reads; the only
 * widening is the `interrupt` operation, which a browser client never provokes
 * but a daemon may report on a run it raised itself.
 *
 * `mcp-capability` is the one answer that is *not* a transport response: it
 * answers a command this client never sends (the Paseo runner asks a paired
 * daemon directly), so seeing one here means the daemon answered something
 * else than what was asked.
 */
const daemonResponse = (response: AgentChannelResponse): AgentHostTransportResponse => {
  if (response.type === 'mcp-capability') {
    throw new Error(`A Tau Host answered ${response.type} to a transport command.`);
  }
  return response;
};

/** How a dead wire is replaced. See {@link createDaemonAgentHostTransport}. */
export type DaemonAgentHostTransportOptions = {
  /**
   * How many times the placement may be re-dialled before the death is
   * reported. Spent for the lifetime of this transport, not per disconnection:
   * a transport is created per stream, so the bound cannot spin.
   */
  readonly redialAttempts?: number | undefined;
  /**
   * Milliseconds before the *second* re-dial, doubled for each one after it.
   * The first re-dial is immediate: the page's reconnect budget is smaller than
   * one step, and a wire that died with its host still alive is worth one free
   * attempt before anything is assumed about why.
   */
  readonly redialBackoff?: number | undefined;
};

/** One dialled channel, and the promise that settles when it dies. */
type ChannelRecord = { readonly client: AgentChannelClient; readonly gone: Promise<void>; dead: boolean };

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });

/** Reads are pure: replaying one on a healed wire cannot double an effect. */
const replayable = (request: AgentHostTransportRequest): boolean =>
  request.type === 'attach' || request.type === 'tail';

/**
 * Drive the shared agent-host client over a paired daemon's T0 channel.
 *
 * The daemon owns its workspace, its tools and its credentials: nothing here
 * initializes it, transfers a filesystem bridge, or claims workspace authority.
 * That asymmetry is the whole reason the transport seam exists.
 *
 * **Given a dial function, the wire heals itself.** A relayed channel does not
 * outlive its relay session, and a run does not end when the socket does — the
 * daemon carries on and its log stays the authority. So a socket death is not
 * reported upward while the placement can still be re-dialled: the live streams
 * resubscribe on the replacement, and a read the wire died under is replayed
 * there with the same cursor (the projection dedupes by `leaderEpoch:sequence`,
 * so a re-read is free). Only when the bound is spent does the death surface,
 * as the typed reason the transcript renders. Passing an already-open client
 * keeps the old behaviour: one wire, and its death is final.
 *
 * @param source - An open channel, or how to dial one (and dial it again).
 * @param options - The re-dial bound and backoff.
 * @returns A transport `createAgentHostClient` cannot tell from the worker's.
 * @public
 */
export const createDaemonAgentHostTransport = (
  source: AgentChannelClient | (() => Promise<AgentChannelClient>),
  options: DaemonAgentHostTransportOptions = {},
): AgentHostTransport => {
  const dial = typeof source === 'function' ? source : undefined;
  const alreadyOpen = typeof source === 'function' ? undefined : source;
  const attemptLimit = options.redialAttempts ?? 3;
  const backoff = options.redialBackoff ?? 250;
  const closeHandlers = new Set<(reason: AgentHostTransportCloseReason) => void>();
  let death: AgentHostTransportCloseReason | undefined;
  let disposed = false;
  let redials = 0;
  let current: ChannelRecord | undefined;
  let connecting: Promise<ChannelRecord> | undefined;

  const reportDeath = (reason: AgentHostTransportCloseReason): void => {
    if (death) {
      return;
    }
    death = reason;
    for (const handler of closeHandlers) {
      handler(reason);
    }
    closeHandlers.clear();
  };

  const adopt = (client: AgentChannelClient): ChannelRecord => {
    const gone = Promise.withResolvers<void>();
    const record: ChannelRecord = { client, dead: false, gone: gone.promise };
    client.onClose((reason) => {
      record.dead = true;
      gone.resolve();
      if (current === record) {
        current = undefined;
      }
      /* Nothing to re-dial, or nothing left to serve: the death is the answer. */
      if (!dial || disposed) {
        reportDeath({
          code: reason.origin === 'timeout' ? 'HOST_UNRESPONSIVE' : 'HOST_DISCONNECTED',
          message: reason.message,
        });
      }
    });
    return record;
  };

  // An already-open channel is adopted as it is: one wire, and its death final.
  current = alreadyOpen ? adopt(alreadyOpen) : undefined;

  const openChannel = async (): Promise<ChannelRecord> => {
    if (death) {
      throw new AgentHostWorkerError(death.code, death.message);
    }
    if (!dial) {
      throw new AgentHostWorkerError('HOST_DISCONNECTED', 'This connection to the agent host was closed.');
    }
    if (current === undefined && redials === 0 && !disposed) {
      /* The placement's own dial. Its refusal is typed (offline, unpaired, no
       * agent route) and belongs to the caller verbatim — never swallowed into
       * a retry loop that would report something vaguer. */
      const record = adopt(await dial());
      current = record;
      redials = 1;
      return record;
    }
    let failure: unknown;
    // oxlint-disable-next-line no-unmodified-loop-condition -- `close()` flips `disposed` from outside this loop.
    while (redials <= attemptLimit && !disposed) {
      redials += 1;
      /* The first re-dial waits for nothing: a relayed wire dies mid-session
       * while the run carries on, and the page's whole reconnect budget is
       * smaller than one backoff step. `redials` is 1 after the placement's own
       * dial, so `redials - 2` counts the re-dials that already failed — only
       * those pay, and then they double. */
      // oxlint-disable-next-line no-await-in-loop -- a bounded backoff between dials is the point.
      await sleep(redials > 2 ? backoff * 2 ** (redials - 3) : 0);
      try {
        // oxlint-disable-next-line no-await-in-loop -- one dial at a time; the winner is kept.
        const record = adopt(await dial());
        current = record;
        return record;
      } catch (error) {
        failure = error;
      }
    }
    const message =
      failure instanceof Error
        ? `The agent host closed this connection and could not be reached again (${failure.message}).`
        : 'The agent host closed this connection and could not be reached again.';
    reportDeath({ code: 'HOST_DISCONNECTED', message });
    throw new AgentHostWorkerError('HOST_DISCONNECTED', message);
  };

  /** The live channel, dialling or re-dialling once for every consumer at once. */
  const connect = async (stale?: ChannelRecord): Promise<ChannelRecord> => {
    if (stale) {
      stale.dead = true;
      if (current === stale) {
        current = undefined;
      }
    }
    const live = current;
    if (live && !live.dead) {
      return live;
    }
    // oxlint-disable-next-line promise/prefer-await-to-then -- one dial serves every consumer that asked while it was in flight
    connecting ??= openChannel().finally(() => {
      connecting = undefined;
    });
    return connecting;
  };

  const opened = async (): Promise<void> => {
    await connect();
  };

  /** Whatever the channel does with its sinks, a listen ends with its socket. */
  const endOf = async <Name extends keyof AgentHostTransportStreams>(
    record: ChannelRecord,
  ): Promise<IteratorResult<AgentHostTransportStreams[Name]>> => {
    await record.gone;
    return { done: true, value: undefined };
  };

  const release = async (iterator: AsyncIterator<unknown>): Promise<void> => {
    try {
      await iterator.return?.();
    } catch {
      // An iterator that is already gone is the outcome this wanted.
    }
  };

  return {
    /* A daemon is configured from its own CLI; there is nothing to initialize —
     * readiness is just the placement's dial, and its refusal reaches whoever
     * awaits a command, verbatim (the same shape the worker transport uses). */
    ready: dial ? opened() : Promise.resolve(),
    call: async (request, signal) => {
      if (request.type === 'close') {
        // Teardown is local: the daemon keeps running, which is the point of it.
        return { type: 'closed' };
      }
      const command = daemonCommand(request);
      const record = await connect();
      try {
        return daemonResponse(await record.client.execute(command, signal));
      } catch (error) {
        const died = record.dead || (error as { readonly code?: unknown }).code === 'CHANNEL_CLOSED';
        if (!died || !dial || (signal?.aborted ?? false) || !replayable(request)) {
          /* Only reads are replayed (ponytail): `start`, `steer`, `cancel` and
           * `resolve-interrupt` are not provably idempotent on the host, and the
           * client already recovers an admission it lost by re-attaching. */
          throw error;
        }
        const healed = await connect(record);
        return daemonResponse(await healed.client.execute(command, signal));
      }
    },
    listen: async function* listen<Name extends keyof AgentHostTransportStreams>(
      name: Name,
      signal: AbortSignal,
    ): AsyncGenerator<AgentHostTransportStreams[Name]> {
      // oxlint-disable-next-line no-unmodified-loop-condition -- `close()` flips `disposed` from outside this loop.
      while (!disposed && !signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- one wire at a time, by construction.
        const record = await connect();
        const events = (
          name === 'events' ? record.client.events(signal) : record.client.liveEvents(signal)
        ) as AsyncIterable<AgentHostTransportStreams[Name]>;
        const iterator = events[Symbol.asyncIterator]();
        const ended = endOf<Name>(record);
        try {
          for (;;) {
            // oxlint-disable-next-line no-await-in-loop -- an event stream is sequential by definition.
            const next = await Promise.race([iterator.next(), ended]);
            if (next.done === true) {
              break;
            }
            yield next.value;
          }
        } finally {
          void release(iterator);
        }
        if (!record.dead) {
          // The host ended the stream itself; a re-subscribe would spin.
          return;
        }
      }
    },
    onClose: (handler: (reason: AgentHostTransportCloseReason) => void) => {
      if (death) {
        handler(death);
        return (): void => undefined;
      }
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    close: () => {
      disposed = true;
      current?.client.close();
      current = undefined;
    },
  };
};
