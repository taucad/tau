/**
 * Open an external agent's session while the person writes (chat performance WP-18 step 1).
 *
 * The composer taking focus (`chat-textarea.tsx`), the person's own act and never a passing render, asks the host of
 * the ACP agent it names to open the chat's session before the turn: the
 * adapter's spawn and `session/new` (1.25 s and 485 ms of a 2.57 s first turn, measured) then happen during the dwell,
 * and the turn finds the session open. The host decides whether it opens anything: one prewarm at a time, never by
 * closing a lent session, never for an agent it cannot start, and an unused one is evicted first and idle-expires.
 */
import type { CadAgentExecution } from '@taucad/chat';
import { dialExecutionHost } from '#chat-clients/_internal/turn-body.js';

/* The one session this window last asked for: a re-render, a remount or a second chat surface asks once (WP-18). */
let asked: string | undefined;

/**
 * Ask the chat's agent host for the chat's session, once per selection in this window.
 *
 * @param input - The project, the chat, and the execution its next turn runs.
 * @param dial - Opens the execution's host channel; tests pass a fake.
 */
export const prewarmExternalAgent = async (
  input: Readonly<{ projectId: string; chatId: string; execution: CadAgentExecution }>,
  dial: typeof dialExecutionHost = dialExecutionHost,
): Promise<void> => {
  const { execution, chatId, projectId } = input;
  if (execution.kind !== 'acp') {
    return;
  }
  const key = JSON.stringify([execution.hostId, execution.agentId, chatId]);
  if (asked === key) {
    return;
  }
  asked = key;
  try {
    const client = await dial(execution, projectId);
    try {
      await client.prewarm({
        chatId,
        agent: {
          kind: 'acp',
          id: execution.agentId,
          hostId: execution.hostId,
          ...(execution.model === undefined ? {} : { model: execution.model }),
          ...(execution.config === undefined ? {} : { config: execution.config }),
        },
      });
    } finally {
      client.close();
    }
  } catch {
    /* A host this device cannot reach, or one that predates prewarm: the turn opens its own session, as before. */
  }
};

/**
 * Forget the window's last prewarm, for tests.
 *
 * @internal
 */
export const resetExternalAgentPrewarm = (): void => {
  asked = undefined;
};
