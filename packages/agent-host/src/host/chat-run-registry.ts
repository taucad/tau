/**
 * The chat-run registry (W7): one live M1 incarnation per chat, the in-flight command table, and the close barrier.
 * Not a machine: it holds the only refs to the incarnations (RA-R16) and answers every command it accepts (I15).
 *
 * An incarnation opens lazily, on the chat's first command or claim. It reads and folds the log and writes nothing
 * until its first append claims the term (RA-R5); a stale writer that appended after the read fences that append, the
 * incarnation closes, and the next command opens a new one that rereads (RA-A9).
 */

import { waitFor } from 'xstate';
import type { ActorOptions, AnyActorLogic } from 'xstate';

import { createChatRunActor } from '#host/chat-run-effects.js';
import type { ChatRunActor, ChatRunDeps, ChatRunEvent, ChatRunServices } from '#host/chat-run-effects.js';
import type { HeldCommand } from '#host/chat-run-events.js';
import type { ChatRunCause } from '#host/chat-run.machine.js';
import { commandPayloads } from '#wire/commands.schema.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { RefusalCode } from '#wire/refusals.js';

/** A command M1 serves: every wire verb but `attach`, which is a read (RH-R1). */
export type ChatRunCommand = Exclude<HostCommand, Readonly<{ type: 'attach' }>>;

/** Options for {@link createChatRunRegistry}. */
export type ChatRunRegistryOptions = Readonly<{
  services: ChatRunServices;
  /** Mints a term id for an incarnation no `assume` named. */
  createTerm: () => string;
  delays?: ChatRunDeps['delays'];
  /** Forwarded to every incarnation (MC-R4). */
  actorOptions?: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect'> | undefined;
  /** Told each time a chat's incarnation becomes quiescent: no run, no command in flight, no settlement owed (RH-R8). */
  onQuiescent?: ((chatId: string, quiescent: boolean) => void) | undefined;
}>;

/** What a claim found: whether the incarnation's opening abandoned an orphan (the attach answer's `takeover`). */
export type ChatRunClaim = Readonly<{ takeover: boolean }> | Readonly<{ refused: CommandAnswer }>;

/** The registry's surface. */
export type ChatRunRegistry = Readonly<{
  /** Answer one command: parsed, coalesced with a duplicate in flight, delivered once the incarnation serves. */
  execute: (command: ChatRunCommand) => Promise<CommandAnswer>;
  /** Open the chat's incarnation (W6's claim) and wait until it serves. */
  claim: (chatId: string) => Promise<ChatRunClaim>;
  /** The live incarnation, for read-only selectors. */
  actorOf: (chatId: string) => ChatRunActor | undefined;
  /** Name the term the chat's next incarnation writes under. */
  assume: (chatId: string, term: string) => void;
  /** The term the chat's rows are written under now: the live incarnation's, else the one `assume` named. */
  termOf: (chatId: string) => string | undefined;
  /** Stop the chat with no writes; commands are refused `LEADERSHIP_LOST` until `assume`. */
  relinquish: (chatId: string) => Promise<void>;
  /** Close the chat's incarnation once it rests; refused `CHAT_RUN_LIVE` while a slot is held. */
  evict: (chatId: string) => Promise<void>;
  /** The chat is fenced by `relinquish`. */
  isFenced: (chatId: string) => boolean;
  /** Close barrier: refuse every later command `HOST_CLOSED`, close every incarnation and wait (L2a D14). */
  close: () => Promise<void>;
  readonly closed: () => boolean;
}>;

type Pending = Readonly<{ chatId: string; resolve: (answer: CommandAnswer) => void }>;
type RefusedAnswer = Extract<CommandAnswer, Readonly<{ status: 'refused' }>>;

const refusedAnswer = (commandId: string, code: RefusalCode | string, message: string): RefusedAnswer => ({
  commandId,
  generation: 0,
  status: 'refused',
  effect: 'not-applied',
  code,
  message,
});

/**
 * Create the registry over one host's services.
 *
 * @param options - The services, the term minter, and the incarnations' delays and actor options.
 * @returns The registry.
 */
export const createChatRunRegistry = (options: ChatRunRegistryOptions): ChatRunRegistry => {
  const actors = new Map<string, ChatRunActor>();
  const inflight = new Map<string, Promise<CommandAnswer>>();
  const pending = new Map<string, Pending>();
  const terms = new Map<string, string>();
  const fenced = new Set<string>();
  let closing = false;
  const isClosing = (): boolean => closing;

  const settle = (answer: CommandAnswer): void => {
    const entry = pending.get(answer.commandId);
    if (entry !== undefined) {
      pending.delete(answer.commandId);
      entry.resolve(answer);
    }
  };

  /* An incarnation that stopped leaves nothing unanswered: whatever it still owed is refused with its cause. */
  const drain = (
    chatId: string,
    cause: ChatRunCause | undefined,
    failure?: Readonly<{ code: string; message: string }>,
  ): void => {
    for (const [commandId, entry] of pending) {
      if (entry.chatId !== chatId) {
        continue;
      }
      settle(
        failure === undefined
          ? cause === 'close' || cause === 'evicted' || closing
            ? refusedAnswer(commandId, 'HOST_CLOSED', 'The Tau agent host is closed.')
            : {
                ...refusedAnswer(commandId, 'LEADERSHIP_LOST', `This host no longer leads chat ${chatId}.`),
                effect: 'unknown',
              }
          : refusedAnswer(commandId, failure.code, failure.message),
      );
    }
  };

  const deliver = (chatId: string, event: ChatRunEvent): void => {
    const actor = actors.get(chatId);
    if (actor?.getSnapshot().status === 'active') {
      actor.send(event);
    }
  };

  const open = (chatId: string): ChatRunActor => {
    const live = actors.get(chatId);
    if (live?.getSnapshot().status === 'active') {
      return live;
    }
    const term = terms.get(chatId) ?? options.createTerm();
    /* One term per incarnation: a reread after a fence writes under a new one (RA-R5). */
    terms.delete(chatId);
    const actor = createChatRunActor(
      { chatId, leaderEpoch: term, placement: options.services.placement !== undefined },
      {
        services: options.services,
        answer: settle,
        redeliver: (commands: readonly HeldCommand[]) => {
          queueMicrotask(() => {
            for (const command of commands) {
              deliver(chatId, command as unknown as ChatRunEvent);
            }
          });
        },
        delays: options.delays,
      },
      options.actorOptions ?? {},
    );
    actors.set(chatId, actor);
    /* Undefined until the first snapshot: an incarnation reports its own value at open, never inherits one (RH-R8). */
    let quiescent: boolean | undefined;
    actor.subscribe({
      next: (snapshot) => {
        const now = snapshot.status === 'active' && snapshot.hasTag('quiescent');
        if (now !== quiescent) {
          options.onQuiescent?.(chatId, now);
        }
        quiescent = now;
      },
      complete: () => {
        if (actors.get(chatId) === actor) {
          actors.delete(chatId);
        }
        /* A closed incarnation holds nothing: its chat is quiescent until the next claim. */
        options.onQuiescent?.(chatId, true);
        const { context } = actor.getSnapshot();
        drain(chatId, context.cause, context.cause === 'openFailed' ? context.failure : undefined);
      },
      error: () => {
        if (actors.get(chatId) === actor) {
          actors.delete(chatId);
        }
        drain(chatId, 'fault');
      },
    });
    actor.start();
    return actor;
  };

  /* The incarnations that have served once: only the first serve waits for what opening owed. */
  const serving = new WeakSet<ChatRunActor>();
  /**
   * Wait until the incarnation first serves: it has read, reconciled, abandoned what it had to (D10), and settled the
   * attempts its chat still held (TS-S7 step 2), unless a refused cut left it backing off (TS-Q9), where commands are
   * answered `CHAT_RUN_LIVE` as in any settling.
   */
  const served = async (actor: ChatRunActor): Promise<void> => {
    if (serving.has(actor)) {
      return;
    }
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.status !== 'active' ||
        !(
          snapshot.matches('opening') ||
          snapshot.matches('reconciling') ||
          snapshot.matches({ idle: 'orphaned' }) ||
          (snapshot.matches('settling') && !snapshot.matches({ settling: 'backingOff' }))
        ),
    ).catch(() => undefined);
    serving.add(actor);
  };

  const claim = async (chatId: string): Promise<ChatRunClaim> => {
    if (closing) {
      return { refused: refusedAnswer('claim', 'HOST_CLOSED', 'The Tau agent host is closed.') };
    }
    if (fenced.has(chatId)) {
      return { refused: refusedAnswer('claim', 'LEADERSHIP_LOST', `This host no longer leads chat ${chatId}.`) };
    }
    const fresh = actors.get(chatId)?.getSnapshot().status !== 'active';
    const actor = open(chatId);
    await served(actor);
    const snapshot = actor.getSnapshot();
    if (
      snapshot.status !== 'active' &&
      snapshot.context.cause === 'openFailed' &&
      snapshot.context.failure !== undefined
    ) {
      return { refused: refusedAnswer('claim', snapshot.context.failure.code, snapshot.context.failure.message) };
    }
    /* Only the claim that opened the incarnation reports its takeover: a later attach found nothing to abandon. */
    return { takeover: fresh && snapshot.context.takeover };
  };

  const run = async (command: ChatRunCommand): Promise<CommandAnswer> => {
    const { chatId } = command.payload;
    if (closing) {
      return refusedAnswer(command.commandId, 'HOST_CLOSED', 'The Tau agent host is closed.');
    }
    if (fenced.has(chatId)) {
      return refusedAnswer(command.commandId, 'LEADERSHIP_LOST', `This host no longer leads chat ${chatId}.`);
    }
    let actor = open(chatId);
    await served(actor);
    if (actor.getSnapshot().status !== 'active') {
      const { context } = actor.getSnapshot();
      if (context.cause === 'openFailed' && context.failure !== undefined) {
        return refusedAnswer(command.commandId, context.failure.code, context.failure.message);
      }
      /* Read through a call: `close` may land while the claim is served, which narrowing cannot see. */
      if (isClosing()) {
        return refusedAnswer(command.commandId, 'HOST_CLOSED', 'The Tau agent host is closed.');
      }
      if (fenced.has(chatId)) {
        return refusedAnswer(command.commandId, 'LEADERSHIP_LOST', `This host no longer leads chat ${chatId}.`);
      }
      if (context.cause === 'close' || context.cause === 'evicted') {
        return refusedAnswer(command.commandId, 'HOST_CLOSED', 'The Tau agent host is closed.');
      }
      if (context.cause !== 'fenced' && context.cause !== 'fault') {
        return refusedAnswer(
          command.commandId,
          'HOST_FAULT',
          `The incarnation for chat ${chatId} stopped while opening.`,
        );
      }
      /* A stale writer or fault may have fenced the claim: reread under a new incarnation (RA-A9). */
      actor = open(chatId);
      await served(actor);
    }
    const answered = new Promise<CommandAnswer>((resolve) => {
      pending.set(command.commandId, { chatId, resolve });
    });
    if (actor.getSnapshot().status === 'active') {
      actor.send({ type: command.type, commandId: command.commandId, payload: command.payload } as ChatRunEvent);
    } else {
      drain(chatId, actor.getSnapshot().context.cause);
    }
    return answered;
  };

  return {
    execute: async (command) => {
      const parsed = commandPayloads[command.type].safeParse(command.payload);
      if (!parsed.success) {
        return refusedAnswer(
          command.commandId,
          'COMMAND_UNREADABLE',
          `The ${command.type} command's payload is unreadable: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
            .join('; ')}`,
        );
      }
      const original = inflight.get(command.commandId);
      if (original !== undefined) {
        /* SC-R8: a duplicate in flight shares the original's answer, marked replayed. */
        const answer = await original;
        return answer.status === 'applied' && answer.effect === 'durable' ? { ...answer, status: 'replayed' } : answer;
      }
      const answer = run(command);
      inflight.set(command.commandId, answer);
      try {
        return await answer;
      } finally {
        inflight.delete(command.commandId);
      }
    },
    claim,
    actorOf: (chatId) => {
      const actor = actors.get(chatId);
      return actor?.getSnapshot().status === 'active' ? actor : undefined;
    },
    assume: (chatId, term) => {
      fenced.delete(chatId);
      if (!actors.has(chatId)) {
        terms.set(chatId, term);
      }
    },
    relinquish: async (chatId) => {
      fenced.add(chatId);
      const actor = actors.get(chatId);
      if (actor?.getSnapshot().status === 'active') {
        actor.send({ type: 'relinquish' });
        await waitFor(actor, (snapshot) => snapshot.status !== 'active').catch(() => undefined);
      }
    },
    evict: async (chatId) => {
      const actor = actors.get(chatId);
      if (actor?.getSnapshot().status !== 'active') {
        return;
      }
      if (actor.getSnapshot().hasTag('slotHeld')) {
        throw Object.assign(new Error(`Chat ${chatId} has a live run; evict it after the run ends.`), {
          code: 'CHAT_RUN_LIVE' satisfies RefusalCode,
        });
      }
      actor.send({ type: 'close' });
      await waitFor(actor, (snapshot) => snapshot.status !== 'active').catch(() => undefined);
    },
    termOf: (chatId) => {
      const actor = actors.get(chatId);
      return actor?.getSnapshot().status === 'active' ? actor.getSnapshot().context.leaderEpoch : terms.get(chatId);
    },
    isFenced: (chatId) => fenced.has(chatId),
    close: async () => {
      closing = true;
      const live = [...actors.values()];
      for (const actor of live) {
        if (actor.getSnapshot().status === 'active') {
          actor.send({ type: 'close' });
        }
      }
      await Promise.all(
        live.map(async (actor) => waitFor(actor, (snapshot) => snapshot.status !== 'active').catch(() => undefined)),
      );
      for (const [commandId] of pending) {
        settle(refusedAnswer(commandId, 'HOST_CLOSED', 'The Tau agent host is closed.'));
      }
    },
    closed: () => closing,
  };
};
