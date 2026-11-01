import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import { namesUnhandedLoopbackHost, onLoopbackAgentHostsChanged } from '#lib/agent-host-placement.js';
import { withoutHostId } from '#utils/chat-execution.js';

/** The server never holds a loopback admission, and never starts a turn: it renders the execution as remembered. */
const keepOnServer = (): boolean => false;

/**
 * A remembered execution as this tab can start a new chat on it, kept current: a `loopback:` daemon this tab was
 * never handed is dropped so the chat runs here, and comes back once the daemon is handed to this tab.
 *
 * @param execution - The remembered execution.
 * @returns The execution a new chat starts on in this tab.
 */
export const usePlaceableExecution = (execution: CadAgentExecution): CadAgentExecution => {
  const read = useCallback(() => namesUnhandedLoopbackHost(execution), [execution]);
  const unhanded = useSyncExternalStore(onLoopbackAgentHostsChanged, read, keepOnServer);
  return useMemo(
    () => (unhanded && execution.kind === 'tau' ? withoutHostId(execution) : execution),
    [execution, unhanded],
  );
};
