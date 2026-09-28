/**
 * The placement session on `@taucad/rpc` (W6 RH-S11, W8 TS-S5, W4 T5): the browser's file-manager worker serves one
 * project's {@link TurnPlacementPort} on a port the page brokers, and the resident agent host is its client. Apps never
 * import `@taucad/rpc` (R3), so both halves live here.
 *
 * - **Frames.** Every request is parsed strictly by the server; one it cannot read is answered `FRAME_UNREADABLE`
 *   (W4 SC-R4), never dropped. A refusal the session gives is data; a dead session rejects every wait with the
 *   channel's close, as W4's liveness bound (1 s keepalive, 3.5 s liveness) or coded close decides (T9 E3, E4).
 * - **Tools.** `admit` transfers the attempt's tool port; the client turns it into a `ToolRegistry` with `toolsFor`.
 */

import { z } from 'zod';

import type { ChannelServer, CloseInfo } from '@taucad/rpc';

import { connectAgentWorkerChannel, serveAgentWorkerChannel } from '#channel/worker-channel.js';
import type { RefusalCode } from '#wire/refusals.js';
import type {
  ToolRegistry,
  TurnAdmitInput,
  TurnAttemptInput,
  TurnCompleteInput,
  TurnPlacementAnswer,
  TurnPlacementFact,
  TurnPlacementGrant,
  TurnPlacementPort,
  TurnReconcileInput,
} from '#waist/ports.js';

/** An attempt's tools as they cross a port: the filesystem bridge the session minted over its checkout. @public */
export type TurnPlacementToolPort = Readonly<{ port: MessagePort }>;

type AdmitCode = Extract<Awaited<ReturnType<TurnPlacementPort['admit']>>, { status: 'refused' }>['code'];

/**
 * A placement session as its server holds it: {@link TurnPlacementPort} whose grants carry a tool port rather than a
 * registry. W8's `createTurnPlacementPort` over `createFileSystemBridgePort` is one.
 *
 * @public
 */
export type TurnPlacementSession = Omit<TurnPlacementPort, 'admit'> &
  Readonly<{
    admit: (
      input: TurnAdmitInput,
    ) => Promise<
      TurnPlacementAnswer<
        Readonly<{ placement: Omit<TurnPlacementGrant, 'tools'> & Readonly<{ tools: TurnPlacementToolPort }> }>,
        AdmitCode
      >
    >;
  }>;

type WireGrant = Omit<TurnPlacementGrant, 'tools'> & Readonly<{ tools: TurnPlacementToolPort }>;

/** The placement session's wire. @internal */
type TurnPlacementProtocol = {
  readonly hello: Readonly<{ projectId: string }>;
  readonly calls: {
    readonly admit: {
      args: TurnAdmitInput;
      wireArgs: unknown;
      result: TurnPlacementAnswer<Readonly<{ placement: WireGrant }>, AdmitCode>;
      wireResult: unknown;
    };
    readonly complete: {
      args: TurnCompleteInput;
      wireArgs: unknown;
      result: Awaited<ReturnType<TurnPlacementPort['complete']>>;
      wireResult: unknown;
    };
    readonly abandon: {
      args: TurnAttemptInput;
      wireArgs: unknown;
      result: Awaited<ReturnType<TurnPlacementPort['abandon']>>;
      wireResult: unknown;
    };
    readonly reconcile: {
      args: TurnReconcileInput;
      wireArgs: unknown;
      result: Awaited<ReturnType<TurnPlacementPort['reconcile']>>;
      wireResult: unknown;
    };
    readonly acknowledge: {
      args: TurnAttemptInput;
      wireArgs: unknown;
      result: Awaited<ReturnType<TurnPlacementPort['acknowledge']>>;
      wireResult: unknown;
    };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    readonly settlements: { args: undefined; wireArgs: unknown; event: TurnPlacementFact; wireEvent: unknown };
  };
};

const text = z.string().min(1);
const keySchema = z.strictObject({ chatId: text, turnId: text, runId: text, attempt: z.number().int().positive() });
const attemptSchema = z.strictObject({ requestId: text, key: keySchema });
/** Each verb's request, parsed strictly by the server (SC-R4). */
const requests = {
  admit: attemptSchema.extend({ checkoutId: text.optional() }),
  complete: attemptSchema.extend({ cut: z.boolean() }),
  abandon: attemptSchema,
  reconcile: z.strictObject({ requestId: text, chatId: text.optional() }),
  acknowledge: attemptSchema,
} as const;

/* Answers and facts are the session's own; the client checks only what it routes on. */
const answerSchema = z.looseObject({ requestId: text, status: z.enum(['applied', 'replayed', 'refused']) });
const factSchema = z.looseObject({ kind: z.enum(['settled', 'leaseHeld']), key: keySchema });
const call = { args: z.unknown(), result: answerSchema };

const turnPlacementProtocolSchemas = {
  hello: z.strictObject({ projectId: text }),
  calls: { admit: call, complete: call, abandon: call, reconcile: call, acknowledge: call },
  notifies: {},
  listens: { settlements: { args: z.unknown(), event: factSchema } },
};

/** The session key both halves name, and the keepalive the server sends (T9 E3). */
const sessionKeyOf = (projectId: string): string => `turn-placement:${projectId}`;
const keepaliveInterval = 1000;
/** The client's liveness bound: silence this long from a keepalive-sending session is death (T9 E4). Milliseconds. */
const livenessTimeout = 3500;

const unreadable = (verb: string, issues: string): Error =>
  Object.assign(new Error(`The placement session could not read a ${verb} request: ${issues}`), {
    code: 'FRAME_UNREADABLE' satisfies RefusalCode,
  });

/** Options for {@link serveTurnPlacementChannel}. @public */
export type ServeTurnPlacementChannelOptions = Readonly<{
  /** The port the page brokered from the resident agent host. */
  port: MessagePort;
  projectId: string;
  session: TurnPlacementSession;
}>;

/** A served placement session. @public */
export type TurnPlacementChannelHandle = Readonly<{
  /** Runs once the client's connection ends, by goodbye, liveness or a closed port. */
  onClose: (handler: () => void) => void;
}>;

/**
 * Serve one project's placement session on a brokered port (W8 TS-S5). The file-manager worker passes this as its
 * `servePlacement`.
 *
 * @param options - The port, the project and the session.
 * @returns The handle whose close the session's owner fences on.
 * @public
 *
 * @example <caption>Serve the session a revision root opened</caption>
 * ```typescript
 * import { serveTurnPlacementChannel } from '@taucad/agent-host/channel-client';
 * import type { TurnPlacementSession } from '@taucad/agent-host/channel-client';
 *
 * declare const port: MessagePort;
 * declare const session: TurnPlacementSession;
 * const served = serveTurnPlacementChannel({ port, projectId: 'project-1', session });
 * served.onClose(() => {
 *   console.info('the agent host let go of the placement session');
 * });
 * ```
 */
export const serveTurnPlacementChannel = (options: ServeTurnPlacementChannelOptions): TurnPlacementChannelHandle => {
  const { session } = options;
  const parse = <Verb extends keyof typeof requests>(verb: Verb, args: unknown): z.infer<(typeof requests)[Verb]> => {
    const parsed = requests[verb].safeParse(args);
    if (!parsed.success) {
      throw unreadable(verb, parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return parsed.data as z.infer<(typeof requests)[Verb]>;
  };
  /* The server reads its frames itself (SC-R4), so it serves the wire untyped; the client half is typed. */
  const impl: ChannelServer = {
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    call: async (_context, name, args): Promise<unknown> => {
      switch (name) {
        case 'admit': {
          const answer = await session.admit(parse('admit', args));
          if (answer.status === 'refused') {
            return answer;
          }
          const { port } = answer.placement.tools;
          return {
            value: { ...answer, placement: { ...answer.placement, tools: { port } } },
            transferables: [port],
          };
        }
        case 'complete': {
          return session.complete(parse('complete', args));
        }
        case 'abandon': {
          return session.abandon(parse('abandon', args));
        }
        case 'reconcile': {
          return session.reconcile(parse('reconcile', args));
        }
        case 'acknowledge': {
          return session.acknowledge(parse('acknowledge', args));
        }
        default: {
          throw unreadable(name, 'no such verb');
        }
      }
    },
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    listen: (_context, _name, _args, signal) => session.settlements({ signal }),
  };
  const handle = serveAgentWorkerChannel(options.port, {
    sessionKey: sessionKeyOf(options.projectId),
    protocolSchemas: turnPlacementProtocolSchemas,
    impl,
    label: 'turn-placement',
    hello: { projectId: options.projectId },
    keepaliveInterval,
  });
  return {
    onClose: (handler) => {
      handle.onClose(() => {
        handler();
      });
    },
  };
};

/** Options for {@link connectTurnPlacementChannel}. @public */
export type ConnectTurnPlacementChannelOptions = Readonly<{
  /** This end of the port the page brokered into the project's file-manager worker. */
  port: MessagePort;
  projectId: string;
  /** Turn an admitted attempt's tool port into the registry its turn runs on. */
  toolsFor: (tools: TurnPlacementToolPort) => ToolRegistry;
}>;

/** The client half: a {@link TurnPlacementPort}, and its connection. @public */
export type TurnPlacementChannel = TurnPlacementPort &
  Readonly<{
    /** Say goodbye; the session's owner fences it. Idempotent. */
    close: (reason?: string) => void;
    /** Subscribe to the connection's end, with its code. Returns an unsubscribe. */
    onClose: (handler: (info: CloseInfo) => void) => () => void;
  }>;

/**
 * Connect to one project's placement session (W8 TS-S5): the port the resident agent host hands its launcher as
 * `turnPlacement`.
 *
 * @param options - The port, the project and how to open an attempt's tools.
 * @returns The placement port over the channel.
 * @public
 *
 * @example <caption>Place turns through the file-manager worker</caption>
 * ```typescript
 * import { connectTurnPlacementChannel } from '@taucad/agent-host/channel-client';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const port: MessagePort;
 * declare const registryOver: (port: MessagePort) => ToolRegistry;
 * const turnPlacement = connectTurnPlacementChannel({
 *   port,
 *   projectId: 'project-1',
 *   toolsFor: (tools) => registryOver(tools.port),
 * });
 * const answer = await turnPlacement.reconcile({ requestId: 'reconcile-1' });
 * ```
 */
export const connectTurnPlacementChannel = (options: ConnectTurnPlacementChannelOptions): TurnPlacementChannel => {
  const channel = connectAgentWorkerChannel<TurnPlacementProtocol>(options.port, {
    sessionKey: sessionKeyOf(options.projectId),
    protocolSchemas: turnPlacementProtocolSchemas,
    label: 'turn-placement-client',
    livenessTimeout,
  });
  return {
    admit: async (input) => {
      const answer = await channel.call('admit', input);
      if (answer.status === 'refused') {
        return answer;
      }
      return { ...answer, placement: { ...answer.placement, tools: options.toolsFor(answer.placement.tools) } };
    },
    complete: async (input) => channel.call('complete', input),
    abandon: async (input) => channel.call('abandon', input),
    reconcile: async (input) => channel.call('reconcile', input),
    acknowledge: async (input) => channel.call('acknowledge', input),
    settlements: ({ signal }) => channel.listen('settlements', undefined, signal),
    close: (reason) => {
      channel.close(reason);
    },
    onClose: (handler) => channel.onClose(handler),
  };
};
