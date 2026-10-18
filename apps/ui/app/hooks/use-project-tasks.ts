import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ProjectTaskChannelAnswer, ProjectTaskChannelRequest, ProjectTaskSnapshot } from '@taucad/agent-host/wire';
import { projectTaskSendSchema } from '@taucad/agent-host/wire';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { ProjectTaskActions } from '#components/project-tasks/project-task-actions.js';

export type ProjectTasksView = Readonly<{
  snapshot?: ProjectTaskSnapshot;
  isLoading: boolean;
  unavailable?: string;
  error?: string;
  retry: () => void;
  actions: ProjectTaskActions;
}>;

type TaskClient = Pick<AgentHostClient, 'projectTasks' | 'close'>;

const projectTasksContext = createContext<Readonly<{ projectId: string; view: ProjectTasksView }> | undefined>(
  undefined,
);

/** One project-level task observer shared by Threads panes and controls. */
function projectTasksProvider({
  projectId,
  enabled = true,
  rootChatId,
  children,
}: Readonly<{ projectId: string; rootChatId?: string; enabled?: boolean; children: ReactNode }>): ReactNode {
  const view = useProjectTasksOwner(projectId, enabled, rootChatId);
  const context = useMemo(() => ({ projectId, view }), [projectId, view]);
  return createElement(projectTasksContext.Provider, { value: context }, children);
}
export { projectTasksProvider as ProjectTasksProvider };

/** Consume the project observer when present; standalone surfaces retain their own observer. */
export function useProjectTasks(projectId: string, isEnabled = true, rootChatId?: string): ProjectTasksView {
  const shared = useContext(projectTasksContext);
  const own = useProjectTasksOwner(projectId, isEnabled && shared?.projectId !== projectId, rootChatId);
  return shared?.projectId === projectId && isEnabled ? shared.view : own;
}

/** Observe the host journal; React never owns admission, task execution or a second transcript. */
function useProjectTasksOwner(projectId: string, isEnabled: boolean, rootChatId?: string): ProjectTasksView {
  const store = useChatSessionStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeProjectHost(projectId, listener),
    [store, projectId],
  );
  const getConnector = useCallback(() => store.getProjectHost(projectId), [store, projectId]);
  const connector = useSyncExternalStore(subscribe, getConnector, getConnector);
  const scope = useMemo(
    () => ({ projectId, rootChatId, connector, requestIds: new Map<string, string>() }),
    [projectId, rootChatId, connector],
  );
  const [generation, setGeneration] = useState(0);
  const owner = useMemo(() => ({ scope, generation, isEnabled }), [scope, generation, isEnabled]);
  const connection = useRef<
    Readonly<{ owner: typeof owner; client: TaskClient; controller: AbortController }> | undefined
  >(undefined);
  const [view, setView] = useState<
    Readonly<{
      owner: typeof owner;
      snapshot?: ProjectTaskSnapshot;
      isLoading: boolean;
      unavailable?: string;
      error?: string;
    }>
  >({ owner, isLoading: true });

  useEffect(() => {
    if (!isEnabled || rootChatId === undefined || connector === undefined) {
      return;
    }
    const controller = new AbortController();
    let observationClient: TaskClient | undefined;
    const observe = async (): Promise<void> => {
      const client = await connector.connect(rootChatId);
      observationClient = client;
      controller.signal.throwIfAborted();
      connection.current = { owner, client, controller };
      let after = 0;
      let shouldRead = true;
      const messages = new Map<string, ProjectTaskSnapshot['messages'][number]>();
      while (!controller.signal.aborted) {
        const request: ProjectTaskChannelRequest = shouldRead
          ? { operation: 'read', input: { after, limit: 100 } }
          : { operation: 'wait', input: { after, limit: 100, timeout: 30_000 } };
        // One bounded owner wait at a time; closing the pane aborts it and releases the channel.
        // oxlint-disable-next-line eslint/no-await-in-loop -- Ordered cursors must be consumed before requesting the next page.
        const answer: ProjectTaskChannelAnswer | undefined = await client.projectTasks?.(request, controller.signal);
        if (answer === undefined) {
          setView({ owner, isLoading: false, unavailable: 'This host does not support project threads.' });
          return;
        }
        controller.signal.throwIfAborted();
        if (answer.kind === 'refused') {
          if (answer.code === 'TASK_UNAVAILABLE') {
            setView((previous) => ({
              owner,
              snapshot: previous.owner.scope === scope && previous.owner.isEnabled ? previous.snapshot : undefined,
              isLoading: false,
              unavailable: answer.message,
            }));
            return;
          }
          throw new Error(answer.message);
        }
        if (answer.kind !== 'snapshot') {
          throw new Error('The project host returned an unexpected task response. Reconnect and try again.');
        }
        for (const message of answer.snapshot.messages) {
          messages.set(message.id, message);
        }
        const snapshot = {
          ...answer.snapshot,
          messages: [...messages.values()].sort((a, b) => a.sequence - b.sequence),
        };
        setView({ owner, snapshot, isLoading: answer.snapshot.hasMore });
        after = answer.snapshot.nextCursor;
        shouldRead = answer.snapshot.hasMore;
      }
    };
    const supervise = async (): Promise<void> => {
      try {
        await observe();
      } catch (error) {
        if (!controller.signal.aborted) {
          setView((previous) => ({
            owner,
            snapshot: previous.owner.scope === scope && previous.owner.isEnabled ? previous.snapshot : undefined,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Could not read project tasks. Reconnect and try again.',
          }));
        }
      } finally {
        controller.abort();
        void observationClient?.close();
      }
    };
    // async-iife: bootstrap — This pane owns and aborts its bounded host observation.
    void supervise();
    return () => {
      controller.abort();
      void observationClient?.close();
    };
  }, [isEnabled, owner, scope, connector, rootChatId]);

  const command = useCallback(
    async (operation: 'send' | 'cancel' | 'resume', taskId: string, text?: string): Promise<void> => {
      const active = connection.current;
      if (active === undefined || active.owner !== owner || active.controller.signal.aborted) {
        throw new Error('The project task host is unavailable. Reconnect and try again.');
      }
      const { client, controller } = active;
      const key = JSON.stringify([operation, taskId, text]);
      const requestId = owner.scope.requestIds.get(key) ?? generatePrefixedId(idPrefix.request);
      owner.scope.requestIds.set(key, requestId);
      const request: ProjectTaskChannelRequest =
        operation === 'send'
          ? { operation, input: projectTaskSendSchema.parse({ taskId, requestId, text: text ?? '' }) }
          : { operation, input: { taskId, requestId } };
      const answer: ProjectTaskChannelAnswer | undefined = await client.projectTasks?.(request, controller.signal);
      if (answer === undefined) {
        throw new Error('This host does not support project threads.');
      }
      if (answer.kind === 'refused') {
        owner.scope.requestIds.delete(key);
        throw new Error(answer.message);
      }
      if ((operation === 'send' && answer.kind !== 'message') || (operation !== 'send' && answer.kind !== 'task')) {
        throw new Error('The project host returned an unexpected task response. Reconnect and try again.');
      }
      owner.scope.requestIds.delete(key);
    },
    [owner],
  );
  const send = useCallback(
    async (taskId: string, text: string): Promise<void> => command('send', taskId, text),
    [command],
  );
  const cancel = useCallback(async (taskId: string): Promise<void> => command('cancel', taskId), [command]);
  const resume = useCallback(async (taskId: string): Promise<void> => command('resume', taskId), [command]);
  const actions = useMemo(() => ({ send, cancel, resume }), [send, cancel, resume]);
  const retry = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);
  if (!isEnabled || rootChatId === undefined) {
    return { isLoading: false, retry, actions };
  }
  if (view.owner === owner) {
    return { ...view, retry, actions };
  }
  return {
    snapshot: view.owner.scope === scope && view.owner.isEnabled ? view.snapshot : undefined,
    isLoading: true,
    retry,
    actions,
  };
}
