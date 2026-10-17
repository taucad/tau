import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { useLocation, useNavigate } from 'react-router';
import type { ProjectTask } from '@taucad/agent-host/wire';
import { useProject } from '#hooks/use-project.js';
import { useProjectTasks } from '#hooks/use-project-tasks.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.js';

/** Walk only attested ancestry; incomplete or cyclic graphs cannot select another root's thread. */
export function taskBelongsToRoot(tasks: readonly ProjectTask[], taskId: string, rootChatId: string): boolean {
  const seen = new Set<string>();
  let task = tasks.find((entry) => entry.id === taskId);
  while (task !== undefined) {
    if (seen.has(task.id)) {
      return false;
    }
    seen.add(task.id);
    if (task.parentTaskId === undefined) {
      return task.chatId === rootChatId && task.id !== taskId;
    }
    const parentId = task.parentTaskId;
    task = tasks.find((entry) => entry.id === parentId);
  }
  return false;
}

type CandidateReview = Readonly<{
  rootChatId: string;
  taskId: string;
  attemptId: string;
  checkoutId: string;
  sourceRevisionId: string;
  title: string;
}>;

type ThreadView = Readonly<{ scrollTop?: number; detailsOpen?: boolean }>;

type ThreadNavigation = Readonly<{
  rootChatId?: string;
  selectedTaskId?: string;
  candidateReview?: CandidateReview;
  openThreads: (taskId?: string) => void;
  back: () => void;
  openParent: (taskId: string) => void;
  reviewCandidate: (taskId: string) => void;
  closeReview: () => void;
  getThreadGroupOpen: (group: string) => boolean;
  setThreadGroupOpen: (group: string, open: boolean) => void;
  getThreadView: (taskId: string) => ThreadView;
  setThreadView: (taskId: string, patch: ThreadView) => void;
}>;

const ThreadNavigationContext = createContext<ThreadNavigation | undefined>(undefined);

export function useThreadNavigation(): ThreadNavigation;
export function useThreadNavigation(options: { readonly enableNoContext: true }): ThreadNavigation | undefined;
export function useThreadNavigation(options?: { readonly enableNoContext?: boolean }): ThreadNavigation | undefined {
  const value = useContext(ThreadNavigationContext);
  if (!value && !options?.enableNoContext) {
    throw new Error('Threads navigation requires a project workspace.');
  }
  return value;
}

/** Presentation selection only. The resident project host still owns every thread operation. */
export function ThreadNavigationProvider({
  children,
  openPanel,
}: {
  readonly children: React.ReactNode;
  readonly openPanel: (panel: WorkbenchPanelId) => void;
}): React.JSX.Element {
  const { projectId, editorRef } = useProject();
  const rootChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const rootView = useSelector(editorRef, (state) =>
    rootChatId === undefined ? undefined : state.context.panelState.threadViews?.[rootChatId],
  );
  const selectedTaskId = rootView?.selectedTaskId;
  const { snapshot } = useProjectTasks(projectId);
  const { chats } = useChatRecords(projectId);
  const [review, setReview] = useState<CandidateReview>();
  const canSelect = useCallback(
    (taskId: string): boolean =>
      rootChatId !== undefined &&
      (snapshot === undefined
        ? chats.some((chat) => chat.taskLineage?.taskId === taskId && chat.taskLineage.rootChatId === rootChatId)
        : taskBelongsToRoot(snapshot.tasks, taskId, rootChatId)),
    [chats, rootChatId, snapshot],
  );
  const openThreads = useCallback(
    (taskId?: string): void => {
      if (rootChatId === undefined || (taskId !== undefined && !canSelect(taskId))) {
        return;
      }
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          threadViews: {
            [rootChatId]: {
              ...editorRef.getSnapshot().context.panelState.threadViews?.[rootChatId],
              selectedTaskId: taskId,
            },
          },
        },
      });
      openPanel('agents');
    },
    [canSelect, editorRef, openPanel, rootChatId],
  );
  const getThreadGroupOpen = useCallback((group: string): boolean => rootView?.groups?.[group] ?? true, [rootView]);
  const setThreadGroupOpen = useCallback(
    (group: string, open: boolean): void => {
      if (rootChatId === undefined) {
        return;
      }
      const current = editorRef.getSnapshot().context.panelState.threadViews?.[rootChatId];
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          threadViews: {
            [rootChatId]: { ...current, groups: { ...current?.groups, [group]: open } },
          },
        },
      });
    },
    [editorRef, rootChatId],
  );
  const getThreadView = useCallback((taskId: string): ThreadView => rootView?.views?.[taskId] ?? {}, [rootView]);
  const setThreadView = useCallback(
    (taskId: string, patch: ThreadView): void => {
      if (rootChatId === undefined || !canSelect(taskId)) {
        return;
      }
      const current = editorRef.getSnapshot().context.panelState.threadViews?.[rootChatId];
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          threadViews: {
            [rootChatId]: {
              ...current,
              views: { ...current?.views, [taskId]: { ...current?.views?.[taskId], ...patch } },
            },
          },
        },
      });
    },
    [canSelect, editorRef, rootChatId],
  );
  const back = useCallback(() => {
    openThreads();
  }, [openThreads]);
  const openParent = useCallback(
    (taskId: string): void => {
      if (!canSelect(taskId)) {
        return;
      }
      if (snapshot === undefined) {
        const lineage = chats.find((chat) => chat.taskLineage?.taskId === taskId)?.taskLineage;
        openThreads(lineage?.parentChatId === rootChatId ? undefined : lineage?.parentTaskId);
        return;
      }
      const task = snapshot.tasks.find((entry) => entry.id === taskId);
      const parent = snapshot.tasks.find((entry) => entry.id === task?.parentTaskId);
      openThreads(parent?.parentTaskId === undefined ? undefined : parent.id);
    },
    [canSelect, chats, openThreads, rootChatId, snapshot],
  );
  const reviewCandidate = useCallback(
    (taskId: string): void => {
      if (!canSelect(taskId) || rootChatId === undefined) {
        return;
      }
      const task = snapshot?.tasks.find((entry) => entry.id === taskId);
      const attempt = task?.attempts.at(-1);
      if (!task || !attempt?.candidateCheckoutId) {
        return;
      }
      setReview({
        rootChatId,
        taskId,
        attemptId: attempt.id,
        checkoutId: attempt.candidateCheckoutId,
        sourceRevisionId: attempt.source.revisionId,
        title: task.title,
      });
      openPanel('revisions');
    },
    [canSelect, openPanel, rootChatId, snapshot],
  );
  const closeReview = useCallback(() => {
    setReview(undefined);
  }, []);
  // A retry invalidates the old review immediately, before any new candidate exists.
  const reviewTask = snapshot?.tasks.find((task) => task.id === review?.taskId);
  const candidateReview =
    review?.rootChatId === rootChatId &&
    reviewTask?.attempts.at(-1)?.id === review?.attemptId &&
    reviewTask?.attempts.at(-1)?.candidateCheckoutId === review?.checkoutId
      ? review
      : undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const handledLink = useRef<string | undefined>(undefined);
  const linkedTask = new URLSearchParams(location.search).get(searchParameterName.thread);
  useEffect(() => {
    const identity = `${location.key}:${rootChatId ?? ''}:${linkedTask ?? ''}`;
    if (linkedTask && canSelect(linkedTask) && handledLink.current !== identity) {
      handledLink.current = identity;
      openThreads(linkedTask);
      const parameters = new URLSearchParams(location.search);
      parameters.delete(searchParameterName.thread);
      void navigate(
        { pathname: location.pathname, search: parameters.toString(), hash: location.hash },
        { replace: true },
      );
    }
  }, [
    canSelect,
    linkedTask,
    location.key,
    location.search,
    location.pathname,
    location.hash,
    navigate,
    openThreads,
    rootChatId,
  ]);
  const value = useMemo(
    () => ({
      rootChatId,
      selectedTaskId: selectedTaskId && canSelect(selectedTaskId) ? selectedTaskId : undefined,
      candidateReview,
      openThreads,
      back,
      openParent,
      reviewCandidate,
      closeReview,
      getThreadGroupOpen,
      setThreadGroupOpen,
      getThreadView,
      setThreadView,
    }),
    [
      rootChatId,
      selectedTaskId,
      canSelect,
      candidateReview,
      openThreads,
      back,
      openParent,
      reviewCandidate,
      closeReview,
      getThreadGroupOpen,
      setThreadGroupOpen,
      getThreadView,
      setThreadView,
    ],
  );
  return <ThreadNavigationContext.Provider value={value}>{children}</ThreadNavigationContext.Provider>;
}
