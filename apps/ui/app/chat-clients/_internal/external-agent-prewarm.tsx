/**
 * Open an external agent's session while the person writes (chat performance WP-18 step 1).
 *
 * A chat whose composer names an ACP agent asks that agent's host to open the chat's session before the turn: the
 * adapter's spawn and `session/new` (1.25 s and 485 ms of a 2.57 s first turn, measured) then happen during the dwell,
 * and the turn finds the session open. The host decides whether it opens anything: one prewarm at a time, never by
 * closing a lent session, never for an agent it cannot start, and an unused one is evicted first and idle-expires.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import { dialExecutionHost } from '#chat-clients/_internal/turn-body.js';
import { useActiveChatSession, useChatComposer } from '#hooks/active-chat-provider.js';

/** How long a selection holds before its session is asked for, so passing over an agent opens nothing. */
export const externalAgentPrewarmDwell = 250;

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
 * Prewarm the focused chat's external agent after a short dwell on it.
 *
 * @param input - The project, the focused chat and the composer's execution.
 */
export const useExternalAgentPrewarm = (
  input: Readonly<{ projectId: string; chatId: string; execution: CadAgentExecution }>,
): void => {
  const { projectId, chatId, execution } = input;
  const agentKey = execution.kind === 'acp' ? JSON.stringify([execution.hostId, execution.agentId]) : undefined;
  useEffect(() => {
    if (agentKey === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void prewarmExternalAgent({ projectId, chatId, execution });
    }, externalAgentPrewarmDwell);
    return () => {
      clearTimeout(timer);
    };
    /* The model and configuration ride the turn's own lend; only the agent, its host and the chat restart the dwell. */
  }, [agentKey, chatId, projectId]);
};

/**
 * The focused chat's prewarm: the execution its composer would send next, after a dwell (WP-18).
 *
 * @param props - The project the chat belongs to.
 * @returns Nothing: it only asks the chat's agent host.
 */
export function ExternalAgentPrewarm({ projectId }: Readonly<{ projectId: string }>): ReactNode {
  const {
    execution: { execution },
  } = useChatComposer();
  const { activeChatId } = useActiveChatSession();
  useExternalAgentPrewarm({ projectId, chatId: activeChatId, execution });
  return null;
}

/**
 * Forget the window's last prewarm, for tests.
 *
 * @internal
 */
export const resetExternalAgentPrewarm = (): void => {
  asked = undefined;
};
