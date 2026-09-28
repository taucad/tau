import type { CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';

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
  return error.code === 'PEER_UNRESPONSIVE' || error.code === 'CHANNEL_CLOSED';
};

/** The only command leg of a chat gesture; connection churn never mints a new id. @public */
export const sendHostCommand = async (
  connect: () => Promise<Pick<AgentHostClient, 'hostCommand' | 'close'>>,
  command: HostCommand,
  options: CommandOptions = {},
): Promise<CommandAnswer> => {
  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.boundMilliseconds ?? 30_000);
  let backoff = 20;
  while (true) {
    if (options.signal?.aborted) {
      throw interrupted();
    }
    let answer: CommandAnswer | undefined;
    let failure: unknown;
    try {
      const client = await connect();
      try {
        answer = await client.hostCommand(command);
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
    await (options.retryDelay ?? ((milliseconds) => delay(milliseconds, options.signal)))(backoff);
    backoff = Math.min(backoff * 2, 250);
  }
};
