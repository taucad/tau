/**
 * The owner's half of the seam (SC-R4, SC-R7–SC-R9): one adapter both legs put in front of their host, so a keyed
 * command is answered from the chat's applied set the same way on the daemon and in the browser worker.
 *
 * Browser-safe: zod and the ledger only.
 */

import type { ChatLedger } from '#log/chat-ledger.js';
import { commandPayloads } from '#wire/commands.schema.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { RefusalCode } from '#wire/refusals.js';

/** What a leg does for one parsed command: the effect, and the state it names when nothing was recorded. @public */
export type CommandEffect = (command: HostCommand) => Promise<Readonly<Record<string, unknown>> | undefined>;

/** Options for {@link createCommandOwner}. @public */
export type CommandOwnerOptions = Readonly<{
  /** The chat's ledger, current after every durable append (W3). */
  ledger: (chatId: string) => Promise<ChatLedger>;
  /** Runs one command's effect. A coded throw is a refusal; an uncoded one is an rpc error. */
  effect: CommandEffect;
}>;

/** Errors whose write may have reached storage: the command is answered `effect: unknown` and re-sent by key (SC-R9). */
const writeMayHaveLanded: ReadonlySet<string> = new Set(['STORAGE_SHORT_WRITE', 'LOG_POISONED']);

/**
 * Answers a command recorded nowhere durable (`applied, not-applied`), so a re-send of a `steer` does not steer twice.
 * ponytail: memory-only and bounded; an owner restart forgets it. W7 writes the steer row, and the applied set answers.
 */
const memoLimit = 1024;

const codeOf = (error: unknown): string | undefined => {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
};

const detailsOf = (error: unknown): Record<string, unknown> | undefined => {
  const details = error instanceof Error && 'details' in error ? error.details : undefined;
  return details !== null && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
};

/**
 * Put the seam's answer rules in front of one leg's host.
 *
 * Every command is parsed strictly (`COMMAND_UNREADABLE`), looked up in the applied set first (`replayed`), coalesced
 * with a duplicate still in flight, and answered only after its decision row is durable. `attach` is a read: it carries
 * a key but consults and records nothing.
 *
 * @param options - The chat ledger and the leg's effect.
 * @returns `execute`, answering every command.
 * @public
 *
 * @example <caption>Answer commands over a host</caption>
 * ```typescript
 * import { createCommandOwner } from '@taucad/agent-host';
 * import type { TauAgentHost } from '@taucad/agent-host';
 *
 * declare const host: TauAgentHost;
 * const owner = createCommandOwner({
 *   ledger: async (chatId) => host.ledger(chatId),
 *   effect: async (command) => {
 *     if (command.type === 'cancel') {
 *       await host.cancel({ runId: command.payload.runId, commandId: command.commandId });
 *     }
 *     return undefined;
 *   },
 * });
 * const answer = await owner({ type: 'cancel', commandId: 'req_1', payload: { chatId: 'c', runId: 'r' } });
 * ```
 */
export const createCommandOwner = (
  options: CommandOwnerOptions,
): ((command: HostCommand) => Promise<CommandAnswer>) => {
  const inFlight = new Map<string, Promise<CommandAnswer>>();
  const memo = new Map<string, CommandAnswer>();

  const refused = (
    command: Pick<HostCommand, 'commandId'>,
    generation: number,
    refusal: Readonly<{ code: string; message: string; effect?: 'unknown'; details?: Record<string, unknown> }>,
  ): CommandAnswer => ({
    commandId: command.commandId,
    generation,
    status: 'refused',
    effect: refusal.effect ?? 'not-applied',
    code: refusal.code,
    message: refusal.message,
    ...(refusal.details === undefined ? {} : { details: refusal.details }),
  });

  /**
   * A coded throw as a refusal; an uncoded one is a defect, and stays an rpc error.
   *
   * @param command - The command that failed.
   * @param generation - The generation the answer names.
   * @param failure - What the effect or the ledger threw.
   * @returns The refused answer.
   */
  const refusedBy = (command: HostCommand, generation: number, failure: unknown): CommandAnswer => {
    const code = codeOf(failure);
    if (code === undefined) {
      throw failure;
    }
    const errorDetails = detailsOf(failure);
    return refused(command, generation, {
      code,
      message: failure instanceof Error ? failure.message : String(failure),
      ...(writeMayHaveLanded.has(code) ? { effect: 'unknown' } : {}),
      ...(errorDetails === undefined ? {} : { details: errorDetails }),
    });
  };

  const answer = async (command: HostCommand): Promise<CommandAnswer> => {
    const { chatId } = command.payload;
    const before = await options.ledger(chatId);
    const generation = before.maxEpoch;
    if (command.type !== 'attach') {
      const hit = before.applied[command.commandId];
      if (hit) {
        return { commandId: command.commandId, generation, status: 'replayed', effect: 'durable', cursor: hit.cursor };
      }
      const remembered = memo.get(command.commandId);
      if (remembered) {
        return remembered;
      }
    }
    if (command.type === 'resume') {
      if (command.payload.selection !== undefined) {
        // ponytail: the host resumes on the run's committed model; W7 threads the selection (D21).
        return refused(command, generation, {
          code: 'COMMAND_UNSUPPORTED' satisfies RefusalCode,
          message: 'This host cannot change the model at Resume yet.',
        });
      }
      if (before.currentRunId !== command.payload.runId) {
        return refused(command, generation, {
          code: 'RESUME_UNAVAILABLE' satisfies RefusalCode,
          message: `Run ${command.payload.runId} is not this chat's current run.`,
          ...(before.currentRunId === undefined ? {} : { details: { currentRunId: before.currentRunId } }),
        });
      }
    }
    let details: Readonly<Record<string, unknown>> | undefined;
    let failure: unknown;
    try {
      details = await options.effect(command);
    } catch (error) {
      failure = error;
    }
    const after = await options.ledger(chatId);
    const landed = command.type === 'attach' ? undefined : after.applied[command.commandId];
    if (landed) {
      // The decision row is durable, whatever the run did afterwards (SC-R9).
      return {
        commandId: command.commandId,
        generation: after.maxEpoch,
        status: 'applied',
        effect: 'durable',
        cursor: landed.cursor,
      };
    }
    if (failure !== undefined) {
      return refusedBy(command, after.maxEpoch, failure);
    }
    const done: CommandAnswer = {
      commandId: command.commandId,
      generation: after.maxEpoch,
      status: 'applied',
      effect: 'not-applied',
      details: { ...details },
    };
    if (command.type !== 'attach') {
      memo.set(command.commandId, done);
      const [oldest] = memo.keys();
      if (memo.size > memoLimit && oldest !== undefined) {
        memo.delete(oldest);
      }
    }
    return done;
  };

  return async (command) => {
    const parsed = commandPayloads[command.type].safeParse(command.payload);
    if (!parsed.success) {
      return refused(command, 0, {
        code: 'COMMAND_UNREADABLE' satisfies RefusalCode,
        message: `The ${command.type} command's payload is unreadable: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`,
      });
    }
    const pending = inFlight.get(command.commandId);
    if (pending) {
      // SC-R8: a duplicate in flight gets the original's answer, marked replayed.
      const original = await pending;
      return original.status === 'applied' && original.effect === 'durable'
        ? { ...original, status: 'replayed' }
        : original;
    }
    // A refusal before any ledger was read, such as a chat id that is no storage path, names generation 0.
    const answering = (async (): Promise<CommandAnswer> => {
      try {
        return await answer(command);
      } catch (error) {
        return refusedBy(command, 0, error);
      }
    })();
    inFlight.set(command.commandId, answering);
    try {
      return await answering;
    } finally {
      inFlight.delete(command.commandId);
    }
  };
};
