/**
 * The sidebar's selectors (S46, D33, A36, I26).
 *
 * Every glyph the sidebar shows is derived here, from the `sessions`,
 * `project-session`, `chat-session` and `project-revisions` snapshots at read
 * time. Nothing about a row is persisted: the only durable status in the whole
 * surface is the per-client `unread` record, and even that is read off the
 * chat's own `read` region — `use-focused-chat-read-state.ts` writes it, this
 * never does.
 *
 * Two shapes, on purpose:
 *
 * - `ChatSidebarStatus` is a chat row's whole vocabulary and comes from **one**
 *   snapshot, the chat's own machine. The branch, the dirty pip and the sync
 *   facet ride on it because `project-session` broadcasts `revisionState` to
 *   every chat it owns, so a chat row never reads a second machine.
 * - `ProjectSidebarStatus` is the one coalesced object per project (S46) that
 *   the project row, the *Live now* header and the close dialogs read. It joins
 *   the registry's liveness, its chats' statuses and the worker's
 *   `RevisionStatus` projection — built once per project, never four machine
 *   snapshots per row.
 *
 * The selectors are module constants so a row's render is a lookup, and the
 * hooks compare on settled values (P28) so a project with five chats repaints a
 * row when that row moved, not when any of the five did.
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { SnapshotFrom } from 'xstate';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type { ChatSessionActorRef, chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import type { SessionsActorRef } from '#machines/sessions.machine.js';
import { sessionsCloseSuggestions } from '#machines/sessions.machine.js';
import { selectProjectLiveness } from '#services/sessions-store.js';
import type { ProjectLivenessStatus } from '#services/sessions-store.js';
import { peekRevisionClient } from '#hooks/use-revision-status.js';
import { useSessions } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

/** One chat row's run state — the architecture's agent-state table. @public */
export type ChatSidebarState =
  | 'idle'
  | 'queued'
  | 'working'
  | 'tool'
  | 'approval'
  | 'question'
  | 'reconnecting'
  | 'finishing'
  | 'done'
  | 'failed'
  | 'stopped';

/**
 * Everything a chat row draws, from that chat's own machine.
 *
 * No sync facet (P64): backing up is a *project* fact — `project-session`
 * broadcasts one `revisionState` to every chat it owns, so a chat-level
 * `Backing up` would be the same sentence repeated once per row and a
 * chat-level conflict would multiply one project's attention by its chat count.
 * The project row says it once. A chat keeps the facets that really are its
 * own: the branch its last turn landed on, and whether that tree is dirty.
 *
 * @public
 */
export type ChatSidebarStatus = Readonly<{
  state: ChatSidebarState;
  /** Completed while the person was elsewhere; bold title until `viewed`. */
  unread: boolean;
  /** The tool `Running <tool>` names. */
  toolName: string | undefined;
  pendingApprovalCount: number;
  failureReason: string | undefined;
  /** The branch chip — `undefined` on `main`, so the chip does not exist. */
  branch: string | undefined;
  /** The amber pip on the chip: the tree differs from the head. */
  dirty: boolean;
}>;

/** The one coalesced status object per project (S46). @public */
export type ProjectSidebarStatus = Readonly<{
  session: ProjectLivenessStatus;
  chats: ReadonlyMap<string, ChatSidebarStatus>;
  revisions: RevisionStatusProjection | undefined;
}>;

/** What a project row draws, aggregated from its chats and its session. @public */
export type ProjectSidebarRow = Readonly<{
  projectId: string;
  /** `none` is a closed project: no session, no glyph (A29). */
  glyph: 'none' | 'opening' | 'idle' | 'busy' | 'failed';
  /** Chats needing a person; lifted from the chat rows to the project row. */
  attention: number;
  /** The second line: a policy close's reason, or the sync trouble. */
  detail: string | undefined;
  /** The chip, only when the workbench is off `main` (A29). */
  branch: string | undefined;
  dirty: boolean;
  /** The project's sync facet, for the glyph's own sentence (W13). */
  sync: RevisionStatusProjection['sync']['state'] | undefined;
  /** Refs this device has not had acknowledged — the `n` of `Not backed up`. */
  pending: number;
  /** Runs in flight, for the close dialog's question. */
  runs: number;
}>;

/** The `Live now` header's counts. @public */
export type LiveNowSummary = Readonly<{
  projects: number;
  agents: number;
  attention: number;
  /** The *Close all idle* set, in the registry's own order. */
  idleProjectIds: readonly string[];
}>;

type ChatSnapshot = SnapshotFrom<typeof chatSessionMachine>;

const emptyChats: ReadonlyMap<string, ChatSidebarStatus> = new Map();

const keySeparator = '\u0000';

/*
 * The table, in the table's order.
 *
 * `waiting.approval` before `waiting.input`, and `tool` before `generating`,
 * because that is how the machine's own `always` guards resolve; reading them
 * in another order here would invent a second derivation of the same fact.
 */
const chatRunState = (snapshot: ChatSnapshot): ChatSidebarState => {
  if (snapshot.matches({ run: 'queued' })) {
    return 'queued';
  }
  if (snapshot.matches({ run: { running: { waiting: 'approval' } } })) {
    return 'approval';
  }
  if (snapshot.matches({ run: { running: { waiting: 'input' } } })) {
    return 'question';
  }
  if (snapshot.matches({ run: { running: 'reconnecting' } })) {
    return 'reconnecting';
  }
  if (snapshot.matches({ run: { running: 'tool' } })) {
    return 'tool';
  }
  if (snapshot.matches({ run: { running: 'generating' } })) {
    return 'working';
  }
  if (snapshot.matches({ run: 'finishing' })) {
    return 'finishing';
  }
  if (snapshot.matches({ run: 'done' })) {
    return 'done';
  }
  if (snapshot.matches({ run: 'failed' })) {
    return 'failed';
  }
  return snapshot.matches({ run: 'stopped' }) ? 'stopped' : 'idle';
};

/**
 * One chat row, from one snapshot.
 *
 * @param snapshot - That chat's `chat-session` snapshot.
 * @returns What the row draws.
 * @public
 */
export const selectChatStatus = (snapshot: ChatSnapshot): ChatSidebarStatus => ({
  state: chatRunState(snapshot),
  unread: snapshot.matches({ read: 'unread' }),
  toolName: snapshot.context.toolName,
  pendingApprovalCount: snapshot.context.pendingApprovalCount,
  failureReason: snapshot.context.failureReason,
  /* A29: the chip exists only off `main`, so `main` is not a branch here. */
  branch: snapshot.matches({ revision: { line: 'onBranch' } }) ? snapshot.context.branch : undefined,
  dirty: snapshot.matches({ revision: { tree: 'dirty' } }),
});

/**
 * The row's second line, or `undefined` when the row has nothing to say.
 *
 * The vocabulary is the canvas Legend's, verbatim. It exists only while there
 * is a state to name (A29): an idle chat is a plain row. Sync is not here
 * (P64) — `Backing up` and `Not backed up` are the project row's words.
 *
 * @param status - That chat's status.
 * @returns The line, or `undefined`.
 * @public
 */
export const chatStatusLabel = (status: ChatSidebarStatus): string | undefined => {
  switch (status.state) {
    case 'queued': {
      return 'Queued';
    }
    case 'working': {
      return 'Working…';
    }
    case 'tool': {
      return `Running ${status.toolName ?? 'a tool'}`;
    }
    case 'approval': {
      return `Needs your approval · ${String(status.pendingApprovalCount)}`;
    }
    case 'question': {
      return 'Waiting for you';
    }
    case 'reconnecting': {
      return 'Reconnecting…';
    }
    case 'finishing': {
      return 'Finishing…';
    }
    case 'done': {
      return 'Done';
    }
    case 'failed': {
      return `Failed · ${status.failureReason ?? 'the run failed'}`;
    }
    case 'stopped': {
      return 'Stopped';
    }
    default: {
      return undefined;
    }
  }
};

const statePhrase = (status: ChatSidebarStatus): string | undefined => {
  switch (status.state) {
    case 'queued': {
      return 'queued';
    }
    case 'working': {
      return 'working';
    }
    case 'tool': {
      return `running ${status.toolName ?? 'a tool'}`;
    }
    case 'approval': {
      return 'needs your approval';
    }
    case 'question': {
      return 'waiting for you';
    }
    case 'reconnecting': {
      return 'reconnecting';
    }
    case 'finishing': {
      return 'finishing';
    }
    case 'done': {
      return 'done';
    }
    case 'failed': {
      return `failed: ${status.failureReason ?? 'the run failed'}`;
    }
    case 'stopped': {
      return 'stopped';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The sentence a screen reader reads for a chat row.
 *
 * @param name - The chat's name, which the row shows anyway.
 * @param status - That chat's status.
 * @returns The `aria-describedby` text.
 * @public
 */
export const chatStatusDescription = (name: string, status: ChatSidebarStatus): string =>
  `${[
    name,
    ...(statePhrase(status) === undefined ? [] : [statePhrase(status)]),
    ...(status.state === 'approval' ? [`${String(status.pendingApprovalCount)} pending`] : []),
    ...(status.unread ? ['unread'] : []),
    ...(status.branch === undefined ? [] : [`on branch ${status.branch}`]),
    ...(status.dirty ? ['unsaved edits'] : []),
  ].join(', ')}.`;

/** Whether this chat is one of the project row's amber count. @public */
export const chatNeedsYou = (status: ChatSidebarStatus): boolean =>
  status.state === 'approval' || status.state === 'question';

/** Whether this chat turns the project row red: a failed run nobody saw (P57). @public */
export const chatFailedUnread = (status: ChatSidebarStatus): boolean => status.state === 'failed' && status.unread;

/** Whether this chat's run is in flight, for the project row's spinner. @public */
export const chatIsRunning = (status: ChatSidebarStatus): boolean =>
  status.state === 'queued' ||
  status.state === 'working' ||
  status.state === 'tool' ||
  status.state === 'reconnecting' ||
  status.state === 'finishing';

/** `1 revision` / `2 revisions` — the sidebar's one plural. @public */
export const pluralize = (count: number, noun: string): string => `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * How long the idle policy waited, in the words the closed row uses.
 *
 * The window is the registry's own input, so the row states the real number
 * rather than a sentence that drifts when the policy changes.
 */
const idleCloseText = (idleWindowMilliseconds: number): string =>
  `Closed to save memory · ${String(Math.round(idleWindowMilliseconds / 60_000))} min idle`;

const syncDetail = (revisions: RevisionStatusProjection | undefined, isClosing: boolean): string | undefined => {
  /* I24, and the canvas's own heading: closing is visible, never silent. */
  if (isClosing) {
    const pending = revisions?.sync.pendingCount ?? 0;
    return pending > 0 ? `Backing up ${pluralize(pending, 'revision')}, then closing…` : 'Closing…';
  }
  if (revisions === undefined) {
    return undefined;
  }
  const { state, pendingCount } = revisions.sync;
  if (state === 'conflicted') {
    return 'Needs resolution';
  }
  if (state === 'pending') {
    return `Backing up ${pluralize(pendingCount, 'revision')}`;
  }
  if (state === 'queued') {
    return `Not backed up · ${pluralize(pendingCount, 'revision')} · retrying`;
  }
  return state === 'failed' ? `Not backed up · ${pluralize(pendingCount, 'revision')}` : undefined;
};

/*
 * Nothing closes silently (I24): a policy close says why, on the row. A user
 * close said it out loud already, so it says nothing here.
 */
const closedDetail = (
  reason: ProjectLivenessStatus['closedReason'],
  idleWindowMilliseconds: number,
): string | undefined => {
  if (reason === 'idle') {
    return idleCloseText(idleWindowMilliseconds);
  }
  return reason === 'budget' ? 'Closed · memory budget · reopen any time' : undefined;
};

const projectGlyph = ({
  session,
  failed,
  running,
}: {
  readonly session: ProjectLivenessStatus;
  readonly failed: boolean;
  readonly running: number;
}): ProjectSidebarRow['glyph'] => {
  if (session.live) {
    if (session.status?.state === 'failed' || failed) {
      return 'failed';
    }
    if (session.status?.state === 'opening') {
      return 'opening';
    }
    return running > 0 ? 'busy' : 'idle';
  }
  return 'none';
};

/**
 * The project row, aggregated from the one coalesced object.
 *
 * @param status - That project's coalesced status.
 * @param idleWindowMilliseconds - The registry's idle window, for the reason line.
 * @returns What the project row draws.
 * @public
 */
export const selectProjectRow = (status: ProjectSidebarStatus, idleWindowMilliseconds: number): ProjectSidebarRow => {
  const { session, chats, revisions } = status;
  let attention = 0;
  let running = 0;
  let failed = false;
  for (const chat of chats.values()) {
    if (chatNeedsYou(chat)) {
      attention += 1;
    }
    if (chatIsRunning(chat)) {
      running += 1;
    }
    failed ||= chatFailedUnread(chat);
  }
  /* One conflict, counted once (R2). It is the project's checkout that is
   * conflicted, not each of its chats. */
  if (revisions?.sync.state === 'conflicted') {
    attention += 1;
  }
  const glyph = projectGlyph({ session, failed, running });
  return {
    projectId: session.projectId,
    glyph,
    attention,
    detail: session.live
      ? syncDetail(revisions, session.status?.state === 'closing')
      : closedDetail(session.closedReason, idleWindowMilliseconds),
    branch: revisions?.branch === undefined || revisions.branch === 'main' ? undefined : revisions.branch,
    dirty: revisions?.dirty === true,
    sync: revisions?.sync.state,
    pending: revisions?.sync.pendingCount ?? 0,
    runs: session.status?.runs ?? 0,
  };
};

/**
 * The `Live now` header, over every live project.
 *
 * `agents` is the registry's own run count rather than a count of chat
 * machines: the session is what admits and settles a run, so it is what knows
 * how many are in flight. `idleProjectIds` is the registry's own
 * `sessionsCloseSuggestions` for the same reason — one closable policy, in
 * touch order, so *Close all idle* cannot close the project the person is
 * looking at while a policy would not (R9).
 *
 * @param rows - One row per live project.
 * @param idleProjectIds - The registry's closable set, least recently touched first.
 * @returns The header's counts and its *Close all idle* set.
 * @public
 */
export const selectLiveNow = (
  rows: readonly ProjectSidebarRow[],
  idleProjectIds: readonly string[],
): LiveNowSummary => {
  let agents = 0;
  let attention = 0;
  for (const row of rows) {
    agents += row.runs;
    attention += row.attention;
  }
  return { projects: rows.length, agents, attention, idleProjectIds };
};

/** The header's sentence: `2 projects · 3 agents · 1 needs you`. @public */
export const liveNowText = (summary: LiveNowSummary): string =>
  [
    pluralize(summary.projects, 'project'),
    ...(summary.agents > 0 ? [pluralize(summary.agents, 'agent')] : []),
    ...(summary.attention > 0 ? [`${String(summary.attention)} need${summary.attention === 1 ? 's' : ''} you`] : []),
  ].join(' · ');

// ---------------------------------------------------------------------------
// Reading the actors
// ---------------------------------------------------------------------------

const projectSessionOf = (sessions: SessionsActorRef, projectId: string): ProjectSessionActorRef | undefined =>
  sessions.getSnapshot().context.refs[projectId];

const chatReferencesOf = (
  sessions: SessionsActorRef,
  projectId: string,
): Readonly<Record<string, ChatSessionActorRef>> =>
  projectSessionOf(sessions, projectId)?.getSnapshot().context.chatRefs ?? {};

/**
 * The one coalesced object, built once per project.
 *
 * @param sessions - The registry actor.
 * @param projectId - The project the row is about.
 * @returns That project's coalesced status.
 * @public
 */
export const readProjectStatus = (sessions: SessionsActorRef, projectId: string): ProjectSidebarStatus => {
  const chatReferences = Object.entries(chatReferencesOf(sessions, projectId));
  return {
    session: selectProjectLiveness(sessions.getSnapshot().context, projectId),
    chats:
      chatReferences.length === 0
        ? emptyChats
        : new Map(chatReferences.map(([chatId, ref]) => [chatId, selectChatStatus(ref.getSnapshot())])),
    revisions: peekRevisionClient(projectId)?.status(),
  };
};

/* Settled values only (P28): a row repaints when what it draws moved, never
 * when a sibling's tool name did. */
const chatKey = (status: ChatSidebarStatus | undefined): string =>
  status === undefined ? '' : Object.values(status).join(keySeparator);

/*
 * P66: a dependency array is never a change signal.
 *
 * `useSyncExternalStore` has to return the value the row draws, not a key the
 * row is then re-derived from: React Compiler infers a memo's dependencies from
 * what its callback *reads*, so `useMemo(() => read(), [key, read])` compiles to
 * a cache gated on `read` alone and the row freezes on its first value. The
 * store's snapshot is therefore the row itself, held stable while its settled
 * key is unchanged so React can still bail out of a repaint.
 */
const keep = <T>(cache: { current: { key: string; value: T } | undefined }, key: string, value: T): T => {
  if (cache.current?.key !== key) {
    cache.current = { key, value };
  }
  return cache.current.value;
};

const projectRowKey = (row: ProjectSidebarRow): string => Object.values(row).join(keySeparator);

/*
 * Ponytail: one binder, rebound only when the chat set changes.
 *
 * A sidebar row wakes on its own actors — the registry (a project opened or
 * closed), the project session (a chat spawned, the revision facts moved) and
 * the chat machines it draws. Rebinding on every notification would unsubscribe
 * listeners from inside an emit, so the id list is compared first and the churn
 * happens only when a chat actually appears or goes.
 */
const bindProject = ({
  sessions,
  projectId,
  chatIds,
  listener,
}: {
  readonly sessions: SessionsActorRef;
  readonly projectId: string;
  readonly chatIds?: () => readonly string[];
  readonly listener: () => void;
}): (() => void) => {
  let bound: Array<() => void> = [];
  let boundKey: string | undefined;
  let sessionScan: { unsubscribe: () => void } | undefined;
  const rebind = (): void => {
    const session = projectSessionOf(sessions, projectId);
    const ids = chatIds?.() ?? Object.keys(chatReferencesOf(sessions, projectId));
    /*
     * R3: the revision client is created by the project's route subtree, later
     * than this bind, so its presence has to be in the key or a project row
     * never subscribes to the projection it draws its branch and sync from.
     * R4: `openChat` spawns a *fresh* actor for an id it no longer holds, so
     * ids alone would leave the row bound to a stopped machine — the session id
     * is the identity that changes with the swap.
     */
    const references = chatReferencesOf(sessions, projectId);
    const key = [
      session === undefined ? 'closed' : 'live',
      peekRevisionClient(projectId) === undefined ? 'no-client' : 'client',
      ...ids.map((id) => references[id]?.sessionId ?? id),
    ].join(keySeparator);
    if (key === boundKey) {
      return;
    }
    boundKey = key;
    const previous = bound;
    bound = [];
    if (session !== undefined) {
      const subscription = session.subscribe(listener);
      bound.push(() => {
        subscription.unsubscribe();
      });
      for (const id of ids) {
        const ref = references[id];
        if (ref !== undefined) {
          const chatSubscription = ref.subscribe(listener);
          bound.push(() => {
            chatSubscription.unsubscribe();
          });
        }
      }
    }
    const client = peekRevisionClient(projectId);
    if (client !== undefined) {
      bound.push(client.subscribe(listener));
    }
    for (const off of previous) {
      off();
    }
  };
  /* A chat spawning moves the session's snapshot, not the registry's, so the
   * rebind check rides on the session's own notification too — next microtask,
   * because unsubscribing inside an emit is what the guard above avoids. */
  const watchSession = (): void => {
    sessionScan?.unsubscribe();
    sessionScan = projectSessionOf(sessions, projectId)?.subscribe(() => {
      queueMicrotask(rebind);
    });
  };
  rebind();
  watchSession();
  const registry = sessions.subscribe(() => {
    rebind();
    watchSession();
    listener();
  });
  return () => {
    registry.unsubscribe();
    sessionScan?.unsubscribe();
    for (const off of bound) {
      off();
    }
  };
};

/**
 * One project row, repainted only when the row itself moved.
 *
 * The coalesced object is built here and nowhere else; the row is a pure
 * selector over it, and the subscription's key is the row, so four chats
 * changing tool names do not repaint the project.
 *
 * @param projectId - The project the row is about.
 * @returns What that row draws.
 * @public
 */
export const useProjectSidebarRow = (projectId: string): ProjectSidebarRow => {
  const sessions = useSessions();
  const idleWindow = sessions.getSnapshot().context.idleWindowMilliseconds;
  const subscribe = useCallback(
    (listener: () => void) => bindProject({ sessions, projectId, listener }),
    [projectId, sessions],
  );
  const cache = useRef<{ key: string; value: ProjectSidebarRow } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const row = selectProjectRow(readProjectStatus(sessions, projectId), idleWindow);
    return keep(cache, `${projectId}${keySeparator}${projectRowKey(row)}`, row);
  }, [idleWindow, projectId, sessions]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * One chat row, repainted only when that chat moved.
 *
 * @param projectId - The project that owns the chat.
 * @param chatId - The chat the row is about.
 * @returns What the row draws, or `undefined` when the chat has no machine.
 * @public
 */
export const useChatSidebarStatus = (projectId: string, chatId: string): ChatSidebarStatus | undefined => {
  const sessions = useSessions();
  const chatIds = useCallback(() => [chatId], [chatId]);
  const subscribe = useCallback(
    (listener: () => void) => bindProject({ sessions, projectId, chatIds, listener }),
    [chatIds, projectId, sessions],
  );
  const cache = useRef<{ key: string; value: ChatSidebarStatus | undefined } | undefined>(undefined);
  const getSnapshot = useCallback((): ChatSidebarStatus | undefined => {
    const ref = chatReferencesOf(sessions, projectId)[chatId];
    const status = ref === undefined ? undefined : selectChatStatus(ref.getSnapshot());
    return keep(cache, `${projectId}${keySeparator}${chatId}${keySeparator}${chatKey(status)}`, status);
  }, [chatId, projectId, sessions]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * The `Live now` header, over every live project.
 *
 * One subscription per live project, one repaint when the totals move — the
 * header is not four machine snapshots per row either.
 *
 * @param projectIds - The live set, in the registry's order.
 * @returns The header's counts and its *Close all idle* set.
 * @public
 */
export const useLiveNow = (projectIds: readonly string[]): LiveNowSummary => {
  const sessions = useSessions();
  const idleWindow = sessions.getSnapshot().context.idleWindowMilliseconds;
  const joined = projectIds.join(keySeparator);
  const cache = useRef<{ key: string; value: LiveNowSummary } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const summary = selectLiveNow(
      (joined === '' ? [] : joined.split(keySeparator)).map((projectId) =>
        selectProjectRow(readProjectStatus(sessions, projectId), idleWindow),
      ),
      sessionsCloseSuggestions(sessions.getSnapshot().context),
    );
    return keep(
      cache,
      [summary.projects, summary.agents, summary.attention, ...summary.idleProjectIds].join(keySeparator),
      summary,
    );
  }, [idleWindow, joined, sessions]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unbind = (joined === '' ? [] : joined.split(keySeparator)).map((projectId) =>
        bindProject({ sessions, projectId, listener }),
      );
      return () => {
        for (const off of unbind) {
          off();
        }
      };
    },
    [joined, sessions],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** The verbs a sidebar row's controls send. @public */
export type SidebarCommands = Readonly<{
  /** *Close* on a chat: stop the run, keep the chat and its machine (P63). */
  closeChat: (projectId: string, chatId: string) => void;
  /** *Retry* on a failed row: the same verb the in-chat banner sends. */
  retryChat: (chatId: string) => void;
  /** *Close* on a project: the user's verb, with the registry's own reason. */
  closeProject: (projectId: string) => void;
  /** Make room, then open what the budget refused. */
  openProject: (projectId: string) => void;
}>;

/**
 * The sidebar's verbs, so a row's controls hold no actor plumbing.
 *
 * Every one of them is an event on a machine that already owns the decision:
 * the chat's own `close`, the registry's `close` and `open`. Nothing here
 * decides anything.
 *
 * @returns The verbs.
 * @public
 */
export const useSidebarCommands = (): SidebarCommands => {
  const sessions = useSessions();
  const chatSessions = useChatSessionStore();
  return useMemo(
    () => ({
      /* Two owners, one verb (P63): the store stops the run — the same
       * `stopRequest` the composer's *Stop* sends — and the chat's machine
       * records that the person stopped it, so the row reads `Stopped` instead
       * of vanishing. */
      closeChat: (projectId, chatId) => {
        chatSessions.stopRun(chatId);
        chatReferencesOf(sessions, projectId)[chatId]?.send({ type: 'close' });
      },
      retryChat: (chatId) => {
        chatSessions.retryRun(chatId);
      },
      closeProject: (projectId) => {
        const session = projectSessionOf(sessions, projectId);
        sessions.send({ type: 'close', projectId, reason: 'user' });
        /* This command is called only after the existing close dialog has
         * asked about running agents; idle sessions ignore the confirmation. */
        session?.send({ type: 'confirmClose' });
      },
      openProject: (projectId) => {
        sessions.send({ type: 'open', projectId });
      },
    }),
    [chatSessions, sessions],
  );
};
