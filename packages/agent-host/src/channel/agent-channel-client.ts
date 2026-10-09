/**
 * The first-party client half of the agent channel.
 *
 * R3: `@taucad/rpc` is a dependency of *packages*, never of apps. A page that
 * wants to drive a daemon imports this, not a channel factory — so the
 * transport substrate stays swappable underneath every consumer at once.
 *
 * The client dials, so its outbox survives a redial: every unanswered command is
 * re-sent with its key, and the owner's applied set answers a re-send of a
 * command that already landed `replayed` (SC-R6, SC-R7).
 *
 * Browser-safe by construction: no `node:` import may reach this file.
 */

import { ChannelClosedError, createChannelClient } from '@taucad/rpc';
import type { Channel, CloseInfo } from '@taucad/rpc';

import { agentChannelPort } from '#channel/endpoint.js';
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
import type { JsonValue } from '#log/event-types.js';
import type { SourceLiveEvent } from '#waist/ports.js';
import { agentWireVersion, sourceLiveEventSchema, catchUpFrameSchema } from '#wire/frames.schema.js';
import type {
  CatchUpFrame,
  CatchUpInput,
  AgentChannelRevisionEvent,
  ReadAnswer,
  ReadInput,
} from '#wire/frames.schema.js';
import { agentWireCompatSchemas, helloWire, v1RequestFor } from '#channel/wire-v1.js';
import type { AgentWireCompatProtocol, V1Response } from '#channel/wire-v1.js';
import type { CommandAnswer, CommandInput, CommandVerb, HostCommand } from '#wire/commands.schema.js';
import type { RefusalCode } from '#wire/refusals.js';

/** Options for {@link createAgentChannelClient}. @public */
export type AgentChannelClientOptions = Readonly<{
  /**
   * Opens one transport to the owner; called again for every redial. May be asynchronous, as the desktop bridge's
   * port is. A rejection before any connection opened reaches the caller as it is.
   */
  connect: () => AgentChannelEndpoint | Promise<AgentChannelEndpoint>;
  /** Close with `PEER_UNRESPONSIVE` after this much silence from an owner that sends keepalives (T9 E4). Milliseconds. */
  livenessTimeout?: number | undefined;
  /** Context label carried on every dispatch; defaults to `tau-agent`. */
  sessionKey?: string | undefined;
}>;

/** One connection to an agent owner, redialled while commands are unanswered. @public */
export type AgentChannelClient = {
  /**
   * Send one keyed command and await its answer. A re-send of the same key joins the entry already outstanding.
   * `signal` only stops this wait (D17): the outbox keeps the entry and re-sends it after a redial. Rejects with
   * {@link ChannelClosedError} (effect unknown) once the redial budget is spent.
   */
  execute(input: CommandInput): Promise<CommandAnswer>;
  /** One long-poll read of a chat's durable rows; a batch, or a refusal the reader resets on (SC-R12). */
  read(input: ReadInput): Promise<ReadAnswer>;
  /** Provisional immutable catch-up pages; publish only after their validated marker. */
  catchUp(input: CatchUpInput): AsyncIterable<CatchUpFrame>;
  /** Ephemeral model deltas for one chat. */
  liveEvents(input: Readonly<{ chatId: string; signal?: AbortSignal | undefined }>): AsyncIterable<SourceLiveEvent>;
  /** One request to the owner's revision root. */
  revision(request: JsonValue, signal?: AbortSignal): Promise<Readonly<{ result: JsonValue; status: JsonValue }>>;
  /** Host-authoritative revision projections and outcomes for this workspace. */
  revisionEvents(signal?: AbortSignal): AsyncIterable<AgentChannelRevisionEvent>;
  /** Subscribe to every connection's close, with its code. Returns an unsubscribe. */
  onClose(handler: (info: CloseInfo) => void): () => void;
  /** Say goodbye and stop redialling; unanswered commands reject with `CHANNEL_CLOSED`. Idempotent. */
  close(reason?: string): void;
};

/** Redials after a connection is lost before an unanswered command gives up, and the second one's backoff, doubling (T9 E7). Milliseconds. */
const redialAttempts = 5;
const redialBackoff = 250;

/** The rpc errors that mean the owner never acted on the command: answered as a refusal, not re-sent (SC T5). */
const unreadByOwner: ReadonlySet<string> = new Set([
  'FRAME_UNREADABLE',
  'WIRE_VALIDATION_FAILED',
  'WIRE_VERSION_UNSUPPORTED',
] satisfies RefusalCode[]);

type Pending = {
  readonly command: HostCommand;
  readonly settle: PromiseWithResolvers<CommandAnswer>;
};

const codeOf = (error: unknown): string | undefined => {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  return typeof code === 'string' ? code : undefined;
};

const aborted = async (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    const fail = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('The wait was aborted.', 'AbortError'));
    };
    if (signal.aborted) {
      fail();
    } else {
      signal.addEventListener('abort', fail, { once: true });
    }
  });

/** One open connection and the wire its owner's hello named (I32). */
type Connection = Readonly<{ channel: Channel<AgentWireCompatProtocol>; wire: 1 | typeof agentWireVersion }>;

const unexpected = (answer: V1Response): never => {
  throw Object.assign(new Error(`The v1 agent host answered with ${answer.type}.`), {
    code: 'COMMAND_UNREADABLE' satisfies RefusalCode,
  });
};

/** A stream that ends quietly when its own signal ends it. */
const guarded = async function* <Event>(
  signal: AbortSignal | undefined,
  stream: () => AsyncGenerator<Event>,
): AsyncGenerator<Event> {
  try {
    yield* stream();
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    throw error;
  }
};

/** One v1 replay window: `tail` answers at once, and clamps a cursor past the end. */
const v1Tail = async (
  channel: Channel<AgentWireCompatProtocol>,
  input: Readonly<{ chatId: string; cursor: number; limit: number; maxBytes?: number | undefined }>,
  signal?: AbortSignal,
) => {
  const answer = await channel.call('request', { type: 'tail', ...input }, signal);
  return answer.type === 'tail' ? answer.batch : unexpected(answer);
};

/**
 * A keyed command, sent to a v1 owner in its own vocabulary. The v1 owner has no applied set, so the answer is the
 * position the log had before the command, which is where its first row lands on a single-writer daemon.
 */
const v1Execute = async (channel: Channel<AgentWireCompatProtocol>, command: HostCommand): Promise<CommandAnswer> => {
  const { chatId } = command.payload;
  if (command.type === 'attach') {
    const answer = await channel.call('request', v1RequestFor(command));
    if (answer.type !== 'attach') {
      return unexpected(answer);
    }
    return {
      commandId: command.commandId,
      generation: 0,
      status: 'applied',
      effect: 'not-applied',
      details: {
        ...(answer.snapshot === undefined ? {} : { snapshot: answer.snapshot }),
        takeover: answer.takeover,
        endCursor: answer.batch.endCursor,
      },
    };
  }
  const before = await v1Tail(channel, { chatId, cursor: Number.MAX_SAFE_INTEGER, limit: 1 });
  await channel.call('request', v1RequestFor(command));
  return {
    commandId: command.commandId,
    generation: 0,
    status: 'applied',
    effect: 'durable',
    cursor: before.endCursor,
  };
};

/**
 * Open an agent channel that dials through `connect`, redials while commands are unanswered, and re-sends each with
 * its key.
 *
 * A socket endpoint must be handed over *before* `open`: the server posts its
 * hello the instant the upgrade completes, and a listener attached later never
 * sees it. `agentChannelPort` buffers in both directions from the moment it is
 * called, so returning an unopened socket from `connect` is the correct usage.
 *
 * @param options - How to dial, the liveness bound and the context label.
 * @returns A client whose outbox outlives each connection.
 * @public
 *
 * @example <caption>Dial a daemon from a page</caption>
 * ```typescript
 * import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
 *
 * const client = createAgentChannelClient({
 *   connect: () => new WebSocket('wss://host.example/agent'),
 *   livenessTimeout: 10_000,
 * });
 * const answer = await client.execute({
 *   type: 'cancel',
 *   commandId: 'req_1',
 *   payload: { chatId: 'chat-1', runId: 'run-1' },
 * });
 * ```
 */
export const createAgentChannelClient = (options: AgentChannelClientOptions): AgentChannelClient => {
  const outbox = new Map<string, Pending>();
  const closeHandlers = new Set<(info: CloseInfo) => void>();
  let channel: Promise<Connection> | undefined;
  /** Redials since a connection last opened; the budget is T9 E7's. */
  let redials = 0;
  let everOpened = false;
  let redialTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFailure: unknown;
  let fatal: Error | undefined;
  let closedHere = false;

  const rejectAll = (error: unknown): void => {
    for (const [commandId, pending] of outbox) {
      outbox.delete(commandId);
      pending.settle.reject(error);
    }
  };

  /** A dial failed or a connection closed: re-send the outbox on a new one, or give up once the budget is spent. */
  const redial = (): void => {
    if (redialTimer !== undefined || closedHere || fatal !== undefined || outbox.size === 0) {
      return;
    }
    if (redials >= redialAttempts) {
      rejectAll(lastFailure ?? new ChannelClosedError({ origin: 'remote', code: 'PEER_GONE' }));
      return;
    }
    redials += 1;
    /* The first redial waits for nothing: a relayed wire dies mid-session while the run carries on. Later ones
     * back off, doubling. */
    redialTimer = setTimeout(
      () => {
        redialTimer = undefined;
        for (const pending of outbox.values()) {
          send(pending);
        }
      },
      redials === 1 ? 0 : redialBackoff * 2 ** (redials - 2),
    );
  };

  const open = async (): Promise<Connection> => {
    const port = agentChannelPort(await options.connect(), 'agent-channel-client');
    const opened: Channel<AgentWireCompatProtocol> = createChannelClient<AgentWireCompatProtocol>({
      port,
      sessionKey: options.sessionKey ?? 'tau-agent',
      protocolSchemas: agentWireCompatSchemas,
      ...(options.livenessTimeout === undefined ? {} : { livenessTimeout: options.livenessTimeout }),
    });
    let closedWith: CloseInfo | undefined;
    opened.onClose((info) => {
      closedWith = info;
      channel = undefined;
      lastFailure = new ChannelClosedError(info);
      /* The channel's own close only stops dispatch; the wire underneath is this
       * client's to release. */
      try {
        port.close();
      } catch {
        // A port that is already gone is the outcome we wanted.
      }
      for (const handler of closeHandlers) {
        handler(info);
      }
      redial();
    });
    try {
      await opened.ready;
    } catch {
      // A connection that closed before its hello is a lost connection, whatever the rpc said about it.
      throw new ChannelClosedError(closedWith ?? { origin: 'remote', code: 'PEER_GONE' });
    }
    redials = 0;
    everOpened = true;
    const wire = helloWire(opened.hello.payload);
    if (wire === 'unsupported') {
      /* I32: an owner whose hello names another wire speaks another protocol; redialling cannot help. */
      fatal = Object.assign(new Error('The agent owner speaks another wire version; update Tau on that host.'), {
        code: 'WIRE_VERSION_UNSUPPORTED' satisfies RefusalCode,
      });
      rejectAll(fatal);
      opened.close('wire version unsupported');
      throw fatal;
    }
    return { channel: opened, wire };
  };

  /** The live connection, dialled once for every caller at once. */
  const connection = async (): Promise<Connection> => {
    if (fatal !== undefined) {
      throw fatal;
    }
    if (closedHere) {
      throw new ChannelClosedError({ origin: 'local', code: 'CHANNEL_CLOSED' });
    }
    channel ??= (async () => {
      try {
        return await open();
      } catch (error) {
        channel = undefined;
        throw error;
      }
    })();
    return channel;
  };

  const send = (pending: Pending): void => {
    const { type, commandId, payload } = pending.command;
    const settle = (answer: CommandAnswer): void => {
      outbox.delete(commandId);
      pending.settle.resolve(answer);
    };
    const fail = (error: unknown): void => {
      outbox.delete(commandId);
      pending.settle.reject(error);
    };
    const deliver = async (): Promise<void> => {
      let current: Connection;
      try {
        current = await connection();
      } catch (error) {
        /* A dial that throws before any connection opened is the caller's (offline, unpaired): verbatim, at once. A
         * connection that closed before its hello is a lost connection, and spends the redial budget. */
        if ((!everOpened && !(error instanceof ChannelClosedError)) || fatal !== undefined || closedHere) {
          fail(error);
          return;
        }
        lastFailure = error;
        redial();
        return;
      }
      try {
        if (current.wire === 1) {
          settle(await v1Execute(current.channel, pending.command));
          return;
        }
        const call = current.channel.call as (
          name: CommandVerb,
          args: Readonly<{ commandId: string; payload: unknown }>,
        ) => Promise<CommandAnswer>;
        settle(await call(type, { commandId, payload }));
      } catch (error) {
        /* ponytail: kept; the redial re-sends it with the same key (SC-R6). A v1 owner has no applied set, so a
         * command lost with its connection is not re-sent: it rejects, effect unknown, and only reads replay. */
        if (
          error instanceof ChannelClosedError &&
          current.wire === agentWireVersion &&
          fatal === undefined &&
          !closedHere
        ) {
          return;
        }
        const code = codeOf(error);
        if (
          code !== undefined &&
          (current.wire === 1 || unreadByOwner.has(code)) &&
          !(error instanceof ChannelClosedError)
        ) {
          settle({
            commandId,
            generation: 0,
            status: 'refused',
            effect: 'not-applied',
            code,
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        fail(error);
      }
    };
    void deliver();
  };

  return {
    execute: async ({ signal, ...command }) => {
      if (closedHere) {
        throw new ChannelClosedError({ origin: 'local', code: 'CHANNEL_CLOSED' });
      }
      let pending = outbox.get(command.commandId);
      if (pending === undefined) {
        pending = { command: command as HostCommand, settle: Promise.withResolvers<CommandAnswer>() };
        outbox.set(command.commandId, pending);
        send(pending);
      }
      return signal === undefined ? pending.settle.promise : Promise.race([pending.settle.promise, aborted(signal)]);
    },
    read: async ({ signal, sourceGeneration, ...request }) => {
      const input = { ...request, ...(sourceGeneration === undefined ? {} : { sourceGeneration }) };
      const current = await connection();
      if (current.wire !== agentWireVersion) {
        throw Object.assign(new Error('This host cannot provide authoritative source health. Update the agent host.'), {
          code: 'WIRE_VERSION_UNSUPPORTED' satisfies RefusalCode,
        });
      }
      return current.channel.call('read', input, signal);
    },
    catchUp: ({ signal, ...input }) =>
      guarded(signal, async function* () {
        const current = await connection();
        if (current.wire !== agentWireVersion) {
          throw Object.assign(new Error('Legacy hosts do not support immutable catch-up.'), {
            code: 'WIRE_VERSION_UNSUPPORTED' satisfies RefusalCode,
          });
        }
        for await (const frame of current.channel.listen('catchUp', input, signal)) {
          yield catchUpFrameSchema.parse(frame);
        }
      }),
    liveEvents: ({ chatId, signal }) =>
      guarded(signal, async function* () {
        const current = await connection();
        if (current.wire === agentWireVersion) {
          for await (const event of current.channel.listen('liveEvents', { chatId }, signal)) {
            yield sourceLiveEventSchema.parse(event);
          }
          return;
        }
        throw Object.assign(
          new Error('Legacy v1 live events have no authoritative writer generation; update Tau on that host.'),
          {
            code: 'WIRE_VERSION_UNSUPPORTED' satisfies RefusalCode,
          },
        );
      }),
    revision: async (request, signal) => {
      const current = await connection();
      if (current.wire === agentWireVersion) {
        return current.channel.call('revision', { request }, signal);
      }
      const answer = await current.channel.call('request', { type: 'revision', request }, signal);
      return answer.type === 'revision' ? { result: answer.result, status: answer.status } : unexpected(answer);
    },
    revisionEvents: (signal) =>
      guarded(signal, async function* () {
        const current = await connection();
        yield* current.channel.listen('revisionEvents', undefined, signal);
      }),
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => {
        closeHandlers.delete(handler);
      };
    },
    close: (reason) => {
      if (closedHere) {
        return;
      }
      closedHere = true;
      clearTimeout(redialTimer);
      const closing = channel;
      const say = async (): Promise<void> => {
        try {
          const current = await closing;
          current?.channel.close(reason);
        } catch {
          // A connection that never opened has nothing to say goodbye on.
        }
      };
      void say();
      rejectAll(new ChannelClosedError({ origin: 'local', code: 'CHANNEL_CLOSED' }));
    },
  };
};
