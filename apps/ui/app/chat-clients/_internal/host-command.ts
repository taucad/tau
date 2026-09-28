import type { CommandAnswer, HostCommand } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';

/** The only command leg of a chat gesture; connection churn never mints a new id. @public */
export const sendHostCommand = async (
  connect: () => Promise<Pick<AgentHostClient, 'hostCommand' | 'close'>>,
  command: HostCommand,
  options: Readonly<{ retryDelay?: (milliseconds: number) => Promise<void>; attempts?: number }> = {},
): Promise<CommandAnswer> => {
  const retryDelay =
    options.retryDelay ??
    (async (milliseconds: number): Promise<void> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });
    });
  const attempts = options.attempts ?? 5;
  const attempt = async (index: number, backoff: number): Promise<CommandAnswer> => {
    const client = await connect();
    let answer: CommandAnswer;
    try {
      answer = await client.hostCommand(command);
    } finally {
      await client.close();
    }
    if (
      answer.status !== 'refused' ||
      (answer.effect !== 'unknown' &&
        !(
          answer.code === 'CHAT_RUN_LIVE' &&
          (answer.details?.['state'] === 'settling' || answer.details?.['state'] === 'terminal')
        )) ||
      index >= attempts - 1
    ) {
      return answer;
    }
    await retryDelay(backoff);
    return attempt(index + 1, Math.min(backoff * 2, 250));
  };
  return attempt(0, 20);
};
