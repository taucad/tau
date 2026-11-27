import type { CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { markChatTiming } from '#chat-clients/_internal/chat-timing.js';

type CommandOptions = Readonly<{
  retryDelay?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
  boundMilliseconds?: number;
  now?: () => number;
}>;

const interrupted = (): DOMException => new DOMException('The gesture was cancelled.', 'AbortError');

const delay = async (milliseconds: number, signal?: AbortSignal): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      reject(interrupted());
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });
};

const retryAnswer = (answer: CommandAnswer): boolean =>
  answer.status === 'refused' &&
  (answer.effect === 'unknown' ||
    (answer.code === 'CHAT_RUN_LIVE' &&
      (answer.details?.['state'] === 'settling' || answer.details?.['state'] === 'terminal')));

const retryError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return (
    error.code === 'PEER_UNRESPONSIVE' ||
    error.code === 'PEER_GONE' ||
    error.code === 'PEER_CLOSED' ||
    error.code === 'CHANNEL_CLOSED'
  );
};

/**
 * The `wait` refusals that mean this chat's writer cannot take a command now but will (RH-R17, RH-R18): it is held by
 * a paused tab, is changing hands, or its host is closing. Nothing was applied, and the same key is sent again later.
 * The other `wait` codes have owners of their own: a live run holds the outbox's gate, another device's run is the
 * refused-admission path, and the channel's codes are re-sent here already.
 */
const ownerWaits: ReadonlySet<string> = new Set([
  'WRITER_LOCKED',
  'LOG_FENCED',
  'LOG_CLOSED',
  'HOST_CLOSED',
  'LEADERSHIP_LOST',
  'LEADER_GENERATION_STALE',
  'LEADER_VERSION_MISMATCH',
  'SEGMENTS_UNREADABLE',
  'TURN_ALREADY_LEASED',
]);

/** A refusal that applied nothing. */
export type CommandRefusal = Extract<CommandAnswer, { status: 'refused' }>;

/**
 * The refusal, when an answer says this chat's writer will take the command later, so it is held and sent again by
 * its key rather than shown as failed (PERF-5).
 *
 * @param answer - The host's answer.
 * @returns The `not-applied` refusal whose code is an owner wait, or `undefined`.
 * @public
 */
export const ownerWaitOf = (answer: CommandAnswer): CommandRefusal | undefined =>
  answer.status === 'refused' && answer.effect === 'not-applied' && ownerWaits.has(answer.code) ? answer : undefined;

/** The only command leg of a chat gesture; connection churn never mints a new id. @public */
export const sendHostCommand = async (
  connect: () => Promise<Pick<AgentHostClient, 'hostCommand' | 'close'>>,
  command: HostCommand,
  options: CommandOptions = {},
): Promise<CommandAnswer> => {
  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.boundMilliseconds ?? 30_000);
  const attempt = async (backoff: number): Promise<CommandAnswer> => {
    if (options.signal?.aborted) {
      throw interrupted();
    }
    let answer: CommandAnswer | undefined;
    let failure: unknown;
    try {
      const client = await connect();
      markChatTiming('host-command-connected', { type: command.type });
      try {
        if (options.signal?.aborted) {
          throw interrupted();
        }
        markChatTiming('host-command-sent', { type: command.type });
        answer = await client.hostCommand(command);
        markChatTiming('host-command-answered', { type: command.type, status: answer.status });
      } finally {
        await client.close();
      }
    } catch (error) {
      if (!retryError(error)) {
        throw error;
      }
      failure = error;
    }
    if (answer !== undefined && !retryAnswer(answer)) {
      return answer;
    }
    if (now() >= deadline) {
      if (answer !== undefined) {
        return answer;
      }
      throw failure;
    }
    await (options.retryDelay ?? (async (milliseconds) => delay(milliseconds, options.signal)))(backoff);
    return attempt(Math.min(backoff * 2, 250));
  };
  return attempt(20);
};
