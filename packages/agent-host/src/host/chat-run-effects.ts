/**
 * M1's composition root (MC-R4): `createChatRunActor` provides every custom action the machine declares, as arrows
 * keyed by effect name (S1 H3), over one incarnation's services. Effects never await inside the machine (S1 X3):
 * each starts its work and delivers the correlated outcome as a public event (RA-R7).
 */

import { createActor } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';

import { chatRunMachine } from '#host/chat-run.machine.js';
import type { ChatRunInput } from '#host/chat-run.machine.js';
import type {
  AppendRowsArgs,
  ApprovalRequest,
  ApprovalResolution,
  ChatRunEffectArgs,
  ChatRunHostEvent,
  ChatRunOutcomeEvent,
  ChatRunRow,
  HeldCommand,
  PreparedAdmission,
  PreparedResume,
  StartDriverArgs,
} from '#host/chat-run-events.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { JsonValue, RunFailureDetail } from '#log/event-types.js';
import { codedFailureDetail } from '#harness/coded-failure.js';
import type { TurnAttemptKey, TurnPlacementGrant, TurnPlacementPort } from '#waist/ports.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

/** One running attempt, as M1 reaches it (D18 condition 9: a plain handle, not a child). */
export type DriverHandle = Readonly<{
  steer: (commandId: string, message: string) => void;
  abort: (reason: string) => void;
  decide: (resolution: ApprovalResolution) => void;
}>;

/** What a driver reports: how its attempt ended, and the requests it asks a person (external only). */
export type DriverReport =
  | Readonly<{
      type: 'agentEnded';
      outcome: 'completed' | 'failed' | 'aborted';
      failure?: RunFailureDetail;
      stopReason?: string;
    }>
  | Readonly<{ type: 'approvalRequested'; interruptId: string; request: ApprovalRequest }>;

/** A coded refusal from a host service. */
export type ServiceRefusal = Readonly<{
  code: string;
  message: string;
  details?: JsonValue;
  effect?: 'not-applied' | 'unknown';
}>;

/**
 * The host services one incarnation's effects call: the chat's log and append chain (W3), the admission and resume
 * preparation, the drivers, and W8's placement port. Implemented by `createTauAgentHost`.
 */
export type ChatRunServices = Readonly<{
  /** Fold the chat's log (no write) and list the repair rows opening owes (D5, L2a D7). */
  openLog: (
    input: Readonly<{ chatId: string; deliver: (event: ChatRunOutcomeEvent) => void }>,
  ) => Promise<Readonly<{ ledger: ChatLedger; repair: readonly ChatRunRow[] }>>;
  /** Append one batch through the chain; throws a `ServiceRefusal`-shaped error when refused. */
  append: (
    input: Readonly<{ chatId: string; leaderEpoch: string; rows: readonly ChatRunRow[]; ends?: TurnAttemptKey }>,
  ) => Promise<Readonly<{ ledger: ChatLedger; messageIds: readonly string[] }>>;
  prepareAdmission: (
    input: Readonly<{ chatId: string; commandId: string; payload: JsonValue }>,
  ) => Promise<PreparedAdmission>;
  prepareResume: (
    input: Readonly<{ chatId: string; commandId: string; runId: string; payload: JsonValue }>,
  ) => Promise<PreparedResume>;
  startDriver: (
    input: StartDriverArgs &
      Readonly<{
        leaderEpoch: string;
        report: (report: DriverReport) => void;
        /** W8's grant for the attempt: the driver runs with its tools, rooted at its root (RA-R12). */
        grant?: TurnPlacementGrant;
      }>,
  ) => DriverHandle;
  closeLog: (chatId: string) => Promise<void>;
  placement?: TurnPlacementPort | undefined;
}>;

/** What one incarnation needs beyond its input. */
export type ChatRunDeps = Readonly<{
  services: ChatRunServices;
  /** Hand one answer to the registry's in-flight table. */
  answer: (answer: CommandAnswer) => void;
  /** Re-send held commands once the slot can act on them. */
  redeliver: (commands: readonly HeldCommand[]) => void;
  delays?: Readonly<{ idleEviction?: number; driverStopBound?: number; cutRetry?: number }> | undefined;
}>;

/** The actor `createChatRunActor` returns, unstarted. */
export type ChatRunActor = Actor<typeof chatRunMachine>;

/** Every event M1 accepts from outside: commands, outcomes, host signals. */
export type ChatRunEvent = Parameters<ChatRunActor['send']>[0];

const refusalOf = (error: unknown): ServiceRefusal => {
  const detail = codedFailureDetail(error);
  const effect =
    error !== null && typeof error === 'object' && 'effect' in error && error.effect === 'unknown'
      ? 'unknown'
      : 'not-applied';
  return {
    /* An uncoded throw is a host defect: answered, never swallowed, and never a `wait` (W4's registry has no code). */
    code: detail.code ?? 'HOST_FAULT',
    message: detail.message,
    ...(detail.details === undefined ? {} : { details: detail.details as JsonValue }),
    effect,
  };
};

const keyOf = (key: TurnAttemptKey): string => `${key.runId}:${String(key.attempt)}`;

/**
 * Run one service call off the machine and deliver what it answers: an effect never awaits inside M1 (S1 X3).
 *
 * @param call - The service call.
 * @param onValue - Delivers its answer.
 * @param onError - Delivers its refusal.
 */
const settleInto = <T>(
  call: () => Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
): void => {
  const run = async (): Promise<void> => {
    let value: T;
    try {
      value = await call();
    } catch (error) {
      onError(error);
      return;
    }
    onValue(value);
  };
  void run();
};

/**
 * Build the effects of one incarnation. Each arrow is keyed by its effect name, so `Function.name` equals the key, and
 * takes JSON-safe arguments (RA-A11).
 *
 * @param input - The incarnation's identity.
 * @param deps - Its services and the registry's hooks.
 * @param deliver - Sends an outcome to this incarnation; drops it once the actor stopped (RV4).
 * @returns The provided actions.
 */
export const createChatRunEffects = (
  input: ChatRunInput,
  deps: ChatRunDeps,
  deliver: (event: ChatRunOutcomeEvent) => void,
): { readonly [Name in keyof ChatRunEffectArgs]: (args: ChatRunEffectArgs[Name]) => void } => {
  const { services } = deps;
  const drivers = new Map<string, DriverHandle>();
  const port = services.placement;
  /* The attempt's grant: its tools and root are not JSON, so they stay here, not in M1's context. */
  const grants = new Map<string, TurnPlacementGrant>();
  /* W8's settlements listen, for this incarnation's life: it replays every unacknowledged fact on subscribe. */
  const listening = new AbortController();
  const listen = async (placement: TurnPlacementPort): Promise<void> => {
    for await (const fact of placement.settlements({ signal: listening.signal })) {
      if (fact.key.chatId !== input.chatId) {
        continue;
      }
      if (fact.kind === 'changed') {
        try {
          const { ledger, messageIds } = await services.append({
            chatId: input.chatId,
            leaderEpoch: input.leaderEpoch,
            rows: [
              {
                runId: fact.key.runId,
                body: {
                  type: 'turn.changed',
                  turnId: fact.key.turnId,
                  chatId: fact.key.chatId,
                  attempt: fact.key.attempt,
                  checkoutId: fact.checkoutId,
                },
              },
            ],
          });
          deliver({ type: 'rowsCommitted', ledger, messageIds });
        } catch (error) {
          console.warn(
            '[agent-host] Turn change proof could not be recorded; the marker remains unconfirmed.',
            codedFailureDetail(error),
          );
        }
      }
      if (fact.kind === 'settled') {
        deliver({ type: 'settlementPublished', key: fact.key, row: fact.row });
      }
    }
  };
  const requestId = (verb: string, key: TurnAttemptKey): string => `${verb}:${key.runId}:${String(key.attempt)}`;
  /*
   * Reconcile at opening (TS-S7 step 4; RA-S13): a lease whose attempt the log already settled, because a host died
   * between the row and its acknowledge, is acknowledged before M1 serves any command. A record written before W5
   * (attempt 0) is settled by the run's row of any attempt (TS-Q5). A record whose run this log does not hold (another
   * device's, or a deleted chat's) is left and reported; the rest are M1's to settle after `logOpened`, which carries
   * them. A reconcile or acknowledge that fails leaves the lease for the next opening.
   */
  const reconcileOpened = async (placement: TurnPlacementPort, ledger: ChatLedger): Promise<TurnAttemptKey[]> => {
    const answer = await placement
      .reconcile({ requestId: `reconcile:${input.chatId}:${input.leaderEpoch}`, chatId: input.chatId })
      .catch(() => undefined);
    if (answer === undefined || answer.status === 'refused') {
      return [];
    }
    const held: TurnAttemptKey[] = [];
    for (const { key, checkoutId } of answer.held) {
      const run = ledger.runs[key.runId];
      if (key.chatId !== input.chatId) {
        continue;
      }
      if (run === undefined) {
        console.warn(
          `[agent-host] Lease ${key.runId} on checkout ${checkoutId} names chat ${key.chatId}, whose log holds no such run; it is left for its owner (TS-Q5).`,
        );
      } else if (run.settlements.some((settlement) => key.attempt === 0 || settlement.attempt === key.attempt)) {
        // oxlint-disable-next-line no-await-in-loop -- one acknowledge at a time, in lease order.
        await placement.acknowledge({ requestId: requestId('acknowledge', key), key }).catch(() => undefined);
      } else {
        held.push(key);
      }
    }
    return held;
  };

  return {
    openLog: (args) => {
      settleInto(
        async () => {
          const opened = await services.openLog({ chatId: args.chatId, deliver });
          const held = port === undefined ? [] : await reconcileOpened(port, opened.ledger);
          return { ...opened, held };
        },
        ({ ledger, repair, held }) => {
          deliver({ type: 'logOpened', ledger, repair, held });
          if (port !== undefined) {
            /* A listen that ends is not an attempt's outcome: an attempt it leaves owed is settled at the next opening. */
            settleInto(
              async () => listen(port),
              () => undefined,
              () => undefined,
            );
          }
        },
        (error: unknown) => {
          const refusal = refusalOf(error);
          deliver({ type: 'logOpenFailed', code: refusal.code, message: refusal.message });
        },
      );
    },
    appendRows: (args: AppendRowsArgs) => {
      if (args.ends !== undefined) {
        drivers.delete(keyOf(args.ends));
      }
      settleInto(
        async () =>
          services.append({
            chatId: input.chatId,
            leaderEpoch: input.leaderEpoch,
            rows: args.rows,
            ...(args.ends === undefined ? {} : { ends: args.ends }),
          }),
        ({ ledger, messageIds }) => {
          deliver({ type: 'rowsCommitted', key: args.key, ledger, messageIds });
        },
        (error: unknown) => {
          const refusal = refusalOf(error);
          deliver({
            type: 'appendRefused',
            key: args.key,
            code: refusal.code,
            message: refusal.message,
            effect: refusal.effect ?? 'not-applied',
          });
        },
      );
    },
    prepareAdmission: (args) => {
      settleInto(
        async () =>
          services.prepareAdmission({ chatId: input.chatId, commandId: args.commandId, payload: args.payload }),
        (prepared) => {
          deliver({ type: 'admissionPrepared', commandId: args.commandId, prepared });
        },
        (error: unknown) => {
          const refusal = refusalOf(error);
          deliver({
            type: 'admissionRefused',
            commandId: args.commandId,
            code: refusal.code,
            message: refusal.message,
            ...(refusal.details === undefined ? {} : { details: refusal.details }),
          });
        },
      );
    },
    prepareResume: (args) => {
      settleInto(
        async () =>
          services.prepareResume({
            chatId: input.chatId,
            commandId: args.commandId,
            runId: args.runId,
            payload: args.payload,
          }),
        (prepared) => {
          deliver({ type: 'resumePrepared', commandId: args.commandId, prepared });
        },
        (error: unknown) => {
          const refusal = refusalOf(error);
          deliver({
            type: 'resumeRefused',
            commandId: args.commandId,
            code: refusal.code,
            message: refusal.message,
            ...(refusal.details === undefined ? {} : { details: refusal.details }),
          });
        },
      );
    },
    startDriver: (args) => {
      const { key } = args;
      const report = (driverReport: DriverReport): void => {
        if (driverReport.type === 'agentEnded') {
          drivers.delete(keyOf(key));
          deliver({
            type: 'agentEnded',
            key,
            outcome: driverReport.outcome,
            ...(driverReport.failure === undefined ? {} : { failure: driverReport.failure }),
            ...(driverReport.stopReason === undefined ? {} : { stopReason: driverReport.stopReason }),
          });
          return;
        }
        deliver({
          type: 'approvalRequested',
          key,
          interruptId: driverReport.interruptId,
          request: driverReport.request,
        });
      };
      try {
        const grant = grants.get(keyOf(key));
        drivers.set(
          keyOf(key),
          services.startDriver({
            ...args,
            leaderEpoch: input.leaderEpoch,
            report,
            ...(grant === undefined ? {} : { grant }),
          }),
        );
      } catch (error) {
        /* A port that throws synchronously ends the attempt failed (RV3-F3). */
        report({ type: 'agentEnded', outcome: 'failed', failure: codedFailureDetail(error) });
      }
    },
    steerDriver: (args) => {
      drivers.get(keyOf(args.key))?.steer(args.commandId, args.message);
    },
    abortDriver: (args) => {
      drivers.get(keyOf(args.key))?.abort(args.reason);
    },
    decideApproval: (args) => {
      drivers.get(keyOf(args.key))?.decide(args.resolution);
    },
    admitPlacement: (args) => {
      if (port === undefined) {
        deliver({
          type: 'placementRefused',
          key: args.key,
          code: 'REVISIONS_UNAVAILABLE',
          message: 'No placement port.',
          effect: 'not-applied',
        });
        return;
      }
      settleInto(
        async () =>
          port.admit({
            requestId: requestId('admit', args.key),
            key: args.key,
            ...(args.checkoutId === undefined ? {} : { checkoutId: args.checkoutId }),
          }),
        (answer) => {
          if (answer.status === 'refused') {
            const base = answer.details?.['revisionId'];
            deliver({
              type: 'placementRefused',
              key: args.key,
              code: answer.code,
              message: answer.message,
              effect: 'not-applied',
              ...(typeof base === 'string' ? { revisionId: base } : {}),
            });
            return;
          }
          const { root: _root, tools: _tools, ...placement } = answer.placement;
          grants.set(keyOf(args.key), answer.placement);
          deliver({ type: 'placed', key: args.key, placement });
        },
        (error: unknown) => {
          const refusal = refusalOf(error);
          deliver({
            type: 'placementRefused',
            key: args.key,
            code: refusal.code,
            message: refusal.message,
            effect: 'unknown',
          });
        },
      );
    },
    completePlacement: (args) => {
      grants.delete(keyOf(args.key));
      if (port === undefined) {
        return;
      }
      settleInto(
        async () => port.complete({ requestId: requestId('complete', args.key), key: args.key, cut: args.cut }),
        (answer) => {
          deliver({
            type: 'completeAnswered',
            key: args.key,
            status: answer.status === 'refused' ? 'refused' : 'applied',
            ...(answer.status === 'refused' ? { code: answer.code } : {}),
          });
        },
        () => {
          deliver({ type: 'completeAnswered', key: args.key, status: 'unknown' });
        },
      );
    },
    abandonPlacement: (args) => {
      grants.delete(keyOf(args.key));
      if (port === undefined) {
        return;
      }
      const abandoned = (unknown: boolean): void => {
        deliver({ type: 'abandoned', key: args.key, ...(unknown ? { unknown: true } : {}) });
      };
      settleInto(
        async () => port.abandon({ requestId: requestId('abandon', args.key), key: args.key }),
        () => {
          abandoned(false);
        },
        () => {
          abandoned(true);
        },
      );
    },
    acknowledgePlacement: (args) => {
      if (port === undefined) {
        return;
      }
      const acknowledged = (unknown: boolean): void => {
        deliver({ type: 'acknowledged', key: args.key, ...(unknown ? { unknown: true } : {}) });
      };
      settleInto(
        async () => port.acknowledge({ requestId: requestId('acknowledge', args.key), key: args.key }),
        () => {
          acknowledged(false);
        },
        () => {
          acknowledged(true);
        },
      );
    },
    closeLog: (args) => {
      listening.abort();
      for (const driver of drivers.values()) {
        driver.abort('close');
      }
      drivers.clear();
      const closed = (): void => {
        deliver({ type: 'logClosed' });
      };
      settleInto(async () => services.closeLog(args.chatId), closed, closed);
    },
    answer: (args) => {
      deps.answer(args.answer);
    },
    redeliver: (args) => {
      deps.redeliver(args.commands);
    },
  };
};

/**
 * Create one chat's M1 incarnation (MC-R4). The registry starts it and holds its only ref (RA-R16).
 *
 * @param input - The chat, the term its rows are stamped under, and whether placement is wired.
 * @param deps - The incarnation's services and the registry's hooks.
 * @param options - `clock`, `inspect` and `onRejectedEvent`; tests pass the harness's.
 * @returns The actor, unstarted.
 * @internal
 */
export const createChatRunActor = (
  input: ChatRunInput,
  deps: ChatRunDeps,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect'> = {},
): ChatRunActor => {
  const reference: { actor?: ChatRunActor } = {};
  const deliver = (event: ChatRunOutcomeEvent | ChatRunHostEvent): void => {
    const { actor } = reference;
    /* No stopped check on a plain handle: a report after the incarnation closed is dropped here (RV4). */
    if (actor?.getSnapshot().status === 'active') {
      actor.send(event as ChatRunEvent);
    }
  };
  const machine = chatRunMachine.provide({
    actions: createChatRunEffects(input, deps, deliver),
    delays: {
      idleEviction: deps.delays?.idleEviction ?? 300_000,
      driverStopBound: deps.delays?.driverStopBound ?? 30_000,
      cutRetry: deps.delays?.cutRetry ?? 1000,
    },
  });
  const actor = createActor(machine, { input, ...options });
  reference.actor = actor;
  return actor;
};
